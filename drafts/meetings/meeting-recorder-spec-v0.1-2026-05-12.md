# Meeting Recorder Capture Substrate Spec - v0.1 - 2026-05-12

_Authored by fork_mp1ugx3k_a1a6c2. Scoping only - no code changes._

---

## Recommended path(s)

**Primary: Path B - Phone PWA (admin.ecodia.au/meeting)**
Works for in-room meetings regardless of Corazon status. Tate's phone is always present. No dependencies on laptop uptime. Captures the room.

**Secondary: Path A - Corazon ffmpeg (WASAPI loopback)**
For online calls (Teams/Zoom/Meet) where we need to capture the remote participant audio, Corazon is the right capture point. However this path is gated on Corazon being awake and reachable. Treat as an additive capability once Path B ships, not a dependency.

**Path C: Otter.ai pipe - Deprioritise (no viable API)**
See section below.

---

## Rationale

Corazon was probed live during spec authoring: **connection timed out at 8s** (kv_store shows "LIVE-CONNECTED" but that's stale - laptop is sleeping/closed). Corazon availability is variable by definition - it's a laptop, not a server. Making the meeting recorder primary path depend on Corazon means it fails every time Tate is mobile, the lid is closed, or Tailscale is flaky. Phone PWA is unconditionally available.

For online calls, the Phone PWA only captures Tate's mic - not the remote speaker audio. Corazon WASAPI loopback captures the full mix (Tate + remote). This is a genuine gap in Path B. The workaround for Phase 1: record mic only, accept the limitation, capture action items from Tate's side. Phase 2 can add the Corazon path as an optional enhancement when Tate is at his desk.

No transcription API keys exist in kv_store (checked: openai, otter, deepgram, assemblyai - all empty). Phase 1 is capture-only; transcription via Whisper or Deepgram can be added in Phase 2 once the storage path is solid.

---

## Path A: Corazon ffmpeg

- **Status: UNREACHABLE at spec time** (curl timeout 8s to 100.114.219.69:7456; kv_store.creds.laptop_agent.status="LIVE-CONNECTED" is stale)
- **ffmpeg**: Unknown - Corazon unreachable, cannot probe. Would need: `curl -X POST http://100.114.219.69:7456/api/tool -H "Authorization: Bearer <token>" -d '{"tool":"shell.shell","params":{"command":"where ffmpeg"}}'`
- **Virtual audio capturer / VB-Cable**: Unknown - same blocker. To check: `Get-PnpDevice | Where Name -Like "*Virtual*Audio*"` via shell.shell
- **Start primitive** (when available):
  ```
  ffmpeg -f dshow -i audio="WASAPI-loopback-device" -ac 1 -ar 16000 -acodec libopus -b:a 32k out_%03d.opus -segment_time 30 -f segment
  ```
  Or for stereo mix (captures both sides of a call):
  ```
  ffmpeg -f dshow -i audio="Stereo Mix (Realtek...)" -ac 1 -ar 16000 -acodec libopus -b:a 32k output.opus
  ```
- **Stop primitive**: Kill the ffmpeg process via `process.killProcess` on the laptop-agent
- **Output format**: .opus @ 32kbps, 16kHz mono (Whisper-optimised; see size estimates below)
- **Chunking**: `-segment_time 30 -f segment out_%03d.opus` for 30s chunks, prevents total loss on crash
- **Upload path**: laptop-agent `filesystem.readFile` on each chunk → POST to `/api/meetings/upload-chunk` on VPS → Supabase storage
- **Gating requirement**: health probe to Corazon before offering this path in the UI. If unreachable, hide the option or show "laptop offline - mic only available"

---

## Path B: Phone PWA

- **Technology**: `MediaRecorder` API (browser-native, no install needed), `Blob` chunks via `ondataavailable`
- **Supported formats**: `audio/webm;codecs=opus` (Chrome/Android), `audio/mp4` (Safari/iOS) - both work for Whisper transcription
- **Chunk cadence**: 30s - balances data loss risk vs upload frequency. On network drop, lose at most 30s of audio
- **Upload**: `fetch()` POST to `/api/meetings/upload-chunk` with `{meeting_id, chunk_index, blob}` - returns 200 on Supabase write success
- **Post-stop normalisation**: Chunks are webm/mp4 blobs. After recording stops, VPS concatenates + transcodes to `.opus` @ 32kbps 16kHz mono via ffmpeg (already installed on VPS: `/usr/bin/ffmpeg`)
- **Page**: `admin.ecodia.au/meeting` - new Next.js page in ecodiaos-frontend
- **Controls**:
  - [Start Recording] button - triggers `navigator.mediaDevices.getUserMedia({audio: true})` then `MediaRecorder.start(30000)` (30s timeslice)
  - Elapsed timer (hh:mm:ss)
  - Chunk upload status indicator (last chunk: "saved 14s ago" or "uploading...")
  - [Pause] / [Resume] toggle
  - [Stop + Save] button - stops recorder, uploads final chunk, POSTs to `/api/meetings/finalise`
- **Client/meeting tag** (optional at record time): dropdown populated from `clients` table. Can tag later in the meeting detail view
- **Title**: auto-generated as `Meeting - {YYYY-MM-DD HH:mm}`, editable before or after

---

## Path C: Otter.ai pipe

- **Official API status**: None. Otter.ai has no public REST API as of 2026. Their developer page (otterai.com/developers) is a waitlist/contact form, not documentation
- **Unofficial API**: Exists (npm: `otter-ai`, github reverse-engineering projects) but fragile - depends on session cookies, breaks on app updates, no SLA. Not appropriate for production integration
- **Webhook support**: Otter.ai Business/Teams has Zapier integration, but no native webhook for "transcript complete" that we can wire to EcodiaOS
- **Export mechanism**: Otter does allow manual export (PDF/TXT/SRT) but this requires Tate to manually trigger export for every meeting - defeats automation
- **Auth**: No OAuth or API key mechanism. Only session-cookie scraping or Zapier (which itself has auth friction)
- **Recommendation**: Skip. Keep otter.ai as Tate's personal backup but don't build integration on top of an undocumented API. If otter.ai ships an official API later, reconsider. The Path B PWA replaces otter.ai for EcodiaOS-tracked meetings

---

## Storage path convention

```
meetings/YYYY-MM-DD/<meeting-slug>/{
  audio.opus          # final normalised audio (post-stop transcode)
  chunks/             # raw upload chunks (can be deleted after normalise)
    chunk_000.webm
    chunk_001.webm
    ...
  transcript.txt      # Phase 2: plain text transcript
  diarised.json       # Phase 2: speaker-diarised JSON
  summary.md          # Phase 2: AI-generated summary + action items
}
```

Supabase bucket: `documents` (already provisioned). Path prefix: `meetings/`.

`meeting-slug` = `{client-slug}-{YYYY-MM-DD}-{HHmm}` e.g. `coexist-2026-05-12-1430`

---

## File size estimates

| Format | 1 hour | Notes |
|--------|--------|-------|
| WAV @ 16kHz mono | ~115MB | Raw, no compression - DO NOT upload raw |
| MP3 @ 128kbps | ~57MB | Good quality, widely supported |
| Opus @ 32kbps | ~14MB | Whisper-optimised, recommended target format |
| webm/opus @ ~32kbps | ~14-16MB | What MediaRecorder produces natively |

**Storage budget check:**
- Supabase free tier: 1GB total storage. At 14MB/hour, that's ~71 hours of meetings before hitting the cap. Marginal. Recommend staying on free tier for Phase 1 (capture-only), plan for Pro (100GB) before Phase 2 (transcription) ships.
- 30s chunks: ~120KB each. Negligible in-flight storage.

---

## Phase 1 implementation scope (capture only, no transcription)

Phase 1 goal: audio gets from Tate's phone into Supabase storage reliably. No AI, no transcription. Just durable capture.

### Backend endpoints (ecodiaos-backend)

```
POST /api/meetings/start
  body: { client_id?, title? }
  creates meeting_recordings row, returns { meeting_id, upload_token }

POST /api/meetings/upload-chunk
  body: { meeting_id, chunk_index, audio: <binary> }
  headers: Authorization: Bearer <upload_token>
  writes chunk to Supabase storage: meetings/{date}/{slug}/chunks/chunk_{NNN}.webm
  returns { ok: true, chunk_stored_at: <path> }

POST /api/meetings/finalise
  body: { meeting_id }
  triggers: chunk-concat + ffmpeg transcode to .opus → upload normalised audio
  updates meeting_recordings row (status: processing -> complete, duration_seconds, audio_path)
  returns { meeting_id, audio_url, duration_seconds }

GET /api/meetings
  returns list of meeting_recordings for the client filter if supplied

GET /api/meetings/:id
  returns full meeting detail incl audio URL (signed Supabase URL, 1hr TTL)
```

### Frontend - admin.ecodia.au/meeting (ecodiaos-frontend)

Single-page route. No auth required beyond the upload_token returned by `/start`. Controls described in Path B section above. Stack: Next.js App Router page, Tailwind, no new dependencies (MediaRecorder is browser native).

### DB - meeting_recordings table (minimal schema)

```sql
CREATE TABLE meeting_recordings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES clients(id),
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'recording', -- recording | processing | complete | failed
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  duration_seconds int,
  chunk_count   int DEFAULT 0,
  audio_path    text,               -- Supabase storage path to normalised .opus
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

No transcription columns in Phase 1. Add in Phase 2 migration.

### Estimated implementation time

| Component | Estimate |
|-----------|----------|
| DB migration + backend endpoints | 1.5h Factory session |
| Frontend /meeting page | 1h Factory session |
| VPS ffmpeg transcode worker (post-finalise) | 0.5h Factory session |
| End-to-end test (Tate records 30s, audio appears in Supabase) | 0.5h manual |
| **Total** | **~3.5h** |

Two Factory sessions in parallel (backend + frontend), then integration test.

---

## Phase 2 scope (not in this brief - for future planning)

- Whisper transcription triggered on `finalise` (or background job polling `status='complete'`)
- Speaker diarisation via Pyannote or AssemblyAI (need API key - not provisioned yet)
- AI summary + action item extraction via Claude API
- Corazon WASAPI loopback path (Path A) as optional "full call capture" mode
- Meeting list UI with search + transcript viewer in ecodiaos-frontend

---

_Generated 2026-05-12 by fork_mp1ugx3k_a1a6c2_

# Meeting Recorder + Transcription — Master Plan
**Date:** 2026-05-12
**Authored by:** fork_mp1uexb6_cf9b38 (manager) synthesising workers 1-4
**Status:** Spec complete — Phase 1 ready for Factory dispatch

---

## TL;DR

Tate hits [🔴 Record] on admin.ecodia.au/meeting on his phone. Audio chunks to Supabase every 30s. He hits Stop. Within 2-3 minutes, a diarised transcript (Speaker A / Speaker B), AI summary, and action items are at admin.ecodia.au/meetings/<id>. Cost: ~$0.33 per 60-minute meeting.

Four spec docs underpin this plan:
- `~/ecodiaos/drafts/voice-infra-audit-2026-05-12.md`
- `~/ecodiaos/drafts/meeting-recorder-spec-v0.1-2026-05-12.md`
- `~/ecodiaos/drafts/meeting-transcription-pipeline-spec-v0.1-2026-05-12.md`
- `~/ecodiaos/drafts/meeting-recorder-storage-ui-spec-v0.1-2026-05-12.md`

---

## Recommended path

### Capture: Phone PWA (Primary) + Corazon WASAPI (Additive)

**Primary — Phase 1:** `admin.ecodia.au/meeting` PWA. Tate's phone opens the page, hits Record. MediaRecorder API captures mic audio as 30-second webm/opus chunks, each uploaded immediately to Supabase Storage (`documents/meetings/<id>/chunks/N.webm`). On Stop, server merges chunks, transcription fires async. Works for in-room meetings. Always available — no Corazon dependency.

**Gap:** Phone PWA captures Tate's mic only. For online calls (Teams/Zoom/Meet), the remote participant's audio is missing. Corazon WASAPI loopback fixes this — but Corazon is currently unreachable (Tailscale endpoint 100.114.219.69:7456 timed out during spec). Path A (Corazon ffmpeg) is valid architecture but blocked until Corazon is back online. Treat as Phase 2+ additive, not a dependency.

**Otter.ai:** No official API. Skip.

### Transcription + Diarisation: Deepgram Nova-2

Single API call. Returns speaker-labelled utterances: `[{speaker: 0, start: 0.0, end: 4.2, text: "..."}]`. Built-in diarisation at $0.0043/min — cheaper than Whisper API ($0.006/min) AND no separate diarisation step. The decisive win.

No transcription API keys currently exist in kv_store. Self-hosting is non-viable (4 cores, 855MB RAM — a 1hr meeting would take 30-60min to transcribe). Tate needs to provision a Deepgram key before Phase 2 can run.

### Summary: Claude Sonnet

After Deepgram completes, feed the diarised transcript to Sonnet. Returns `{summary, action_items, key_decisions, follow_ups, topics}`. ~$0.07 per 60-min meeting. Negligible.

---

## End-to-end flow (Phase 3 complete state)

```
Tate opens admin.ecodia.au/meeting on phone
        ↓
Selects client (optional)
        ↓
Taps [🔴 Record]
        ↓  (MediaRecorder.start(30000) — 30s timeslice)
Every 30s: POST /api/meetings/:id/upload-chunk → Supabase Storage chunk
        ↓
Taps [■ Stop & Transcribe]
        ↓
POST /api/meetings/:id/finalize
  1. Merge chunks → documents/meetings/<id>/audio.webm
  2. Delete chunks
  3. Set transcription_status='processing'
  4. Fire async pipeline:
        ↓
     Deepgram Nova-2 API call (model=nova-2, diarize=true, utterances=true, language=en-AU)
     ~30s API latency per 60min of audio
        ↓
     Store diarised.json + transcript.txt to Supabase Storage
     Update meeting_recordings row
        ↓
     Sonnet summary call (~5s)
     Store summary.json, update action_items / key_decisions / follow_ups in DB
        ↓
     Write Neo4j Meeting + Episode nodes, link to Organization/Project
        ↓
     transcription_status = 'done'
        ↓
Page polls GET /api/meetings/:id every 3s
        ↓
Redirects to admin.ecodia.au/meetings/<id>
        ↓
Tate sees: audio player + diarised transcript (colour-coded speakers) + AI summary + action items
Total elapsed from Stop tap: ~2-3 minutes for a 60-min meeting
```

---

## Pre-work before Factory dispatch

### CRITICAL: Commit the W2 source-marking changeset first

Three dirty files are sitting on main (NOT committed):
- `src/db/migrations/099_os_session_messages.sql` (untracked)
- `src/services/voiceBuffer.js` (+1 line: adds `source: 'voice'` to flush POST)
- `src/routes/osSession.js` (+9 lines: fire-and-forget INSERT into os_session_messages)

These are clean, cohesive, and unrelated to meeting recorder. Commit them now as an atomic unit to claim migration 099 before Factory workers start picking migration numbers. If they stay untracked when Factory runs, there will be a conflict on the migration number.

```bash
cd /home/tate/ecodiaos
git add src/db/migrations/099_os_session_messages.sql src/services/voiceBuffer.js src/routes/osSession.js
git commit -m "feat(voice): source-marking for os_session_messages (W2 recovery)"
```

### Frontend architecture correction

The brief assumed Next.js App Router (`admin-frontend/app/`). Worker 4 confirmed it is a **Vite + React SPA**:
- Source: `/home/tate/workspaces/ecodiaos/fe/src/`
- Routes: `/home/tate/workspaces/ecodiaos/fe/src/App.tsx`
- Pages: `/home/tate/workspaces/ecodiaos/fe/src/pages/`

Factory briefs for frontend work MUST reference these paths.

### Deepgram API key

Needed before Phase 2 runs. Tate provisions at console.deepgram.com, then:
```sql
INSERT INTO kv_store (key, value) VALUES ('creds.deepgram_api_key', '"dg_XXXXXXXXXXXX"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### ffmpeg on VPS

Not currently installed. Required for chunk merging (concatenating webm blobs). Install before Phase 1 ships:
```bash
sudo apt-get install -y ffmpeg
```

---

## Shipment phases

### Phase 1: Capture only (~2h Factory, 2 parallel sessions)
**Deliverable:** Tate can record a meeting and the audio file appears in Supabase. No transcription yet.

Backend session (ecodiaos-backend, ~1.5h):
- Migration `XXX_meeting_recordings.sql` (Factory re-ls migrations/ at write-time for next number after 099)
- `POST /api/meetings` — create row, return id
- `POST /api/meetings/:id/upload-chunk` — write chunk to Supabase Storage
- `POST /api/meetings/:id/finalize` — merge chunks via ffmpeg, update row (transcription stays 'pending')
- `GET /api/meetings` — paginated list
- `GET /api/meetings/:id` — full row + signed audio URL

Frontend session (ecodiaos-frontend, ~1h):
- `/meeting` PWA recorder page (src/pages/MeetingRecorder.tsx)
  - States: idle → recording (timer + chunk progress) → stopping → done
  - MediaRecorder.start(30000), ondataavailable → upload chunk → POST finalize
  - Redirects to /meetings/:id on finalize
- `/meetings` list page (src/pages/Meetings/index.tsx) — basic table, no transcript
- `/meetings/:id` detail (src/pages/Meetings/Detail.tsx) — header + audio player only
- Wire routes in App.tsx (protected for /meetings*, unprotected for /meeting)

### Phase 2: Transcription (~1h Factory)
**Deliverable:** Transcript appears in detail page within 2-3 minutes of stopping.

- Deepgram Nova-2 call in finalize async handler (requires `creds.deepgram_api_key` in kv_store)
- Diarised JSON + transcript.txt stored to Supabase Storage
- `transcript_text` + `diarised_transcript` written to meeting_recordings row
- `transcription_status` lifecycle: processing → done/error
- Cost stored in `transcription_cost_cents`
- Detail page: diarised transcript panel with speaker colours + [MM:SS] timestamps

### Phase 3: Summary + action items (~1h Factory)
**Deliverable:** AI summary, action items, key decisions visible in detail page.

- Sonnet call chained after Deepgram completes
- `summary_text`, `action_items`, `key_decisions`, `follow_ups` populated in DB
- `summary.json` stored to Supabase Storage
- Detail page: Summary section + action items checklist + key decisions list

### Phase 4: Neo4j linkage (~1h Factory)
**Deliverable:** Every meeting creates searchable nodes in long-term memory.

- Create Meeting node + Episode node after transcript-complete
- Relationships: [:WITH] to Organization (if client_id set), [:ABOUT] to Project, [:DECIDED_IN] for each key decision
- `neo4j_meeting_id` + `neo4j_episode_id` written back to DB row
- Detail page: Neo4j links display section

### Phase 5: UI polish (~2h Factory)
**Deliverable:** Feels like a proper app, not an MVP.

- Audio-transcript sync (click [MM:SS] timestamp → seek audio.currentTime)
- Speaker colour cycling (Speaker 0 = blue, 1 = orange, 2 = green, ...)
- Action item checkboxes (mark complete, persisted via PUT)
- Follow-ups: [Create status_board row] button per item
- Recorder: processing spinner + poll-until-done + auto-redirect
- Mobile PWA: manifest.json + viewport meta for home-screen install

---

## Cost estimate per meeting

| Duration | Deepgram | Sonnet summary | Storage | Total |
|----------|----------|----------------|---------|-------|
| 30 min | $0.13 | $0.04 | ~$0 | **~$0.17** |
| 60 min | $0.26 | $0.07 | ~$0 | **~$0.33** |
| 90 min | $0.39 | $0.10 | ~$0 | **~$0.49** |

At 20 meetings/month (aggressive): ~$6.60/mo. Negligible.
Audio storage: 60-min opus = ~14MB. Supabase free tier (1GB) covers ~70 hours before needing Pro.

---

## What Tate needs to do (blocking items)

1. **Provision Deepgram API key** at console.deepgram.com → insert into kv_store as `creds.deepgram_api_key`. Blocks Phase 2.
2. **Nothing else for Phase 1.** Phase 1 is fully self-contained — no new API keys needed.

---

## What EcodiaOS does next

1. Commit the W2 source-marking changeset (3 dirty files on main) to claim migration 099.
2. Dispatch Factory for Phase 1 (2 parallel sessions: backend + frontend).
3. Install ffmpeg on VPS (`sudo apt-get install -y ffmpeg`) — required for chunk merge in finalize.
4. When Phase 1 ships, verify end-to-end: record 30s on phone → audio appears in Supabase → /meetings shows the row.
5. Block Phase 2 on Deepgram key provisioning.

---

## /voice vs /meeting — DISTINCT FEATURES (Tate directive 12 May 2026)

These are two separate, non-overlapping features. Do NOT conflate them.

| Feature | Route | Purpose | Status |
|---------|-------|---------|--------|
| **Voice notes** | `/voice` (admin.ecodia.au/voice) | Real-time short utterances from Tate flowing into conductor chat as context. Brainstorm/instruction stream. No durable audio storage. No transcription pipeline. Existing feature. | SHIPPED |
| **Meeting recorder** | `/meeting` (admin.ecodia.au/meeting) | Durable multi-participant meeting capture. Audio saved to Supabase per-chunk. Full transcript + diarisation + AI summary on stop. Recovers even if tab closes. NEW feature. | BUILDING (Phase 1) |

The 150-minute loss (12 May 2026) happened because Tate used `/voice` for a meeting — `/voice` is a streaming brainstorm channel, not a durable meeting recorder. `/meeting` exists to prevent this.

Factory briefs, frontend routes, and API endpoints must use these names precisely. `/voice` endpoints = voiceBuffer/voiceChunk pipeline. `/meeting` endpoints = meeting_recordings pipeline.

## What the meeting recorder does NOT replace

The existing `/api/voice/chunk` brainstorm pipeline remains untouched. It serves a different use case: real-time short utterances from Tate flowing into conductor chat as context. Meeting recorder is a separate surface. The W2 source-marking work (os_session_messages table) is complementary to both — it lets the conductor differentiate voice-sourced messages from typed ones.

---

## File paths for Factory dispatch

| What | Path |
|------|------|
| Backend source | `/home/tate/ecodiaos/src/` |
| Migrations | `/home/tate/ecodiaos/src/db/migrations/` |
| Frontend source | `/home/tate/workspaces/ecodiaos/fe/src/` |
| Frontend pages | `/home/tate/workspaces/ecodiaos/fe/src/pages/` |
| App router | `/home/tate/workspaces/ecodiaos/fe/src/App.tsx` |
| Existing Voice page (reference) | `/home/tate/workspaces/ecodiaos/fe/src/pages/Voice.tsx` |
| Storage bucket | `documents` (Supabase, already active) |
| Admin URL | `admin.ecodia.au` |
| API URL | `api.admin.ecodia.au` |

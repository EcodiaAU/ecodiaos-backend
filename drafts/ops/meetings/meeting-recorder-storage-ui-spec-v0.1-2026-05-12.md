# Meeting Recorder — Storage, UI & Neo4j Spec v0.1
**Authored:** 2026-05-12 by fork_mp1ulxvv_6be8d5 (WORKER 4)
**Status:** Draft — input to Factory dispatch

---

## Section 1: Database Schema

### Pre-flight FK verification (queried 2026-05-12)

| Table | id column | data_type | FK-compatible? |
|-------|-----------|-----------|----------------|
| `clients` | `id` | `uuid` | YES |
| `projects` | `id` | `uuid` | YES |

Both FKs are safe as written. No schema adjustments required.

### `meeting_recordings` table — full DDL

```sql
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                TIMESTAMPTZ,
  duration_seconds        INTEGER,

  -- Audio storage
  audio_url               TEXT,         -- Supabase Storage path (documents/meetings/…/audio.webm)
  audio_format            TEXT DEFAULT 'webm',
  audio_size_bytes        BIGINT,

  -- Transcription (plain text)
  transcript_text         TEXT,
  transcript_url          TEXT,         -- documents/meetings/…/transcript.txt

  -- Diarised transcript (Deepgram JSON)
  diarised_transcript     JSONB,        -- [{speaker, start, end, text}, ...]
  diarised_url            TEXT,         -- documents/meetings/…/diarised.json

  -- AI summaries
  summary_text            TEXT,
  action_items            JSONB,        -- [{text, completed, completed_at}, ...]
  key_decisions           JSONB,        -- [{text, decided_at}, ...]
  follow_ups              JSONB,        -- [{text, due_date, assigned_to}, ...]

  -- CRM linkage (both nullable — meetings can be internal/unattached)
  client_id               UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id              UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Neo4j backlink
  neo4j_episode_id        TEXT,         -- Neo4j Episode node ID linked to this meeting
  neo4j_meeting_id        TEXT,         -- Neo4j Meeting node ID (set on transcript-complete)

  -- Transcription lifecycle
  transcription_status    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (transcription_status IN ('pending','processing','done','error')),
  transcription_provider  TEXT,         -- 'deepgram' | 'whisper' | null
  transcription_cost_cents INTEGER,     -- integer cents AUD (Deepgram: ~$0.006/min)

  -- Metadata
  title                   TEXT,         -- editable; auto-generated as "Meeting YYYY-MM-DD HH:MM" on finalize
  tags                    TEXT[],

  -- Soft delete + audit
  archived_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_client_id ON meeting_recordings(client_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_project_id ON meeting_recordings(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started_at ON meeting_recordings(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_status ON meeting_recordings(transcription_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_meeting_recordings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_meeting_recordings_updated_at
  BEFORE UPDATE ON meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION update_meeting_recordings_updated_at();

-- RLS: enable (ecodiaos-backend uses service_role key, bypasses RLS)
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
```

---

## Section 2: Storage Path Convention

Bucket: `documents` (already exists, confirmed active with invoices/spikes/testimonies content)

```
documents/meetings/<meeting-id>/
  audio.webm          raw capture from browser MediaRecorder (chunks merged on finalize)
  audio.opus          optional transcode post-stop (smaller; Deepgram also accepts .webm)
  transcript.txt      plain-text transcript (Deepgram utterances concatenated)
  diarised.json       full Deepgram response [{speaker, start, end, text, confidence}, ...]
  summary.json        Sonnet output {summary_text, action_items, key_decisions, follow_ups}
```

**Chunked upload path (during recording):**
```
documents/meetings/<meeting-id>/chunks/<n>.webm    (n = 0, 1, 2, … 30s each)
```
Chunks merged server-side on `/finalize`. After merge, delete chunk objects.

**URL stored in DB:** full Supabase Storage path (`documents/meetings/<id>/audio.webm`), not the public URL. Public URL reconstructed at serve time via `storage_get_url`. This keeps the DB portable if the bucket URL changes.

---

## Section 3: Current Max Migration Number

**Observed via `ls /home/tate/ecodiaos/src/db/migrations/ | sort | tail -10`:**

```
090_imessage_outbound_queue.sql
091_gkg_events.sql
092_push_tokens.sql
093_gkg_phase_2_stage_columns.sql
094_add_retention_columns.sql
095_voice_transcript_chunks.sql
096_application_event_was_false_positive.sql
097_drop_imessage_substrate.sql
098_voice_transcript_chunks_enrich.sql
099_os_session_messages.sql
```

**Current max: 099.**

Factory worker dispatched for Phase 1 MUST `ls /home/tate/ecodiaos/src/db/migrations/ | sort | tail -3` at write-time and use `max+1` as the filename prefix. Do NOT hardcode `100` — a parallel migration may have landed between now and dispatch. The pattern `XXX_meeting_recordings.sql` where XXX is the observed next number at write-time.

---

## Section 4: Admin UI Pages

### Frontend architecture (verified 2026-05-12)

The admin frontend is **NOT Next.js**. It is a **Vite + React + React Router SPA** at:
- Source: `/home/tate/workspaces/ecodiaos/fe/src/`
- Routes defined in: `/home/tate/workspaces/ecodiaos/fe/src/App.tsx`
- Pages live in: `/home/tate/workspaces/ecodiaos/fe/src/pages/`
- Deployed to: `admin.ecodia.au`

Current routes:
```
/login       LoginPage           (no auth required)
/voice       VoicePage           (no auth required — existing voice capture)
/            CortexAmbientPage   (protected via ProtectedRoute + AppShell)
```

New meeting routes MUST be wired into `App.tsx` following the same lazy-import + Scene pattern.

---

### Page A: `admin.ecodia.au/meetings` — List page (protected)

**File:** `src/pages/Meetings/index.tsx`

**Route addition to App.tsx:**
```tsx
const MeetingsPage = lazy(() => import('./pages/Meetings'))
const MeetingDetailPage = lazy(() => import('./pages/Meetings/Detail'))

// Inside ProtectedRoute > AppShell route group:
<Route path="meetings" element={<Scene name="Meetings"><MeetingsPage /></Scene>} />
<Route path="meetings/:id" element={<Scene name="MeetingDetail"><MeetingDetailPage /></Scene>} />
```

**Layout:**
```
[+ Record New Meeting]                               (top right, navigates to /meeting)

| Date       | Title              | Duration | Client    | Status  | Actions        |
|------------|--------------------|----------|-----------|---------|----------------|
| 11 May 26  | Discovery Call     | 42m      | Resonav.  | done    | [View] [Delete]|
| 10 May 26  | Internal standup   | 18m      | —         | pending |                |
```

- Pagination: 20/page
- Filter bar: status dropdown, client dropdown, date range
- `transcription_status` chip colours: pending=grey, processing=yellow, done=green, error=red
- Row click navigates to `/meetings/:id`

---

### Page B: `admin.ecodia.au/meetings/:id` — Detail page (protected)

**File:** `src/pages/Meetings/Detail.tsx`

**Sections top to bottom:**

1. **Header strip**
   - Inline-editable title (click to edit, blur to save `PUT /api/meetings/:id`)
   - Date + duration badge
   - Client dropdown (`clients` table, nullable)
   - Project dropdown (filtered by client_id if client set, nullable)
   - Tags (comma-separated input)
   - Transcription status chip

2. **Audio player**
   - HTML5 `<audio>` element, `src` = signed Supabase Storage URL
   - Standard controls + seek bar
   - Exposes `currentTime` to the transcript panel for click-to-seek sync

3. **Diarised transcript panel**
   - Speaker colour coding: Speaker 0 = blue, Speaker 1 = orange, Speaker 2 = green, N = cycle
   - Each utterance: `[MM:SS] <Speaker N> text...`
   - Click timestamp → sets `audio.currentTime`
   - Falls back to `transcript_text` as plain text block if `diarised_transcript` is null

4. **Summary** (collapsible, shown when `summary_text` is set)
   - AI-generated paragraph summary

5. **Action Items** (checklist)
   - Each item: checkbox + text. Check = `PATCH` action_items JSONB array
   - [+ Add action item] inline

6. **Key Decisions** list
   - Read-only list from `key_decisions` JSONB

7. **Follow-ups** list
   - Each: text + optional due date
   - [Create status_board row] button per item (P3 feature, Phase 5)

8. **Neo4j links** (shown when `neo4j_meeting_id` is set)
   - "Episode linked", "Decisions linked: N" — static display

9. **Metadata footer**
   - Provider, cost (formatted from cents), created_at, updated_at
   - [Re-transcribe] button → `POST /api/meetings/:id/transcribe`

---

### Page C: `admin.ecodia.au/meeting` — Recorder PWA (no auth required)

**File:** `src/pages/MeetingRecorder.tsx`
**Route:** unprotected (like `/voice`), added directly to outer Routes in App.tsx

```tsx
<Route path="/meeting" element={<SceneSuspense><MeetingRecorderPage /></SceneSuspense>} />
```

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  [Client ▼]   [Project ▼]                       │
│                                                  │
│           ⏺  00:04:23                            │
│         [🔴 RECORDING]                           │
│                                                  │
│  Chunks uploaded: 8/8  ✓                        │
│  [■ Stop & Transcribe]                           │
└─────────────────────────────────────────────────┘
```

States:
- **idle**: Big [🔴 Record] button, client/project selectors
- **recording**: Timer counting up, chunk upload progress bar (x / expected chunks), [■ Stop] button
- **stopping**: Spinner "Uploading final chunk…"
- **processing**: Spinner "Transcribing… (takes ~30s per minute of audio)"
- **done**: Auto-redirects to `/meetings/:id`
- **error**: Red banner with retry option

On stop:
1. POST `/api/meetings/:id/finalize`
2. Poll `GET /api/meetings/:id` every 3s until `transcription_status === 'done'` or `'error'`
3. On done → `navigate('/meetings/' + id)`

---

## Section 5: API Endpoints

All under the backend at `api.admin.ecodia.au`. Auth via bearer token (same pattern as existing routes).

```
POST   /api/meetings
  Body: { client_id?, project_id?, title?, started_at? }
  Returns: { id, started_at }
  Creates DB row with transcription_status='pending'

POST   /api/meetings/:id/upload-chunk
  Body: multipart/form-data { chunk: <binary>, chunkIndex: N, totalChunks?: N }
  Uploads to documents/meetings/:id/chunks/:chunkIndex.webm
  Returns: { uploaded: true, chunkIndex }

POST   /api/meetings/:id/finalize
  Body: { ended_at?, duration_seconds? }
  Actions:
    1. Merge chunks → documents/meetings/:id/audio.webm (server-side concat)
    2. Delete chunk objects from storage
    3. Update ended_at, duration_seconds, audio_url, audio_size_bytes
    4. Set transcription_status='processing'
    5. Fire async: call Deepgram Nova-2, store result, run Sonnet summary, write Neo4j nodes
    6. Set transcription_status='done' (or 'error')
  Returns: { finalized: true } immediately (transcription runs async)

GET    /api/meetings
  Query: ?page=1&limit=20&client_id=&status=&date_from=&date_to=
  Returns: { meetings: [...], total, page, pages }

GET    /api/meetings/:id
  Returns: full row including diarised_transcript, action_items, etc.

PUT    /api/meetings/:id
  Body: partial { title?, client_id?, project_id?, tags?, action_items?, key_decisions?, follow_ups? }
  Returns: updated row

POST   /api/meetings/:id/transcribe
  Manual retrigger: re-runs transcription + summary pipeline
  Sets transcription_status='processing', fires async
  Returns: { queued: true }

DELETE /api/meetings/:id
  Soft delete: SET archived_at = NOW()
  Returns: { archived: true }
```

---

## Section 6: Neo4j Schema

### Nodes to create (on `transcription_status` transitions to `'done'`)

```cypher
// Meeting node — created on finalize trigger
CREATE (m:Meeting {
  id: "<meeting_recordings.id>",
  name: "Meeting — YYYY-MM-DD — <client_name or 'Internal'>",
  date: date("YYYY-MM-DD"),
  duration_minutes: <rounded>,
  summary: "<summary_text first 500 chars>",
  supabase_id: "<meeting_recordings.id>",
  transcription_provider: "deepgram",
  created_at: datetime()
})

// Episode node — the conversation as a durable event
CREATE (ep:Episode {
  name: "<title or auto-title>",
  description: "<summary_text>",
  date: date("YYYY-MM-DD"),
  created_at: datetime()
})
```

### Relationships to create

```cypher
// Episode originated from the Meeting recording
(ep:Episode)-[:ORIGINATED_FROM]->(m:Meeting)

// If client_id is set: link to Organization
(m:Meeting)-[:WITH]->(org:Organization {name: "<client.name>"})

// If project_id is set: link to Project
(m:Meeting)-[:ABOUT]->(proj:Project {name: "<project.name>"})

// For each key_decision extracted: create Decision node
(d:Decision {
  name: "<decision text>",
  date: date("YYYY-MM-DD"),
  description: "<decision text>",
  created_at: datetime()
})-[:DECIDED_IN]->(m:Meeting)

// Link back: store neo4j IDs in DB row for display
// UPDATE meeting_recordings SET neo4j_meeting_id = <id>, neo4j_episode_id = <id> WHERE id = :id
```

### Querying (no Meeting nodes exist yet — confirmed via Cypher `MATCH (m:Meeting) RETURN m` → 0 results and `CALL db.labels()` has no 'Meet' labels)

```cypher
-- List recent meetings
MATCH (m:Meeting) RETURN m.name, m.date, m.duration_minutes ORDER BY m.date DESC LIMIT 10

-- Meetings with a client
MATCH (m:Meeting)-[:WITH]->(org:Organization) RETURN m.name, org.name

-- Decisions from meetings
MATCH (d:Decision)-[:DECIDED_IN]->(m:Meeting) WHERE m.date > date() - duration('P30D')
RETURN d.name, m.name, m.date ORDER BY m.date DESC
```

---

## Section 7: Phase Breakdown

### Phase 1 — Capture only (~2h Factory)
Deliverables:
- Migration `XXX_meeting_recordings.sql` (Factory re-ls at write-time for correct number)
- 3 backend endpoints: `POST /api/meetings`, `POST /api/meetings/:id/upload-chunk`, `POST /api/meetings/:id/finalize` (no transcription yet — status stays 'pending')
- `/meeting` PWA recorder page (idle + recording + stopping states only, redirects to `/meetings/:id` on finalize)
- `/meetings` list page (shows rows, no transcript content)
- `/meetings/:id` basic detail (header, audio player only)
- Wire new routes in `App.tsx`

### Phase 2 — Transcription (~1h Factory)
Deliverables:
- Deepgram Nova-2 integration (`POST /api/meetings/:id/transcribe`)
- Deepgram called async in `finalize` handler
- `transcript_text` + `diarised_transcript` written to DB
- `transcript_url` + `diarised_url` written to Storage
- `transcription_status` lifecycle (processing → done/error)
- Cost stored in `transcription_cost_cents`
- Detail page: diarised transcript panel (speaker colours + timestamps)

### Phase 3 — Summary via Sonnet (~1h Factory)
Deliverables:
- Sonnet call after Deepgram completes (chained async)
- `summary_text`, `action_items`, `key_decisions`, `follow_ups` populated
- Summary + action items + decisions sections in detail page
- `summary.json` written to Storage

### Phase 4 — Neo4j linkage (~1h Factory)
Deliverables:
- `graph_merge_node` calls for Meeting + Episode nodes after transcript-complete
- `graph_create_relationship` for [:WITH], [:ABOUT], [:DECIDED_IN], [:ORIGINATED_FROM]
- `neo4j_meeting_id` + `neo4j_episode_id` written back to DB row
- Neo4j links display section in detail page

### Phase 5 — UI polish (~2h Factory)
Deliverables:
- Audio-transcript sync (click timestamp → seek audio)
- Action item checkboxes (mark complete, persisted via PUT)
- Follow-ups: [Create status_board row] button
- Recorder page: processing spinner + poll-until-done
- Auto-redirect to `/meetings/:id` on transcript complete
- Mobile PWA: `manifest.json` + `<meta name="viewport">` for home-screen add

---

## Appendix: Key File Paths

| What | Path |
|------|------|
| Backend source | `/home/tate/ecodiaos/src/` |
| Migrations | `/home/tate/ecodiaos/src/db/migrations/` |
| Frontend source | `/home/tate/workspaces/ecodiaos/fe/src/` |
| Frontend pages | `/home/tate/workspaces/ecodiaos/fe/src/pages/` |
| App router | `/home/tate/workspaces/ecodiaos/fe/src/App.tsx` |
| Existing Voice page | `/home/tate/workspaces/ecodiaos/fe/src/pages/Voice.tsx` |
| Storage bucket | `documents` (Supabase, already active) |
| Admin URL | `admin.ecodia.au` |
| API URL | `api.admin.ecodia.au` |

## Appendix: Open Questions for Tate

1. **Deepgram API key** — not yet provisioned. Factory can wire the integration but key must be set in `kv_store.creds.deepgram_api_key` + backend env before Phase 2 can run end-to-end.
2. **Auth on `/meeting` recorder** — currently specced as unprotected (same as `/voice`). If Tate wants it auth-gated, change Route wrapper in App.tsx.
3. **Chunk merge strategy** — server-side binary concat of `.webm` chunks works for opus audio; if MediaRecorder emits non-concatenable chunks, server will need `ffmpeg` concat filter. `ffmpeg` availability on VPS TBD.

# Voice Infra Audit - 2026-05-12

Authored by fork_mp1ug0gm_4dd8c1. Read-only recon, no code changes.

---

## (a) What /voice does today

Two distinct voice systems exist, both live on main:

### 1. Brainstorm chunk pipeline (`POST /api/voice/chunk`)
End-to-end flow:
1. Browser records 1-15s audio blobs and POSTs each as multipart to `/api/voice/chunk` with `session_id` (UUID), `seq` (int), optional `duration_ms` and `source` ('voice-page' default).
2. `voiceTranscription.js` sends the buffer to OpenAI Whisper-1 (`whisper-1`, language=en, temperature=0). Returns plain text.
3. Hallucination filter drops near-silent results (empty, `.`, `thanks for watching.`, `<4 chars`, etc.).
4. Audio buffer uploaded (best-effort) to private Supabase Storage bucket `voice-chunks/<YYYY-MM-DD>/<session_id>/<seq>.<ext>`.
5. Row inserted into `voice_transcript_chunks` with full enrichment: session_id, seq, audio_bytes, mime_type, transcribed_text, dropped, drop_reason, duration_ms, model, language, audio_storage_path, source, started_at, ended_at.
6. Surviving text appended to `voiceBuffer` (in-memory, keyed by session_id). Buffer flushes when accumulated text exceeds 300 chars OR 30s elapse since last flush. Flush POSTs `[VOICE] <text>` to `/api/os-session/message` with `source: 'voice'` and `priority: false`.
7. Conductor receives `[VOICE]` message in its chat stream like any typed message.

There is no frontend `/voice` page in `admin-frontend/app/voice/` - the frontend surface that calls `/api/voice/chunk` is not present in this codebase (likely in the admin-frontend repo or a standalone page).

### 2. Phone call relay (`/api/voice/incoming` + WS `/api/voice/relay`)
- Twilio ConversationRelay: answers inbound calls with TwiML, upgrades to WebSocket.
- Haiku (Agent SDK, code@ account) responds in real-time (2-3 sentences, <12s timeout).
- Complex requests (status/invoice/email/schedule/client keywords) also forwarded to Opus conductor via `osSession.sendMessage`.
- On call end: full transcript (caller/EcodiaOS turns) sent to conductor for Neo4j logging.
- Caller lookup from `contacts` table; business context from `status_board` top 15 rows.

---

## (b) Worker-2 voice-source-marking work

**Fork:** `fork_mp1u0ln7_4a7f94` - "W2: voice-source marking brief"

**What it built (confirmed from git diff + untracked file):**

Three files, all complete and uncommitted, sitting dirty on main:

1. `src/db/migrations/099_os_session_messages.sql` (untracked) - Creates `os_session_messages` table:
   - `id UUID`, `body TEXT`, `source TEXT DEFAULT 'typed'`, `created_at TIMESTAMPTZ`
   - Two indexes: `(source, created_at DESC)` and `(created_at DESC)`
   - Comments document source values: `voice | typed | scheduler | tate`
   - Origin note: Tate verbatim 12 May 2026 09:16 AEST "we need to differentiate what is my voice and what is typing"

2. `src/services/voiceBuffer.js` (modified) - One-line diff: adds `source: 'voice'` to the JSON body POSTed to `/api/os-session/message` on flush.

3. `src/routes/osSession.js` (modified) - Adds a fire-and-forget INSERT into `os_session_messages (body, source)` after each message is accepted, using the `source` field from the request body (defaults `'typed'`).

**Status:** NOT committed. The 3-file changeset is clean, cohesive, and ready to commit.

---

## (c) Worker-3 session-grouping work

**Nothing found.** No stash, no worktree diff, no migration, no code file references any "session group" or `voice_sessions` concept.

The three locked worktrees in `.claude/worktrees/` (agent-a0ffc25f..., agent-a8fa58fadf..., agent-ab220e9f...) are IDE-internal Claude Code worktrees from the current session. `git -C <path> log` returned empty for all three - they carry no commits and no diffs. They are not crash artifacts from voice workers.

Stash list was checked through stash@{0} (most recent, dated 11 May 2026). No stash entry references session grouping.

**Conclusion:** Worker-3 either never ran, phantom-bailed without writing anything, or was never dispatched. Session-grouping work does not exist on disk.

---

## (d) Salvageable work

**Clean and committable:**

The W2 source-marking changeset is entirely salvageable as a single atomic commit:
- `src/db/migrations/099_os_session_messages.sql` (new file, clear DDL)
- `src/services/voiceBuffer.js` (1-line change, adds `source: 'voice'`)
- `src/routes/osSession.js` (9-line insertion, fire-and-forget INSERT)

These 3 files form a complete, self-consistent unit. The migration creates the table; the route writes to it; the buffer marks voice flushes. No further changes needed to make W2 shippable.

**Not salvageable:** Nothing from W3 exists to salvage.

---

## (e) Gap: /voice vs meeting recorder

The current `/api/voice/chunk` pipeline is a **real-time brainstorm capture tool** - short utterances from Tate, streamed into conductor chat. A meeting recorder is a fundamentally different artefact with different requirements:

| Dimension | /voice today | Meeting recorder needs |
|---|---|---|
| Duration | 1-15s chunks, sessions typically <10min | 30-120min continuous sessions |
| Participants | Single speaker (Tate) | 2+ speakers (Tate + client/guest) |
| Audio source | Browser mic only | Browser mic + system audio (computer calls via Zoom/Meet/phone) |
| Output destination | Conductor chat stream as `[VOICE]` messages | Discrete artefact: titled session record with start/end/participants |
| Session metadata | `session_id` UUID only (no title, no type, no participants, no associated client/project) | Named session: "Call with Kurt 12 May", linked to client/project in CRM |
| Diarisation | None - all text merged as one stream | Speaker labels: "Tate:", "Kurt:" per segment |
| Permanent storage | Audio blobs stored (Supabase Storage, 098 migration). Transcript rows persisted. | Same - already solved |
| Re-assembly | No session header table. `session_id` allows reconstruction but no UI surface for it | `voice_sessions` table with title, started_at, ended_at, participants, status |
| Search | No full-text search over `transcribed_text` | Full-text search (pg tsvector index on `transcribed_text`) |
| Conductor flooding | Buffer coalesces into chat stream - would flood on 60min meeting | Meeting sessions should NOT go to conductor chat. Separate artefact surface |
| Real-time feedback | Chunks sent to conductor who responds - creates conversational loop | Meeting mode needs to suppress conductor forwarding entirely |
| Post-session processing | None | Theme extraction, action item extraction, summary generation (background job) |
| Access UI | No frontend voice page in this repo | Needs: start/stop meeting, session list, session detail with transcript + summary |

**Critical gaps (blockers for meeting recorder):**

1. No `voice_sessions` table - no concept of a meeting as a bounded artefact with metadata.
2. No diarisation - Whisper-1 produces single-speaker transcript; meeting needs speaker turns.
3. Conductor forwarding must be suppressible - a 90min meeting would inject ~180 `[VOICE]` messages into conductor chat.
4. No system audio capture - computer meetings (Zoom/Google Meet) need both sides; browser mic alone only gets Tate.
5. No post-session processing pipeline - summaries, action items, CRM notes need a background job triggered on session end.
6. Missing `os_session_message_id` linkage - the column exists in 098 migration but the route never writes it (the `INSERT INTO os_session_messages` from W2 doesn't return an ID back to the chunk INSERT).

---

## (f) Migration status

| Migration | File | Status |
|---|---|---|
| 095 | `voice_transcript_chunks` (table create) | Committed (in ac77f4d ancestry) |
| 096 | `application_event_was_false_positive` | Committed |
| 097 | `drop_imessage_substrate` | Committed |
| 098 | `voice_transcript_chunks_enrich` (enrichment columns + storage) | Committed (ac77f4d, 11 May 2026 23:20 UTC) |
| 099 | `os_session_messages` (source-tracking table) | **UNTRACKED / NOT COMMITTED** |

**099 is the next available migration number.** It is not taken by anything else. The W2 changeset using 099 is safe to commit.

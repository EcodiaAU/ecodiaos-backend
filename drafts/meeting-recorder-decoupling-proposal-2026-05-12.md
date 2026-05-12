# Meeting Recorder Process Decoupling
**Date:** 2026-05-12
**Status:** Option A SHIPPED (fork_mp26bxy3_2dccf4)
**Trigger:** Chunk 7 upload error during ecodia-api restart at ~15:09 AEST 12 May 2026

---

## Root Cause

`POST /api/meetings/:id/chunk` lived in ecodia-api (port 3001). Browser's
MediaRecorder sends chunks every ~5s during a live recording. When ecodia-api
restarts (deploy, nightly cron, conductedRestart, Factory dispatch), there is a
5-10s downtime window. Any chunk that hits the endpoint during that window gets
"Failed to fetch".

**Key finding:** Chunks were already going straight to Supabase Storage (not
local disk). The `meetings.js` handler holds the buffer in memory just long
enough to call `storageUpload()`, then releases it. The filesystem is never
touched. So the ONLY thing that needed fixing was: the HTTP endpoint living in
the same process as everything else.

---

## Architecture Map

```
Browser MediaRecorder
  → POST /api/meetings/:id/chunk  (every ~5s)
      → multer.memoryStorage() (buffer in RAM, 20MB cap)
      → storageUpload() → Supabase Storage documents/meetings/<id>/chunks/<seq>.webm
      → 200 OK

POST /api/meetings/:id/stop
  → downloadChunks() from Supabase Storage
  → concat + upload merged audio.webm
  → runTranscription() [async, fire-and-forget]
      → Whisper/Deepgram
      → runAnalysis() [async, fire-and-forget]
          → Claude sonnet-4-5 (via anthropicMessagesClient OAuth chain)
          → UPDATE meeting_recordings SET analysis_json, action_items_json
```

None of transcription or analysis runs during recording. Only chunk upload is
time-sensitive. The conductor reads final meeting records from Postgres for
chat-context - it never needs to touch the meetings HTTP layer.

---

## Options Evaluated

### Option A - Separate PM2 process (SHIPPED)
Extract meetings routes into `src/meetingsServer.js`, new PM2 entry
`ecodia-meetings` on port 3003, nginx routes `/api/meetings` there first.

**Pros:** 30-min ship. Zero coupling to ecodia-api restart lifecycle.
Same codebase, same Postgres, same Supabase client.

**Cons:** Still on VPS (VPS-level reboot would affect it, but VPS reboots
are rare and not the failure mode we're fixing). Two more PM2 processes to
be aware of.

**Verdict: Shipped.** Process is online, nginx routing active, verified.

### Option B - Direct browser-to-Supabase uploads (future right answer)
Browser generates a Supabase signed URL per chunk (or per recording session),
POSTs directly to Supabase Storage. ecodia-api only needed for:
1. `POST /api/meetings` - create row + return signed URL
2. `POST /api/meetings/:id/stop` - trigger merge + transcription

**Pros:** Zero HTTP dependency during recording once the session is started.
Even if ecodia-api is completely down, already-in-flight chunks land safely.

**Cons:** Requires frontend change (Supabase JS client for chunk upload).
Supabase Storage signed URL flow needs per-chunk auth or pre-generated batch.
Browser would need to handle upload retries directly.

**Verdict: Right eventual answer but not needed today. Option A solves the
real failure mode (short restart windows) at much lower complexity cost.**

### Option C - Cloudflare R2 / S3 multipart (overkill)
Same shape as B but cheaper at scale. Not needed at current volume.

**Verdict: Defer indefinitely.**

---

## What Shipped (Option A)

### Files changed
- `src/meetingsServer.js` (NEW) - thin Express app: CORS + json parsing + meetings router + healthz, listens on 127.0.0.1:3003
- `ecosystem.config.js` - added `ecodia-meetings` PM2 entry (512M limit)
- `/etc/nginx/sites-available/ecodia-api` - added `location ^~ /api/meetings { proxy :3003; client_max_body_size 525M }` before catch-all `/`

### What did NOT change
- `src/routes/meetings.js` - untouched, used as-is
- `src/app.js` - meetings route still registered in ecodia-api as belt-and-braces fallback
- ecodia-api was NOT restarted (nginx reload only, zero downtime)

### Verification
```
$ curl -s http://localhost:3003/api/healthz
{"ok":true,"service":"ecodia-meetings","pid":507293,"uptime":5.81,"ts":...}

$ curl -s http://localhost:3003/api/meetings | head -c 200
{"meetings":[{"id":"fb755c02-...","title":null,...
```

PM2 process `ecodia-meetings` online, 0 restarts, 23.8MB RAM.

---

## Restart Independence

ecodia-api can now restart without affecting in-flight recordings:

| Event | Before | After |
|---|---|---|
| ecodia-api deploy | Chunk N "Failed to fetch" | Chunk N lands on :3003, unaffected |
| nightly PM2 restart | Same | Same |
| conductedRestart | Same | Same |
| ecodia-meetings restart | N/A | Only if someone explicitly restarts meetings process |

The meetings process has no reason to restart on its own - it's stateless
(all state in Supabase Storage + Postgres), low memory (~24MB), no volatile
in-memory queues.

---

## Follow-up (not urgent)

- Remove `/api/meetings` from `src/app.js` once Option A has been running
  cleanly for a week (reduces dead code, avoids double-processing if nginx
  config ever regresses)
- Option B (direct browser upload) worth implementing if recordings regularly
  exceed 30+ minutes or if VPS-level reliability becomes a concern

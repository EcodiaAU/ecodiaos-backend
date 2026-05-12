---
triggers: transcription,audio,whisper,deepgram,large-file,ffmpeg,chunk,webm,mp3,oom,heap,memory,storage-limit,supabase-limit
status: active
authored: 2026-05-12
origin_fork: fork_mp20l3c2_ec3799
origin_commit: 72a267e
---

# Large audio transcription: ffmpeg pre-processing + chunk-safe storage

## Rule

Never send audio files >20MB directly to a transcription API. Never load a
large audio buffer into Node heap simultaneously with other operations.
Never delete source chunks until the merged upload is confirmed successful.

## Why

Whisper API hard-caps at 25MB. Supabase Storage free tier caps at 50MB per
upload. A 64-minute Chrome MediaRecorder WebM (~1 MB/min = ~59MB) exceeds
BOTH limits. Without defence, the failure chain is:

1. `Buffer.concat(chunks)` → 59MB in heap
2. `storageUpload(merged)` → silently returns null (50MB limit)
3. `deleteChunks()` runs anyway → chunks gone
4. `runTranscription` tries to download audio.webm → "Object not found"
5. No retry possible: audio unrecoverable

## Protocol

### Before calling any transcription API

Use `transcribeWithChunking()` (src/services/transcriptionService.js),
not `transcribeAudio()` directly:

```js
const { transcribeWithChunking } = require('../services/transcriptionService')
const transcript = await transcribeWithChunking({ buffer, mimeType, filename })
```

`transcribeWithChunking` applies this strategy:
- **≤20MB**: direct pass-through, no ffmpeg
- **>20MB**: convert to 16kHz/mono/32kbps MP3 via ffmpeg
  - 64-min 59MB WebM → ~15MB MP3 → single Whisper call (fits under 25MB)
  - Memory: writes buffer to tmpfile first, sets `buffer = null` before ffmpeg
  - Covers recordings up to ~100min in a single API call
- **>~100min (MP3 still >24MB)**: ffmpeg segments into 10-min chunks,
  transcribes each, stitches timestamps

### When merging and uploading audio in stop handler

```js
const merged = Buffer.concat(chunks)
const audioPath = await storageUpload({ buffer: merged, path: `…/audio.webm`, … })
if (audioPath) {
  deleteChunks(id)          // safe: merged upload succeeded
} else {
  logger.warn('keeping chunks as fallback') // DO NOT delete
}
```

### When transcribing (runTranscription fallback)

If `audio.webm` download returns "Object not found":
1. Try re-merging from individual chunks via `downloadChunks()`
2. Attempt to upload merged audio again (best-effort)
3. If no chunks either: throw with "audio unavailable"

## Memory ceiling

- NEVER hold `full_audio_buffer + working_copy` simultaneously in Node heap
- Write large buffer to tmpfile with `fs.writeFile()`, then set `buffer = null`
- All ffmpeg temp files cleaned in `finally` block

## Typical file sizes (Chrome MediaRecorder WebM, Opus codec)

| Duration | Raw WebM | After 16kHz/mono/32kbps MP3 |
|----------|----------|------------------------------|
| 10 min   | ~10MB    | ~2.4MB                       |
| 30 min   | ~30MB    | ~7.2MB                       |
| 64 min   | ~59MB    | ~15MB                        |
| 100 min  | ~93MB    | ~24MB (single-call limit)    |
| 120 min  | ~112MB   | ~29MB (needs segmentation)   |

## Cross-refs

- `src/services/transcriptionService.js` — `transcribeWithChunking()`
- `src/routes/meetings.js` — stop handler + runTranscription fallback
- Supabase free tier limits: 50MB/file upload, no multipart
- Whisper API limits: 25MB/request
- Origin: 2026-05-12 64-min recording P1 failure (meeting e229c4ea, audio unrecoverable)

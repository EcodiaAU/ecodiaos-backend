/**
 * meetings.js - POST/GET/PATCH /api/meetings
 *
 * Phase 1: durable meeting capture + Whisper transcription.
 * Replaces the /voice chunked-streaming approach which dropped 150 chunks
 * on disconnect. Every chunk lands in Supabase storage immediately on upload;
 * prior chunks are safe even if the tab closes mid-recording.
 *
 * Storage layout (documents bucket):
 *   meetings/<id>/chunks/<seq>.webm   - uploaded live during recording
 *   meetings/<id>/audio.webm          - merged on stop (binary concat)
 *   meetings/<id>/transcript.txt      - written after Whisper completes
 *
 * Authored: fork_mp1utwce_96fdc9, 2026-05-12.
 */

const express = require('express')
const multer = require('multer')
const path = require('path')
const os = require('os')
const fs = require('fs')
const logger = require('../config/logger')
const db = require('../config/db')
const { transcribeWithChunking } = require('../services/transcriptionService')
const { runAnalysis } = require('../services/meetingAnalysisService')

const router = express.Router()

// Multer instance for live chunk uploads (in-memory, 20 MB cap per chunk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per chunk
})

// Multer instance for full-file audio upload (disk storage, 500 MB cap).
// Writing to disk avoids holding 100MB+ files in heap.
const uploadAudioToDisk = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.mp3'
      cb(null, `meeting-upload-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').split(';')[0].trim()
    if (mime.startsWith('audio/') || mime === 'video/mp4') {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${mime}. Expected audio/*.`))
    }
  },
})

// ---------------------------------------------------------------------------
// Lazy Supabase client (service_role - same pattern as voiceChunk.js)
// ---------------------------------------------------------------------------
let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  const { createClient } = require('@supabase/supabase-js')
  _supabase = createClient(url, key)
  return _supabase
}

// Upload a buffer to the documents bucket. Returns storage path or null.
async function storageUpload({ buffer, path, mimeType }) {
  const sb = getSupabase()
  if (!sb || !buffer || !buffer.length) return null
  try {
    const { error } = await sb.storage
      .from('documents')
      .upload(path, buffer, { contentType: mimeType, upsert: true })
    if (error) {
      logger.warn('[Meetings] storage upload failed', { path, error: error.message })
      return null
    }
    return path
  } catch (err) {
    logger.warn('[Meetings] storage upload threw', { path, error: err.message })
    return null
  }
}

// Download all chunk objects and return as an array of Buffers (sorted by seq).
async function downloadChunks(meetingId) {
  const sb = getSupabase()
  if (!sb) return []

  // List chunk objects
  const { data: files, error } = await sb.storage
    .from('documents')
    .list(`meetings/${meetingId}/chunks`, { limit: 500, sortBy: { column: 'name', order: 'asc' } })

  if (error || !files || !files.length) return []

  // Download each in sequence order
  const sorted = files
    .filter(f => f.name.endsWith('.webm') || f.name.match(/\.\w+$/))
    .sort((a, b) => {
      const ai = parseInt(a.name, 10)
      const bi = parseInt(b.name, 10)
      return ai - bi
    })

  const buffers = []
  for (const f of sorted) {
    const { data, error: dlErr } = await sb.storage
      .from('documents')
      .download(`meetings/${meetingId}/chunks/${f.name}`)
    if (dlErr || !data) {
      logger.warn('[Meetings] chunk download failed', { file: f.name, error: dlErr?.message })
      continue
    }
    const ab = await data.arrayBuffer()
    buffers.push(Buffer.from(ab))
  }
  return buffers
}

// Delete chunk objects after merge
async function deleteChunks(meetingId) {
  const sb = getSupabase()
  if (!sb) return
  try {
    const { data: files } = await sb.storage
      .from('documents')
      .list(`meetings/${meetingId}/chunks`, { limit: 500 })
    if (!files || !files.length) return
    const paths = files.map(f => `meetings/${meetingId}/chunks/${f.name}`)
    await sb.storage.from('documents').remove(paths)
  } catch (err) {
    logger.warn('[Meetings] chunk cleanup failed', { meetingId, error: err.message })
  }
}

// ---------------------------------------------------------------------------
// Async transcription pipeline - runs after stop/upload, does not block response
// ---------------------------------------------------------------------------
async function runTranscription(meetingId) {
  try {
    const sb = getSupabase()
    if (!sb) throw new Error('no supabase client')

    // Read audio_url from DB so both live recordings (audio.webm) and
    // uploaded files (uploaded-<ts>.mp3 etc.) are handled correctly.
    const [meetingRow] = await db`
      SELECT audio_url FROM meeting_recordings WHERE id = ${meetingId}::uuid
    `
    const audioStoragePath = meetingRow?.audio_url || `meetings/${meetingId}/audio.webm`

    let buffer = null

    // Primary: download from the stored audio_url
    const { data, error } = await sb.storage
      .from('documents')
      .download(audioStoragePath)

    if (data && !error) {
      const ab = await data.arrayBuffer()
      buffer = Buffer.from(ab)
    } else {
      // Fallback: stored audio missing (e.g. upload exceeded storage limit for live recording).
      // Re-merge from individual chunks which may still be in storage.
      logger.warn('[Meetings] audio download failed, falling back to chunks', {
        meetingId,
        audioStoragePath,
        error: error?.message,
      })
      const chunkBuffers = await downloadChunks(meetingId)
      if (!chunkBuffers.length) {
        throw new Error('audio unavailable: audio download failed and no chunks found in storage')
      }
      buffer = Buffer.concat(chunkBuffers)
      // Attempt to upload merged audio now (best-effort; don't block transcription if it fails)
      const merged = await storageUpload({
        buffer,
        path: `meetings/${meetingId}/audio.webm`,
        mimeType: 'audio/webm',
      })
      if (merged) {
        deleteChunks(meetingId).catch(() => {})
        logger.info('[Meetings] merged audio uploaded on retry', { meetingId, bytes: buffer.length })
      }
    }

    if (!buffer || !buffer.length) throw new Error('empty audio buffer')

    logger.info('[Meetings] transcribing', { meetingId, bytes: buffer.length })

    // transcribeWithChunking handles large files (>20MB) by converting to
    // voice-quality MP3 via ffmpeg before calling the transcription API.
    // A 64-min 59MB WebM → ~15MB MP3 — fits Whisper's 25MB limit in one call.
    const transcript = await transcribeWithChunking({
      buffer,
      mimeType: 'audio/webm',
      filename: 'meeting.webm',
    })

    const text = transcript.full_text || ''

    // Store plain-text transcript to storage
    const transcriptPath = `meetings/${meetingId}/transcript.txt`
    await storageUpload({
      buffer: Buffer.from(text, 'utf8'),
      path: transcriptPath,
      mimeType: 'text/plain',
    })

    await db`
      UPDATE meeting_recordings SET
        transcript_text = ${text},
        transcript_json = ${JSON.stringify(transcript)},
        transcript_url = ${transcriptPath},
        transcript_engine = ${transcript.engine},
        transcript_diarised = ${transcript.diarised},
        transcription_status = 'done',
        transcription_error = NULL
      WHERE id = ${meetingId}::uuid
    `
    logger.info('[Meetings] transcription done', {
      meetingId,
      engine: transcript.engine,
      diarised: transcript.diarised,
      chars: text.length,
      segments: transcript.segments?.length,
    })
    // Fire analysis pipeline async - does NOT block transcription response
    runAnalysis(meetingId, db).catch(err => {
      logger.error('[Meetings] async analysis error', { meetingId, error: err.message })
    })
  } catch (err) {
    logger.error('[Meetings] transcription failed', { meetingId, error: err.message })
    await db`
      UPDATE meeting_recordings SET
        transcription_status = 'error',
        transcription_error = ${err.message}
      WHERE id = ${meetingId}::uuid
    `.catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// POST /api/meetings - create a new meeting row
// Body: { title?, client_id?, project_id? }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { title, client_id, project_id } = req.body || {}
    const [row] = await db`
      INSERT INTO meeting_recordings (title, client_id, project_id)
      VALUES (
        ${title || null},
        ${client_id || null},
        ${project_id || null}
      )
      RETURNING id, started_at, transcription_status
    `
    return res.status(201).json({ id: row.id, started_at: row.started_at })
  } catch (err) {
    logger.error('[Meetings] create failed', { error: err.message })
    return res.status(500).json({ error: 'create_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/chunk - upload a chunk during recording
// Multipart: chunk (file), chunkIndex (int)
// ---------------------------------------------------------------------------
router.post('/:id/chunk', upload.single('chunk'), async (req, res) => {
  const { id } = req.params
  try {
    if (!req.file) return res.status(400).json({ error: 'chunk file required' })

    const chunkIndex = parseInt(req.body.chunkIndex || req.body.chunk_index || '0', 10)
    const buffer = req.file.buffer
    const mimeType = (req.file.mimetype || 'audio/webm').split(';')[0].trim()
    const ext = mimeType.split('/')[1] || 'webm'

    const storagePath = `meetings/${id}/chunks/${chunkIndex}.${ext}`
    const uploaded = await storageUpload({ buffer, path: storagePath, mimeType })

    // Update audio_url on first chunk so we always have a path reference
    if (chunkIndex === 0) {
      await db`
        UPDATE meeting_recordings SET audio_url = ${`meetings/${id}/audio.webm`}
        WHERE id = ${id}::uuid
      `.catch(() => {})
    }

    return res.status(200).json({
      ok: true,
      chunkIndex,
      stored: uploaded !== null,
      path: uploaded,
    })
  } catch (err) {
    logger.error('[Meetings] chunk upload failed', { id, error: err.message })
    return res.status(500).json({ error: 'chunk_upload_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/stop - finalize recording, merge chunks, transcribe
// Body: { duration_seconds? }
// ---------------------------------------------------------------------------
router.post('/:id/stop', async (req, res) => {
  const { id } = req.params
  try {
    const { duration_seconds } = req.body || {}

    // Download and merge chunks
    logger.info('[Meetings] merging chunks', { id })
    const chunks = await downloadChunks(id)

    let audioPath = null
    let audioSize = 0

    if (chunks.length > 0) {
      const merged = Buffer.concat(chunks)
      audioSize = merged.length
      audioPath = await storageUpload({
        buffer: merged,
        path: `meetings/${id}/audio.webm`,
        mimeType: 'audio/webm',
      })
      if (audioPath) {
        // Merged upload succeeded — safe to remove individual chunks
        deleteChunks(id).catch(() => {})
      } else {
        // Upload failed (likely exceeded storage limit for large files).
        // KEEP chunks in storage — runTranscription will fall back to them.
        logger.warn('[Meetings] merged audio upload failed, keeping chunks for transcription fallback', {
          id,
          bytes: audioSize,
        })
      }
    }

    // Idempotent stop: if already processing/retrying/done, return current state without re-running
    const [existing] = await db`
      SELECT transcription_status FROM meeting_recordings WHERE id = ${id}::uuid
    `
    if (['processing', 'retrying', 'done'].includes(existing?.transcription_status)) {
      logger.info('[Meetings] stop called on already-processing/done meeting, ignoring', { id, status: existing.transcription_status })
      return res.status(200).json({
        ok: true,
        merged_chunks: 0,
        audio_bytes: 0,
        transcription_status: existing.transcription_status,
        idempotent: true,
      })
    }

    const hasTranscriptionKey = !!(process.env.OPENAI_API_KEY || process.env.DEEPGRAM_API_KEY)
    const newStatus = (chunks.length > 0 && hasTranscriptionKey) ? 'processing' : 'uploaded_awaiting_transcription'

    await db`
      UPDATE meeting_recordings SET
        ended_at = NOW(),
        duration_seconds = ${duration_seconds || null},
        audio_url = ${audioPath || `meetings/${id}/audio.webm`},
        audio_size_bytes = ${audioSize || null},
        transcription_status = ${newStatus}
      WHERE id = ${id}::uuid
    `

    // Fire async transcription if we have audio + a transcription API key
    if (chunks.length > 0 && hasTranscriptionKey) {
      runTranscription(id).catch(err => {
        logger.error('[Meetings] async transcription error', { id, error: err.message })
      })
    }

    return res.status(200).json({
      ok: true,
      merged_chunks: chunks.length,
      audio_bytes: audioSize,
      transcription_status: newStatus,
    })
  } catch (err) {
    logger.error('[Meetings] stop failed', { id, error: err.message })
    return res.status(500).json({ error: 'stop_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// GET /api/meetings - list recent meetings
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100)
    const offset = parseInt(req.query.offset || '0', 10)
    const rows = await db`
      SELECT
        m.id, m.title, m.started_at, m.ended_at, m.duration_seconds,
        m.transcription_status, m.transcript_text,
        m.client_id, m.project_id, m.created_at,
        c.name AS client_name
      FROM meeting_recordings m
      LEFT JOIN clients c ON c.id = m.client_id
      WHERE m.archived_at IS NULL
      ORDER BY m.started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    const [{ count }] = await db`SELECT COUNT(*)::int AS count FROM meeting_recordings WHERE archived_at IS NULL`
    return res.json({ meetings: rows, total: count, limit, offset })
  } catch (err) {
    logger.error('[Meetings] list failed', { error: err.message })
    return res.status(500).json({ error: 'list_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// GET /api/meetings/:id - get single meeting
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const [row] = await db`
      SELECT
        m.*,
        c.name AS client_name
      FROM meeting_recordings m
      LEFT JOIN clients c ON c.id = m.client_id
      WHERE m.id = ${req.params.id}::uuid AND m.archived_at IS NULL
    `
    if (!row) return res.status(404).json({ error: 'not_found' })

    // Attach signed audio URL if audio exists
    let audio_signed_url = null
    if (row.audio_url) {
      const sb = getSupabase()
      if (sb) {
        const { data } = await sb.storage
          .from('documents')
          .createSignedUrl(row.audio_url, 3600)
        audio_signed_url = data?.signedUrl || null
      }
    }

    return res.json({ ...row, audio_signed_url })
  } catch (err) {
    logger.error('[Meetings] get failed', { id: req.params.id, error: err.message })
    return res.status(500).json({ error: 'get_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/meetings/:id - update title, client_id, project_id
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const { title, client_id, project_id } = req.body || {}
    const [row] = await db`
      UPDATE meeting_recordings SET
        title = COALESCE(${title ?? null}, title),
        client_id = COALESCE(${client_id ?? null}, client_id),
        project_id = COALESCE(${project_id ?? null}, project_id)
      WHERE id = ${req.params.id}::uuid AND archived_at IS NULL
      RETURNING id, title, client_id, project_id, updated_at
    `
    if (!row) return res.status(404).json({ error: 'not_found' })
    return res.json(row)
  } catch (err) {
    logger.error('[Meetings] patch failed', { id: req.params.id, error: err.message })
    return res.status(500).json({ error: 'patch_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/transcribe - manual retrigger (async, fire-and-forget)
// ---------------------------------------------------------------------------
router.post('/:id/transcribe', async (req, res) => {
  const { id } = req.params
  try {
    const [row] = await db`SELECT id, audio_url FROM meeting_recordings WHERE id = ${id}::uuid AND archived_at IS NULL`
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!row.audio_url) return res.status(400).json({ error: 'no_audio_yet' })

    await db`UPDATE meeting_recordings SET transcription_status = 'processing', transcription_error = NULL WHERE id = ${id}::uuid`

    runTranscription(id).catch(err => {
      logger.error('[Meetings] manual transcribe error', { id, error: err.message })
    })

    return res.json({ queued: true })
  } catch (err) {
    logger.error('[Meetings] transcribe route failed', { id, error: err.message })
    return res.status(500).json({ error: 'transcribe_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/retranscribe - async re-run with chunked transcription
//
// Returns 202 immediately after setting status='retrying'.
// Client should poll GET /:id until transcription_status is 'done' or 'error'.
// Uses transcribeWithChunking so large files (e.g. 64-min 59MB WebM) are
// converted to voice-quality MP3 via ffmpeg before the API call — no heap OOM,
// no 25MB API limit hit.
// ---------------------------------------------------------------------------
router.post('/:id/retranscribe', async (req, res) => {
  const { id } = req.params
  try {
    const [row] = await db`
      SELECT id, audio_url, transcription_status
      FROM meeting_recordings WHERE id = ${id}::uuid AND archived_at IS NULL
    `
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (!row.audio_url) return res.status(410).json({ error: 'no_audio', message: 'No audio on record for this meeting.' })

    // Idempotent: already retrying or processing — don't double-queue
    if (row.transcription_status === 'retrying' || row.transcription_status === 'processing') {
      return res.json({ queued: true, status: row.transcription_status, alreadyRunning: true })
    }

    // Set retrying status so FE polling picks it up immediately
    await db`
      UPDATE meeting_recordings SET
        transcription_status = 'retrying',
        transcription_error = NULL,
        transcript_revised_at = NOW()
      WHERE id = ${id}::uuid
    `

    // Fire async — runTranscription handles the chunk fallback + chunked transcription
    runTranscription(id).catch(err => {
      logger.error('[Meetings] retranscribe async error', { id, error: err.message })
    })

    logger.info('[Meetings] retranscription queued', { id })
    return res.status(202).json({ queued: true, status: 'retrying' })
  } catch (err) {
    logger.error('[Meetings] retranscribe route failed', { id, error: err.message })
    return res.status(500).json({ error: 'retranscribe_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/upload-audio
//
// Rescue path for meetings whose live capture was lost.
// Accepts an mp3/m4a/wav/webm from Tate's laptop voice recorder.
// Streams to disk via multer (never buffers 500MB in heap), uploads to
// Supabase Storage, then fires the same transcription pipeline used by
// the live recording path.
//
// Multipart/form-data field: audio (file, max 500 MB)
// Accepted types: audio/* (mp3, m4a, wav, webm, ogg, etc.)
//
// Response 200: { meeting_id, audio_url, transcription_status: 'queued' }
// Response 400: audio field missing
// Response 404: meeting not found / archived
// Response 503: Supabase unavailable
// ---------------------------------------------------------------------------
router.post('/:id/upload-audio', uploadAudioToDisk.single('audio'), async (req, res) => {
  const { id } = req.params
  const tmpPath = req.file?.path
  let compressedPath = null

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'audio_required', message: 'Multipart field "audio" is required.' })
    }

    // Verify meeting row exists and is not archived
    const [row] = await db`
      SELECT id, transcription_status FROM meeting_recordings
      WHERE id = ${id}::uuid AND archived_at IS NULL
    `
    if (!row) {
      return res.status(404).json({ error: 'not_found', message: 'Meeting not found or archived.' })
    }

    const sb = getSupabase()
    if (!sb) {
      return res.status(503).json({ error: 'storage_unavailable', message: 'Supabase client not initialised.' })
    }

    // Derive extension from original filename or mime type
    const origExt = path.extname(req.file.originalname || '').toLowerCase().replace(/^\./, '')
    const mimeExt = (req.file.mimetype || 'audio/mpeg').split('/')[1]?.split(';')[0] || 'mp3'
    const ext = origExt || mimeExt || 'mp3'
    const ts = Date.now()
    const mimeType = (req.file.mimetype || 'audio/mpeg').split(';')[0].trim()

    // Read temp file and upload to Supabase Storage.
    // The temp file is already on disk (multer wrote it), so this avoids a second
    // large in-memory copy. The transcription pipeline will download + ffmpeg-compress
    // the file (transcribeWithChunking handles any size via disk + ffmpeg).
    const fileBuffer = await fs.promises.readFile(tmpPath)

    // For large files (>50MB), compress to voice-quality MP3 before storage upload.
    // A 165MB 128kbps MP3 compresses to ~41MB at 16kHz/32kbps - well under limits.
    let uploadBuffer = fileBuffer
    let uploadMime = mimeType
    let uploadExt = ext
    const COMPRESS_THRESHOLD = 50 * 1024 * 1024 // 50 MB

    if (fileBuffer.length > COMPRESS_THRESHOLD) {
      logger.info('[Meetings] upload-audio: large file, compressing to voice MP3', {
        id, originalBytes: fileBuffer.length,
      })
      try {
        const { compressToVoiceMp3 } = require('../services/transcriptionService')
        // Write buffer to a separate temp file for ffmpeg input
        const ffmpegIn = path.join(os.tmpdir(), `mtg-raw-${Date.now()}${path.extname(tmpPath)}`)
        await fs.promises.writeFile(ffmpegIn, fileBuffer)
        compressedPath = await compressToVoiceMp3(ffmpegIn)
        await fs.promises.unlink(ffmpegIn).catch(() => {})
        uploadBuffer = await fs.promises.readFile(compressedPath)
        uploadMime = 'audio/mpeg'
        uploadExt = 'mp3'
        logger.info('[Meetings] upload-audio: compressed', {
          id, compressedBytes: uploadBuffer.length,
          ratio: `${Math.round(uploadBuffer.length / fileBuffer.length * 100)}%`,
        })
      } catch (compressErr) {
        logger.warn('[Meetings] upload-audio: compression failed, uploading raw', {
          id, error: compressErr.message,
        })
        // Fall through with original buffer - transcribeWithChunking handles it
      }
    }

    const storagePath = `meetings/${id}/uploaded-${ts}.${uploadExt}`

    logger.info('[Meetings] upload-audio: uploading to storage', {
      id,
      storagePath,
      bytes: uploadBuffer.length,
      mimeType: uploadMime,
    })

    const { error: uploadErr } = await sb.storage
      .from('documents')
      .upload(storagePath, uploadBuffer, { contentType: uploadMime, upsert: true })

    if (uploadErr) {
      logger.error('[Meetings] upload-audio: storage upload failed', { id, error: uploadErr.message })
      return res.status(500).json({ error: 'storage_upload_failed', detail: uploadErr.message })
    }

    // Update meeting row. Upload always wins — supersedes any previous audio_url
    // (live capture, 410 chunk, or partial bad-quality file).
    await db`
      UPDATE meeting_recordings SET
        audio_url          = ${storagePath},
        audio_source       = 'uploaded',
        audio_uploaded_at  = NOW(),
        audio_size_bytes   = ${fileBuffer.length},
        transcription_status = 'processing',
        transcription_error  = NULL
      WHERE id = ${id}::uuid
    `

    // Fire async transcription — same pipeline as live recordings.
    // runTranscription() reads audio_url from DB, so it will pick up storagePath.
    runTranscription(id).catch(err => {
      logger.error('[Meetings] upload-audio: transcription error', { id, error: err.message })
    })

    logger.info('[Meetings] upload-audio: complete, transcription queued', {
      id,
      storagePath,
      bytes: fileBuffer.length,
    })

    return res.json({
      meeting_id: id,
      audio_url: storagePath,
      transcription_status: 'queued',
    })
  } catch (err) {
    logger.error('[Meetings] upload-audio: failed', { id, error: err.message })
    return res.status(500).json({ error: 'upload_failed', detail: err.message })
  } finally {
    // Always clean up the temp file multer wrote to disk
    if (tmpPath) {
      fs.promises.unlink(tmpPath).catch(() => {})
    }
    if (compressedPath) fs.promises.unlink(compressedPath).catch(() => {})
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/meetings/:id/transcript - save hand-edited transcript
// Body: { transcript_text: string }
// ---------------------------------------------------------------------------
router.patch('/:id/transcript', async (req, res) => {
  const { id } = req.params
  try {
    const { transcript_text } = req.body || {}
    if (typeof transcript_text !== 'string') {
      return res.status(400).json({ error: 'transcript_text_required', message: 'Body must include transcript_text string.' })
    }

    const [updated] = await db`
      UPDATE meeting_recordings SET
        transcript_text = ${transcript_text},
        transcription_status = 'done',
        transcript_edited_at = NOW(),
        transcript_edited_by = 'tate'
      WHERE id = ${id}::uuid AND archived_at IS NULL
      RETURNING transcript_text, transcript_edited_at, transcript_edited_by
    `
    if (!updated) return res.status(404).json({ error: 'not_found' })

    return res.json({
      transcript_text: updated.transcript_text,
      transcript_edited_at: updated.transcript_edited_at,
      transcript_edited_by: updated.transcript_edited_by,
    })
  } catch (err) {
    logger.error('[Meetings] transcript patch failed', { id, error: err.message })
    return res.status(500).json({ error: 'transcript_patch_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/meetings/:id/speakers - save speaker name overrides
// Body: { speakers: { "A": "Tate", "B": "Angelica" } }
// ---------------------------------------------------------------------------
router.patch('/:id/speakers', async (req, res) => {
  const { id } = req.params
  try {
    const { speakers } = req.body || {}
    if (!speakers || typeof speakers !== 'object' || Array.isArray(speakers)) {
      return res.status(400).json({ error: 'speakers_required', message: 'Body must include speakers object e.g. {"A":"Tate","B":"Angelica"}' })
    }
    // Sanitise: only single uppercase letter keys, string values
    const clean = {}
    for (const [k, v] of Object.entries(speakers)) {
      if (/^[A-Z]$/.test(k) && typeof v === 'string' && v.trim().length > 0) {
        clean[k] = v.trim().slice(0, 50)
      }
    }
    const [updated] = await db`
      UPDATE meeting_recordings SET
        speaker_names = ${JSON.stringify(clean)}::jsonb
      WHERE id = ${id}::uuid AND archived_at IS NULL
      RETURNING speaker_names
    `
    if (!updated) return res.status(404).json({ error: 'not_found' })
    return res.json({ speaker_names: updated.speaker_names })
  } catch (err) {
    logger.error('[Meetings] speakers patch failed', { id, error: err.message })
    return res.status(500).json({ error: 'speakers_patch_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// GET /api/meetings/:id/export - download transcript as markdown script
// Query: ?format=md (default) or ?format=txt
// ---------------------------------------------------------------------------
router.get('/:id/export', async (req, res) => {
  const { id } = req.params
  const fmt = req.query.format === 'txt' ? 'txt' : 'md'
  try {
    const [row] = await db`
      SELECT m.title, m.started_at, m.duration_seconds,
             m.transcript_text, m.transcript_json, m.speaker_names,
             m.transcript_diarised
      FROM meeting_recordings m
      WHERE m.id = ${id}::uuid AND m.archived_at IS NULL
    `
    if (!row) return res.status(404).json({ error: 'not_found' })

    const speakerNames = row.speaker_names || {}
    const label = (code) => speakerNames[code] || (code ? `Speaker ${code}` : 'Speaker')
    const ts = (ms) => {
      if (!ms) return '0:00'
      const s = Math.floor(ms / 1000)
      const m = Math.floor(s / 60)
      const sec = s % 60
      return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const title = row.title || `Meeting ${new Date(row.started_at).toLocaleDateString('en-AU')}`
    const dateStr = new Date(row.started_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })

    let body = ''
    const transcript = row.transcript_json

    if (transcript?.diarised && transcript?.paragraphs?.length > 0) {
      // Script format
      body = transcript.paragraphs.map(p => {
        const spkLine = fmt === 'md'
          ? `**${label(p.speaker)}** *(${ts(p.start_ms)} - ${ts(p.end_ms)})*`
          : `${label(p.speaker)} (${ts(p.start_ms)} - ${ts(p.end_ms)})`
        return `${spkLine}\n  ${p.text}`
      }).join('\n\n')
    } else {
      // Plain text fallback
      body = row.transcript_text || '(no transcript)'
    }

    const header = fmt === 'md'
      ? `# ${title}\n\n*${dateStr}*\n\n---\n\n`
      : `${title}\n${dateStr}\n${'='.repeat(title.length)}\n\n`

    const content = header + body
    const filename = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-transcript.${fmt}`

    res.setHeader('Content-Type', fmt === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(content)
  } catch (err) {
    logger.error('[Meetings] export failed', { id, error: err.message })
    return res.status(500).json({ error: 'export_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/meetings/:id - soft delete
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    await db`UPDATE meeting_recordings SET archived_at = NOW() WHERE id = ${req.params.id}::uuid`
    return res.json({ archived: true })
  } catch (err) {
    logger.error('[Meetings] delete failed', { id: req.params.id, error: err.message })
    return res.status(500).json({ error: 'delete_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// GET /api/meetings/:id/analysis - get analysis + action items bundle
// ---------------------------------------------------------------------------
router.get('/:id/analysis', async (req, res) => {
  try {
    const [row] = await db`
      SELECT id, title, started_at, duration_seconds,
             analysis_status, analysis_json, action_items_json,
             analysis_started_at, analysis_completed_at, analysis_error,
             transcript_text, transcript_diarised, transcript_engine
      FROM meeting_recordings
      WHERE id = ${req.params.id}::uuid AND archived_at IS NULL
    `
    if (!row) return res.status(404).json({ error: 'not_found' })
    return res.json({
      meeting_id: row.id,
      title: row.title,
      started_at: row.started_at,
      duration_seconds: row.duration_seconds,
      analysis_status: row.analysis_status,
      analysis: row.analysis_json,
      action_items: row.action_items_json,
      analysis_started_at: row.analysis_started_at,
      analysis_completed_at: row.analysis_completed_at,
      analysis_error: row.analysis_error,
      transcript_engine: row.transcript_engine,
      transcript_diarised: row.transcript_diarised,
    })
  } catch (err) {
    logger.error('[Meetings] analysis get failed', { id: req.params.id, error: err.message })
    return res.status(500).json({ error: 'analysis_get_failed', detail: err.message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/meetings/:id/analyze - manually trigger / re-trigger analysis
// Body: optional { force: true } to re-run even if status='done'
// ---------------------------------------------------------------------------
router.post('/:id/analyze', async (req, res) => {
  const { id } = req.params
  const { force } = req.body || {}
  try {
    const [row] = await db`
      SELECT id, transcription_status, analysis_status, transcript_text
      FROM meeting_recordings WHERE id = ${id}::uuid AND archived_at IS NULL
    `
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.transcription_status !== 'done') {
      return res.status(409).json({
        error: 'transcription_not_done',
        message: `Transcription must complete before analysis. Current status: ${row.transcription_status}`,
      })
    }
    if (!row.transcript_text || row.transcript_text.length < 50) {
      return res.status(400).json({ error: 'transcript_too_short', message: 'No usable transcript for analysis.' })
    }
    if (row.analysis_status === 'processing' && !force) {
      return res.status(409).json({ error: 'already_processing', message: 'Analysis already running. Pass force:true to restart.' })
    }

    // Fire async
    runAnalysis(id, db).catch(err => {
      logger.error('[Meetings] manual analyze error', { id, error: err.message })
    })

    return res.status(202).json({ queued: true, meeting_id: id })
  } catch (err) {
    logger.error('[Meetings] analyze route failed', { id, error: err.message })
    return res.status(500).json({ error: 'analyze_failed', detail: err.message })
  }
})

module.exports = router

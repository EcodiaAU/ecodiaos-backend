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
const logger = require('../config/logger')
const db = require('../config/db')
const { transcribeChunk } = require('../services/voiceTranscription')

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per chunk
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
// Async transcription pipeline - runs after stop, does not block response
// ---------------------------------------------------------------------------
async function runTranscription(meetingId) {
  try {
    // Download merged audio
    const sb = getSupabase()
    if (!sb) throw new Error('no supabase client')

    const { data, error } = await sb.storage
      .from('documents')
      .download(`meetings/${meetingId}/audio.webm`)

    if (error || !data) throw new Error(`audio download failed: ${error?.message}`)

    const ab = await data.arrayBuffer()
    const buffer = Buffer.from(ab)

    if (!buffer.length) throw new Error('empty audio buffer')

    logger.info('[Meetings] transcribing', { meetingId, bytes: buffer.length })

    const text = await transcribeChunk({
      buffer,
      mimeType: 'audio/webm',
      filename: 'meeting.webm',
    })

    // Store transcript text
    const transcriptPath = `meetings/${meetingId}/transcript.txt`
    await storageUpload({
      buffer: Buffer.from(text || '', 'utf8'),
      path: transcriptPath,
      mimeType: 'text/plain',
    })

    await db`
      UPDATE meeting_recordings SET
        transcript_text = ${text || ''},
        transcript_url = ${transcriptPath},
        transcription_status = 'done',
        transcription_error = NULL
      WHERE id = ${meetingId}::uuid
    `
    logger.info('[Meetings] transcription done', { meetingId, chars: (text || '').length })
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
      // Clean up chunk objects
      deleteChunks(id).catch(() => {})
    }

    const hasOpenAI = !!process.env.OPENAI_API_KEY
    const newStatus = (chunks.length > 0 && hasOpenAI) ? 'processing' : 'uploaded_awaiting_transcription'

    await db`
      UPDATE meeting_recordings SET
        ended_at = NOW(),
        duration_seconds = ${duration_seconds || null},
        audio_url = ${audioPath || `meetings/${id}/audio.webm`},
        audio_size_bytes = ${audioSize || null},
        transcription_status = ${newStatus}
      WHERE id = ${id}::uuid
    `

    // Fire async transcription if we have audio + API key
    if (chunks.length > 0 && hasOpenAI) {
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
// POST /api/meetings/:id/transcribe - manual retrigger
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

module.exports = router

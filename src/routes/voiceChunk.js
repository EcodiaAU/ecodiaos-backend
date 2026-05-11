/**
 * voiceChunk.js - POST /api/voice/chunk - browser/laptop client uploads
 * a short audio blob (1-15s of speech), we transcribe via Whisper, drop
 * Whisper-hallucinated noise, persist the chunk row (with audio retained
 * in Supabase Storage), and append the surviving text to a per-session
 * buffer that ships to the conductor chat in coalesced bursts.
 *
 * Authored by fork_mownezy2_77bebd (W2 of the voice-brainstorm pipeline).
 * Enriched by fork_mp1tkua0_bd9165 (voice transcript substrate):
 *   - audio chunks stored in voice-chunks Supabase Storage bucket
 *   - model, language, source, started_at/ended_at, audio_storage_path
 *     all persisted on every row for future theme-extraction and
 *     re-transcription with better models.
 *
 * Storage: voice-chunks/<YYYY-MM-DD>/<session_id>/<seq>.<ext>
 * Bucket:  voice-chunks (private, service_role access only)
 *
 * Sister deliverables:
 *   - W1: voice_transcript_chunks table migration (095 + 098 enrichment).
 *   - W2: this route + services/voiceTranscription.js + services/voiceBuffer.js.
 *
 * The route is intentionally permissive on transient failures: any
 * Whisper / DB / storage error is caught and surfaced as JSON, never
 * propagates as an unhandled rejection that could crash ecodia-api.
 * Storage upload failure specifically is best-effort - the text transcript
 * always lands even if the audio file does not.
 */
const express = require('express')
const multer = require('multer')

const logger = require('../config/logger')
const env = require('../config/env')
const db = require('../config/db')
const { transcribeChunk } = require('../services/voiceTranscription')
const voiceBuffer = require('../services/voiceBuffer')

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// ---------------------------------------------------------------------------
// Lazy Supabase client for storage uploads (service_role, private bucket).
// Same pattern as documents.js.
// ---------------------------------------------------------------------------
let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY)) return null
  const { createClient } = require('@supabase/supabase-js')
  _supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY,
  )
  return _supabase
}

// ---------------------------------------------------------------------------
// Upload a raw audio buffer to the voice-chunks private bucket.
// Returns the storage path on success, null on failure (best-effort).
// Path: voice-chunks/<YYYY-MM-DD>/<session_id>/<seq>.<ext>
// Idempotent: upsert: true overwrites safely on retry.
// ---------------------------------------------------------------------------
async function uploadAudioChunk({ buffer, mimeType, sessionId, seq }) {
  const sb = getSupabase()
  if (!sb || !buffer || !buffer.length) return null

  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim()
  const ext = cleanMime.split('/')[1] || 'webm'
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const storagePath = `${date}/${sessionId}/${seq}.${ext}`

  try {
    const { error } = await sb.storage
      .from('voice-chunks')
      .upload(storagePath, buffer, {
        contentType: cleanMime,
        upsert: true,
      })
    if (error) {
      logger.warn('[VoiceChunk] storage upload failed', {
        sessionId,
        seq,
        error: error.message,
      })
      return null
    }
    return storagePath
  } catch (err) {
    logger.warn('[VoiceChunk] storage upload threw', {
      sessionId,
      seq,
      error: err.message,
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Hallucination filter - Whisper returns these on near-silent inputs.
// Drop before polluting the conductor's chat or the transcript store.
// ---------------------------------------------------------------------------
const HALLUCINATION_DROPS = new Set([
  '',
  '.',
  '..',
  '...',
  'thanks.',
  'thank you.',
  'thanks for watching.',
  'thanks for watching!',
  'you',
  'thank you for watching.',
  'bye.',
  'thanks!',
  'thank you!',
  'okay.',
  'ok.',
])

function isHallucination(text) {
  const cleaned = (text || '').trim()
  if (!cleaned) return true
  if (cleaned.length < 4) return true
  return HALLUCINATION_DROPS.has(cleaned.toLowerCase())
}

// ---------------------------------------------------------------------------
// POST /api/voice/chunk
//
// Multipart form fields:
//   audio        - audio blob (required)
//   session_id   - UUID string correlating chunks from one recording (required)
//   seq          - integer sequence number within the session (required)
//   duration_ms  - chunk duration in milliseconds (optional, improves timing)
//   source       - 'voice-page' | 'chat-page' (optional, defaults 'voice-page')
//   timestamp    - ISO8601 of chunk end time on client (optional)
// ---------------------------------------------------------------------------
router.post('/api/voice/chunk', upload.single('audio'), async (req, res) => {
  const chunkStartedAt = new Date()

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'no audio' })
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OPENAI_API_KEY missing' })
    }

    const sessionId = (req.body.session_id || '').trim()
    const seqRaw = req.body.seq
    const durationMsRaw = req.body.duration_ms
    const source = (req.body.source || 'voice-page').trim()
    // client timestamp of when the chunk ended (optional, best-effort)
    const clientTimestamp = req.body.timestamp || null

    if (!sessionId) {
      return res.status(400).json({ error: 'session_id required' })
    }
    const seq = Number.parseInt(seqRaw, 10)
    if (!Number.isFinite(seq)) {
      return res.status(400).json({ error: 'seq required (integer)' })
    }

    const buffer = req.file.buffer
    const mimeType = req.file.mimetype || 'audio/webm'
    const filename = req.file.originalname || `chunk-${seq}.webm`
    const audioBytes = buffer ? buffer.length : 0

    const durationMs = durationMsRaw ? Number.parseInt(durationMsRaw, 10) : null
    const endedAt = new Date()
    // started_at: subtract known duration if client provided it, else
    // use the time this handler was entered (server-side approximation).
    const startedAt = (durationMs && Number.isFinite(durationMs))
      ? new Date(endedAt.getTime() - durationMs)
      : chunkStartedAt

    // 1. Transcribe
    let text = ''
    try {
      text = await transcribeChunk({ buffer, mimeType, filename })
    } catch (err) {
      logger.error('[VoiceChunk] whisper failed', {
        sessionId,
        seq,
        error: err.message,
      })
      return res.status(502).json({ error: 'whisper failed', detail: err.message })
    }

    // 2. Upload audio to storage (best-effort, non-blocking on failure)
    const storagePath = await uploadAudioChunk({ buffer, mimeType, sessionId, seq })

    const isDropped = isHallucination(text)

    // 3. Persist chunk row with all enrichment fields
    try {
      await db`
        INSERT INTO voice_transcript_chunks (
          session_id,
          seq,
          audio_bytes,
          mime_type,
          transcribed_text,
          dropped,
          drop_reason,
          duration_ms,
          model,
          language,
          source,
          audio_storage_path,
          started_at,
          ended_at
        ) VALUES (
          ${sessionId}::uuid,
          ${seq},
          ${audioBytes},
          ${mimeType},
          ${text || ''},
          ${isDropped},
          ${isDropped ? 'empty_or_noise' : null},
          ${Number.isFinite(durationMs) ? durationMs : null},
          ${'whisper-1'},
          ${'en'},
          ${source},
          ${storagePath},
          ${startedAt.toISOString()},
          ${endedAt.toISOString()}
        )
      `
    } catch (err) {
      // Row failing to land is unfortunate but not fatal - still forward the
      // text so Tate's stream of thought doesn't disappear. Log loudly.
      logger.error('[VoiceChunk] insert row failed', {
        sessionId,
        seq,
        storagePath,
        error: err.message,
      })
    }

    if (isDropped) {
      return res.status(200).json({ ok: true, dropped: true, reason: 'empty_or_noise' })
    }

    const cleanedText = text.trim()

    // 4. Fire-and-forget into the buffer; the buffer manages its own
    // timers and POSTs to /api/os-session/message in coalesced bursts.
    voiceBuffer.appendAndMaybeFlush(sessionId, cleanedText).catch((err) => {
      logger.error('[VoiceChunk] buffer append failed', {
        sessionId,
        seq,
        error: err.message,
      })
    })

    return res.status(200).json({
      ok: true,
      dropped: false,
      text: cleanedText,
      stored: storagePath !== null,
      storage_path: storagePath,
    })
  } catch (err) {
    logger.error('[VoiceChunk] handler crashed', {
      error: err.message,
      stack: err.stack,
    })
    if (!res.headersSent) {
      return res.status(500).json({ error: 'voice_chunk_internal', detail: err.message })
    }
  }
})

module.exports = router

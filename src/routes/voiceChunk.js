/**
 * voiceChunk.js - POST /api/voice/chunk - browser/laptop client uploads
 * a short audio blob (1-15s of speech), we transcribe via Whisper, drop
 * Whisper-hallucinated noise, persist the chunk row, and append the
 * surviving text to a per-session buffer that ships to the conductor
 * chat in coalesced bursts.
 *
 * Authored by fork_mownezy2_77bebd (W2 of the voice-brainstorm pipeline).
 * Sister deliverables:
 *   - W1: voice_transcript_chunks table migration (parallel fork).
 *   - W2: this route + services/voiceTranscription.js + services/voiceBuffer.js.
 *
 * The route is intentionally permissive on transient failures: any
 * Whisper / DB / fetch error is caught and surfaced as JSON, never
 * propagates as an unhandled rejection that could crash ecodia-api.
 */
const express = require('express')
const multer = require('multer')

const logger = require('../config/logger')
const db = require('../config/db')
const { transcribeChunk } = require('../services/voiceTranscription')
const voiceBuffer = require('../services/voiceBuffer')

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// Whisper hallucinates a small set of stock phrases on near-silent
// inputs. Drop them before they pollute the conductor's chat. All
// comparisons are trim+lowercase against the fully-trimmed text.
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

router.post('/api/voice/chunk', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'no audio' })
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OPENAI_API_KEY missing' })
    }

    const sessionId = (req.body.session_id || '').trim()
    const seqRaw = req.body.seq
    const timestamp = req.body.timestamp || null

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

    if (isHallucination(text)) {
      try {
        await db`
          INSERT INTO voice_transcript_chunks
            (session_id, seq, audio_bytes, mime_type, transcribed_text, dropped, drop_reason)
          VALUES
            (${sessionId}, ${seq}, ${audioBytes}, ${mimeType}, ${text || ''}, true, 'empty_or_noise')
        `
      } catch (err) {
        logger.error('[VoiceChunk] insert dropped row failed', {
          sessionId,
          seq,
          error: err.message,
        })
      }
      return res.status(200).json({ ok: true, dropped: true, reason: 'empty_or_noise' })
    }

    const cleanedText = text.trim()
    try {
      await db`
        INSERT INTO voice_transcript_chunks
          (session_id, seq, audio_bytes, mime_type, transcribed_text, dropped)
        VALUES
          (${sessionId}, ${seq}, ${audioBytes}, ${mimeType}, ${cleanedText}, false)
      `
    } catch (err) {
      // The row failing to land is unfortunate but not fatal; we still
      // forward the text to the conductor so Tate's stream of thought
      // doesn't disappear. Log loudly.
      logger.error('[VoiceChunk] insert row failed', {
        sessionId,
        seq,
        error: err.message,
      })
    }

    // Fire-and-forget into the buffer; the buffer manages its own
    // timers and POSTs to /api/os-session/message in coalesced bursts.
    voiceBuffer.appendAndMaybeFlush(sessionId, cleanedText).catch((err) => {
      logger.error('[VoiceChunk] buffer append failed', {
        sessionId,
        seq,
        error: err.message,
      })
    })

    return res.status(200).json({ ok: true, dropped: false, text: cleanedText })
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

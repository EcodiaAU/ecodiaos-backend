/**
 * voiceTools.js — REST surface for Deepgram capabilities.
 *
 * Mounted at /api/voice/* (in addition to /api/voice/incoming + /api/voice/relay
 * which are Twilio-specific in voiceRelay.js).
 *
 * These endpoints let the conductor, forks, Cortex, MCP shims, and the FE
 * reach into Deepgram on demand without each caller having to know the SDK:
 *
 *   POST /api/voice/transcribe       multipart audio file → diarised transcript
 *   POST /api/voice/transcribe-url   { url }              → diarised transcript
 *   POST /api/voice/synthesize       { text, voice? }     → { audio_url } (Storage upload)
 *   POST /api/voice/live-session     { context_label? }   → { ws_url } ephemeral
 *   GET  /api/voice/voices                                → voice catalogue
 *
 * Authored: 12 May 2026.
 */
'use strict'

const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const router = express.Router()

const logger = require('../config/logger')
const { transcribeAudio } = require('../services/transcriptionService')
const { synthesizeBuffer, AURA2_VOICES } = require('../services/deepgramVoiceService')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

// ── Lazy Supabase (for audio_url uploads) ─────────────────────────────────
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

// ── POST /api/voice/transcribe — multipart audio in, transcript out ───────
router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required' })
    const result = await transcribeAudio({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      filename: req.file.originalname,
    })
    return res.json(result)
  } catch (err) {
    logger.error('[VoiceTools] transcribe failed', { error: err.message })
    return res.status(500).json({ error: 'transcribe_failed', detail: err.message })
  }
})

// ── POST /api/voice/transcribe-url — download URL, transcribe ─────────────
router.post('/transcribe-url', async (req, res) => {
  try {
    const { url, mime_type } = req.body || {}
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url_required' })

    const dl = await fetch(url)
    if (!dl.ok) return res.status(502).json({ error: 'download_failed', status: dl.status })
    const ab = await dl.arrayBuffer()
    const buffer = Buffer.from(ab)
    const inferredMime = mime_type || dl.headers.get('content-type') || 'audio/mpeg'

    const result = await transcribeAudio({
      buffer,
      mimeType: inferredMime,
      filename: url.split('/').pop() || 'remote.audio',
    })
    return res.json(result)
  } catch (err) {
    logger.error('[VoiceTools] transcribe-url failed', { error: err.message })
    return res.status(500).json({ error: 'transcribe_url_failed', detail: err.message })
  }
})

// ── POST /api/voice/synthesize — text → Aura-2 WAV uploaded to Storage ────
router.post('/synthesize', async (req, res) => {
  try {
    const { text, voice, format } = req.body || {}
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text_required' })
    if (text.length > 8000) return res.status(413).json({ error: 'text_too_long', max: 8000 })

    const voiceModel = (voice && AURA2_VOICES[voice]) || (typeof voice === 'string' && voice.startsWith('aura-')
      ? voice
      : AURA2_VOICES.thalia)

    // Default: 24kHz linear16 WAV (browser-friendly).
    const wantMp3 = format === 'mp3'
    const audioBuffer = await synthesizeBuffer({
      text,
      voice: voiceModel,
      encoding: wantMp3 ? 'mp3' : 'linear16',
      sample_rate: 24000,
      container: wantMp3 ? 'none' : 'wav',
    })

    const sb = getSupabase()
    if (!sb) {
      // No storage configured — return base64 inline as a fallback
      return res.json({
        audio_base64: audioBuffer.toString('base64'),
        mime: wantMp3 ? 'audio/mpeg' : 'audio/wav',
        voice: voiceModel,
        bytes: audioBuffer.length,
      })
    }

    const ext = wantMp3 ? 'mp3' : 'wav'
    const mime = wantMp3 ? 'audio/mpeg' : 'audio/wav'
    const slug = crypto.randomBytes(6).toString('hex')
    const storagePath = `voice/synth/${new Date().toISOString().slice(0, 10)}/${slug}.${ext}`

    const { error: upErr } = await sb.storage
      .from('documents')
      .upload(storagePath, audioBuffer, { contentType: mime, upsert: false })
    if (upErr) {
      logger.error('[VoiceTools] synth upload failed', { error: upErr.message })
      return res.status(500).json({ error: 'storage_upload_failed', detail: upErr.message })
    }

    const { data: pub } = sb.storage.from('documents').getPublicUrl(storagePath)
    return res.json({
      audio_url: pub?.publicUrl || null,
      path: storagePath,
      voice: voiceModel,
      mime,
      bytes: audioBuffer.length,
    })
  } catch (err) {
    logger.error('[VoiceTools] synthesize failed', { error: err.message })
    return res.status(500).json({ error: 'synthesize_failed', detail: err.message })
  }
})

// ── POST /api/voice/live-session — return WS URL for browser-side STT ─────
//
// The FE can open this to spin up a transient meeting-style live STT session
// without creating a meeting_recordings row externally. Use for ad-hoc
// dictation, browser-based Cortex voice input, demos.
router.post('/live-session', async (req, res) => {
  try {
    const wsHost = process.env.API_DOMAIN || 'api.admin.ecodia.au'
    const db = require('../config/db')
    const [row] = await db`
      INSERT INTO meeting_recordings (title, transcription_status, analysis_status, live_started_at)
      VALUES (
        ${req.body?.context_label || 'live-session'},
        'live',
        'skipped',
        NOW()
      )
      RETURNING id
    `
    return res.json({
      session_id: row.id,
      ws_url: `wss://${wsHost}/api/meetings/${row.id}/live`,
      voices: Object.keys(AURA2_VOICES),
    })
  } catch (err) {
    logger.error('[VoiceTools] live-session failed', { error: err.message })
    return res.status(500).json({ error: 'live_session_failed', detail: err.message })
  }
})

// ── GET /api/voice/voices — voice catalogue ───────────────────────────────
router.get('/voices', (_req, res) => {
  res.json({
    voices: Object.entries(AURA2_VOICES).map(([key, model]) => ({ key, model })),
    default: 'thalia',
  })
})

module.exports = router

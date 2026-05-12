/**
 * deepgramVoiceService.js — single Deepgram surface for realtime voice.
 *
 * Three primitives used by voiceRelay.js, meetings live, and the voiceTools
 * REST surface:
 *
 *   openSTTStream({ encoding, sample_rate, model, language, diarize,
 *                   interim_results, endpointing, on... }) → handle
 *   synthesizeStream({ text, voice, encoding, sample_rate, container }) → ReadableStream
 *   synthesizeBuffer({ text, voice, encoding, sample_rate, container }) → Buffer
 *
 * Brain stays on Max — this service does NOT call any LLM. STT goes in,
 * text comes out; text goes in, audio comes out. The Haiku/Opus loop in
 * voiceRelay.js is the orchestrator.
 *
 * Key resolution: env DEEPGRAM_API_KEY first, then kv_store.creds.deepgram_api_key
 * (mirrors transcriptionService.js cache pattern, 5min TTL).
 *
 * Authored: 12 May 2026.
 */
'use strict'

const WebSocket = require('ws')
const logger = require('../config/logger')

// ─── Shared key cache (mirrors transcriptionService.js) ──────────────────────

let _deepgramKey = null
let _deepgramKeyCheckedAt = 0
const DEEPGRAM_KEY_TTL_MS = 5 * 60 * 1000

async function getDeepgramKey() {
  if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY
  if (_deepgramKey && Date.now() - _deepgramKeyCheckedAt < DEEPGRAM_KEY_TTL_MS) {
    return _deepgramKey
  }
  try {
    const db = require('../config/db')
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.deepgram_api_key' LIMIT 1`
    if (rows.length > 0) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
      _deepgramKey = parsed?.value || parsed?.api_key || null
      _deepgramKeyCheckedAt = Date.now()
      return _deepgramKey
    }
  } catch (err) {
    logger.warn('[DeepgramVoice] kv_store key lookup failed', { error: err.message })
  }
  _deepgramKey = null
  _deepgramKeyCheckedAt = Date.now()
  return null
}

// ─── Live STT — opens Deepgram Listen v1 WSS ─────────────────────────────────

const DG_LISTEN_WSS = 'wss://api.deepgram.com/v1/listen'

/**
 * Opens a Deepgram streaming WSS. Returns a handle:
 *
 *   handle.sendAudio(Buffer)   — push a raw audio frame upstream
 *   handle.finalize()          — request Deepgram flush remaining audio
 *   handle.close()             — tear down
 *   handle.isOpen              — boolean
 *
 * Callbacks (all optional):
 *   onOpen()
 *   onTranscript({ transcript, is_final, speech_final, speaker, words, raw })
 *   onSpeechStarted()           — user started speaking (barge-in trigger)
 *   onUtteranceEnd()            — Deepgram detected end of utterance
 *   onError(err)
 *   onClose(code, reason)
 *
 * Common parameter sets:
 *   Twilio phone call:  { encoding: 'mulaw', sample_rate: 8000, model: 'nova-3-phonecall' }
 *   Browser mic:        { encoding: 'linear16', sample_rate: 16000, model: 'nova-3' }
 *   Pre-recorded WebM:  use transcriptionService instead (HTTP, not WSS).
 */
async function openSTTStream(opts = {}) {
  const {
    encoding = 'mulaw',
    sample_rate = 8000,
    model = 'nova-3',
    language = 'en',
    diarize = false,
    interim_results = true,
    endpointing = 300,
    smart_format = true,
    punctuate = true,
    utterance_end_ms = 1000,
    vad_events = true,
    channels = 1,
    onOpen,
    onTranscript,
    onSpeechStarted,
    onUtteranceEnd,
    onError,
    onClose,
  } = opts

  const apiKey = await getDeepgramKey()
  if (!apiKey) throw new Error('Deepgram API key not provisioned (env or kv_store)')

  const params = new URLSearchParams({
    encoding,
    sample_rate: String(sample_rate),
    model,
    language,
    interim_results: String(interim_results),
    smart_format: String(smart_format),
    punctuate: String(punctuate),
    endpointing: String(endpointing),
    utterance_end_ms: String(utterance_end_ms),
    vad_events: String(vad_events),
    channels: String(channels),
  })
  if (diarize) params.set('diarize', 'true')

  const url = `${DG_LISTEN_WSS}?${params.toString()}`
  const ws = new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  })

  let isOpen = false
  let keepAliveTimer = null

  ws.on('open', () => {
    isOpen = true
    // Deepgram drops idle WSS after ~12s if no audio is sent — keep alive every 8s
    keepAliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'KeepAlive' })) } catch {}
      }
    }, 8000)
    try { onOpen && onOpen() } catch (err) {
      logger.warn('[DeepgramVoice] onOpen threw', { error: err.message })
    }
  })

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    if (msg.type === 'Results') {
      const alt = msg.channel?.alternatives?.[0]
      if (!alt) return
      const transcript = alt.transcript || ''
      if (!transcript && !msg.speech_final) return
      const speaker = alt.words?.[0]?.speaker
      try {
        onTranscript && onTranscript({
          transcript,
          is_final: !!msg.is_final,
          speech_final: !!msg.speech_final,
          speaker: speaker != null ? String.fromCharCode(65 + Math.min(speaker, 25)) : null,
          words: alt.words || [],
          start_ms: Math.round((msg.start || 0) * 1000),
          duration_ms: Math.round((msg.duration || 0) * 1000),
          raw: msg,
        })
      } catch (err) {
        logger.warn('[DeepgramVoice] onTranscript threw', { error: err.message })
      }
    } else if (msg.type === 'SpeechStarted') {
      try { onSpeechStarted && onSpeechStarted() } catch (err) {
        logger.warn('[DeepgramVoice] onSpeechStarted threw', { error: err.message })
      }
    } else if (msg.type === 'UtteranceEnd') {
      try { onUtteranceEnd && onUtteranceEnd() } catch (err) {
        logger.warn('[DeepgramVoice] onUtteranceEnd threw', { error: err.message })
      }
    } else if (msg.type === 'Metadata') {
      logger.info('[DeepgramVoice] STT session', { request_id: msg.request_id })
    }
  })

  ws.on('error', (err) => {
    logger.error('[DeepgramVoice] STT WSS error', { error: err.message })
    try { onError && onError(err) } catch {}
  })

  ws.on('close', (code, reason) => {
    isOpen = false
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
    const reasonStr = reason?.toString() || ''
    logger.info('[DeepgramVoice] STT WSS closed', { code, reason: reasonStr })
    try { onClose && onClose(code, reasonStr) } catch {}
  })

  return {
    get isOpen() { return isOpen },
    sendAudio(buf) {
      if (!isOpen || ws.readyState !== WebSocket.OPEN) return false
      try { ws.send(buf); return true } catch { return false }
    },
    finalize() {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch {}
      }
    },
    close() {
      if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
      try { ws.close() } catch {}
    },
    _ws: ws,
  }
}

// ─── TTS — Aura-2 streaming synthesis ────────────────────────────────────────

const DG_SPEAK_URL = 'https://api.deepgram.com/v1/speak'

/**
 * Returns a fetch Response.body (Web ReadableStream) of synthesized audio.
 * Caller pipes chunks where they need them (Twilio mulaw frames, FE WS, etc).
 *
 * Defaults to Aura-2 Thalia. For phone use:
 *   { encoding: 'mulaw', sample_rate: 8000, container: 'none' }
 * For browser playback:
 *   { encoding: 'linear16', sample_rate: 24000, container: 'wav' }
 */
async function synthesizeStream({
  text,
  voice = 'aura-2-thalia-en',
  encoding = 'mulaw',
  sample_rate = 8000,
  container = 'none',
} = {}) {
  if (!text || typeof text !== 'string') throw new Error('synthesizeStream: text required')
  const apiKey = await getDeepgramKey()
  if (!apiKey) throw new Error('Deepgram API key not provisioned')

  const params = new URLSearchParams({
    model: voice,
    encoding,
    sample_rate: String(sample_rate),
    container,
  })

  const res = await fetch(`${DG_SPEAK_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Deepgram TTS ${res.status}: ${errText.slice(0, 200)}`)
  }
  return res.body
}

/**
 * Buffer-returning convenience for non-streaming callers (file output,
 * synthesize endpoint that uploads to storage).
 */
async function synthesizeBuffer({
  text,
  voice = 'aura-2-thalia-en',
  encoding = 'linear16',
  sample_rate = 24000,
  container = 'wav',
} = {}) {
  const stream = await synthesizeStream({ text, voice, encoding, sample_rate, container })
  const chunks = []
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

// ─── Voice catalogue (Aura-2 English voices) ─────────────────────────────────

const AURA2_VOICES = {
  thalia: 'aura-2-thalia-en',
  zeus: 'aura-2-zeus-en',
  hera: 'aura-2-hera-en',
  apollo: 'aura-2-apollo-en',
  athena: 'aura-2-athena-en',
  orion: 'aura-2-orion-en',
}

module.exports = {
  getDeepgramKey,
  openSTTStream,
  synthesizeStream,
  synthesizeBuffer,
  AURA2_VOICES,
}

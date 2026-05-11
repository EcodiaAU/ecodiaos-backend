/**
 * voiceTranscription.js - OpenAI Whisper one-shot transcription.
 *
 * Authored by fork_mownezy2_77bebd (W2: /api/voice/chunk pipeline).
 * Fixed by fork_mp1sx7i0_9ba00e (12 May 2026): switched to form.getBuffer()
 * (synchronous, no streaming race conditions) + strip codec suffix from
 * MIME type so 'audio/webm;codecs=opus' becomes 'audio/webm' before
 * sending to OpenAI (codec suffix caused intermittent 400 rejections).
 *
 * Exports `transcribeChunk({ buffer, mimeType, filename })` which
 * POSTs to https://api.openai.com/v1/audio/transcriptions and returns
 * the transcribed `text` string.
 *
 * Auth: Bearer ${process.env.OPENAI_API_KEY}.
 * Model: whisper-1.
 * Language: en, response_format: json, temperature: 0.
 * Prompt biases Whisper toward Tate's brainstorm-aloud-while-walking
 * pattern - long pauses, filler words, verbatim transcription. This
 * combats Whisper's well-known habit of hallucinating "Thanks for
 * watching." / "..." / "you" / etc on near-silent inputs.
 */
const FormData = require('form-data')
const logger = require('../config/logger')

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
const PROMPT_HINT = 'Tate is brainstorming aloud while walking. He may pause for many seconds. Transcribe verbatim, including filler words.'

async function transcribeChunk({ buffer, mimeType, filename }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing')
  }
  if (!buffer || !buffer.length) {
    throw new Error('empty buffer')
  }

  // Strip codec parameters before sending to OpenAI.
  // 'audio/webm;codecs=opus' → 'audio/webm'. OpenAI uses the filename
  // extension to determine format; the codec suffix in content-type can
  // trigger intermittent 400 "Invalid file format" rejections.
  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim()

  const form = new FormData()
  form.append('file', buffer, {
    filename: filename || 'chunk.webm',
    contentType: cleanMime,
  })
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  form.append('prompt', PROMPT_HINT)

  // form.getBuffer() builds the full multipart body synchronously.
  // All parts are Buffers or strings (multer memoryStorage, no streams),
  // so this is safe and eliminates the streaming/event-listener race
  // conditions in the previous getLength+resume approach.
  const body = form.getBuffer()
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...form.getHeaders(),
    'Content-Length': String(body.length),
  }

  let res
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers,
      body,
    })
  } catch (err) {
    logger.error('[VoiceTranscription] fetch failed', { error: err.message })
    throw new Error(`whisper fetch failed: ${err.message}`)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    logger.error('[VoiceTranscription] whisper non-200', {
      status: res.status,
      body: errText.slice(0, 500),
    })
    throw new Error(`whisper ${res.status}: ${errText.slice(0, 200)}`)
  }

  let payload
  try {
    payload = await res.json()
  } catch (err) {
    throw new Error(`whisper json parse failed: ${err.message}`)
  }

  return typeof payload?.text === 'string' ? payload.text : ''
}

module.exports = { transcribeChunk }

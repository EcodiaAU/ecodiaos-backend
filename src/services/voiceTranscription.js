/**
 * voiceTranscription.js - OpenAI Whisper one-shot transcription.
 *
 * Authored by fork_mownezy2_77bebd (W2: /api/voice/chunk pipeline).
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

  const form = new FormData()
  form.append('file', buffer, {
    filename: filename || 'chunk.webm',
    contentType: mimeType || 'audio/webm',
  })
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  form.append('prompt', PROMPT_HINT)

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    ...form.getHeaders(),
  }

  // form-data exposes a Buffer concat path via getBuffer() so we can
  // hand a normal Body to the built-in fetch without piping a stream
  // through undici. This avoids the "Body is unusable" / streaming
  // edge cases on Node 22's fetch.
  const body = await new Promise((resolve, reject) => {
    form.getLength((lenErr, length) => {
      if (lenErr) return reject(lenErr)
      const chunks = []
      // form-data emits a mix of Buffers (file content) and strings (boundary
      // markers like '-----...', field names, CRLF). Buffer.concat requires all
      // elements to be Buffer/Uint8Array - coerce strings here so concat never
      // throws an ERR_INVALID_ARG_TYPE that propagates as an unhandled exception
      // and crashes the process (root cause of the "CORS error" Tate sees).
      form.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, 'binary')))
      form.on('end', () => {
        try {
          resolve(Buffer.concat(chunks))
        } catch (err) {
          reject(err)
        }
      })
      form.on('error', reject)
      form.resume()
      // Some form-data builds need an explicit length header.
      headers['Content-Length'] = String(length)
    })
  })

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

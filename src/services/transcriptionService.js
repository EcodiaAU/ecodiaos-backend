/**
 * transcriptionService.js — engine-swappable audio transcription.
 *
 * Backends:
 *   WhisperBackend  — OpenAI Whisper-1 (no diarisation). Always available
 *                     when OPENAI_API_KEY is set.
 *   DeepgramBackend — Deepgram Nova-2 with speaker diarisation. Activates
 *                     when DEEPGRAM_API_KEY env var is set OR when
 *                     kv_store.creds.deepgram_api_key is provisioned.
 *
 * Engine selection (priority order):
 *   1. DEEPGRAM_API_KEY env var (fast, no DB round-trip)
 *   2. kv_store.creds.deepgram_api_key (provisioned by Tate at console.deepgram.com)
 *   3. Whisper fallback
 *
 * Unified return shape (Transcript):
 *   {
 *     full_text: string,
 *     engine: 'whisper' | 'deepgram',
 *     diarised: boolean,
 *     segments: Array<{ speaker, start_ms, end_ms, text }>,
 *     paragraphs: Array<{ speaker, start_ms, end_ms, text }>,
 *   }
 *
 * Whisper:  speaker=null, diarised=false, single segment, paragraphs split
 *           by sentence grouping (every ~3 sentences)
 * Deepgram: speaker='A'/'B'/…, diarised=true, segments from word-level
 *           paragraph groups returned by Nova-2.
 *
 * Post-processing: stripRepetitiveTail() removes Whisper's well-known
 * hallucination of filler words ("Yeah. Yeah. Yeah.") on trailing silence.
 * Also catches prompt-echo-loop artifacts ("Transcribe verbatim…" repeated).
 *
 * Authored: fork_mp1y5cmf_fd9629, 2026-05-12.
 */
const logger = require('../config/logger')

// ─── Cached Deepgram key (checked once then memoised for 5 min) ──────────────
let _deepgramKey = null
let _deepgramKeyCheckedAt = 0
const DEEPGRAM_KEY_TTL_MS = 5 * 60 * 1000

async function getDeepgramKey() {
  // Fast path: env var wins with no DB hit
  if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY

  // Cache TTL
  if (_deepgramKey && Date.now() - _deepgramKeyCheckedAt < DEEPGRAM_KEY_TTL_MS) {
    return _deepgramKey
  }

  // kv_store lookup
  try {
    const db = require('../config/db')
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.deepgram_api_key' LIMIT 1`
    if (rows.length > 0) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
      const key = parsed?.value || parsed?.api_key || null
      _deepgramKey = key
      _deepgramKeyCheckedAt = Date.now()
      return key
    }
  } catch (err) {
    logger.warn('[Transcription] kv_store deepgram key lookup failed', { error: err.message })
  }

  _deepgramKey = null
  _deepgramKeyCheckedAt = Date.now()
  return null
}

// ─── Post-processing: strip repetitive tail hallucinations ───────────────────

/**
 * Whisper hallucinates filler words on trailing silence.
 * Common: "Yeah. Yeah. Yeah." repeated 20-50 times at end.
 * Also: prompt-echo ("Transcribe verbatim…" looped).
 *
 * Algorithm:
 *   1. Split transcript into punctuated tokens (sentence-level)
 *   2. Walk from the end, detect a consecutive run of identical tokens
 *   3. If run >= minReps AND starts in the last 60% of the text, strip it
 *   4. Repeat for 2-token and 3-token window patterns (phrase loops)
 */
function stripRepetitiveTail(text, minReps = 4) {
  if (!text || text.length < 80) return text

  for (let windowSize = 1; windowSize <= 3; windowSize++) {
    // Split at sentence boundaries (., !, ?) followed by whitespace
    const tokens = text.split(/(?<=[.!?])\s+/).map(t => t.trim()).filter(Boolean)
    if (tokens.length < minReps * windowSize + 2) continue

    // Build the reference pattern from the last `windowSize` tokens
    const pattern = tokens.slice(-windowSize).map(t => t.toLowerCase())
    let runCount = 1
    let runStartIdx = tokens.length - windowSize

    // Walk backwards counting consecutive matches
    for (let i = tokens.length - windowSize * 2; i >= 0; i -= windowSize) {
      const chunk = tokens.slice(i, i + windowSize).map(t => t.toLowerCase())
      if (JSON.stringify(chunk) === JSON.stringify(pattern)) {
        runCount++
        runStartIdx = i
      } else {
        break
      }
    }

    if (runCount >= minReps) {
      // Only strip if the repetition starts in the last 60% of the text
      const charsBefore = tokens.slice(0, runStartIdx).join(' ').length
      if (charsBefore > text.length * 0.3) {
        const cleaned = tokens.slice(0, runStartIdx).join(' ').trim()
        logger.info('[Transcription] stripped repetitive tail', {
          windowSize,
          runCount,
          stripped: tokens.slice(runStartIdx).slice(0, 3).join(' ') + '…',
        })
        // Recurse once to catch nested loops (e.g. prompt echo after Yeah loop)
        return stripRepetitiveTail(cleaned, minReps)
      }
    }
  }

  return text
}

// ─── Paragraph splitter for Whisper (no native paragraph data) ──────────────

/**
 * Split a flat transcript into display paragraphs.
 * Groups every SENTENCES_PER_PARA sentences into a paragraph block.
 */
function splitWhisperParagraphs(text) {
  const SENTENCES_PER_PARA = 4
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
  const paras = []
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    paras.push({
      speaker: null,
      start_ms: 0,
      end_ms: 0,
      text: sentences.slice(i, i + SENTENCES_PER_PARA).join(' '),
    })
  }
  if (paras.length === 0) {
    paras.push({ speaker: null, start_ms: 0, end_ms: 0, text })
  }
  return paras
}

// ─── Whisper Backend ─────────────────────────────────────────────────────────

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
// Neutral context hint — NOT an instruction (instructions cause echo-loop)
const WHISPER_PROMPT = 'EcodiaOS, Ecodia DAO, Tate Donohoe. Casual business discussion. May include filler words, partial sentences, and long pauses.'

async function callWhisper({ buffer, mimeType, filename }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY missing')
  if (!buffer?.length) throw new Error('empty audio buffer')

  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim()
  const form = new globalThis.FormData()
  form.append('file', new Blob([buffer], { type: cleanMime }), filename || 'meeting.webm')
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  form.append('prompt', WHISPER_PROMPT)

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Whisper ${res.status}: ${err.slice(0, 200)}`)
  }

  const payload = await res.json()
  const rawText = typeof payload?.text === 'string' ? payload.text : ''
  const text = stripRepetitiveTail(rawText)
  const paras = splitWhisperParagraphs(text)

  return {
    full_text: text,
    engine: 'whisper',
    diarised: false,
    segments: [{ speaker: null, start_ms: 0, end_ms: 0, text }],
    paragraphs: paras,
  }
}

// ─── Deepgram Backend ────────────────────────────────────────────────────────

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

async function callDeepgram({ buffer, mimeType, apiKey }) {
  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim()

  const params = new URLSearchParams({
    model: 'nova-2',
    diarize: 'true',
    smart_format: 'true',
    paragraphs: 'true',
    punctuate: 'true',
    language: 'en',
    utterances: 'true',
  })

  const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': cleanMime,
    },
    body: buffer,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Deepgram ${res.status}: ${err.slice(0, 200)}`)
  }

  return res.json()
}

function parseDeepgramResponse(data) {
  const alt = data?.results?.channels?.[0]?.alternatives?.[0]
  if (!alt) throw new Error('Deepgram: empty response alternatives')

  const fullText = stripRepetitiveTail(alt.transcript || '')
  const paragraphGroups = alt.paragraphs?.paragraphs || []

  const speakerLabel = (idx) => String.fromCharCode(65 + Math.min(idx || 0, 25)) // 0→A, 1→B…

  const segments = paragraphGroups.map(p => ({
    speaker: speakerLabel(p.speaker),
    start_ms: Math.round((p.start || 0) * 1000),
    end_ms: Math.round((p.end || 0) * 1000),
    text: (p.sentences || []).map(s => s.text).join(' ').trim(),
  })).filter(s => s.text.length > 0)

  // Fallback: if no paragraphs, use utterances
  if (segments.length === 0) {
    const utterances = data?.results?.utterances || []
    segments.push(...utterances.map(u => ({
      speaker: speakerLabel(u.speaker),
      start_ms: Math.round((u.start || 0) * 1000),
      end_ms: Math.round((u.end || 0) * 1000),
      text: u.transcript || '',
    })).filter(s => s.text.length > 0))
  }

  // If still empty, fall back to full transcript as single segment
  if (segments.length === 0) {
    segments.push({ speaker: 'A', start_ms: 0, end_ms: 0, text: fullText })
  }

  return {
    full_text: fullText,
    engine: 'deepgram',
    diarised: true,
    segments,
    paragraphs: segments, // same shape
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * transcribeAudio({ buffer, mimeType, filename })
 *
 * Engine selected at call time (not module load) so key provisioning
 * mid-session takes effect without restart.
 *
 * Returns Transcript shape (see module header).
 */
async function transcribeAudio({ buffer, mimeType, filename }) {
  if (!buffer?.length) throw new Error('empty audio buffer')

  const deepgramKey = await getDeepgramKey()

  if (deepgramKey) {
    logger.info('[Transcription] using Deepgram Nova-2 (diarisation: true)')
    try {
      const raw = await callDeepgram({ buffer, mimeType, apiKey: deepgramKey })
      return parseDeepgramResponse(raw)
    } catch (err) {
      logger.warn('[Transcription] Deepgram failed, falling back to Whisper', { error: err.message })
      // Intentional fallthrough to Whisper
    }
  } else {
    logger.info('[Transcription] using Whisper (no Deepgram key - diarisation unavailable)')
  }

  return callWhisper({ buffer, mimeType, filename })
}

// Backward-compat shim — voiceTranscription.js callers use transcribeChunk()
async function transcribeChunk({ buffer, mimeType, filename }) {
  const result = await transcribeAudio({ buffer, mimeType, filename })
  return result.full_text
}

module.exports = { transcribeAudio, transcribeChunk, stripRepetitiveTail }

/**
 * voiceBuffer.js - debounce/coalesce voice transcript chunks before
 * shipping them to the conductor's chat as one [VOICE] message.
 *
 * Authored by fork_mownezy2_77bebd (W2: /api/voice/chunk pipeline).
 *
 * Voice chunks arrive every few seconds while Tate brainstorms aloud.
 * If we shipped each Whisper-transcribed chunk straight into
 * /api/os-session/message we'd flood the conductor's queue with 1-2
 * word fragments and the conductor would lose the thread of thought.
 *
 * Strategy: maintain an in-memory Map<sessionId, state>. Each new chunk
 * appends to `parts`. We flush when EITHER:
 *   (a) the joined text exceeds 300 chars, OR
 *   (b) more than 30s has elapsed since the last flush.
 *
 * If neither condition trips, schedule a 30s timer that will fire the
 * flush even if no further chunks arrive (so a final sentence doesn't
 * sit in the buffer forever).
 */
const logger = require('../config/logger')

const FLUSH_CHAR_THRESHOLD = 300
const FLUSH_MS_THRESHOLD = 30_000
const OS_SESSION_URL = process.env.OS_SESSION_MESSAGE_URL
  || 'http://localhost:3001/api/os-session/message'

// Map<sessionId, { parts: string[], lastFlushAt: number, flushTimer: NodeJS.Timer|null }>
const buffers = new Map()

function getState(sessionId) {
  let s = buffers.get(sessionId)
  if (!s) {
    s = { parts: [], lastFlushAt: 0, flushTimer: null }
    buffers.set(sessionId, s)
  }
  return s
}

async function postFlush(sessionId, message) {
  try {
    const res = await fetch(OS_SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, priority: false }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      logger.warn('[VoiceBuffer] flush non-200', {
        sessionId,
        status: res.status,
        body: txt.slice(0, 300),
      })
    } else {
      logger.info('[VoiceBuffer] flushed', {
        sessionId,
        bytes: message.length,
      })
    }
  } catch (err) {
    logger.error('[VoiceBuffer] flush failed', {
      sessionId,
      error: err.message,
    })
  }
}

async function flushNow(sessionId) {
  const s = buffers.get(sessionId)
  if (!s || !s.parts.length) return
  if (s.flushTimer) {
    clearTimeout(s.flushTimer)
    s.flushTimer = null
  }
  const joined = s.parts.join(' ').trim()
  s.parts = []
  s.lastFlushAt = Date.now()
  if (!joined) return
  await postFlush(sessionId, `[VOICE] ${joined}`)
}

async function appendAndMaybeFlush(sessionId, text) {
  if (!sessionId || typeof text !== 'string' || !text.trim()) return
  const s = getState(sessionId)
  s.parts.push(text.trim())

  const joinedLen = s.parts.reduce((n, p) => n + p.length + 1, 0)
  const sinceLastFlush = Date.now() - s.lastFlushAt
  const shouldFlush = joinedLen > FLUSH_CHAR_THRESHOLD
    || (s.lastFlushAt !== 0 && sinceLastFlush > FLUSH_MS_THRESHOLD)

  if (shouldFlush) {
    await flushNow(sessionId)
    return
  }

  // Schedule a deferred flush if we don't already have one pending.
  // First-ever chunk on a session has lastFlushAt=0; we still want a
  // 30s safety-net timer so a single short utterance doesn't sit forever.
  if (!s.flushTimer) {
    s.flushTimer = setTimeout(() => {
      s.flushTimer = null
      flushNow(sessionId).catch((err) => {
        logger.error('[VoiceBuffer] timer flush threw', {
          sessionId,
          error: err.message,
        })
      })
    }, FLUSH_MS_THRESHOLD)
    // Don't keep the event loop alive solely for a buffered chunk.
    if (s.flushTimer.unref) s.flushTimer.unref()
  }
}

module.exports = {
  appendAndMaybeFlush,
  flushNow,
  // Exported for tests / introspection only.
  _buffers: buffers,
}

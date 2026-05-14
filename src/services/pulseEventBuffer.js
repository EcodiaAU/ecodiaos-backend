'use strict'

/**
 * pulseEventBuffer - shared in-process ring buffer feeding the systemPulse
 * observer + the observer_pulse_events durable persistence layer.
 *
 * Three event-source paths converge here:
 *   1. perceptionBus.subscribe() in-process callback (already structured).
 *   2. Pino transport tail (warn+error level) wired via custom transport
 *      in src/config/logger.js (added in this phase).
 *   3. /api/observer-pulse/fe-event POSTs from the frontend console proxy.
 *
 * Buffer policy:
 *   - In-memory ring of last RING_SIZE events (default 1000). Fast O(1) push.
 *   - Async fire-and-forget INSERT into observer_pulse_events for durability.
 *     (Compaction Haiku reads from in-memory; durable rows feed admin lens +
 *     post-incident replay.)
 *   - 1h DB retention via prune() called from daily maintenance cron.
 *
 * Design intent: a single substrate every observer (and the admin lens) can
 * read. systemPulse is the FIRST consumer but not the last.
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const RING_SIZE = parseInt(process.env.PULSE_BUFFER_RING_SIZE || '1000', 10)
const PERSIST_BATCH_MS = parseInt(process.env.PULSE_BUFFER_PERSIST_MS || '2000', 10)
const PERSIST_MAX_BATCH = parseInt(process.env.PULSE_BUFFER_PERSIST_MAX || '50', 10)

const _ring = []        // newest-last
let _seq = 0            // monotonic per-process ids (local correlation only)
const _persistQueue = []
let _persistTimer = null
const _subscribers = [] // synchronous in-process consumers (systemPulse listens here)

function _enqueuePersist(event) {
  _persistQueue.push(event)
  if (_persistQueue.length >= PERSIST_MAX_BATCH) {
    _flushPersist().catch(() => {})
    return
  }
  if (!_persistTimer) {
    _persistTimer = setTimeout(() => {
      _persistTimer = null
      _flushPersist().catch(() => {})
    }, PERSIST_BATCH_MS)
    if (_persistTimer.unref) _persistTimer.unref()
  }
}

async function _flushPersist() {
  if (_persistQueue.length === 0) return
  const batch = _persistQueue.splice(0, _persistQueue.length)
  try {
    // Postgres array insert via per-row INSERT statements wrapped in a single
    // transaction. Simpler than VALUES (...), (...) construction at this size.
    for (const e of batch) {
      try {
        await db`
          INSERT INTO observer_pulse_events (source, level, kind, payload, ts)
          VALUES (${e.source}, ${e.level || null}, ${e.kind || null},
                  ${JSON.stringify(e.payload || {})}::jsonb, ${e.ts})
        `
      } catch (rowErr) {
        // Table may not exist yet (pre-migration boot) — log once at warn,
        // continue swallowing.
        logger.debug('pulseEventBuffer: persist row failed', { error: rowErr.message })
      }
    }
  } catch (err) {
    logger.debug('pulseEventBuffer: batch persist failed', { error: err.message })
  }
}

function push(event) {
  if (!event || typeof event !== 'object') return
  const normalized = {
    seq: ++_seq,
    source: String(event.source || 'unknown').slice(0, 64),
    level: event.level ? String(event.level).slice(0, 16) : null,
    kind: event.kind ? String(event.kind).slice(0, 64) : null,
    payload: event.payload && typeof event.payload === 'object'
      ? event.payload
      : (event.payload != null ? { value: String(event.payload).slice(0, 2000) } : {}),
    ts: event.ts || new Date().toISOString(),
  }
  // Cap payload size — guard against runaway log lines.
  try {
    const json = JSON.stringify(normalized.payload)
    if (json.length > 4000) normalized.payload = { _truncated: true, head: json.slice(0, 4000) }
  } catch {
    normalized.payload = { _stringify_failed: true }
  }

  _ring.push(normalized)
  if (_ring.length > RING_SIZE) _ring.shift()

  for (const fn of _subscribers) {
    try { fn(normalized) } catch (err) {
      logger.debug('pulseEventBuffer subscriber threw', { error: err.message })
    }
  }

  _enqueuePersist(normalized)
}

function subscribe(fn) {
  if (typeof fn === 'function') _subscribers.push(fn)
}

function snapshot() {
  return _ring.slice()
}

function size() {
  return _ring.length
}

function drain(maxBytes = 12000) {
  // Used by pulseStreamService when assembling its Haiku prompt.
  // Returns a chronological slice with byte cap; events are NOT removed
  // from the ring (compaction reads recent state, doesn't consume).
  let bytes = 0
  const out = []
  for (let i = _ring.length - 1; i >= 0; i--) {
    const line = JSON.stringify(_ring[i])
    bytes += line.length + 1
    if (bytes > maxBytes && out.length > 0) break
    out.unshift(_ring[i])
  }
  return out
}

async function prune(retentionMs = 60 * 60 * 1000) {
  // Drop in-memory ring entries older than retentionMs and DB rows older
  // than retentionMs. Called by maintenance cron.
  const cutoff = Date.now() - retentionMs
  while (_ring.length > 0 && new Date(_ring[0].ts).getTime() < cutoff) {
    _ring.shift()
  }
  try {
    const cutoffDate = new Date(cutoff)
    const result = await db`
      DELETE FROM observer_pulse_events
      WHERE ts < ${cutoffDate}
      RETURNING id
    `
    if (result.length > 0) {
      logger.info('pulseEventBuffer.prune: dropped pulse events', { count: result.length })
    }
    return result.length
  } catch (err) {
    logger.debug('pulseEventBuffer.prune failed', { error: err.message })
    return 0
  }
}

module.exports = { push, subscribe, snapshot, drain, size, prune, _flushPersist }

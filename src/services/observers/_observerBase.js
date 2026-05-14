'use strict'

/**
 * _observerBase - shared factory and utilities for the Haiku Observer Trio.
 *
 * EXPORTS:
 *   createObserver(config) — builds a full listener-shaped module.
 *   _makeRateLimiter(maxPerHour) — shared rate cap utility.
 *   _makeDeduper(windowMs) — shared dedup utility.
 *   _postIntervention(name, message) — POST wrapped message to conductor queue.
 *   _writeHeartbeat(name, snapshot) — upsert kv_store health row.
 *
 * All utilities are exported individually so Observer B (actionAuditObserver)
 * can use them without going through createObserver (which assumes a single
 * subscribesTo type and a simple buffer shape).
 *
 * Origin: fork_mp27tdp1_eaa05e, 12 May 2026. Part of Haiku Observer Trio.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')

const PORT = process.env.PORT || 3001

// ─── Shared Utilities ─────────────────────────────────────────────────────────

/**
 * Rate limiter: allows at most maxPerHour calls per sliding 1-hour window.
 * Returns { check(), count() }:
 *   check() — true if allowed AND records the call; false if capped (does not record).
 *   count() — current count in the sliding window (read-only, no mutation).
 */
function _makeRateLimiter(maxPerHour) {
  const windowMs = 60 * 60 * 1000
  const timestamps = []

  return {
    check() {
      const now = Date.now()
      while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
        timestamps.shift()
      }
      if (timestamps.length >= maxPerHour) return false
      timestamps.push(now)
      return true
    },
    count() {
      const now = Date.now()
      return timestamps.filter(t => t >= now - windowMs).length
    },
  }
}

/**
 * Deduplicator: skips posting the same intervention text within windowMs.
 * Returns { isDuplicate(text), record(text) }.
 */
function _makeDeduper(windowMs) {
  const recent = []  // { text: string, ts: number }

  return {
    isDuplicate(text) {
      const now = Date.now()
      while (recent.length > 0 && recent[0].ts < now - windowMs) {
        recent.shift()
      }
      return recent.some(r => r.text === text)
    },
    record(text) {
      recent.push({ text, ts: Date.now() })
    },
  }
}

/**
 * Write an observer intervention to the observer_signals substrate.
 *
 * SUPERSEDES _postIntervention (13 May 2026). The old path POSTed to
 * /api/os-session/message, which routed observer text into the conductor's
 * USER-message stream — frontend rendered it as Tate-typed, conductor
 * treated it as new user input and looped. Tate flagged the bug verbatim:
 * "all the coherence stuff is coming through main chat and polluting the
 * os context".
 *
 * The new substrate (observer_signals table + <observer_signals> turn-start
 * continuity block) shows interventions as AMBIENT context — the conductor
 * reads them at turn-start, never sees them as new user turns, and chat
 * stays clean.
 *
 * observerSignalsService also adds:
 *   - Self-mute: same fingerprint 3x in 10min = observer mutes itself 1h
 *   - Conflict resolution: 2 observers disagreeing = single synthesized
 *     'conflict_resolved' signal instead of both posting
 *   - 30-min signal expiry: stale interventions auto-disappear
 */
async function _postIntervention(name, message, opts = {}) {
  try {
    const observerSignals = require('../observerSignalsService')
    const result = await observerSignals.writeSignal({
      observer_name: name,
      signal_kind: opts.signal_kind || 'drift_warning',
      message,
      reason: opts.reason,
      confidence: opts.confidence,
      priority: opts.priority,
      correlation_id: opts.correlation_id,
      evidence_event_ids: opts.evidence_event_ids,
    })

    // Observer Framework v2: P1 broadcast. When a critical signal lands,
    // emit an immediate websocket event so the FE (and tools watching the
    // stream) can react before the conductor's next turn. This is the
    // "interrupt" path — the conductor itself picks the signal up via the
    // <observer_signals> block at next turn-start (between tool calls is
    // not achievable without SDK re-architecture, but the next-turn
    // boundary is fast in practice).
    if (result?.written === true && (opts.priority === 1 || result?.priority === 1)) {
      try {
        const { broadcast } = require('../../websocket/wsManager')
        broadcast('os-session:output', {
          data: {
            type: 'observer_signal_p1',
            id: result.id,
            observer_name: name,
            signal_kind: opts.signal_kind || 'drift_warning',
            message: String(message).slice(0, 400),
            confidence: opts.confidence,
            correlation_id: opts.correlation_id || null,
          },
        })
      } catch (err) {
        logger.debug(`observer ${name}: P1 broadcast failed (non-fatal)`, { error: err.message })
      }
    }
    if (result.written === true) {
      logger.info(`observer ${name}: signal written id=${result.id}`)
    } else if (result.written === 'conflict_resolved') {
      logger.info(`observer ${name}: signal conflict-suppressed (overlaps ${result.conflictWith})`)
    } else if (result.reason === 'muted') {
      logger.debug(`observer ${name}: muted until ${result.until?.toISOString?.()}`)
    } else if (result.reason === 'self_muted_now') {
      logger.warn(`observer ${name}: SELF-MUTED (recentCount=${result.recentCount})`)
    } else {
      logger.debug(`observer ${name}: signal not written`, { reason: result.reason })
    }
    return result
  } catch (err) {
    logger.warn(`observer ${name}: _postIntervention failed`, { error: err.message })
    return { written: false, reason: 'exception' }
  }
}

/**
 * Write a heartbeat row to kv_store.health.observer_<name>.
 * Uses upsert so repeated calls are idempotent.
 */
async function _writeHeartbeat(name, snapshot) {
  try {
    const db = require('../../config/db')
    const key = `health.observer_${name}`
    const value = JSON.stringify({
      ...snapshot,
      updated_at: new Date().toISOString(),
    })
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${value}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn(`observer ${name}: _writeHeartbeat failed`, { error: err.message })
  }
}

// ─── Observer Factory ─────────────────────────────────────────────────────────

/**
 * createObserver - build a listener-shaped module for the Haiku Observer Trio.
 *
 * @param {object} config
 *   name                  {string}     Observer name (logs + kv_store keys)
 *   systemPrompt          {string}     Haiku system prompt (ephemeral-cached)
 *   bufferSize            {number}     Max entries in rolling buffer
 *   subscribesTo          {string[]}   Event types (default: ['assistant_text'])
 *   updateBuffer          {function}   (buffer, event) => void  — optional override
 *   buildPromptFromBuffer {function}   (buffer) => string
 *   parseIntervention     {function}   (json) => { intervene, reason, message_for_conductor }
 *
 * @returns Listener-shaped object { name, subscribesTo, relevanceFilter, handle, ownsWriteSurface }
 */
function createObserver({
  name,
  systemPrompt,
  bufferSize,
  subscribesTo = ['assistant_text'],
  updateBuffer,
  buildPromptFromBuffer,
  parseIntervention,
}) {
  const buffer = []
  let debounceTimer = null
  const rateLimiter = _makeRateLimiter(4)       // max 4 interventions per hour
  const deduper = _makeDeduper(10 * 60 * 1000)  // 10-min dedup window

  // Default buffer updater: push { ts, role, text } entries
  const _updateBuffer = updateBuffer || function (buf, event) {
    const content = event?.data?.content
    if (!content) return
    const role = event?.data?.type === 'user' ? 'tate' : 'conductor'
    buf.push({ ts: new Date().toISOString(), role, text: String(content).slice(0, 2000) })
  }

  async function _evaluate() {
    if (buffer.length === 0) return

    // Audit 2026-05-13 P0 #27: buffer was being read inside this function
    // while `handle()` continued to push/shift entries during the ~15s
    // Haiku call. The model saw partial/interleaved state — plausibly the
    // dominant trio hallucination root cause. Snapshot first.
    const bufferSnapshot = buffer.slice()
    const prompt = buildPromptFromBuffer(bufferSnapshot)
    if (!prompt || !prompt.trim()) return

    const result = await haikuClient.call({ systemPrompt, userMessage: prompt, observerName: name })

    const heartbeat = {
      last_run: new Date().toISOString(),
      buffer_size: bufferSnapshot.length,
      intervene_rate_24h: rateLimiter.count(),
    }

    const decision = parseIntervention ? parseIntervention(result) : result

    if (!decision || !decision.intervene) {
      await _writeHeartbeat(name, {
        ...heartbeat,
        last_decision: 'no_intervene',
        last_reason: decision?.reason || 'no_drift',
      })
      return
    }

    const msg = decision.message_for_conductor
    if (!msg) {
      await _writeHeartbeat(name, { ...heartbeat, last_decision: 'intervene_no_message' })
      return
    }

    if (deduper.isDuplicate(msg)) {
      logger.debug(`observer ${name}: dedup blocked`)
      await _writeHeartbeat(name, { ...heartbeat, last_decision: 'dedup_blocked' })
      return
    }

    if (!rateLimiter.check()) {
      logger.warn(`observer ${name}: rate cap (4/h) exceeded, dropping`)
      await _writeHeartbeat(name, { ...heartbeat, last_decision: 'rate_cap_dropped' })
      return
    }

    // Confidence bumped to 0.85 minimum (was 0.75) to reduce false-positive
    // chat-stream impact (per 13 May 2026 Tate flag on observer pollution).
    // Each observer can override via decision.confidence, but if absent we
    // assume the model agreed it was high-signal enough to intervene at all.
    const inferredConfidence = typeof decision.confidence === 'number'
      ? decision.confidence
      : 0.85
    await _postIntervention(name, msg, {
      signal_kind: decision.signal_kind || 'drift_warning',
      reason: decision.reason,
      confidence: inferredConfidence,
      priority: decision.priority,             // optional; coerced by writeSignal
      correlation_id: decision.correlation_id, // optional event-chain linker
      evidence_event_ids: decision.evidence_event_ids,
    })
    deduper.record(msg)

    await _writeHeartbeat(name, {
      ...heartbeat,
      last_decision: 'intervened',
      last_reason: decision.reason,
      last_message_len: String(msg).length,
    })
  }

  return {
    name,
    subscribesTo,

    relevanceFilter: (event) => {
      const innerType = event?.data?.type
      // Must match one of our declared subscriptions
      const matched = subscribesTo.includes(innerType) || subscribesTo.includes(event?.type)
      if (!matched) return false
      // For text-based events: must have non-trivial content
      if (innerType === 'assistant_text' || innerType === 'user') {
        const content = event?.data?.content
        return !!(content && typeof content === 'string' && content.length > 10)
      }
      // For tool_use events: must have tools array
      if (innerType === 'tool_use') {
        return !!(event?.data?.tools && Array.isArray(event.data.tools))
      }
      return true
    },

    handle: async (event, _ctx) => {
      // Update rolling buffer, evicting oldest if full
      if (buffer.length >= bufferSize) buffer.shift()
      _updateBuffer(buffer, event)

      // Debounce 2s: collapse rapid event bursts into a single Haiku call
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        debounceTimer = null
        try {
          await _evaluate()
        } catch (err) {
          logger.warn(`observer ${name}: evaluate threw`, { error: err.message })
        }
      }, 2000)
      if (debounceTimer && debounceTimer.unref) debounceTimer.unref()
    },

    ownsWriteSurface: [`kv_store.health.observer_${name}`, 'os-session-message'],
  }
}

module.exports = {
  createObserver,
  _makeRateLimiter,
  _makeDeduper,
  _postIntervention,
  _writeHeartbeat,
}

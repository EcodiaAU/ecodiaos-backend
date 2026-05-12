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
 * POST an intervention message to the conductor's OS message queue.
 * Uses mode='queue' so it never interrupts an in-flight conductor turn.
 * Wraps the message in <observer source="..."> for conductor UI parsing.
 */
async function _postIntervention(name, message) {
  try {
    const axios = require('axios')
    const body = `<observer source="${name}">${message}</observer>`
    await axios.post(
      `http://localhost:${PORT}/api/os-session/message`,
      { message: body, mode: 'queue', source: 'observer' },
      { timeout: 5000 },
    )
    logger.info(`observer ${name}: intervention queued to conductor`, {
      messageLen: message.length,
    })
  } catch (err) {
    logger.warn(`observer ${name}: _postIntervention failed`, { error: err.message })
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

    const prompt = buildPromptFromBuffer(buffer)
    if (!prompt || !prompt.trim()) return

    const result = await haikuClient.call({ systemPrompt, userMessage: prompt, observerName: name })

    const heartbeat = {
      last_run: new Date().toISOString(),
      buffer_size: buffer.length,
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

    await _postIntervention(name, msg)
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

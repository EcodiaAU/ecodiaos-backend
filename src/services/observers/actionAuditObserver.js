'use strict'

/**
 * actionAuditObserver (Observer B) — detects when the conductor narrates
 * planned actions ("I'll do X", "let me do Y") but does NOT execute them
 * via tool calls in the same turn or the next turn.
 *
 * WHAT IT DOES:
 *   Subscribes to BOTH 'assistant_text' AND 'tool_use' events.
 *   Maintains a 30-turn rolling buffer where each entry is a conductor turn
 *   with its text AND the tool_calls that fired (possibly empty).
 *   Pairs tool_use events to the preceding assistant_text within 30s.
 *   Calls Haiku to detect the narrated-planning-instead-of-acting failure mode.
 *   Rate cap: 4 interventions / hour. Dedup: 10-min window.
 *
 * WHAT IT DOES NOT DO:
 *   - Never catches hypothetical framing ("we could", "one option is").
 *   - Never imports osSessionService.
 *   - Never modifies DB rows, sends email/SMS, or touches credentials.
 *
 * SUBSTRATE (5-layer):
 *   1. PRODUCER: osSessionService emits 'assistant_text' (emitOutput line ~2507)
 *      and 'tool_use' (emitOutput line ~2519-2523) via emitOutput().
 *   2. TRIGGER: wsManager.broadcast('os-session:output', { data: { type, ... } }).
 *   3. BRIDGE: wsManager.subscribe() in-process fan-out.
 *   4. LISTENER: this module. subscribesTo: ['assistant_text', 'tool_use'].
 *   5. SIDE-EFFECT: POST to /api/os-session/message (mode='queue') + kv_store heartbeat.
 *
 * Origin: fork_mp27tdp1_eaa05e, 12 May 2026. Part of Haiku Observer Trio.
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const {
  _makeRateLimiter,
  _makeDeduper,
  _postIntervention,
  _writeHeartbeat,
} = require('./_observerBase')

const BUFFER_SIZE = 30
const DEBOUNCE_MS = 2000
// A tool_use event is attached to the preceding assistant_text if within this window
const TOOL_ATTACH_WINDOW_MS = 30_000

const SYSTEM_PROMPT = `You are the Action Audit Observer for EcodiaOS. Your one job: detect when the conductor narrates planned actions ("I'll do X", "let me do Y", "next I'll check Z") but does NOT actually execute them via tool calls in the same turn or the next turn. This is the "narrated planning instead of acting" failure mode.
Always return JSON only:
  { "intervene": bool, "reason": "<one line>", "skipped_action": "<the action narrated but not done> or null", "message_for_conductor": "<= 150 chars or null" }
Threshold: only intervene when you see a clear "I'll do X" without a corresponding tool call for X within 2 turns. Don't catch hypothetical framing ("we could", "one option is").`

// Rolling buffer: each entry = { ts: ISO string, text: string|null, tool_calls: string[] }
const buffer = []
let debounceTimer = null
const rateLimiter = _makeRateLimiter(4)
const deduper = _makeDeduper(10 * 60 * 1000)

function _buildPrompt(buf) {
  if (buf.length === 0) return ''
  const lines = buf.map(e => {
    const toolStr = e.tool_calls.length > 0
      ? `[tools used: ${e.tool_calls.join(', ')}]`
      : '[no tools used]'
    const textStr = e.text ? e.text.slice(0, 600) : '(no text this turn)'
    return `${e.ts.slice(11, 19)} ${toolStr}\n${textStr}`
  }).join('\n---\n')
  return (
    `Here are the last ${buf.length} conductor turns with their tool calls (oldest first):\n\n` +
    `${lines}\n\nDetect narrated-but-not-done failures. Return JSON only.`
  )
}

async function _evaluate() {
  if (buffer.length === 0) return

  const prompt = _buildPrompt(buffer)
  const result = await haikuClient.call({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: prompt,
    observerName: 'actionAudit',
  })

  const heartbeat = {
    last_run: new Date().toISOString(),
    buffer_size: buffer.length,
    intervene_rate_24h: rateLimiter.count(),
  }

  if (!result?.intervene) {
    await _writeHeartbeat('actionAudit', {
      ...heartbeat,
      last_decision: 'no_intervene',
      last_reason: result?.reason || 'no_narration_gap',
    })
    return
  }

  const msg = result?.message_for_conductor
  if (!msg) {
    await _writeHeartbeat('actionAudit', { ...heartbeat, last_decision: 'intervene_no_message' })
    return
  }

  if (deduper.isDuplicate(msg)) {
    logger.debug('observer actionAudit: dedup blocked')
    await _writeHeartbeat('actionAudit', { ...heartbeat, last_decision: 'dedup_blocked' })
    return
  }

  if (!rateLimiter.check()) {
    logger.warn('observer actionAudit: rate cap (4/h) exceeded, dropping intervention')
    await _writeHeartbeat('actionAudit', { ...heartbeat, last_decision: 'rate_cap_dropped' })
    return
  }

  await _postIntervention('actionAudit', String(msg).slice(0, 150))
  deduper.record(msg)
  await _writeHeartbeat('actionAudit', {
    ...heartbeat,
    last_decision: 'intervened',
    last_reason: result.reason,
    skipped_action: result.skipped_action || null,
  })
}

function _scheduleEvaluate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    try {
      await _evaluate()
    } catch (err) {
      logger.warn('observer actionAudit: evaluate threw', { error: err.message })
    }
  }, DEBOUNCE_MS)
  if (debounceTimer && debounceTimer.unref) debounceTimer.unref()
}

module.exports = {
  name: 'actionAudit',
  subscribesTo: ['assistant_text', 'tool_use'],

  relevanceFilter: (event) => {
    const innerType = event?.data?.type
    if (innerType === 'assistant_text') {
      const content = event?.data?.content
      return !!(content && typeof content === 'string' && content.length > 10)
    }
    if (innerType === 'tool_use') {
      return !!(event?.data?.tools && Array.isArray(event.data.tools) && event.data.tools.length > 0)
    }
    return false
  },

  handle: async (event, _ctx) => {
    const innerType = event?.data?.type
    const now = new Date().toISOString()

    if (innerType === 'assistant_text') {
      const content = event?.data?.content
      if (!content) return
      // New conductor turn: push entry with empty tool_calls (populated later by tool_use events)
      if (buffer.length >= BUFFER_SIZE) buffer.shift()
      buffer.push({
        ts: now,
        text: String(content).slice(0, 2000),
        tool_calls: [],
      })
      _scheduleEvaluate()

    } else if (innerType === 'tool_use') {
      const tools = event?.data?.tools || []
      const toolNames = tools.map(t => t.name).filter(Boolean)

      if (buffer.length === 0) {
        // No preceding assistant turn yet — create a tool-only entry
        buffer.push({ ts: now, text: null, tool_calls: toolNames })
      } else {
        // Attach to the most recent turn if within the attach window
        const last = buffer[buffer.length - 1]
        const ageDiff = Date.now() - new Date(last.ts).getTime()
        if (ageDiff <= TOOL_ATTACH_WINDOW_MS) {
          last.tool_calls.push(...toolNames)
        } else {
          // Stale entry — push a standalone tool-only turn
          if (buffer.length >= BUFFER_SIZE) buffer.shift()
          buffer.push({ ts: now, text: null, tool_calls: toolNames })
        }
      }
      // No re-trigger here: tool_use alone doesn't add new planning text to evaluate.
      // The debounce from the preceding assistant_text covers this window.
    }
  },

  ownsWriteSurface: ['kv_store.health.observer_actionAudit', 'os-session-message'],
}

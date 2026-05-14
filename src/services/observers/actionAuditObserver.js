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

const SYSTEM_PROMPT = `You are the Action Audit Observer for EcodiaOS. You watch a rolling buffer of conversation turns, each paired with the tool calls that fired in/after that turn. Every turn entry is tagged with a ROLE — either [conductor] (the OS itself) or [tate] (the user). Your one job: detect when the CONDUCTOR narrates a planned action but does NOT execute it.

CRITICAL ROLE DISTINCTION:
  - The CONDUCTOR is the OS responding to Tate. Conductor turns are tagged [conductor].
  - TATE is the user. Tate-typed messages are tagged [tate].
  - The conductor frequently QUOTES, ECHOES, or SUMMARISES Tate's words back at him ("you said you'd want me to fork X"). That is NOT the conductor narrating its own planned action — that is the conductor reading back Tate's wording. NEVER intervene on a [tate]-tagged turn or on conductor turns that are echoing Tate.

INTERVENE only when ALL of these hold:
  1. A [conductor]-tagged turn stated a concrete future action in first-person ("I'll fork X", "let me run Y", "I'll send the email") — not hypothetical framing ("we could", "one option is", "maybe later"), and not a quote/echo of Tate.
  2. The action is named specifically enough that a corresponding tool call would be obvious (a specific fork brief, a specific endpoint, a specific file path).
  3. NO tool call corresponding to that action appears in this turn OR the next turn's buffer entry.
  4. The buffer must contain AT LEAST 2 turns AFTER the narration — otherwise the conductor may simply not have had time to act yet.

DO NOT intervene if:
  - Any tool call in the relevant window plausibly satisfies the narration (broad fork briefs, related sub-tasks, parallel work). Be generous in matching.
  - The buffer is too short to judge follow-through (< 2 subsequent turns).
  - The narration was conditional ("I'll do X if Y").
  - The "planning" sentence appears in a [tate] turn or is a conductor echo/quote of Tate.

Confidence: state your confidence in [0.0, 1.0]. ONLY intervene at confidence >= 0.90. A wrong "you didn't do X" message is worse than no message — the conductor wastes a turn explaining or, worse, redoes work it already did.

Always return JSON only:
  { "intervene": bool, "confidence": number, "reason": "<one line>", "skipped_action": "<the action narrated but not done> or null", "evidence_turns": [<indices of turns referenced>], "message_for_conductor": "<= 150 chars or null" }`

// Rolling buffer: each entry = { ts: ISO, role: 'conductor'|'tate', text: string|null, tool_calls: string[] }
// Audit 2026-05-13 P0 #28: actionAudit previously didn't subscribe to 'user'
// events at all, so Tate-typed text never entered the buffer. The conductor
// frequently re-narrates Tate's words back ("you mentioned X, I'll do X");
// the observer read those as the conductor planning. Now: subscribe to user
// events too AND tag every entry with its role so the prompt can tell them
// apart.
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
    const roleStr = e.role === 'tate' ? '[tate]' : '[conductor]'
    return `${e.ts.slice(11, 19)} ${roleStr} ${toolStr}\n${textStr}`
  }).join('\n---\n')
  return (
    `Here are the last ${buf.length} turns (oldest first), each tagged with its role:\n\n` +
    `${lines}\n\nDetect cases where a [conductor] turn narrated a concrete future action ` +
    `that was not executed. NEVER intervene on [tate] turns or on conductor turns echoing Tate. ` +
    `Return JSON only.`
  )
}

// Pre-Haiku heuristic gate: short-circuit if the buffer has too few post-narration
// turns to fairly judge "didn't do it". Spares a Haiku call and prevents the
// "you said you'd do X but didn't" false-positive class on fresh narration.
function _bufferHasMinPostNarrationTurns(buf, minPost = 2) {
  if (buf.length < minPost + 1) return false
  // Roughly: if at least minPost turns exist after the last text-bearing turn,
  // we have enough evidence. (We trust the LLM for finer semantics.)
  return true
}

const CONFIDENCE_FLOOR = 0.90

async function _evaluate() {
  if (buffer.length === 0) return
  if (!_bufferHasMinPostNarrationTurns(buffer)) {
    // Not enough post-narration evidence yet — skip this Haiku call.
    return
  }

  // Audit 2026-05-13 P0 #27: snapshot the buffer at evaluate-start so the
  // ~15s Haiku call sees a stable view. Without this, concurrent handle()
  // calls were shifting/pushing entries mid-stringify and the model
  // received interleaved state.
  const bufferSnapshot = buffer.slice()
  const prompt = _buildPrompt(bufferSnapshot)
  const result = await haikuClient.call({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: prompt,
    observerName: 'actionAudit',
  })

  const heartbeat = {
    last_run: new Date().toISOString(),
    buffer_size: bufferSnapshot.length,
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

  // Hard confidence floor — actionAudit false positives are particularly
  // costly because they wrong-foot the conductor on factual claims.
  const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5
  if (confidence < CONFIDENCE_FLOOR) {
    await _writeHeartbeat('actionAudit', {
      ...heartbeat,
      last_decision: 'confidence_floor_dropped',
      last_reason: `confidence=${confidence.toFixed(2)} < ${CONFIDENCE_FLOOR}`,
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

  await _postIntervention('actionAudit', String(msg).slice(0, 150), {
    signal_kind: 'action_skipped',
    reason: result.reason || null,
    confidence,
    priority: 3,
  })
  deduper.record(msg)
  await _writeHeartbeat('actionAudit', {
    ...heartbeat,
    last_decision: 'intervened',
    last_reason: result.reason,
    skipped_action: result.skipped_action || null,
    confidence,
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
  // Audit 2026-05-13 P0 #28: 'user' added so Tate-typed text enters the
  // buffer with role='tate'. Without this, the conductor's quotes/echoes
  // of Tate's words looked like the conductor narrating planned actions.
  subscribesTo: ['assistant_text', 'tool_use', 'user'],

  relevanceFilter: (event) => {
    const innerType = event?.data?.type
    if (innerType === 'assistant_text' || innerType === 'user') {
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

    if (innerType === 'assistant_text' || innerType === 'user') {
      const content = event?.data?.content
      if (!content) return
      const role = innerType === 'user' ? 'tate' : 'conductor'
      // New turn: push entry with empty tool_calls (populated later by
      // tool_use events). Tate turns can never carry tool_calls but the
      // shape is uniform for prompt construction.
      if (buffer.length >= BUFFER_SIZE) buffer.shift()
      buffer.push({
        ts: now,
        role,
        text: String(content).slice(0, 2000),
        tool_calls: [],
      })
      // Only schedule the haiku evaluate on conductor turns — tate turns
      // alone don't change "did the conductor follow through?" status.
      if (role === 'conductor') _scheduleEvaluate()

    } else if (innerType === 'tool_use') {
      const tools = event?.data?.tools || []
      const toolNames = tools.map(t => t.name).filter(Boolean)

      if (buffer.length === 0) {
        // No preceding turn yet — create a tool-only entry attributed to
        // conductor (only conductor turns produce tool calls).
        buffer.push({ ts: now, role: 'conductor', text: null, tool_calls: toolNames })
      } else {
        // Attach to the most recent CONDUCTOR turn within the attach
        // window. If the most recent entry is a tate turn, walk back to
        // find the latest conductor turn (otherwise we'd attribute the
        // conductor's tool calls to Tate's message, which would skew
        // the "did the conductor follow through?" judgement).
        let attachIdx = -1
        for (let i = buffer.length - 1; i >= 0; i--) {
          if (buffer[i].role === 'conductor') { attachIdx = i; break }
        }
        if (attachIdx >= 0) {
          const ageDiff = Date.now() - new Date(buffer[attachIdx].ts).getTime()
          if (ageDiff <= TOOL_ATTACH_WINDOW_MS) {
            buffer[attachIdx].tool_calls.push(...toolNames)
          } else {
            // Stale entry — push a standalone tool-only turn
            if (buffer.length >= BUFFER_SIZE) buffer.shift()
            buffer.push({ ts: now, role: 'conductor', text: null, tool_calls: toolNames })
          }
        } else {
          if (buffer.length >= BUFFER_SIZE) buffer.shift()
          buffer.push({ ts: now, role: 'conductor', text: null, tool_calls: toolNames })
        }
      }
      // No re-trigger here: tool_use alone doesn't add new planning text to evaluate.
      // The debounce from the preceding assistant_text covers this window.
    }
  },

  ownsWriteSurface: ['kv_store.health.observer_actionAudit', 'os-session-message'],
}

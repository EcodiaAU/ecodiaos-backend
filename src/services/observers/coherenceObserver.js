'use strict'

/**
 * coherenceObserver (Observer A) — detects when the conductor has lost the
 * thread of what the user is actually trying to accomplish.
 *
 * WHAT IT DOES:
 *   Watches a 50-turn rolling buffer of both Tate and conductor messages.
 *   Calls Haiku to detect three drift classes:
 *     (a) Conductor pursuing something the user already dismissed.
 *     (b) Conductor interpreting a user message inconsistently with earlier context.
 *     (c) User's most recent ask unaddressed for 3+ conductor turns.
 *   Threshold: drift confidence > 0.75. False positives much worse than negatives.
 *   Rate cap: 4 interventions / hour. Dedup: 10-min window on identical messages.
 *
 * WHAT IT DOES NOT DO:
 *   - Never instructs the conductor on tasks (meta-cognition only).
 *   - Never modifies DB rows, sends emails/SMS, or reads credentials.
 *   - Never imports osSessionService.
 *
 * SUBSTRATE (5-layer):
 *   1. PRODUCER: osSessionService emits 'assistant_text' + 'user' events via emitOutput().
 *   2. TRIGGER: wsManager.broadcast('os-session:output', { data: { type, content } }).
 *   3. BRIDGE: wsManager.subscribe() in-process fan-out.
 *   4. LISTENER: this module. subscribesTo: ['assistant_text', 'user'].
 *   5. SIDE-EFFECT: POST to /api/os-session/message (mode='queue') + kv_store heartbeat.
 *
 * Origin: fork_mp27tdp1_eaa05e, 12 May 2026. Part of Haiku Observer Trio.
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 */

const { createObserver } = require('./_observerBase')

const SYSTEM_PROMPT = `You are the Coherence Observer for EcodiaOS, a multi-task agentic system.
You watch the last 50 turns of conversation between the user (TATE) and the CONDUCTOR. You DO NOT instruct the conductor on tasks. Your one job: flag drift between user intent and conductor focus.

INTERVENE only when ALL of these hold:
  1. You can name a specific user utterance (quote it) that is being ignored, contradicted, or pursued despite being dismissed.
  2. AT LEAST 3 conductor turns have passed since that utterance with no on-topic response.
  3. The conductor's recent turns are clearly about a different topic — not about a parallel sub-task or preparation step.
  4. There is a concrete, actionable recommendation you can give in <=200 chars.

DO NOT intervene if:
  - You can't quote the specific user utterance.
  - The conductor's recent work could plausibly be preparation/sub-task work for the user's ask.
  - The drift is interpretive ("could be misreading X"). Be specific or stay silent.
  - The user's most recent message itself changed the topic.

Confidence: state your confidence in [0.0, 1.0]. ONLY intervene at confidence >= 0.85.

Always return JSON only:
  { "intervene": bool, "confidence": number, "reason": "<one line, quote the user utterance>", "drift_class": "dismissed_topic|inconsistent_interpretation|unaddressed_ask", "message_for_conductor": "<= 200 chars or null" }
Default: { "intervene": false, "confidence": <your read>, "reason": "no drift detected" }.`

module.exports = createObserver({
  name: 'coherence',
  systemPrompt: SYSTEM_PROMPT,
  bufferSize: 50,
  subscribesTo: ['assistant_text', 'user'],

  // Custom buffer updater: records role (tate vs conductor) alongside text
  updateBuffer: (buffer, event) => {
    const innerType = event?.data?.type
    const content = event?.data?.content
    if (!content) return
    const role = innerType === 'user' ? 'tate' : 'conductor'
    buffer.push({
      ts: new Date().toISOString(),
      role,
      text: String(content).slice(0, 2000),
    })
  },

  buildPromptFromBuffer: (buffer) => {
    if (buffer.length === 0) return ''
    const lines = buffer
      .map(e => `[${e.role.toUpperCase()} ${e.ts.slice(11, 19)}] ${e.text.slice(0, 500)}`)
      .join('\n')
    return (
      `Here are the last ${buffer.length} conversation turns (oldest first). ` +
      `Analyse for coherence drift:\n\n${lines}\n\nReturn JSON only.`
    )
  },

  parseIntervention: (json) => {
    const confidence = typeof json?.confidence === 'number' ? json.confidence : 0.5
    const driftClass = String(json?.drift_class || '').slice(0, 40)
    // Map drift class → signal_kind for richer ack telemetry.
    const signalKind = driftClass === 'unaddressed_ask' ? 'unaddressed_ask'
      : driftClass === 'inconsistent_interpretation' ? 'inconsistent_interpretation'
      : driftClass === 'dismissed_topic' ? 'pursuing_dismissed_topic'
      : 'drift_warning'
    return {
      intervene: !!json?.intervene && confidence >= 0.85,
      confidence,
      signal_kind: signalKind,
      reason: String(json?.reason || '').slice(0, 200),
      message_for_conductor: json?.message_for_conductor
        ? String(json.message_for_conductor).slice(0, 200)
        : null,
      priority: 3,
    }
  },
})

'use strict'

/**
 * conductorStreamTagWatcher - passive observer of the conductor's assistant_text stream.
 *
 * WHAT IT DOES:
 *   Subscribes to every completed 'assistant_text' event broadcast from osSessionService.
 *   When the conductor's text contains [APPLIED], [NOT-APPLIED], [FALSE-POSITIVE], or
 *   [OVERRIDE] tag lines, it logs them silently to application-events.jsonl for telemetry.
 *
 * WHAT IT DOES NOT DO:
 *   - Never injects anything back into the conductor's context.
 *   - Never posts to /api/os-session/message.
 *   - Never contacts Anthropic. Zero LLM calls.
 *   - Never modifies or archives any DB rows.
 *
 * WHY THIS EXISTS:
 *   Before 12 May 2026, post-action-applied-tag-check.sh emitted [FORCING WARN] via
 *   additionalContext - visible to the model, causing the conductor to echo
 *   [APPLIED]/[NOT-APPLIED] tags as chat text Tate could see. Tate verbatim 14:04 AEST
 *   12 May 2026: "you didnt start a fork for the haiku stuff, and literally jsut
 *   narrated another hook."
 *
 *   This listener replaces the feedback loop. The conductor never needs to narrate tags.
 *   The stream watcher reads them passively after the fact and feeds the telemetry.
 *
 * SUBSTRATE VERIFICATION (5-layer):
 *   1. PRODUCER: osSessionService.js line ~2463 - emitOutput({ type: 'assistant_text', content: safeText })
 *   2. TRIGGER: wsManager.broadcast('os-session:output', { fork_id: 'main', data }) on every completed turn.
 *   3. BRIDGE: wsManager.subscribe() - in-process fan-out.
 *   4. LISTENER: this module. subscribesTo: ['assistant_text'], relevanceFilter checks tag presence.
 *   5. SIDE-EFFECT: append JSONL lines to logs/telemetry/application-events.jsonl (same file
 *      post-action-applied-tag-check.sh writes to, same consumer drains).
 *
 * Origin: fork_mp23xvj4_d68b9c, 12 May 2026. Part of the tag-narration-suppression fix.
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md Layer 3.
 */

const path = require('path')
const fs = require('fs')
const logger = require('../../config/logger')

const TELEMETRY_DIR = process.env.ECODIAOS_TELEMETRY_DIR || '/home/tate/ecodiaos/logs/telemetry'
const APP_JSONL = process.env.ECODIAOS_APPLICATION_EVENT_FILE || path.join(TELEMETRY_DIR, 'application-events.jsonl')

// Tag line regex - same patterns as stripDoctrineNoise.ts, plus OVERRIDE.
// Anchored to line start so we only catch "leading tag" form, not inline mentions.
const TAG_LINE_RE =
  /^\s*\[(APPLIED|NOT-APPLIED|FALSE-POSITIVE|OVERRIDE)\][^\S\n]+([\S][^\n]*)/gm

/**
 * Parse tag lines from raw text.
 * Returns array of { tagClass, remainder } objects.
 * tagClass: 'APPLIED' | 'NOT-APPLIED' | 'FALSE-POSITIVE' | 'OVERRIDE'
 * remainder: everything after the tag token (path + because + reason).
 */
function parseTagLines(text) {
  const found = []
  let m
  // Reset lastIndex each call (global regex reuse)
  TAG_LINE_RE.lastIndex = 0
  while ((m = TAG_LINE_RE.exec(text)) !== null) {
    found.push({ tagClass: m[1], remainder: m[2].trim() })
  }
  return found
}

/**
 * Extract pattern path from the remainder text.
 * Accepts absolute paths (/home/tate/...), tilde paths (~/ecodiaos/...),
 * basename-only (fork-by-default-stay-thin-on-main.md), or secrets: prefixed keys.
 * Returns { patternPath, reason }.
 */
function splitPathAndReason(remainder) {
  // Match a path-like token at the start (no spaces unless tilde-prefixed)
  const m = remainder.match(/^(~?\/\S+|secrets:\S+|\S+\.md|\S+\.sh)\s*(.*)?$/)
  if (!m) return { patternPath: remainder.slice(0, 120), reason: '' }
  const patternPath = m[1]
  // Strip leading "because " case-insensitively
  const rest = (m[2] || '').replace(/^because\s+/i, '').trim()
  return { patternPath, reason: rest.slice(0, 250) }
}

/**
 * Write a single application_event JSONL line.
 */
function writeEventLine(tagClass, patternPath, reason, sourceTs) {
  const applied = tagClass === 'APPLIED' ? true : false
  const wasFP = tagClass === 'FALSE-POSITIVE' ? true : null
  const wasOverride = tagClass === 'OVERRIDE' ? true : null

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    matched_dispatch_ts: null,
    tool_name: 'conductor_stream',
    pattern_path: patternPath,
    trigger_keyword: null,
    source_layer: 'stream:conductor_chat',
    applied: tagClass === 'APPLIED' ? true : (tagClass === 'NOT-APPLIED' || tagClass === 'FALSE-POSITIVE' || tagClass === 'OVERRIDE' ? false : null),
    tagged_silent: false,
    was_false_positive: wasFP,
    was_override: wasOverride,
    reason: reason,
    hook_name: 'conductorStreamTagWatcher',
    source_ts: sourceTs || null,
  })

  try {
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true })
    fs.appendFileSync(APP_JSONL, line + '\n', 'utf-8')
  } catch (err) {
    logger.warn('conductorStreamTagWatcher: JSONL write failed', { error: err.message })
  }
}

// Track last-seen text to avoid double-logging (assistant_text fires once per turn)
let _lastContent = null

module.exports = {
  name: 'conductorStreamTagWatcher',
  subscribesTo: ['assistant_text'],

  relevanceFilter: (event) => {
    const content = event && event.data && event.data.content
    if (!content || typeof content !== 'string') return false
    // Fast pre-check before regex - skip if no candidate tag patterns present
    return /\[(APPLIED|NOT-APPLIED|FALSE-POSITIVE|OVERRIDE)\]/.test(content)
  },

  handle: async (event, _ctx) => {
    const content = event && event.data && event.data.content
    if (!content) return

    // Avoid processing the same text twice (belt-and-braces)
    if (content === _lastContent) return
    _lastContent = content

    const tags = parseTagLines(content)
    if (tags.length === 0) return

    const sourceTs = new Date().toISOString()
    for (const { tagClass, remainder } of tags) {
      const { patternPath, reason } = splitPathAndReason(remainder)
      writeEventLine(tagClass, patternPath, reason, sourceTs)
      logger.debug('conductorStreamTagWatcher: tag captured', {
        tagClass,
        patternPath: patternPath.slice(0, 60),
        reason: reason.slice(0, 80),
      })
    }

    if (tags.length > 0) {
      logger.info('conductorStreamTagWatcher: captured tags from conductor stream', {
        count: tags.length,
        classes: tags.map(t => t.tagClass),
      })
    }
  },

  ownsWriteSurface: ['logs/telemetry/application-events.jsonl'],
}

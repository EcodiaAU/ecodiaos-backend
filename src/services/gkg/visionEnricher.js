'use strict'

/**
 * GKG Phase 2 - Vision Enricher.
 *
 * For each classified UIAction, derive a 1-2 sentence `purpose` string
 * describing what the user was trying to accomplish with the click.
 * Context-aware: when frame_path is available + readable, send a
 * multimodal call with the screenshot + 2 preceding actions to
 * claude-haiku-4-5. When the frame is not available (current Phase 1
 * daemon does not yet push frames to storage), fall back to a text-only
 * call with the UIA anchor + handler context, OR mark the action
 * `vision_skipped_reason='no_frame_available'` and continue.
 *
 * Routes through src/services/anthropicMessagesClient.js so the call
 * inherits the canonical OS provider chain (claude_max -> claude_max_2 ->
 * deepseek). DeepSeek does not support image content blocks; for those
 * cases the helper returns vision_unsupported and we fall back to text.
 *
 * Rate-limit: max 30 vision calls/minute via a token-bucket. Calls that
 * exceed the bucket are deferred (the action stays enriched_at IS NULL
 * and the next sweep picks it up).
 *
 * Cost discipline: claude-haiku-4-5 over sonnet per brief - higher volume,
 * cheaper per call. Prompt is kept tight (<200 tokens system + minimal
 * user) and output is capped at ~80 tokens (~300 chars).
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md §3.3, §5.1 :UIAction.reasoning.
 * Authored 7 May 2026 fork_mov80as1_c968cc for GKG Phase 2.
 */

const fs = require('fs')
const path = require('path')
const db = require('../../config/db')
const logger = require('../../config/logger')
const anthropicMessages = require('../anthropicMessagesClient')

// Rate limit: 30 vision calls / 60s rolling window.
const RATE_LIMIT_PER_MIN = 30
const RATE_WINDOW_MS = 60_000
const _rateBucket = []  // timestamps of recent calls

const MAX_PURPOSE_CHARS = 300
const MAX_TOKENS = 120
const VISION_MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT =
  "You are observing a user perform a single GUI action on their computer. " +
  "Based on the screenshot (if provided) plus the UI element they clicked " +
  "and 2 preceding actions, describe in ONE concise sentence what this " +
  "specific click was trying to accomplish. Be concrete and reference the " +
  "visible UI when you can. Do not speculate about goals beyond this click. " +
  "Output the sentence only - no preamble, no quotes, no markdown. Max 300 chars."

function _rateAllowAndStamp() {
  const now = Date.now()
  // Drop expired stamps.
  while (_rateBucket.length && now - _rateBucket[0] > RATE_WINDOW_MS) {
    _rateBucket.shift()
  }
  if (_rateBucket.length >= RATE_LIMIT_PER_MIN) return false
  _rateBucket.push(now)
  return true
}

function _readFrameAsBase64(framePath) {
  if (!framePath || typeof framePath !== 'string') return null
  // Phase 1 frame storage isn't wired to Supabase Storage yet. The daemon
  // currently writes a local path (Corazon-side). Server-side decode of a
  // Corazon path from VPS is not possible. If the path is a local VPS
  // path (e.g. /var/lib/gkg-frames/...) we can read it; otherwise skip.
  if (!framePath.startsWith('/')) return null
  try {
    if (!fs.existsSync(framePath)) return null
    const stat = fs.statSync(framePath)
    // Sanity: 50KB - 5MB
    if (stat.size < 1024 || stat.size > 5_000_000) return null
    const buf = fs.readFileSync(framePath)
    const ext = path.extname(framePath).toLowerCase()
    const mediaType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    return { mediaType, base64: buf.toString('base64') }
  } catch (err) {
    logger.debug('gkg.visionEnricher: frame read failed', {
      framePath, err: err.message,
    })
    return null
  }
}

function _buildUserContent(action, precedingActions, frame) {
  const lines = []
  lines.push(`Handler: ${action.handler_name} (${action.app_bucket || action.process_name || 'unknown'})`)
  if (action.window_title) lines.push(`Window: ${action.window_title}`)
  const a = action.anchor || {}
  const anchorBits = []
  if (a.name) anchorBits.push(`name="${a.name}"`)
  if (a.role) anchorBits.push(`role=${a.role}`)
  if (a.automation_id) anchorBits.push(`automation_id=${a.automation_id}`)
  if (Array.isArray(a.neighbors) && a.neighbors.length) {
    anchorBits.push(`neighbors=[${a.neighbors.slice(0, 3).map(n => JSON.stringify(n)).join(', ')}]`)
  }
  if (a.button) anchorBits.push(`button=${a.button}`)
  if (a.pixel_x !== null && a.pixel_y !== null) anchorBits.push(`@${a.pixel_x},${a.pixel_y}`)
  lines.push(`Click element: ${anchorBits.join(' ') || '(unknown)'}`)
  if (precedingActions.length) {
    lines.push('')
    lines.push('Preceding actions (oldest first):')
    for (const p of precedingActions) {
      const pa = p.anchor || {}
      const desc = pa.name ? `"${pa.name}" (${pa.role || '?'})` : (pa.role || '?') + ' click'
      lines.push(`  - on ${p.handler_name}: ${desc}`)
    }
  }
  lines.push('')
  lines.push('What was the user trying to accomplish with the LAST click?')

  const textBlock = { type: 'text', text: lines.join('\n') }
  if (!frame) return [textBlock]

  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: frame.mediaType,
        data: frame.base64,
      },
    },
    textBlock,
  ]
}

/**
 * Enrich one UIAction. Returns:
 *   { purpose, model, frame_used, vision_skipped_reason? }
 * On any failure path, returns vision_skipped_reason and no purpose. The
 * pipeline still marks enriched_at so the row drains.
 */
async function enrichAction(action, precedingActions = []) {
  if (!_rateAllowAndStamp()) {
    return { vision_skipped_reason: 'rate_limited', deferred: true }
  }

  const frame = _readFrameAsBase64(action.frame_path)
  const content = _buildUserContent(action, precedingActions, frame)

  let result
  try {
    result = await anthropicMessages.createMessage({
      model: VISION_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      allowVision: !!frame,
    })
  } catch (err) {
    logger.warn('gkg.visionEnricher: createMessage failed', {
      action_id: action.action_id, err: err.message,
    })
    return { vision_skipped_reason: 'provider_error' }
  }

  if (result && result.vision_unsupported) {
    // Fall back to text-only call (no image block).
    const textOnly = [{ type: 'text', text: content.find(c => c.type === 'text').text }]
    try {
      result = await anthropicMessages.createMessage({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: textOnly }],
        allowVision: false,
      })
    } catch (err) {
      return { vision_skipped_reason: 'text_fallback_failed' }
    }
  }

  const blocks = result?.json?.content || []
  const text = blocks
    .filter(b => b && b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim()

  if (!text) {
    return { vision_skipped_reason: 'empty_response' }
  }

  const purpose = text.slice(0, MAX_PURPOSE_CHARS)
  return {
    purpose,
    model: VISION_MODEL,
    frame_used: !!frame,
    provider: result.providerUsed,
  }
}

/**
 * Walk a list of classified actions, attach `purpose` to each (or
 * vision_skipped_reason). Mark each event's enriched_at = NOW() afterward.
 * Returns the same list with enrichment fields added.
 */
async function enrichActionsBatch(actions) {
  if (!actions || !actions.length) return []

  // Build session-keyed history so we can pass 2 preceding actions to
  // each call without repeating the lookup.
  const bySession = new Map()
  const sorted = [...actions].sort((a, b) => {
    if (a.session_id < b.session_id) return -1
    if (a.session_id > b.session_id) return 1
    return a.sequence_no - b.sequence_no
  })

  const enriched = []
  for (const action of sorted) {
    const history = bySession.get(action.session_id) || []
    const preceding = history.slice(-2)
    const result = await enrichAction(action, preceding)
    if (result.deferred) {
      // Rate-limited: don't mark enriched_at, leave for next sweep.
      enriched.push({ ...action, _enrich_deferred: true })
      continue
    }
    const merged = { ...action, ...result }
    enriched.push(merged)
    history.push(action)
    bySession.set(action.session_id, history)

    // Mark enriched_at row-by-row so we don't lose progress on SIGTERM.
    try {
      await db`
        UPDATE gkg_events SET enriched_at = NOW()
        WHERE id = ${action.event_id}::uuid AND enriched_at IS NULL
      `
    } catch (err) {
      logger.warn('gkg.visionEnricher: enriched_at update failed', {
        event_id: action.event_id, err: err.message,
      })
    }
  }

  return enriched
}

module.exports = {
  enrichAction,
  enrichActionsBatch,
  RATE_LIMIT_PER_MIN,
  MAX_PURPOSE_CHARS,
  VISION_MODEL,
  _rateAllowAndStamp,
}

'use strict'

/**
 * doctrineService.js (2026-05-26)
 *
 * Producer for the approval_queue doctrine_write item type.
 *
 *   proposePattern({ pattern_path, body, summary?, force_queue? })
 *
 * Gate rule:
 *   - Body frontmatter contains `load_bearing: true`        -> queue
 *   - Path matches load-bearing neighbourhood (CLAUDE.md,
 *     100-percent-autonomy-doctrine, superpowers/)         -> queue
 *   - opts.force_queue === true                             -> queue
 *   - Otherwise: caller writes directly (autonomy doctrine).
 *
 * Caller is responsible for the actual write+commit when queued=false.
 * When queued=true, the action handler will perform write+commit on Y.
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §3.
 */

const logger = require('../config/logger')
// Lazy-require queue so this module can be imported in test contexts without
// triggering db/env load. queue is only used inside proposePattern.

const LOAD_BEARING_PATH_PATTERNS = [
  /CLAUDE\.md$/i,
  /100-percent-autonomy-doctrine/i,
  /\/superpowers\//,
  /\/patterns\/decide-do-not-ask/i,
  /\/patterns\/action-over-plans/i,
]

function _hasLoadBearingFrontmatter(body) {
  if (!body || typeof body !== 'string') return false
  // YAML frontmatter is between leading --- and the next ---
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return false
  // Match `load_bearing: true` (allow surrounding whitespace, optional quotes)
  return /^\s*load_bearing\s*:\s*(true|yes|"true"|'true')\s*$/im.test(m[1])
}

function _pathMatchesLoadBearing(p) {
  if (!p) return false
  return LOAD_BEARING_PATH_PATTERNS.some(re => re.test(p))
}

async function proposePattern({
  pattern_path,
  body,
  summary = null,
  force_queue = false,
}) {
  if (!pattern_path || !body) {
    return { ok: false, error: 'pattern_path and body required' }
  }

  const frontmatterMatch = _hasLoadBearingFrontmatter(body)
  const pathMatch = _pathMatchesLoadBearing(pattern_path)
  const mustQueue = force_queue || frontmatterMatch || pathMatch

  if (!mustQueue) {
    return {
      ok: true,
      queued: false,
      reason: 'routine_doctrine',
      pattern_path,
    }
  }

  const reasons = []
  if (frontmatterMatch) reasons.push('frontmatter_load_bearing')
  if (pathMatch) reasons.push('path_in_load_bearing_neighbourhood')
  if (force_queue) reasons.push('force_queue')

  const queue = require('./approvalQueueService')
  const r = await queue.enqueueDoctrineWrite({
    pattern_path,
    body,
    summary: summary
      ? `${summary} [gate: ${reasons.join(',')}]`
      : `Proposed pattern at ${pattern_path} [gate: ${reasons.join(',')}]`,
  })

  if (!r.ok) {
    logger.warn('doctrineService.proposePattern: enqueue failed', { error: r.error, pattern_path })
    return r
  }

  logger.info('doctrineService.proposePattern: enqueued for Tate review', {
    id: r.id, pattern_path, reasons,
  })
  return { ok: true, queued: true, id: r.id, deduped: !!r.deduped, reasons }
}

module.exports = {
  proposePattern,
  // Exported for unit-test isolation:
  _hasLoadBearingFrontmatter,
  _pathMatchesLoadBearing,
}

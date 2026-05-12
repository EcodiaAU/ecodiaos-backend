'use strict'

/**
 * conductedRestart.js
 *
 * Chokepoint service for ecodia-api restart coordination.
 *
 * The conductor (main session) owns the ecodia-api lifecycle. Forks and
 * internal services that believe a restart is needed MUST call
 * conductedRestart.request() rather than issuing `pm2 restart ecodia-api`
 * directly via mcp__vps__pm2_restart, shell_exec, or child_process.exec.
 *
 * request() writes a coordination row to pending_restart_requests and RETURNS.
 * It does NOT restart. The conductor reads pending rows via getPending() on its
 * next meta-loop turn and decides whether to approve and execute.
 *
 * ALLOWLISTED bypass callers (may issue direct pm2 restart, documented here):
 *   1. nightlyRestartService.js  - conductor-owned, grace window + busy-check,
 *                                  runs in ecodia-conductor (not api forks)
 *   2. api-watchdog.sh           - OS-level external watchdog with blip detection,
 *                                  runs from host cron, not from inside ecodia-api
 *   3. osSessionService.js       - emergency auto-restart after N consecutive turn
 *                                  failures; uses request() for audit trail but
 *                                  still fires immediately (emergency recovery path)
 *
 * For fork-side callers (cannot require() Node modules directly):
 *   Option A - HTTP (preferred, typed):
 *     curl -s -X POST http://localhost:3001/api/os-session/request-restart \
 *       -H "Content-Type: application/json" \
 *       -d '{"reason":"...","requesting_fork_id":"fork_xxx"}'
 *   Option B - Direct DB write (also acceptable):
 *     mcp__supabase__db_execute:
 *       INSERT INTO pending_restart_requests (requesting_fork_id, reason)
 *       VALUES ('fork_xxx', '...');
 *
 * Conductor meta-loop reads pending rows and decides:
 *   SELECT id, requesting_fork_id, reason, requested_at
 *   FROM pending_restart_requests WHERE status = 'pending' ORDER BY requested_at;
 *
 * Stamped: fork_mp1xbay8_19c59d, 12 May 2026 (Tate verbatim 11:00 AEST)
 * Origin: 4-fork SIGTERM cascade at 10:50 AEST 12 May 2026 caused by
 *         fork_mp1wwwl0_6d2263 issuing pm2 restart unilaterally during
 *         Phase 3 conductor sibling activation.
 */

const db = require('../config/db')
const logger = require('../config/logger')

/**
 * Request an ecodia-api restart via the coordination table.
 * Does NOT restart. The conductor decides.
 *
 * @param {object} opts
 * @param {string} opts.reason            - Human-readable reason for the restart
 * @param {string} opts.requesting_fork_id - Fork ID, 'conductor', or allowlisted bypass name
 * @returns {Promise<{id: string, status: 'pending'}>}
 */
async function request({ reason, requesting_fork_id }) {
  if (!reason) throw new Error('conductedRestart.request: reason is required')
  if (!requesting_fork_id) throw new Error('conductedRestart.request: requesting_fork_id is required')

  const [row] = await db`
    INSERT INTO pending_restart_requests (requesting_fork_id, reason, status, requested_at)
    VALUES (${requesting_fork_id}, ${reason}, 'pending', NOW())
    RETURNING id, status
  `

  logger.info('conductedRestart: restart request queued - conductor will decide', {
    id: row.id,
    requesting_fork_id,
    reason,
  })

  return row
}

/**
 * Get all pending restart requests. Called by the conductor meta-loop.
 * @returns {Promise<Array<{id, requesting_fork_id, reason, requested_at}>>}
 */
async function getPending() {
  return db`
    SELECT id, requesting_fork_id, reason, requested_at
    FROM pending_restart_requests
    WHERE status = 'pending'
    ORDER BY requested_at ASC
  `
}

/**
 * Approve a request (conductor is about to execute the actual restart).
 * @param {object} opts
 * @param {string} opts.id             - Row ID
 * @param {string} [opts.conductor_note] - Optional note from conductor
 */
async function approve({ id, conductor_note }) {
  await db`
    UPDATE pending_restart_requests
    SET status = 'approved', conductor_note = ${conductor_note || null}, resolved_at = NOW()
    WHERE id = ${id}
  `
  logger.info('conductedRestart: request approved by conductor', { id, conductor_note })
}

/**
 * Dismiss a request (conductor decided restart is not needed right now).
 * @param {object} opts
 * @param {string} opts.id     - Row ID
 * @param {string} opts.reason - Why it was dismissed
 */
async function dismiss({ id, reason }) {
  await db`
    UPDATE pending_restart_requests
    SET status = 'dismissed', conductor_note = ${reason || null}, resolved_at = NOW()
    WHERE id = ${id}
  `
  logger.info('conductedRestart: request dismissed by conductor', { id, reason })
}

/**
 * Mark a request as executed (the actual pm2 restart was issued by conductor).
 * @param {object} opts
 * @param {string} opts.id - Row ID
 */
async function markExecuted({ id }) {
  await db`
    UPDATE pending_restart_requests
    SET status = 'executed', resolved_at = NOW()
    WHERE id = ${id}
  `
  logger.info('conductedRestart: request marked executed', { id })
}

module.exports = { request, getPending, approve, dismiss, markExecuted }

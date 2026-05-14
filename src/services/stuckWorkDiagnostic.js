'use strict'

/**
 * stuckWorkDiagnostic — answers "what am I stuck on right now?"
 *
 * Aggregates signal across the conductor's blockers:
 *   - working_set rows in status='blocked' or 'active' with last_touched > 30min ago
 *   - os_forks in 'spawning'/'running'/'reporting' with no heartbeat in 10min
 *   - dispatch_queue rows still 'queued' past their expires_at
 *   - status_board rows with next_action_due in the past, next_action_by='ecodiaos'
 *   - observer_signals priority=1 unacknowledged
 *   - outbound_actions stuck in 'dispatched' past 30min
 *   - pending_restart_requests with status='pending'
 *
 * Returns a structured brief the conductor (or an ops dashboard) can read in
 * one tool call. Origin: AUTONOMY_AUDIT_2026-05-13 conductor audit, "no
 * 'what am I stuck on?' diagnostic primitive".
 */

const db = require('../config/db')
const logger = require('../config/logger')

async function _safe(label, queryFn, fallback = []) {
  try { return await queryFn() }
  catch (err) {
    logger.debug(`stuckWorkDiagnostic: ${label} probe failed`, { error: err.message })
    return fallback
  }
}

async function diagnose() {
  const [
    stale_threads,
    silent_forks,
    expired_dispatches,
    overdue_status_board,
    p1_signals,
    stuck_outbound,
    pending_restarts,
  ] = await Promise.all([
    _safe('working_set', async () => db`
      SELECT id, topic, status, blocking_on, last_touched_at,
             EXTRACT(EPOCH FROM (NOW() - last_touched_at))::int AS age_seconds
      FROM working_set
      WHERE status IN ('active','blocked') AND closed_at IS NULL
        AND last_touched_at < NOW() - INTERVAL '30 minutes'
      ORDER BY last_touched_at ASC LIMIT 20
    `),
    _safe('os_forks', async () => db`
      SELECT fork_id, parent_id, status, started_at, last_heartbeat,
             EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::int AS heartbeat_age_seconds
      FROM os_forks
      WHERE status IN ('spawning','running','reporting')
        AND last_heartbeat < NOW() - INTERVAL '10 minutes'
      ORDER BY started_at ASC LIMIT 20
    `),
    _safe('dispatch_queue', async () => db`
      SELECT id, trigger_event_type, dispatch_type, created_at, expires_at
      FROM dispatch_queue
      WHERE status = 'queued'
        AND expires_at IS NOT NULL AND expires_at < NOW()
      ORDER BY created_at ASC LIMIT 20
    `),
    _safe('status_board', async () => db`
      SELECT id, name, status, next_action, next_action_by, next_action_due, priority
      FROM status_board
      WHERE archived_at IS NULL
        AND next_action_by = 'ecodiaos'
        AND next_action_due < NOW()
      ORDER BY priority, next_action_due ASC LIMIT 20
    `),
    _safe('observer_signals', async () => db`
      SELECT id, observer_name, signal_kind, content, confidence, created_at
      FROM observer_signals
      WHERE acknowledged = FALSE AND priority = 1
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 20
    `),
    _safe('outbound_actions', async () => db`
      SELECT id, action_type, target, attempt_count, dispatched_at,
             EXTRACT(EPOCH FROM (NOW() - dispatched_at))::int AS age_seconds
      FROM outbound_actions
      WHERE status = 'dispatched' AND dispatched_at < NOW() - INTERVAL '30 minutes'
      ORDER BY dispatched_at ASC LIMIT 20
    `),
    _safe('pending_restart_requests', async () => db`
      SELECT id, requesting_fork_id, reason, requested_at
      FROM pending_restart_requests
      WHERE status = 'pending'
      ORDER BY requested_at ASC LIMIT 10
    `),
  ])

  const counts = {
    stale_threads: stale_threads.length,
    silent_forks: silent_forks.length,
    expired_dispatches: expired_dispatches.length,
    overdue_status_board: overdue_status_board.length,
    p1_signals: p1_signals.length,
    stuck_outbound: stuck_outbound.length,
    pending_restarts: pending_restarts.length,
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0)

  const verdict = total === 0
    ? 'clear'
    : (p1_signals.length > 0 || silent_forks.length > 0 || pending_restarts.length > 0)
      ? 'stuck'
      : 'attention'

  return {
    generated_at: new Date().toISOString(),
    verdict,        // 'clear' | 'attention' | 'stuck'
    total_signals: total,
    counts,
    stale_threads,
    silent_forks,
    expired_dispatches,
    overdue_status_board,
    p1_signals,
    stuck_outbound,
    pending_restarts,
  }
}

module.exports = { diagnose }

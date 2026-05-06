'use strict'

/**
 * dispatchQueueListener
 *
 * Subscribes to db:event for os_forks UPDATE transitions and fires queued
 * dispatch_queue rows whose trigger matches and whose depends_on row has
 * fired-and-succeeded. Replaces the timed-cascade pattern with event-driven
 * dispatch - conductor enqueues "when F6 ships clean, fire F7" once and
 * walks away.
 *
 * Doctrine: ~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md
 *   Layer 1 (producer):     forkService writes os_forks status='done'
 *   Layer 2 (trigger):      pg_notify on os_forks UPDATE (eos_listener_events)
 *   Layer 3 (bridge):       dbBridge.js fans pg_notify → wsManager.publish('db:event')
 *   Layer 4 (listener):     THIS FILE - relevanceFilter + handle
 *   Layer 5 (side-effect):  dispatch_payload executed via internal HTTP / mcp tool
 *
 * Origin: fork_mos3hwpk_9fbdc5, 5 May 2026.
 */

const logger = require('../../config/logger')
const db = require('../../config/db')

// Map trigger_event_type → which os_forks row transitions match it.
function _eventMatchesTrigger(triggerType, row) {
  if (!row || !row.status) return false
  switch (triggerType) {
    case 'fork_complete':
      return row.status === 'done' || row.status === 'aborted' || row.status === 'error'
    case 'fork_done_clean': {
      if (row.status !== 'done') return false
      // Heuristic: result text or next_step doesn't carry the phantom_bail/error markers.
      const r = String(row.result || '').toLowerCase()
      if (r.includes('phantom_bail') || r.includes('error')) return false
      return true
    }
    case 'fork_failed':
      return row.status === 'aborted' || row.status === 'error'
    default:
      return false
  }
}

// Match the optional trigger_event_match JSONB constraints against the row.
function _matchConstraintsSatisfied(match, row) {
  if (!match || typeof match !== 'object') return true
  if (Object.keys(match).length === 0) return true
  if (match.prior_fork_id) {
    if (String(row.fork_id) !== String(match.prior_fork_id)) return false
  }
  if (match.prior_fork_brief_contains) {
    const brief = String(row.brief || row.prompt || '').toLowerCase()
    if (!brief.includes(String(match.prior_fork_brief_contains).toLowerCase())) return false
  }
  if (match.status) {
    if (String(row.status) !== String(match.status)) return false
  }
  return true
}

async function _executeDispatch(qrow, sourceEventId) {
  const payload = qrow.dispatch_payload || {}
  switch (qrow.dispatch_type) {
    case 'spawn_fork': {
      // Call forkService.spawnFork() directly - it's the canonical primitive.
      // Listeners are allowed to import forkService (the registry-load-time
      // ban is on osSessionService specifically).
      try {
        const fork = require('../forkService')
        const snap = await fork.spawnFork({
          brief: payload.brief,
          context_mode: payload.context_mode || 'brief',
          parent_fork_id: payload.parent_fork_id || 'main',
        })
        return { ok: true, fork_id: snap?.fork_id || snap?.id || null }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }
    case 'fire_cron': {
      // Set next_run_at = NOW() on the target task. The schedulerPoller picks
      // it up on the next 30s cycle. Lighter-touch than firing through MCP.
      try {
        let target = null
        if (payload.task_id) {
          const [t] = await db`SELECT id, name FROM os_scheduled_tasks WHERE id = ${payload.task_id} LIMIT 1`
          target = t
        }
        if (!target && payload.task_name) {
          const [t] = await db`SELECT id, name FROM os_scheduled_tasks WHERE name = ${payload.task_name} LIMIT 1`
          target = t
        }
        if (!target) return { ok: false, error: 'no resolvable task_id or task_name' }
        await db`UPDATE os_scheduled_tasks SET next_run_at = NOW() WHERE id = ${target.id}`
        return { ok: true, task_id: target.id, task_name: target.name, scheduled_for: 'next_poll_cycle' }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }
    case 'send_email':
    case 'sms_tate':
    case 'enqueue_message':
      // Reserved for future. Adding now would require new internal HTTP routes
      // (/api/gmail/send, /api/sms/tate, /api/os-session/message-from-dispatch)
      // that don't yet exist as in-process callable surfaces. Leave the schema
      // open and reject at fire-time so the queue row visibly fails (not silent
      // drop). When these routes ship, replace with axios calls similar to
      // the spawn_fork path.
      return { ok: false, error: `dispatch_type=${qrow.dispatch_type} not yet implemented in v1; enqueue with spawn_fork or fire_cron` }
    default:
      return { ok: false, error: `unknown dispatch_type: ${qrow.dispatch_type}` }
  }
}

async function _processMatchingRows(triggerType, row, sourceEventId) {
  // Pull queued rows whose trigger matches THIS event type and whose
  // depends_on (if any) has fired-and-succeeded.
  const candidates = await db`
    SELECT q.* FROM dispatch_queue q
    LEFT JOIN dispatch_queue dep ON q.depends_on_id = dep.id
    WHERE q.status = 'queued'
      AND q.trigger_event_type = ${triggerType}
      AND (q.expires_at IS NULL OR q.expires_at > NOW())
      AND (q.depends_on_id IS NULL OR (dep.status = 'fired' AND (dep.fired_result->>'ok')::boolean = true))
    ORDER BY q.priority, q.created_at
    LIMIT 50
  `
  if (candidates.length === 0) return 0

  let firedCount = 0
  for (const qrow of candidates) {
    if (!_matchConstraintsSatisfied(qrow.trigger_event_match, row)) continue

    // Atomic claim: UPDATE … WHERE status='queued' RETURNING. Prevents race
    // if multiple events arrive in parallel before the first marks it fired.
    const claimed = await db`
      UPDATE dispatch_queue
      SET status = 'fired', fired_at = NOW(), fired_by_event_id = ${sourceEventId}
      WHERE id = ${qrow.id} AND status = 'queued'
      RETURNING id
    `
    if (claimed.length === 0) continue // someone else got it

    const result = await _executeDispatch(qrow, sourceEventId)
    await db`
      UPDATE dispatch_queue
      SET fired_result = ${JSON.stringify(result)}::jsonb,
          status = ${result.ok ? 'fired' : 'failed'}
      WHERE id = ${qrow.id}
    `
    logger.info('dispatchQueueListener: fired row', {
      id: qrow.id,
      trigger: qrow.trigger_event_type,
      dispatch: qrow.dispatch_type,
      ok: result.ok,
      fork_id: row.fork_id,
    })
    firedCount++
  }
  return firedCount
}

module.exports = {
  name: 'dispatchQueueListener',
  subscribesTo: ['db:event'],

  relevanceFilter: (event) => {
    const d = event && event.data
    if (!d || d.type !== 'db:event') return false
    if (d.table !== 'os_forks') return false
    if (d.action !== 'UPDATE') return false
    if (!d.row) return false
    const status = d.row.status
    // Match terminal transitions only - keeps work bounded.
    return status === 'done' || status === 'aborted' || status === 'error'
  },

  handle: async (event, ctx) => {
    const row = event.data.row
    const sourceEventId = ctx.sourceEventId

    // Each terminal event can match multiple trigger types. Process each.
    const triggerTypes = ['fork_complete', 'fork_done_clean', 'fork_failed']
    let totalFired = 0
    for (const tt of triggerTypes) {
      if (!_eventMatchesTrigger(tt, row)) continue
      try {
        const n = await _processMatchingRows(tt, row, sourceEventId)
        totalFired += n
      } catch (err) {
        logger.warn('dispatchQueueListener: process error', { trigger: tt, error: err.message, fork_id: row.fork_id })
      }
    }

    if (totalFired > 0) {
      logger.info('dispatchQueueListener: dispatched matches for fork transition', {
        fork_id: row.fork_id,
        status: row.status,
        fired: totalFired,
      })
    }
  },

  ownsWriteSurface: ['dispatch_queue'],

  // Exposed for tests + admin CLI.
  _executeDispatch,
  _eventMatchesTrigger,
  _matchConstraintsSatisfied,
}

'use strict'

/**
 * perceptionDispatcher matcher: schedule_drift
 *
 * Source: drafts/proposed-matchers/schedule_drift.js (W2 listener gap analysis).
 * Adapted to closure-style.
 *
 * Companion to existing `status_board` matcher. The existing one fires only
 * when status_board is REFERENCED by an event. This one fires on heartbeat-
 * class events and surfaces ONLY the freshly-overdue rows (crossed due time
 * in the last 60min) — tighter signal than the existing "all overdue" pile.
 *
 * Fires immediately on pm2 restart (cron + meta_loop + turn_end already
 * publish heartbeat-class events).
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

module.exports = {
  domain: 'schedule_drift',

  // 60min — heartbeat-class events fire many times per hour but the matcher's
  // payload is "rows that crossed due in last 60min", so re-firing more often
  // than once an hour just resurfaces the same rows. C3 (fork_mosn8o5x_7a0e54).
  dedupeWindowMs: 60 * 60 * 1000,

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind.includes('cron') ||
           kind.includes('turn_end') ||
           kind.includes('meta_loop') ||
           kind === 'heartbeat'
  },

  async dispatch(event) {
    try {
      const newlyOverdue = await db`
        SELECT id, name, next_action, next_action_due, priority, next_action_by
        FROM status_board
        WHERE archived_at IS NULL
          AND next_action_due IS NOT NULL
          AND next_action_due < NOW()
          AND next_action_due >= NOW() - INTERVAL '60 minutes'
        ORDER BY priority ASC, next_action_due ASC
        LIMIT 10
      `
      if (newlyOverdue.length === 0) return

      await perceptionBus.publish({
        source: 'perception_dispatcher',
        kind: 'schedule_drift_freshly_overdue',
        data: {
          trigger_event: `${event.source}/${event.kind}`,
          freshly_overdue_count: newlyOverdue.length,
          rows: newlyOverdue.map(r => ({
            id: r.id,
            name: r.name,
            next_action: r.next_action,
            due: r.next_action_due,
            priority: r.priority,
            by: r.next_action_by,
          })),
        },
        confidence: 0.85,
      })
    } catch (err) {
      logger.debug('perceptionDispatcher: schedule_drift dispatch failed', { error: err.message })
    }
  },
}

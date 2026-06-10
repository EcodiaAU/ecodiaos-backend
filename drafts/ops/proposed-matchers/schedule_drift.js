'use strict'

/**
 * Proposed perceptionDispatcher matcher: schedule_drift
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * Companion to existing `status_board` matcher. The existing one fires only
 * when status_board is REFERENCED by an event (kind/data contains 'status_board').
 * This one fires on a DIFFERENT signal: when ANY event publishes that crosses
 * a status_board row's next_action_due time, the row is freshly overdue —
 * surface ONLY that newly-overdue row, not the dispatcher's existing "all
 * overdue items" pile.
 *
 * Distinct from existing matcher: existing one returns a snapshot of all
 * overdue rows at trigger-time. This one identifies the freshly-overdue
 * (newly crossed in last hour) and surfaces them as a discrete reminder
 * with context — same trigger event but tighter signal.
 *
 * Cadence safeguard: dedupe key incorporates `freshly_overdue_count` so
 * we don't re-fire if the same set is already known. Also caps to once
 * per 30min per row id (handled in dispatcher's _shouldDispatch).
 */

module.exports = {
  domain: 'schedule_drift',

  test(event) {
    // Fire on any heartbeat-class event (cron fire, perception summary,
    // turn-end). These naturally pulse every few minutes.
    const kind = (event.kind || '').toLowerCase()
    return kind.includes('cron') ||
           kind.includes('turn_end') ||
           kind.includes('meta_loop') ||
           kind === 'heartbeat'
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus

    try {
      // Find rows that crossed their due date in the last 60min
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
      // dispatcher logger handles
    }
  },
}

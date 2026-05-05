'use strict'

/**
 * Proposed perceptionDispatcher matcher: status_board_priority_inversion
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * Detects status_board rows that have been P1 for >14 days. Either they're
 * not actually P1 (de-prioritise) or the conductor has been failing them
 * (escalate). Avoids the silent P1-row-rot drift mode.
 *
 * Cadence: dedupe per row.id over 7 days.
 */

const _alertedRows = new Map() // row_id -> ts

module.exports = {
  domain: 'status_board_priority_inversion',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    // Fire on heartbeat-class events; cron tick or turn-end is enough cadence.
    return kind.includes('cron') ||
           kind.includes('heartbeat') ||
           kind === 'meta_loop' ||
           kind === 'turn_end'
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus

    try {
      const stale = await db`
        SELECT id, name, status, last_touched, created_at, next_action
        FROM status_board
        WHERE archived_at IS NULL
          AND priority = 1
          AND (created_at < NOW() - INTERVAL '14 days'
            OR last_touched < NOW() - INTERVAL '14 days')
        ORDER BY created_at ASC
        LIMIT 5
      `
      if (stale.length === 0) return

      const now = Date.now()
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

      for (const row of stale) {
        const last = _alertedRows.get(row.id)
        if (last && (now - last) < SEVEN_DAYS) continue
        _alertedRows.set(row.id, now)

        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'status_board_priority_inversion',
          data: {
            row_id: row.id,
            name: row.name,
            status: row.status,
            age_days: Math.round((now - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000)),
            last_touched: row.last_touched,
            next_action: row.next_action,
            verdict: 'either-demote-or-escalate',
          },
          confidence: 0.7,
        })
      }
    } catch (err) {
      // logger handles
    }
  },
}

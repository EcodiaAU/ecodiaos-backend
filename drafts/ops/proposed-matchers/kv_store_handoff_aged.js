'use strict'

/**
 * Proposed perceptionDispatcher matcher: kv_store_handoff_aged
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * Catches the canonical drift mode: kv_store keys (handoff_state, autonomous_pilot.active,
 * day_plan_*) that capture in-the-moment context but were written hours ago and
 * are now stale. The conductor reads them as if they're current → bad decisions.
 *
 * Detection: scan kv_store for keys matching pattern handoff_state /
 * autonomous_pilot.active / session.* / ceo.day_plan_* with updated_at > 2h old.
 * Surface as drift signal so conductor knows to re-probe ground truth.
 */

const _alertedKeys = new Map() // key -> ts

module.exports = {
  domain: 'kv_store_handoff_aged',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind.includes('cron') ||
           kind === 'meta_loop' ||
           kind.includes('turn_end')
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus

    try {
      const aged = await db`
        SELECT key, updated_at
        FROM kv_store
        WHERE (
          key LIKE 'session.handoff_state%'
          OR key LIKE 'ceo.autonomous_pilot.active%'
          OR key LIKE 'ceo.day_plan_%'
          OR key LIKE 'handoff_state%'
        )
          AND updated_at < NOW() - INTERVAL '2 hours'
          AND updated_at > NOW() - INTERVAL '7 days'
        LIMIT 10
      `
      if (aged.length === 0) return

      const now = Date.now()
      const SIX_HOURS = 6 * 60 * 60 * 1000

      for (const row of aged) {
        const last = _alertedKeys.get(row.key)
        if (last && (now - last) < SIX_HOURS) continue
        _alertedKeys.set(row.key, now)

        const ageHours = Math.round((now - new Date(row.updated_at).getTime()) / (60 * 60 * 1000))

        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'kv_store_handoff_aged',
          data: {
            key: row.key,
            updated_at: row.updated_at,
            age_hours: ageHours,
            verdict: 'stale - re-probe ground truth before relying on this value',
          },
          confidence: 0.7,
        })
      }
    } catch (err) {
      // logger handles
    }
  },
}

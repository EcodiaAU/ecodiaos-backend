'use strict'

/**
 * GET /api/ops/listener-health
 *
 * Per-listener health snapshot. Surfaces fires/drops/errors/queue/lastFireAt
 * and a derived status ('healthy' | 'idle' | 'erroring' | 'dropping' | 'unknown').
 *
 * Designed to be queried by:
 *   - The conductor at turn-start when something feels wrong ("is anything dark?")
 *   - A weekly health audit cron (status='idle' for >7 days → status_board P3)
 *   - The /ops dashboard
 *
 * Companion to listener-stats (which is matcher- and bus-oriented). This one is
 * listener-oriented: it tells you which subscriber is silent.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 — memory/perception audit found the registry
 * tracks _drops but not fires/errors, and there is no "wired but dark" alerter
 * other than the existing /listener-stats heuristic (which proxies via
 * os_observations and misses listeners whose handle() is firing but the
 * downstream substrate is unreachable).
 */

const { Router } = require('express')
const router = Router()

const logger = require('../../config/logger')
const registry = require('../../services/listeners/registry')

router.get('/', async (_req, res) => {
  try {
    const snapshot = typeof registry.getHealth === 'function' ? registry.getHealth() : []
    const summary = {
      total: snapshot.length,
      healthy: 0, idle: 0, erroring: 0, dropping: 0, unknown: 0,
    }
    for (const row of snapshot) summary[row.status] = (summary[row.status] || 0) + 1

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      summary,
      listeners: snapshot.sort((a, b) => {
        // Surface problem children first.
        const order = { dropping: 0, erroring: 1, unknown: 2, idle: 3, healthy: 4 }
        return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      }),
    })
  } catch (err) {
    logger.error('/api/ops/listener-health: failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

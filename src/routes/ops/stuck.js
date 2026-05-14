'use strict'

/**
 * GET /api/ops/stuck
 *
 * One-shot diagnostic: "what is the conductor stuck on right now?" Aggregates
 * blockers across working_set, os_forks, dispatch_queue, status_board,
 * observer_signals, outbound_actions, and pending_restart_requests.
 *
 * Designed for:
 *   - the conductor at turn-start when something feels wrong
 *   - a /ops dashboard tile
 *   - the meta-loop deciding whether to dispatch a diagnostic fork
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13.
 */

const { Router } = require('express')
const router = Router()
const logger = require('../../config/logger')
const diagnostic = require('../../services/stuckWorkDiagnostic')

router.get('/', async (_req, res) => {
  try {
    const report = await diagnostic.diagnose()
    res.json({ ok: true, ...report })
  } catch (err) {
    logger.error('/api/ops/stuck failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

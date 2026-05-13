'use strict'
/**
 * /api/scheduler - scheduler observability endpoints.
 *
 * Phase 4 dashboard (fork_mp3pkavh_12c438): Scheduler Heat Map panel.
 * GET /api/scheduler/heatmap — active cron tasks with fired/not-fired
 * flags for 1h / 6h / 24h windows.
 */

const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const db = require('../config/db')
const logger = require('../config/logger')

router.use(auth)

// GET /api/scheduler/heatmap
// Returns active cron tasks ordered by last_run_at DESC.
// Each row carries boolean fired_1h / fired_6h / fired_24h derived from last_run_at.
// UI shows a grid: cron name × time window with ■ fired / · not-fired.
router.get('/heatmap', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT name, last_run_at, next_run_at
      FROM os_scheduled_tasks
      WHERE status = 'active' AND type = 'cron'
      ORDER BY last_run_at DESC NULLS LAST, name
      LIMIT 25
    `
    const now = Date.now()
    const MS_1H  = 3_600_000
    const MS_6H  = 6 * MS_1H
    const MS_24H = 24 * MS_1H

    const crons = rows.map((r) => {
      const last = r.last_run_at ? new Date(r.last_run_at).getTime() : null
      const age  = last !== null ? now - last : Infinity
      return {
        name:        r.name,
        last_run_at: last !== null ? new Date(last).toISOString() : null,
        next_run_at: r.next_run_at ? new Date(r.next_run_at).toISOString() : null,
        fired_1h:    age < MS_1H,
        fired_6h:    age < MS_6H,
        fired_24h:   age < MS_24H,
      }
    })
    res.json({ crons })
  } catch (err) {
    logger.debug('/scheduler: heatmap unavailable', { error: err.message })
    next(err)
  }
})

module.exports = router

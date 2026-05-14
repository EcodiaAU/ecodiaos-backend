'use strict'

/**
 * GET /api/ops/pattern-fire
 *
 * Pattern surfacing telemetry. Two views:
 *   ?view=ranked       — top 100 patterns by fire count, oldest-first by accept-rate ascending
 *   ?view=cold         — patterns with zero fires since cutoff days (default 30)
 *   ?windowDays=14     — for ranked view
 *   ?minFires=10       — minimum fire count to include in ranked view
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13. Powers the weekly tuning pass that narrows
 * noisy patterns and archives cold ones.
 */

const { Router } = require('express')
const router = Router()
const logger = require('../../config/logger')
const tracker = require('../../services/patternFireTracker')

router.get('/', async (req, res) => {
  try {
    const view = String(req.query.view || 'ranked').toLowerCase()
    if (view === 'ranked') {
      const windowDays = Math.max(1, Math.min(90, parseInt(req.query.windowDays, 10) || 14))
      const minFires = Math.max(1, Math.min(1000, parseInt(req.query.minFires, 10) || 10))
      const rows = await tracker.topPatterns({ windowDays, minFires })
      res.json({ ok: true, view, windowDays, minFires, rows })
    } else if (view === 'cold') {
      // Cold = no fires in the window. Implement inline because the tracker
      // doesn't expose a "list all known patterns" helper.
      const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30))
      const fs = require('fs')
      const path = require('path')
      const patternsDir = process.env.PATTERNS_DIR || path.join(process.env.HOME || '/home/tate', 'ecodiaos/patterns')
      let known = []
      try {
        known = fs.readdirSync(patternsDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md')
      } catch (err) {
        logger.warn('/api/ops/pattern-fire cold: readdir failed', { error: err.message, dir: patternsDir })
      }
      const db = require('../../config/db')
      const fired = await db`
        SELECT DISTINCT pattern_path
        FROM pattern_fire_event
        WHERE fired_at >= NOW() - (${days}::int * INTERVAL '1 day')
      `
      const firedSet = new Set(fired.map(r => path.basename(r.pattern_path || '')))
      const cold = known.filter(f => !firedSet.has(f))
      res.json({ ok: true, view, days, knownCount: known.length, coldCount: cold.length, cold })
    } else {
      res.status(400).json({ ok: false, error: 'view must be ranked or cold' })
    }
  } catch (err) {
    logger.error('/api/ops/pattern-fire failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router

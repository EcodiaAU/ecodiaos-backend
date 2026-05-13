/**
 * Observer Signals route — GET /api/observer-signals
 *
 * Returns last 10 unexpired observer_signals, ordered by created_at DESC.
 * Powers the OBSERVER panel in CortexAmbient Phase 2.
 *
 * No auth required — read-only ambient data.
 *
 * Origin: fork_mp3ndv83_63898a, 2026-05-13
 */
const { Router } = require('express')
const db = require('../config/db')
const logger = require('../config/logger')

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT
        id, observer_name, signal_kind, message, reason,
        confidence, fingerprint, acknowledged, expires_at, created_at
      FROM observer_signals
      WHERE (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 10
    `

    const signals = rows.map((r) => ({
      id: r.id,
      observer_name: r.observer_name ?? '',
      signal_kind: r.signal_kind ?? '',
      message: r.message ?? '',
      confidence: r.confidence != null ? Number(r.confidence) : null,
      acknowledged: !!r.acknowledged,
      created_at: r.created_at,
    }))

    const unackedCount = signals.filter((s) => !s.acknowledged).length

    res.json({ signals, unackedCount })
  } catch (err) {
    logger.warn('GET /api/observer-signals failed', { error: err.message })
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return res.json({ signals: [], unackedCount: 0 })
    }
    next(err)
  }
})

module.exports = router

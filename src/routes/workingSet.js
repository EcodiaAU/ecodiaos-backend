/**
 * Working Set route — GET /api/working-set
 *
 * Returns active conductor working-set threads (closed_at IS NULL),
 * ordered by last_touched_at DESC. Powers the THREADS panel in
 * CortexAmbient Phase 2.
 *
 * No auth required — same posture as /api/status-board GET.
 * Read-only.
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
        id, topic, status, blocking_on, intent,
        opened_at, last_touched_at, artifacts, parent_id
      FROM working_set
      WHERE closed_at IS NULL
      ORDER BY last_touched_at DESC
      LIMIT 50
    `

    const threads = rows.map((r) => ({
      id: r.id,
      topic: r.topic ?? '',
      status: r.status ?? 'active',
      blocking_on: r.blocking_on ?? null,
      intent: r.intent ?? null,
      opened_at: r.opened_at,
      last_touched_at: r.last_touched_at,
    }))

    const activeCount = threads.filter((t) => t.status === 'active').length
    const blockedCount = threads.filter((t) => t.status === 'blocked').length
    const parkedCount = threads.filter((t) => t.status === 'parked').length

    res.json({ threads, activeCount, blockedCount, parkedCount })
  } catch (err) {
    logger.warn('GET /api/working-set failed', { error: err.message })
    // Graceful degradation — return empty on table-not-found etc.
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return res.json({ threads: [], activeCount: 0, blockedCount: 0, parkedCount: 0 })
    }
    next(err)
  }
})

module.exports = router

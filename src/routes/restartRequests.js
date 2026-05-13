/**
 * Restart Requests route — GET /api/restart-requests
 *
 * Returns pending ecodia-api restart requests from the coordination table.
 * Powers the RESTARTS panel in CortexAmbient Phase 2.
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
      SELECT id, requesting_fork_id, reason, status, conductor_note, requested_at, created_at
      FROM pending_restart_requests
      WHERE status = 'pending'
      ORDER BY requested_at DESC
      LIMIT 20
    `

    const requests = rows.map((r) => ({
      id: r.id,
      requesting_fork_id: r.requesting_fork_id ?? null,
      reason: r.reason ?? '',
      status: r.status ?? 'pending',
      conductor_note: r.conductor_note ?? null,
      requested_at: r.requested_at,
    }))

    res.json({ requests, count: requests.length })
  } catch (err) {
    logger.warn('GET /api/restart-requests failed', { error: err.message })
    if (err.message?.includes('does not exist') || err.code === '42P01') {
      return res.json({ requests: [], count: 0 })
    }
    next(err)
  }
})

module.exports = router

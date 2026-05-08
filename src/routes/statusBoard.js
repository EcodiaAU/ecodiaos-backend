/**
 * statusBoard route - public read-only access to active status_board rows.
 *
 * Used by the Cortex Ambient FE constellation view (useStatusBoard hook).
 * Returns active rows in the shape the frontend expects.
 *
 * Mounted at /api/status-board (and aliased at /api/status_board for
 * snake_case callers).
 *
 * Origin: fork_mowceb8n_e20af9, 2026-05-08, fixing 404 reported by Tate
 * 13:01 AEST verbatim. Pairs with FE useStatusBoard.ts /api/api
 * double-prefix fix.
 */
const { Router } = require('express')
const db = require('../config/db')

const router = Router()

const ACTIVE_QUERY_LIMIT = 250

// GET /api/status-board/active - active rows only (archived_at IS NULL)
router.get('/active', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT id, entity_type, entity_ref, name, status, next_action,
             next_action_by, next_action_due, priority, archived_at,
             last_touched, context
      FROM status_board
      WHERE archived_at IS NULL
      ORDER BY priority ASC NULLS LAST, last_touched DESC NULLS LAST
      LIMIT ${ACTIVE_QUERY_LIMIT}
    `
    res.json({ rows, count: rows.length })
  } catch (err) {
    next(err)
  }
})

// GET /api/status-board - same as /active for callers that omit the suffix
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT id, entity_type, entity_ref, name, status, next_action,
             next_action_by, next_action_due, priority, archived_at,
             last_touched, context
      FROM status_board
      WHERE archived_at IS NULL
      ORDER BY priority ASC NULLS LAST, last_touched DESC NULLS LAST
      LIMIT ${ACTIVE_QUERY_LIMIT}
    `
    res.json({ rows, count: rows.length })
  } catch (err) {
    next(err)
  }
})

module.exports = router

/**
 * statusBoard route - full CRUD for status_board table.
 *
 * GET endpoints are kept public (backward compat with CortexAmbient
 * constellation view which doesn't send auth). Write endpoints (PATCH/POST)
 * are gated behind the standard JWT auth middleware.
 *
 * Mounted at /api/status-board and aliased at /api/status_board.
 *
 * Origin: fork_mp1ym10n_303c2a, 2026-05-12 - FE inline-edit feature
 */
const { Router } = require('express')
const db = require('../config/db')
const auth = require('../middleware/auth')

const router = Router()

const COLS = db`
  id, entity_type, entity_ref, name, status, next_action,
  next_action_by, next_action_due, priority, archived_at,
  last_touched, context, created_at, updated_at
`

const VALID_NAB = new Set(['ecodiaos', 'tate', 'client', 'external'])
const VALID_ENTITY_TYPES = new Set([
  'client', 'project', 'thread', 'task', 'opportunity',
  'personal', 'legal', 'infrastructure',
])

// ── GET /api/status-board ─────────────────────────────────────────────
// Supports query params:
//   priority=1,2,3         - filter by priority chips (comma-separated)
//   next_action_by=tate    - filter by owner
//   entity_type=client     - filter by entity type
//   search=text            - full-text search across name, status, next_action
//   include_archived=true  - include archived rows
//   limit=250              - max rows (cap 1000)
const listHandler = async (req, res, next) => {
  try {
    const {
      priority,
      next_action_by: nab,
      entity_type: et,
      search,
      include_archived,
      limit: limitParam,
    } = req.query

    const limit = Math.min(parseInt(limitParam) || 250, 1000)

    // Parse array filters
    const priorities = priority
      ? priority.split(',').map(Number).filter(n => n >= 1 && n <= 5)
      : []
    const nabs = nab
      ? nab.split(',').map(s => s.trim()).filter(s => VALID_NAB.has(s))
      : []
    const entityTypes = et
      ? et.split(',').map(s => s.trim()).filter(s => VALID_ENTITY_TYPES.has(s))
      : []

    const includeArchived = include_archived === 'true'

    const rows = await db`
      SELECT ${COLS}
      FROM status_board
      WHERE TRUE
        ${includeArchived ? db`` : db`AND archived_at IS NULL`}
        ${priorities.length > 0 ? db`AND priority = ANY(${priorities})` : db``}
        ${nabs.length > 0 ? db`AND next_action_by = ANY(${nabs})` : db``}
        ${entityTypes.length > 0 ? db`AND entity_type = ANY(${entityTypes})` : db``}
        ${search
          ? db`AND (
              name ILIKE ${'%' + search + '%'}
              OR status ILIKE ${'%' + search + '%'}
              OR next_action ILIKE ${'%' + search + '%'}
              OR context ILIKE ${'%' + search + '%'}
            )`
          : db``}
      ORDER BY priority ASC NULLS LAST, last_touched DESC NULLS LAST
      LIMIT ${limit}
    `

    res.json({ rows, count: rows.length })
  } catch (err) {
    next(err)
  }
}

router.get('/', listHandler)
router.get('/active', listHandler)

// ── POST /api/status-board - create new row ───────────────────────────
router.post('/', auth, async (req, res, next) => {
  try {
    const {
      entity_type = 'task',
      entity_ref = null,
      name,
      status = 'active',
      next_action = null,
      next_action_by = 'ecodiaos',
      next_action_due = null,
      priority = 3,
      context = null,
    } = req.body

    if (!name) return res.status(400).json({ error: 'name is required' })

    const [row] = await db`
      INSERT INTO status_board
        (entity_type, entity_ref, name, status, next_action, next_action_by,
         next_action_due, priority, context, last_touched)
      VALUES
        (${entity_type}, ${entity_ref}, ${name}, ${status}, ${next_action},
         ${next_action_by}, ${next_action_due || null}, ${priority}, ${context}, NOW())
      RETURNING ${COLS}
    `
    res.status(201).json({ row })
  } catch (err) {
    next(err)
  }
})

// ── PATCH /api/status-board/:id - partial update ──────────────────────
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params
    const allowed = ['status', 'next_action', 'next_action_by', 'next_action_due', 'priority', 'context', 'name', 'entity_type']
    const updates = {}
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key]
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' })
    }

    // Build dynamic SET clause
    const setClauses = Object.entries(updates).map(([k, v]) => db`${db(k)} = ${v}`)
    const setSql = setClauses.reduce((acc, clause, i) =>
      i === 0 ? clause : db`${acc}, ${clause}`
    )

    const [row] = await db`
      UPDATE status_board
      SET ${setSql}, last_touched = NOW(), updated_at = NOW()
      WHERE id = ${id}
      RETURNING ${COLS}
    `

    if (!row) return res.status(404).json({ error: 'Row not found' })
    res.json({ row })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/status-board/:id/archive ───────────────────────────────
router.post('/:id/archive', auth, async (req, res, next) => {
  try {
    const [row] = await db`
      UPDATE status_board
      SET archived_at = NOW(), updated_at = NOW()
      WHERE id = ${req.params.id} AND archived_at IS NULL
      RETURNING ${COLS}
    `
    if (!row) return res.status(404).json({ error: 'Row not found or already archived' })
    res.json({ row })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/status-board/:id/unarchive ─────────────────────────────
router.post('/:id/unarchive', auth, async (req, res, next) => {
  try {
    const [row] = await db`
      UPDATE status_board
      SET archived_at = NULL, last_touched = NOW(), updated_at = NOW()
      WHERE id = ${req.params.id}
      RETURNING ${COLS}
    `
    if (!row) return res.status(404).json({ error: 'Row not found' })
    res.json({ row })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/status-board/bulk-archive ──────────────────────────────
router.post('/bulk-archive', auth, async (req, res, next) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' })
    }

    const rows = await db`
      UPDATE status_board
      SET archived_at = NOW(), updated_at = NOW()
      WHERE id = ANY(${ids}) AND archived_at IS NULL
      RETURNING id
    `
    res.json({ archived: rows.map(r => r.id), count: rows.length })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/status-board/bulk-priority ─────────────────────────────
router.post('/bulk-priority', auth, async (req, res, next) => {
  try {
    const { ids, priority } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' })
    }
    const p = parseInt(priority)
    if (isNaN(p) || p < 1 || p > 5) {
      return res.status(400).json({ error: 'priority must be 1-5' })
    }

    const rows = await db`
      UPDATE status_board
      SET priority = ${p}, last_touched = NOW(), updated_at = NOW()
      WHERE id = ANY(${ids})
      RETURNING id
    `
    res.json({ updated: rows.map(r => r.id), count: rows.length })
  } catch (err) {
    next(err)
  }
})

module.exports = router

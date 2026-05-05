/**
 * Dispatch-queue routes — /api/dispatch-queue/*
 *
 * Conductor or any fork can enqueue "when X happens, do Y" rows. The
 * dispatchQueueListener fires them when the trigger event arrives.
 *
 * Replaces the timed-cascade pattern (schedule_delayed at T+30min, T+60min,
 * T+90min hoping the prior step actually finished) with event-driven dispatch.
 *
 * See ~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md
 *     ~/ecodiaos/src/services/listeners/dispatchQueueListener.js
 *     ~/ecodiaos/src/db/migrations/086_dispatch_queue.sql
 *
 * Origin: fork_mos3hwpk_9fbdc5, 5 May 2026.
 */
const express = require('express')
const router = express.Router()
const db = require('../config/db')
const logger = require('../config/logger')

const VALID_TRIGGERS = new Set([
  'fork_complete', 'fork_done_clean', 'fork_failed',
  'cron_fire', 'manual',
])
const VALID_DISPATCH_TYPES = new Set([
  'spawn_fork', 'fire_cron', 'send_email', 'sms_tate', 'enqueue_message',
])

// POST /api/dispatch-queue/enqueue
// Body: { trigger_event_type, trigger_event_match?, dispatch_type, dispatch_payload,
//         description?, priority?, expires_at?, depends_on_id?, created_by? }
router.post('/enqueue', async (req, res, next) => {
  try {
    const b = req.body || {}
    if (!b.trigger_event_type || !VALID_TRIGGERS.has(b.trigger_event_type)) {
      return res.status(400).json({ error: 'invalid trigger_event_type', valid: [...VALID_TRIGGERS] })
    }
    if (!b.dispatch_type || !VALID_DISPATCH_TYPES.has(b.dispatch_type)) {
      return res.status(400).json({ error: 'invalid dispatch_type', valid: [...VALID_DISPATCH_TYPES] })
    }
    if (!b.dispatch_payload || typeof b.dispatch_payload !== 'object') {
      return res.status(400).json({ error: 'dispatch_payload must be an object' })
    }
    if (b.dispatch_type === 'spawn_fork' && !b.dispatch_payload.brief) {
      return res.status(400).json({ error: 'spawn_fork dispatch_payload requires brief' })
    }
    if (b.dispatch_type === 'fire_cron' && !b.dispatch_payload.task_id && !b.dispatch_payload.task_name) {
      return res.status(400).json({ error: 'fire_cron dispatch_payload requires task_id or task_name' })
    }

    const [row] = await db`
      INSERT INTO dispatch_queue (
        trigger_event_type, trigger_event_match,
        dispatch_type, dispatch_payload,
        description, priority, expires_at, depends_on_id, created_by
      ) VALUES (
        ${b.trigger_event_type},
        ${JSON.stringify(b.trigger_event_match || {})}::jsonb,
        ${b.dispatch_type},
        ${JSON.stringify(b.dispatch_payload)}::jsonb,
        ${b.description || null},
        ${b.priority || 5},
        ${b.expires_at || null},
        ${b.depends_on_id || null},
        ${b.created_by || 'conductor'}
      )
      RETURNING id, trigger_event_type, dispatch_type, status, priority, created_at, depends_on_id
    `
    logger.info('dispatch_queue: enqueued', {
      id: row.id,
      trigger: row.trigger_event_type,
      dispatch: row.dispatch_type,
      created_by: b.created_by,
    })
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// GET /api/dispatch-queue/list?status=queued&limit=50
router.get('/list', async (req, res, next) => {
  try {
    const status = req.query.status || 'queued'
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
    const rows = await db`
      SELECT id, trigger_event_type, trigger_event_match, dispatch_type,
             dispatch_payload, status, fired_at, fired_by_event_id, fired_result,
             description, priority, created_at, expires_at, created_by, depends_on_id
      FROM dispatch_queue
      WHERE status = ${status}
      ORDER BY priority, created_at DESC
      LIMIT ${limit}
    `
    res.json({ count: rows.length, rows })
  } catch (err) {
    next(err)
  }
})

// POST /api/dispatch-queue/:id/cancel
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const [row] = await db`
      UPDATE dispatch_queue
      SET status = 'cancelled'
      WHERE id = ${req.params.id} AND status = 'queued'
      RETURNING id, status
    `
    if (!row) return res.status(404).json({ error: 'row not found or not queued' })
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// POST /api/dispatch-queue/:id/fire-now — manually trip a queued row
router.post('/:id/fire-now', async (req, res, next) => {
  try {
    const [qrow] = await db`SELECT * FROM dispatch_queue WHERE id = ${req.params.id} AND status = 'queued'`
    if (!qrow) return res.status(404).json({ error: 'row not found or not queued' })

    const listener = require('../services/listeners/dispatchQueueListener')
    // Atomic claim
    const claimed = await db`
      UPDATE dispatch_queue
      SET status = 'fired', fired_at = NOW(), fired_by_event_id = 'manual_fire'
      WHERE id = ${qrow.id} AND status = 'queued'
      RETURNING id
    `
    if (claimed.length === 0) return res.status(409).json({ error: 'race: row already fired' })

    const result = await listener._executeDispatch(qrow, 'manual_fire')
    await db`
      UPDATE dispatch_queue
      SET fired_result = ${JSON.stringify(result)}::jsonb,
          status = ${result.ok ? 'fired' : 'failed'}
      WHERE id = ${qrow.id}
    `
    res.json({ id: qrow.id, result })
  } catch (err) {
    next(err)
  }
})

module.exports = router

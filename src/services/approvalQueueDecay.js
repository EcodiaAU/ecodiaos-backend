'use strict'

/**
 * approvalQueueDecay.js (2026-05-26)
 *
 * Two loops:
 *   decayTick()    - resolve rows whose decay_at has passed, using default_verdict
 *   warningTick()  - send 30-min pre-decay SMS for any critical row not yet warned
 *
 * Designed to run every 5 minutes (via cron / laptop-agent / setInterval).
 * Both loops are safe to call concurrently (FOR UPDATE SKIP LOCKED).
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §6.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const resolution = require('./approvalQueueResolutionService')

const DEFAULT_LIMIT = 20

async function decayTick({ limit = DEFAULT_LIMIT } = {}) {
  let due
  try {
    due = await db`
      SELECT id, item_type, default_verdict, decay_at
      FROM approval_queue
      WHERE resolved_at IS NULL
        AND decay_at IS NOT NULL
        AND decay_at <= NOW()
      ORDER BY decay_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
  } catch (err) {
    logger.warn('approval_queue decayTick query failed', { error: err.message })
    return { ok: false, error: err.message }
  }

  if (due.length === 0) return { ok: true, resolved: 0 }

  const resolved = []
  const failed = []
  for (const row of due) {
    try {
      const result = await resolution.resolve(row.id, 'default', null, 'decay-default')
      if (result.ok) resolved.push({ id: row.id, item_type: row.item_type })
      else failed.push({ id: row.id, error: result.error })
    } catch (err) {
      failed.push({ id: row.id, error: err.message })
      logger.warn('approval_queue decay resolve threw', { id: row.id, error: err.message })
    }
  }

  if (resolved.length > 0) {
    try {
      await db`
        INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context)
        VALUES (
          'infrastructure',
          ${`approval_queue.decay_run ${new Date().toISOString().slice(0, 16)}`},
          ${`${resolved.length} items auto-resolved by decay`},
          NULL,
          'ecodiaos',
          3,
          ${JSON.stringify({ resolved, failed })}
        )
      `
    } catch (err) {
      logger.warn('approval_queue decay status_board summary failed', { error: err.message })
    }
  }

  logger.info('approval_queue decayTick complete', { resolved: resolved.length, failed: failed.length })
  return { ok: true, resolved: resolved.length, failed: failed.length, items: { resolved, failed } }
}

async function warningTick({ limit = DEFAULT_LIMIT } = {}) {
  let warnDue
  try {
    warnDue = await db`
      SELECT q.id, q.title, q.default_verdict
      FROM approval_queue q
      WHERE q.resolved_at IS NULL
        AND q.urgency = 'critical'
        AND q.decay_at IS NOT NULL
        AND q.decay_at - INTERVAL '30 minutes' <= NOW()
        AND q.decay_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM approval_action_log l
          WHERE l.approval_id = q.id AND l.action_type = 'warn_30min'
        )
      ORDER BY q.decay_at ASC
      LIMIT ${limit}
    `
  } catch (err) {
    logger.warn('approval_queue warningTick query failed', { error: err.message })
    return { ok: false, error: err.message }
  }

  if (warnDue.length === 0) return { ok: true, warned: 0 }

  const warned = []
  const surfacing = require('./approvalQueueSurfacing')
  for (const row of warnDue) {
    try {
      const r = await surfacing.notifyDecayWarning(row.id)
      if (r.ok) warned.push(row.id)
    } catch (err) {
      logger.warn('approval_queue warning push threw', { id: row.id, error: err.message })
    }
  }

  logger.info('approval_queue warningTick complete', { warned: warned.length, total: warnDue.length })
  return { ok: true, warned: warned.length }
}

/**
 * One pass: decay + warning. Used as the cron entry-point and the
 * laptop-agent daemon tick body.
 */
async function tick() {
  const decay = await decayTick()
  const warn = await warningTick()
  return { decay, warn }
}

module.exports = { decayTick, warningTick, tick }

'use strict'

/**
 * approvalQueueResolutionService.js (2026-05-26)
 *
 * Resolution + rollback for the approval_queue substrate.
 *
 *   resolve(id, verdict, edit_payload?, resolved_by?)
 *     verdict: 'Y' | 'N' | 'edit' | 'default'
 *     resolved_by: 'tate' | 'decay-default' | 'system-cancel'
 *
 *   reverse(action_log_id, reason)
 *     Calls per-type reverseHandler within the reversible_until window.
 *
 *   pushCriticalSms(id)
 *     Fires sms.tate for a critical item. Called by the producer wrapper
 *     and by the decay daemon's pre-decay warning loop.
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const actionHandlers = require('./approvalQueue/actionHandlers')
const cancelHandlers = require('./approvalQueue/cancelHandlers')
const reverseHandlers = require('./approvalQueue/reverseHandlers')
const { mergeEditIntoAction } = require('./approvalQueue/mergeEdit')
const { computeReversibleUntil, mapDefaultToVerdict } = require('./approvalQueue/helpers')

class AlreadyResolvedError extends Error {
  constructor(id) {
    super(`approval_queue row already resolved or not found: ${id}`)
    this.name = 'AlreadyResolvedError'
  }
}

class NotReversibleError extends Error {
  constructor(action_log_id, reason) {
    super(`action_log not reversible (${action_log_id}): ${reason}`)
    this.name = 'NotReversibleError'
  }
}

async function resolve(id, verdict, edit_payload = null, resolved_by = 'tate') {
  if (!['Y', 'N', 'edit', 'default'].includes(verdict)) {
    return { ok: false, error: `invalid verdict ${verdict}` }
  }
  if (!['tate', 'decay-default', 'system-cancel'].includes(resolved_by)) {
    return { ok: false, error: `invalid resolved_by ${resolved_by}` }
  }

  let outcome, action_log_payload, reversible_until, item_type
  let resolvedRow = null

  try {
    resolvedRow = await db.begin(async (tx) => {
      const rows = await tx`
        SELECT * FROM approval_queue
        WHERE id = ${id} AND resolved_at IS NULL
        FOR UPDATE
      `
      if (rows.length === 0) throw new AlreadyResolvedError(id)
      const row = rows[0]
      item_type = row.item_type

      let finalAction = row.action
      if (edit_payload) {
        try {
          finalAction = mergeEditIntoAction(row.action, edit_payload, row.item_type)
        } catch (mergeErr) {
          outcome = `edit-merge failed: ${mergeErr.message}`
          action_log_payload = { merge_error: mergeErr.message, edit_payload }
          await tx`
            INSERT INTO approval_action_log
              (approval_id, action_type, action_payload, reversible_until)
            VALUES (${id}, ${`${row.item_type}_edit_failed`}, ${db.json(action_log_payload)}, NULL)
          `
          await tx`
            UPDATE approval_queue
            SET resolved_at = NOW(), resolved_by = ${resolved_by}, verdict = 'edit',
                edit_applied = ${db.json(edit_payload)}, outcome = ${outcome}
            WHERE id = ${id}
          `
          return { row, outcome, reversible_until: null }
        }
      }

      try {
        if (verdict === 'Y' || verdict === 'edit') {
          const result = await actionHandlers.execute(row.item_type, finalAction)
          outcome = result.summary
          action_log_payload = result.log_payload
          reversible_until = result.ok ? computeReversibleUntil(row.item_type) : null
        } else if (verdict === 'N' || verdict === 'default') {
          const fn = verdict === 'default' && mapDefaultToVerdict(row.default_verdict) === 'Y'
            ? actionHandlers.execute
            : cancelHandlers.execute
          const realVerdict = verdict === 'default' ? mapDefaultToVerdict(row.default_verdict) : 'N'
          if (realVerdict === null) {
            outcome = 'default-wait: no decay action defined, queue row remains'
            action_log_payload = { skipped: true }
            reversible_until = null
          } else {
            const result = await fn(row.item_type, realVerdict === 'Y' ? finalAction : row.action)
            outcome = result.summary
            action_log_payload = result.log_payload
            reversible_until = realVerdict === 'Y' && result.ok ? computeReversibleUntil(row.item_type) : null
          }
        }
      } catch (handlerErr) {
        outcome = `failed: ${handlerErr.message}`
        action_log_payload = { error: handlerErr.message, action: finalAction }
        reversible_until = null
        logger.warn('approval_queue action handler threw', { id, item_type: row.item_type, error: handlerErr.message })
      }

      await tx`
        INSERT INTO approval_action_log
          (approval_id, action_type, action_payload, reversible_until)
        VALUES
          (${id}, ${`${row.item_type}_${verdict}`},
           ${db.json(action_log_payload || {})}, ${reversible_until})
      `

      await tx`
        UPDATE approval_queue
        SET resolved_at = NOW(),
            resolved_by = ${resolved_by},
            verdict = ${verdict},
            edit_applied = ${edit_payload ? db.json(edit_payload) : null},
            outcome = ${outcome}
        WHERE id = ${id}
      `

      // Cascade to linked status_board row for non-free_text items if any
      if (row.status_board_ref && row.item_type !== 'free_text') {
        await tx`
          UPDATE status_board
          SET last_touched = NOW(),
              context = COALESCE(context, '') || E'\n[approval_queue ' || ${verdict} || ' at ' || NOW()::text || ']: ' || COALESCE(${outcome}, '')
          WHERE id = ${row.status_board_ref}
        `
      }

      return { row, outcome, reversible_until }
    })
  } catch (err) {
    if (err instanceof AlreadyResolvedError) {
      return { ok: false, error: 'already_resolved', id }
    }
    logger.warn('approval_queue resolve failed', { id, error: err.message })
    return { ok: false, error: err.message }
  }

  logger.info('approval_queue resolved', {
    id, verdict, resolved_by, item_type, outcome: (outcome || '').slice(0, 200),
  })

  return {
    ok: true,
    id,
    item_type,
    verdict,
    outcome,
    reversible_until,
  }
}

async function reverse(action_log_id, reason) {
  if (!action_log_id) return { ok: false, error: 'action_log_id required' }
  if (!reason || typeof reason !== 'string') return { ok: false, error: 'reason required' }

  try {
    const result = await db.begin(async (tx) => {
      const logs = await tx`
        SELECT l.*, q.item_type
        FROM approval_action_log l
        JOIN approval_queue q ON q.id = l.approval_id
        WHERE l.id = ${action_log_id} AND l.reversed_at IS NULL
        FOR UPDATE
      `
      if (logs.length === 0) throw new NotReversibleError(action_log_id, 'already reversed or not found')
      const log = logs[0]
      if (!log.reversible_until || new Date(log.reversible_until) <= new Date()) {
        throw new NotReversibleError(action_log_id, 'past reversible_until')
      }

      const handlerResult = await reverseHandlers.reverse(log.item_type, log.action_payload, reason)

      await tx`
        UPDATE approval_action_log
        SET reversed_at = NOW(),
            reversal_reason = ${reason},
            reversal_payload = ${db.json(handlerResult.reversal_payload || {})}
        WHERE id = ${action_log_id}
      `

      return { item_type: log.item_type, summary: handlerResult.summary }
    })

    logger.info('approval_queue reversed', { action_log_id, item_type: result.item_type })
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof NotReversibleError) {
      return { ok: false, error: err.message, code: 'not_reversible' }
    }
    logger.warn('approval_queue reverse failed', { action_log_id, error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * Push a critical-tier SMS to Tate for a single queue item. Called by:
 *  - producer wrapper (on insert when urgency='critical')
 *  - decay daemon (pre-decay 30min warning)
 */
async function pushCriticalSms(id, { variant = 'inserted' } = {}) {
  try {
    const rows = await db`
      SELECT id, title, decay_at, default_verdict, urgency
      FROM approval_queue WHERE id = ${id} AND resolved_at IS NULL
    `
    if (rows.length === 0) return { ok: false, error: 'not found or resolved' }
    const row = rows[0]
    if (row.urgency !== 'critical') return { ok: false, error: 'not critical urgency' }

    const decayLabel = row.decay_at
      ? `decays at ${new Date(row.decay_at).toISOString().slice(11, 16)} UTC to ${row.default_verdict}`
      : 'no decay'

    const body = variant === 'warn'
      ? `[QUEUE-CRITICAL] ${row.title}. Decays in 30min to ${row.default_verdict}. Open app or reply Y or N.`
      : `[QUEUE-CRITICAL] ${row.title}. ${decayLabel}. Open EcodiaOS app or reply Y or N.`

    // Lazy-require osAlertingService so a missing transport does not break the
    // queue's hot path. Soft-failure: log warn + record in action_log as a
    // forensic warn entry, but resolve() / decay still proceed.
    let smsResult = { ok: false, error: 'sms transport not loaded' }
    try {
      const alerting = require('./osAlertingService')
      if (typeof alerting.sendSmsToTate === 'function') {
        smsResult = await alerting.sendSmsToTate(body)
      }
    } catch (err) {
      logger.warn('pushCriticalSms: sms transport load failed', { error: err.message })
    }

    await db`
      INSERT INTO approval_action_log
        (approval_id, action_type, action_payload, reversible_until)
      VALUES
        (${id},
         ${variant === 'warn' ? 'warn_30min' : 'sms_critical_insert'},
         ${db.json({ body, smsResult: { ok: !!smsResult?.ok, error: smsResult?.error || null } })},
         NULL)
    `
    return { ok: !!smsResult?.ok, smsResult }
  } catch (err) {
    logger.warn('pushCriticalSms threw', { id, error: err.message })
    return { ok: false, error: err.message }
  }
}

module.exports = {
  resolve,
  reverse,
  pushCriticalSms,
  computeReversibleUntil,
  mapDefaultToVerdict,
  AlreadyResolvedError,
  NotReversibleError,
}

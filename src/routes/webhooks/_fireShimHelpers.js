'use strict'
/**
 * Shared helpers for webhook shims: server-side idempotency dedup + audit.
 *
 * Backed by outbound_actions (migration 119). Each source gets its own action_type
 * partition ('shim:twilio-sms', 'shim:resend', etc.) so dedup windows don't collide.
 *
 * Protocol used by smsWebhook.js:
 *   1. isDuplicate({ source, idempotencyKey }) - returns true if already processed
 *   2. markSeen({ source, idempotencyKey })    - inserts row, preventing future duplicates
 *   3. fire the reflex / cloud routine
 *   4. appendAudit({ ..., fireStatus })        - updates row with final outcome
 *
 * Non-fatal: if outbound_actions table is absent (fresh dev DB), all three
 * functions degrade gracefully so the webhook itself still processes normally.
 *
 * Used by: smsWebhook.js (source='twilio-sms').
 * Future: resend / vercel / stripe / github / apple-asn shims once SMS is E2E proven.
 *
 * Origin: Corazon reflex substrate session 2026-05-16.
 * Ref: docs/REFLEX_SUBSTRATE_SESSION_2026-05-16.md
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

function _actionType(source) {
  return `shim:${source}`
}

function _isTableMissingError(err) {
  return /relation.*outbound_actions.*does not exist/i.test(err.message || '')
}

/**
 * Returns true if a row for this (source, idempotencyKey) was already inserted,
 * indicating the event has already been processed.
 */
async function isDuplicate({ source, idempotencyKey }) {
  try {
    const rows = await db`
      SELECT 1 FROM outbound_actions
      WHERE action_type = ${_actionType(source)}
        AND action_key = ${idempotencyKey}
      LIMIT 1
    `
    return rows.length > 0
  } catch (err) {
    if (_isTableMissingError(err)) return false
    logger.warn('_fireShimHelpers.isDuplicate query error - treating as not-duplicate', {
      source, idempotencyKey, error: err.message,
    })
    return false
  }
}

/**
 * Records the event as seen. Uses ON CONFLICT DO NOTHING so concurrent calls
 * are safe and re-runs are idempotent.
 */
async function markSeen({ source, idempotencyKey }) {
  try {
    await db`
      INSERT INTO outbound_actions
        (action_type, action_key, target, status, dispatched_at, metadata)
      VALUES (
        ${_actionType(source)},
        ${idempotencyKey},
        ${source},
        'dispatched',
        NOW(),
        ${{ source, idempotencyKey }}
      )
      ON CONFLICT (action_type, action_key) DO NOTHING
    `
  } catch (err) {
    if (_isTableMissingError(err)) return
    logger.warn('_fireShimHelpers.markSeen insert error', {
      source, idempotencyKey, error: err.message,
    })
  }
}

/**
 * Updates the outbound_actions row with the final fire outcome.
 *
 * fireStatus conventions:
 *   'duplicate_skipped'     - already processed; row exists, no update needed
 *   'reflex_200' (2xx)      - reflex accepted the fire, maps to 'verified'
 *   'reflex_failed_*'       - reflex rejected or unreachable, maps to 'failed'
 *   'shim_error'            - unhandled exception in the shim, maps to 'failed'
 */
async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  if (fireStatus === 'duplicate_skipped') return

  const newStatus = (
    fireStatus.startsWith('reflex_failed_') || fireStatus === 'shim_error'
  ) ? 'failed' : 'verified'

  const metaPatch = {
    routineName,
    account,
    fireStatus,
    ...(errorMessage ? { errorMessage } : {}),
  }

  try {
    await db`
      UPDATE outbound_actions
      SET
        status      = ${newStatus},
        last_error  = ${errorMessage || null},
        metadata    = metadata || ${metaPatch},
        verified_at = CASE WHEN ${newStatus} = 'verified' THEN NOW() ELSE verified_at END,
        failed_at   = CASE WHEN ${newStatus} = 'failed'   THEN NOW() ELSE failed_at   END,
        updated_at  = NOW()
      WHERE action_type = ${_actionType(source)}
        AND action_key  = ${idempotencyKey}
    `
  } catch (err) {
    if (_isTableMissingError(err)) return
    logger.warn('_fireShimHelpers.appendAudit update error', {
      source, idempotencyKey, error: err.message,
    })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

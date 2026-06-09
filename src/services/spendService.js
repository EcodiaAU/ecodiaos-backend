'use strict'

/**
 * spendService.js (2026-05-26)
 *
 * Producer for the approval_queue spend_execute item type. Wraps Stripe / invoice
 * / commitment callers so spends over a threshold (or with a new vendor) route
 * through Tate review instead of firing immediately.
 *
 * Threshold rule:
 *   amount_aud >= SPEND_QUEUE_THRESHOLD_AUD (env, default $200) -> queue
 *   vendor not seen in ledger_lines before               -> queue
 *   commitment is a contractual term (subscription, multi-month) -> queue
 *
 * Anything else: caller executes directly per the autonomy doctrine.
 *
 * Action shape:
 *   { execute_action: { kind: 'stripe_payment' | 'stripe_invoice' | 'commitment',
 *                       payment_intent_id?: ..., invoice_id?: ..., subscription_id?: ..., },
 *     amount_aud, vendor, description }
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §3.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const queue = require('./approvalQueueService')

const SPEND_QUEUE_THRESHOLD_AUD = parseFloat(process.env.SPEND_QUEUE_THRESHOLD || '200')

async function _isNewVendor(vendor) {
  if (!vendor) return true
  try {
    const rows = await db`
      SELECT 1
      FROM ledger_lines
      WHERE COALESCE(party_name, '') ILIKE ${vendor}
      LIMIT 1
    `
    if (rows.length > 0) return false
    return true
  } catch (err) {
    // Schema may differ in this env. Soft-fail: treat as known to avoid spam-queueing.
    logger.debug('spendService: new-vendor probe soft-failed', { error: err.message })
    return false
  }
}

function _isContractual(payload) {
  if (!payload) return false
  const k = payload.kind || ''
  if (k === 'commitment') return true
  if (payload.is_subscription === true) return true
  if (payload.term_months && Number(payload.term_months) > 1) return true
  return false
}

/**
 * Decide whether the spend should route through Tate review.
 *
 *   { queued: true, id }                    -- queued, caller must NOT execute
 *   { queued: false, reason: 'under_threshold' }  -- caller executes directly
 */
async function proposeSpend({
  amount_aud,
  vendor,
  description = null,
  execute_action,
  idempotency_suffix = null,
}) {
  if (!amount_aud || !vendor || !execute_action) {
    return { ok: false, error: 'amount_aud, vendor, execute_action required' }
  }
  const amt = Number(amount_aud)
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: 'amount_aud must be positive number' }
  }

  const overThreshold = amt >= SPEND_QUEUE_THRESHOLD_AUD
  const newVendor = await _isNewVendor(vendor)
  const contractual = _isContractual(execute_action)

  if (!overThreshold && !newVendor && !contractual) {
    return { ok: true, queued: false, reason: 'under_threshold_and_known_one_off' }
  }

  const reasons = []
  if (overThreshold) reasons.push('over_threshold')
  if (newVendor) reasons.push('new_vendor')
  if (contractual) reasons.push('contractual_term')

  const r = await queue.enqueueSpendExecute({
    amount_aud: amt,
    vendor,
    description: description ? `${description} [reasons: ${reasons.join(',')}]` : `[reasons: ${reasons.join(',')}]`,
    execute_action,
    idempotency_suffix,
  })
  if (!r.ok) {
    logger.warn('spendService.proposeSpend: enqueue failed', { error: r.error, vendor, amount: amt })
    return r
  }

  logger.info('spendService.proposeSpend: enqueued for Tate review', {
    id: r.id, vendor, amount_aud: amt, reasons,
  })
  return { ok: true, queued: true, id: r.id, deduped: !!r.deduped, reasons }
}

module.exports = { proposeSpend, SPEND_QUEUE_THRESHOLD_AUD }

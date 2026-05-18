'use strict'

/**
 * stripePaymentToLedger listener
 *
 * Subscribes to perceptionBus events with source='stripe' kind='invoice_paid'
 * (and the dispatcher's correlated re-publish source='perception_dispatcher'
 * kind='stripe_invoice_paid_correlated'). On fire:
 *
 *   1. Idempotency check FIRST: skip if staged_transactions has a row with
 *      external_id (source_ref) = stripe_invoice_id.
 *   2. INSERT a staged_transactions row tagged source='stripe', auto_categorize,
 *      confidence=1.0, suggested_account='4000' (income), description naming
 *      the invoice number + customer email.
 *   3. If a client_billing_generations row matches by invoice_number, mark it
 *      paid (status='paid', notes append paid_at).
 *   4. Increment kv_store.cowork.ceo.tax_buffer_state buffers atomically via
 *      financePulseService.incrementBuffer:
 *        - gst_owed_accrued        += amount_cents * 10 / 110
 *        - income_tax_provisional  += (amount_cents - gst_cents) * 0.25
 *
 * Wiring:
 *   - Self-subscribes to perceptionBus on first require() (idempotent guard).
 *   - Also exposes the listener-registry contract (name, subscribesTo,
 *     relevanceFilter, handle, ownsWriteSurface) so it can be added to
 *     LISTENER_FILES without registry rejection. The registry currently
 *     dispatches only os-session:output and db:event - perceptionBus is the
 *     active dispatch path here, the registry contract is for shape parity
 *     with sibling listeners (boot-time validation passes, getHealth() can
 *     surface it).
 *
 * Side-effect substrates owned:
 *   - staged_transactions (INSERT)
 *   - client_billing_generations (UPDATE status='paid')
 *   - kv_store.cowork.ceo.finance_now (jsonb merge via financePulseService)
 */

const logger = require('../../config/logger')
const db = require('../../config/db')
const perceptionBus = require('../perceptionBus')
const financePulse = require('../financePulseService')

const SUGGESTED_INCOME_ACCOUNT = '4000'

function _extractFields(event) {
  // Accept both raw 'stripe' source events and dispatcher-correlated re-publishes.
  const d = (event && event.data) || {}
  const stripeInvoiceId =
    d.stripe_invoice_id ||
    d.invoice_id ||
    d.invoice ||
    d.id ||
    null
  const invoiceNumber =
    d.invoice_number ||
    d.number ||
    (d.invoice && typeof d.invoice === 'object' ? d.invoice.number : null) ||
    null
  const amountCents =
    Number.isFinite(d.amount_cents) ? d.amount_cents
    : Number.isFinite(d.amount_paid) ? d.amount_paid
    : Number.isFinite(d.amount) ? d.amount
    : null
  const currency = (d.currency || 'aud').toString().toLowerCase()
  const customerEmail =
    d.customer_email ||
    d.email ||
    (d.customer && typeof d.customer === 'object' ? d.customer.email : null) ||
    null
  // paid_at: epoch seconds (Stripe convention) or ISO. Coerce to Date.
  let paidAt = null
  const rawPaid = d.paid_at || d.status_transitions_paid_at || d.created
  if (rawPaid != null) {
    if (typeof rawPaid === 'number') {
      paidAt = new Date(rawPaid > 1e12 ? rawPaid : rawPaid * 1000)
    } else {
      const parsed = new Date(rawPaid)
      if (!Number.isNaN(parsed.getTime())) paidAt = parsed
    }
  }
  if (!paidAt) paidAt = new Date()
  return { stripeInvoiceId, invoiceNumber, amountCents, currency, customerEmail, paidAt }
}

function _isRelevant(event) {
  if (!event || !event.source || !event.kind) return false
  const src = String(event.source).toLowerCase()
  const kind = String(event.kind).toLowerCase()
  if (src === 'stripe' && kind === 'invoice_paid') return true
  if (src === 'perception_dispatcher' && kind === 'stripe_invoice_paid_correlated') return true
  return false
}

async function _alreadyStaged(stripeInvoiceId) {
  try {
    const rows = await db`
      SELECT id FROM staged_transactions WHERE source_ref = ${stripeInvoiceId} LIMIT 1
    `
    return rows && rows.length > 0
  } catch (err) {
    logger.warn('stripePaymentToLedger: idempotency probe failed', {
      error: err.message,
      stripeInvoiceId,
    })
    // On probe failure we conservatively bail rather than risk a double-insert.
    return true
  }
}

async function _insertStagedRow({ stripeInvoiceId, invoiceNumber, amountCents, customerEmail, paidAt }) {
  // posting_date in staged_transactions is `occurred_at DATE`. Coerce paidAt
  // to YYYY-MM-DD; the column rejects timestamps.
  const occurredAt = paidAt.toISOString().slice(0, 10)
  const desc = `Stripe payment ${invoiceNumber || stripeInvoiceId} from ${customerEmail || 'unknown'}`
  // GST-inclusive on Australian Stripe invoices; gst_amount_cents = total / 11.
  const gstCents = Math.round(amountCents / 11)
  const rows = await db`
    INSERT INTO staged_transactions (
      source, source_ref, occurred_at, amount_cents, description,
      status, category, is_gst_inclusive, gst_amount_cents, confidence,
      categorizer_reasoning
    ) VALUES (
      'stripe', ${stripeInvoiceId}, ${occurredAt}::date, ${amountCents}, ${desc},
      'categorized', ${SUGGESTED_INCOME_ACCOUNT}, true, ${gstCents}, ${1.0},
      ${'auto-categorized by stripePaymentToLedger listener'}
    )
    ON CONFLICT (source_ref) DO NOTHING
    RETURNING id
  `
  return rows && rows[0] ? rows[0].id : null
}

async function _markBillingGenerationPaid({ invoiceNumber, paidAt }) {
  if (!invoiceNumber) return false
  try {
    const isoNow = paidAt.toISOString()
    const rows = await db`
      UPDATE client_billing_generations
      SET status = 'paid',
          notes = COALESCE(notes, '') || ${`\n[paid at ${isoNow}]`}
      WHERE invoice_number = ${invoiceNumber}
        AND status != 'paid'
      RETURNING id
    `
    return rows && rows.length > 0
  } catch (err) {
    logger.warn('stripePaymentToLedger: client_billing_generations update failed', {
      error: err.message,
      invoiceNumber,
    })
    return false
  }
}

async function _incrementTaxBuffers(amountCents) {
  // GST on a GST-inclusive total: total * 10/110.
  const gstCents = Math.round((amountCents * 10) / 110)
  // Income-tax provisional: 25% of GST-exclusive component.
  const incomeTaxCents = Math.round((amountCents - gstCents) * 0.25)
  try {
    await financePulse.incrementBuffer('gst_owed_accrued', gstCents)
    await financePulse.incrementBuffer('income_tax_provisional_accrued', incomeTaxCents)
  } catch (err) {
    logger.warn('stripePaymentToLedger: tax buffer increment failed', {
      error: err.message,
    })
  }
  return { gstCents, incomeTaxCents }
}

async function _handle(event) {
  if (!_isRelevant(event)) return
  const fields = _extractFields(event)
  const { stripeInvoiceId, invoiceNumber, amountCents, customerEmail, paidAt } = fields

  if (!stripeInvoiceId) {
    logger.debug('stripePaymentToLedger: skipping event without stripe_invoice_id')
    return
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    logger.debug('stripePaymentToLedger: skipping event without positive amount', {
      stripeInvoiceId,
    })
    return
  }

  // 1. Idempotency check FIRST.
  if (await _alreadyStaged(stripeInvoiceId)) {
    logger.info('stripePaymentToLedger: already staged, skipping', { stripeInvoiceId })
    return
  }

  // 2. INSERT staged_transactions.
  let stagedId = null
  try {
    stagedId = await _insertStagedRow({
      stripeInvoiceId, invoiceNumber, amountCents, customerEmail, paidAt,
    })
  } catch (err) {
    logger.warn('stripePaymentToLedger: staged_transactions INSERT failed', {
      error: err.message,
      stripeInvoiceId,
    })
    return
  }
  if (!stagedId) {
    // Either ON CONFLICT DO NOTHING tripped (race), or insert silently dropped.
    logger.info('stripePaymentToLedger: staged_transactions insert produced no row (race or conflict)', {
      stripeInvoiceId,
    })
    return
  }

  // 3. Mark client_billing_generations paid if matched.
  const billingMatched = await _markBillingGenerationPaid({ invoiceNumber, paidAt })

  // 4. Increment tax buffers.
  const { gstCents, incomeTaxCents } = await _incrementTaxBuffers(amountCents)

  logger.info('stripePaymentToLedger: processed invoice payment', {
    stripeInvoiceId,
    invoiceNumber,
    amountCents,
    stagedId,
    billingMatched,
    gstCents,
    incomeTaxCents,
  })

  try {
    perceptionBus.publish({
      source: 'bookkeeper',
      kind: 'stripe_payment_to_ledger',
      data: {
        stripe_invoice_id: stripeInvoiceId,
        invoice_number: invoiceNumber,
        amount_cents: amountCents,
        gst_cents: gstCents,
        income_tax_cents: incomeTaxCents,
        billing_generation_matched: billingMatched,
        staged_transaction_id: stagedId,
      },
      confidence: 1.0,
    }).catch(() => {})
  } catch { /* non-fatal */ }
}

// ── Self-wire perceptionBus subscription ────────────────────────────────────

let _subscribed = false
function _ensureSubscribed() {
  if (_subscribed) return
  try {
    perceptionBus.subscribe((event) => {
      Promise.resolve()
        .then(() => _handle(event))
        .catch((err) => {
          logger.warn('stripePaymentToLedger: handler threw (async)', {
            error: err && err.message,
          })
        })
    })
    _subscribed = true
    logger.info('stripePaymentToLedger: subscribed to perceptionBus')
  } catch (err) {
    logger.warn('stripePaymentToLedger: perceptionBus subscribe failed', {
      error: err.message,
    })
  }
}

_ensureSubscribed()

// ── Listener-registry contract (parity with sibling listeners) ─────────────
//
// The registry only dispatches os-session:output and db:event channels today;
// the perceptionBus subscription above is the active path. The listener
// contract is exported so future routing through the registry (or its
// telemetry / getHealth() surface) sees a well-formed module.

module.exports = {
  name: 'stripePaymentToLedger',
  subscribesTo: ['perception:stripe_invoice_paid'],

  relevanceFilter: (event) => {
    // Registry passes wsManager envelopes; perception events flow via the
    // direct subscription above. This filter is a no-op for the registry
    // path - returning false avoids double-handling if the registry is later
    // wired to perception channels.
    return false
  },

  handle: async (_event) => {
    // No-op for the registry-dispatch path. The perceptionBus subscription
    // above is the authoritative path.
  },

  // Exposed for direct invocation in tests and for the perceptionBus wiring
  // path. Not part of the registry contract.
  _handle,
  _isRelevant,
  _extractFields,
  _ensureSubscribed,

  ownsWriteSurface: [
    'staged_transactions',
    'client_billing_generations',
    'kv_store:cowork.ceo.finance_now',
  ],
}

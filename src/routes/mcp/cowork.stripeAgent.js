/**
 * Cowork V2 MCP - stripe_agent.* tools (Step 4 of the Stripe Agentic
 * Commerce stack, 9 Jun 2026).
 *
 * Exposes stripeAgentService methods as in-process MCP tools so any
 * narrow connector (today: ecodia-money) can drive autonomous merchant
 * operations on any Ecodia entity's Stripe account. Per-entity routing
 * via the entity arg (pty_ltd / labs / dao); each entity loads its own
 * Restricted Key from kv_store at boot.
 *
 * Tools:
 *   stripe_agent.probe                  - retrieve(account); no side effects
 *   stripe_agent.create_customer        - no bookkeeping mirror
 *   stripe_agent.create_product         - no bookkeeping mirror
 *   stripe_agent.create_price           - no bookkeeping mirror
 *   stripe_agent.create_payment_link    - MIRRORS to staged_transactions
 *   stripe_agent.create_checkout_session- MIRRORS to staged_transactions
 *
 * Bookkeeping mirror (chargeable artefacts only): every payment_link and
 * checkout_session creation lands a staged_transactions row tagged with
 * the originating entity in source_account (ba_ecodia / ba_ecodia_labs /
 * ba_dao_llc) so bk_categorize + bk_post_transaction can route it to the
 * right entity's GL. The row sits status='pending' because no money has
 * moved yet; reconciliation happens when the stripe webhook fires
 * stripePaymentToLedger and matches by source_ref. Amount is resolved by
 * fetching the price ids referenced in line_items.
 *
 * Spec:  backend/docs/conductor-self-sufficiency-plan-2026-05-12.md does
 *        NOT cover this; this is a fresh wiring layer over the existing
 *        stripeAgentService.js (shipped 2 Jun 2026 commit ee1d00c1).
 * Brief: status_board row d2cad335-3d62-4916-9e67-6b775cfd3a31
 *        next_action verbatim (Tate-marked DISPATCH-READY 8 Jun 2026).
 *
 * Mount: this module is required from cowork.js. It expects the host
 * router to provide db, scope, audit, withIdempotency, _serverError via
 * the deps object passed to mount().
 */
'use strict'

const stripeAgent = require('../../services/stripeAgentService')
const logger = require('../../config/logger')

// Entity -> source_account label for the staged_transactions mirror.
// Matches the naming the brief mandates (ba_ecodia for Ecodia Pty Ltd,
// ba_ecodia_labs for Ecodia Labs, ba_dao_llc for DAO LLC). The matching
// GL bank-account codes are mapped inside bookkeeperService
// SOURCE_ACCOUNT_TO_GL; new entities can stage rows today but cannot be
// posted to the ledger until their bank-account GL is allocated.
const ENTITY_TO_SOURCE_ACCOUNT = Object.freeze({
  pty_ltd: 'ba_ecodia',
  labs:    'ba_ecodia_labs',
  dao:     'ba_dao_llc',
})

function _validEntity(entity) {
  return Object.prototype.hasOwnProperty.call(ENTITY_TO_SOURCE_ACCOUNT, entity)
}

function _scopeError(message, code, httpStatus, details) {
  const err = new Error(message)
  err.code = code
  err.httpStatus = httpStatus
  if (details) err.details = details
  return err
}

// Resolve total amount_cents + currency from a Stripe line_items array.
// Each item references a price id; we retrieve each price once and sum
// (unit_amount * quantity). Quantity defaults to 1. Caches retrieved
// prices per entity within a single call to avoid duplicate round-trips.
async function _resolveAmountFromLineItems({ entity, line_items }) {
  if (!Array.isArray(line_items) || line_items.length === 0) {
    return { amount_cents: 0, currency: 'aud', priced: false }
  }
  const cache = new Map()
  let total = 0
  let currency = null
  for (const item of line_items) {
    if (!item || typeof item !== 'object') continue
    const priceId = item.price
    const qty = Number.isFinite(item.quantity) ? item.quantity : 1
    if (!priceId || typeof priceId !== 'string') continue
    let price = cache.get(priceId)
    if (!price) {
      try {
        price = await stripeAgent.retrievePrice({ entity, price_id: priceId })
        cache.set(priceId, price)
      } catch (err) {
        logger.warn({
          event: 'stripe_agent.mirror.price_retrieve_failed',
          entity, price_id: priceId, error: err.message,
        })
        continue
      }
    }
    if (typeof price.unit_amount === 'number') {
      total += price.unit_amount * qty
    }
    if (!currency && price.currency) currency = String(price.currency).toLowerCase()
  }
  return {
    amount_cents: total,
    currency: currency || 'aud',
    priced: total > 0,
  }
}

// Insert a staged_transactions row mirroring a chargeable artefact. Idempotent
// on source_ref. Returns the inserted row id or null on conflict / failure.
async function _mirrorToStaged({
  db, entity, artefact_kind, artefact_id,
  amount_cents, currency, description, long_description, occurred_at,
  metadata,
}) {
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    logger.info({
      event: 'stripe_agent.mirror.skipped_zero_amount',
      entity, artefact_kind, artefact_id,
    })
    return { staged_id: null, reason: 'zero_amount' }
  }
  const sourceAccount = ENTITY_TO_SOURCE_ACCOUNT[entity]
  // Australian GST-inclusive default mirrors stripePaymentToLedger logic.
  const isGstInclusive = (currency || 'aud').toLowerCase() === 'aud'
  const gstCents = isGstInclusive ? Math.round(amount_cents / 11) : null
  const occurredDate = (occurred_at instanceof Date ? occurred_at : new Date())
    .toISOString().slice(0, 10)
  const transactionType = `stripe_agent_${artefact_kind}`

  // long_description carries the structured entity context for downstream
  // categorisation / audit. JSON-encoded so bk_categorize and any future
  // reconciler can parse it back out.
  const enriched = {
    entity,
    artefact_kind,
    artefact_id,
    currency,
    stage_origin: 'stripe_agent_mirror',
    ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
    ...(long_description ? { note: long_description } : {}),
  }

  try {
    const rows = await db`
      INSERT INTO staged_transactions (
        source, source_ref, occurred_at, amount_cents, description,
        long_description, transaction_type, status, source_account,
        is_gst_inclusive, gst_amount_cents, confidence, categorizer_reasoning
      ) VALUES (
        'stripe_agent', ${artefact_id}, ${occurredDate}::date, ${amount_cents}, ${description},
        ${JSON.stringify(enriched)}, ${transactionType}, 'pending', ${sourceAccount},
        ${isGstInclusive}, ${gstCents}, ${0.95},
        ${'staged by stripe_agent MCP mirror: chargeable artefact, awaiting webhook payment match'}
      )
      ON CONFLICT (source_ref) DO NOTHING
      RETURNING id
    `
    const stagedId = rows && rows[0] ? rows[0].id : null
    logger.info({
      event: 'stripe_agent.mirror.staged',
      entity, artefact_kind, artefact_id, staged_id: stagedId,
      amount_cents, currency, source_account: sourceAccount,
    })
    return { staged_id: stagedId, source_account: sourceAccount, gst_cents: gstCents }
  } catch (err) {
    logger.warn({
      event: 'stripe_agent.mirror.staged_insert_failed',
      entity, artefact_kind, artefact_id, error: err.message,
    })
    return { staged_id: null, error: err.message }
  }
}

function mount(router, deps) {
  const { db, scope, audit, withIdempotency, _serverError } = deps

  // ── stripe_agent.probe ─────────────────────────────────────────────────
  // Read-style: retrieves the account record for the entity. No side
  // effects. Uses 'write.stripe_agent' scope because the same Restricted
  // Key is touched and we keep the surface trivially auditable.
  router.post('/stripe_agent.probe', scope.requireScope('write.stripe_agent'), async (req, res) => {
    try {
      const entity = (req.body && req.body.entity) || 'pty_ltd'
      if (!_validEntity(entity)) {
        return res.status(422).json({
          error: 'invalid_entity',
          message: `entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`,
        })
      }
      const result = await stripeAgent.probe({ entity })
      return res.json(result)
    } catch (err) {
      return _serverError(res, err)
    }
  })

  // ── stripe_agent.create_customer ───────────────────────────────────────
  router.post('/stripe_agent.create_customer', scope.requireScope('write.stripe_agent'), async (req, res) => {
    await withIdempotency(req, res, 'stripe_agent.create_customer', async () => {
      const b = req.body || {}
      const entity = b.entity || 'pty_ltd'
      if (!_validEntity(entity)) {
        throw _scopeError(`entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`, 'invalid_entity', 422)
      }
      if (!b.email || typeof b.email !== 'string') {
        throw _scopeError('email (string) required', 'missing_field', 422)
      }
      const customer = await stripeAgent.createCustomer({
        entity,
        email: b.email,
        name: b.name,
        description: b.description,
        metadata: b.metadata,
      })
      audit.logWrite(req, 'stripe_agent.create_customer', {
        scope_used: 'write.stripe_agent',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'stripe.customer',
        affected_row_ref: customer.id,
        request_summary: { entity, email: b.email, name: b.name },
        response_summary: { customer_id: customer.id, email: customer.email },
      })
      return {
        ok: true,
        entity,
        customer_id: customer.id,
        email: customer.email,
        name: customer.name,
        livemode: customer.livemode,
      }
    })
  })

  // ── stripe_agent.create_product ────────────────────────────────────────
  router.post('/stripe_agent.create_product', scope.requireScope('write.stripe_agent'), async (req, res) => {
    await withIdempotency(req, res, 'stripe_agent.create_product', async () => {
      const b = req.body || {}
      const entity = b.entity || 'pty_ltd'
      if (!_validEntity(entity)) {
        throw _scopeError(`entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`, 'invalid_entity', 422)
      }
      if (!b.name || typeof b.name !== 'string') {
        throw _scopeError('name (string) required', 'missing_field', 422)
      }
      const product = await stripeAgent.createProduct({
        entity,
        name: b.name,
        description: b.description,
        metadata: b.metadata,
        images: b.images,
      })
      audit.logWrite(req, 'stripe_agent.create_product', {
        scope_used: 'write.stripe_agent',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'stripe.product',
        affected_row_ref: product.id,
        request_summary: { entity, name: b.name },
        response_summary: { product_id: product.id, name: product.name },
      })
      return {
        ok: true,
        entity,
        product_id: product.id,
        name: product.name,
        active: product.active,
        livemode: product.livemode,
      }
    })
  })

  // ── stripe_agent.create_price ──────────────────────────────────────────
  router.post('/stripe_agent.create_price', scope.requireScope('write.stripe_agent'), async (req, res) => {
    await withIdempotency(req, res, 'stripe_agent.create_price', async () => {
      const b = req.body || {}
      const entity = b.entity || 'pty_ltd'
      if (!_validEntity(entity)) {
        throw _scopeError(`entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`, 'invalid_entity', 422)
      }
      if (!b.product || typeof b.product !== 'string') {
        throw _scopeError('product (string) required', 'missing_field', 422)
      }
      if (!Number.isFinite(b.unit_amount) || b.unit_amount <= 0) {
        throw _scopeError('unit_amount (positive integer cents) required', 'missing_field', 422)
      }
      const price = await stripeAgent.createPrice({
        entity,
        product: b.product,
        unit_amount: b.unit_amount,
        currency: b.currency || 'aud',
        recurring: b.recurring,
        nickname: b.nickname,
        metadata: b.metadata,
      })
      audit.logWrite(req, 'stripe_agent.create_price', {
        scope_used: 'write.stripe_agent',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'stripe.price',
        affected_row_ref: price.id,
        request_summary: { entity, product: b.product, unit_amount: b.unit_amount, currency: b.currency },
        response_summary: { price_id: price.id, unit_amount: price.unit_amount, currency: price.currency },
      })
      return {
        ok: true,
        entity,
        price_id: price.id,
        product: price.product,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
        livemode: price.livemode,
      }
    })
  })

  // ── stripe_agent.create_payment_link ───────────────────────────────────
  // Chargeable artefact: mirrors to staged_transactions row.
  router.post('/stripe_agent.create_payment_link', scope.requireScope('write.stripe_agent'), async (req, res) => {
    await withIdempotency(req, res, 'stripe_agent.create_payment_link', async () => {
      const b = req.body || {}
      const entity = b.entity || 'pty_ltd'
      if (!_validEntity(entity)) {
        throw _scopeError(`entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`, 'invalid_entity', 422)
      }
      if (!Array.isArray(b.line_items) || b.line_items.length === 0) {
        throw _scopeError('line_items (array of { price, quantity? }) required', 'missing_field', 422)
      }

      const link = await stripeAgent.createPaymentLink({
        entity,
        line_items: b.line_items,
        after_completion: b.after_completion,
        metadata: b.metadata,
        allow_promotion_codes: b.allow_promotion_codes,
      })

      // Resolve amount + currency, then mirror to staged_transactions.
      const resolved = await _resolveAmountFromLineItems({ entity, line_items: b.line_items })
      const description = b.mirror_description
        || `Stripe payment link ${link.id} (${entity}, ${resolved.currency.toUpperCase()})`
      const mirror = await _mirrorToStaged({
        db, entity,
        artefact_kind: 'payment_link',
        artefact_id: link.id,
        amount_cents: resolved.amount_cents,
        currency: resolved.currency,
        description,
        long_description: link.url,
        metadata: { stripe_payment_link_url: link.url, ...(b.metadata || {}) },
      })

      audit.logWrite(req, 'stripe_agent.create_payment_link', {
        scope_used: 'write.stripe_agent',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'stripe.payment_link+staged_transactions',
        affected_row_ref: link.id,
        request_summary: { entity, line_item_count: b.line_items.length },
        response_summary: {
          link_id: link.id, url: link.url,
          mirror_staged_id: mirror.staged_id,
          mirror_amount_cents: resolved.amount_cents,
        },
      })
      return {
        ok: true,
        entity,
        link_id: link.id,
        url: link.url,
        active: link.active,
        livemode: link.livemode,
        mirror: {
          staged_id: mirror.staged_id,
          source_account: mirror.source_account || ENTITY_TO_SOURCE_ACCOUNT[entity],
          amount_cents: resolved.amount_cents,
          currency: resolved.currency,
          gst_cents: mirror.gst_cents,
          skipped_reason: mirror.reason || null,
        },
      }
    })
  })

  // ── stripe_agent.create_checkout_session ───────────────────────────────
  // Chargeable artefact: mirrors to staged_transactions row.
  router.post('/stripe_agent.create_checkout_session', scope.requireScope('write.stripe_agent'), async (req, res) => {
    await withIdempotency(req, res, 'stripe_agent.create_checkout_session', async () => {
      const b = req.body || {}
      const entity = b.entity || 'pty_ltd'
      if (!_validEntity(entity)) {
        throw _scopeError(`entity must be one of ${Object.keys(ENTITY_TO_SOURCE_ACCOUNT).join(', ')}`, 'invalid_entity', 422)
      }
      if (!Array.isArray(b.line_items) || b.line_items.length === 0) {
        throw _scopeError('line_items (array of { price, quantity? }) required', 'missing_field', 422)
      }
      const mode = b.mode || 'payment'
      if (!['payment', 'subscription', 'setup'].includes(mode)) {
        throw _scopeError(`mode must be payment|subscription|setup`, 'invalid_mode', 422)
      }
      if (!b.success_url || typeof b.success_url !== 'string') {
        throw _scopeError('success_url (string) required', 'missing_field', 422)
      }

      const session = await stripeAgent.createCheckoutSession({
        entity,
        line_items: b.line_items,
        mode,
        success_url: b.success_url,
        cancel_url: b.cancel_url,
        customer: b.customer,
        customer_email: b.customer_email,
        metadata: b.metadata,
        allow_promotion_codes: b.allow_promotion_codes,
        expires_at: b.expires_at,
      })

      const resolved = await _resolveAmountFromLineItems({ entity, line_items: b.line_items })
      const description = b.mirror_description
        || `Stripe checkout session ${session.id} (${entity}, ${resolved.currency.toUpperCase()}, mode=${mode})`
      const mirror = await _mirrorToStaged({
        db, entity,
        artefact_kind: 'checkout_session',
        artefact_id: session.id,
        amount_cents: resolved.amount_cents,
        currency: resolved.currency,
        description,
        long_description: session.url,
        metadata: { stripe_checkout_session_url: session.url, mode, ...(b.metadata || {}) },
      })

      audit.logWrite(req, 'stripe_agent.create_checkout_session', {
        scope_used: 'write.stripe_agent',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'stripe.checkout_session+staged_transactions',
        affected_row_ref: session.id,
        request_summary: { entity, mode, line_item_count: b.line_items.length },
        response_summary: {
          session_id: session.id, url: session.url,
          mirror_staged_id: mirror.staged_id,
          mirror_amount_cents: resolved.amount_cents,
        },
      })
      return {
        ok: true,
        entity,
        session_id: session.id,
        url: session.url,
        mode,
        status: session.status,
        livemode: session.livemode,
        mirror: {
          staged_id: mirror.staged_id,
          source_account: mirror.source_account || ENTITY_TO_SOURCE_ACCOUNT[entity],
          amount_cents: resolved.amount_cents,
          currency: resolved.currency,
          gst_cents: mirror.gst_cents,
          skipped_reason: mirror.reason || null,
        },
      }
    })
  })
}

module.exports = {
  mount,
  _internal: {
    ENTITY_TO_SOURCE_ACCOUNT,
    _resolveAmountFromLineItems,
    _mirrorToStaged,
  },
}

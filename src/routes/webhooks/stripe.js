'use strict'

/**
 * Stripe webhook handler - closes Wave B's stripe_event matcher loop.
 *
 * Manager: fork_mosn8o5x_7a0e54 (Wave C, worker C1, 5 May 2026).
 *
 * POST /api/webhooks/stripe
 *
 * Verifies via stripe.webhooks.constructEvent + kv_store.creds.stripe_webhook_secret.
 * Same fail-closed posture as Vercel: missing secret → P2 status_board row +
 * HTTP 401 reject all unsigned. Mounted in src/app.js BEFORE express.json()
 * so the raw body survives.
 *
 * Mapping:
 *   invoice.paid                     → invoice_paid
 *   invoice.payment_failed           → invoice_payment_failed
 *   charge.failed                    → charge_failed
 *   customer.subscription.created    → subscription_created
 *   customer.subscription.deleted    → subscription_cancelled
 *   customer.subscription.updated    → subscription_updated
 *
 * Wave B's stripe_event matcher subscribes via source==='stripe' OR kind
 * matches one of the above, so all six map cleanly through.
 *
 * NOTE on stripe SDK: the package is NOT yet a dep at module-load time.
 * To avoid blocking module require, we lazy-load on first request and
 * fall back to manual HMAC verification if the SDK is unavailable - 
 * the manager will run `npm install stripe` from main once this lands.
 */

const express = require('express')
const crypto = require('crypto')

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../../services/perceptionBus')

const router = express.Router()

const KV_KEY = 'creds.stripe_webhook_secret'
const STATUS_ROW_NAME = 'Stripe webhook secret not provisioned'

let _secretCache = { value: null, expiresAt: 0 }

async function _loadSecret() {
  const now = Date.now()
  if (_secretCache.expiresAt > now) return _secretCache.value
  let value = null
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
    const raw = rows?.[0]?.value
    if (typeof raw === 'string') value = raw
    else if (raw && typeof raw === 'object' && typeof raw.secret === 'string') value = raw.secret
    else if (raw && typeof raw === 'object' && typeof raw.value === 'string') value = raw.value
  } catch (err) {
    logger.warn('stripe webhook: kv_store secret read failed', { error: err.message })
  }
  _secretCache = { value, expiresAt: now + 5 * 60 * 1000 }
  // If the secret has now been provisioned (was missing, now present), archive
  // the status_board row that warned about it. AUTONOMY_AUDIT_2026-05-13.
  if (value && _missingSecretRowEnsured) {
    db`UPDATE status_board SET archived_at = NOW() WHERE name = ${STATUS_ROW_NAME} AND archived_at IS NULL`
      .catch(err => logger.debug('stripe webhook: failed to archive missing-secret row (non-fatal)', { error: err.message }))
    _missingSecretRowEnsured = false
  }
  return value
}

let _missingSecretRowEnsured = false
async function _ensureMissingSecretRow() {
  if (_missingSecretRowEnsured) return
  _missingSecretRowEnsured = true
  try {
    const existing = await db`
      SELECT id FROM status_board
      WHERE name = ${STATUS_ROW_NAME} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length === 0) {
      await db`
        INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
        VALUES (
          ${STATUS_ROW_NAME},
          'infrastructure',
          'pending',
          2,
          ${'Register Stripe webhook on dashboard with auto-generated secret, store at kv_store.creds.stripe_webhook_secret. Until then, all incoming webhooks reject 401. Manager fork_mosn8o5x_7a0e54.'},
          'tate',
          'perception_dispatcher',
          ${JSON.stringify({ kv_key: KV_KEY, manager_fork: 'fork_mosn8o5x_7a0e54' })}
        )
      `
    }
  } catch (err) {
    logger.warn('stripe webhook: failed to insert missing-secret status_board row', { error: err.message })
  }
}

let _stripeSdk
let _stripeSdkAttempted = false
function _getStripeSdk() {
  if (_stripeSdkAttempted) return _stripeSdk
  _stripeSdkAttempted = true
  try {
    // Lazy require - package is not yet in package.json dependencies as of
    // worker C1 ship. Manager will `npm install stripe` from main.
    _stripeSdk = require('stripe')
  } catch (err) {
    _stripeSdk = null
    logger.info('stripe webhook: stripe SDK not installed yet, falling back to manual HMAC')
  }
  return _stripeSdk
}

// Manual fallback verification using the documented Stripe v1 scheme:
//   header `Stripe-Signature: t=<ts>,v1=<sig>[,v0=<sig>]`
//   signed_payload = `${t}.${rawBody}`
//   expected = HMAC_SHA256(secret, signed_payload) hex
//
// Used only if the stripe SDK isn't installed yet so we don't fail-open.
function _verifySignatureManual(rawBody, headerSig, secret, toleranceSec = 300) {
  if (!headerSig || !secret) return false
  const parts = String(headerSig).split(',').map(s => s.trim())
  let timestamp = null
  const v1Sigs = []
  for (const p of parts) {
    const [k, v] = p.split('=', 2)
    if (k === 't') timestamp = v
    if (k === 'v1') v1Sigs.push(v)
  }
  if (!timestamp || v1Sigs.length === 0) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  // Accept either seconds or milliseconds (Stripe uses seconds).
  const tsSec = ts > 1e12 ? Math.floor(ts / 1000) : ts
  const nowSec = Math.floor(Date.now() / 1000)
  if (toleranceSec > 0 && Math.abs(nowSec - tsSec) > toleranceSec) return false

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`
  let expected
  try {
    expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  } catch {
    return false
  }
  for (const sig of v1Sigs) {
    if (sig.length !== expected.length) continue
    try {
      if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
        return true
      }
    } catch {
      // length-mismatch / non-hex: treat as no-match, keep iterating
    }
  }
  return false
}

const TYPE_MAP = {
  'invoice.paid': 'invoice_paid',
  'invoice.payment_failed': 'invoice_payment_failed',
  'charge.failed': 'charge_failed',
  'customer.subscription.created': 'subscription_created',
  'customer.subscription.deleted': 'subscription_cancelled',
  'customer.subscription.updated': 'subscription_updated',
}

function _extractData(stripeEvent) {
  const obj = stripeEvent?.data?.object || {}
  const stripeCustomerId = obj.customer
                        || obj.customer_id
                        || stripeEvent?.data?.object?.customer
                        || null
  const amount = (typeof obj.amount_paid === 'number' && obj.amount_paid)
              || (typeof obj.amount_due === 'number' && obj.amount_due)
              || (typeof obj.amount === 'number' && obj.amount)
              || null
  const currency = obj.currency || null
  const invoiceId = obj.id && (obj.object === 'invoice' || stripeEvent?.type?.startsWith('invoice.'))
                  ? obj.id
                  : (obj.invoice || null)
  const chargeId = obj.id && (obj.object === 'charge' || stripeEvent?.type?.startsWith('charge.'))
                 ? obj.id
                 : (obj.charge || null)
  const errorCode = obj.failure_code
                 || obj.last_payment_error?.code
                 || obj.outcome?.reason
                 || null

  return {
    stripe_customer_id: stripeCustomerId,
    amount,
    currency,
    invoice_id: invoiceId,
    charge_id: chargeId,
    error_code: errorCode,
    stripe_event_id: stripeEvent?.id || null,
    raw_type: stripeEvent?.type || null,
  }
}

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '5mb' }),
  async (req, res) => {
    const headerSig = req.get('stripe-signature') || req.get('Stripe-Signature')
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')

    const secret = await _loadSecret()
    if (!secret) {
      _ensureMissingSecretRow().catch(() => {})
      logger.warn('stripe webhook: secret not provisioned, rejecting unsigned request')
      return res.status(401).json({ ok: false, error: 'webhook secret not provisioned' })
    }

    let stripeEvent
    const sdk = _getStripeSdk()
    if (sdk && typeof sdk.webhooks?.constructEvent === 'function') {
      try {
        stripeEvent = sdk.webhooks.constructEvent(rawBody, headerSig, secret)
      } catch (err) {
        logger.warn('stripe webhook: SDK constructEvent rejected request', { error: err.message })
        return res.status(401).json({ ok: false, error: 'invalid signature' })
      }
    } else {
      // Manual fallback. Same security guarantee (HMAC SHA-256 over t.body
      // with timing-safe compare); SDK swap happens once the dep is installed.
      if (!_verifySignatureManual(rawBody, headerSig, secret)) {
        logger.warn('stripe webhook: manual signature verification failed')
        return res.status(401).json({ ok: false, error: 'invalid signature' })
      }
      try {
        stripeEvent = JSON.parse(rawBody.toString('utf8'))
      } catch (err) {
        logger.warn('stripe webhook: invalid JSON payload', { error: err.message })
        return res.status(400).json({ ok: false, error: 'invalid json' })
      }
    }

    const stripeType = stripeEvent?.type || null
    const kind = TYPE_MAP[stripeType] || null
    if (!kind) {
      logger.info('stripe webhook: unmapped event type, skipping publish', { type: stripeType })
      return res.json({ ok: true, skipped: true })
    }

    const data = _extractData(stripeEvent)

    try {
      await perceptionBus.publish({
        source: 'stripe',
        kind,
        data,
        confidence: 1,
      })
    } catch (err) {
      logger.warn('stripe webhook: perceptionBus.publish failed', { error: err.message, kind })
      return res.json({ ok: true, published: false, error: err.message })
    }

    return res.json({ ok: true, kind })
  },
)

module.exports = router

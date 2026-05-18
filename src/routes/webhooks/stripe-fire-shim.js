'use strict'

/**
 * Stripe webhook -> /fire shim for the stripe-event-handler Routine.
 *
 * POST /api/webhooks/stripe-fire
 *
 * Side-by-side with the existing /api/webhooks/stripe handler during Phase 2 of the
 * VPS-to-local migration. After Phase 3 cutover, the existing handler is disabled
 * and this shim becomes the sole stripe webhook entry point.
 *
 * Verifies via stripe.webhooks.constructEvent (or manual HMAC fallback) using
 * kv_store.creds.stripe_webhook_secret. Forwards the event to stripe-event-handler
 * Routine on money@ecodia.au via /fire.
 *
 * Mounted in src/app.js BEFORE express.json() so the raw body survives for HMAC.
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 */

const express = require('express')
const crypto = require('crypto')

const db = require('../../config/db')
const logger = require('../../config/logger')
const { isDuplicate, markSeen, appendAudit, fireRoutine, getRoutineFireConfig } = require('./_fireShimHelpers')

const router = express.Router()

const SOURCE = 'stripe'
const ROUTINE_NAME = 'stripe-event-handler'
const ACCOUNT = 'money@ecodia.au'
const SECRET_KV_KEY = 'creds.stripe_webhook_secret'
const SIGNATURE_TOLERANCE_SECONDS = 300

let _secretCache = { value: null, expiresAt: 0 }
let _stripeSdk = null

async function loadSecret() {
  const now = Date.now()
  if (_secretCache.expiresAt > now) return _secretCache.value
  const rows = await db`SELECT value FROM kv_store WHERE key = ${SECRET_KV_KEY}`
  const raw = rows?.[0]?.value
  let value = null
  if (typeof raw === 'string') value = raw
  else if (raw && typeof raw === 'object') value = raw.secret || raw.value || null
  _secretCache = { value, expiresAt: now + 5 * 60 * 1000 }
  return value
}

function loadStripeSdk() {
  if (_stripeSdk !== null) return _stripeSdk
  try {
    _stripeSdk = require('stripe')
  } catch {
    _stripeSdk = false
  }
  return _stripeSdk
}

function manualVerifyAndParse({ rawBody, header, secret }) {
  if (!header) return null
  const parts = String(header).split(',').reduce((acc, p) => {
    const [k, v] = p.split('=')
    if (k && v) (acc[k] = acc[k] || []).push(v)
    return acc
  }, {})
  const ts = parts.t?.[0]
  const v1s = parts.v1 || []
  if (!ts || v1s.length === 0) return null
  if (Math.abs(Date.now() / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return null
  const signedPayload = `${ts}.${rawBody.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  const ok = v1s.some(sig => {
    try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')) }
    catch { return false }
  })
  if (!ok) return null
  try { return JSON.parse(rawBody.toString('utf8')) } catch { return null }
}

router.post('/', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
  let event = null
  let idempotencyKey = null
  try {
    const secret = await loadSecret()
    if (!secret) {
      logger.error('stripe fire-shim: secret not provisioned in kv_store')
      return res.status(503).json({ error: 'webhook_secret_missing' })
    }

    const sigHeader = req.get('stripe-signature')
    const stripeSdk = loadStripeSdk()
    if (stripeSdk) {
      try {
        event = stripeSdk.webhooks.constructEvent(req.body, sigHeader, secret)
      } catch (err) {
        logger.warn('stripe fire-shim: SDK signature verification failed', { error: err.message })
        return res.status(401).json({ error: 'signature_invalid' })
      }
    } else {
      event = manualVerifyAndParse({ rawBody: req.body, header: sigHeader, secret })
      if (!event) {
        logger.warn('stripe fire-shim: manual signature verification failed')
        return res.status(401).json({ error: 'signature_invalid' })
      }
    }

    idempotencyKey = event.id

    if (await isDuplicate({ source: SOURCE, idempotencyKey })) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'duplicate_skipped', routineName: ROUTINE_NAME, account: ACCOUNT })
      return res.status(202).json({ accepted: true, dedupe: 'duplicate' })
    }

    const cfg = await getRoutineFireConfig({ routineName: ROUTINE_NAME, account: ACCOUNT })
    if (!cfg || !cfg.fire_url || !cfg.fire_token) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'config_missing', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: 'kv_store routine_registry entry missing' })
      return res.status(503).json({ error: 'routine_not_registered' })
    }

    await markSeen({ source: SOURCE, idempotencyKey })

    const result = await fireRoutine({
      fireUrl: cfg.fire_url,
      fireToken: cfg.fire_token,
      source: SOURCE,
      payload: event,
      routineName: ROUTINE_NAME,
      account: ACCOUNT,
    })

    await appendAudit({
      source: SOURCE,
      idempotencyKey,
      fireStatus: result.ok ? `forwarded_${result.status}` : `failed_${result.status}`,
      routineName: ROUTINE_NAME,
      account: ACCOUNT,
      errorMessage: result.error,
    })

    return res.status(result.ok ? 202 : 502).json({ accepted: result.ok, routine_status: result.status, attempt: result.attempt })
  } catch (err) {
    logger.error('stripe fire-shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: err.message }).catch(() => {})
    return res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

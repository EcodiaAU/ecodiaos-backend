'use strict'

/**
 * Resend inbound-email webhook -> /fire shim for the inbound-email-handler Routine.
 *
 * POST /api/webhooks/resend/inbound
 *
 * Verifies via Resend signing-secret HMAC (header: svix-signature, scheme matches
 * webhook.svix.com convention used by Resend Inbound). Forwards the parsed event
 * to the inbound-email-handler Routine on code@ecodia.au via /fire.
 *
 * Mounted in src/app.js BEFORE express.json() so the raw body survives for HMAC.
 *
 * Routine fire URL + token live at kv_store.cowork.routine_registry.code@ecodia.au.inbound-email-handler.
 * Populated by Tate via REGISTRY.md handoff (see backend/routines/REGISTRY.md).
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 */

const express = require('express')
const crypto = require('crypto')

const db = require('../../config/db')
const logger = require('../../config/logger')
const { isDuplicate, markSeen, appendAudit, fireRoutine, getRoutineFireConfig } = require('./_fireShimHelpers')

const router = express.Router()

const SOURCE = 'resend'
const ROUTINE_NAME = 'inbound-email-handler'
const ACCOUNT = 'code@ecodia.au'
const SECRET_KV_KEY = 'creds.resend_webhook_secret'

let _secretCache = { value: null, expiresAt: 0 }

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

function verifySvixSignature({ rawBody, header, secret, msgId, timestamp }) {
  if (!header || !secret || !msgId || !timestamp) return false
  const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const secretBytes = Buffer.from(cleanSecret, 'base64')
  const signedPayload = `${msgId}.${timestamp}.${rawBody.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64')
  const presented = String(header).split(' ').map(s => s.split(',')[1]).filter(Boolean)
  return presented.some(sig => {
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) }
    catch { return false }
  })
}

router.post('/inbound', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  let parsed = null
  let idempotencyKey = null
  try {
    const secret = await loadSecret()
    if (!secret) {
      logger.error('resend fire-shim: secret not provisioned in kv_store')
      return res.status(503).json({ error: 'webhook_secret_missing' })
    }

    const sigHeader = req.get('svix-signature')
    const msgId = req.get('svix-id')
    const timestamp = req.get('svix-timestamp')
    const ok = verifySvixSignature({ rawBody: req.body, header: sigHeader, secret, msgId, timestamp })
    if (!ok) {
      logger.warn('resend fire-shim: signature verification failed', { msgId })
      return res.status(401).json({ error: 'signature_invalid' })
    }

    parsed = JSON.parse(req.body.toString('utf8'))
    idempotencyKey = parsed?.data?.message_id || msgId

    if (await isDuplicate({ source: SOURCE, idempotencyKey })) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'duplicate_skipped', routineName: ROUTINE_NAME, account: ACCOUNT })
      return res.status(202).json({ accepted: true, dedupe: 'duplicate' })
    }

    const cfg = await getRoutineFireConfig({ routineName: ROUTINE_NAME, account: ACCOUNT })
    if (!cfg || !cfg.fire_url || !cfg.fire_token) {
      logger.error('resend fire-shim: routine fire config not in registry', { routine: ROUTINE_NAME, account: ACCOUNT })
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'config_missing', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: 'kv_store routine_registry entry missing' })
      return res.status(503).json({ error: 'routine_not_registered' })
    }

    await markSeen({ source: SOURCE, idempotencyKey })

    const result = await fireRoutine({
      fireUrl: cfg.fire_url,
      fireToken: cfg.fire_token,
      source: SOURCE,
      payload: parsed,
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
    logger.error('resend fire-shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: err.message }).catch(() => {})
    return res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

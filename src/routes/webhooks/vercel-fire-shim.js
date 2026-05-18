'use strict'

/**
 * Vercel webhook -> /fire shim for the vercel-deploy-handler Routine.
 *
 * POST /api/webhooks/vercel-fire
 *
 * Side-by-side with the existing /api/webhooks/vercel handler during Phase 2.
 *
 * Verifies via Vercel signature header (x-vercel-signature, sha1 HMAC of raw body
 * using kv_store.creds.vercel_webhook_secret). Forwards to vercel-deploy-handler
 * Routine on tate@ecodia.au via /fire.
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
const streaming = require('../../services/streamingService')

const router = express.Router()

const SOURCE = 'vercel'
const ROUTINE_NAME = 'vercel-deploy-handler'
const ACCOUNT = 'tate@ecodia.au'
const SECRET_KV_KEY = 'creds.vercel_webhook_secret'

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

function verifySignature({ rawBody, header, secret }) {
  if (!header || !secret) return false
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(header, 'hex'), Buffer.from(expected, 'hex')) }
  catch { return false }
}

router.post('/', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
  let event = null
  let idempotencyKey = null
  try {
    const secret = await loadSecret()
    if (!secret) {
      logger.error('vercel fire-shim: secret not provisioned in kv_store')
      return res.status(503).json({ error: 'webhook_secret_missing' })
    }

    const sigHeader = req.get('x-vercel-signature')
    if (!verifySignature({ rawBody: req.body, header: sigHeader, secret })) {
      logger.warn('vercel fire-shim: signature verification failed')
      return res.status(401).json({ error: 'signature_invalid' })
    }

    try { event = JSON.parse(req.body.toString('utf8')) }
    catch (err) { return res.status(400).json({ error: 'invalid_json' }) }

    idempotencyKey = event?.id || event?.payload?.deployment?.id || null

    streaming.publishSync('vercel.deploys', {
      event_type: event?.type || 'vercel.event',
      payload: {
        id: event?.id || null,
        type: event?.type || null,
        deployment_id: event?.payload?.deployment?.id || null,
        url: event?.payload?.deployment?.url || event?.payload?.url || null,
        target: event?.payload?.target || null,
        project_id: event?.payload?.project?.id || event?.payload?.projectId || null,
        project_name: event?.payload?.project?.name || event?.payload?.name || null,
        creator: event?.payload?.user?.email || event?.payload?.user?.username || null,
        state: event?.payload?.deployment?.state || event?.payload?.state || null,
        created_at: event?.createdAt || null,
      },
    })

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
    logger.error('vercel fire-shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: err.message }).catch(() => {})
    return res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

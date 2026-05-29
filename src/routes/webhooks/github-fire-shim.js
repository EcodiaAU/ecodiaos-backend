'use strict'

/**
 * GitHub webhook -> /fire shim.
 *
 * POST /api/webhooks/github-fire
 *
 * Per the migration architecture (backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 * section 5), GitHub PR events are intended to use the Routines NATIVE GitHub trigger,
 * not a webhook shim. This shim exists as a fallback path for:
 *   - Repository / org-level events not exposed by Anthropic's native GitHub trigger
 *   - Events from repos not yet connected to a Routine's GitHub trigger
 *   - During Phase 2 side-by-side validation
 *
 * Verifies via x-hub-signature-256 (HMAC sha256 of raw body) using
 * kv_store.creds.github_webhook_secret. If a routine_registry entry exists for the
 * GitHub event type, forwards; otherwise logs to audit and 202s.
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 */

const express = require('express')
const crypto = require('crypto')

const db = require('../../config/db')
const logger = require('../../config/logger')
const { isDuplicate, markSeen, appendAudit, dispatchNative } = require('./_fireShimHelpers')

const router = express.Router()

const SOURCE = 'github'
const SECRET_KV_KEY = 'creds.github_webhook_secret'

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
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected)) }
  catch { return false }
}

function resolveRoutineForEvent({ eventName, payload }) {
  const eventToRoutine = {
    'pull_request': 'github-pr-handler',
    'check_run': 'github-check-handler',
    'workflow_run': 'github-workflow-handler',
    'release': 'github-release-handler',
  }
  const routineName = eventToRoutine[eventName] || null
  return routineName
}

router.post('/', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  let event = null
  let idempotencyKey = null
  let routineName = null
  try {
    const secret = await loadSecret()
    if (!secret) {
      logger.error('github fire-shim: secret not provisioned in kv_store')
      return res.status(503).json({ error: 'webhook_secret_missing' })
    }

    const sigHeader = req.get('x-hub-signature-256')
    if (!verifySignature({ rawBody: req.body, header: sigHeader, secret })) {
      logger.warn('github fire-shim: signature verification failed')
      return res.status(401).json({ error: 'signature_invalid' })
    }

    const eventName = req.get('x-github-event')
    const deliveryId = req.get('x-github-delivery')
    idempotencyKey = deliveryId

    try { event = JSON.parse(req.body.toString('utf8')) }
    catch (err) { return res.status(400).json({ error: 'invalid_json' }) }

    if (await isDuplicate({ source: SOURCE, idempotencyKey })) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'duplicate_skipped', routineName: null })
      return res.status(202).json({ accepted: true, dedupe: 'duplicate' })
    }

    routineName = resolveRoutineForEvent({ eventName, payload: event })

    if (!routineName) {
      await markSeen({ source: SOURCE, idempotencyKey })
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'no_routine_for_event', routineName: null, errorMessage: `event_name=${eventName}` })
      logger.info('github fire-shim: no routine mapped for event', { eventName, deliveryId })
      return res.status(202).json({ accepted: true, routed: false, reason: 'no_routine_for_event' })
    }

    await markSeen({ source: SOURCE, idempotencyKey })

    const result = await dispatchNative({
      source: SOURCE,
      payload: { event_name: eventName, delivery_id: deliveryId, body: event },
      routineName,
      account: null,
      idempotencyKey,
    })

    await appendAudit({
      source: SOURCE,
      idempotencyKey,
      fireStatus: result.ok ? `dispatched_native:${result.task_id}` : 'dispatch_failed',
      routineName,
      account: null,
      errorMessage: result.error,
    })

    return res.status(result.ok ? 202 : 502).json({ accepted: result.ok, task_id: result.task_id || null })
  } catch (err) {
    logger.error('github fire-shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName, errorMessage: err.message }).catch(() => {})
    return res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

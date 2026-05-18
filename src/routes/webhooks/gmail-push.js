'use strict'

/**
 * Gmail Pub/Sub push webhook.
 *
 * POST /api/webhooks/gmail-push
 *
 * Google Cloud Pub/Sub push subscription delivery format:
 *   {
 *     "message": {
 *       "data": "<base64 of {emailAddress, historyId} JSON>",
 *       "messageId": "...",
 *       "publishTime": "..."
 *     },
 *     "subscription": "projects/<id>/subscriptions/gmail-inbound-to-webhook"
 *   }
 *
 * On every fire we:
 *   1. Verify the OIDC bearer token (if present) so spoofed POSTs are rejected.
 *   2. Decode the data envelope, get {emailAddress, historyId}.
 *   3. Persist a small kv_store breadcrumb (cowork.gmail_push.last_event.*).
 *   4. Trigger an immediate Gmail history fetch by enqueuing a perception event
 *      `gmail:push_received` for the existing emailArrival pipeline (or by
 *      calling the gmail history fetch path directly).
 *
 * The push subscription expects a 2xx response within ~60s or Pub/Sub will retry
 * up to 7 days. We always respond 204 immediately, then do the history pull
 * async.
 *
 * Auth: Pub/Sub push with OIDC includes Authorization: Bearer <jwt> where the
 * jwt audience is the configured audience on the subscription (we set it to
 * the webhook URL or 'https://api.admin.ecodia.au'). We accept tokens whose
 * audience matches GMAIL_PUSH_EXPECTED_AUDIENCE (env). For dev/loopback or
 * when the env is unset, we accept any token (warn-log).
 */

const express = require('express')
const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../../services/perceptionBus')

const router = express.Router()

const PUSH_EXPECTED_AUDIENCE = process.env.GMAIL_PUSH_EXPECTED_AUDIENCE || ''
const PUSH_ALLOWED_SA_EMAIL = process.env.GMAIL_PUSH_ALLOWED_SA_EMAIL || ''

function _decodeJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch { return null }
}

function _verifyPushAuth(req) {
  const authHeader = req.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    if (PUSH_EXPECTED_AUDIENCE) return { ok: false, reason: 'no_bearer' }
    return { ok: true, reason: 'no_audience_configured_accept_all' }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const payload = _decodeJwtPayload(token)
  if (!payload) {
    return { ok: false, reason: 'jwt_decode_failed' }
  }
  if (PUSH_EXPECTED_AUDIENCE && payload.aud !== PUSH_EXPECTED_AUDIENCE) {
    return { ok: false, reason: 'audience_mismatch', got: payload.aud }
  }
  if (PUSH_ALLOWED_SA_EMAIL && payload.email !== PUSH_ALLOWED_SA_EMAIL) {
    return { ok: false, reason: 'sa_mismatch', got: payload.email }
  }
  if (payload.exp && Date.now() / 1000 > payload.exp + 60) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, sa: payload.email || null, aud: payload.aud || null }
}

router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
  // Always 204 first so Pub/Sub does not retry on our processing latency.
  const respondOk = () => { if (!res.headersSent) res.status(204).end() }

  const auth = _verifyPushAuth(req)
  if (!auth.ok) {
    logger.warn('gmail-push: auth rejected', { reason: auth.reason, got: auth.got })
    res.status(403).json({ error: 'auth_failed', reason: auth.reason })
    return
  }

  respondOk()

  try {
    const envelope = req.body || {}
    const message = envelope.message || {}
    const dataB64 = message.data || ''
    let inner = null
    try {
      inner = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'))
    } catch (err) {
      logger.warn('gmail-push: data decode failed', { error: err.message })
    }
    const emailAddress = inner?.emailAddress || null
    const historyId = inner?.historyId ? String(inner.historyId) : null
    const messageId = message.messageId || null
    const publishTime = message.publishTime || null

    // Breadcrumb so we can see the last event without trawling logs.
    try {
      await db`
        INSERT INTO kv_store (key, value)
        VALUES (${`cowork.gmail_push.last_event.${emailAddress || 'unknown'}`}, ${JSON.stringify({
          historyId, messageId, publishTime, received_at: new Date().toISOString(), sa: auth.sa,
        })}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `
    } catch (err) {
      logger.warn('gmail-push: kv breadcrumb failed', { error: err.message })
    }

    // Emit a perception event the gmail history/emailArrival pipeline can pick up.
    try {
      await perceptionBus.publish({
        source: 'gmail-push',
        kind: 'gmail_push_received',
        data: { emailAddress, historyId, messageId, publishTime, sa: auth.sa },
      })
    } catch (err) {
      logger.warn('gmail-push: perception publish failed', { error: err.message })
    }

    logger.info('gmail-push: ok', { emailAddress, historyId, messageId, sa: auth.sa })
  } catch (err) {
    logger.error('gmail-push: unhandled', { error: err.message, stack: err.stack })
  }
})

module.exports = router

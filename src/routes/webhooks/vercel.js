'use strict'

/**
 * Vercel webhook handler - closes Wave B's deploy_event matcher loop.
 *
 * Manager: fork_mosn8o5x_7a0e54 (Wave C, worker C1, 5 May 2026).
 *
 * POST /api/webhooks/vercel
 *
 * Signature verification: Vercel signs payloads with HMAC-SHA1, header
 * `x-vercel-signature` (lowercase hex, no `sha1=` prefix per current Vercel
 * docs - but we accept either form to be tolerant of older payload shapes).
 * Secret comes from kv_store.creds.vercel_webhook_secret. If the secret is
 * missing we log a warning, insert a P2 status_board row asking Tate to
 * register the webhook on the Vercel dashboard, and reject every unsigned
 * request with HTTP 401 - fail-closed by default.
 *
 * Mounted in src/app.js BEFORE express.json() so the raw body survives
 * for HMAC verification.
 *
 * Payload mapping → perceptionBus kinds:
 *   deployment.created   → vercel_deployment_created
 *   deployment.succeeded → vercel_deployment_succeeded
 *   deployment.error     → vercel_deployment_error
 *   deployment.canceled  → vercel_deployment_canceled
 *
 * Wave B's deploy_event matcher (src/services/matchers/deployEvent.js)
 * subscribes via test() → kind.startsWith('vercel_deployment_').
 */

const express = require('express')
const crypto = require('crypto')

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../../services/perceptionBus')

const router = express.Router()

const KV_KEY = 'creds.vercel_webhook_secret'
const STATUS_ROW_NAME = 'Vercel webhook secret not provisioned'

// Cache the secret so every webhook call doesn't slam kv_store. The cache
// is tight (5 min) so a freshly-provisioned secret picks up quickly.
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
    logger.warn('vercel webhook: kv_store secret read failed', { error: err.message })
  }
  _secretCache = { value, expiresAt: now + 5 * 60 * 1000 }
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
          ${'Register Vercel webhook on dashboard with auto-generated secret, store at kv_store.creds.vercel_webhook_secret. Until then, all incoming webhooks reject 401. Manager fork_mosn8o5x_7a0e54.'},
          'tate',
          'perception_dispatcher',
          ${JSON.stringify({ kv_key: KV_KEY, manager_fork: 'fork_mosn8o5x_7a0e54' })}
        )
      `
    }
  } catch (err) {
    logger.warn('vercel webhook: failed to insert missing-secret status_board row', { error: err.message })
  }
}

function _verifySignature(rawBody, headerSig, secret) {
  if (!headerSig || !secret) return false
  const provided = String(headerSig).replace(/^sha1=/i, '').trim().toLowerCase()
  let computed
  try {
    computed = crypto
      .createHmac('sha1', secret)
      .update(rawBody)
      .digest('hex')
  } catch {
    return false
  }
  if (provided.length !== computed.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'))
  } catch {
    return false
  }
}

function _mapType(vercelType) {
  // Vercel sends e.g. "deployment.created", "deployment.succeeded",
  // "deployment.error", "deployment.canceled". Map any "deployment.*" to
  // a `vercel_deployment_*` perception kind. Other types (project.created
  // etc.) pass through with a `vercel_` prefix so future matchers can opt in.
  if (typeof vercelType !== 'string' || vercelType.length === 0) return null
  if (vercelType.startsWith('deployment.')) {
    const sub = vercelType.slice('deployment.'.length).toLowerCase()
    return `vercel_deployment_${sub}`
  }
  return `vercel_${vercelType.replace(/\./g, '_').toLowerCase()}`
}

function _extractData(payload) {
  // Vercel webhook payloads vary by version. Keep this defensive - pull
  // common fields where present, leave nulls where absent.
  const p = payload?.payload || payload || {}
  const deployment = p.deployment || p || {}
  const project = p.project || {}
  const links = p.links || {}
  return {
    deployment_id: deployment.id || deployment.uid || p.id || null,
    project: project.name || p.name || deployment.name || null,
    project_id: project.id || p.projectId || null,
    url: deployment.url || links.deployment || p.url || null,
    state: deployment.state || deployment.readyState || p.state || null,
    target: deployment.target || p.target || null,
    commit_sha: deployment.meta?.githubCommitSha
             || deployment.meta?.gitlabCommitSha
             || deployment.meta?.bitbucketCommitSha
             || p.commit_sha
             || p.gitSource?.sha
             || null,
    created_at: p.createdAt || deployment.createdAt || null,
    error_message: p.errorMessage || deployment.errorMessage || null,
    raw_type: payload?.type || null,
  }
}

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '5mb' }),
  async (req, res) => {
    const headerSig = req.get('x-vercel-signature') || req.get('X-Vercel-Signature')
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')

    const secret = await _loadSecret()
    if (!secret) {
      _ensureMissingSecretRow().catch(() => {})
      logger.warn('vercel webhook: secret not provisioned, rejecting unsigned request')
      return res.status(401).json({ ok: false, error: 'webhook secret not provisioned' })
    }

    if (!_verifySignature(rawBody, headerSig, secret)) {
      logger.warn('vercel webhook: signature verification failed')
      return res.status(401).json({ ok: false, error: 'invalid signature' })
    }

    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch (err) {
      logger.warn('vercel webhook: invalid JSON payload', { error: err.message })
      return res.status(400).json({ ok: false, error: 'invalid json' })
    }

    const vercelType = payload?.type || payload?.event || null
    const kind = _mapType(vercelType)
    if (!kind) {
      // Unknown shape - accept but don't crash. Matchers won't fire.
      logger.info('vercel webhook: unknown event type, skipping publish', { type: vercelType })
      return res.json({ ok: true, skipped: true })
    }

    const data = _extractData(payload)

    try {
      await perceptionBus.publish({
        source: 'vercel',
        kind,
        data,
        confidence: 1,
      })
    } catch (err) {
      logger.warn('vercel webhook: perceptionBus.publish failed', { error: err.message, kind })
      // Acknowledge anyway - we don't want Vercel to retry-storm us.
      return res.json({ ok: true, published: false, error: err.message })
    }

    return res.json({ ok: true, kind })
  },
)

module.exports = router

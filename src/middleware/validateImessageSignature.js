'use strict'

/**
 * validateImessageSignature - HMAC-SHA256 validation middleware for the
 * iMessage inbound webhook (POST /api/imessage/inbound).
 *
 * Why HMAC: SY094 (MacInCloud) is not on the same Tailscale network as the
 * VPS (only ecodia-vps + corazon are). The AppleScript watcher running
 * inside Messages.app on SY094 POSTs to api.admin.ecodia.au over public
 * HTTPS. Anyone on the public internet can reach the endpoint, so we sign
 * each payload with a shared secret stored in
 * `kv_store.imessage.webhook.hmac_secret` and reject unsigned / mismatched
 * requests.
 *
 * Algorithm:
 *   header  X-Imessage-Signature: hex(HMAC-SHA256(secret, body))
 *   header  X-Imessage-Timestamp: ISO 8601 (sender clock)
 *   reject  if |now - timestamp| > 5min  (replay protection, generous for
 *           SY094 clock drift)
 *   reject  if signature missing or mismatched
 *
 * The body is read raw via express.raw() at the route mount point so the
 * exact bytes the sender HMACed are what we verify. After validation,
 * req.body is re-parsed as JSON for the handler.
 *
 * Authored: 6 May 2026 by fork_moum5ry1_25c72b for the iMessage poll/respond
 * loop MVP. Status_board row f5589865.
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const REPLAY_WINDOW_MS = 5 * 60 * 1000
const KV_KEY = 'imessage.webhook.hmac_secret'

// Cache the secret. Reset by SIGHUP-style restart; rotation requires a
// process restart which is acceptable for an inbound webhook secret.
let _cachedSecret = null

async function _loadSecret() {
  if (_cachedSecret) return _cachedSecret
  const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
  if (!rows || !rows.length) {
    return null
  }
  let v = rows[0].value
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { /* keep as string */ }
  }
  if (typeof v !== 'string') return null
  _cachedSecret = v
  return v
}

function _timingSafeEqHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

async function validateImessageSignature(req, res, next) {
  // The route mounts express.raw() so req.body is a Buffer here. If it's
  // anything else, the mount order is wrong - fail closed.
  if (!Buffer.isBuffer(req.body)) {
    logger.warn('imessage-webhook: req.body is not a Buffer (mount order bug)')
    return res.status(400).json({ ok: false, error: 'malformed_body' })
  }

  const sig = req.get('X-Imessage-Signature')
  const ts = req.get('X-Imessage-Timestamp')
  if (!sig || !ts) {
    logger.warn('imessage-webhook: missing signature or timestamp header')
    return res.status(401).json({ ok: false, error: 'missing_signature' })
  }

  // Replay protection: timestamp must parse and be within 5min of now.
  const tsMs = Date.parse(ts)
  if (!Number.isFinite(tsMs)) {
    return res.status(401).json({ ok: false, error: 'bad_timestamp' })
  }
  const skew = Math.abs(Date.now() - tsMs)
  if (skew > REPLAY_WINDOW_MS) {
    logger.warn('imessage-webhook: timestamp outside replay window', { skewMs: skew })
    return res.status(401).json({ ok: false, error: 'stale_timestamp' })
  }

  const secret = await _loadSecret()
  if (!secret) {
    logger.error('imessage-webhook: hmac secret missing from kv_store')
    return res.status(500).json({ ok: false, error: 'secret_unavailable' })
  }

  // We sign timestamp + "." + body so an attacker can't replay a body with
  // a fresh timestamp.
  const signed = Buffer.concat([Buffer.from(`${ts}.`), req.body])
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex')

  if (!_timingSafeEqHex(sig, expected)) {
    logger.warn('imessage-webhook: signature mismatch', {
      ip: req.ip,
      bodyLen: req.body.length,
    })
    return res.status(401).json({ ok: false, error: 'bad_signature' })
  }

  // Re-parse the body as JSON for the handler. We swap req.body in place
  // so handlers downstream see a plain object.
  try {
    req.body = JSON.parse(req.body.toString('utf8'))
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'invalid_json' })
  }
  next()
}

// Test-only
function _resetForTest() { _cachedSecret = null }

module.exports = validateImessageSignature
module.exports.REPLAY_WINDOW_MS = REPLAY_WINDOW_MS
module.exports._resetForTest = _resetForTest

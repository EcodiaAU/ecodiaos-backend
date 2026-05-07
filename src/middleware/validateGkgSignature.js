'use strict'

/**
 * validateGkgSignature - HMAC-SHA256 validation middleware for the GKG
 * ingest endpoint (POST /api/gkg/ingest).
 *
 * The capture daemon on Corazon HMACs each NDJSON request body with the
 * shared secret stored in `kv_store.gkg.daemon_hmac_secret` and posts to
 * https://api.admin.ecodia.au/api/gkg/ingest. We verify the signature before
 * passing the body downstream for encryption + persistence. Anyone on the
 * public internet can reach the endpoint, so HMAC is non-optional.
 *
 * Algorithm (mirrors validateImessageSignature):
 *   header  X-GKG-Signature: hex(HMAC-SHA256(secret, "<ts>." + body))
 *   header  X-GKG-Timestamp: ISO 8601 (daemon clock)
 *   reject  if |now - timestamp| > 5min   (replay protection, generous for
 *                                          Corazon clock drift)
 *   reject  if signature missing or mismatched
 *
 * The body is read raw via express.raw() at the route mount point so the
 * exact bytes the sender HMACed are what we verify. After validation,
 * req.body remains a Buffer (the route parses NDJSON line-by-line itself,
 * since chunked NDJSON is not idiomatic JSON.parse).
 *
 * Authored 7 May 2026 by fork_mov3r45p_73555d for GKG Phase 1.
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md
 * Status_board: 04599f46-b09f-4958-8129-01bf8e693109
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const REPLAY_WINDOW_MS = 5 * 60 * 1000
const KV_KEY = 'gkg.daemon_hmac_secret'

let _cachedSecret = null

async function _loadSecret() {
  if (_cachedSecret) return _cachedSecret
  const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
  if (!rows || !rows.length) return null
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

async function validateGkgSignature(req, res, next) {
  if (!Buffer.isBuffer(req.body)) {
    logger.warn('gkg-ingest: req.body is not a Buffer (mount order bug)')
    return res.status(400).json({ ok: false, error: 'malformed_body' })
  }

  const sig = req.get('X-GKG-Signature')
  const ts = req.get('X-GKG-Timestamp')
  if (!sig || !ts) {
    return res.status(401).json({ ok: false, error: 'missing_signature' })
  }

  const tsMs = Date.parse(ts)
  if (!Number.isFinite(tsMs)) {
    return res.status(401).json({ ok: false, error: 'bad_timestamp' })
  }
  const skew = Math.abs(Date.now() - tsMs)
  if (skew > REPLAY_WINDOW_MS) {
    return res.status(401).json({ ok: false, error: 'stale_timestamp' })
  }

  const secret = await _loadSecret()
  if (!secret) {
    logger.error('gkg-ingest: hmac secret missing from kv_store (gkg.daemon_hmac_secret)')
    return res.status(500).json({ ok: false, error: 'secret_unavailable' })
  }

  const signed = Buffer.concat([Buffer.from(`${ts}.`), req.body])
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex')

  if (!_timingSafeEqHex(sig, expected)) {
    logger.warn('gkg-ingest: signature mismatch', { ip: req.ip, bodyLen: req.body.length })
    return res.status(401).json({ ok: false, error: 'bad_signature' })
  }

  // Leave req.body as Buffer; route parses NDJSON itself.
  next()
}

function _resetForTest() { _cachedSecret = null }

module.exports = validateGkgSignature
module.exports.REPLAY_WINDOW_MS = REPLAY_WINDOW_MS
module.exports._resetForTest = _resetForTest

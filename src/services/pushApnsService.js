'use strict'

/**
 * Apple Push Notification Service (APNs HTTP/2) sender.
 *
 * Authored 2026-05-07 by fork_mov3s5fq_a7009b during EOS mobile push wiring
 * (status_board P2 row 42d6d656). Phase 2 of the push pipeline:
 *   - Phase 1 (fork_mouxcesl_664d5f): Tate created the APNs Auth Key in
 *     Apple Developer console, .p8 was pulled to
 *     ~/.private_keys/apns/AuthKey_2YTPPCSC3P.p8 and metadata persisted to
 *     kv_store.creds.apple.apns_auth_key (sub-object: key_id, team_id,
 *     p8_path_vps).
 *   - Phase 2 (this service): JWT-sign the .p8, POST notifications to
 *     api.push.apple.com over HTTP/2, return delivery status.
 *
 * Why native http2 + jsonwebtoken instead of `apn` package:
 *   - apn has persistent connection state and a queue model that does not
 *     fit our "send one push" shape; we want a stateless, easily mockable
 *     sender.
 *   - jsonwebtoken is already a dependency.
 *   - http2 is a node builtin.
 *   - Keeps the .p8 read path explicit + testable; no opaque library
 *     reading from disk for us.
 *
 * NEVER log .p8 contents. Cred is loaded once on first use (or per env
 * change) and JWT is cached for ~50 minutes (Apple allows up to 60min,
 * 50 leaves a safety margin).
 *
 * Contract:
 *   pushApns({ device_token, payload }) → { ok, status_code, apns_id?, error? }
 *
 * payload is the inner aps content. We accept either a fully-formed
 * { aps: { ... } } object OR a shorthand { title, body, badge?, sound?,
 * data? } that we wrap into { aps: { alert: { title, body }, sound, badge },
 * ...data }.
 */

const fs = require('fs')
const path = require('path')
const http2 = require('http2')
const jwt = require('jsonwebtoken')

const logger = require('../config/logger')
const db = require('../config/db')

// APNs production host. Use api.sandbox.push.apple.com for development
// builds (Xcode debug). The brief targets production TestFlight builds,
// which use the prod gateway.
const APNS_HOST = process.env.APNS_HOST || 'https://api.push.apple.com'
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'au.ecodia.os.mobile'
const JWT_TTL_MS = 50 * 60 * 1000 // 50 minutes (Apple allows 60)

// Module-level cache: { token, generatedAt, keyId, teamId }. Refresh
// every JWT_TTL_MS or whenever the cred changes.
let _jwtCache = null
let _credCache = null

function _expandHome(p) {
  if (!p) return p
  if (p.startsWith('~/')) return path.join(process.env.HOME || '/home/tate', p.slice(2))
  return p
}

/**
 * Load the APNs cred from kv_store.creds.apple.apns_auth_key.
 * Returns { key_id, team_id, p8_path } where p8_path is absolute.
 * Throws if missing.
 */
// Audit 2026-05-13 P1: previously _credCache had no TTL and no rotation
// detection, so a .p8 rotation pushed via kv_store wouldn't be picked
// up until process restart — and the JWT cache (50min TTL) was keyed
// only on (key_id, team_id) so a same-id rotation went undetected even
// after the next sign cycle. Add a short TTL on the cred cache so
// rotations propagate within a minute, and key the JWT cache on the
// p8_path mtime so a key-content swap forces a fresh JWT immediately.
const CRED_CACHE_TTL_MS = 60_000
let _credCacheFetchedAt = 0
async function _loadCred() {
  if (_credCache && Date.now() - _credCacheFetchedAt < CRED_CACHE_TTL_MS) {
    return _credCache
  }
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.apple'`
  if (!rows || !rows.length) {
    throw new Error('apns_cred_missing: creds.apple row not found in kv_store')
  }
  let parent
  try {
    parent = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
  } catch (err) {
    throw new Error(`apns_cred_invalid_json: ${err.message}`)
  }
  const sub = parent && parent.apns_auth_key
  if (!sub || !sub.key_id || !sub.team_id) {
    throw new Error('apns_cred_missing_fields: apns_auth_key sub-object lacks key_id/team_id')
  }
  const p8Path = _expandHome(sub.p8_path_vps || sub.file_path || sub.p8_path)
  if (!p8Path) {
    throw new Error('apns_cred_missing_path: no p8 file path in cred')
  }
  if (!fs.existsSync(p8Path)) {
    throw new Error(`apns_p8_not_on_disk: ${p8Path}`)
  }
  // Capture the .p8 mtime so the JWT cache can detect a key-content
  // rotation even when key_id/team_id stay the same.
  let p8Mtime = 0
  try {
    const stat = fs.statSync(p8Path)
    p8Mtime = stat.mtimeMs || 0
  } catch { /* mtime not critical; default 0 */ }
  _credCache = { key_id: sub.key_id, team_id: sub.team_id, p8_path: p8Path, p8_mtime: p8Mtime }
  _credCacheFetchedAt = Date.now()
  return _credCache
}

/**
 * Mint a fresh ES256 JWT signed with the .p8 private key. Returns the
 * encoded JWT string. Caller-provided cred avoids re-reading kv_store on
 * every refresh.
 *
 * NEVER logs the key contents.
 */
function _signJwt({ key_id, team_id, p8_path }) {
  const privateKey = fs.readFileSync(p8_path, 'utf8')
  const now = Math.floor(Date.now() / 1000)
  const token = jwt.sign(
    { iss: team_id, iat: now },
    privateKey,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: key_id, typ: 'JWT' },
    }
  )
  return token
}

/**
 * Returns a fresh-or-cached JWT. Cached for JWT_TTL_MS.
 */
async function _getJwt() {
  const cred = await _loadCred()
  // Audit 2026-05-13 P1: also key on p8_mtime so a key-content swap
  // (kv_store update + on-disk .p8 replace with same key_id/team_id)
  // forces a fresh JWT immediately rather than running with the old
  // signing key for up to 50min.
  if (
    _jwtCache &&
    _jwtCache.token &&
    _jwtCache.keyId === cred.key_id &&
    _jwtCache.teamId === cred.team_id &&
    _jwtCache.p8Mtime === cred.p8_mtime &&
    Date.now() - _jwtCache.generatedAt < JWT_TTL_MS
  ) {
    return { jwt: _jwtCache.token, cred }
  }
  const token = _signJwt(cred)
  _jwtCache = {
    token,
    generatedAt: Date.now(),
    keyId: cred.key_id,
    teamId: cred.team_id,
    p8Mtime: cred.p8_mtime,
  }
  return { jwt: token, cred }
}

/**
 * Test seam: clear caches. Used by unit tests.
 */
function _resetCachesForTest() {
  _jwtCache = null
  _credCache = null
  _credCacheFetchedAt = 0
}

/**
 * Build APNs payload object. Accepts:
 *   - shorthand: { title, body, badge?, sound?, data? }
 *   - full: { aps: { ... }, ...data }
 * Returns the JSON body Apple expects.
 */
function _buildPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { aps: { alert: { title: '', body: '' }, sound: 'default' } }
  }
  if (payload.aps && typeof payload.aps === 'object') {
    return payload
  }
  const { title, body, badge, sound, data } = payload
  const out = {
    aps: {
      alert: { title: String(title || ''), body: String(body || '') },
      sound: sound || 'default',
    },
  }
  if (typeof badge === 'number') out.aps.badge = badge
  if (data && typeof data === 'object') Object.assign(out, data)
  // Default badge:1 per brief if not specified.
  if (out.aps.badge === undefined) out.aps.badge = 1
  return out
}

/**
 * HTTP/2 POST to APNs. Resolves with { ok, status_code, apns_id, error }.
 * Never throws — caller can rely on the return value.
 *
 * Test seam: pass `_h2override` (a function returning a connect-shim) to
 * bypass the real http2 module. Production callers never set this.
 */
function _postToApns({ host, path: pathStr, headers, body, _h2override } = {}) {
  return new Promise((resolve) => {
    let resolved = false
    const finish = (out) => {
      if (resolved) return
      resolved = true
      resolve(out)
    }
    let client
    try {
      const connectFn = _h2override || http2.connect
      client = connectFn(host)
    } catch (err) {
      return finish({ ok: false, status_code: 0, error: `h2_connect_failed: ${err.message}` })
    }
    const onError = (err) => {
      try { client.close() } catch {}
      finish({ ok: false, status_code: 0, error: `h2_error: ${err.message}` })
    }
    client.on('error', onError)
    client.on('socketError', onError)

    let req
    try {
      req = client.request({
        ':method': 'POST',
        ':path': pathStr,
        ...headers,
      })
    } catch (err) {
      try { client.close() } catch {}
      return finish({ ok: false, status_code: 0, error: `h2_request_failed: ${err.message}` })
    }

    let statusCode = 0
    let apnsId = null
    let respBody = ''
    req.on('response', (h) => {
      statusCode = parseInt(h[':status'], 10) || 0
      apnsId = h['apns-id'] || null
    })
    req.on('data', (chunk) => { respBody += chunk.toString('utf8') })
    req.on('end', () => {
      try { client.close() } catch {}
      if (statusCode >= 200 && statusCode < 300) {
        finish({ ok: true, status_code: statusCode, apns_id: apnsId })
      } else {
        let errMsg = respBody.slice(0, 300)
        try {
          const j = JSON.parse(respBody)
          if (j.reason) errMsg = j.reason
        } catch {}
        finish({ ok: false, status_code: statusCode, apns_id: apnsId, error: errMsg })
      }
    })
    req.on('error', onError)
    req.setTimeout(15000, () => {
      try { req.close() } catch {}
      try { client.close() } catch {}
      finish({ ok: false, status_code: 0, error: 'h2_timeout' })
    })

    req.write(body)
    req.end()
  })
}

/**
 * Public sender. Accepts:
 *   { device_token, payload }
 * Returns:
 *   { ok, status_code, apns_id?, error? }
 *
 * Never throws.
 */
async function pushApns({ device_token, payload, _h2override } = {}) {
  if (!device_token || typeof device_token !== 'string') {
    return { ok: false, status_code: 0, error: 'invalid_device_token' }
  }
  let jwtToken, cred
  try {
    const out = await _getJwt()
    jwtToken = out.jwt
    cred = out.cred
  } catch (err) {
    logger.error('pushApns: cred/jwt failure', { error: err.message })
    return { ok: false, status_code: 0, error: err.message }
  }
  const body = JSON.stringify(_buildPayload(payload))
  const headers = {
    'authorization': `bearer ${jwtToken}`,
    'apns-topic': APNS_BUNDLE_ID,
    'apns-push-type': 'alert',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body).toString(),
  }
  const result = await _postToApns({
    host: APNS_HOST,
    path: `/3/device/${device_token}`,
    headers,
    body,
    _h2override,
  })
  // Token-revoked / invalid → mark in DB so we stop targeting it.
  // Audit 2026-05-13 P1: previously only matched three exact strings;
  // Apple also emits ExpiredToken, DeviceTokenNotForTopic, and casing
  // variants. Normalise to a Set; treat any status_code 410 as token-
  // gone regardless of the reason string.
  const _TOKEN_GONE_REASONS = new Set([
    'baddevicetoken', 'unregistered', 'expiredtoken', 'devicetokennotfortopic',
  ])
  const _normalisedReason = String(result && result.error || '').replace(/[^a-zA-Z]/g, '').toLowerCase()
  if (!result.ok && (result.status_code === 410 || _TOKEN_GONE_REASONS.has(_normalisedReason))) {
    try {
      await db`UPDATE push_tokens SET revoked_at = now() WHERE device_token = ${device_token} AND revoked_at IS NULL`
    } catch (err) {
      logger.warn('pushApns: failed to mark token revoked', { error: err.message })
    }
  }
  if (!result.ok) {
    logger.warn('pushApns: send failed', {
      status: result.status_code,
      error: result.error,
      // device token tail only for traceability without leaking the full token
      token_tail: device_token.slice(-8),
      key_id: cred.key_id,
    })
  } else {
    logger.info('pushApns: send ok', {
      apns_id: result.apns_id,
      token_tail: device_token.slice(-8),
    })
  }
  return result
}

/**
 * Tate-multi-channel notify. iMessage substrate removed Tate-directed
 * 11 May 2026 16:44 AEST. Order is now:
 *   1. APNs to all active push_tokens for user_id='tate'
 *   2. Twilio SMS (last-resort)
 *
 * Returns { ok, channels: { apns: [{token_tail, ok, status_code}], sms } }.
 *
 * Each step is best-effort; the wrapper does NOT throw. We treat the
 * overall send as ok if ANY channel succeeded. Override with
 * { all_channels: true } to fan out everywhere.
 */
async function notifyTateMultiChannel({ title, body, data, all_channels } = {}) {
  const titleStr = String(title || '')
  const bodyStr = String(body || '')
  const channels = { apns: [], sms: null }
  let anyOk = false

  // 1. APNs to active tokens for tate
  let tokens = []
  try {
    tokens = await db`
      SELECT device_token FROM push_tokens
      WHERE user_id = 'tate' AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
    `
  } catch (err) {
    logger.warn('notifyTateMultiChannel: token lookup failed', { error: err.message })
  }
  for (const row of tokens) {
    const r = await pushApns({
      device_token: row.device_token,
      payload: { title: titleStr, body: bodyStr, data },
    })
    channels.apns.push({ token_tail: row.device_token.slice(-8), ok: r.ok, status_code: r.status_code, error: r.error })
    if (r.ok) anyOk = true
  }
  if (anyOk && !all_channels) {
    return { ok: true, channels }
  }

  // 2. Twilio SMS as final fallback.
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = (process.env.TWILIO_FROM_NUMBER || '').trim()
    const to = process.env.TATE_MOBILE
    if (sid && token && from && to) {
      const smsBody = (titleStr ? `${titleStr}\n` : '') + bodyStr
      const auth = Buffer.from(`${sid}:${token}`).toString('base64')
      const params = new URLSearchParams({ From: from, To: to, Body: smsBody.slice(0, 1500) })
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      channels.sms = !!res.ok
      if (channels.sms) anyOk = true
    } else {
      channels.sms = false
    }
  } catch (err) {
    logger.warn('notifyTateMultiChannel: Twilio threw', { error: err.message })
    channels.sms = false
  }

  return { ok: anyOk, channels }
}

module.exports = {
  pushApns,
  notifyTateMultiChannel,
  // Exposed for unit tests only.
  _resetCachesForTest,
  _signJwt,
  _buildPayload,
  _loadCred,
}

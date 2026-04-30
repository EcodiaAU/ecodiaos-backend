'use strict'

/**
 * tier3GateService — Tier-3 action authorization tokens.
 *
 * Implements section 3.2 of ~/ecodiaos/docs/SECURITY_HARDENING.md.
 *
 * Replaces the freetext tateGoaheadRef lie: any compromised session could
 * pass `tateGoaheadRef="approved"` and the send went through. The new
 * model issues short-lived, single-use, HMAC-signed tokens bound to
 * {action_type, target_hash, session_id}. The MCP server (or any code
 * performing a Tier-3 action) calls verifyAndConsume() before acting.
 *
 * Token lifecycle:
 *   1. Caller invokes issueToken({ action_type, target, session_id, ttl_ms }).
 *      - If (action_type, target_hash) matches a row in
 *        authorized_action_patterns, issue synchronously and log.
 *      - Otherwise, create a tier3_otp_pending row with a 6-digit code,
 *        send Tate an SMS containing the code + action summary, and
 *        return { status: 'pending_otp', otp_id }.
 *   2. Tate replies "Y <6-digit>". The SMS inbound handler calls
 *      completeOtpChallenge(code) which issues the token and binds it to
 *      the session_id / target_hash of the pending row.
 *   3. Caller invokes verifyAndConsume({ token, action_type, target, session_id }).
 *      - Validates: row exists, not expired, not already consumed, all
 *        fields match the bind.
 *      - Atomically marks consumed_at on success (single-use).
 *
 * Token format: opaque URL-safe base64 of a 256-bit nonce. The server
 * stores sha256(nonce) in token_hash; the raw token only exists in the
 * caller's memory for the duration of the action. No plaintext secrets
 * in the DB.
 *
 * HMAC: target_hash = hmac_sha256(TIER3_TOKEN_HMAC_KEY, canonical(target))
 *   where canonical(target) is a deterministic JSON stringify with sorted
 *   keys. This prevents binding bypass by reordering payload fields.
 *
 * Failure handling:
 *   - issueToken: if DB unreachable, throw (caller treats as "cannot
 *     authorize", fails closed).
 *   - verifyAndConsume: fails closed on every error path. Single non-200
 *     = deny.
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const TOKEN_TTL_MS_DEFAULT = 15 * 60 * 1000 // 15 min per §3.2
const OTP_TTL_MS = 10 * 60 * 1000            // 10 min per §3.2
const NONCE_BYTES = 32                       // 256 bits

function _getHmacKey() {
  const raw = process.env.TIER3_TOKEN_HMAC_KEY
  if (!raw || raw.length < 32) {
    // Production MUST set this. Dev gets a warning-with-a-stable-default
    // so local tests don't fail on cold-start, but that key is NOT safe
    // for any real deployment.
    logger.warn('TIER3_TOKEN_HMAC_KEY missing or short — using dev-only default (INSECURE outside tests)')
    return 'dev-only-insecure-tier3-hmac-key-replace-in-production-64'
  }
  return raw
}

function _canonicalTarget(target) {
  // Deterministic stringify: strings pass through as-is; objects sort keys.
  if (target === null || target === undefined) return ''
  if (typeof target === 'string') return target
  if (typeof target !== 'object') return String(target)
  const sortedKeys = Object.keys(target).sort()
  const parts = sortedKeys.map((k) => {
    const v = target[k]
    if (v === null || v === undefined) return `${k}=`
    if (typeof v === 'object') return `${k}=${JSON.stringify(v, Object.keys(v).sort())}`
    return `${k}=${String(v)}`
  })
  return parts.join('&')
}

function hashTarget(target) {
  const hmac = crypto.createHmac('sha256', _getHmacKey())
  hmac.update(_canonicalTarget(target))
  return hmac.digest('hex')
}

function _hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function _generateToken() {
  return crypto.randomBytes(NONCE_BYTES).toString('base64url')
}

function _generateOtp() {
  // 6-digit decimal, zero-padded. 1e6 keyspace is fine because otp
  // windows are 10-min single-use and the endpoint is rate-limited.
  const n = crypto.randomInt(0, 1_000_000)
  return String(n).padStart(6, '0')
}

async function _findAutoAuthorizedPattern(actionType, target) {
  try {
    const rows = await db`
      SELECT pattern_name, matcher_json
      FROM authorized_action_patterns
      WHERE action_type = ${actionType}
        AND active = TRUE
    `
    for (const row of rows) {
      if (_matcherAccepts(row.matcher_json, target)) {
        return row.pattern_name
      }
    }
    return null
  } catch (err) {
    logger.error('tier3GateService: pattern lookup failed — failing closed', { error: err.message })
    return null
  }
}

function _matcherAccepts(matcher, target) {
  if (!matcher || typeof matcher !== 'object') return false
  // Simple field-equality matcher. Each key in matcher must be present
  // in target and equal. Matchers may use `$in` for set membership:
  //   { to_domain: { "$in": ["ecodia.au", "ecodia.com.au"] } }
  //   { max_body_length: { "$lte": 1000 } }
  for (const [field, spec] of Object.entries(matcher)) {
    const actual = target?.[field]
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      if ('$in' in spec && !spec.$in.includes(actual)) return false
      if ('$eq' in spec && actual !== spec.$eq) return false
      if ('$lte' in spec && !(typeof actual === 'number' && actual <= spec.$lte)) return false
      if ('$gte' in spec && !(typeof actual === 'number' && actual >= spec.$gte)) return false
    } else if (actual !== spec) {
      return false
    }
  }
  return true
}

/**
 * Issue a Tier-3 token.
 *
 * If auto-authorized: returns { status: 'issued', token, expires_at, pattern_name }.
 * If OTP required: inserts a pending OTP row and returns
 *   { status: 'pending_otp', otp_id, otp_code, expires_at }.
 *   The caller is responsible for dispatching the SMS (we don't couple
 *   this service to twilio so it's testable in isolation).
 */
async function issueToken({ action_type, target, session_id, ttl_ms }) {
  if (!action_type || typeof action_type !== 'string') {
    throw new Error('tier3GateService.issueToken: action_type required')
  }
  if (!session_id || typeof session_id !== 'string') {
    throw new Error('tier3GateService.issueToken: session_id required')
  }
  const targetHash = hashTarget(target || {})
  const ttl = Number.isFinite(ttl_ms) && ttl_ms > 0 ? Math.min(ttl_ms, 60 * 60 * 1000) : TOKEN_TTL_MS_DEFAULT

  const patternName = await _findAutoAuthorizedPattern(action_type, target)
  if (patternName) {
    return _insertIssuedToken({ action_type, targetHash, session_id, ttl, patternName })
  }

  const otpCode = _generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const [row] = await db`
    INSERT INTO tier3_otp_pending
      (otp_code, action_type, target_hash, session_id, expires_at)
    VALUES
      (${otpCode}, ${action_type}, ${targetHash}, ${session_id}, ${expiresAt})
    RETURNING id, expires_at
  `
  logger.info('tier3GateService: OTP challenge issued', {
    session_id, action_type, otp_id: row.id, expires_at: row.expires_at,
  })
  return {
    status: 'pending_otp',
    otp_id: row.id,
    otp_code: otpCode,
    expires_at: row.expires_at,
    target_hash: targetHash,
  }
}

async function _insertIssuedToken({ action_type, targetHash, session_id, ttl, patternName }) {
  const rawToken = _generateToken()
  const tokenHash = _hashToken(rawToken)
  const expiresAt = new Date(Date.now() + ttl)
  await db`
    INSERT INTO tier3_action_tokens
      (token_hash, action_type, target_hash, session_id, expires_at)
    VALUES
      (${tokenHash}, ${action_type}, ${targetHash}, ${session_id}, ${expiresAt})
  `
  logger.info('tier3GateService: token issued', {
    session_id,
    action_type,
    pattern: patternName || 'otp-complete',
    expires_at: expiresAt,
  })
  return {
    status: 'issued',
    token: rawToken,
    expires_at: expiresAt,
    pattern_name: patternName || null,
  }
}

/**
 * Complete an OTP challenge and issue a token.
 *
 * Called from the SMS inbound handler when Tate replies "Y <otp>".
 * Returns the issued token (single use, caller must hand it to the
 * dispatcher immediately). Returns null if no matching pending OTP
 * exists, is expired, or is already consumed.
 */
async function completeOtpChallenge({ otp_code }) {
  if (!otp_code || typeof otp_code !== 'string') return null
  // Atomic consume: claim the pending row in a single UPDATE so two SMS
  // inbounds racing on the same code can't both succeed.
  const [claimed] = await db`
    UPDATE tier3_otp_pending
    SET consumed_at = now()
    WHERE otp_code = ${otp_code}
      AND consumed_at IS NULL
      AND expires_at > now()
    RETURNING id, action_type, target_hash, session_id
  `
  if (!claimed) return null
  const { action_type, target_hash: targetHash, session_id } = claimed
  const ttl = TOKEN_TTL_MS_DEFAULT
  return _insertIssuedToken({ action_type, targetHash, session_id, ttl, patternName: 'otp-complete' })
}

/**
 * Verify and atomically consume a token.
 *
 * Returns true on success, false otherwise. Never throws — a thrown error
 * from the DB layer returns false (fail closed).
 */
async function verifyAndConsume({ token, action_type, target, session_id }) {
  if (!token || typeof token !== 'string') return false
  if (!action_type || !session_id) return false
  const tokenHash = _hashToken(token)
  const targetHash = hashTarget(target || {})
  try {
    const [consumed] = await db`
      UPDATE tier3_action_tokens
      SET consumed_at = now()
      WHERE token_hash = ${tokenHash}
        AND action_type = ${action_type}
        AND target_hash = ${targetHash}
        AND session_id = ${session_id}
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id
    `
    if (!consumed) {
      logger.warn('tier3GateService: verify FAILED', { session_id, action_type })
      return false
    }
    logger.info('tier3GateService: verify OK, token consumed', { session_id, action_type, token_id: consumed.id })
    return true
  } catch (err) {
    logger.error('tier3GateService: verify threw — failing closed', { error: err.message })
    return false
  }
}

/**
 * Lookup a pattern by name (for admin tooling / tests).
 */
async function getAuthorizedPattern(pattern_name) {
  const [row] = await db`
    SELECT * FROM authorized_action_patterns WHERE pattern_name = ${pattern_name}
  `
  return row || null
}

module.exports = {
  hashTarget,
  issueToken,
  completeOtpChallenge,
  verifyAndConsume,
  getAuthorizedPattern,
  // exported for tests only
  _internal: {
    _canonicalTarget,
    _generateToken,
    _generateOtp,
    _matcherAccepts,
  },
}

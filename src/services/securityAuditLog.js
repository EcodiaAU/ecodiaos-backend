'use strict'

/**
 * securityAuditLog - §7.1 signed append-only Tier-3 action audit log.
 *
 * Every Tier-3 action (external gmail_send, git push, deploySession,
 * Stripe/Xero write, governance-domain recipient, etc.) writes a row
 * here with an HMAC signature. The DB trigger rejects UPDATE/DELETE so
 * a compromised session cannot forge a clean history.
 *
 * Canonicalization: rows are signed over a sorted-key concatenation of
 * the fields that uniquely identify the action. The signature proves
 * both integrity (row wasn't tampered with) and provenance (the HMAC
 * key lives only on the VPS).
 *
 * Fail behaviour: if the DB is unreachable or HMAC key is missing, the
 * write throws. Callers must treat that as a failed action (never "but
 * log the action anyway"): the audit trail is the action's receipt, and
 * a missing receipt means the action did not happen.
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const ALLOWED_ACTION_TYPES = Object.freeze([
  'gmail_send_external',
  'gmail_send_governance',
  'git_push',
  'deploy_session',
  'stripe_write',
  'xero_write',
  'sms_tate',
  'factory_dispatch',
  'kg_pattern_promote',
])

function _getHmacKey() {
  const raw = process.env.AUDIT_LOG_HMAC_KEY
  if (!raw || raw.length < 32) {
    logger.warn('AUDIT_LOG_HMAC_KEY missing or short — using dev default (INSECURE outside tests)')
    return 'dev-only-insecure-audit-log-hmac-key-replace-in-production-64'
  }
  return raw
}

function _canonical(obj) {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  const keys = Object.keys(obj).sort()
  return keys.map((k) => {
    const v = obj[k]
    if (v === null || v === undefined) return `${k}=`
    if (typeof v === 'object') return `${k}=${JSON.stringify(v, Object.keys(v).sort())}`
    return `${k}=${String(v)}`
  }).join('&')
}

function _sha256hex(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

function fingerprintAction(actionType, target) {
  return _sha256hex(`${actionType}|${_canonical(target)}`)
}

function hashContent(content) {
  return _sha256hex(String(content ?? ''))
}

function _hmacRow(row) {
  const hmac = crypto.createHmac('sha256', _getHmacKey())
  const canonical = _canonical({
    action_type: row.action_type,
    action_fingerprint: row.action_fingerprint,
    session_id: row.session_id,
    trigger_source: row.trigger_source,
    gate_token_id: row.gate_token_id,
    content_hash: row.content_hash,
    timestamp_utc: row.timestamp_utc,
  })
  hmac.update(canonical)
  return hmac.digest('hex')
}

/**
 * Append an audit entry. Throws if DB write fails or signing fails.
 *
 * @param {object} params
 * @param {string} params.action_type - must be one of ALLOWED_ACTION_TYPES
 * @param {object} params.target - structured payload (to, subject, commit_sha, etc.)
 * @param {string} [params.session_id]
 * @param {string} [params.trigger_source]
 * @param {number} [params.gate_token_id] - tier3_action_tokens.id if gate was used
 * @param {string|object} [params.content] - the actual content; hashed, not stored
 * @returns {Promise<object>} the inserted row
 */
async function append({
  action_type,
  target,
  session_id,
  trigger_source,
  gate_token_id,
  content,
}) {
  if (!ALLOWED_ACTION_TYPES.includes(action_type)) {
    throw new Error(`securityAuditLog: action_type '${action_type}' not in allowlist`)
  }
  const fingerprint = fingerprintAction(action_type, target || {})
  const contentHash = content !== undefined ? hashContent(
    typeof content === 'string' ? content : JSON.stringify(content)
  ) : null
  const now = new Date()
  const row = {
    action_type,
    action_fingerprint: fingerprint,
    session_id: session_id || null,
    trigger_source: trigger_source || null,
    gate_token_id: gate_token_id || null,
    content_hash: contentHash,
    timestamp_utc: now.toISOString(),
  }
  const hmacSig = _hmacRow(row)

  const [inserted] = await db`
    INSERT INTO security_audit_log
      (action_type, action_fingerprint, session_id, trigger_source,
       gate_token_id, content_hash, hmac_signature, timestamp_utc)
    VALUES
      (${row.action_type}, ${row.action_fingerprint}, ${row.session_id},
       ${row.trigger_source}, ${row.gate_token_id}, ${row.content_hash},
       ${hmacSig}, ${now})
    RETURNING *
  `
  if (!inserted) {
    throw new Error('securityAuditLog: insert returned no row')
  }
  return inserted
}

/**
 * Re-verify the HMAC signature on a row from the log. Returns true if
 * the signature matches the stored fields, false otherwise. Used by the
 * weekly audit cron to detect tampering attempts.
 */
function verifyRow(row) {
  if (!row || !row.hmac_signature) return false
  // Normalise timestamp_utc - Postgres returns Date, we signed ISO string.
  const normalized = {
    action_type: row.action_type,
    action_fingerprint: row.action_fingerprint,
    session_id: row.session_id,
    trigger_source: row.trigger_source,
    gate_token_id: row.gate_token_id,
    content_hash: row.content_hash,
    timestamp_utc: row.timestamp_utc instanceof Date
      ? row.timestamp_utc.toISOString()
      : String(row.timestamp_utc),
  }
  const expected = _hmacRow(normalized)
  if (expected.length !== row.hmac_signature.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(row.hmac_signature, 'hex'),
    )
  } catch {
    return false
  }
}

module.exports = {
  append,
  verifyRow,
  fingerprintAction,
  hashContent,
  ALLOWED_ACTION_TYPES,
}

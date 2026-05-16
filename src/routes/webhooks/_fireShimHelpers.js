'use strict'

/**
 * Shared helpers for webhook-level fire-shim idempotency and audit.
 *
 * Used by smsWebhook.js (and any future webhook that fires into the reflex
 * substrate) to prevent duplicate fires and write durable audit trails.
 *
 * Dedup key format: "fire_shim:{source}:{idempotencyKey}" in
 * cowork_idempotency_log (24h TTL, shared with cowork MCP cache).
 *
 * Audit writes to cowork_audit_log (same table as cowork MCP writes).
 * scope_used = 'fire_shim' distinguishes these from MCP-origin rows.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const DEDUP_KEY_PREFIX = 'fire_shim'

function _dedupKey(source, idempotencyKey) {
  return `${DEDUP_KEY_PREFIX}:${source}:${idempotencyKey}`
}

/**
 * Returns true if this source+idempotencyKey has already been seen within 24h.
 */
async function isDuplicate({ source, idempotencyKey }) {
  if (!source || !idempotencyKey) return false
  const key = _dedupKey(source, idempotencyKey)
  try {
    const [row] = await db`
      SELECT key FROM cowork_idempotency_log
      WHERE key = ${key}
        AND created_at > NOW() - INTERVAL '24 hours'
    `
    return !!row
  } catch (err) {
    logger.warn('_fireShimHelpers.isDuplicate failed (non-fatal, allowing fire)', { error: err.message, key })
    return false
  }
}

/**
 * Records this source+idempotencyKey as seen so future calls to isDuplicate
 * return true for the next 24h.
 */
async function markSeen({ source, idempotencyKey }) {
  if (!source || !idempotencyKey) return
  const key = _dedupKey(source, idempotencyKey)
  try {
    await db`
      INSERT INTO cowork_idempotency_log (key, tool_name, response_json, created_at)
      VALUES (${key}, 'fire_shim', ${JSON.stringify({ seen_at: new Date().toISOString(), source })}, NOW())
      ON CONFLICT (key) DO NOTHING
    `
  } catch (err) {
    logger.warn('_fireShimHelpers.markSeen failed (non-fatal)', { error: err.message, key })
  }
}

/**
 * Appends a row to cowork_audit_log for post-hoc observability of webhook fires.
 *
 * @param {object} opts
 * @param {string} opts.source          - e.g. 'twilio-sms'
 * @param {string} opts.idempotencyKey  - MessageSid or equivalent
 * @param {string} opts.fireStatus      - e.g. 'reflex_200', 'duplicate_skipped', 'shim_error'
 * @param {string} opts.routineName     - label for the reflex target
 * @param {string} opts.account         - account/profile label
 * @param {string} [opts.errorMessage]  - populated on failure paths
 */
async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  try {
    await db`
      INSERT INTO cowork_audit_log (
        cowork_session_id, tool_name, scope_used,
        request_summary, response_summary,
        affected_substrate, affected_row_ref
      ) VALUES (
        ${null},
        ${source || 'fire_shim'},
        ${'fire_shim'},
        ${JSON.stringify({ idempotencyKey, routineName, account })},
        ${JSON.stringify({ fireStatus, ...(errorMessage ? { errorMessage } : {}) })},
        ${routineName || null},
        ${idempotencyKey || null}
      )
    `
  } catch (err) {
    logger.warn('_fireShimHelpers.appendAudit failed (non-fatal)', { error: err.message, fireStatus })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

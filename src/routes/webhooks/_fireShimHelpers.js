'use strict'

/**
 * Shared idempotency + audit helpers for webhook-to-reflex shim routes.
 *
 * isDuplicate / markSeen use cowork_idempotency_log (24h TTL).
 * appendAudit writes to cowork_audit_log for observability.
 *
 * All three are non-fatal: a DB failure logs a warning and the caller
 * continues - the shim MUST respond to Twilio regardless.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const DEDUP_KEY_PREFIX = 'shim:seen:'

async function isDuplicate({ source, idempotencyKey }) {
  if (!idempotencyKey) return false
  const key = `${DEDUP_KEY_PREFIX}${source}:${idempotencyKey}`
  try {
    const [row] = await db`
      SELECT 1 FROM cowork_idempotency_log
      WHERE key = ${key}
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `
    return !!row
  } catch (err) {
    logger.warn('_fireShimHelpers.isDuplicate failed (non-fatal)', { error: err.message, key })
    return false
  }
}

async function markSeen({ source, idempotencyKey }) {
  if (!idempotencyKey) return
  const key = `${DEDUP_KEY_PREFIX}${source}:${idempotencyKey}`
  try {
    await db`
      INSERT INTO cowork_idempotency_log (key, tool_name, response_json, created_at)
      VALUES (${key}, ${source || 'shim'}, ${JSON.stringify({ seen: true })}, NOW())
      ON CONFLICT (key) DO UPDATE SET created_at = NOW()
    `
    if (Math.random() < 0.02) {
      await db`DELETE FROM cowork_idempotency_log WHERE created_at < NOW() - INTERVAL '24 hours'`
    }
  } catch (err) {
    logger.warn('_fireShimHelpers.markSeen failed (non-fatal)', { error: err.message, key })
  }
}

async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  try {
    await db`
      INSERT INTO cowork_audit_log (
        tool_name,
        scope_used,
        request_summary,
        response_summary,
        affected_substrate
      ) VALUES (
        ${source || 'sms-shim'},
        ${routineName || account || 'sms-reflex'},
        ${JSON.stringify({ idempotency_key: idempotencyKey, source })},
        ${JSON.stringify({ fire_status: fireStatus, account, error: errorMessage || null })},
        ${'reflex.fire'}
      )
    `
  } catch (err) {
    logger.warn('_fireShimHelpers.appendAudit failed (non-fatal)', {
      error: err.message,
      fireStatus,
      idempotencyKey,
    })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

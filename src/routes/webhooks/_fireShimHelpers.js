'use strict'

/**
 * Shared idempotency + audit helpers for webhook-to-reflex shims.
 *
 * Consumed by: smsWebhook.js (Twilio -> Corazon reflex.fire)
 * Future consumers: resend, stripe, vercel, github, apple-asn shims when
 * those are re-routed to the Corazon reflex substrate.
 *
 * isDuplicate / markSeen use cowork_idempotency_log with a 24h TTL.
 * appendAudit writes a structured row to cowork_audit_log.
 *
 * All three functions are fail-soft: they catch and log DB errors rather
 * than propagating them, because a logging failure must never block a webhook
 * response (Twilio expects HTTP 200 within 15s or it retries).
 *
 * Anthropic headers canon (2026-05-16 REGISTRY.md):
 *   anthropic-beta: claude-code-2025-04-01
 *   anthropic-version: 2023-06-01
 * These are added to any outbound Anthropic API calls made by shims in this
 * directory. Individual shim handlers include them in their fetch() calls.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const DEDUP_KEY_PREFIX = 'shim'
const DEDUP_CLEANUP_PROBABILITY = 0.02

function _dedupKey(source, idempotencyKey) {
  return `${DEDUP_KEY_PREFIX}:${source}:${idempotencyKey}`
}

/**
 * Returns true if this (source, idempotencyKey) pair has been seen within
 * the last 24 hours. Fail-soft: returns false on DB error so the webhook
 * proceeds rather than silently dropping.
 */
async function isDuplicate({ source, idempotencyKey }) {
  if (!source || !idempotencyKey) return false
  const key = _dedupKey(source, idempotencyKey)
  try {
    const rows = await db`
      SELECT 1 FROM cowork_idempotency_log
      WHERE key = ${key}
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `
    return rows.length > 0
  } catch (err) {
    logger.warn('_fireShimHelpers.isDuplicate: DB read failed (fail-open)', {
      source,
      idempotencyKey,
      error: err.message,
    })
    return false
  }
}

/**
 * Records (source, idempotencyKey) as seen. Idempotent via ON CONFLICT DO
 * UPDATE so a second call with the same key just refreshes created_at.
 * Fail-soft: swallows DB errors rather than throwing.
 */
async function markSeen({ source, idempotencyKey }) {
  if (!source || !idempotencyKey) return
  const key = _dedupKey(source, idempotencyKey)
  try {
    await db`
      INSERT INTO cowork_idempotency_log (key, tool_name, response_json, created_at)
      VALUES (${key}, ${'reflex.shim'}, ${JSON.stringify({ source, idempotencyKey })}, NOW())
      ON CONFLICT (key) DO UPDATE
        SET created_at = NOW(),
            response_json = EXCLUDED.response_json
    `
    if (Math.random() < DEDUP_CLEANUP_PROBABILITY) {
      await db`
        DELETE FROM cowork_idempotency_log
        WHERE key LIKE ${`${DEDUP_KEY_PREFIX}:%`}
          AND created_at < NOW() - INTERVAL '24 hours'
      `.catch(() => {})
    }
  } catch (err) {
    logger.warn('_fireShimHelpers.markSeen: DB write failed (non-fatal)', {
      source,
      idempotencyKey,
      error: err.message,
    })
  }
}

/**
 * Appends a structured audit row to cowork_audit_log.
 *
 * @param {Object} opts
 * @param {string} opts.source          - webhook source identifier (e.g. 'twilio-sms')
 * @param {string} opts.idempotencyKey  - MessageSid or equivalent
 * @param {string} opts.fireStatus      - outcome code (e.g. 'reflex_200', 'duplicate_skipped', 'reflex_failed_0')
 * @param {string} opts.routineName     - target label (e.g. 'corazon-vscode-claude-code-tab')
 * @param {string} opts.account         - account identifier used for the fire
 * @param {string} [opts.errorMessage]  - set when fireStatus indicates failure
 */
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
        ${routineName || 'reflex.fire'},
        ${source || 'unknown'},
        ${JSON.stringify({ idempotencyKey, source, account })},
        ${JSON.stringify({ fireStatus, errorMessage: errorMessage || null })},
        ${'reflex'}
      )
    `
  } catch (err) {
    logger.warn('_fireShimHelpers.appendAudit: DB write failed (non-fatal)', {
      source,
      idempotencyKey,
      fireStatus,
      error: err.message,
    })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

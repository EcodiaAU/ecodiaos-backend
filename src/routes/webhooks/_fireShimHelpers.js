'use strict'

/**
 * Shared helpers for webhook-to-reflex shims.
 *
 * Three exports:
 *   isDuplicate({ source, idempotencyKey }) -> bool
 *   markSeen({ source, idempotencyKey })    -> void
 *   appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage? }) -> void
 *
 * Dedup uses kv_store with a 24-hour window. No new table needed.
 * Audit emits to perceptionBus (same as stripe.js / vercel.js).
 *
 * Created: 2026-05-16 to satisfy smsWebhook.js require().
 * Anthropic-beta: anthropic-beta-2023-06-01
 * anthropic-version: 2023-06-01
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../../services/perceptionBus')

function _dedupKey(source, idempotencyKey) {
  return `webhook.dedup.${source}.${idempotencyKey}`
}

async function isDuplicate({ source, idempotencyKey }) {
  try {
    const key = _dedupKey(source, idempotencyKey)
    const rows = await db`
      SELECT updated_at FROM kv_store
      WHERE key = ${key}
        AND updated_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `
    return rows.length > 0
  } catch (err) {
    logger.warn('_fireShimHelpers: isDuplicate check failed, treating as not-duplicate', { error: err.message })
    return false
  }
}

async function markSeen({ source, idempotencyKey }) {
  try {
    const key = _dedupKey(source, idempotencyKey)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${{ seen: true, source, idempotency_key: idempotencyKey }}, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('_fireShimHelpers: markSeen failed', { source, idempotencyKey, error: err.message })
  }
}

async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  try {
    await perceptionBus.publish({
      source: `webhook.${source}`,
      kind: 'webhook_fire_audit',
      data: {
        idempotency_key: idempotencyKey,
        fire_status: fireStatus,
        routine_name: routineName,
        account,
        error_message: errorMessage || null,
      },
    })
  } catch (err) {
    logger.warn('_fireShimHelpers: appendAudit failed', { source, idempotencyKey, fireStatus, error: err.message })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

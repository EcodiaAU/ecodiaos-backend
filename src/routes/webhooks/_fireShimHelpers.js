'use strict'

/**
 * Shared helpers for webhook -> reflex fire shims.
 *
 * Three primitives:
 *   isDuplicate({ source, idempotencyKey })  - true if already seen within 24h
 *   markSeen({ source, idempotencyKey })     - record that we are processing this id
 *   appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage })
 *
 * State lives in kv_store under two key prefixes:
 *   fire_shim.seen.{source}.{idempotencyKey}   - dedup marker (updated_at = seen-at)
 *   fire_shim.audit.{source}.{idempotencyKey}  - ordered list of fire events (cap 20)
 *
 * Used by: smsWebhook. Intended future consumers: resend, vercel, stripe,
 * github, apple-asn webhook-to-reflex shims (per REFLEX_SUBSTRATE_SESSION
 * 2026-05-16 migration plan).
 *
 * Both isDuplicate and markSeen fail-open (a kv_store failure is treated as
 * not-duplicate / no-op respectively) so a DB hiccup does not block webhook
 * delivery. appendAudit is best-effort; failure is logged at debug level only.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const AUDIT_EVENT_CAP = 20

function _dedupKey(source, idKey) {
  return `fire_shim.seen.${source}.${idKey}`
}

function _auditKey(source, idKey) {
  return `fire_shim.audit.${source}.${idKey}`
}

async function isDuplicate({ source, idempotencyKey }) {
  try {
    const rows = await db`
      SELECT updated_at FROM kv_store
      WHERE key = ${_dedupKey(source, idempotencyKey)}
      LIMIT 1
    `
    if (!rows.length) return false
    return Date.now() - new Date(rows[0].updated_at).getTime() < DEDUP_TTL_MS
  } catch (err) {
    logger.warn('fire_shim: isDuplicate check failed, treating as not-duplicate', { error: err.message })
    return false
  }
}

async function markSeen({ source, idempotencyKey }) {
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${_dedupKey(source, idempotencyKey)}, ${{ seen: true }}, now())
      ON CONFLICT (key) DO UPDATE SET updated_at = now()
    `
  } catch (err) {
    logger.warn('fire_shim: markSeen failed (non-fatal)', { error: err.message })
  }
}

async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  const key = _auditKey(source, idempotencyKey)
  const event = {
    ts: new Date().toISOString(),
    fireStatus,
    routineName: routineName || null,
    account: account || null,
  }
  if (errorMessage) event.errorMessage = String(errorMessage).slice(0, 500)

  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    const existing = rows[0]?.value
    const events = Array.isArray(existing?.events) ? existing.events : []
    events.push(event)
    if (events.length > AUDIT_EVENT_CAP) events.splice(0, events.length - AUDIT_EVENT_CAP)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${{ events }}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.debug('fire_shim: appendAudit failed (non-fatal)', { error: err.message })
  }
}

module.exports = { isDuplicate, markSeen, appendAudit }

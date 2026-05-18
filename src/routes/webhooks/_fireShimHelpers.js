'use strict'

/**
 * Shared helpers for the per-source /fire webhook shims.
 *
 * Each webhook (resend, stripe, vercel, github, apple-asn) verifies its
 * source-specific signature, then forwards the event to the corresponding
 * Routine's /fire endpoint as `{ text: JSON.stringify({ source, payload }) }`.
 *
 * This module owns:
 *  - idempotency (kv_store seen-key with TTL)
 *  - audit logging (kv_store webhook_audit, no body)
 *  - retry-with-backoff against the Routine /fire endpoint (5xx only)
 *  - account-router-aware dispatch when the routine is multi-account
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 * See backend/patterns/webhook-fire-shim-architecture-2026-05-15.md.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const SEEN_KEY_PREFIX = 'cowork.webhook_seen.'
const AUDIT_KEY = 'cowork.webhook_audit'
const SEEN_TTL_HOURS = 24
const RETRY_MAX = 3
const RETRY_BACKOFF_MS = [1000, 2000, 4000]

async function isDuplicate({ source, idempotencyKey }) {
  if (!idempotencyKey) return false
  const key = `${SEEN_KEY_PREFIX}${source}.${idempotencyKey}`
  const rows = await db`SELECT key FROM kv_store WHERE key = ${key} LIMIT 1`
  return rows.length > 0
}

async function markSeen({ source, idempotencyKey }) {
  if (!idempotencyKey) return
  const key = `${SEEN_KEY_PREFIX}${source}.${idempotencyKey}`
  const expiresAt = new Date(Date.now() + SEEN_TTL_HOURS * 3600 * 1000).toISOString()
  await db`
    INSERT INTO kv_store (key, value, expires_at)
    VALUES (${key}, ${JSON.stringify({ seen_at: new Date().toISOString() })}::jsonb, ${expiresAt}::timestamptz)
    ON CONFLICT (key) DO NOTHING
  `
}

async function appendAudit({ source, idempotencyKey, fireStatus, routineName, account, errorMessage }) {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    idempotency_key: idempotencyKey || null,
    routine_name: routineName,
    account: account || null,
    fire_status: fireStatus,
    error: errorMessage || null,
  }
  try {
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${AUDIT_KEY}, ${JSON.stringify([entry])}::jsonb)
      ON CONFLICT (key) DO UPDATE
      SET value = (
        CASE
          WHEN jsonb_array_length(kv_store.value) >= 1000
          THEN (kv_store.value - 0) || ${JSON.stringify(entry)}::jsonb
          ELSE kv_store.value || ${JSON.stringify(entry)}::jsonb
        END
      )
    `
  } catch (err) {
    logger.warn('webhook fire-shim: audit append failed (non-fatal)', { source, error: err.message })
  }
}

async function fireRoutine({ fireUrl, fireToken, source, payload, routineName, account }) {
  const body = JSON.stringify({
    text: JSON.stringify({ source, payload }),
  })
  const headers = {
    'Authorization': `Bearer ${fireToken}`,
    'Content-Type': 'application/json',
    // Canonical /fire contract per backend/routines/REGISTRY.md (dated 2026-05-16).
    // Without these two headers the Anthropic routines endpoint returns 4xx.
    'anthropic-beta': 'experimental-cc-routine-2026-04-01',
    'anthropic-version': '2023-06-01',
  }
  let lastErr = null
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const resp = await fetch(fireUrl, { method: 'POST', headers, body })
      if (resp.status >= 200 && resp.status < 300) {
        return { ok: true, status: resp.status, attempt: attempt + 1 }
      }
      if (resp.status >= 400 && resp.status < 500) {
        const text = await resp.text().catch(() => '')
        return { ok: false, status: resp.status, error: `client error: ${text.slice(0, 200)}`, attempt: attempt + 1 }
      }
      lastErr = `5xx: ${resp.status}`
    } catch (err) {
      lastErr = err.message
    }
    if (attempt < RETRY_MAX - 1) {
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt]))
    }
  }
  return { ok: false, status: 0, error: `retries exhausted: ${lastErr}`, attempt: RETRY_MAX }
}

async function getRoutineFireConfig({ routineName, account }) {
  if (account) {
    const key = `cowork.routine_registry.${account}.${routineName}`
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    if (rows.length === 0) return null
    return rows[0].value
  }
  const accountRouter = require('../../services/accountRouter')
  const account2 = await accountRouter.pickAccount({})
  const key = `cowork.routine_registry.${account2}.${routineName}`
  const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
  if (rows.length === 0) return null
  return { ...rows[0].value, _resolved_account: account2 }
}

module.exports = {
  isDuplicate,
  markSeen,
  appendAudit,
  fireRoutine,
  getRoutineFireConfig,
}

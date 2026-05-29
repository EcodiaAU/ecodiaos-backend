'use strict'

/**
 * Shared helpers for the per-source webhook shims.
 *
 * Each webhook (resend, stripe, vercel, github, apple-asn) verifies its
 * source-specific signature, then dispatches the event to a fresh native CC
 * worker via the scheduler (dispatchNative). The worker reads the matching
 * routine spec and handles the event on the narrow MCP connectors.
 *
 * This module owns:
 *  - idempotency (kv_store seen-key with TTL)
 *  - audit logging (kv_store webhook_audit, no body)
 *  - native dispatch: insert an immediate os_scheduled_tasks row that the
 *    schedulerPollerService picks up and routes to cowork.dispatch_worker
 *
 * Authored 2026-05-15 as Lane D of the VPS-to-local migration. Migrated from the
 * Anthropic /fire endpoint to native dispatch 2026-05-29 (status_board 2bf2c734,
 * Tate "everything native, using our scheduler"). The legacy fireRoutine +
 * getRoutineFireConfig path against api.anthropic.com is retired; the Anthropic
 * Routines it called are deleted.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

const SEEN_KEY_PREFIX = 'cowork.webhook_seen.'
const AUDIT_KEY = 'cowork.webhook_audit'
const SEEN_TTL_HOURS = 24

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

/**
 * Build the self-contained worker brief a CC tab receives for a webhook event.
 * The worker has no prior context, so the brief names the routine spec to read,
 * embeds the verified event payload, and mandates the close-out sequence.
 */
function buildWorkerBrief({ source, payload, routineName, account }) {
  const payloadJson = JSON.stringify(payload, null, 2)
  // Cap the embedded payload so a giant event does not blow the brief. The
  // worker can re-fetch full detail from the source API if it needs more.
  const payloadBlock = payloadJson.length > 12000
    ? payloadJson.slice(0, 12000) + '\n... [payload truncated; re-fetch from source API if full detail needed]'
    : payloadJson

  return [
    'You are EcodiaOS in fork form, no prior context. This brief is your entire context.',
    '',
    `WEBHOOK EVENT: a verified "${source}" event arrived on the VPS webhook ingress and was dispatched to you natively (status_board 2bf2c734 - webhook routines run native, not on Anthropic Routines).`,
    '',
    `TASK: handle this event per the routine spec at D:/.code/EcodiaOS/backend/routines/${routineName}.md. Read that file in full, then act on the payload below exactly as the spec directs. Account context: ${account}.`,
    '',
    'Substrate hands: the narrow MCP connectors (ecodia-core for status_board/kv_store/neo4j, ecodia-money for Stripe/bookkeeping, ecodia-comms for gmail/sms). The deprecated cowork/ecodia-full bearers are gone.',
    '',
    'VERIFY-BEFORE-DECLARE-DONE: probe the destination substrate after every write. Em-dashes banned at character level - use " - ". Write a closing Episode via neo4j.write_episode (ecodia-core).',
    '',
    'Your final action: coord.close_my_tab after coord.signal_done({terminate:true}).',
    '',
    `--- VERIFIED ${source.toUpperCase()} EVENT PAYLOAD ---`,
    payloadBlock,
  ].join('\n')
}

/**
 * Native dispatch: insert an immediate os_scheduled_tasks row that
 * schedulerPollerService (polling every 30s) picks up and routes to
 * cowork.dispatch_worker on the always-on device, opening a fresh CC chat.
 *
 * Replaces the legacy fireRoutine() Anthropic /fire POST. The task name carries
 * the source + idempotency key so the row is traceable and the worker tab is
 * identifiable. type='delayed', next_run_at=NOW() => picked up on the next poll.
 */
async function dispatchNative({ source, payload, routineName, account, idempotencyKey }) {
  const brief = buildWorkerBrief({ source, payload, routineName, account })
  const taskName = `webhook.${source}.${(idempotencyKey || 'noid').toString().slice(0, 80)}`
  try {
    const [row] = await db`
      INSERT INTO os_scheduled_tasks (type, name, prompt, status, run_at, next_run_at, run_count, max_runs)
      VALUES ('delayed', ${taskName}, ${brief}, 'active', NOW(), NOW(), 0, 1)
      RETURNING id
    `
    return { ok: true, task_id: row.id, task_name: taskName }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = {
  isDuplicate,
  markSeen,
  appendAudit,
  dispatchNative,
  buildWorkerBrief,
}

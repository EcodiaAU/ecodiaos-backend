'use strict'

/**
 * actionVerification — the canonical wrapper for every Tier-3 outbound action.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 (integrations audit, primary finding).
 * The system was claiming "I sent the email" / "I deployed" / "I posted the
 * invoice" with no verification that the action actually succeeded downstream.
 * 124 silent catches across the services dir were burying delivery failures.
 *
 * Lifecycle of an action:
 *
 *   1. record({action_type, action_key, target, payload}) → row in outbound_actions
 *      with status='pending', returns row id. If action_key collides with an
 *      existing non-failed row (verified or pending), the original row is
 *      returned with `replayed=true` — caller short-circuits, no re-send.
 *
 *   2. caller invokes the vendor API (gmail.send, vercel.deploy, ...).
 *
 *   3. markDispatched(id, {external_id, metadata?}) → flips to 'dispatched'.
 *      caller passes the vendor's id (message_id, deployment_id, ...).
 *
 *   4. verify(id, asyncProbe) → repeatedly invokes asyncProbe (Gmail History,
 *      Vercel GET on prod URL, Stripe invoice status query) with exponential
 *      backoff until probe returns {ok:true} or timeout. Flips status to
 *      'verified' or 'failed'.
 *
 *   5. abandonStale() — sweep called by retention cron, surfaces stuck pending
 *      rows to observer_signals.
 *
 * The wrapper is non-fatal on its own failures: if the DB write fails, the
 * vendor send still proceeds — we just lose the audit trail for that call. Do
 * NOT block business behaviour on the audit table being reachable.
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

function _sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

function canonicalPayloadHash(parts) {
  // parts: object whose JSON-serialised form is stable. Sort keys for stability.
  const sorted = JSON.stringify(parts, Object.keys(parts).sort())
  return _sha256(sorted)
}

/**
 * Record a pending outbound action. Idempotent on (action_type, action_key).
 *
 * @returns {Promise<{id, replayed, existing}>}
 *   - replayed=true means an in-flight or verified row with the same idempotency
 *     key was found; the caller MUST NOT re-send and should return the existing
 *     external_id.
 */
async function record({ action_type, action_key = null, target = null, payload = null, metadata = {} } = {}) {
  if (!action_type) throw new Error('action_type required')
  const payload_hash = payload ? canonicalPayloadHash(payload) : null
  try {
    if (action_key) {
      // Idempotency lookup first.
      const existing = await db`
        SELECT id, status, external_id, payload_hash
        FROM outbound_actions
        WHERE action_type = ${action_type} AND action_key = ${action_key}
        LIMIT 1
      `
      if (existing.length) {
        const row = existing[0]
        if (row.status === 'failed') {
          // Re-try a previously failed send: bump attempt count, flip to pending.
          await db`
            UPDATE outbound_actions
            SET status='pending', attempt_count=attempt_count+1, last_error=NULL, updated_at=NOW()
            WHERE id=${row.id}
          `
          return { id: row.id, replayed: false, existing: false }
        }
        return { id: row.id, replayed: true, existing: row }
      }
    }
    const rows = await db`
      INSERT INTO outbound_actions
        (action_type, action_key, target, payload_hash, metadata, status, attempt_count)
      VALUES
        (${action_type}, ${action_key}, ${target}, ${payload_hash}, ${JSON.stringify(metadata)}::jsonb, 'pending', 1)
      RETURNING id
    `
    return { id: rows[0]?.id || null, replayed: false, existing: false }
  } catch (err) {
    logger.warn('actionVerification.record: insert failed (non-fatal, send still proceeds)', {
      error: err.message, action_type, target,
    })
    return { id: null, replayed: false, existing: false }
  }
}

async function markDispatched(id, { external_id = null, metadata = null } = {}) {
  if (!id) return
  try {
    await db`
      UPDATE outbound_actions
      SET status='dispatched',
          external_id = COALESCE(${external_id}, external_id),
          dispatched_at = NOW(),
          metadata = CASE WHEN ${metadata !== null}::boolean
                          THEN metadata || ${JSON.stringify(metadata || {})}::jsonb
                          ELSE metadata END,
          updated_at = NOW()
      WHERE id = ${id}
    `
  } catch (err) {
    logger.debug('actionVerification.markDispatched failed (non-fatal)', { id, error: err.message })
  }
}

async function markVerified(id, { external_id = null, metadata = null } = {}) {
  if (!id) return
  try {
    await db`
      UPDATE outbound_actions
      SET status='verified',
          external_id = COALESCE(${external_id}, external_id),
          verified_at = NOW(),
          metadata = CASE WHEN ${metadata !== null}::boolean
                          THEN metadata || ${JSON.stringify(metadata || {})}::jsonb
                          ELSE metadata END,
          updated_at = NOW()
      WHERE id = ${id}
    `
  } catch (err) {
    logger.debug('actionVerification.markVerified failed (non-fatal)', { id, error: err.message })
  }
}

async function markFailed(id, error_message) {
  if (!id) return
  try {
    await db`
      UPDATE outbound_actions
      SET status='failed',
          failed_at = NOW(),
          last_error = ${String(error_message || 'unknown').slice(0, 1000)},
          updated_at = NOW()
      WHERE id = ${id}
    `
  } catch (err) {
    logger.debug('actionVerification.markFailed failed (non-fatal)', { id, error: err.message })
  }
}

/**
 * Run an async probe with exponential backoff until it returns ok or timeout.
 *
 * @param {Function} probe — async fn returning {ok:boolean, detail?:string}
 * @param {object} opts
 * @param {number} opts.timeoutMs default 5min
 * @param {number} opts.initialDelayMs default 1000
 * @param {number} opts.maxDelayMs default 30000
 * @returns {Promise<{ok, attempts, lastDetail}>}
 */
async function _poll(probe, { timeoutMs = 5 * 60 * 1000, initialDelayMs = 1000, maxDelayMs = 30_000 } = {}) {
  const start = Date.now()
  let delay = initialDelayMs
  let attempts = 0
  let lastDetail = null
  while (Date.now() - start < timeoutMs) {
    attempts += 1
    try {
      const r = await probe()
      if (r && r.ok) return { ok: true, attempts, lastDetail: r.detail || null }
      lastDetail = r?.detail || null
    } catch (err) {
      lastDetail = err.message
    }
    await new Promise(r => setTimeout(r, delay))
    delay = Math.min(delay * 2, maxDelayMs)
  }
  return { ok: false, attempts, lastDetail }
}

/**
 * High-level wrapper: record → execute → markDispatched → verify → markVerified|markFailed.
 *
 * @param {object} action — {action_type, action_key, target, payload, metadata}
 * @param {Function} send — async fn returning {external_id, metadata?} on success
 * @param {Function} verify — async fn taking the send result, returning {ok, detail?}.
 *   If omitted, no verification — markVerified is called immediately after send.
 * @param {object} opts — passed to _poll for verify
 *
 * @returns {Promise<{id, external_id, replayed, verified, error?}>}
 */
async function withVerification(action, send, verify, opts) {
  const rec = await record(action)
  if (rec.replayed) {
    return {
      id: rec.id, external_id: rec.existing?.external_id || null,
      replayed: true, verified: rec.existing?.status === 'verified',
    }
  }
  let sendResult
  try {
    sendResult = await send()
  } catch (err) {
    await markFailed(rec.id, err.message)
    throw err
  }
  await markDispatched(rec.id, { external_id: sendResult?.external_id || null, metadata: sendResult?.metadata || null })

  if (typeof verify !== 'function') {
    await markVerified(rec.id, { external_id: sendResult?.external_id || null })
    return { id: rec.id, external_id: sendResult?.external_id || null, replayed: false, verified: true }
  }

  // Fire-and-forget verification poll. The caller does not wait; the row flips
  // status when the probe lands. If verify never returns ok, the row stays
  // 'dispatched' and the abandonStale sweep eventually surfaces it.
  _poll(() => verify(sendResult), opts)
    .then(async (r) => {
      if (r.ok) await markVerified(rec.id, { metadata: { verify_attempts: r.attempts, verify_detail: r.lastDetail } })
      else      await markFailed(rec.id, `verification timed out after ${r.attempts} attempts: ${r.lastDetail}`)
    })
    .catch(err => logger.warn('actionVerification.withVerification: verify poll threw', { id: rec.id, error: err.message }))

  return { id: rec.id, external_id: sendResult?.external_id || null, replayed: false, verified: false /* pending */ }
}

/**
 * Sweep rows stuck in 'dispatched' (or 'pending') longer than the given window.
 * Surfaces them to observer_signals so the conductor can act. Called by the
 * retention/health cron.
 */
async function abandonStale({ staleAfterMin = 30, batchLimit = 50 } = {}) {
  try {
    const rows = await db`
      UPDATE outbound_actions
      SET status='abandoned', updated_at=NOW(),
          last_error = COALESCE(last_error, 'stale: no verification within window')
      WHERE status IN ('pending', 'dispatched')
        AND created_at < NOW() - (${staleAfterMin}::int * INTERVAL '1 minute')
      RETURNING id, action_type, target, attempt_count
      LIMIT ${batchLimit}
    `
    if (rows.length) {
      logger.warn('actionVerification.abandonStale: rows abandoned', { count: rows.length })
      // Best-effort observer signal write so the conductor sees it on next turn.
      try {
        const observerSignals = require('../services/observerSignalsService')
        for (const r of rows) {
          await observerSignals.writeSignal?.({
            observer_name: 'action_verification',
            signal_kind: 'stale_outbound_action',
            priority: 3,
            confidence: 0.95,
            content: `Outbound ${r.action_type} to ${r.target} did not verify within ${staleAfterMin} min`,
            correlation_id: r.id,
            metadata: { action_type: r.action_type, attempt_count: r.attempt_count },
          })
        }
      } catch (err) {
        logger.debug('actionVerification: observer signal write failed', { error: err.message })
      }
    }
    return rows.length
  } catch (err) {
    logger.warn('actionVerification.abandonStale failed', { error: err.message })
    return 0
  }
}

module.exports = {
  record,
  markDispatched,
  markVerified,
  markFailed,
  withVerification,
  abandonStale,
  canonicalPayloadHash,
}

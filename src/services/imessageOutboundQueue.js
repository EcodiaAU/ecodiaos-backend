'use strict'

/**
 * imessageOutboundQueue - internal helper for enqueueing outbound iMessages
 * to the SY094-side delivery watcher.
 *
 * Architecture (substrate replacing SSH+osascript path, 7 May 2026):
 *
 *   sendImessage() in skills/tate-msg/index.js
 *      ↓
 *   enqueue() inserts row into imessage_outbound_queue with status='queued'
 *      ↓
 *   SY094-side LaunchAgent (au.ecodia.imessage-outbound) polls
 *   POST /api/imessage/outbound/next every 5s (HMAC-signed, same secret
 *   as inbound)
 *      ↓
 *   /next atomically dequeues up to N=5 oldest queued rows, returns them
 *      ↓
 *   Watcher invokes local osascript on SY094 to send via Messages.app
 *      ↓
 *   Watcher POSTs /api/imessage/outbound/ack with {id, ok, error?}
 *      ↓
 *   /ack marks 'sent' on success or back to 'queued' (retry, attempts++)
 *   or permanently 'failed' after 3 attempts.
 *
 * Why a queue (not synchronous push from VPS): the never-ssh-on-mic
 * doctrine forbids sshpass+ssh+osascript; SY094 is not on Tailscale; the
 * watcher pull pattern is idempotent and mirrors the inbound substrate.
 *
 * Authored 7 May 2026 by fork_mousbxym_89ac2e during the iMessage outbound
 * migration off SSH.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const MAX_BODY_LEN = 4000 // Apple iMessage limit ~16k UTF-16; we cap conservatively
const MAX_HANDLE_LEN = 100
const MAX_ATTEMPTS = 3

/**
 * Enqueue an outbound iMessage for delivery by the SY094-side watcher.
 *
 * Returns:
 *   { ok: true, id: '<uuid>' }  on insert success
 *   { ok: false, error: '<class>' } on validation or DB failure
 *
 * Never throws - caller chooses fallback.
 */
async function enqueue({ to, body }) {
  const handle = String(to || '').trim().slice(0, MAX_HANDLE_LEN)
  const text = String(body || '').trim().slice(0, MAX_BODY_LEN)
  if (!handle) return { ok: false, error: 'empty_to' }
  if (!text) return { ok: false, error: 'empty_body' }

  try {
    const rows = await db`
      INSERT INTO imessage_outbound_queue (to_handle, body)
      VALUES (${handle}, ${text})
      RETURNING id
    `
    const id = rows?.[0]?.id
    if (!id) {
      return { ok: false, error: 'insert_no_id' }
    }
    logger.info('imessageOutboundQueue: enqueued', { id, to: handle, length: text.length })
    return { ok: true, id }
  } catch (err) {
    logger.error('imessageOutboundQueue: enqueue failed', { error: err.message })
    return { ok: false, error: 'db_error', detail: err.message }
  }
}

/**
 * Atomically dequeue up to `limit` oldest queued rows. Marks them
 * status='sending' inside the same statement so two concurrent watchers
 * (rare - we run one) cannot pick the same row.
 *
 * Returns array of { id, to_handle, body }. Empty array if queue empty.
 */
async function dequeue({ limit = 5 } = {}) {
  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || 5))
  try {
    const rows = await db`
      WITH next_rows AS (
        SELECT id FROM imessage_outbound_queue
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT ${n}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE imessage_outbound_queue q
      SET status = 'sending', updated_at = now()
      FROM next_rows
      WHERE q.id = next_rows.id
      RETURNING q.id, q.to_handle, q.body
    `
    return rows || []
  } catch (err) {
    logger.error('imessageOutboundQueue: dequeue failed', { error: err.message })
    return []
  }
}

/**
 * Acknowledge the result of a send attempt for one row.
 *
 * ok=true  → status='sent', sent_at=now()
 * ok=false → if attempts+1 < MAX_ATTEMPTS: status='queued' (retry),
 *            attempts incremented, last_error stored.
 *            Else status='failed', attempts incremented, last_error stored.
 *
 * Returns { ok: true, status: '<final_status>' } or
 *         { ok: false, error: '<class>' }
 */
async function ack({ id, ok, error }) {
  const rowId = String(id || '').trim()
  if (!rowId) return { ok: false, error: 'missing_id' }

  try {
    if (ok) {
      const rows = await db`
        UPDATE imessage_outbound_queue
        SET status = 'sent', sent_at = now(), updated_at = now()
        WHERE id = ${rowId}::uuid AND status = 'sending'
        RETURNING id, status
      `
      if (!rows || rows.length === 0) {
        return { ok: false, error: 'row_not_in_sending_state' }
      }
      return { ok: true, status: 'sent' }
    }

    // Failure path - retry up to MAX_ATTEMPTS, then mark failed.
    const errStr = String(error || '').slice(0, 500)
    const rows = await db`
      UPDATE imessage_outbound_queue
      SET
        attempts = attempts + 1,
        last_error = ${errStr},
        updated_at = now(),
        status = CASE
          WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed'
          ELSE 'queued'
        END
      WHERE id = ${rowId}::uuid AND status = 'sending'
      RETURNING id, status, attempts
    `
    if (!rows || rows.length === 0) {
      return { ok: false, error: 'row_not_in_sending_state' }
    }
    return { ok: true, status: rows[0].status, attempts: rows[0].attempts }
  } catch (err) {
    logger.error('imessageOutboundQueue: ack failed', { error: err.message, id: rowId })
    return { ok: false, error: 'db_error', detail: err.message }
  }
}

/**
 * Telemetry / health probe for the watcher heartbeat.
 *
 * Returns counts by status for the recent window.
 */
async function counts({ windowMinutes = 60 } = {}) {
  try {
    const rows = await db`
      SELECT status, COUNT(*)::int AS n
      FROM imessage_outbound_queue
      WHERE created_at > now() - (${windowMinutes} || ' minutes')::interval
      GROUP BY status
    `
    const out = { queued: 0, sending: 0, sent: 0, failed: 0 }
    for (const r of rows || []) out[r.status] = r.n
    return out
  } catch (err) {
    logger.error('imessageOutboundQueue: counts failed', { error: err.message })
    return null
  }
}

module.exports = {
  enqueue,
  dequeue,
  ack,
  counts,
  MAX_BODY_LEN,
  MAX_ATTEMPTS,
}

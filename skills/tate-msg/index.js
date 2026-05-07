'use strict'

/**
 * tate-msg - primary contact channel via iMessage on SY094 (MacInCloud).
 *
 * History:
 *   4 May 2026 - Authored by fork_moqyjzox_763fdb. Used sshpass+ssh+osascript
 *                from VPS to SY094 to drive Messages.app via the SSH path.
 *   7 May 2026 - Refactored by fork_mousbxym_89ac2e to retire the SSH path
 *                per ~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md.
 *                Outbound now writes to imessage_outbound_queue; SY094-side
 *                LaunchAgent (au.ecodia.imessage-outbound) polls
 *                /api/imessage/outbound/next every 5s and sends locally.
 *
 * sendImessage(body) returns { ok: true, sid: 'imsg-q-<uuid>' } on enqueue
 * success or { ok: false, error: '...' } on enqueue failure. The queue
 * row's eventual delivery state (sent / failed) is observable via
 * imessage_outbound_queue.status; sendImessage() returns once the row is
 * persisted, NOT once the watcher has delivered. Callers wanting a
 * delivery confirmation should poll the row by id, but most callers
 * (osAlertingService, scheduled prompts, etc.) only need "queued for
 * delivery" semantics, matching how SMS providers operate.
 *
 * healthCheck() probes kv_store.health.imessage_path which the
 * imessagePathHealthCheck cron (separate file) maintains. The cron probes
 * the SY094 watcher heartbeat + outbound delivery counters and writes
 * { ok, last_checked_at, detail } to that key every 6h.
 *
 * Twilio fallback: not in this module. osAlertingService chooses fallback.
 */

const queue = require('../../src/services/imessageOutboundQueue')
const db = require('../../src/config/db')
const logger = require('../../src/config/logger')

const TATE_BUDDY = '+61404247153'
const KV_HEALTH = 'health.imessage_path'

/**
 * Send an iMessage to Tate via the outbound queue. Returns:
 *   { ok: true,  sid: 'imsg-q-<uuid>' }   on enqueue success
 *   { ok: false, error: '<class>', detail?: string }  on enqueue failure
 *
 * Never throws. Caller decides fallback. Body is sent verbatim - the
 * caller is responsible for length / formatting.
 *
 * Optional opts:
 *   - to: override the destination handle (default TATE_BUDDY)
 */
async function sendImessage(body, opts) {
  const o = opts || {}
  const message = String(body || '').trim()
  if (!message) {
    return { ok: false, error: 'empty_body' }
  }
  const handle = o.to || TATE_BUDDY

  const result = await queue.enqueue({ to: handle, body: message })
  if (!result.ok) {
    logger.warn('tate-msg: iMessage enqueue failed', {
      error: result.error, detail: result.detail,
    })
    return { ok: false, error: result.error, detail: result.detail }
  }

  const sid = `imsg-q-${result.id}`
  logger.info('tate-msg: iMessage enqueued', { sid, length: message.length, queue_id: result.id })
  return { ok: true, sid }
}

/**
 * Health probe - reads kv_store.health.imessage_path which is
 * maintained by the imessagePathHealthCheck cron. The cron checks the
 * SY094 watcher heartbeat + outbound queue staleness.
 *
 * Returns:
 *   { ok: true,  detail: '...' }
 *   { ok: false, error: '<class>', detail?: string }
 *
 * If kv_store row missing (cron hasn't run yet, fresh boot), returns
 * { ok: false, error: 'health_unknown' } so callers fall back rather
 * than assuming healthy.
 */
async function healthCheck() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_HEALTH}`
    if (!rows || rows.length === 0) {
      return { ok: false, error: 'health_unknown', detail: 'no kv_store row yet' }
    }
    let v = rows[0].value
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { /* keep as string */ }
    }
    if (typeof v !== 'object' || v === null) {
      return { ok: false, error: 'health_malformed' }
    }
    if (v.ok === true) {
      return { ok: true, detail: v.detail || 'imessage path healthy' }
    }
    return {
      ok: false,
      error: v.error || 'imessage_path_unhealthy',
      detail: v.detail || JSON.stringify(v).slice(0, 200),
    }
  } catch (err) {
    return { ok: false, error: 'kv_query_failed', detail: err.message }
  }
}

/**
 * Test-only: no-op. Kept for ABI compatibility with prior SSH-cache reset.
 */
function _resetForTest() { /* no module-scope cache to reset */ }

module.exports = {
  sendImessage,
  healthCheck,
  _resetForTest,
  TATE_BUDDY,
}

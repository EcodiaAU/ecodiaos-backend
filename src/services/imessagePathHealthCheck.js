'use strict'

/**
 * imessagePathHealthCheck - backend canary for the iMessage primary path.
 *
 * History:
 *   4 May 2026 - Authored by fork_moqyjzox_763fdb. SSH-probed SY094 from
 *                VPS using sshpass+ssh+pgrep.
 *   7 May 2026 - Refactored by fork_mousbxym_89ac2e to retire SSH per
 *                ~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md.
 *                Probe now reads three substrate signals:
 *                  - kv_store.imessage.watcher.last_heartbeat (inbound
 *                    AppleScript watcher's heartbeat ping)
 *                  - kv_store.imessage.outbound_watcher.last_heartbeat
 *                    (outbound LaunchAgent's heartbeat ping)
 *                  - imessage_outbound_queue staleness (rows stuck in
 *                    'sending' >5min indicate watcher hung mid-deliver)
 *                Writes the composite verdict to kv_store.health.imessage_path
 *                which tate-msg.healthCheck() reads for callers.
 *
 * Crucially: this never actually messages Tate. It's a backend-only
 * health check that reads the kv_store rows the SY094-side watchers
 * write on every poll/event.
 *
 * Cron name (per Tate brief): 'imessage-path-health-check'.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const KV_KEY = 'health.imessage_path'
const KV_INBOUND_HEARTBEAT = 'imessage.watcher.last_heartbeat'
const KV_OUTBOUND_HEARTBEAT = 'imessage.outbound_watcher.last_heartbeat'
const STATUS_BOARD_ENTITY_REF = 'imessage_path_health_canary'
const PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6h
const DEGRADED_THRESHOLD_MS = 12 * 60 * 60 * 1000  // 12h

// A heartbeat older than this is considered stale (watcher is dead /
// SY094 unreachable / Apple Push delivery broken). 30min covers the 5s
// poll cadence with a generous skew for SY094 sleep / clock drift.
const HEARTBEAT_STALE_MS = 30 * 60 * 1000

// A row stuck in 'sending' longer than this means the watcher dequeued
// it but never ack'd - likely it crashed mid-osascript or the response
// path was severed.
const SENDING_STUCK_MS = 5 * 60 * 1000

let _intervalHandle = null
let _running = false

async function _readPriorHealth() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
    if (!rows.length) return null
    const v = rows[0].value
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch { return null }
    }
    if (typeof v === 'object') return v
    return null
  } catch (err) {
    logger.warn('imessagePathHealthCheck: prior health read failed', { error: err.message })
    return null
  }
}

async function _writeHealth(record) {
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${KV_KEY}, ${JSON.stringify(record)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('imessagePathHealthCheck: kv_store write failed', { error: err.message })
  }
}

async function _readHeartbeat(key) {
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${key}`
    if (!rows.length) return { present: false }
    let v = rows[0].value
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { /* keep */ }
    }
    const at = (v && v.at) ? Date.parse(v.at)
              : rows[0].updated_at ? new Date(rows[0].updated_at).getTime()
              : null
    return { present: true, at, version: v && v.watcher_version }
  } catch (err) {
    logger.warn('imessagePathHealthCheck: heartbeat read failed', { key, error: err.message })
    return { present: false, error: err.message }
  }
}

async function _stuckSendingCount() {
  try {
    const rows = await db`
      SELECT COUNT(*)::int AS n
      FROM imessage_outbound_queue
      WHERE status = 'sending'
        AND updated_at < now() - (${SENDING_STUCK_MS} || ' milliseconds')::interval
    `
    return rows?.[0]?.n || 0
  } catch (err) {
    logger.warn('imessagePathHealthCheck: stuck count failed', { error: err.message })
    return null
  }
}

/**
 * Compose a health record from the three substrate signals.
 *
 * Verdict logic:
 *   - inbound heartbeat fresh AND outbound heartbeat fresh AND no stuck
 *     rows → ok: true.
 *   - outbound heartbeat stale AND queue empty → may just be quiet; we
 *     still say degraded because we can't distinguish quiet from broken.
 *   - any heartbeat absent or stale → degraded.
 *   - stuck rows >0 → degraded.
 */
function _verdict({ inbound, outbound, stuck }) {
  const now = Date.now()
  const inboundFresh = inbound.present && inbound.at && (now - inbound.at) < HEARTBEAT_STALE_MS
  const outboundFresh = outbound.present && outbound.at && (now - outbound.at) < HEARTBEAT_STALE_MS

  if (inboundFresh && outboundFresh && (stuck === 0 || stuck === null)) {
    return {
      ok: true,
      detail: `inbound heartbeat ${Math.round((now - inbound.at) / 1000)}s ago, outbound heartbeat ${Math.round((now - outbound.at) / 1000)}s ago, no stuck rows`,
    }
  }

  const reasons = []
  if (!inbound.present) reasons.push('inbound watcher heartbeat absent')
  else if (!inboundFresh) reasons.push(`inbound heartbeat stale (${Math.round((now - inbound.at) / 60000)}min ago)`)

  if (!outbound.present) reasons.push('outbound watcher heartbeat absent')
  else if (!outboundFresh) reasons.push(`outbound heartbeat stale (${Math.round((now - outbound.at) / 60000)}min ago)`)

  if (stuck && stuck > 0) reasons.push(`${stuck} row(s) stuck in 'sending' >${Math.round(SENDING_STUCK_MS / 60000)}min`)

  return {
    ok: false,
    error: 'imessage_path_degraded',
    detail: reasons.join('; '),
  }
}

async function _raiseStatusBoardIfDegraded(currentRecord) {
  if (currentRecord.ok) {
    try {
      await db`
        UPDATE status_board
        SET archived_at = NOW(), last_touched = NOW()
        WHERE entity_ref = ${STATUS_BOARD_ENTITY_REF} AND archived_at IS NULL
      `
    } catch (err) {
      logger.warn('imessagePathHealthCheck: status_board archive failed', { error: err.message })
    }
    return
  }

  const firstFailureAt = currentRecord.first_failure_at
    ? new Date(currentRecord.first_failure_at).getTime()
    : Date.now()
  const ageMs = Date.now() - firstFailureAt
  if (ageMs < DEGRADED_THRESHOLD_MS) {
    logger.info('imessagePathHealthCheck: failure observed but under 12h threshold', {
      ageMs, error: currentRecord.error,
    })
    return
  }

  try {
    const ctx = JSON.stringify({
      first_failure_at: currentRecord.first_failure_at,
      last_check: currentRecord.checked_at,
      error: currentRecord.error,
      detail: currentRecord.detail,
      consecutive_failures: currentRecord.consecutive_failures,
      note: 'iMessage primary contact channel degraded >12h. Twilio fallback handling traffic. Probe SY094: RDP into SY094, check both LaunchAgents (au.ecodia.imessage-watcher + au.ecodia.imessage-outbound), Messages.app signed in as code@ecodia.au, network reachable.',
    })
    const existing = await db`
      SELECT id FROM status_board
      WHERE entity_ref = ${STATUS_BOARD_ENTITY_REF} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length) {
      await db`
        UPDATE status_board
        SET status = 'degraded', last_touched = NOW(), context = ${ctx}, priority = 2
        WHERE id = ${existing[0].id}
      `
    } else {
      await db`
        INSERT INTO status_board
          (entity_type, entity_ref, name, status, next_action, next_action_by, priority, context, last_touched)
        VALUES
          ('infrastructure', ${STATUS_BOARD_ENTITY_REF},
           'iMessage primary contact path degraded',
           'degraded',
           'Probe SY094 watchers - inbound + outbound LaunchAgents alive? Messages.app signed in?',
           'tate', 2, ${ctx}, NOW())
      `
    }
    logger.warn('imessagePathHealthCheck: degraded >12h, status_board raised', {
      error: currentRecord.error, ageMs,
    })
  } catch (err) {
    logger.warn('imessagePathHealthCheck: status_board raise failed', { error: err.message })
  }
}

async function probeOnce() {
  const prior = await _readPriorHealth()
  const [inbound, outbound, stuck] = await Promise.all([
    _readHeartbeat(KV_INBOUND_HEARTBEAT),
    _readHeartbeat(KV_OUTBOUND_HEARTBEAT),
    _stuckSendingCount(),
  ])
  const v = _verdict({ inbound, outbound, stuck })

  const now = new Date().toISOString()
  let firstFailureAt = null
  let consecutive = 0
  if (!v.ok) {
    firstFailureAt = prior && !prior.ok && prior.first_failure_at
      ? prior.first_failure_at
      : now
    consecutive = (prior && !prior.ok ? Number(prior.consecutive_failures || 0) : 0) + 1
  }

  const record = {
    checked_at: now,
    ok: !!v.ok,
    error: v.ok ? null : v.error,
    detail: v.ok ? v.detail : v.detail,
    first_failure_at: firstFailureAt,
    consecutive_failures: consecutive,
    signals: {
      inbound_heartbeat_present: !!inbound.present,
      outbound_heartbeat_present: !!outbound.present,
      stuck_sending: stuck,
    },
    cron: 'imessage-path-health-check',
  }
  await _writeHealth(record)
  await _raiseStatusBoardIfDegraded(record)
  return record
}

function start({ intervalMs } = {}) {
  if (_running) return
  const ms = intervalMs || PROBE_INTERVAL_MS
  _running = true
  setTimeout(() => {
    probeOnce().catch((err) =>
      logger.warn('imessagePathHealthCheck: initial probe threw', { error: err.message })
    )
  }, 90_000)
  _intervalHandle = setInterval(() => {
    probeOnce().catch((err) =>
      logger.warn('imessagePathHealthCheck: probe threw', { error: err.message })
    )
  }, ms)
  if (typeof _intervalHandle.unref === 'function') _intervalHandle.unref()
  logger.info('imessagePathHealthCheck: started', { intervalMs: ms, name: 'imessage-path-health-check' })
}

function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
  }
  _running = false
}

module.exports = {
  start,
  stop,
  probeOnce,
  _consts: { KV_KEY, KV_INBOUND_HEARTBEAT, KV_OUTBOUND_HEARTBEAT, STATUS_BOARD_ENTITY_REF, PROBE_INTERVAL_MS, DEGRADED_THRESHOLD_MS, HEARTBEAT_STALE_MS, SENDING_STUCK_MS },
}

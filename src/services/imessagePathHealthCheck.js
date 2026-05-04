'use strict'

/**
 * imessagePathHealthCheck — backend canary for the iMessage primary path.
 *
 * Pings the tate-msg skill's SSH-based health probe every 6h and writes
 * the result to kv_store.health.imessage_path. If the path has been
 * degraded (ok=false) for >12h, raises a status_board P2 row so the OS
 * knows the primary contact channel is down and Twilio is bearing all
 * traffic.
 *
 * Crucially: this never actually messages Tate. It's a backend-only
 * health check that runs:
 *   - SSH to SY094
 *   - pgrep -lf 'Messages.app' (verifies Messages.app is running)
 * Both must succeed for ok=true.
 *
 * Cron name (per Tate brief): 'imessage-path-health-check'.
 *
 * Authored: 4 May 2026 by fork_moqyjzox_763fdb.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const tateMsg = require('../../skills/tate-msg')

const KV_KEY = 'health.imessage_path'
const STATUS_BOARD_ENTITY_REF = 'imessage_path_health_canary'
const PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6h
const DEGRADED_THRESHOLD_MS = 12 * 60 * 60 * 1000  // 12h

let _intervalHandle = null
let _running = false

async function _readPriorHealth() {
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${KV_KEY}`
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

async function _raiseStatusBoardIfDegraded(currentRecord, prior) {
  if (currentRecord.ok) {
    // Path is healthy — archive any open canary row.
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

  // Path is degraded. Only raise if first_failure_at indicates >12h of
  // continuous failure. The first_failure_at is set at the first ok=false
  // and persists until ok=true clears it.
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

  // Upsert a P2 status_board row.
  try {
    const ctx = JSON.stringify({
      first_failure_at: currentRecord.first_failure_at,
      last_check: currentRecord.checked_at,
      error: currentRecord.error,
      detail: currentRecord.detail,
      consecutive_failures: currentRecord.consecutive_failures,
      note: 'iMessage primary contact channel degraded >12h. Twilio fallback handling traffic. Probe SY094: SSH reachable? Messages.app running? Apple ID code@ecodia.au signed in?',
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
           'Probe SY094 - SSH reachable? Messages.app running? code@ecodia.au signed in?',
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
  let result
  try {
    result = await tateMsg.healthCheck()
  } catch (err) {
    result = { ok: false, error: 'probe_threw', detail: err.message }
  }

  const now = new Date().toISOString()
  let firstFailureAt = null
  let consecutive = 0
  if (!result.ok) {
    firstFailureAt = prior && !prior.ok && prior.first_failure_at
      ? prior.first_failure_at
      : now
    consecutive = (prior && !prior.ok ? Number(prior.consecutive_failures || 0) : 0) + 1
  }

  const record = {
    checked_at: now,
    ok: !!result.ok,
    error: result.ok ? null : (result.error || 'unknown'),
    detail: result.ok ? null : (result.detail || null),
    first_failure_at: firstFailureAt,
    consecutive_failures: consecutive,
    cron: 'imessage-path-health-check',
  }
  await _writeHealth(record)
  await _raiseStatusBoardIfDegraded(record, prior)
  return record
}

function start({ intervalMs } = {}) {
  if (_running) return
  const ms = intervalMs || PROBE_INTERVAL_MS
  _running = true
  // First probe runs after a short delay so it doesn't compete with
  // boot. Subsequent probes every PROBE_INTERVAL_MS.
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
  // Test-only
  _consts: { KV_KEY, STATUS_BOARD_ENTITY_REF, PROBE_INTERVAL_MS, DEGRADED_THRESHOLD_MS },
}

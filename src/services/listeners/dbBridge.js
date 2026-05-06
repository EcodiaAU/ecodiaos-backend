'use strict'

/**
 * DB event bridge - dedicated LISTEN connection that fires pg_notify events
 * from the eos_listener_events channel into the in-process listener registry
 * via wsManager broadcast.
 *
 * Uses the postgres npm package (same as the rest of the codebase).
 * The library auto-reconnects the LISTEN connection internally on network drops.
 * Manual exponential-backoff reconnect applies only when the initial connect fails.
 *
 * NOTE: LISTEN/NOTIFY requires a direct database connection. If DATABASE_URL
 * points to a pgBouncer pooled connection in transaction mode, LISTEN will fail.
 * Use a direct connection URL for this bridge.
 *
 * Heartbeat (W3 audit fix #5, fork_mosn8o5x_7a0e54 worker C2):
 *   The LISTEN connection can silently die - postgres-lib auto-reconnect handles
 *   network drops, but a stale subscription where the underlying socket is alive
 *   but no NOTIFYs flow leaves us dark with no exception.
 *
 *   Self-emit a heartbeat NOTIFY every HEARTBEAT_INTERVAL_MS. The same connection
 *   receives the echo via _onNotification; we filter heartbeat-self events out
 *   of the listener fan-out and update _lastHeartbeatEcho. A separate watchdog
 *   timer checks every WATCHDOG_INTERVAL_MS - if echo is stale > HEARTBEAT_STALE_MS,
 *   declare subscription dead, publish perception event, force reconnect.
 *
 * Exports: start(), stop(), _heartbeatStatus()
 * Does NOT export a listener shape - this file is a bridge, not a listener.
 */

const postgres = require('postgres')
const logger = require('../../config/logger')
const env = require('../../config/env')

let _sql = null
let _stopped = false
let _reconnectDelay = 1000  // ms, doubles on each failure, capped at 30s
let _reconnectTimer = null

// Heartbeat state - module-level so start()/stop() and the watchdog can share.
let _heartbeatTimer = null
let _watchdogTimer = null
let _lastHeartbeatEcho = 0
const HEARTBEAT_INTERVAL_MS = 60_000      // self-emit cadence
const WATCHDOG_INTERVAL_MS = 30_000       // dead-detection check cadence
const HEARTBEAT_STALE_MS = 90_000         // > this without echo = dead subscription

// Lazy-require wsManager to avoid circular deps at module load time.
function _broadcast(type, payload) {
  try {
    const { broadcast } = require('../../websocket/wsManager')
    broadcast(type, payload)
  } catch (err) {
    logger.warn('dbBridge: wsManager broadcast failed', { error: err.message })
  }
}

// Lazy-require perceptionBus too - avoids load-order issues and lets tests
// stub via jest.mock without forcing a top-level require.
function _publishPerception(event) {
  try {
    const perceptionBus = require('../perceptionBus')
    if (perceptionBus && typeof perceptionBus.publish === 'function') {
      // fire-and-forget; perceptionBus.publish is async but we don't await
      perceptionBus.publish(event).catch((err) => {
        logger.debug('dbBridge: perceptionBus.publish rejected', { error: err.message })
      })
    }
  } catch (err) {
    logger.debug('dbBridge: perceptionBus require failed', { error: err.message })
  }
}

function _onNotification(raw) {
  try {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      logger.warn('dbBridge: bad notification JSON', {
        preview: (typeof raw === 'string' ? raw : String(raw)).slice(0, 200),
      })
      return
    }

    // Heartbeat self-echo - consume, update timestamp, do NOT forward to
    // listener subscribers. Match shape published by _emitHeartbeat below.
    if (parsed && parsed.heartbeat === true && parsed.source === 'dbbridge_self') {
      _lastHeartbeatEcho = Date.now()
      return
    }

    _broadcast('db:event', {
      data: {
        type: 'db:event',
        table: parsed.table,
        action: parsed.action,
        row: parsed.row,
        ts: parsed.ts,
      },
    })
  } catch (err) {
    logger.warn('dbBridge: notification dispatch failed', { error: err.message })
  }
}

// Emit a single heartbeat NOTIFY through the live LISTEN connection. The echo
// loops back through _onNotification on the same client, which updates
// _lastHeartbeatEcho. If the subscription is dead, the echo never arrives and
// the watchdog trips.
async function _emitHeartbeat() {
  if (_stopped || !_sql) return
  try {
    const payload = JSON.stringify({
      heartbeat: true,
      source: 'dbbridge_self',
      ts: Date.now(),
    }).replace(/'/g, "''")
    // postgres-lib `unsafe()` is the documented escape hatch for raw SQL - 
    // NOTIFY can't take parameter binding, must be inlined.
    await _sql.unsafe(`NOTIFY eos_listener_events, '${payload}'`)
  } catch (err) {
    logger.warn('dbBridge: heartbeat NOTIFY failed', { error: err.message })
  }
}

function _runWatchdog() {
  if (_stopped) return
  // Only check if we've ever recorded an echo - at boot, _lastHeartbeatEcho
  // is set in _connect on successful LISTEN. Pre-first-connect we skip.
  if (!_lastHeartbeatEcho) return
  const age = Date.now() - _lastHeartbeatEcho
  if (age > HEARTBEAT_STALE_MS) {
    const deadForS = Math.floor(age / 1000)
    logger.error('dbBridge: heartbeat stale, subscription dead, force-reconnecting', {
      ageMs: age,
      deadForS,
    })
    _publishPerception({
      source: 'infra',
      kind: 'dbbridge_subscription_dead',
      data: {
        last_seen_ms: _lastHeartbeatEcho,
        dead_for_s: deadForS,
      },
      confidence: 1,
    })
    // Reset echo timestamp BEFORE reconnect kicks off so we don't re-trip the
    // watchdog on the next tick while reconnect is in flight.
    _lastHeartbeatEcho = Date.now()
    _forceReconnect().catch((err) => {
      logger.warn('dbBridge: forceReconnect threw', { error: err.message })
    })
  }
}

function _startHeartbeat() {
  // Idempotent: clear any existing timers before starting new ones. start()
  // can be called multiple times legitimately (post force-reconnect, post
  // initial-connect-retry); never double-stack the timers.
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer)
    _heartbeatTimer = null
  }
  if (_watchdogTimer) {
    clearInterval(_watchdogTimer)
    _watchdogTimer = null
  }

  _heartbeatTimer = setInterval(() => {
    _emitHeartbeat().catch((err) => {
      logger.debug('dbBridge: heartbeat emit threw', { error: err.message })
    })
  }, HEARTBEAT_INTERVAL_MS)
  if (_heartbeatTimer.unref) _heartbeatTimer.unref()

  _watchdogTimer = setInterval(_runWatchdog, WATCHDOG_INTERVAL_MS)
  if (_watchdogTimer.unref) _watchdogTimer.unref()
}

function _stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer)
    _heartbeatTimer = null
  }
  if (_watchdogTimer) {
    clearInterval(_watchdogTimer)
    _watchdogTimer = null
  }
}

async function _forceReconnect() {
  if (_stopped) return
  if (_sql) {
    try { await _sql.end({ timeout: 3 }) } catch {}
    _sql = null
  }
  // Reset reconnect-backoff so a force-reconnect from a dead subscription
  // doesn't inherit a long delay from a prior failure.
  _reconnectDelay = 1000
  _scheduleReconnect()
}

async function _connect() {
  if (_stopped) return

  // Clean up any prior connection before creating a new one.
  if (_sql) {
    try { await _sql.end({ timeout: 3 }) } catch {}
    _sql = null
  }

  try {
    _sql = postgres(env.DATABASE_URL, {
      max: 1,
      idle_timeout: 0,    // never close idle - LISTEN connection must stay alive
      connect_timeout: 10,
      onnotice: () => {},
    })

    // postgres v3: listen(channel, onmessage, onlistening) -> Promise<unlisten_fn>
    // The library keeps the connection alive and re-runs LISTEN on reconnect.
    await _sql.listen('eos_listener_events', _onNotification, () => {
      _reconnectDelay = 1000  // reset backoff on successful connect
      // Reset heartbeat echo on connect - fresh window. Without this, a stale
      // _lastHeartbeatEcho from a dead prior subscription could either trip the
      // watchdog instantly post-reconnect, or (if 0) never trip after this
      // first connect since we skip-when-zero in _runWatchdog.
      _lastHeartbeatEcho = Date.now()
      logger.info('dbBridge: LISTEN established on eos_listener_events')
    })
    // If we reach here, the initial LISTEN handshake completed successfully.
    // Subsequent reconnects are handled by the postgres library internally.
    _startHeartbeat()
  } catch (err) {
    if (_stopped) return
    logger.warn('dbBridge: LISTEN connect failed', {
      error: err.message,
      nextRetryMs: _reconnectDelay,
    })
    _scheduleReconnect()
  }
}

function _scheduleReconnect() {
  if (_stopped || _reconnectTimer) return
  const delay = _reconnectDelay
  _reconnectDelay = Math.min(_reconnectDelay * 2, 30_000)
  logger.info('dbBridge: scheduling reconnect', { delayMs: delay })
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null
    if (_stopped) return
    await _connect()
  }, delay)
}

/**
 * Start the LISTEN connection. Resolves when LISTEN is confirmed, or after
 * a 5s timeout (with a warn) so a slow DB never blocks server boot.
 */
async function start() {
  _stopped = false
  _reconnectDelay = 1000

  return new Promise((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const timeoutId = setTimeout(() => {
      logger.warn('dbBridge: LISTEN not confirmed within 5s - server will continue without db bridge')
      settle()
    }, 5000)

    _connect().then(() => {
      clearTimeout(timeoutId)
      settle()
    }).catch((err) => {
      clearTimeout(timeoutId)
      logger.warn('dbBridge: initial connect threw', { error: err.message })
      settle()
    })
  })
}

/**
 * Stop the LISTEN connection cleanly.
 */
async function stop() {
  _stopped = true
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  _stopHeartbeat()
  if (_sql) {
    try { await _sql.end({ timeout: 5 }) } catch {}
    _sql = null
  }
}

/**
 * Heartbeat status snapshot for /api/observability/listener-stats.
 */
function _heartbeatStatus() {
  return {
    last_echo_ms_ago: _lastHeartbeatEcho ? Date.now() - _lastHeartbeatEcho : null,
    healthy: _lastHeartbeatEcho > 0 && (Date.now() - _lastHeartbeatEcho) < HEARTBEAT_STALE_MS,
    interval_ms: HEARTBEAT_INTERVAL_MS,
    stale_threshold_ms: HEARTBEAT_STALE_MS,
  }
}

module.exports = {
  start,
  stop,
  _heartbeatStatus,
  // Test-only exports - the test file pokes these to simulate dead subscriptions
  // without standing up a real Postgres listener. Kept under a `__test` namespace
  // to discourage casual use.
  __test: {
    onNotification: _onNotification,
    runWatchdog: _runWatchdog,
    startHeartbeat: _startHeartbeat,
    stopHeartbeat: _stopHeartbeat,
    forceReconnect: _forceReconnect,
    publishPerception: _publishPerception,
    setLastHeartbeatEcho: (v) => { _lastHeartbeatEcho = v },
    getLastHeartbeatEcho: () => _lastHeartbeatEcho,
    setStopped: (v) => { _stopped = v },
    getTimers: () => ({
      heartbeatTimer: _heartbeatTimer,
      watchdogTimer: _watchdogTimer,
    }),
    constants: {
      HEARTBEAT_INTERVAL_MS,
      WATCHDOG_INTERVAL_MS,
      HEARTBEAT_STALE_MS,
    },
  },
}

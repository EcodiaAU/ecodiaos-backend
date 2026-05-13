'use strict'

/**
 * wsBridgeForward — conductor → api WS fan-out.
 *
 * In CONDUCTOR_DETACHED=true mode the SDK stream + osSessionService +
 * forkService all live in ecodia-conductor (pid != api). They call
 * wsManager.broadcast(), but the conductor process has NO connected WS
 * clients — the frontend's WebSocket is attached to ecodia-api. Without
 * a bridge, every text_delta / status / fork event broadcast in conductor
 * goes into the void and the FE shows "stream interrupted" while the
 * conductor is happily writing replies to cc_session_logs.
 *
 * Origin: 13 May 2026. Phase 3 (CONDUCTOR_OWNS_WORKERS=true) shipped the
 * read-side proxy for /forks (ebde29b) but never the write-side fan-out
 * for streaming WS events. This is the missing half.
 *
 * Wire: conductor calls forwardBroadcast(envelope) → POST to
 * http://127.0.0.1:${API_INTERNAL_PORT||3001}/internal/ws-broadcast with
 * bearer-auth using CONDUCTOR_LOOPBACK_SECRET (reused — both processes
 * already have it). api re-broadcasts to its local WS clients via
 * wsManager._deliverForwardedEnvelope().
 *
 * Failure mode: bridge call is fire-and-forget. If it fails, the conductor
 * keeps streaming (DB writes still happen). The FE simply sees a gap and
 * can recover via /api/os-session/recover?since_seq=N. We log warns but
 * never throw — broadcasts must never fail the turn.
 */

const logger = require('../config/logger')

const API_PORT = process.env.PORT || '3001'
const API_HOST = process.env.API_INTERNAL_HOST || '127.0.0.1'
const FORWARD_URL = `http://${API_HOST}:${API_PORT}/internal/ws-broadcast`
const FORWARD_TIMEOUT_MS = 2000

let _secretCache = null
let _secretLoadFailedOnce = false

async function _getSecret() {
  if (_secretCache) return _secretCache
  if (process.env.CONDUCTOR_LOOPBACK_SECRET) {
    _secretCache = process.env.CONDUCTOR_LOOPBACK_SECRET
    return _secretCache
  }
  try {
    const db = require('../config/db')
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.conductor_loopback_secret'`
    if (!rows.length) return null
    const raw = rows[0].value
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    _secretCache = typeof parsed === 'string' ? parsed : parsed?.value
    return _secretCache
  } catch (err) {
    if (!_secretLoadFailedOnce) {
      logger.warn('wsBridgeForward: secret load failed (first time)', { error: err.message })
      _secretLoadFailedOnce = true
    }
    return null
  }
}

// Drop counters for the watchdog log. Reset every minute to avoid log spam.
let _dropsSinceLastLog = 0
let _lastDropLogAt = 0

function _maybeLogDrops(reason) {
  _dropsSinceLastLog++
  const now = Date.now()
  if (now - _lastDropLogAt > 60_000) {
    logger.warn('wsBridgeForward: dropped broadcasts (forward failed)', {
      drops: _dropsSinceLastLog,
      reason,
      window_ms: now - _lastDropLogAt || 60_000,
    })
    _dropsSinceLastLog = 0
    _lastDropLogAt = now
  }
}

async function forwardBroadcast(envelope) {
  let secret
  try {
    secret = await _getSecret()
  } catch {
    _maybeLogDrops('secret_load_threw')
    return
  }
  if (!secret) {
    _maybeLogDrops('secret_missing')
    return
  }

  try {
    const resp = await fetch(FORWARD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ envelope }),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    })
    if (!resp.ok) {
      _maybeLogDrops(`http_${resp.status}`)
    }
  } catch (err) {
    _maybeLogDrops(err?.name === 'AbortError' ? 'timeout' : err?.code || 'fetch_failed')
  }
}

module.exports = { forwardBroadcast }

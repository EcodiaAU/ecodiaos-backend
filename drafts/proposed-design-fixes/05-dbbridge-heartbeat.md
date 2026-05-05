# Fix 05 — dbBridge synthetic-NOTIFY heartbeat

**Origin:** fork_moslimsp_a72e73 listener audit §3.6
**Leverage:** MEDIUM
**Files:** `src/services/listeners/dbBridge.js`, optional new pg trigger.

## Problem
The LISTEN connection is a single point of failure. postgres v3 lib auto-reconnects on drop, but during the gap any pg_notify fires are LOST (Postgres doesn't buffer NOTIFY across reconnect). Today we have no visibility into "is LISTEN currently live?" beyond an initial-connect log line.

## Solution
1. Every 30s, the bridge fires a `NOTIFY eos_listener_events, '{"table":"_heartbeat","action":"PING","row":{"ts":<ts>}}'` from the same client.
2. The `_onNotification` handler recognises `table === '_heartbeat'`, swallows it (does not broadcast), and updates an in-memory `_lastHeartbeatEcho` timestamp.
3. A separate 60s timer checks: if `Date.now() - _lastHeartbeatEcho > 90s`, log warn + force a reconnect.

## Patch (dbBridge.js)

Add module-level state:

```diff
 let _sql = null
 let _stopped = false
 let _reconnectDelay = 1000  // ms, doubles on each failure, capped at 30s
 let _reconnectTimer = null
+let _heartbeatTimer = null
+let _heartbeatCheckTimer = null
+let _lastHeartbeatEcho = 0
+const HEARTBEAT_INTERVAL_MS = 30_000
+const HEARTBEAT_STALE_MS = 90_000
```

Update `_onNotification` to recognise heartbeats:

```diff
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

+    // Heartbeat self-echo — swallow, update timestamp
+    if (parsed.table === '_heartbeat' && parsed.action === 'PING') {
+      _lastHeartbeatEcho = Date.now()
+      return
+    }
+
     _broadcast('db:event', {
```

Add heartbeat fire-loop:

```diff
 async function _connect() {
   ...
     await _sql.listen('eos_listener_events', _onNotification, () => {
       _reconnectDelay = 1000  // reset backoff on successful connect
+      _lastHeartbeatEcho = Date.now() // Reset on connect — fresh window
       logger.info('dbBridge: LISTEN established on eos_listener_events')
     })
+    _startHeartbeat()
   } catch (err) {
```

```javascript
function _startHeartbeat() {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer)
  if (_heartbeatCheckTimer) clearInterval(_heartbeatCheckTimer)

  _heartbeatTimer = setInterval(async () => {
    if (_stopped || !_sql) return
    try {
      await _sql.unsafe(`NOTIFY eos_listener_events, '${JSON.stringify({
        table: '_heartbeat',
        action: 'PING',
        row: { ts: Date.now() },
      }).replace(/'/g, "''")}'`)
    } catch (err) {
      logger.warn('dbBridge: heartbeat NOTIFY failed', { error: err.message })
    }
  }, HEARTBEAT_INTERVAL_MS)
  if (_heartbeatTimer.unref) _heartbeatTimer.unref()

  _heartbeatCheckTimer = setInterval(() => {
    if (_stopped) return
    const age = Date.now() - _lastHeartbeatEcho
    if (age > HEARTBEAT_STALE_MS) {
      logger.warn('dbBridge: heartbeat echo stale, forcing reconnect', { ageMs: age })
      _forceReconnect()
    }
  }, HEARTBEAT_INTERVAL_MS)
  if (_heartbeatCheckTimer.unref) _heartbeatCheckTimer.unref()
}

async function _forceReconnect() {
  if (_stopped) return
  if (_sql) {
    try { await _sql.end({ timeout: 3 }) } catch {}
    _sql = null
  }
  _scheduleReconnect()
}
```

Update `stop()`:

```diff
 async function stop() {
   _stopped = true
   if (_reconnectTimer) {
     clearTimeout(_reconnectTimer)
     _reconnectTimer = null
   }
+  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null }
+  if (_heartbeatCheckTimer) { clearInterval(_heartbeatCheckTimer); _heartbeatCheckTimer = null }
   if (_sql) {
     try { await _sql.end({ timeout: 5 }) } catch {}
     _sql = null
   }
 }
```

Export status getter:

```diff
-module.exports = { start, stop }
+module.exports = {
+  start,
+  stop,
+  // For /api/observability/listener-stats
+  _heartbeatStatus: () => ({
+    last_echo_ms_ago: _lastHeartbeatEcho ? Date.now() - _lastHeartbeatEcho : null,
+    healthy: _lastHeartbeatEcho > 0 && (Date.now() - _lastHeartbeatEcho) < HEARTBEAT_STALE_MS,
+  }),
+}
```

## Caveats
- `unsafe()` is the postgres-lib way to emit NOTIFY (which can't take parameter binding). Single-quote escape via `.replace(/'/g, "''")` is the standard PG escape.
- 30s heartbeat × 24h = 2880 extra NOTIFY/day. Negligible (Postgres handles millions/sec).
- Heartbeat DOES use the same connection as production NOTIFYs, so a write-side queue stall would also stall heartbeat — exactly what we want.

## Verification
1. `curl /api/observability/listener-stats | jq .listener.dbbridge_heartbeat` returns `{healthy: true, last_echo_ms_ago: <under 30000>}`.
2. Force a network drop on Postgres (block port 5432 for 60s): `last_echo_ms_ago` grows past 90s, logger.warn fires, reconnect happens, stat returns to healthy.

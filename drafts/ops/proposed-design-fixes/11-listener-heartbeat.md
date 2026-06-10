# Fix 11 — Listener heartbeat → status_board

**Origin:** fork_moslimsp_a72e73 listener audit, design Q4
**Leverage:** HIGH (turns "wired but dark" from forensic to query-based)
**Files:**
- NEW `src/services/listenerHeartbeat.js`
- `src/services/listeners/registry.js` (heartbeat hook)
- Each listener (one-line `_heartbeat()` call in handle, optional)

## Problem
"Wired but dark" is the dominant failure mode (see CLAUDE.md Mar 30 boot-stderr fix story). Today: a listener registered but never firing is detectable only by log-grep. We want a status_board row that says "listener X has been silent N hours" surfaced by the existing 24h drift threshold.

## Design

Each listener emits a heartbeat to perceptionBus on every successful handle. listenerHeartbeat aggregates across all listeners and writes/updates a single status_board row PER LISTENER:

```
name = 'auto: listener_health/<name>'
entity_type = 'infrastructure'
priority = 3 (drift watcher upgrades to 1 when stale)
next_action = 'Listener silent — investigate'
next_action_by = 'ecodiaos'
last_touched = NOW() (updated on each heartbeat)
```

statusBoardDrift's existing logic (priority<=2, last_touched < NOW() - 24h) wakes on a stale heartbeat row when the drift watcher promotes it to priority 2. Even at priority 3 (default), a daily orientation query catches it.

## NEW src/services/listenerHeartbeat.js

```javascript
'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

const HEARTBEAT_FLUSH_INTERVAL_MS = 60_000  // batch DB writes, 1 row per listener per minute

const _seen = new Map()  // listener name → { count, lastTs }
let _flushTimer = null

function record(listenerName) {
  const entry = _seen.get(listenerName) || { count: 0, lastTs: 0 }
  entry.count++
  entry.lastTs = Date.now()
  _seen.set(listenerName, entry)
}

async function _flush() {
  if (_seen.size === 0) return
  const snapshot = Array.from(_seen.entries())
  _seen.clear()

  for (const [name, entry] of snapshot) {
    try {
      const rowName = `auto: listener_health/${name}`
      // UPSERT: insert if absent, else bump last_touched. Keep priority=3 unless
      // statusBoardDrift has already escalated it.
      await db`
        INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context, last_touched)
        VALUES (${rowName}, 'infrastructure', 'healthy', 3,
                'Auto-heartbeat row. Drifts to attention if listener stops firing.',
                'ecodiaos', 'listenerHeartbeat',
                ${JSON.stringify({ listener: name, last_count: entry.count })}, NOW())
        ON CONFLICT (name) DO UPDATE
          SET last_touched = NOW(),
              status = 'healthy',
              context = ${JSON.stringify({ listener: name, last_count: entry.count })}
      `
    } catch (err) {
      logger.warn('listenerHeartbeat: flush failed', { name, error: err.message })
    }
  }
}

function start() {
  if (_flushTimer) return
  _flushTimer = setInterval(() => _flush().catch(() => {}), HEARTBEAT_FLUSH_INTERVAL_MS)
  if (_flushTimer.unref) _flushTimer.unref()
  logger.info('listenerHeartbeat: started')
}

function stop() {
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null }
}

module.exports = { record, start, stop, _flush }
```

## Integration in registry.js

After the successful handler call in `dispatch()`:

```diff
     _inFlight.set(listener.name, true)
     try {
       await listener.handle(event, ctx)
+      try { require('../listenerHeartbeat').record(listener.name) } catch {}
       // Drain queue ...
```

## Boot integration

Add to `src/services/listeners/index.js` `startListenerSubsystem()`:

```diff
   try {
     await require('./dbBridge').start()
+    require('../listenerHeartbeat').start()
     logger.info(...)
```

## ON CONFLICT requirement

`status_board.name` should already be UNIQUE (or we add it via migration). If not:

```sql
-- migration if missing
CREATE UNIQUE INDEX IF NOT EXISTS uniq_status_board_name_active
  ON status_board (name)
  WHERE archived_at IS NULL;
```

(NOT a strict UNIQUE on `name` because archived rows can recur; partial-unique on active rows.)

## Trade-offs
- Cost: 1 UPSERT/listener/minute (8 listeners × 60 = 480/hr at high traffic). Negligible.
- Surfaces only "fired in the last minute" — silence detection at 24h+ via existing drift watcher.
- Listeners that never fire (e.g. `_smoke.js` always-false relevanceFilter) NEVER hit handle, so heartbeat row never created. Acceptable — those aren't health-relevant.
- Better: also call record() from relevanceFilter PASSES, even if handle gates out. Today filter+handle are coupled tightly enough that this is a follow-up refactor.

## Verification
- 5 minutes after PM2 restart: `SELECT name, last_touched FROM status_board WHERE name LIKE 'auto: listener_health/%'` returns one row per active listener with recent last_touched.
- 24h of one listener silent: drift watcher fires on it; conductor's morning orientation surfaces it.

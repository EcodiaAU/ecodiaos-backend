# Fix 04 — Listener stats endpoint + per-matcher fire counters

**Origin:** fork_moslimsp_a72e73 listener audit §3.5, design Q4
**Leverage:** MEDIUM
**Files:**
- `src/services/perceptionDispatcher.js`
- `src/services/listeners/registry.js` (uses Fix 03 counters)
- NEW: `src/routes/observability.js`
- `src/server.js` (route mount)

## Problem
Conductor cannot answer "how many times did the error_escalation matcher fire in the last hour?" without grepping logs. No matcher-level fire counters. No listener drop counters. Drift detection is forensic, not query-based.

## Patch — perceptionDispatcher.js (counters)

Add at top of MATCHERS scope:

```diff
 const _recentDispatches = new Map() // key → timestamp
+const _stats = {
+  matcher_fires: new Map(),       // domain → count of dispatch() calls
+  matcher_test_passes: new Map(), // domain → count of test() === true (before dedupe)
+  matcher_dedupes: new Map(),     // domain → count of dedupe-suppressed
+  matcher_errors: new Map(),      // domain → count of test/dispatch throws
+  bus_events_in: 0,                // total _onEvent calls
+}
+function _bump(map, key) { map.set(key, (map.get(key) || 0) + 1) }
```

Update `_onEvent`:

```diff
 function _onEvent(event) {
+  _stats.bus_events_in++
   for (const matcher of MATCHERS) {
     try {
       if (!matcher.test(event)) continue
+      _bump(_stats.matcher_test_passes, matcher.domain)
       const dedupeKey = `${matcher.domain}:${event.source}:${event.kind}`
-      if (!_shouldDispatch(dedupeKey)) continue
+      if (!_shouldDispatch(dedupeKey)) {
+        _bump(_stats.matcher_dedupes, matcher.domain)
+        continue
+      }
+      _bump(_stats.matcher_fires, matcher.domain)
       // Fire-and-forget — never block the publishing stream
       matcher.dispatch(event).catch(err => {
+        _bump(_stats.matcher_errors, matcher.domain)
-        logger.debug('perceptionDispatcher: async dispatch error', {
+        logger.warn('perceptionDispatcher: async dispatch error', {
           domain: matcher.domain, error: err.message,
         })
       })
     } catch (err) {
+      _bump(_stats.matcher_errors, matcher.domain)
-      logger.debug('perceptionDispatcher: matcher error', {
+      logger.warn('perceptionDispatcher: matcher error', {
         domain: matcher.domain, error: err.message,
       })
     }
   }
 }
```

Export `_stats`:

```diff
 module.exports = {
   start,
   MATCHERS,
   _onEvent,
   _shouldDispatch,
   _recentDispatches,
+  _stats,
 }
```

## NEW: src/routes/observability.js

```javascript
'use strict'

const express = require('express')
const router = express.Router()
const dispatcher = require('../services/perceptionDispatcher')
const registry = require('../services/listeners/registry')
const db = require('../config/db')

function mapToObj(m) {
  const o = {}
  for (const [k, v] of m) o[k] = v
  return o
}

router.get('/listener-stats', async (req, res) => {
  try {
    // Dispatcher matcher stats (in-mem, since process boot)
    const matcher = {
      bus_events_in: dispatcher._stats.bus_events_in,
      fires: mapToObj(dispatcher._stats.matcher_fires),
      test_passes: mapToObj(dispatcher._stats.matcher_test_passes),
      dedupes: mapToObj(dispatcher._stats.matcher_dedupes),
      errors: mapToObj(dispatcher._stats.matcher_errors),
    }

    // Registry listener stats (Fix 03 wiring)
    const listener = {
      drops: mapToObj(registry._drops || new Map()),
      in_flight: mapToObj(registry._inFlight || new Map()),
      queue_depth: {},
    }
    for (const [name, q] of (registry._pending || new Map())) {
      listener.queue_depth[name] = (q || []).length
    }

    // Last-hour event volume from durable os_observations
    const rows = await db`
      SELECT source, kind, count(*)::int as n
      FROM os_observations
      WHERE observed_at > NOW() - INTERVAL '1 hour'
      GROUP BY 1, 2
      ORDER BY n DESC
      LIMIT 50
    `
    const event_volume_1h = rows.map(r => ({ source: r.source, kind: r.kind, count: r.n }))

    res.json({
      ok: true,
      matcher,
      listener,
      event_volume_1h,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
```

## server.js wiring

```diff
+app.use('/api/observability', require('./routes/observability'))
```

## Verification

```bash
curl -s http://localhost:3001/api/observability/listener-stats | jq
```

Expected shape:
```json
{
  "ok": true,
  "matcher": {
    "bus_events_in": 1234,
    "fires": { "finance": 12, "error_escalation": 3, ... },
    "test_passes": { "finance": 30, ... },
    "dedupes": { "finance": 18, ... },
    "errors": {}
  },
  "listener": {
    "drops": { "forkComplete": 0 },
    "queue_depth": { "forkComplete": 0 }
  },
  "event_volume_1h": [
    { "source": "fork", "kind": "fork_complete", "count": 47 },
    ...
  ]
}
```

Conductor can hit this in BP4 to detect: matcher silent for 1h+, queue persistently >5 (handler too slow), drops > 0 (capacity issue).

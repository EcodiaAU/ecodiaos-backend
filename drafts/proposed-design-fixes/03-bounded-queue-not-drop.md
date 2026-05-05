# Fix 03 — Bounded queue instead of drop-on-inflight

**Origin:** fork_moslimsp_a72e73 listener audit §3.3
**Leverage:** MEDIUM
**Files:** `src/services/listeners/registry.js`

## Problem
`registry.dispatch()` lines 165-168: when a listener's handler is in-flight, the new event is silently dropped (logged at info, no counter, no surface to BP4).

For burst scenarios (5 forks finish within a 5s axios wake window), only the first event is processed; 4 are dropped. The drops are invisible to the conductor.

## Patch (registry.js)

Replace the in-flight Map with a per-listener bounded queue:

```diff
 let _listeners = []
-const _inFlight = new Map() // listener name -> boolean
+const _inFlight = new Map()    // listener name -> boolean (currently processing)
+const _pending = new Map()     // listener name -> [event...] (queued)
+const _drops = new Map()       // listener name -> drop count (counter for /api/observability/listener-stats)
+const QUEUE_LIMIT = 10         // per-listener; bigger = more memory, smaller = more drops on burst
```

Replace the dispatch concurrency-cap block (around line 164-182):

```diff
-    // Concurrency cap — drop if handler already in-flight
-    if (_inFlight.get(listener.name)) {
-      logger.info(`listener ${listener.name}: dropping event (concurrency cap, handler in-flight)`, { type: event.type })
-      continue
-    }
-
-    const sourceEventId = event.ws_seq != null
-      ? String(event.ws_seq)
-      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
-    const ctx = { sourceEventId }
-
-    _inFlight.set(listener.name, true)
-    try {
-      await listener.handle(event, ctx)
-    } catch (err) {
-      logger.warn(`listener ${listener.name}: handler threw`, { error: err.message })
-    } finally {
-      _inFlight.delete(listener.name)
-    }
+    // Concurrency cap with bounded queue: handler-in-flight events queue
+    // (FIFO, capped at QUEUE_LIMIT). Drops counted in _drops. Counter
+    // exposed at /api/observability/listener-stats (see Fix 04).
+    const sourceEventId = event.ws_seq != null
+      ? String(event.ws_seq)
+      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
+    const ctx = { sourceEventId }
+
+    if (_inFlight.get(listener.name)) {
+      const q = _pending.get(listener.name) || []
+      if (q.length >= QUEUE_LIMIT) {
+        _drops.set(listener.name, (_drops.get(listener.name) || 0) + 1)
+        logger.warn(`listener ${listener.name}: queue full, dropping event`, {
+          type: event.type, queueLen: q.length, totalDrops: _drops.get(listener.name),
+        })
+        continue
+      }
+      q.push({ event, ctx })
+      _pending.set(listener.name, q)
+      continue
+    }
+
+    _inFlight.set(listener.name, true)
+    try {
+      await listener.handle(event, ctx)
+      // Drain queue (one event at a time, preserves order)
+      while (true) {
+        const q = _pending.get(listener.name)
+        if (!q || q.length === 0) break
+        const { event: nextEvent, ctx: nextCtx } = q.shift()
+        try { await listener.handle(nextEvent, nextCtx) }
+        catch (err) { logger.warn(`listener ${listener.name}: queued handler threw`, { error: err.message }) }
+      }
+    } catch (err) {
+      logger.warn(`listener ${listener.name}: handler threw`, { error: err.message })
+    } finally {
+      _inFlight.delete(listener.name)
+    }
```

Add to module.exports:
```diff
 module.exports = {
   loadListeners,
   registerAll,
   dispatch,
   getListeners,
+  // Telemetry for observability endpoint
+  _drops,
+  _pending,
+  _inFlight,
   EXPECTED_LOADED_COUNT,
   LISTENER_FILES,
 }
```

## Trade-offs
- Memory cost: 8 listeners × 10 events × ~1KB envelope = ~80KB worst case. Negligible.
- Ordering: preserved per-listener (FIFO drain).
- Backpressure: drops still happen at QUEUE_LIMIT, but visibly counted.
- Choosing 10: empirically 5 fork-burst observed in the wild; 10 = 2× headroom.

## Verification
After patch, simulate burst: dispatch 15 db:event envelopes targeting same listener back-to-back. Expect:
- 1 in-flight + 10 queued + 4 dropped + drops counter = 4 for that listener.
- All 11 (1+10) eventually processed.

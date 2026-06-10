# Fix 06 — Prioritised perceptionBus subscribers

**Origin:** fork_moslimsp_a72e73 listener audit §3.7
**Leverage:** LOW (deferred until 2+ subscribers)
**Files:** `src/services/perceptionBus.js`

## Problem
Today only `perceptionDispatcher` subscribes; ordering doesn't matter. When N subscribers exist, `_subscribers.push(fn)` orders by registration time. A slow subscriber blocks fast ones.

## Patch (small, optional)

```diff
-const _subscribers = []
+const _subscribers = []  // [{ fn, priority }] — sorted ascending by priority

-function subscribe(fn) {
-  if (typeof fn === 'function') _subscribers.push(fn)
+function subscribe(fn, opts = {}) {
+  if (typeof fn !== 'function') return () => {}
+  const priority = typeof opts.priority === 'number' ? opts.priority : 100
+  const entry = { fn, priority }
+  _subscribers.push(entry)
+  _subscribers.sort((a, b) => a.priority - b.priority)
+  return function unsubscribe() {
+    const idx = _subscribers.indexOf(entry)
+    if (idx >= 0) _subscribers.splice(idx, 1)
+  }
 }
```

Update fan-out:

```diff
   for (const fn of _subscribers) {
-    try { fn(event) } catch (err) {
+    try { fn.fn(event) } catch (err) {
       logger.debug('perceptionBus: subscriber threw', { error: err.message })
     }
   }
```

## Use cases
- Security-tier subscriber: priority=10 (runs first, can short-circuit emergency mode)
- Default dispatcher: priority=100
- Telemetry / KG promotion: priority=200 (last)

## Why LOW leverage
Today the bus has 1 subscriber. The change is a 5-line refactor that survives until needed. Drop into Fix 04 (observability) era when the dispatcher itself is split into multiple subscribers, or ship as readiness-for-future work.

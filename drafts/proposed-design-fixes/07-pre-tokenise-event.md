# Fix 07 — Pre-tokenise event once per dispatch loop

**Origin:** fork_moslimsp_a72e73 listener audit §3.8
**Leverage:** LOW today, MEDIUM under volume
**Files:** `src/services/perceptionDispatcher.js`

## Problem
Four matchers (`finance`, `status_board`, `crm`, `security_incident`) each independently call `JSON.stringify(event.data || {}).toLowerCase()` inside their `test()`. Today: 4× per event. At 10-50 events/min the cost is invisible. At 1000/min it's measurable.

## Patch

In `_onEvent`, pre-build common tokens once:

```diff
 function _onEvent(event) {
+  // Pre-tokenise once: 4 of 6 matchers re-stringify event.data; pre-build
+  // here and let matchers read from the event closure. ~4× fewer
+  // stringify calls per event.
+  event._lc_kind = (event.kind || '').toLowerCase()
+  event._lc_source = (event.source || '').toLowerCase()
+  try { event._lc_data_str = JSON.stringify(event.data || {}).toLowerCase() }
+  catch { event._lc_data_str = '' }
+
   _stats.bus_events_in++
   for (const matcher of MATCHERS) {
```

Update each affected matcher's `test()` to use `event._lc_kind` / `event._lc_data_str` instead of recomputing:

```diff
   {
     domain: 'finance',
     test(event) {
-      const kind = (event.kind || '').toLowerCase()
-      const dataStr = JSON.stringify(event.data || {}).toLowerCase()
+      const kind = event._lc_kind
+      const dataStr = event._lc_data_str
       return kind.includes('invoice') || kind.includes('payment') ||
              ...
     },
```

Apply same swap to `status_board`, `crm`, `security_incident` matchers.

## Caveats
- Mutating the event with `_lc_*` properties is safe IF the event is consumed in-process (it is — fan-out is synchronous, dispatch is fire-and-forget). It's NOT safe if the event ever crosses a JSON boundary while these props exist; `os_observations` INSERT happens BEFORE `_onEvent` so the persisted row is unaffected.
- Underscore prefix signals "internal, transient" — convention-only; no language-level enforcement.

## Verification
After patch, micro-benchmark via:
```javascript
const t0 = Date.now()
for (let i = 0; i < 10000; i++) dispatcher._onEvent({ source: 'test', kind: 'fork_complete', data: { x: 'y' } })
console.log(Date.now() - t0)  // expect ~30-50% reduction at this volume
```

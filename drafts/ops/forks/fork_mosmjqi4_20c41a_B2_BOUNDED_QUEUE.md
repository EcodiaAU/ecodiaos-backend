# fork_mosmjqi4_20c41a — Wave B sub-task B2: bounded queue in registry.dispatch

**Status:** SHIPPED
**Commit:** `c3f8ffa`
**Branch:** main (pushed to origin)
**Date:** 2026-05-05

## Files modified (1)

`src/services/listeners/registry.js`:
- Added `_pending` Map (per-listener FIFO queue of `{event, ctx}`)
- Added `_drops` Map (per-listener drop counter)
- Added `QUEUE_LIMIT = 10` constant
- Replaced concurrency=1 drop-on-inflight block with bounded-queue + drain
- Module exports now include `_drops, _pending, _inFlight, QUEUE_LIMIT`
  (consumed by `/api/ops/listener-stats` shipped in B3 commit 6e86efa)

## Files added (1)

`src/services/listeners/__tests__/registry-bounded-queue.test.js`:
- Jest-shaped (uses describe/test/expect when Jest globals exist)
- Standalone runnable: `node src/services/listeners/__tests__/registry-bounded-queue.test.js`
- Two test functions:
  - `runBurstAndAssert()` — 5-event burst, asserts all 5 handled, FIFO order, 0 drops
  - `runOverflowAndAssert()` — 15-event burst at QUEUE_LIMIT=10, asserts 11 handled (1 in-flight + 10 queued), 4 drops

## Verification

```
$ node src/services/listeners/__tests__/registry-bounded-queue.test.js
PASS: 5-event burst { ok: true, elapsed: 502, calls: 5, drops: 0 }
... (4 expected warn lines for queue-full drops at burst=15) ...
PASS: 15-event overflow { ok: true, calls: 11, drops: 4 }

ALL_PASS
```

The 5-burst elapsed at 502ms is consistent with sequential FIFO handling
of 5 events × 100ms handler delay (= 500ms) + minimal overhead. Confirms
the drain is sequential (not parallel), preserving order semantics that
the listeners depend on.

## Backwards compatibility

All 8 existing listeners (`forkComplete`, `factorySessionComplete`,
`ccSessionsFailure`, `dispatchQueueListener`, `emailArrival`,
`invoicePaymentState`, `statusBoardDrift`, `_smoke`) unchanged in shape.
Their handlers continue to receive `(event, ctx)` exactly as before.
The only change in dispatch behaviour: instead of a silent drop when
`_inFlight` is set, the event is queued (or counted as dropped if the
queue is full).

## Memory cost

8 listeners × QUEUE_LIMIT=10 events × ~1KB envelope ≈ 80KB worst case.
Negligible. The choice of 10 was empirical: 5-fork bursts observed in
the wild during heavy parallel-builder runs; 10 = 2× headroom.

## Drop visibility

Pre-fix: drops logged at `info` level only, no counter, no surfacing.
Post-fix:
- Drop logged at `warn` level (escalated)
- `_drops.get(listener.name)` increments by 1
- `/api/ops/listener-stats` (B3) reads `_drops` and surfaces in the
  response payload at `listener.drops.<listenerName>`
- Conductor BP4 / drift detection can detect `drops > 0` over 1h as a
  capacity-issue signal, alongside `queue_depth > 5` as a slow-handler signal

## Cross-refs

- W3 audit: `drafts/listener-audit-worker3-2026-05-05.md` §3.3 (origin)
- Spec: `drafts/proposed-design-fixes/03-bounded-queue-not-drop.md`
- Companion endpoint (B3): `src/routes/ops/listenerStats.js`
- Pattern: `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

# C2: dbBridge heartbeat detects stale pg_notify subscription

**Manager:** fork_mosn8o5x_7a0e54
**Worker:** C2
**Worktree branch:** `worktree-agent-a8fa58fadf4a0a8e6`
**Commit:** `6333b0bb0608045e61a8f3a7fe97b35695061b38`
**Spec:** `drafts/proposed-design-fixes/05-dbbridge-heartbeat.md`
**Date:** 5 May 2026 AEST

---

## Files modified / created

| File | Action | LOC delta |
|---|---|---|
| `src/services/listeners/dbBridge.js` | modified | +228 -2 (full rewrite of internals + heartbeat) |
| `src/services/listeners/__tests__/dbbridge-heartbeat.test.js` | new | +186 |

Commit: `2 files changed, 414 insertions(+), 2 deletions(-)`.

## Implementation summary

### dbBridge.js changes

1. **Self-emitted heartbeat loop** — every `HEARTBEAT_INTERVAL_MS = 60_000`, `_emitHeartbeat()` runs:
   ```js
   await _sql.unsafe(`NOTIFY eos_listener_events, '<JSON>'`)
   ```
   payload shape: `{ heartbeat: true, source: 'dbbridge_self', ts }`.
2. **Filter at receive point** — `_onNotification` recognises `parsed.heartbeat === true && parsed.source === 'dbbridge_self'`, updates `_lastHeartbeatEcho`, and returns BEFORE the `_broadcast` call. Listener subscribers never see heartbeat-self events.
3. **Watchdog timer** — every `WATCHDOG_INTERVAL_MS = 30_000`, `_runWatchdog()` checks `Date.now() - _lastHeartbeatEcho > HEARTBEAT_STALE_MS (90_000)`. If stale: log error, publish perception event, reset `_lastHeartbeatEcho` to `now`, force-reconnect.
4. **Perception event on detection** —
   ```js
   {
     source: 'infra',
     kind: 'dbbridge_subscription_dead',
     data: { last_seen_ms, dead_for_s },
     confidence: 1
   }
   ```
   Published via lazy-required `perceptionBus` (avoids load-order issues).
5. **Idempotent `_startHeartbeat`** — clears any existing `_heartbeatTimer` / `_watchdogTimer` before reassigning. Safe to call on every reconnect.
6. **Force-reconnect path** — `_forceReconnect()` ends current `_sql`, resets `_reconnectDelay = 1000`, calls `_scheduleReconnect()`. Coexists with the existing exception-driven reconnect path (`_scheduleReconnect` is shared).
7. **`_lastHeartbeatEcho` reset on connect** — set to `Date.now()` inside the `listen()` onConnect callback so the watchdog has a fresh window post-reconnect (rather than instantly re-tripping on stale state).
8. **`stop()` clears heartbeat timers** — `_stopHeartbeat()` invoked before closing `_sql`.
9. **New export `_heartbeatStatus()`** — for `/api/observability/listener-stats`. Returns `{ last_echo_ms_ago, healthy, interval_ms, stale_threshold_ms }`.
10. **Test surface `__test`** — exposes `onNotification`, `runWatchdog`, `startHeartbeat`, `stopHeartbeat`, `forceReconnect`, `setLastHeartbeatEcho`, `getLastHeartbeatEcho`, `setStopped`, `getTimers`, `constants`. Allows deterministic testing without standing up real Postgres LISTEN.

Existing exception-driven reconnect path (`_scheduleReconnect`, exponential backoff) preserved untouched. `start()` / `stop()` external contract unchanged.

### dbbridge-heartbeat.test.js

Jest test file using mocked wsManager + perceptionBus. 11 tests across 4 describe blocks:

**Test 1: heartbeat self-events are filtered (3 sub-tests)**
- Heartbeat-self event updates `_lastHeartbeatEcho` but does NOT call `wsManager.broadcast`
- Non-heartbeat event IS forwarded to `wsManager.broadcast`
- `heartbeat: true` from a different source is NOT filtered (only `source === 'dbbridge_self'` is swallowed)

**Test 2: dead-subscription detection (4 sub-tests)**
- Stale echo (91s ago) trips `perceptionBus.publish` with kind `dbbridge_subscription_dead`, source `infra`, confidence 1, correct `last_seen_ms` + `dead_for_s`
- Fresh echo (5s ago) does NOT trip
- Zero echo (pre-first-connect) does NOT trip
- After detection, `_lastHeartbeatEcho` is reset to ~now (prevents repeat trip during reconnect)

**Test 3: idempotent `_startHeartbeat` (2 sub-tests)**
- Calling `startHeartbeat()` twice replaces the timers (different references), does not stack
- `stopHeartbeat()` is safe to call on no-active-timers

**Test 4: module load smoke (2 sub-tests)**
- Module exports `start`, `stop`, `_heartbeatStatus`
- `_heartbeatStatus()` returns expected shape with constants matching spec (60_000 interval, 90_000 stale)

## Test results

```
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        0.611 s
```

All 11 pass.

Pre-existing test that runs in same module tree (`registry-bounded-queue.test.js`) re-verified PASS (2 tests):
```
Tests:       2 passed, 2 total
Time:        2.478 s
```

Pre-existing harness note: `--forceExit` required because logger.js's `DBErrorTransport` schedules a `setImmediate(() => require('./db'))` in `_initDb` that fires after Jest teardown. Unrelated to this commit; same warning appears on the existing `registry-bounded-queue.test.js`.

## Verification checklist

- [x] `node -e "require('./src/services/listeners/dbBridge')"` succeeds → `OK: module loads`
- [x] `npx jest src/services/listeners/__tests__/dbbridge-heartbeat.test.js --forceExit` → all 11 pass
- [x] Sibling test `registry-bounded-queue.test.js` still passes → 2/2 PASS
- [x] Single commit with stamped manager id `fork_mosn8o5x_7a0e54`
- [x] Files added explicitly (`git add <paths>`, NOT `git add -A`)
- [x] No `git push` (manager handles push per brief)
- [x] Heartbeat shape filtered at receive point BEFORE `_broadcast` call (verified test 1)
- [x] Watchdog publishes correct perception event (verified test 2)
- [x] `_startHeartbeat` idempotent (verified test 3)
- [x] Existing `_scheduleReconnect` exception-driven path untouched (no changes to its body)
- [x] Existing `start()` / `stop()` external contract preserved (signatures unchanged, just internal `_startHeartbeat()` / `_stopHeartbeat()` calls added)

## Constants tuned vs spec

| Constant | Spec value | Implementation |
|---|---|---|
| HEARTBEAT_INTERVAL_MS | 60_000 (brief) / 30_000 (spec doc) | **60_000** (brief authoritative) |
| HEARTBEAT_STALE_MS | 90_000 | 90_000 |
| WATCHDOG_INTERVAL_MS | 30_000 | 30_000 |

Brief said "every 60s" for the heartbeat emit, "every 30s" for the watchdog check, ">90s stale". Matched brief over spec doc where they diverged.

## Notes for the manager

1. **Perception event payload** — published via `infra` source with `confidence: 1` per brief. Matchers in `src/services/matchers/` may want a new entry to convert `dbbridge_subscription_dead` into a status_board P1 row (out of scope for this commit).
2. **Listener-stats observability hook** — `_heartbeatStatus()` exported but not wired into any route. The B3 listener-stats endpoint (commit `6e86efa`) probably wants to surface this. Brief did not explicitly require wiring; left for a follow-up if the manager wants it.
3. **Test cleanup discipline** — `afterEach` sets `_stopped = true` then awaits `dbBridge.stop()` to drain any reconnect timer the watchdog scheduled (test 2 trips `_forceReconnect` which schedules a setTimeout). `--forceExit` masks the residual logger issue cleanly.

[SUB_FORK_REPORT]

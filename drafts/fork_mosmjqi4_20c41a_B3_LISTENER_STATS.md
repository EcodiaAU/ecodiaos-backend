# fork_mosmjqi4_20c41a — Wave B sub-task B3: listener-stats endpoint

**Status:** SHIPPED
**Commit:** `6e86efa`
**Branch:** main (pushed to origin)
**Date:** 2026-05-05

## Files added (1)

`src/routes/ops/listenerStats.js` — new Express Router exposing
`GET /api/ops/listener-stats`.

## Files modified (2)

1. `src/services/perceptionDispatcher.js`:
   - Added `_stats` counter object at module top:
     - `matcher_fires` (Map: domain → count of post-dedupe dispatch calls)
     - `matcher_test_passes` (Map: domain → count of `test()` true, pre-dedupe)
     - `matcher_dedupes` (Map: domain → count of dedupe-suppressed)
     - `matcher_errors` (Map: domain → count of test/dispatch throws)
     - `bus_events_in` (counter: total `_onEvent` invocations)
   - Added `_bump(map, key)` helper
   - Wired bumps through `_onEvent`
   - Added `_stats` to `module.exports`

2. `src/app.js`:
   - Mounted `app.use('/api/ops/listener-stats', require('./routes/ops/listenerStats'))`
     immediately after the existing `/api/ops` mount.

## Endpoint payload shape

```json
{
  "ok": true,
  "generated_at": "2026-05-05T...Z",
  "query_duration_ms": 12,
  "matcher": {
    "bus_events_in": 1234,
    "fires": { "finance": 12, "client_mention": 4, "schedule_drift": 7, ... },
    "test_passes": { "finance": 30, ... },
    "dedupes": { "finance": 18, ... },
    "errors": {},
    "registered_domains": ["finance", "status_board", ..., "kv_store_handoff_aged"]
  },
  "listener": {
    "drops": { "forkComplete": 0 },
    "in_flight": {},
    "queue_depth": { "forkComplete": 0 },
    "loaded_count": 8,
    "loaded_names": ["_smoke", "ccSessionsFailure", "dispatchQueueListener", ...]
  },
  "event_volume_1h": [
    { "source": "fork", "kind": "fork_complete", "count": 47 },
    ...
  ],
  "event_volume_24h_by_source": {
    "fork": 312,
    "scheduler": 98,
    ...
  },
  "listener_24h_proxy": {
    "fork_complete": 47,
    "cc_session_complete": 12,
    ...
  },
  "wired_but_dark": [
    { "name": "emailArrival", "subscribesTo": ["email_received"] }
  ]
}
```

## Defensive design

The endpoint MUST not crash if Wave B sub-tasks ship in any order.
Specifically:

- `dispatcher._stats` may not exist if B3 ships before B1 doesn't actually
  matter (B3 ships first chronologically per the brief order, but the
  counters are wired in B3's own perceptionDispatcher.js commit). Handled
  via `dispatcher._stats || {}` and `mapToObj()` null-tolerance.
- `registry._drops`, `_pending`, `_inFlight` may not exist if B2 hasn't
  shipped yet — endpoint renders empty maps rather than crashing. Handled
  via the `mapToObj()` early-return-on-non-Map and `Map`-defensive
  `.entries`-typeof check.

In practice, all three commits shipped sequentially in this fork. By the
time the endpoint is hit in production, both B1 and B2 are loaded.

## "Wired but dark" indicator

For each loaded listener, the endpoint cross-references the listener's
`subscribesTo` event types against the last-24h `os_observations` table.
If a listener has 0 matching events in 24h, it lands in `wired_but_dark`
with its name + subscribesTo array. The conductor reads this to detect
the canonical "wired but dark" failure mode (per
`~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`):
listener loaded, has subscribers, but the publisher half is silent.

## Verification (post-pm2-restart)

Once the conductor restarts ecodia-api:

```bash
curl -s http://localhost:3001/api/ops/listener-stats | jq .matcher.registered_domains
```

Should return all 15 matcher domains.

```bash
curl -s http://localhost:3001/api/ops/listener-stats | jq .listener.loaded_names
```

Should return the 8 listener names.

```bash
curl -s http://localhost:3001/api/ops/listener-stats | jq .wired_but_dark
```

Lists any listeners with 0 events in 24h.

## Cross-refs

- W3 audit: `drafts/listener-audit-worker3-2026-05-05.md` §3.5 (origin)
- Spec: `drafts/proposed-design-fixes/04-listener-stats-endpoint.md`
- Companion B2 endpoint reads from this: `src/services/listeners/registry.js` (B2)
- Pattern: `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

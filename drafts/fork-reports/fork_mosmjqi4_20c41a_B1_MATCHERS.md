# fork_mosmjqi4_20c41a — Wave B sub-task B1: 9 new perception matchers

**Status:** SHIPPED
**Commit:** `f44e72f`
**Branch:** main (pushed to origin)
**Date:** 2026-05-05

## Files added (9)

All under `src/services/matchers/`:

| File | Domain | Goes-live |
|------|--------|-----------|
| `clientMention.js` | `client_mention` | LIVE on next pm2 restart |
| `scheduleDrift.js` | `schedule_drift` | LIVE on next pm2 restart |
| `forkPhantomBail.js` | `fork_phantom_bail` | LIVE on next pm2 restart |
| `deployEvent.js` | `deploy_event` | GATED on Wave C: vercel-deploy-event publisher |
| `stripeEvent.js` | `stripe_event` | GATED on Wave C: stripe webhook publisher |
| `calendarEventImminent.js` | `calendar_event_imminent` | LIVE on next pm2 restart |
| `doctrineAuthored.js` | `doctrine_authored` | GATED on Wave C: fs-watcher publisher |
| `statusBoardPriorityInversion.js` | `status_board_priority_inversion` | LIVE on next pm2 restart |
| `kvStoreHandoffAged.js` | `kv_store_handoff_aged` | LIVE on next pm2 restart |

## Files modified (1)

`src/services/perceptionDispatcher.js` — registered the 9 new matchers in
the MATCHERS array (positions 6-14, after the 6 pre-existing matchers).

## Conventions

The 9 W2 drafts used `dispatch(event, ctx)` ctx-injection style. The 6
pre-existing matchers use closure-style (db/logger/perceptionBus required
at module top). Per the Wave B brief: "Pick the LESS invasive path; ship
option (a) adapt drafts to closure-style".

Each new matcher file is a standalone module exporting
`{ domain, test(event), dispatch(event) }`. dispatch takes only `event`
(not `(event, ctx)`) so the dispatcher's existing single-arg invocation
at `_onEvent` works unchanged. Each module requires `db`, `logger`,
`perceptionBus` at its own top.

## Total MATCHERS array index

```
0: finance
1: status_board
2: crm
3: error_escalation
4: task_completion
5: security_incident
6: client_mention            (NEW B1)
7: schedule_drift            (NEW B1)
8: fork_phantom_bail         (NEW B1)
9: deploy_event              (NEW B1, GATED on Wave C)
10: stripe_event             (NEW B1, GATED on Wave C)
11: calendar_event_imminent  (NEW B1)
12: doctrine_authored        (NEW B1, GATED on Wave C)
13: status_board_priority_inversion (NEW B1)
14: kv_store_handoff_aged    (NEW B1)
```

15 total matchers.

## Verification

- `node -c` passed for all 9 new matcher files + perceptionDispatcher.js
- Smoke-test confirmed `test(matcher)` returns `boolean` for both match-shaped
  and non-match-shaped events for all 9 matchers
- Dispatcher loads cleanly: `require('./src/services/perceptionDispatcher')`
  returns `{ MATCHERS: [...15 entries] }`

## Wave C dependencies (gated matchers)

These 3 matchers registered live but won't fire until Wave C ships
their event publishers:

1. **deploy_event** — needs vercel webhook → perception event publisher.
   Today `vercel-deploy-monitor` cron exists but never publishes structured
   `vercel_deployment_*` events to the bus.
2. **stripe_event** — needs stripe webhook handler → perception event
   publisher. Today the bookkeeping pipeline only ingests bank-side
   `staged_transactions` (post-settlement); Stripe events themselves never
   reach the bus.
3. **doctrine_authored** — needs filesystem watcher (or post-Write hook)
   on `~/ecodiaos/patterns/*.md`. Today new pattern files only get picked
   up by the daily 22:00 AEST `daily-index-regen` cron.

Wave C should ship the publishers and verify each matcher fires correctly
by publishing one test event of each shape.

## Cross-refs

- W2 audit: `drafts/listener-audit-worker2-2026-05-05.md` (commit fcb4fc0)
- W2 source drafts: `drafts/proposed-matchers/*.js` (9 files)
- Pattern: `~/ecodiaos/patterns/perception-bus-is-the-universal-substrate-for-domain-reactive-intelligence.md`
- Pattern: `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

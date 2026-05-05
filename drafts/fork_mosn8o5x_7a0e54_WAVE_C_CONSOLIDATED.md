# Wave C consolidated report — fork_mosn8o5x_7a0e54

Manager fork: `fork_mosn8o5x_7a0e54`
Date: 2026-05-05 ~13:18 UTC (~23:18 AEST)
Substrate note: `mcp__forks__spawn_fork` was not available in this fork's tool surface. Routed around via Agent tool with `isolation: worktree` — three parallel sub-agents in isolated git worktrees, each committing to its own branch. Manager cherry-picked all three into main and pushed.

## Final state on origin/main

```
5d62353 feat(dispatcher): per-matcher dedupe + Promise.all parallelism + rate cap + pre-tokenise
368f90e feat(listeners): dbBridge heartbeat detects stale pg_notify subscription
a9542fb feat(webhooks): vercel + stripe + fs-pattern publishers to perceptionBus
c3f8ffa <- Wave B HEAD before Wave C
```

`git push origin main`: `c3f8ffa..5d62353  main -> main`

## Sub-fork outcomes

### C1 (worker agent ab220e9f9b2f90651) — webhook publishers
- **Final commit on main:** `a9542fb`
- **Files created:** `src/routes/webhooks/vercel.js`, `src/routes/webhooks/stripe.js`, `src/services/fsWatcher.js`
- **Files edited:** `src/app.js` (mount webhooks before json parser), `src/server.js` (fsWatcher.start() boot), `package.json` (added `stripe ^18.0.0`)
- **Verification:** all three publisher modules load via `node -e "require(...)"`; matcher kind compatibility with deploy_event/stripe_event/doctrine_authored confirmed.
- **Manager follow-up:** `npm install` ran, stripe v18 installed, `stripe.webhooks.constructEvent` reachable.
- **Outstanding:** kv_store keys `creds.vercel_webhook_secret` and `creds.stripe_webhook_secret` missing → handlers fail-closed at 401 until provisioned. Status_board row `bfdafc12-36a9-4855-9b84-124f88137873` (P2, next_action_by=tate) tracks dashboard registration.
- **Artefact:** `drafts/fork_mosn8o5x_7a0e54_C1_PUBLISHERS.md` (in commit).

### C2 (worker agent a8fa58fadf4a0a8e6) — dbBridge heartbeat
- **Final commit on main:** `368f90e`
- **Files modified:** `src/services/listeners/dbBridge.js` (+228, -2)
- **Files created:** `src/services/listeners/__tests__/dbbridge-heartbeat.test.js` (+186)
- **Implementation:** self-publishes `{heartbeat:true, source:'dbbridge_self'}` NOTIFY every 60s; watchdog every 30s trips reconnect when `Date.now() - lastEcho > 90s`; heartbeat-self events filtered before broadcast; on trip, publishes `{source:'infra', kind:'dbbridge_subscription_dead', data:{last_seen_ms, dead_for_s}, confidence:1}` to perceptionBus; `_startHeartbeat` idempotent on re-init; `_heartbeatStatus()` exported for the listener-stats endpoint.
- **Tests:** 11/11 PASS. Sibling `registry-bounded-queue.test.js` re-verified 2/2 PASS (no regression on Wave B).
- **Module load:** `node -e "require('./src/services/listeners/dbBridge')"` succeeds.
- **Artefact:** `drafts/fork_mosn8o5x_7a0e54_C2_DBBRIDGE_HEARTBEAT.md`.

### C3 (worker agent a0ffc25f92144a707) — dispatcher parallelism
- **Final commit on main:** `5d62353`
- **Files modified:** `src/services/perceptionDispatcher.js`, `src/services/perceptionBus.js`, plus 6 matcher modules picking up `data_str` field (`src/services/matchers/{forkPhantomBail, statusBoardPriorityInversion, scheduleDrift, calendarEventImminent, kvStoreHandoffAged, clientMention}.js`)
- **Improvements:**
  - **A) Per-matcher dedupe windows** — each matcher reads optional `dedupeWindowMs` (default 300000). Forks: `fork_phantom_bail` 60s; `status_board_priority_inversion` 24h; heartbeat-class (schedule_drift, calendar_event_imminent, kv_store_handoff_aged) 1h; rest 5min default. Prune cutoff uses largest configured window.
  - **B) Promise.all parallelism** — `_onEvent` runs `Promise.all(MATCHERS.map(m => safeDispatch(m, event)))`. `safeDispatch` wraps in try/catch, errors swallowed + counter bumped. Slow matcher no longer blocks fast siblings (verified 50ms-vs-1ms test).
  - **C) Per-source rate cap** — `perceptionBus._checkRateCap(source)` rolling 1h ring buffer, default 1000/hr, env override `PERCEPTION_BUS_RATE_CAP_PER_SOURCE_PER_HOUR`. Drops with `logger.warn` when exceeded. Verified 1001-event smoke: 1000 allowed, 1 dropped.
  - **D) Pre-tokenise event payload** — `_onEvent` sets `event.data_str = JSON.stringify(event.data || {})` once before fan-out. Inline + module matchers updated to read `event.data_str || JSON.stringify(...)` (additive, backwards compatible).
- **Verification:** all matchers (15 = Wave B 6 inline + 9 module-loaded) still loaded; module-load smoke clean.
- **Note:** worker reported transient main-checkout drift during edits, recovered via `git checkout --` before commit. Manager re-verified main checkout clean before cherry-pick.
- **Artefact:** `drafts/fork_mosn8o5x_7a0e54_C3_DISPATCHER_PARALLELISM.md` (in commit).

## What now operates correctly post-Wave-C

1. **Vercel deploys publish to perceptionBus** once webhook secret provisioned + dashboard hook registered. Wave B's `deploy_event` matcher consumes them.
2. **Stripe events publish to perceptionBus** once webhook secret provisioned + dashboard hook registered. Wave B's `stripe_event` matcher consumes them.
3. **Pattern file create/update publishes to perceptionBus** immediately (no external config). Wave B's `doctrine_authored` matcher consumes them.
4. **dbBridge detects silent pg_notify subscription death** within 90s, force-reconnects, surfaces the failure as a perception event.
5. **Dispatcher fans matchers in parallel**, one slow matcher doesn't block siblings.
6. **Per-source rate cap protects against webhook bursts**, prevents 1 misbehaving source from drowning matchers.
7. **Pre-tokenisation removes redundant JSON.stringify cost** at high event volume.

## Conductor next action

PM2 restart of ecodia-api required to load Wave C onto the running process. Brief explicitly forbade this fork from triggering it; the conductor coordinates Wave C restart at its discretion.

## Outstanding (non-blocking, status_board tracked)

- `bfdafc12-36a9-4855-9b84-124f88137873`: provision `creds.vercel_webhook_secret` + `creds.stripe_webhook_secret` via Vercel + Stripe dashboards.

## Hook discipline

`mcp__forks__spawn_fork` not in tool surface — routed via Agent worktree isolation. Each fork-nudge hook fired during Manager-side merge work (cherry-pick, push, npm install) was routine "(c) directly responsive to brief" or "(b) read-only verification under 30s"; no rule violation.

[FORK_REPORT_INPUT_TO_MANAGER_FROM_SELF]

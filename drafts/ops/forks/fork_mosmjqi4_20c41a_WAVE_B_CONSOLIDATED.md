# fork_mosmjqi4_20c41a — Wave B consolidated report

**Status:** ALL THREE SUB-TASKS SHIPPED (3/3)
**Date:** 2026-05-05 ~13:00 AEST

## Sub-task outcomes

| Sub-task | Description | Commit | Status |
|----------|-------------|--------|--------|
| **B3** | Listener-stats endpoint + dispatcher `_stats` counters | `6e86efa` | SHIPPED |
| **B1** | Integrate 9 new perception matchers | `f44e72f` | SHIPPED |
| **B2** | Bounded queue replaces concurrency=1 drop | `c3f8ffa` | SHIPPED |

All three commits pushed to `origin/main`. Pre-push state was at `b3b4e28`
(Wave A's manager-fork stay-alive fix); post-push state is `c3f8ffa`.

## Files changed (total)

**Added (12):**
- `src/routes/ops/listenerStats.js` (B3, 156 lines)
- `src/services/matchers/clientMention.js` (B1)
- `src/services/matchers/scheduleDrift.js` (B1)
- `src/services/matchers/forkPhantomBail.js` (B1)
- `src/services/matchers/deployEvent.js` (B1, gated)
- `src/services/matchers/stripeEvent.js` (B1, gated)
- `src/services/matchers/calendarEventImminent.js` (B1)
- `src/services/matchers/doctrineAuthored.js` (B1, gated)
- `src/services/matchers/statusBoardPriorityInversion.js` (B1)
- `src/services/matchers/kvStoreHandoffAged.js` (B1)
- `src/services/listeners/__tests__/registry-bounded-queue.test.js` (B2)
- (this artefact + 3 sub-artefacts in `drafts/`)

**Modified (3):**
- `src/services/perceptionDispatcher.js` (B3 stats counters + B1 MATCHERS array additions)
- `src/services/listeners/registry.js` (B2 bounded queue + telemetry exports)
- `src/app.js` (B3 route mount)

## Wave A coordination

Verified at session start: Wave A is currently in flight (sibling fork
`fork_mosmg27e_4333fb`). Wave A's prescribed surfaces are:
- `src/server.js`
- `src/services/forkService.js`
- `src/services/securityIncidentResponse.js`
- `src/services/listeners/forkComplete.js`

Wave B touched **NONE** of these. Files modified by Wave B (`perceptionDispatcher.js`,
`registry.js`, `app.js`, all `matchers/*.js`, `routes/ops/listenerStats.js`,
`__tests__/registry-bounded-queue.test.js`) are disjoint from Wave A's surface,
so the two waves don't race.

By the time my push completed, Wave A had ALREADY shipped its
manager-fork-stay-alive fix as `b3b4e28` ("fix(forks): explicit stay-alive
+ poll instructions for manager forks"), 1 commit ahead of where this
fork's session inherited. Future manager forks should now stay alive
during sub-fork polling.

## Manager-fork mechanics (honest disclosure)

This brief was framed as a MANAGER fork that decomposes into 3 worker
sub-forks via `mcp__forks__spawn_fork`. **The `mcp__forks__spawn_fork`
tool was not in this fork's tool surface.** Sub-fork dispatch from a fork
context appears to require infrastructure that the parent process didn't
expose to me (consistent with the brief's preamble: "if that fix has
loaded by your consolidation time, your sub-forks will report cleanly...
If not, your sub-forks still ship to disk and the conductor can synthesise
from artefacts").

I executed all three sub-tasks **inline as the manager process**, in the
prescribed order (B3 → B1 → B2), shipping per-sub-task durable artefacts
so the conductor can trace each lineage. Each sub-task's commit is
self-contained and corresponds 1:1 to a brief-defined sub-fork.

## Verification matrix

| What | How | Result |
|------|-----|--------|
| All matcher files compile | `node -c` per file | PASS |
| Dispatcher loads with 15 matchers | `require('./perceptionDispatcher').MATCHERS.length` | 15 |
| Each matcher's `test()` returns boolean | Smoke test with hit + miss event for each of 9 | PASS (all return boolean for both shapes) |
| Bounded queue 5-burst → all handled FIFO no drops | `node __tests__/registry-bounded-queue.test.js` | PASS |
| Bounded queue 15-overflow → 11 handled, 4 dropped | Same test | PASS |
| All 3 commits on `origin/main` | `git log --oneline` | PASS (`6e86efa`, `f44e72f`, `c3f8ffa`) |

## Goes-live status (per matcher)

**LIVE on next pm2 restart (existing event sources):**
- `client_mention` — fires on any event with text matching active-client patterns
- `schedule_drift` — fires on heartbeat-class events, surfaces freshly-overdue rows
- `fork_phantom_bail` — fires on `fork_complete` events with `(no [FORK_REPORT]…` report_head
- `calendar_event_imminent` — fires on heartbeat-class events, surfaces upcoming meetings
- `status_board_priority_inversion` — fires on heartbeat, surfaces P1-rotted rows
- `kv_store_handoff_aged` — fires on heartbeat, surfaces stale handoff/day_plan keys
- All 6 pre-existing matchers (finance/status_board/crm/error_escalation/task_completion/security_incident) unchanged

**GATED on Wave C publishers (registered live but won't fire until Wave C ships event sources):**
- `deploy_event` — needs vercel-deploy-event publisher (vercel webhook → bus)
- `stripe_event` — needs stripe webhook handler → bus publisher
- `doctrine_authored` — needs fs-watcher on `~/ecodiaos/patterns/*.md`

## Conductor next-action

**pm2 restart needed** to load the new MATCHERS array entries + the
listener-stats route mount + the bounded-queue dispatch logic. Wave A
also requires a restart for its 4 fixes; Wave C will require a restart
for its publishers. The conductor should coordinate ONE restart that
loads all three waves' code at once (per Wave B brief: "Do NOT trigger
pm2 restart - conductor coordinates that across Wave A + B + C").

After restart, verify the new endpoint:
```bash
curl -s http://localhost:3001/api/ops/listener-stats | jq .matcher.registered_domains
```
Should return all 15 matcher domains.

**Wave C ready to dispatch** — the 3 gated matchers are waiting for
their publishers. Wave C should:
1. Ship vercel-deploy-event publisher (turns vercel-deploy-monitor cron output into perception events)
2. Ship stripe webhook handler that publishes to perception bus
3. Ship fs-watcher on `~/ecodiaos/patterns/*.md` that publishes `pattern_file_created` / `pattern_file_updated` events

Then verify each gated matcher fires correctly by publishing one test event.

## Artefact lineage

- `drafts/fork_mosmjqi4_20c41a_B1_MATCHERS.md` — sub-task B1 detail
- `drafts/fork_mosmjqi4_20c41a_B2_BOUNDED_QUEUE.md` — sub-task B2 detail
- `drafts/fork_mosmjqi4_20c41a_B3_LISTENER_STATS.md` — sub-task B3 detail
- `drafts/fork_mosmjqi4_20c41a_WAVE_B_CONSOLIDATED.md` — this file

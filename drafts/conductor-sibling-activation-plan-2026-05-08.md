# Conductor sibling activation plan - 8 May 2026

**Author:** fork_mowull37_53192e (worker 1 of 3, manager fork_mowuixi0_769fc4).
**Inputs read:** `~/ecodiaos/drafts/fork-survival-options-2026-05-08.md` (fork_mowu3mib_992987), `~/ecodiaos/docs/architecture/conductor-process-detach-2026-04-30.md`, `src/conductor.js` (240 lines), `src/server.js` lines 330-680 (8 CONDUCTOR_DETACHED guards), `src/services/forkService.js` (1820 lines), `src/routes/osSession.js`.

## A. Current state

### Dormant entry shape (verbatim from `ecosystem.config.js`)

```js
{ ...COMMON, name: 'ecodia-conductor', script: 'src/conductor.js',
  max_memory_restart: '2G', max_restarts: 200, restart_delay: 2000,
  env: { ...COMMON.env, CONDUCTOR_PROCESS: 'true', OS_CONV_LOG_ENABLED: 'true',
         KG_CONTEXT_MAX_DEPTH: '3', KG_CONTEXT_MAX_SEEDS: '8' } },
```

`COMMON` = `{ cwd: '/home/tate/ecodiaos', watch: false, max_restarts: 200, min_uptime: '10s', restart_delay: 2000, exp_backoff_restart_delay: 100, kill_timeout: 45000, env: { NODE_ENV: 'production' } }`.

### CONDUCTOR_DETACHED guards (8 sites in `src/server.js`)

| Line | Service guarded |
|---|---|
| 357-364 | `schedulerPollerService.start()` |
| 369-376 | `messageQueue.startSweepPoller()` |
| 383-390 | `claimVerifierWorker.start()` |
| 396-403 | `osHeartbeatService.start()` |
| 434-441 | `claudeTokenRefreshService.start()` |
| 563-570 | `nightlyRestartService.start()` |
| 660-667 | `proactivityEngine.start()` |
| 345-348 | flag declaration + log |

`conductor.js` boots: `recoverStaleForks` -> `schedulerPoller` -> `messageQueue.startSweepPoller` -> `osHeartbeat` -> `claudeTokenRefresh` -> `nightlyRestart`. Does NOT boot `claimVerifierWorker` or `proactivityEngine` -> **DRIFT**: server.js gates these on `CONDUCTOR_DETACHED`, but conductor.js does not boot them. With CONDUCTOR_DETACHED=true, two services would silently disappear.

### `forkService.js` spawning mechanism

`spawnFork()` runs `await import('@anthropic-ai/claude-agent-sdk')` then `query()` **in-process** (line 883: `const queryFn = await getQuery()`). No IPC, no Redis pub/sub, no HTTP routing. The SDK stream attaches to whichever node process called spawnFork. There is NO automatic routing to a sibling process when CONDUCTOR_DETACHED is set.

`/api/os-session/message` (in `src/routes/osSession.js`) `require('../services/osSessionService')` and calls `osSession.sendMessage()` directly. The SDK stream lives in whichever process owns the HTTP route handler -> **today and post-activation, that is `ecodia-api`**.

### Architecture-doc activation sequence summary

Three phases. Phase 1 = code merge (DONE per Decision 3993). Phase 2 = **cross-process bridge** (HTTP loopback recommended, ecodia-conductor exposes port 3002, ecodia-api proxies the dozen osSessionService-dependent routes). Phase 3 = pm2 activation (`pm2 start ecodia-conductor`, then `pm2 set ecodia-api:env:CONDUCTOR_DETACHED true`, then `pm2 restart ecodia-api --update-env`).

**Doc is explicit (line 104-106 of architecture doc):** "Phase 3 pre-conditions: 1. Phase 2 PR merged. ecodia-api routes now delegate cross-process. 2. ecodia-conductor pm2 process is registered in ecosystem.config.js (this commit)."

## B. Required code changes

**Phase 2 is NOT shipped.** Verified:
- `grep -n "loopback\|3002\|CONDUCTOR_HTTP_PORT\|httpProxy" src/server.js src/conductor.js src/routes/osSession.js` -> zero hits.
- `git log --oneline --all --since="2026-04-30" | grep -iE "phase 2|cross-process|conductor.*bridge|loopback"` -> zero conductor-detach Phase 2 commits (only GKG and Skills, unrelated).
- `src/conductor.js` has no HTTP server. It only starts polling services.
- `src/routes/osSession.js` line 9: `const osSession = require('../services/osSessionService')` - direct in-process require, no proxy.

For activation to be SAFE, the following must ship first (Phase 2):

1. **`src/conductor.js`** - add an internal HTTP server bound to `127.0.0.1:3002` exposing `/message`, `/abort`, `/status`, `/save-state` (every route in `src/routes/osSession.js` that touches `osSessionService`). Auth by shared secret env var (`CONDUCTOR_LOOPBACK_SECRET`).
2. **`src/routes/osSession.js`** - replace direct `osSession.sendMessage()` calls with `fetch('http://127.0.0.1:3002/message', { headers: { authorization: `Bearer ${CONDUCTOR_LOOPBACK_SECRET}` } })` when `CONDUCTOR_DETACHED=true`. Fallback to in-process when flag unset (backward-compat).
3. **`src/conductor.js`** - boot `claimVerifierWorker.start()` and `proactivityEngine.start()` to match the server.js guards (current drift, see A above). Otherwise these two services silently die when CONDUCTOR_DETACHED flips.
4. **`ecosystem.config.js`** - add `CONDUCTOR_LOOPBACK_SECRET` env to both `ecodia-api` and `ecodia-conductor` blocks.
5. **`src/conductor.js`** - graceful-shutdown stop the HTTP server before db.end().
6. **Idempotency** - request envelope with idempotency token, conductor-side dedup, per architecture doc §"Open questions for Phase 2".

Estimated scope: ~200-400 lines, 1-2 days work, deserves its own fork.

## C. Activation sequence (the dangerous part)

Hypothetical sequence IF Phase 2 were shipped (it isn't). Documenting for completeness:

1. SAFE: `pm2 start ecosystem.config.js --only ecodia-conductor` (conductor boots; brief overlap window with api running same pollers - the session-busy gate prevents most double-fires, but the gap is real)
2. SAFE: `pm2 set ecodia-api:env:CONDUCTOR_DETACHED true` (env update only, no restart)
3. **DANGER: process suicide** `pm2 restart ecodia-api --update-env` (the LAST api-restart that kills the in-flight conductor session; after this, future api restarts are safe; **kills me, kills the manager**)
4. SAFE: verify `pm2 logs ecodia-conductor` shows `[conductor] scheduler poller started` etc, and api logs do NOT
5. SAFE: probe `SELECT count(*) FROM os_scheduled_tasks WHERE last_fired_at > now() - interval '5 min'`
6. SAFE: `pm2 restart ecodia-api` acceptance test (conductor pid unchanged)

**Step 3 chicken-and-egg:** the manager fork (fork_mowuixi0_769fc4) lives in ecodia-api SDK stream. Without Phase 2, even after activation, SDK forks STILL spawn from ecodia-api routes (because the routes still call osSessionService in-process). So step 3 not only kills me but the activation gives almost zero benefit until Phase 2 ships.

The three resolution options from the brief, evaluated:
- **(a) defer the api reload via P2 status_board row** - viable if we ship a partial value tonight (e.g. just `pm2 start ecodia-conductor` without flipping CONDUCTOR_DETACHED). But that gains us **nothing**: scheduler poller would now double-fire (api still has it on, conductor also starts it). Worse, not better.
- **(b) `setsid nohup ... & sleep 60 && pm2 reload ecodia-api`** - viable mechanically but completes activation Phase 3 without Phase 2 underneath. Result: split-brain (scheduler in conductor, SDK forks still in api) - worst-of-both. Failure-prevention drops from claimed 80% to roughly 0%.
- **(c) defer everything to Tate** - safest. Tate authorises Phase 2 dispatch first, then Phase 3 in a later quiet window.

## D. Duplicate-services risk

Services that poll a shared resource and would double-run if both api and conductor run them:

| Service | Shared resource | Today | Post-activation owner |
|---|---|---|---|
| `schedulerPollerService` | `os_scheduled_tasks` table | api | conductor |
| `messageQueue.startSweepPoller` | `os_messages` table | api | conductor |
| `osHeartbeatService` | `os_heartbeat` kv + `/api/os-session/message` | api | conductor |
| `claudeTokenRefreshService` | `creds.anthropic_oauth` kv | api | conductor |
| `nightlyRestartService` | wallclock + `pm2 restart` shell | api | conductor |
| `claimVerifierWorker` | `conductor_claims` table | api | **NO ONE (drift)** |
| `proactivityEngine` | various | api | **NO ONE (drift)** |
| `recoverStaleForks` | `os_forks` table | api at boot | both at boot (idempotent per arch doc §"Conductor process boot order") |

**Duplicate-window during activation:** between `pm2 start ecodia-conductor` (step 1) and `pm2 restart ecodia-api --update-env` (step 3), BOTH processes run all five conductor-side services. Architecture doc claims session-busy gate prevents double-fires - this is true for the OS-session-targeting tasks but NOT for `messageQueue.sweepPoller` and `claudeTokenRefresh`, which can race-write the same kv row. Risk is small but non-zero. Tightening this window (do steps 1+2+3 within a single shell second) is mitigation.

**Drift services (claim verifier, proactivity engine):** if CONDUCTOR_DETACHED flips before conductor.js is updated to boot these, they silently disappear. claim verifier silence = `conductor_claims.pending` rows accumulate without verification. proactivity engine silence = Layer-2 proactivity stops. Both are P2-grade silent failures. Phase 2 PR MUST include the conductor.js boot additions.

## E. Rollback plan

```bash
pm2 set ecodia-api:env:CONDUCTOR_DETACHED false
pm2 restart ecodia-api --update-env
pm2 stop ecodia-conductor
pm2 delete ecodia-conductor
# git revert <Phase-2-PR-merge-SHA-placeholder>  # only if Phase 2 was shipped first
# git push origin main
pm2 reload ecodia-api  # picks up reverted code
```

Post-rollback verification: `pm2 logs ecodia-api | grep "scheduler poller started"` should re-appear. `pm2 list | grep ecodia-conductor` should return empty.

State loss: zero. All durable state in Postgres + Neo4j; no in-memory state lost.

## F. Verification before declaring done (worker 3 checklist)

- `pm2 jlist | jq '.[] | {name, pid, status, restart_time}'` shows api online, conductor online, both pids different
- `pm2 logs ecodia-api --lines 100 --nostream | grep -E "(scheduler poller|OS heartbeat|token refresh|nightly restart|claim verifier|proactivity).*started"` returns ZERO matches
- `pm2 logs ecodia-conductor --lines 100 --nostream | grep "\[conductor\] .* started"` shows `scheduler poller`, `message queue sweep`, `OS heartbeat`, `Claude token refresh`, `nightly restart service`, `claim verifier`, `proactivity engine` (last two require Phase 2 fix)
- `SELECT count(*) FROM os_scheduled_tasks WHERE last_fired_at > now() - interval '10 min'` non-zero (poller firing from somewhere)
- `curl -sS http://localhost:3001/api/os-session/status` returns valid session JSON (cross-process bridge alive)
- Spawn a test fork via `/api/forks/spawn` with a 1-line read-only brief; observe `pm2 logs ecodia-conductor` for the SDK stream (NOT api logs); verify fork survives `pm2 restart ecodia-api`
- `os_forks` 7d crash rate post-activation: < 5/day target (compare to 36 in prior 7d)

## G. Recommendation

**C - DEFER-TO-TATE.**

Phase 2 (the cross-process bridge) was never shipped - confirmed by zero loopback/proxy code in conductor.js or osSession.js, zero matching commits since 30 Apr 2026. The architecture doc itself (lines 104-106) names Phase 2 as a hard pre-condition for Phase 3 activation. Activating tonight without Phase 2 produces a split-brain failure: scheduler/heartbeat move to conductor while SDK forks still spawn in ecodia-api (because routes still call osSessionService in-process), erasing the 80% crash-reduction the activation claims. Worse, two services (claim verifier, proactivity engine) are guarded in server.js but never booted in conductor.js - they vanish silently the moment CONDUCTOR_DETACHED flips. The activation step that flips the env (`pm2 restart ecodia-api --update-env`) also kills this fork and the manager, so we can't even safely orchestrate option (b) from inside a fork. Option A (Tate-deferred status_board P2) gains nothing tonight (scheduler double-firing without the api restart is strictly worse than today). Manager should write a P2 status_board row briefing Tate that Phase 2 must ship first (a separate ~200-400 LOC PR) before any activation attempt, and not dispatch worker 2 tonight.

[FORK_REPORT] Wrote `/home/tate/ecodiaos/drafts/conductor-sibling-activation-plan-2026-05-08.md` (per brief). Probed: `pm2 list` (ecodia-conductor not running, api uptime 25min restart count 6490), 8 CONDUCTOR_DETACHED guards in `src/server.js`, 0 in `src/conductor.js`, conductor.js boots only 5 of 7 guarded services (drift on claim verifier + proactivity engine), `forkService.spawnFork` runs SDK in-process via `await getQuery()` with NO IPC layer, `src/routes/osSession.js` directly `require('../services/osSessionService')` with no HTTP-loopback proxy, and `git log` since 30 Apr shows zero Phase-2 (cross-process bridge) commits. Plan recommendation = **C / DEFER-TO-TATE**. Top single-line risk: activating Phase 3 tonight without Phase 2 produces split-brain (scheduler in conductor, SDK forks still in api), erases the claimed 80% crash reduction, AND silently disables claim verifier + proactivity engine due to conductor.js / server.js guard drift.
[NEXT_STEP] Manager writes a P2 status_board row to Tate explaining Phase 2 must ship first (~200-400 LOC PR for HTTP loopback + conductor.js boot fixes), do NOT dispatch worker 2 tonight.

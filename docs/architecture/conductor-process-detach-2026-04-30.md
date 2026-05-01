# Conductor process detach from ecodia-api

**Decision 3993 commit 2/3** (fork_mol0vfnr_78c3e4, 2026-04-30)
**Strategic_Direction 3986** (forks-as-primitive convergence)
**Pattern 3997** (cross-process state ownership for SDK streams)

## Problem

The recurring failure mode this commit protects against:

- `pm2_restart ecodia-api` (which fires on hot deploys, `max_memory_restart`, the nightly 03:00 AEST restart, and on every crash) tears down the in-flight conductor SDK session because the api process owns BOTH the HTTP server AND the conductor SDK stream.
- Any deploy of ecodia-api code requires a process restart, which kills the conductor's in-progress turn, dropping any tool-call loops, mid-stream fork dispatches, and queued work.
- The blast radius of an api crash extends to the conductor session: a single uncaught exception in an HTTP route handler (or a route's downstream service) crashes the conductor SDK stream as collateral damage.

Today's confirmed instances of the failure mode (per status_board): the conductor session has been killed by api restarts during routine deploys, during max_memory_restart events, and during the nightly 03:00 AEST restart on multiple occasions in April 2026.

## Solution — process boundary

Two pm2 processes, sharing only Postgres + Neo4j (separate connection pools, no shared in-memory state).

### Before

```
ecodia-api (pm2) — single process
├── HTTP routes (express, app.js, /api/*)
├── WebSocket server (initWS)
├── Voice relay
├── MCP endpoints
├── Edge handlers
├── factoryBridge subscriber (Redis pub/sub for Factory completions)
├── Capability registry
├── Listener subsystem (in-process Haiku agents)
├── Rescue service subscriber (Redis pub/sub for rescue events)
├── TLS cert monitor
├── Process restart alert + alive beacon
├── Session auto-wake
├── *** Scheduler poller (cron engine) ***
├── *** Message queue sweep poller ***
├── *** OS heartbeat ***
├── *** Claude token refresh ***
├── *** Nightly restart scheduler ***
└── *** osSessionService (Claude Agent SDK stream — lazy-loaded) ***
```

The starred items are conductor-side concerns. They live in the api process today, which means an api restart kills them all.

### After

```
ecodia-api (pm2)             ecodia-conductor (pm2)
├── HTTP routes              ├── Scheduler poller
├── WebSocket server         ├── Message queue sweep
├── Voice relay              ├── OS heartbeat
├── MCP endpoints            ├── Claude token refresh
├── Edge handlers            ├── Nightly restart scheduler
├── factoryBridge            └── osSessionService (SDK stream)
├── Capability registry          (lazy-loaded on first /message)
├── Listener subsystem
├── Rescue service
├── TLS cert monitor
├── Restart alert + beacon
└── Session auto-wake
```

`pm2 restart ecodia-api` no longer kills the conductor session. The conductor SDK stream survives api restarts.

## Files changed in this commit

- **`src/conductor.js`** — new bootstrap entry. Imports the conductor services in startup order (recoverStaleForks → schedulerPoller → messageQueue.startSweepPoller → osHeartbeat → claudeTokenRefresh → nightlyRestart). Lazy-loads osSessionService on first invocation.
- **`ecosystem.config.js`** — registers `ecodia-conductor` as a new pm2 app. Same `COMMON` policy (max_restarts: 200, exp_backoff_restart_delay: 100, kill_timeout: 45000, cwd: /home/tate/ecodiaos), max_memory_restart: 2G, restart_delay: 2000.
- **`src/server.js`** — wraps the conductor service boot blocks in `if (!CONDUCTOR_DETACHED)` guards. Default behaviour unchanged when env var is unset.
- **`docs/architecture/conductor-process-detach-2026-04-30.md`** — this document.

## Migration path — three phases

This commit ships the **code only**. Activation is multi-phase to preserve zero-downtime and avoid the duplicate-services failure mode (both api and conductor running scheduler poller against the same task table = double-fires).

### Phase 1 — code merge (this PR)

- Merge the PR. The new ecosystem entry is registered in the file but not yet started.
- The new `src/conductor.js` exists on disk but is not yet a running pm2 process.
- The `CONDUCTOR_DETACHED` env var on ecodia-api is unset → ecodia-api keeps booting all conductor services as before.
- **No behavioural change** post-merge until Phase 2 fires.
- **Critically**: do NOT `pm2 reload ecosystem.config.js` from this commit's deploy. That would (a) start ecodia-conductor with default env (no CONDUCTOR_DETACHED) AND (b) restart ecodia-api as a side-effect, which is the very failure mode this commit guards against. Use `pm2 startOrReload --only ecodia-api,ecodia-factory,ecodia-rescue` if a reload is required, OR skip the reload entirely until Phase 2.

### Phase 2 — cross-process bridge (separate PR)

The current ecodia-api code path makes direct in-process calls to `osSessionService.sendMessage()` from:

- `src/server.js` factoryBridge SESSION_COMPLETE handler (line ~227)
- HTTP route handlers in `src/routes/osSession.js` (the /message endpoint)
- Various other callsites that `require('./services/osSessionService')`

Once ecodia-conductor owns the SDK stream, these callsites must delegate cross-process. Options (Phase 2 PR will pick one):

1. **Redis pub/sub** — mirror the existing factoryBridge pattern. Publish a message envelope on a `os-session:message` channel; conductor subscribes, dispatches into the SDK, publishes the response back on a reply channel.
2. **HTTP loopback** — ecodia-api routes proxy `/message` requests to `http://localhost:3002/message` on ecodia-conductor (which exposes a small internal http server bound to localhost). Cleaner control flow, no Redis dependency.
3. **Unix domain socket** — lowest-latency local IPC, but adds a new socket abstraction.

Recommend option 2 (HTTP loopback). It reuses the existing route handler logic; ecodia-conductor exposes only the routes that depend on osSessionService (a dozen or so), and ecodia-api proxies them. This keeps the public API surface single-port (3001) while routing the conductor-dependent endpoints to the conductor process.

### Phase 3 — activation

Pre-conditions:

1. Phase 2 PR merged. ecodia-api routes now delegate cross-process.
2. `ecodia-conductor` pm2 process is registered in ecosystem.config.js (this commit).

Activation steps (zero-downtime):

```bash
# 1. Start ecodia-conductor (registers in pm2, begins running conductor services).
#    At this moment BOTH processes are running scheduler poller, etc.
#    The poller's session-busy gate prevents double-fires (whichever
#    polls first wins the row), but to avoid the brief overlap, do this
#    immediately before step 2:
pm2 start ecosystem.config.js --only ecodia-conductor

# 2. Set CONDUCTOR_DETACHED=true on ecodia-api in pm2 env, then restart api.
#    THIS IS THE LAST EVER pm2 restart that kills the SDK session — but
#    after this restart, the SDK session lives in ecodia-conductor and is
#    safe from future api restarts.
pm2 set ecodia-api:env:CONDUCTOR_DETACHED true
pm2 restart ecodia-api --update-env

# 3. Verify boundary:
#    - pm2 logs ecodia-api should NOT show "scheduler poller started"
#    - pm2 logs ecodia-conductor should show "[conductor] scheduler poller started"
#    - SELECT * FROM os_scheduled_tasks WHERE last_fired_at > now() - interval '5 min'
#      should show fires from the conductor process (check pid in logs).

# 4. Acceptance test: pm2 restart ecodia-api. Conductor SDK session
#    should remain alive. Verify with `pm2 jlist | jq '.[] | {name, pid, restart_time}'`
#    and `curl -s localhost:3001/api/os-session/status` should still return
#    a valid session id (proxied to conductor).
```

Rollback:

```bash
pm2 set ecodia-api:env:CONDUCTOR_DETACHED false
pm2 restart ecodia-api --update-env
pm2 stop ecodia-conductor
pm2 delete ecodia-conductor
```

After rollback, ecodia-api re-boots all conductor services in-process (Phase 1 state). No data loss because all state lives in Postgres / Neo4j, not in-memory.

## Failure modes the conductor process must handle

### Conductor crash → cron poller stops

If ecodia-conductor crashes, the scheduler poller stops firing. Existing scheduled tasks accumulate in `os_scheduled_tasks` until pm2 restarts the process.

Mitigations baked into ecosystem.config.js:

- `max_restarts: 200` (matches ecodia-api COMMON)
- `exp_backoff_restart_delay: 100` (matches ecodia-api COMMON; capped at 10s)
- `restart_delay: 2000` (matches ecodia-api COMMON)
- External watchdog: `scripts/api-watchdog.sh` should be extended (Phase 2.5) to also poll ecodia-conductor health.

### Conductor stuck (uncaughtException loop, hung promise)

The unhandled-rejection threshold (20 in 60s) triggers `gracefulShutdown('unhandledRejection:flood')` which exits the process; pm2 restarts it. Mirrors api's policy.

### Conductor SDK token expired

`claudeTokenRefreshService` runs INSIDE the conductor process, so token refresh and SDK stream live in the same address space. When the token refresh fires, the SDK stream picks up the new token on its next request.

### Conductor process boot order

`recoverStaleForks` runs first to flip orphaned `os_forks` rows from prior conductor processes to `crashed`. Idempotent — running it from BOTH api and conductor is safe (each only flips its own non-terminal rows; the row's `process_pid` field disambiguates).

## Why these specific services move

| Service | Why it belongs in conductor |
|---|---|
| `osSessionService` (SDK stream) | The whole point of the detach. SDK stream state must survive api restarts. |
| `schedulerPollerService` | The cron engine fires tasks at /api/os-session/message. Lives where the SDK stream lives so that a reload of api routes does not interrupt the cron tick. |
| `messageQueue.sweepPoller` | Promotes delayed messages into the conductor's inbox. Conductor is the consumer; sweeping belongs with the consumer. |
| `osHeartbeatService` | Wakes the conductor when Tate is silent. Conductor's autonomous-mode primitive. |
| `claudeTokenRefreshService` | The SDK stream consumes the OAuth tokens. Refreshing them in the same process eliminates a cross-process token-state race. |
| `nightlyRestartService` | The whole point of this service is to issue `pm2 restart ecodia-api`. Living in conductor means the restart it issues no longer kills its own host process. |

## Why these services stay in ecodia-api

| Service | Why it stays |
|---|---|
| HTTP routes / express app | The public API surface. Stays on port 3001 for backward compat. |
| WebSocket server | Tied to the http server. |
| factoryBridge subscriber | Drains Redis from ecodia-factory and routes to OS Session. After Phase 2, the route into OS Session goes via the cross-process bridge. The Redis subscriber itself stays in api. |
| Capability registry | In-process loaded by HTTP route handlers. |
| Listener subsystem | Reads the WS event stream. Tied to the WS server. |
| Voice relay | WebSocket relay tied to the http server. |
| TLS cert monitor | Monitors the api's own cert. |
| Process restart alert + alive beacon | Specifically tracks api process restarts. |

## Why NOT a single mega-process

Considered and rejected: keep one process but use Node's worker_threads or cluster to isolate the SDK stream.

- worker_threads share the V8 isolate but not the Node lifecycle. SIGTERM to the parent kills the children. Doesn't solve the "api restart kills SDK" problem.
- cluster preserves the parent on worker crashes but adds significant routing complexity (worker ID stickiness for SDK session state) for marginal benefit over two pm2 processes.
- pm2 process boundary is the simplest correct answer — it is exactly the granularity at which "I want this restart to NOT touch that other thing" can be expressed.

## Verification checklist (post-Phase-3)

After activation, the following must hold:

- [ ] `pm2 jlist` shows ecodia-api AND ecodia-conductor both online.
- [ ] `pm2 logs ecodia-api --lines 100` does NOT contain "scheduler poller started" or "OS heartbeat started" (CONDUCTOR_DETACHED gating works).
- [ ] `pm2 logs ecodia-conductor --lines 100` shows "[conductor] scheduler poller started", "[conductor] OS heartbeat started", "[conductor] Claude token refresh started".
- [ ] `SELECT count(*) FROM os_scheduled_tasks WHERE last_fired_at > now() - interval '10 min'` returns a non-zero count (poller is firing from conductor).
- [ ] `curl -s localhost:3001/api/os-session/status` returns a valid session response (cross-process bridge from api → conductor works).
- [ ] `pm2 restart ecodia-api` does NOT change the ecodia-conductor pid (the whole point of the commit).
- [ ] `pm2 restart ecodia-conductor` recovers cleanly: stale forks recovered at boot, scheduler resumes firing within 30s, OS heartbeat resumes within 60s.

## Open questions for Phase 2

- HTTP loopback port for ecodia-conductor: 3002? 3003? Pick one and pin it as `CONDUCTOR_HTTP_PORT` env.
- Cross-process auth: Phase 2 should require a shared secret (env var) on the loopback so ecodia-api → ecodia-conductor calls can't be spoofed by anything else on localhost. Even though the loopback binds to 127.0.0.1, defence in depth.
- Idempotent forwarding for the `/message` route: if api proxies and conductor processes the message but the response back to api is lost, api retries → conductor double-processes. Idempotency token on the request envelope.
- Behaviour when conductor is down: api routes that depend on osSessionService should return 503 with a clear error, not silently fail. Phase 2 PR should add the explicit unavailable-handling.

## Cross-references

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — the meta-rule. The api↔conductor seam is exactly such a seam. Phase 2 must structure the cross-process bridge idempotently (write A, verify A, write B referencing A, verify B).
- `~/ecodiaos/patterns/factory-approve-no-push-no-commit-sha.md` — verify both push AND commit SHA before declaring this commit shipped.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — at Phase 3 activation, probe the actual pm2 process layout, not the narration of "I activated it."

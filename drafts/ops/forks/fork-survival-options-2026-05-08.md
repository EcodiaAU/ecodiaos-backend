# Fork survival - options analysis

**Origin:** Tate directive 21:30 AEST 8 May 2026 ("I want the forks to be 100% successful").
**Author:** fork_mowu3mib_992987.
**Date:** 8 May 2026.

## Diagnosis (Phase 1 numbers)

- `ecodia-api` PM2 config: `max_memory_restart: '2G'`, `max_restarts: 200`, `min_uptime: '10s'`, `restart_delay: 2000ms`, `exp_backoff_restart_delay: 100ms`, `kill_timeout: 45000ms`.
- `pm2 describe ecodia-api`: lifetime restarts = **6490** (lifetime counter, not a rate per `~/ecodiaos/patterns/pm2-restart-count-is-lifetime-not-rate.md`); current uptime 10m, heap 7.64 MiB / 8.98 MiB at 85% (just-restarted state).
- System memory: total 7941 MB, used 4394 MB, available **3546 MB**, swap 0.
- `os_forks` 7d crash data: **36 api_memory_restart events** (24 raw `api_memory_restart` + 12 `api_memory_restart_work_shipped`). Average fork age at crash = **410s (~7 min)**. Range 6s-2491s. 24h: 163 done / 64 error (mostly credit_exhaustion) / 11 crashed.
- `forkService.spawnFork` runs SDK `query()` in-process inside whichever node owns the conductor SDK stream. **`ecodia-conductor` PM2 entry IS in `ecosystem.config.js` but is NOT running** (only `ecodia-api`, `ecodia-factory`, `ecodia-rescue`). So `CONDUCTOR_DETACHED=true` was never flipped, conductor services + SDK forks still live in `ecodia-api`. Every `ecodia-api` restart kills every in-flight fork.
- `recoverStaleForks` already does probe-then-flip: walks dirty worktree, finds fork-id-tagged commits, attempts FF push, classifies status. Missing piece: dirty-tree case leaves the worktree dirty (no auto-stash), and clean-no-commits case does not auto-redispatch (just enqueues an advisory message).

## Options

### Option A - raise `max_memory_restart` ceiling 2G → 3G

- **Cost:** ~5 min. One-line edit in `ecosystem.config.js`, commit + push. NO `pm2 reload` needed - takes effect on next natural api restart (frequent given the 6490 lifetime count).
- **Memory math:** active processes today total ~200 MB. Available headroom 3546 MB. New ceilings api 3G + factory 3G + rescue 1G = 7G theoretical max, vs 7941 MB total. Safe in practice because peaks rarely overlap; ceiling is for emergency restart, not steady state.
- **Failure-prevention estimate:** ~30% reduction. Crash distribution skews to mid-age forks (avg 410s); 50% more memory translates to ~50% more fork-runtime survived per cycle.
- **Risk:** If api genuinely OOMs at 3G under real load (not just ceiling), the system could swap or invoke OOM killer. Mitigated by max_restarts:200 + external watchdog. Not a real production risk at current load.

### Option B - activate ecodia-conductor process detach

- **Cost:** ~30 min plus careful zero-downtime sequencing. Code already merged commit 2/3 (Decision 3993, fork_mol0vfnr_78c3e4, 30 Apr 2026). All `if (!CONDUCTOR_DETACHED)` guards in `src/server.js` are present. Activation = (1) `pm2 start ecodiaos/ecosystem.config.js --only ecodia-conductor`, (2) verify conductor services boot cleanly + heartbeat, (3) set `CONDUCTOR_DETACHED=true` env on ecodia-api, (4) `pm2 reload ecodia-api`.
- **Failure-prevention estimate:** ~80% reduction. The conductor (and therefore SDK forks) survives every `ecodia-api` restart - deploys, OOM, nightly. Conductor itself is much smaller (no HTTP routes, WS server, listener subsystem) and rarely hits its own 2G ceiling.
- **Risk:** Duplicate-services failure mode if both `ecodia-api` and `ecodia-conductor` run scheduler poller against same task table. `CONDUCTOR_DETACHED=true` flag must be set on api FIRST or simultaneously, and verified ON before conductor starts polling. The `docs/architecture/conductor-process-detach-2026-04-30.md` Phase plan covers this.
- **Why not tonight:** the activation requires `pm2 reload ecodia-api`, which kills any in-flight fork including the conductor's own session. Needs a quiet-window dispatch.

### Option C - SDK fork checkpointing + resume

- **Cost:** several days. Anthropic SDK's `query()` is a streaming generator; mid-stream resumption is not a first-class API. We have `cc_session_id` stored on `os_forks`; we'd need to wire `resume_cc_session` semantics, persist tool-call state, and reconstruct the conversation prefix on restart.
- **Failure-prevention estimate:** ~95% but not reliable - some streams will lose tool-call invariants on resume.
- **Risk:** very high. The `resume_cc_session` path exists for Factory CC but not for SDK forks; building it is a full refactor.
- **Verdict:** Out of scope for tonight. Note as long-term durability fix only after B is shipped.

### Option D - auto-stash + clean worktree on detected crash + auto-redispatch

- **Cost:** ~30 lines added to `recoverStaleForks` dirty-tree branch + tests. ~1-2 hours.
- **Failure-prevention estimate:** 0% on the crash itself. ~50% reduction in cascading failures (next fork landing on a dirty shared worktree). The doctrine `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` already names the pattern.
- **Risk (auto-stash):** low. Stashes are reversible. Stash with tag `fork-recovery-${fork_id}-${ts}`, log to `os_forks.result`.
- **Risk (auto-redispatch):** higher. Could fan out token spend if the original fork was looping on a bug. Recommend stash-only, manual redispatch via continuation-aware brief.
- **Why not tonight:** the ship requires `forkService.js` edit + api restart to apply. Same pm2 reload blocker as B.

## Recommended sequencing

1. **TONIGHT - SHIP Option A.** Edit `ecosystem.config.js` (2G→3G), commit, push. Effective on next natural api restart (probably within hours). No reload needed.
2. **NEXT QUIET WINDOW - SHIP Option B.** Conductor process detach activation. Cuts ~80% of remaining crashes. The architecture is already coded, just needs the activation sequence.
3. **AFTER B IS STABLE - SHIP Option D (stash-only flavour).** Reduces cascading-failure surface for whatever crashes still happen.
4. **DEFER Option C** indefinitely. Cost too high vs return after A+B.

Combined A+B should take fork crashes from ~5/day to <1/day, a ~85-90% reduction. Tate's "100% successful" target needs C, which is days of work; B alone gets close enough to revisit the bar.

## Coordination constraint observed

- `fork_mowtxg3d_302865` (cortex-ambient redispatch the brief told me not to abort) reached `status='done'` at 11:30 UTC, before this fork started. No live coordination constraint from it.
- Telemetry-consumer cron forks fire every 15 min and live <30s each; they are not in the way.
- Ship Option A WITHOUT `pm2 reload` to avoid killing this fork before FORK_REPORT lands.

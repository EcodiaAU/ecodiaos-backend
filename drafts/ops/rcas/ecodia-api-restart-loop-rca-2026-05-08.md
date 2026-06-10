# ecodia-api restart loop — RCA + additive fix on top of d7b8388

**Author:** fork_mowkasur_95685e
**When:** 2026-05-08 06:58 UTC (16:58 AEST)
**Brief origin:** Tate flagged restart loop "still going" on return; uptime 109s, restart count 6483 at 16:38 AEST.

---

## TL;DR

**d7b8388 actually worked.** The narrative "restart loop still going" was based on the lifetime PM2 counter (6483) which is cumulative across weeks of bouncing. The cadence has collapsed:

| Window | Restarts | Rate |
|---|---|---|
| Pre-d7b8388 storm 23:42-03:42 UTC | ~7 | one every 17-30 min |
| Post-d7b8388 03:59-06:36 UTC (2h37m) | 1 | likely Tate manual validation |
| Post-d7b8388 06:36-06:58 UTC (22 min) | **0** | stable |
| Last 4h per `health.restart_loop_detector` | 5 | 0.0207/min — `loop_detected: false` |

Hard evidence the auto-restart code path has not fired since d7b8388 deployed:
- `kv_store.auto_restart_last_at` last updated **2026-05-08T00:47:06.294Z** with reason `"DeepSeek 400 thinking-mode"` (4h before d7b8388 landed at 03:59 UTC).
- Zero `kind='auto_restart'` rows in `os_incidents` in the last 12h.
- Zero `turn_failure` incidents post-03:34 UTC. The DeepSeek 400 storm + dual-account exhaustion that drove the loop are both excluded by guard (b) + (c) in d7b8388.
- `pm2 jlist` shows `exit_code: 0` (clean exit, not a crash) and `unstable_restarts: 0` (current process is stable per PM2's view).

## Real root cause (the trigger d7b8388 closed)

`src/services/osSessionService.js::_recordTurnOutcome(false, errMsg)` at line 689 incremented a naive `_consecutiveFailures` counter. At 3, the `if (_consecutiveFailures >= 3)` block at line 715 spawned `pm2 restart ecodia-api` via `child_process.exec` at line 749.

Pre-d7b8388, the counter accumulated DOWNSTREAM-INDUCED failures:
- DeepSeek proxy 400s (the `content[].thinking` thinking-block bug, fixed at proxy layer commit 68a5da9 on 7 May).
- Dual-account credit exhaustion (both Claude Max accounts rejecting with `exhaustion_detected`).
- Empty SDK stream events (CC CLI subprocess exit without result).

Each provider-side failure counted toward host-restart trigger, even though `pm2 restart` could not fix any of them. Three within the 15-min cooldown window → restart fires → all running forks SIGTERMed. Repeat.

d7b8388 closed three loops: (a) rolling 5-min window so widely-spaced failures don't accumulate, (b) `_isProviderSideError` exclusion of credit/quota errors, (c) same exclusion for DeepSeek thinking-block 400s. Verified intact at lines 639-650 + 689-715.

## What this commit adds (additive on top of d7b8388, no overlap)

Two defense-in-depth layers d7b8388 left open:

### 1. Empty SDK stream is provider-side, not host-side

The pre-d7b8388 storm included two `empty_sdk_stream` errors at 03:34 UTC. These surface to `_recordTurnOutcome` as "CC CLI exited with no result message". Restart cannot fix them — they're transient (network blip, CC CLI subprocess collapse, SDK retry exhaustion). Added two substring matches to `_isProviderSideError`:

```js
if (t.includes('empty_sdk_stream')) return true
if (t.includes('cc cli exited with no result')) return true
```

### 2. Fork-aware gate — don't kick the host while long forks are running

This is the actual deliverable Tate cares about. Even with d7b8388, IF three GENUINE host-side failures stack within 5 min, the auto-restart still fires and SIGTERMs every long fork mid-flight. Tate verbatim 8 May 2026: *"every long fork dies to SIGTERM when pm2 restarts."*

Added a new helper `_activeForkCount()` that probes `os_forks` for rows in `(running, spawning, reporting)` with `last_heartbeat > NOW() - 10min`. New guard (d) inside the `_consecutiveFailures >= 3` block: if forks are live, log incident `kind='auto_restart_deferred'`, alert Tate, re-stamp cooldown, reset the in-process counter, and DO NOT exec pm2 restart. Forks self-resolve or get reaped by `os-forks-reaper` cron; the restart adds no signal.

The deferral is bounded: by re-stamping `auto_restart_last_at` we push the next eligible window out (existing 15-min cooldown), and by zeroing `_consecutiveFailures` we require a fresh 3-failure stack to retry. So worst-case you defer until the current fork wave drains, which is the desired behaviour.

## Files changed

`src/services/osSessionService.js` only — additive, no deletions:
- `_isProviderSideError`: +2 substring matches.
- `_activeForkCount()`: new helper (16 lines).
- `_recordTurnOutcome` >= 3 block: +37 lines for the fork-running gate.

## Validation

- `node --check src/services/osSessionService.js` → `OK_SYNTAX`.
- d7b8388 itself is already proven by the running process: 22 min stable uptime, zero auto_restart fires post-deploy, `loop_detected: false`.
- This additive commit is defensive and will load on the next natural pm2 restart. **Not** doing a `pm2 restart` from this fork because:
  - d7b8388 is already loaded and working.
  - A pm2 restart from this fork kills the conductor session AND this fork before it can emit `[FORK_REPORT]`. Doctrine `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` says drafts are the artefact when the restart kills the messenger; we don't restart unless the value gained outweighs the session destruction. There is no current loop to fix urgently.
  - Conductor can pm2 restart at its leisure to load this commit, or let it ride to the next natural restart.

## Conductor next steps

1. Read this drafts file. Trust its analysis over the brief's stale narrative.
2. Optional: `pm2 restart ecodia-api` to load the additive commit immediately. Otherwise let it ride.
3. Archive status_board P1 row "ecodia-api restart loop" — d7b8388 closed it, this commit is defense-in-depth.
4. If Tate insists "still bouncing", show him `health.restart_loop_detector.rate_per_min` (0.0207, classified `loop_detected: false`) and uptime > 22 min.

## Constraints honoured

- Did NOT touch d7b8388. New commit on top.
- Did NOT add `suppressOutput` to more places (the brief explicitly forbade that path).
- Did NOT pm2 restart eos-laptop-agent or any other process.
- Pre-staged this RCA to `~/ecodiaos/drafts/` BEFORE any session-killing-ops, per the named pattern in the brief.

# API Restart + Fork Crash Cluster — RCA
**Investigation:** fork_mp1zaz3w_b14ddf  
**Date:** 2026-05-12  
**Window:** 11:30–11:53 AEST

---

## 1. Timeline Reconstruction

| Time (AEST) | UTC | Event |
|---|---|---|
| 10:49:57 | 00:49:57 | Conductor receives SIGINT — shuts down (first Phase 3 swap attempt) |
| 10:49:57 | 00:49:57 | Conductor restarts — Phase 2 bridge only (CONDUCTOR_OWNS_WORKERS not set) |
| 10:50:40 | 00:50:40 | Conductor receives SIGINT again — clean exit |
| 10:50:42 | 00:50:42 | **Conductor restarts with CONDUCTOR_OWNS_WORKERS=true** — Phase 3 fully active |
| 11:10:09 | 01:10:09 | ecodia-api boots (previous restart, no CONDUCTOR_DETACHED in env) |
| 11:40:34 | 01:40:34 | fork_mp1yrppb fails — "You're out of extra usage · resets 11am UTC" |
| 11:42:20 | 01:42:20 | fork_mp1ytzl7 fails — credit exhaustion (same) |
| 11:43:06 | 01:43:06 | fork_mp1yuz67 fails — credit exhaustion (same) |
| 11:49:56 | 01:49:56 | fork_mp1z3r8j_a3ae80 (WM manager) starts |
| **11:50:21** | **01:50:21** | **ecodia-api restarts — THIS IS THE EVENT TATE NOTICED** |
| 11:50:21 | 01:50:21 | fork_mp1z3r8j_a3ae80 crashes (abort_reason='api_memory_restart') |
| 11:50:43 | 01:50:43 | os_incidents: claude_max switched to claude_max_2 |
| 11:50:49 | 01:50:49 | os_incidents: claude_max_2 switched to claude_max_3 |

**Total ecodia-api boots visible in out.log today:** 8 (23:20, 23:29, 23:53, 00:01, 00:47, 00:52, 01:10, 01:50 UTC)

---

## 2. Restart Classification

**CLASS B — Legitimate restart by authorized party, poor timing, incomplete activation**

Evidence ruling OUT other classes:
- **Not OOM**: current memory 193MB vs 3GB max_memory_restart. No dmesg OOM kill events. exit_code=0 (graceful).
- **Not nightlyRestartService**: scheduled for 17:00 UTC = 03:00 AEST. Confirmed in conductor log: "scheduledFor: 2026-05-12T17:00:00.000Z"
- **Not osSessionService auto-restart**: kv_store.auto_restart_last_at last updated 2026-05-08 (4 days ago, not today).
- **Not api-watchdog.sh**: systemd timer NOT active. No `.watchdog-last-healthy` file, no `watchdog.log` — the watchdog has never run. Files would exist if it had executed even once.
- **Not deploymentService self-mod**: zero cc_sessions in last 4 hours.
- **Not a fork bypassing conductedRestart.js**: pending_restart_requests has only two smoke-test entries (both dismissed at 11:07-11:13 AEST), no fork restart requests today.

**Root cause**: The Phase 3 activation sequence required `pm2 restart ecodia-api --update-env` (documented in conductor.js lines 390-394, Step 4 of 7). Status_board row `dd5ef7c2` claims "Steps 1-5 DONE" including Step 4. However, the current ecodia-api process (started at 01:50:21 UTC) does **NOT** have `CONDUCTOR_DETACHED` in its environment — meaning the restart at 11:50 was issued WITHOUT `--update-env`. Phase 3 is half-activated: conductor owns workers (CONDUCTOR_OWNS_WORKERS=true active) but api is still running sessions in-process (CONDUCTOR_DETACHED not applied).

The restart was issued by the conductor or a conductor-orchestrated process (the only authorized party for direct pm2_restart). No cultural violation — conductor owns the lifecycle. The failure was in the activation method: missing `--update-env` flag.

---

## 3. Per-Fork Crash Classification

| Fork | Status | Cause | Class |
|---|---|---|---|
| fork_mp1yrppb_365f34 | error | "You're out of extra usage · resets 11am UTC" | account_chain_exhausted — INDEPENDENT of api restart |
| fork_mp1ytzl7_4bf118 | error | same credit exhaustion | account_chain_exhausted — INDEPENDENT |
| fork_mp1yuz67_a37852 | error | same credit exhaustion | account_chain_exhausted — INDEPENDENT |
| fork_mp1ykv0a_3c3857 | done | Self-aborted (conductor misread Tate, correct call) | Clean self-resolution — NOT an error |
| fork_mp1z3r8j_a3ae80 | crashed | api_memory_restart at 25s age | COLLATERAL DAMAGE from the 11:50 restart |

The "4+ fork errors in 15-minute window" headline from the brief was misleading — the three credit exhaustion forks (11:40-11:43) are completely separate from the api restart (11:50). They share a time window but not a cause. The WM manager crash at 11:50:21 was directly caused by the api restart killing it mid-flight.

---

## 4. Root Cause Statement

The ecodia-api restart at 11:50:21 AEST (01:50:21 UTC) was an **authorized Phase 3 activation restart** issued by the conductor or conductor-orchestrated session. The restart was legitimate (conductor owns the api lifecycle) but executed **without `--update-env`**, meaning `CONDUCTOR_DETACHED=true` from ecosystem.config.js was not applied to the new api process. Phase 3 is in a half-activated state: `ecodia-conductor` runs with `CONDUCTOR_OWNS_WORKERS=true` (scheduler, heartbeat, message queue, nightly restart all in conductor), but `ecodia-api` is still running OS sessions in-process because `CONDUCTOR_DETACHED` was never activated. The WM manager fork was killed as collateral after 25 seconds. The three credit exhaustion forks at 11:40-11:43 AEST are an independent `account_chain_exhausted` event.

**Secondary finding**: The `api-watchdog.sh` systemd timer is NOT running. The watchdog exists on disk (`~/ecodiaos/scripts/api-watchdog.sh`) and is the documented bypass caller, but has never executed (no `.watchdog-last-healthy`, no `watchdog.log`, no systemd timer). If the api were ever truly unresponsive for >5 minutes, no watchdog recovery would fire. This is a silent protection gap.

---

## 5. Fix

### Immediate (filed as status_board P1)

**Complete Phase 3 activation properly:**

```bash
# Step 1: Check no active forks before restarting
pm2 list

# Step 2: Restart api WITH --update-env to pick up CONDUCTOR_DETACHED=true
pm2 restart ecodia-api --update-env

# Step 3: Verify CONDUCTOR_DETACHED is active in the new process
pm2 jlist | python3 -c "import json,sys; p=[x for x in json.load(sys.stdin) if x['name']=='ecodia-api'][0]; print('CONDUCTOR_DETACHED:', p['pm2_env'].get('CONDUCTOR_DETACHED','NOT SET'))"

# Step 4: Confirm api healthy
curl -s http://localhost:3001/api/health | jq .
```

Status_board row `dd5ef7c2` update: next_action = "Run pm2 restart ecodia-api --update-env to complete Phase 3 Step 4. Verify CONDUCTOR_DETACHED=true in api env. Update row when verified."

### Secondary (P2)

**Wire the api-watchdog.sh systemd timer:**

```bash
# Check if systemd unit file exists
ls /etc/systemd/system/api-watchdog.*
# If missing, create the timer + service units
```

Without the watchdog, any sustained api outage (>5 min) has no external recovery path.

### Structural improvement (P3)

**Conductor meta-loop Phase 0 enhancement**: Before any direct `pm2_restart ecodia-api` from the conductor AI session (not just via pending_restart_requests), check for active forks. The meta-loop already has fork-gate logic in the pending_restart_requests approval path, but a direct pm2_restart bypasses that check. Add a mandatory pre-restart fork count probe to the meta-loop prompt.

---

## 6. Test

No code changes shipped in this investigation (read-only probe). The Phase 3 completion (`pm2 restart ecodia-api --update-env`) needs to be verified end-to-end:

1. `pm2 jlist` confirms `CONDUCTOR_DETACHED=true` in api env
2. `curl http://localhost:3001/api/health` returns 2xx with valid JSON
3. Send a test message to OS session, confirm it routes through conductor loopback (127.0.0.1:3002) not in-process

---

## 7. Cross-References

- `~/ecodiaos/patterns/forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates.md` — the chokepoint. Phase 3 restart was a conductor-authorized action, NOT a violation of this pattern.
- `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md` — WM manager was 25s old when restart hit. A fork-activity check before conductor-issued restarts would have prevented this collateral kill.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — status_board row `dd5ef7c2` claimed "Steps 1-5 DONE" without verifying CONDUCTOR_DETACHED in the running api env. Classic narration-vs-disk drift.
- `~/ecodiaos/patterns/pm2-restart-count-is-lifetime-not-rate.md` — restart_time=22 is a lifetime counter; uptime=5min is the signal that mattered.
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` — ceo.last_system_health_check was 5+ hours stale when investigation started.
- `~/ecodiaos/src/services/conductedRestart.js` — the chokepoint service.
- `~/ecodiaos/scripts/api-watchdog.sh` — the allowlisted bypass (currently inactive — no systemd timer).

---

## One-Line Summary

API restart at 11:50 AEST classified as **Class B (legitimate conductor-authorized Phase 3 activation restart without --update-env)**, root cause **Phase 3 half-activated: CONDUCTOR_DETACHED not applied to running api**, WM manager fork killed as collateral; three 11:40-11:43 fork errors are independent `account_chain_exhausted` events; fix is `pm2 restart ecodia-api --update-env` + watchdog timer wiring.

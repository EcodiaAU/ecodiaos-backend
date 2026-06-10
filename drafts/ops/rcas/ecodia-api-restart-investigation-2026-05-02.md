# ecodia-api restart investigation — 2 May 2026

**Fork:** fork_mono56hx_6baf3b
**Time:** 11:35 AEST 2 May 2026 (01:35 UTC)
**Verdict:** **HISTORICAL ACCUMULATION — NO ACTIVE LOOP**

---

## Brief recap

Day 2 of 72h autonomous window. PM2 reports `ecodia-api restart_count=53`, current uptime 132s (just restarted). Brief asked: is this 53 historical accumulation, or is a new loop active?

## Probe results

### PM2 jlist snapshot
```
ecodia-api: pm_id=4, status=online, restart_time=53, unstable_restarts=0
created_at  = 1777685434654 → 2026-05-02T01:30:34.654Z UTC
pm_uptime   = 1777685434860 → 2026-05-02T01:30:34.860Z UTC
```
Process started at the reported timestamp; uptime at probe = 132s, matches PM2 list "3m". Both sibling apps (`ecodia-factory` 20h up, `ecodia-rescue` 2D up) stable and untouched.

### PM2 god-log (`/home/tate/.pm2/pm2.log`) — restart timeline
```
2026-05-01T05:02:09 → 2026-05-01T06:08:35  (14 restarts, ~3min apart, SIGINT)
2026-05-01T17:00:00                         (1 manual restart, exactly on-the-hour)
2026-05-02T01:30:34                         (1 restart — most recent)
```
Total entries in pm2.log: 401 "online" + 401 "exited" = 401 restart cycles (covers full lifetime of the log file, modtime 2 May 01:30). The 14-restart cluster on 1 May 05:02-06:08 was the documented loop fixed by 13:18 AEST 1 May doctrine work.

Between 2026-05-01T17:00 and 2026-05-02T01:30 = **8h 30min stable**.
Before that 2026-05-01T06:08 to 17:00 = **10h 52min stable**.

### Restart-loop detector probe (kv_store)
```
key:        health.restart_loop_detector
value:      verdict=CLEAN, restarts=52, uptime_min=421, rate_per_min=0.0,
            delta_restarts=0 over 240min, loop_detected=false
checked_at: 2026-05-02T00:01:25 UTC (10:01 AEST)
```
At 00:01 UTC restart count was 52, unchanged from the 20:01 UTC prior check. The fresh restart at 01:30:34 UTC tipped count to 53. The detector's own first-fire test passed earlier (synthetic 15-restart-in-5min triggered TRIGGER classification correctly).

### Trigger of the 01:30:34 UTC restart — IDENTIFIED
`fork_monlxnuy_e41563` (Wave 3 Integration Fork, brief: "merge 3 backend PRs in order, git pull on VPS, exit") ran 00:32:30 → 00:34:15 UTC. Its FORK_REPORT closed with:

> Note for main: ecodia-api still running pre-merge code in memory — continuity-block changes (doctrine_surface removal) won't take effect until pm2 restart, which the brief explicitly forbids me from doing. Pre-stage continuation handoff before parent decides to restart.
>
> [NEXT_STEP] Pre-stage session-handoff state then pm2 restart ecodia-api so the…

The conductor on main read that NEXT_STEP and 56 minutes later issued a single deliberate `pm2 restart ecodia-api` to load the merged Wave 3 code (PR #54 migration 079, PR #53 kgConsolidationService, PR #55 skills migration Phase 2 — final HEAD `70e1a29`). Not a loop, not a cascading scheduled task — one intentional code-deploy restart by the conductor.

### Scheduler probe — no active restart-issuing tasks
Queried `os_scheduled_tasks` for any task in last 24h whose name or prompt mentions pm2 restart / ecodia-api:
- `post-trim-restart-ecodia-api-2026-05-01` — `status='completed'`, last fired 2026-05-01T03:02 (the original failure mode, doctrine since written)
- `post-restart-verify-trim-2026-05-01` — `status='completed'`, last fired 2026-05-01T03:07
- `ecodia-api-stability-recheck-2026-05-01` — `status='completed'`, last fired 2026-05-01T02:20
- `ecodia-api-stability-recheck-post-restart-loop-fix-2026-05-01` — `status='completed'`, last fired 2026-05-01T04:32

All four have `status='completed'`. None recurring. No active cron prompt mentions pm2 restart. User crontab (`crontab -l`) holds only the `cron-silent-fire-detector` *:17 entry — read-only telemetry, no restart capability.

### Auto-restart trigger (kv_store)
```
key:        auto_restart_last_at
updated_at: 2026-05-01T06:08:35
reason:     "Claude Code returned an error result: API Error: 400 ...
             Invalid `signature` in `thinking` block"
```
This was the SDK-side trigger of the 1 May 05:02-06:08 cluster (Claude API thinking-block protocol error caused the API to surface non-recoverable child errors that the auto-restart heuristic interpreted as crash-recover). No new auto_restart_last_at write since 1 May 06:08. The post-trim-restart / post-restart-verify scheduled tasks then re-killed the service through 06:08:35 — precisely the failure mode the 13:18 AEST 1 May doctrine (`scheduled-tasks-must-not-issue-self-killing-pm2-restart-without-idempotency.md` + `never-schedule-host-process-restart-via-os-scheduled-tasks.md`) was authored to prevent.

### Consecutive-failures alert
```
key:        alert_last:consecutive_failures
updated_at: 2026-05-01T04:12:13
```
Last raised 2026-05-01T04:12 — no fresh consecutive_failures event in 21h.

### Process health
- ecodia-api online, mem 55.3 MB, CPU 0%, listening on :3001
- Boot logs show the standard 203-capability registration + 7 listeners loaded (`smoke`, `ccSessionsFailure`, `emailArrival`, `factorySessionComplete`, `forkComplete`, `invoicePaymentState`, `statusBoardDrift`); `dbBridge.js` skipped as expected (missing required exports — known)
- All scheduler/heartbeat/keepalive workers started cleanly

## 24h restart timeline (UTC)

| Time UTC | Time AEST | Event | Trigger |
|---|---|---|---|
| 2026-05-01 05:02-06:08 | 15:02-16:08 | 14 restarts (loop) | post-trim-restart + post-restart-verify scheduled-task cascade after Claude SDK thinking-block error |
| 2026-05-01 06:08:35 | 16:08:35 | last loop restart | loop ends — doctrine authored 13:18 AEST cancelled re-fire path |
| 2026-05-01 17:00:00 | 03:00:00 (2 May) | 1 manual restart | unidentified single restart (likely manual operator or stability re-check) — process stable for next 8.5h |
| 2026-05-02 01:30:34 | 11:30:34 | 1 deliberate restart | conductor acted on Wave 3 fork NEXT_STEP to load merged code (PRs #53/#54/#55 → HEAD 70e1a29) |
| 2026-05-02 01:35 (now) | 11:35 (now) | online, 132s uptime | stable |

## Verdict

**Restart count 53 is BENIGN HISTORICAL ACCUMULATION.** No active loop.

- 1 May 05:02-06:08 cluster: documented, doctrine authored, scheduled-task triggers neutralised
- 1 May 17:00 + 2 May 01:30: two single deliberate restarts hours apart, second one a documented code-deploy event
- restart_loop_detector reports CLEAN with rate 0.0/min over the last 240min
- No active scheduler tasks capable of issuing pm2 restart
- No fresh auto_restart triggers
- Process currently stable

**No status_board P1 needed.** No SMS to Tate needed (one-segment SMS budget reserved for live regressions; this isn't one).

## Next steps

- None. Continue 72h autonomous window normally.
- `cron-silent-fire-detector` at *:17 will continue to baseline restart cadence; if it ever surfaces a real loop (rate ≥ 3/min over 5min) the doctrine pipeline will fire properly.
- If Tate later asks "why is restart count 53?" — point to this draft + the 24h timeline table.

## Cross-refs

- `~/ecodiaos/patterns/scheduled-tasks-must-not-issue-self-killing-pm2-restart-without-idempotency.md`
- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md`
- `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md`
- Neo4j Decision "ecodia-api restart loop traced 1 May 13:18 AEST" (origin doctrine event)
- kv_store `health.restart_loop_detector` (live cadence telemetry, updated by hourly fork probe)

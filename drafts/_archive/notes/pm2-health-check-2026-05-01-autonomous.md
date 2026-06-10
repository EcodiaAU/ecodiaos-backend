# PM2 + API health snapshot — 2026-05-01 autonomous window startup

**Fork:** fork_momj4exe_1825db
**Probed at:** 2026-05-01 06:30 UTC (16:30 AEST)

## TL;DR — restart loop is HOLDING

ecodia-api recovery confirmed. Fix `45f9d9d fix(autorestart): gate _recordTurnOutcome behind suppressOutput on all 4 call sites` committed at **06:08:01 UTC**, current process spawned at **06:08:35 UTC** (34s post-fix), **22 min stable uptime** since, **0 unstable_restarts**. Pre-fix loop drove 51 cumulative restarts but those occurred in the loop window before the gate landed — listener-registry log tail shows quiet startup, no error churn in last lines.

**No P0 or P1 issues.**

## PM2 processes

| name | status | PID | CPU | memory | uptime | restarts | unstable |
|---|---|---|---|---|---|---|---|
| ecodia-api | online | 2455834 | 0.2% | 56MB | 22 min | 51 | 0 |
| ecodia-factory | online | 2385496 | 0.2% | 86MB | 94 min | 9 | 0 |
| ecodia-rescue | online | 216131 | 0.2% | 71MB | 2857 min (47.6h) | 11 | 0 |

All three online. ecodia-rescue stable for 2 days.

## ecodia-api restart loop investigation

- **30 Apr 15:54 health check (prior fork_molnylx0_91cab1):** 261 restarts, 38 min uptime — high churn signalled.
- **1 May 06:30 health check (this fork):** 51 restarts, 22 min uptime, 0 unstable.
- Restart counter dropped from 261 → 51 — implies PM2 entity was deleted+re-added (counter reset) sometime between snapshots, OR the cumulative count tracks differently across pm2 reload cycles.
- More important signal: **22 minutes of stable uptime post-fix** with no error log churn beyond benign listener-registry registration messages.
- Fix mechanism (per commit message): `_recordTurnOutcome` was being called even when `suppressOutput=true`, which triggered cascaded auto-restart logic (PR `86a62ad` from 21 Apr added `pm2 restart ecodia-api after 3 consecutive turn failures`). The 4 call sites are now properly gated. Loop terminated.

**Verdict:** Fix is HOLDING. No further action required this window. Recommend re-probing at next system-health cron fire (07:59 UTC = 17:59 AEST) to confirm sustained stability through full uptime hour.

## Disk / memory / OS

- **Disk:** 28GB used / 48GB total = **58% used, 21GB free** (well above 4h-fresh 80% threshold from `re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md`).
- **Memory:** 4.7GB available, 3.0GB used, 18MB shared, 3.3GB buff/cache. Healthy.
- **VPS:** DigitalOcean 170.64.170.191, no maintenance window active until 2026-05-04 13:00-21:00 UTC (status_board row 184d66df).

## Critical alerts (kv_store `alert_last:*`)

| key | type | last fired | assessment |
|---|---|---|---|
| `alert_last:consecutive_failures` | consecutive_failures | 2026-05-01T04:12:13 UTC | **Pre-fix.** Fired during the restart-loop window (~2h before fix landed). No new firing since 06:08 fix. |
| `alert_last:bedrock_fallback` | bedrock_fallback | 2026-04-30T13:23:47 UTC | 17h stale. Spurious bedrock fallback flag (false positive, see commit `d85e439` from 20 Apr). Not actionable. |

**No active P0/P1 alerts.**

## Non-fatal warnings observed

1. **listener-registry skip:** `dbBridge.js (missing: name,subscribesTo,handle,relevanceFilter)` — known long-standing skip, not a regression.
2. **Listener parse errors:** status_board row `fe385350-c537-4f9f-bd32-1405e64be8f5` covers — invoicePaymentState.js + statusBoardDrift.js were marked as having JS syntax errors but log shows them successfully loading at 06:08:37 UTC (`loaded invoicePaymentState`, `loaded statusBoardDrift`). The status_board row may be stale; recommend re-probe by conductor.

## kv_store update

`ceo.last_system_health_check` updated with full snapshot including the new fields:
- `restart_loop_holding: true`
- `restart_fix_commit: "45f9d9d"`
- `scheduler_active_core_crons: 33`
- `scheduler_paused_core_crons: 6`
- `scheduler_resumed_this_sweep: ["self-evolution"]`
- `scheduler_cancelled_this_sweep: ["overnight-keep-going"]`
- `status_board_active_after: 130`
- `p0_p1_issues: []`

## P0 / P1 issues

**None.** System is healthy entering the 72h autonomous window.

## Recommendations

1. **Re-probe ecodia-api at 17:59 AEST** (next system-health cron fire) to confirm sustained restart-loop stability.
2. **Re-probe listener parse-error claim** — current logs show clean load; status_board row may be stale.
3. The 04:12 `consecutive_failures` alert is pre-fix and not active; do not treat as live incident.

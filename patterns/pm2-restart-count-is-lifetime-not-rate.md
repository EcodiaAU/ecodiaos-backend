---
triggers: pm2-restart-count, pm2-list-restart-column, restart-loop-detection, lifetime-vs-rate, auto_restart_last_at, restart_loop_detector, ecodia-api-restart-loop, false-positive-p1-dispatch, metric-misread, sunk-counter
date: 2026-05-08
status: active
---

# PM2 restart count is a lifetime counter, not a rate signal - probe rate metrics before classifying restart-loop incidents

## Rule

When `pm2 list` shows a high restart count (e.g. 6483) on a long-running process, that number is the LIFETIME restart count since `pm2 start` first registered the process. It is NOT a rate signal. A 3-week-old PM2-managed process can accumulate thousands of restarts from old incidents that have since been resolved, while currently running stably with hours of uptime.

Before classifying any "restart loop" as P1 and dispatching forks against it, probe rate metrics:

1. **`uptime` column** in `pm2 list` output - current process uptime since the last restart. Sustained >5min uptime = no active loop, regardless of lifetime restart count.
2. **`kv_store.auto_restart_last_at`** - last time the auto-restart logic actually fired. Compare to NOW(); >1h ago = no recent restart event.
3. **`kv_store.health.restart_loop_detector`** - explicit `loop_detected: bool` and `rate` (per minute) signal. The authoritative read.
4. **PM2 log roll-rate** - if logs roll faster than ~5min cycles, there's an active loop. If they have hours of accumulated content, there is not.

The lifetime restart count is a sunk number. It only becomes signal when paired with a recent timestamp (e.g. "lifetime count jumped by N in the last hour").

## Do

- Always read uptime + `auto_restart_last_at` + `restart_loop_detector` BEFORE classifying restart-loop severity
- When `pm2 list` shows high restart count, ask "is the process currently up? for how long?" not "wow, that's a lot of restarts"
- When dispatching a fork against a "restart loop", include the rate evidence in the brief so the fork can verify the premise
- If the brief's premise turns out to be stale, the fork's correct response is to surface the staleness in the FORK_REPORT (which fork_mowkasur_95685e did correctly, 8 May 2026)

## Do not

- Treat `pm2 list` restart count as a real-time rate
- Classify a restart loop as P1 from lifetime count alone without a rate probe
- Dispatch a fork against an already-resolved incident because the lifetime counter still looks alarming
- Re-ship a "fix" for a problem that was already fixed (this is the worse failure mode - the fork would have committed something on top of d7b8388 that wasn't needed)

## Verification protocol

```bash
# Before classifying any "restart loop" P1:
pm2 list | grep -E "uptime|↺"  # uptime column matters more than ↺
# Cross-reference:
psql ... -c "SELECT key, value, updated_at FROM kv_store WHERE key IN ('auto_restart_last_at','health.restart_loop_detector')"
# Sustained uptime + old auto_restart_last_at + loop_detected=false = no active loop
```

## Origin

8 May 2026 16:38 AEST. Conductor saw `pm2 list` showing ecodia-api uptime 109s with restart count 6483, classified as a P1 "restart loop killing every long fork", and dispatched fork_mowkasur_95685e for a real RCA. The fork investigation (655s, 35 tools) found the brief's premise was STALE: commit d7b8388 (Tate's earlier fix) had already resolved the loop. Hard evidence: `kv_store.auto_restart_last_at` unchanged since 2026-05-08T00:47Z (4h BEFORE d7b8388 deployed at 03:59 UTC), zero `auto_restart` incidents post-deploy, `health.restart_loop_detector` reported `loop_detected=false rate=0.0207/min`, current process uptime 22min stable. The "6483" was the lifetime restart counter accumulated from the entire history of the process, not a current-rate signal. The 109s uptime I saw was a normal post-deploy state during a healthy session, not a loop.

The fork did the right thing: surfaced the staleness in its [FORK_REPORT] rather than fabricating a "fix" for an already-fixed problem.

Cost: one bounded P1 fork (~11min, 35 tools). Mitigated by the fork being able to verify and bail rather than ship redundant work. Real cost = the conductor turn-token to write a wrong-premise brief, which would have been zero with a 5-second rate probe.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the meta-rule (probe ground truth before propagating "X is broken/shipped")
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` - companion rule on stale readings
- `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md` - when several rows reference the same root, scope-narrow before dispatching against each

---
triggers: cron-fires-during-warmup, pm2-restart-cron-collision, post-restart-cron-window, cron-spawn-error, fork-spawn-error-7s, scheduler-warmup-grace, phase-g-double-fire, scheduler-poll-uptime-gate, warmup-collision, restart-cron-race, pm2-warmup-window, cron-fork-error-on-restart
status: archived
archived_at: 2026-06-02
archived_reason: Rule is load-bearing on dead ecodia-api PM2 host + schedulerPollerService fork-spawn substrate. Crons now route via ecodia-scheduler MCP -> dispatch_worker.
superseded_by: scheduler-substrate-unification-spec-2026-06-02.md
---

# Cron fires during PM2 warmup must fail soft, not silently kill the dispatched work

## The rule

When `ecodia-api` (PM2-managed host process) restarts, there is a warmup window of approximately 30 seconds during which subsystems (Postgres pool, Redis, Neo4j driver, fork dispatcher, MCP HTTP perimeter) are still initialising. A cron fire that lands inside this window will dispatch a fork whose spawn errors within ~7 seconds because the API surface the fork talks to is not yet up. The cron row is then marked complete (`last_run_at` updates), the fork row is marked errored, and the cron's intended deliverable silently dies.

The remediation is two-sided. The scheduler poller MUST observe a warmup grace period and skip cron fires that land inside it (deferring to the next poll cycle). Independently, the fork dispatcher MUST classify spawn-errors that land inside the first 30 seconds of process uptime as `warmup_collision` rather than `fork_error`, requeue the originating cron's prompt at the next poll cycle, and emit a status_board P3 row only if the same cron warmup-collides three days running.

## Do

- Gate `schedulerPollerService.fireTask` on `process.uptime() >= 30` (configurable via env `SCHEDULER_WARMUP_GRACE_SECONDS`; default 30). If the gate fails, log `[SCHEDULER] skipping fire of <task_id> during warmup window (uptime=<n>s)` and let the next poll cycle handle it.
- Classify spawn-errors observed within the first 30 seconds of `process.uptime()` as `warmup_collision`. The spawn-error timestamp vs uptime is the only reliable signal; HTTP error codes alone are ambiguous because perimeter responses look identical to genuine 500s.
- Requeue the cron's intended work on warmup-collision detection. If the fire was a one-shot delayed task, mark it for re-dispatch at next poll; if it was a cron, the next scheduled fire will re-attempt naturally - log the collision and exit clean.
- Track warmup collisions in kv_store (`ceo.scheduler.warmup_collisions.<date>` array of `{task_id, uptime_seconds, fork_id}`). If a single cron warmup-collides on three consecutive PM2 restarts, escalate to status_board P2 with `next_action_by=ecodiaos` ("scheduler warmup grace insufficient for <task>; investigate per-task initialisation requirement").
- For high-stakes crons whose deliverable cannot wait for the next poll cycle (rare, but e.g. invoice send, deploy verify), encode an explicit recovery path in the cron prompt itself ("if process.uptime() < 30 at fire time, sleep 30 and retry") rather than relying on the scheduler's gate alone.

## Do not

- Treat a 7-second-old fork-spawn-error as a fork bug. Forks need an alive API perimeter to dispatch; the perimeter being absent is an infrastructure event, not a fork failure.
- Aggressively retry the cron fire inside the warmup window. The retry will hit the same warmup wall. Backoff to the next poll cycle (typically 30s later) is the right backoff curve.
- Author per-task warmup grace tuning before observing repeated collisions on the same task. The default grace covers ~95% of cron-vs-warmup races; per-task tuning is over-engineering until a specific cron reproducibly fails the default.
- Mark the cron task `status='failed'` on a warmup collision. The task itself is fine; its scheduled invocation collided with infrastructure state. The next scheduled fire will land cleanly.
- Restart ecodia-api with `pm2 restart` during a known cron-fire window without first checking `os_scheduled_tasks WHERE next_run_at < NOW() + interval '60 seconds'`. If the next fire is imminent, defer the restart by one cycle (or pre-fire the cron manually post-restart).

## Detection (post-hoc audit)

To find historical warmup collisions:

```sql
-- Forks that errored within 30s of a known PM2 restart timestamp.
-- (PM2 restart timestamps come from /home/tate/.pm2/logs/ecodia-api-out.log
--  or the pm2 list "uptime" column captured at audit time.)
SELECT
  f.fork_id,
  f.started_at,
  f.error,
  t.name AS cron_name,
  EXTRACT(EPOCH FROM (f.started_at - p.restart_at)) AS seconds_after_restart
FROM os_forks f
JOIN os_scheduled_tasks t ON f.task_id = t.id
JOIN (VALUES ('2026-05-02T17:00:04Z'::timestamptz) /* paste known PM2 restart timestamps */) p(restart_at) ON true
WHERE f.started_at BETWEEN p.restart_at AND p.restart_at + INTERVAL '30 seconds'
  AND f.status = 'error'
ORDER BY f.started_at DESC;
```

A nonzero result means warmup collisions are occurring and the gate is either absent, mis-tuned, or being bypassed.

## Implementation reference

- `src/services/schedulerPollerService.js` `fireTask` (line 97 at time of authoring) is the gate site. The poll loop at line ~270 calls `fireTask` per overdue task; the uptime gate goes at the top of `fireTask` (or the top of the poll loop if the gate should also block essential-task fast-path at line ~260).
- The fork dispatcher's spawn-error handler classifies `warmup_collision` based on `process.uptime()` at the moment of spawn-error capture; the surface is whatever calls into `mcp__forks__spawn_fork` and observes the error (typically `forkService.js`).
- `kv_store.ceo.scheduler.warmup_collisions.YYYY-MM-DD` is the durable per-day log; the daily codification scan can read it to detect 3-consecutive-day collision patterns.

## Origin

2 May 2026, Phase G post-restart double-fire. PM2 natural restart at 17:00:04 UTC (May 2) collided with `daily-index-regen` cron fire at 17:00:10 UTC (~6 seconds into warmup). The fork dispatched (`fork_mool7spl_53f328`) errored within 7 seconds of spawn because the API perimeter was still warming up. A sibling fork (`fork_mool7snp_6eb7d1`) errored at the same time on the same warmup window for a different cron. Both errors looked like fork bugs in the rollup but were infrastructure-state events: cron fires straddled an infrastructure boundary mid-state-transition.

The downstream cost was nontrivial: `INDEX.md` regen failed silently, leaving 37% pattern drift visible to the next session's author audit. The audit ran 3 May, observed the drift, and dispatched manual recovery (fork_mopny871_37bdaf). The full chain of indirection makes the failure mode a doctrine candidate, not just an incident note.

A broader class lurks behind this specific instance: scheduled work crosses an infrastructure boundary mid-state-transition. Sibling cases include cron firing during a Factory commit window, cron firing during a database migration window, cron firing during a laptop-agent focus-collision window (the Cowork dispatch instance that originally illustrated this case is historical per tailscale-macro-replaces-cowork.md). This pattern documents the warmup-specific case; if more class instances accumulate, a meta-pattern for "scheduled work crosses infrastructure boundary mid-state-transition" should be authored.

Stamp: fork_mopny871_37bdaf, 3 May 2026 21:00 AEST. Audit input: `~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-03.md` Section 1.1.

## Cross-references

- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` - sibling. Covers the inverse case (don't restart while Factory queue is active); together they form the "PM2 restart hygiene" pair: don't restart during outbound work, AND tolerate cron fires during inbound warmup.
- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` - upstream cause. If this pattern is followed (no scheduled self-restart), the only PM2 restarts are ad-hoc deploys and manual recovery, both of which are short windows. The 30-second grace is calibrated to those short windows.
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` - downstream consequence. A warmup-collided cron with an unconditional deliverable will ALSO trigger silent-fire detection. The classifier should suppress the silent-fire P1 if the cron's last_run_at is inside a known warmup window.
- `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` - sibling classifier rule. Same family of detector logic; both rules feed the cron-silent-fire-detector's verdict pipeline.
- `~/ecodiaos/patterns/_archived/pre-stage-fork-briefs-before-session-killing-ops.md` - prevention. If you know a restart is imminent, pre-stage the brief so the post-restart cron fires against a known artefact, not a flying cold-start.

# Cron silent-fire remediation - 1 May 2026

Author: fork_momrvg5x_14ba6f
Status: minimal fix shipped via PR; this spec captures larger findings for conductor follow-up.

## Incident summary

Two crons fired today (last_run_at advanced) but did NOT do their work:
1. `autonomous-window-evening-sms` at 19:00:15 UTC (05:00 AEST 2 May per UTC; cron expression "daily 19:00 AEST" = 09:00 UTC). No SMS sent.
2. `claude-md-reflection` at 10:00:17 UTC = 20:00 AEST 1 May. No audit/edit forks dispatched (conductor manually dispatched audit at 20:19 AEST).

Both required conductor manual recovery. The system worked AS DESIGNED. The design itself is the bug.

## Root cause

Hypothesis classification: **C** (cron prompt routing classification + budget gate).

Path:
1. `schedulerPollerService.fireTask()` calls `cronForkDispatcher.dispatchCronAsFork(task)` for fork-eligible crons.
2. `dispatchCronAsFork()` calls `classifyCron(task.name)` which returns `low_priority_fork` for both crons (claude-md-reflection explicitly listed; autonomous-window-evening-sms not in any list, defaults to low).
3. `budgetGateDecision()` reads `kv_store.cowork.daily_fork_budget_remaining=0`, computes `ratio=0/100000=0`, returns `tier='emergency'` and `{allow:false, reason:'budget_emergency_low_priority_skipped'}`.
4. Dispatcher writes status_board P3 row "Cron budget exhausted" once per cron name (NOT EXISTS guard skips subsequent dupes), returns `{spawned:false}`.
5. Scheduler stamps `result={dispatched_as_fork:true, spawned:false, reason:'budget_emergency_low_priority_skipped'}` AND advances `last_run_at` AND increments `run_count`. From the schedule's perspective the cron "fired"; from the deliverable's perspective nothing happened.

Why budget was 0:
- `cowork-fork-budget-reset` cron fired at 10:09 AEST 1 May (daily 10:00 AEST), reset budget to 100000.
- Forks consumed 100000 over the next 5h27min. Budget hit 0 at 15:36 AEST.
- After 15:36, all LOW priority crons silently skipped: vercel-deploy-monitor 19:07, autonomous-window-evening-sms 19:00, claude-md-reflection 20:00.

This is normal budget behaviour. The bug is the classification: **mission-critical comms-to-Tate-during-autonomous-window was classified the same as deferrable doctrine work.**

## Minimal fix shipped (this PR)

Move three crons from LOW_PRIORITY_FORK_CRONS (or default-LOW) to HIGH_PRIORITY_FORK_CRONS in `src/config/cronPriority.js`:

| Cron | Old route | New route | Why HIGH |
|---|---|---|---|
| `autonomous-window-evening-sms` | low (default) | high | Mission-critical SMS during autonomous window. Tate is unreachable except by SMS - silently skipping breaks the only ground-truth signal that the system is alive. |
| `claude-md-reflection` | low (explicit) | high | Doctrine evolution is the core self-evolution mechanism. Silent skip = no doctrine learning that day. Audit fork is cheap (one fork, ~30s). |
| `vercel-deploy-monitor` | low (explicit) | high | Failed-deploy alerts; silent skip = client-visible breakage missed. |

Plus comment block documenting the Tate-comms doctrine (any cron emitting outbound signal to Tate must be HIGH).

## Findings deferred to conductor

### F1: comms-critical tier (P2)

Today HIGH and LOW are the only tiers. A "comms_critical" tier could:
- Always fire, even when budget=0 (already true for HIGH)
- Refund budget on completion (so a missed reset doesn't poison comms)
- Escalate to alternative channel on failure (if SMS fails, log to status_board P1 + secondary channel)

Effort: small (15-30 lines in cronPriority.js + cronForkDispatcher.js). Schedule: opportunistic.

### F2: status_board P3 visibility during autonomous window (P2)

`_writeBudgetExhaustedStatusRow()` writes a P3 row when a cron defers. P3 is below the conductor's autonomous-pilot attention surface (priority<=2 is what gets surfaced in evening SMS bodies and what shows in conductor briefings). During an autonomous window this means budget-exhaustion is invisible.

Two options:
- (a) Promote budget-exhaust rows for HIGH or comms-critical crons to P1.
- (b) Have `silent-loop-detector` cron query for `name LIKE 'Cron budget exhausted%'` rows and SMS Tate if any have `next_action_by='ecodiaos'` and `last_touched > NOW() - 30 minutes`.

Recommend (b) since (a) is already obviated by the minimal fix (HIGH crons no longer defer).

### F3: budget capacity tuning (P3)

Current default 100000 tokens/day depleted by 15:36 AEST. Options:
- Raise default (200k? 300k?)
- More frequent resets (every 6h instead of daily)
- Per-cron quotas

Need usage telemetry first. Schedule: 1-week observation, then propose.

### F4: classifyCron unknown-name behavior (P3)

Today unknown cron names default to `low_priority_fork`. This is conservative for resource consumption but dangerous for new comms crons that haven't been added to the HIGH list. Two options:
- Add a startup-time warning log when an unknown cron name is encountered.
- Add a smell-test pattern match: cron names matching `*-sms`, `*-tate-*`, `*-alert-*`, `*-briefing*` route to HIGH by default.

Recommend smell-test pattern match (lightweight, additive).

### F5: cowork-fork-budget-reset is direct_exec, not idempotent on its own (P3)

The reset cron is in `DIRECT_EXEC_CRONS`, meaning it POSTs to /api/os-session/message and relies on the conductor session to call `resetDailyBudget()`. If the conductor session is not actively executing tools, the reset never happens. The result `{accepted:true, status:streaming}` does not confirm execution.

Better: convert to a true direct-exec (shell_exec node script that calls cronForkDispatcher.resetDailyBudget directly). This is the same shape as `telemetry-dispatch-consumer` etc.

Effort: medium (new script in scripts/, wire into cron prompt).

## Out of scope this turn

Per brief constraints:
- No pm2_restart ecodia-api
- No push to main directly (PR only)
- No touching unrelated services
- Did not manually reset budget (recovery action; conductor's call)

Conductor follow-up:
- Merge PR
- Restart ecodia-api in controlled idle window to load new classification
- Optionally: manually reset budget now (`UPDATE kv_store SET value='{"remaining":100000}' WHERE key='cowork.daily_fork_budget_remaining'`) to give LOW crons immediate runway
- Review F1-F5 and prioritise

## References

- Code: `/home/tate/ecodiaos/src/config/cronPriority.js`, `/home/tate/ecodiaos/src/services/cronForkDispatcher.js`, `/home/tate/ecodiaos/src/services/schedulerPollerService.js`
- Related doctrine: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`, `~/ecodiaos/patterns/scheduled-prompt-cold-start-adequacy.md`, `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md`, `~/ecodiaos/patterns/scheduled-redispatch-verify-not-shipped.md`
- status_board P1: `cron-silent-fire-pattern-1-may-2026` (this fork updates with root cause + PR url)

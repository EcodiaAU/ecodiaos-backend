---
triggers: scheduler-health, scheduler-canary, cron-dupe-guard, duplicate-active-cron, uq_os_scheduled_tasks_active_cron_name, partial-unique-index-cron, failed-cron-triage, completion-report-in-last_error, misfiled-completion, signal-done-gap-triage, retry-churn, AllAccountsCappedError, capped-churn, zombie-lease-check, overdue-active-cron, department-canary-template, generic-heartbeat-surfacing, scheduler-department-spine
category: doctrine
facet: scheduler
binding: script=~/.ecodiaos/bin/scheduler-health.sh + SessionStart=knowledge-sessionstart + cron=daily-cron-corpus-health-audit
---

# Scheduler-health canary + the cron dupe guard (department-spine instance 2)

The scheduler department now runs the full REPORT + ACT + discriminating-probe spine, and duplicate active crons are structurally impossible at the DB layer.

## The guard

Partial unique index on the substrate, not discipline in the writers:

```sql
CREATE UNIQUE INDEX uq_os_scheduled_tasks_active_cron_name
ON os_scheduled_tasks (name)
WHERE status = 'active' AND type = 'cron' AND archived_at IS NULL;
```

Writer audit (2026-06-10): only `cowork.js /scheduler.cron` inserts `type='cron'` rows, blind-insert as active. The installer's cancel-by-name rides the MCP and silently no-ops during dispatch regressions; with the index, the recreate then fails LOUDLY with a 23505 instead of accreting a dupe. Probe that proved it: a duplicate insert of a live cron name died on the named constraint. Delayed/checkpoint writers are untouched (index is cron-scoped).

## The canary (REPORT, daily 09:25, launchd au.ecodia.scheduler-health)

`~/.ecodiaos/bin/scheduler-health.sh` - branch-independent home, system binaries only (curl + python3), Postgres DIRECT via the Management API with the local PAT. Heartbeat-first to `~/.local/state/ecodiaos/scheduler-health-heartbeat.json`. Checks: guard index present, duplicate actives, live failed rows, zombie leases (>6h), overdue actives (>2h past next_run_at), fire liveness (>3h = dead poller), and retry churn split into two shapes that need DIFFERENT responses:

- `retry_churn` (non-cap errors, >3 alarms): the spawn-but-never-bind shape; probe `coord.signal_bound` before rows exhaust to failed.
- `capped_churn` (AllAccountsCappedError, >8 alarms): usage caps exhausted; self-heals at reset, but the backlog thundering-herds when it clears.

The canary's FIRST armed run caught the live 2026-06-10 condition (9 capped tasks) and forced the split - an alert that names the wrong cause is a wrong-path probe in alarm form.

## The triage rule (ACT, folded into daily-cron-corpus-health-audit)

A live `failed`/`orphaned` row whose `last_error` reads as a completion report ("shipped...", "duplicate, sibling landed...", "soak passed...") is the signal_done-to-poller gap wearing a failure status, not a failure. Reclassify `status='completed'`, `archived_at=now()`, move the report to `last_result`. A row whose work is genuinely undone (probe the deliverable, e.g. the helper file does not exist) gets re-queued: active, retry_count 0, lease cleared, next_run_at past the cap window. Never blind-reset the lot; the two cases are opposite actions on identical-looking rows.

## The template contract (for the next department)

Ship a canary that writes `{last_run, status, alerts}` to `~/.local/state/ecodiaos/<dept>-heartbeat.json` and the M2 knowledge-sessionstart generic reader surfaces it at session start with ZERO hook edits (alert -> alarm; >36h stale -> dead-man alarm; unreadable -> broken-canary alarm). Knowledge and scheduler are instances 1 and 2; finance, clients, comms, code follow the same shape.

## Anti-patterns

- Blind-resetting failed rows without reading last_error (loses the completed/undone distinction).
- Counting retry churn as one signal (cap exhaustion and bind-gap need opposite responses).
- Putting the canary inside the scheduler it checks, or inside the repo working tree a sibling can flip.

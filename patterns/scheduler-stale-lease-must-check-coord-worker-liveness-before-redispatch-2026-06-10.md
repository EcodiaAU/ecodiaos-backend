---
name: scheduler-stale-lease-must-check-coord-worker-liveness-before-redispatch
description: The laptop-agent scheduler's stale-lease recovery loop must consult coord.list_workers per row before re-dispatching, defer/fail-marking, or freeing the lease. A row whose previous lease expired by clock time can still have an alive worker tab heartbeating against it (cold-start binds, signal_bound paste race, long-running paste-and-prep stage). Re-dispatching while a worker is still live thunders the herd.
triggers: stale lease, max retries exhausted, thundering herd, sibling worker, dispatch dupe, coord.list_workers, schedulerPollerService, scheduler.js, leased_by, leased_at, retry_count, STALE_DISPATCHING_MS, MAX_RETRY_COUNT, hasLiveWorkerForTask, telemetry-batch, staleLeaseRecovery
binding: script=/Users/ecodia/.code/eos-laptop-agent/tools/scheduler.js
status: active
---

# Rule

In `staleLeaseRecovery` in `eos-laptop-agent/tools/scheduler.js`, every retry-exhausted branch must call `hasLiveWorkerForTask(row.id)` BEFORE issuing the `UPDATE` that frees `leased_by` / `leased_at`. If any worker on that `task_id` is still heartbeating within `STALE_WORKER_LIVENESS_MS` (180s, matches the cowork heartbeat cadence and the cold-start signal_bound p90), SKIP the update and leave the lease intact. Do NOT free the lease, do NOT write `last_error`, do NOT increment `retry_count`. The live worker will signal_done and `markComplete` will close the row on its own poll.

# Why

**Incident 2026-06-10T04:23Z.** The telemetry-batch cron (row b4474169-91ed-44f6-929e-0f6a8dd6ab37) fired and the first worker tab took 30-90s to signal_bound under sonnet cold-start. `STALE_DISPATCHING_MS` was breached. The stale-lease branch issued a bulk `UPDATE status='active'` (cron-defer branch), freeing the lease. The next dispatch poll re-leased the same row and spawned a second worker. Then a third. Then a fourth. All four dispatched within 4 minutes, all on the same task, all racing the same substrate.

Concrete waste per redundant tab:
- $0.02-0.10 of model tokens for the cold-start brief read.
- 50-200MB of IDE memory (each Claude Code chat is a webview).
- One extra Postgres roundtrip + one rotateAndConsume cycle (file rename).

Substrate trail: `os_scheduled_tasks` showed `run_count=6, retry_count=0` (the cron-defer branch reset retry_count each pass), `last_error="stale lease - max retries exhausted (cron: deferred to next interval per doctrine)"`. The kv_store key `cowork.telemetry.batch.last_run` at 2026-06-10T04:32:00Z carries the full incident timeline.

# How to apply

1. The scheduler now ships `hasLiveWorkerForTask(taskId)` (scheduler.js around line 590). It calls `coord.list_workers({})` and filters client-side by `task_id` because `list_workers` does not accept a `task_id` parameter (the brief assumed it does; the route schema disagrees, verified 2026-06-10).
2. Both branches (cron-defer at 2a, non-cron-fail at 2b) now call `hasLiveWorkerForTask(row.id)` inside the per-row loop. Branch 2b was converted from a bulk `UPDATE` to `SELECT` + per-row `UPDATE` so the gate could route per task_id.
3. Coord injection seam: `scheduler._setCoord(stub)` for tests. Default = the directly-required `./coord` module.
4. Fail-open on coord errors: if `coord.list_workers` throws, `hasLiveWorkerForTask` returns `null` and the existing recovery UPDATE fires. Rationale: a stuck recovery loop is worse than a single thundering re-dispatch, and coord-down is itself a paged-alert situation.

# Anti-patterns

- **Freeing the lease "just to be safe" while a worker is still bound.** The lease IS the mutex. If you free it, the next poll WILL race. The only correct response to a live worker on an expired lease is "extend my patience, do not act".
- **Hardcoding the liveness window below the slowest observed cold-start.** The cowork heartbeat cadence is the floor; cold-start p90 + spike margin is the ceiling. Numbers under 180s will mis-classify slow binds as dead and re-dispatch them.
- **Filter by `task_id` server-side without verifying the API supports it.** `coord.list_workers` only accepts `include_dead`; everything else is client-side filter. Always grep `routes/mcpCoord.js` or `tools/coord.js` before assuming a query param exists.
- **Skip the cron-defer or non-cron-fail UPDATE entirely on coord error.** Fail-open is correct; fail-closed strands rows forever if coord crashes.

# Related

- [[scheduler-spine-and-dupe-guard-2026-06-10]] (DB-side unique index kills cron dupes; this fix kills re-dispatch dupes upstream of the index)
- [[recurring-drift-extends-existing-enforcement-layer]] (the right shape for this fix is to extend the existing stale-lease branches, not bolt a new layer)
- [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] (sibling invariant: cron rows defer, never permanently fail)
- [[scheduler-signal-done-status-must-survive-coord-to-inbox-2026-06-09]] (companion path: the coord-to-inbox signal_done must survive too, else the stale-lease loop is the only safety net)
- [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]] (precursor: cold-start floors were already known to need padding; this fix is the scheduler-side cousin)

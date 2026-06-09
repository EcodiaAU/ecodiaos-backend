---
triggers: spawn-a-worker, spawn-worker-now, parallel-dispatch, parallelism-reflex, dispatch_worker, forks_spawn, forks.spawn, fork-spawn, conductor-parallelism, schedule_delayed, scheduler.delayed, schedule-delayed, self-schedule-now, fan-out-now, second-chat, hand-off-to-fresh-chat, multi-tab-coordination, sub-chat, async-task-dispatch, run-in-the-background, ide-tab-spawn, cc-tab-spawn, background-fork, ephemeral-fork, ephemeral-worker
load_bearing: true
status: active
created_at: 2026-06-09
supersedes_at_conductor_surface: dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md, forks_spawn-on-ecodia-code-connector
---

# `scheduler.delayed` is the conductor's parallelism entry

## The rule

When work calls for a fresh Claude Code chat tab from a conductor session, the reflex is `mcp__ecodia-scheduler__schedule_delayed` with `delay: "in 1m"`. Not `cowork.dispatch_worker` directly. Not `forks_spawn` on `ecodia-code` (dead since the laptop-agent migration). Not "open Cmd+Alt+Shift+C manually and paste a brief".

## Why

The dispatch substrate has two layers and the conductor only talks to the outer one.

- **Conductor surface** (what you call): `scheduler.delayed` / `scheduler.cron` on the `ecodia-scheduler` connector. Inserts a row into `os_scheduled_tasks` in Postgres. Returns immediately. The conductor turn ends.
- **Laptop-agent surface** (under the hood, do not call directly): the scheduler poller, also living on the laptop-agent, leases due rows from `os_scheduled_tasks` and POSTs each one to `http://localhost:7456/api/tool` with `tool: 'cowork.dispatch_worker'`, which opens a fresh CC chat tab in VS Code Stable via the Mac `Cmd+Alt+Shift+C` keystroke and pastes the brief. The fresh tab then heartbeats and signals back via 8 `coord.*` MCP tools on `localhost:7456`.

The conductor is on the wrong host to spawn a tab directly (it is in a Claude Code session itself); the laptop-agent is the only process that owns the keystroke + clipboard substrate. Calling `cowork.dispatch_worker` directly from the conductor only works if you bridge to the laptop-agent over HTTP with the agent's Bearer token. The `scheduler.delayed` path is the supported indirection that handles that bridge for you, plus persistence in `os_scheduled_tasks` so the dispatch survives conductor restart.

## How to apply

For a one-shot worker:

```
mcp__ecodia-scheduler__schedule_delayed({
  name: 'descriptive-task-name-2026-06-09',
  delay: 'in 1m',
  prompt: '<full self-contained brief; pasted verbatim into the fresh CC chat>'
})
```

For a recurring worker, `schedule_cron` with `schedule: "every 2h"` / `"daily 09:00"` instead.

The brief is the prompt the fresh CC tab will see prepended with `[SCHEDULED: <name>]`. It must be self-contained (the fresh tab has zero prior context). State files + paths + status_board ids + verify gates + the final `coord.close_my_tab` call explicitly. See `scheduled-prompt-cold-start-adequacy.md` for the 5-gate check.

Workers signal back via:
- `coord.signal_done({task_id, result_summary, terminate: true})` at the end of the brief
- `coord.heartbeat()` at start of each turn
- `coord.send_message({to: 'chat.conductor.inbox', body: {...}})` for mid-run reports
- `coord.close_my_tab()` as the final act (avoids tab accumulation)

The conductor receives results via `coord.read_inbox()` or `coord.wait_for_inbox({timeout: 300})`.

## What to NEVER call directly from the conductor

These all surface in legacy doctrine + cached tool lists but are dead at the conductor surface as of 2026-06-09:

- `mcp__ecodia-code__forks_spawn` / `mcp__ecodia-code__forks_list` (removed from `ecodia-code` connector manifest 2026-06-09; backing routes in `src/routes/mcp/cowork.js` still respond for in-flight legacy Routines, but no narrow connector surfaces them)
- `cowork.dispatch_worker` direct POST from the conductor (only sensible from the laptop-agent itself; the `mcp__ecodia-scheduler__*` tools wrap this for you)
- Manual `Cmd+Alt+Shift+C` paste of a brief in VS Code (works, but bypasses the scheduler row + ack-timeout + orphan detection)

If you find yourself reading `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md` or `dispatch-worker-runtime-semantics-2026-05-26.md`, those patterns describe the under-the-hood worker semantics correctly. They are not the conductor's entry.

## Anti-patterns

- **Reaching for `forks_spawn` because the tool name shows up in `tools/list`.** As of 2026-06-09 it is no longer in the `ecodia-code` connector's tools array; if a cached connector still surfaces it, ignore the entry and use `scheduler.delayed`.
- **Calling `scheduler.delayed` then expecting the worker to be spawned synchronously.** The poller leases due rows every 30 seconds. Fastest end-to-end latency is `delay + 0..30s polling + 30s..4min cold-start MCP load in the new tab`.
- **Writing a brief that assumes prior context.** The fresh tab sees only `[SCHEDULED: <name>] <brief>`. Anything you do not put in the brief is lost. See `scheduled-prompt-cold-start-adequacy.md`.
- **Skipping `coord.close_my_tab()` at the end of the brief.** Tabs accumulate. The IDE eventually chokes.
- **Treating worker dispatch as reliable today.** The signal_bound P1 regression (`status_board b22cc8dd`) means workers sometimes spawn but never heartbeat. For one-shot destructive ops (force-push, mass file rewrite, irreversible state changes), inline conductor execution is often safer until the regression is closed. For routine fan-out where a missed fire is recoverable (status sweep, email triage, audit pass), `scheduler.delayed` is still the right call - the orphan-detection loop catches dead spawns within 180s and `redispatch_on_orphan: true` retries once.

## Cross-refs

- `self-scheduling-via-scheduler-delayed-mcp-2026-05-27.md` (deferred follow-ups; same primitive, longer delay)
- `scheduling-is-0th-class-primitive-2026-05-28.md` (the broader "schedule everything" doctrine)
- `scheduled-prompt-cold-start-adequacy.md` (brief content rules)
- `ecodiaos-autonomy-architecture-2026-06-08-mac-canonical.md` (where this sits in the 6 autonomy primitives)
- `scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.md` (why the poller dispatches via `cowork.dispatch_worker` not the dead `/api/os-session/message` queue)
- `dispatch-worker-runtime-semantics-2026-05-26.md` (laptop-agent-internal semantics; not conductor-surface)
- `coord-conventions-heartbeat-signal-done-2026-05-18.md` (worker-side protocol)
- `worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28.md` (pass `worker_acknowledgment_timeout_ms: 180000` when bridging directly)

## Origin

2026-06-09. Conductor reached for `mcp__ecodia-code__forks_spawn` to spawn a redaction worker on the Ordit public-repo cleanup arc. Tate caught it: _"There's no such thing as forks anymore and ecodia-code mcp might even be deprecated. You're supposed to use the scheduler. That documentation needs to be cleaned."_ Conductor pivoted to `scheduler.delayed`. Tate caught again: _"Hold on your worker hasnt actually spawned. You need to use whatever the cron jobs are using to spawn. Then update the documentation."_ Trace revealed `schedulerPollerService.fireTask` POSTs to laptop-agent `/api/tool` with `tool: cowork.dispatch_worker`; the conductor-surface entry is `scheduler.delayed`. The cached doctrine surfacing `cowork.dispatch_worker` as a conductor reflex was the misleading layer. This pattern is the rectification.

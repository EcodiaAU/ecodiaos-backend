---
name: scheduler-poller-must-dispatch-worker-not-os-session-message
description: schedulerPollerService.fireTask currently POSTs scheduled prompts to /api/os-session/message (deprecated, no auth header, 401s every fire). Must route to cowork.dispatch_worker on the laptop-agent so scheduled fires actually spawn a worker tab.
triggers: schedulerPollerService, fireTask, scheduler-fire, os-session-message, scheduler-routing, scheduler-deprecated-path, scheduler-401, scheduler-no-auth-header, scheduler-delayed-not-spawning, scheduling-substrate-fix
load_bearing: true
status: active
created_at: 2026-05-28
---

# schedulerPollerService must dispatch workers, not POST to os-session/message

## The rule

`schedulerPollerService.fireTask` (D:/.code/EcodiaOS/backend/src/services/schedulerPollerService.js line 329) currently POSTs scheduled prompts to `http://127.0.0.1:3001/api/os-session/message` with `{ message, source:'scheduler' }` and NO auth header. The os-session route is the deprecated conductor surface (Tate uses Claude Code IDE + Claude mobile + SMS per the 2026-05-17 local-first migration, not the osSession HTTP frontend), and the route requires auth the poller doesn't send, so every fire returns `{"error":"Missing or invalid authorization header"}`.

The fix: route scheduled fires to `cowork.dispatch_worker` on the laptop-agent (`http://100.114.219.69:7456/api/tool` over Tailscale, or `http://127.0.0.1:7456` from Corazon). The scheduled prompt body becomes the worker brief. The worker spawns a real Claude Code chat tab, executes the brief, signals done, closes its own tab.

```
const token = fs.readFileSync('~/.ecodiaos/laptop-agent.token', 'utf8').trim()
const dispatchRes = await fetch('http://100.114.219.69:7456/api/tool', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    tool: 'cowork.dispatch_worker',
    params: {
      task_id: task.name,
      brief: prompt,
      worker_acknowledgment_timeout_ms: 180000   // see worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load
    }
  }),
  signal: AbortSignal.timeout(300_000)
})
```

## Why

Verified e2e 2026-05-28 09:37 AEST. Scheduled task `cowork.scheduling-vps-fire-validation-2026-05-28` fired on time (`last_run_at: 09:38:03Z`, 19s after the 09:37:44Z target, within the 30s poller cycle). Result field captured the 401 response from the os-session route. No worker tab spawned. The user observed: "1m scheduled chat didnt spawn".

The os-session route was the right substrate before the 2026-05-17 local-first migration when EcodiaOS had a long-running conductor session hosted on the VPS. Post-migration, the conductor lives in Claude Code IDE tabs on Corazon, spawned per-task by cowork.dispatch_worker. The poller wasn't updated.

The substrate that DOES work (verified 2026-05-28 09:27-09:30 AEST): direct local `cowork.dispatch_worker` HTTP -> Claude Code chat tab spawns in VS Code Stable -> first heartbeat at 84.5s -> worker writes verification file -> coord.signal_done -> coord.close_my_tab -> terminated_at set.

## How to apply

Three sub-steps for the substrate fix:

1. **Patch fireTask** (D:/.code/EcodiaOS/backend/src/services/schedulerPollerService.js):
   - Replace the os-session/message POST with the dispatch_worker POST above.
   - Read the laptop-agent bearer from `~/.ecodiaos/laptop-agent.token` on the VPS (file lives on Corazon; symlink or read via Tailscale-side cache).
   - Preserve the `cronForkDispatcher` route for cron tasks classified as `HIGH_PRIORITY_FORK_CRONS` / `LOW_PRIORITY_FORK_CRONS` (those run as ephemeral forks, not worker tabs).
   - Keep the `CONDUCTOR_CRONS = {meta-loop}` exception only if the meta-loop legitimately needs to land in a conductor chat (review separately).

2. **Reachability fallback.** If the laptop-agent at `100.114.219.69:7456/api/health` doesn't respond, fall back to a status_board P2 row + dedupe. Don't silently re-queue. Cron-fire-must-have-deliverable-not-just-narration.md applies: a fire that lands nowhere is a failure, not a success.

3. **Doctrine update.** When the patch ships, update self-scheduling-via-scheduler-delayed-mcp-2026-05-27.md to drop the "lands in conductor chat" framing and describe the worker-spawn flow.

## When NOT to apply

Crons classified as `HIGH_PRIORITY_FORK_CRONS` / `LOW_PRIORITY_FORK_CRONS` go through `cronForkDispatcher` (per crons-route-to-forks-by-default.md). Those route to ephemeral SDK forks, not worker tabs. This patch only touches the delayed-task / conductor-cron path. Cron routing logic stays as-is.

## Cross-refs

- [[scheduling-is-0th-class-primitive-2026-05-28]]
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- [[self-scheduling-via-scheduler-delayed-mcp-2026-05-27]] - update when patch lands
- [[crons-route-to-forks-by-default]] - preserve this routing
- [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load]] - mandatory 180s in the new POST
- [[verify-deployed-state-against-narrated-state]] - parent rule
- [[cron-fire-must-have-deliverable-not-just-narration]] - applies to scheduled fires too

## Origin

2026-05-28 19:38 AEST. First end-to-end validation attempt of the scheduling 0th-class primitive. Direct local dispatch_worker passed cleanly at 19:27. Scheduler-fired dispatch failed at 19:38 because the poller routed to a deprecated auth-broken surface. Tate verbatim "1m scheduled chat didnt spawn" was the symptom; the result-field 401 was the root cause.

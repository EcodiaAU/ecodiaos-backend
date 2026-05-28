---
name: worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load
description: cowork.dispatch_worker's default worker_acknowledgment_timeout_ms of 90s is too tight - cold MCP load observed at 84.5s, leaving zero headroom for memory pressure or stalls. Pass 180000 (180s).
triggers: dispatch_worker, worker_acknowledgment_timeout_ms, ack-timeout, cold-mcp-load, first-heartbeat, mcp-cold-start, orphan-classification, dispatch-best-practice, worker-spawn-latency, memory-pressure-spawn
load_bearing: true
status: active
created_at: 2026-05-28
---

# cowork.dispatch_worker ack timeout: 90s default is too tight, pass 180000

## The rule

Always pass `worker_acknowledgment_timeout_ms: 180000` to `cowork.dispatch_worker`. The 90s default leaves zero headroom over the observed cold-MCP-load first-heartbeat latency.

```
cowork.dispatch_worker({
  task_id: "...",
  brief: "...",
  worker_acknowledgment_timeout_ms: 180000   // 180s, not the 90s default
})
```

## Why

Verified e2e 2026-05-28 19:27-19:30 AEST on a healthy spawn:
- registered_at: 09:27:59.424Z
- first heartbeat ack: 84563ms (84.5s) after registration

A new Claude Code chat tab loads ~13 MCP connectors before its first tool call. 84.5s is the OBSERVED floor on a healthy machine with no memory pressure. Under any of:

- Memory pressure (Corazon at 88% RAM, common on long Tate sessions)
- Network jitter on Tailscale
- One extra MCP server in the chain
- A flaky account chain swap

the first-heartbeat latency easily breaches 90s and the dispatcher classifies the spawn as orphan-tab, returns `ok:false`, and the caller has to redispatch or pass `redispatch_on_orphan: true`. The redispatch path is doing real work twice for what was actually a healthy spawn.

90s default was set during the substrate ship (2026-05-18 14:38 AEST) when MCP connector count was lower. The connector surface has grown. The default is now functionally a tripwire.

## How to apply

Three places this matters:

1. **Hand-coded dispatch calls.** Always pass `worker_acknowledgment_timeout_ms: 180000`. Higher (300000 = 5min) is fine for known-heavy briefs but 180s covers the cold-MCP-load floor cleanly.
2. **VPS-poller-triggered dispatches.** When `schedulerPollerService.fireTask` is patched to invoke `cowork.dispatch_worker` (per scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.md), the call MUST pass 180s.
3. **Local scheduler dispatches.** `D:/.code/eos-laptop-agent/tools/scheduler.js::dispatchOne` invokes dispatch_worker. The dispatch call must pass 180s (or higher when SCHEDULER_ENABLED ships to production).

The DEFAULT in `cowork.js` should be raised to 180000 as well, but until that ships every caller carries the override.

## Substrate fix on the agenda

Change `DEFAULT_WORKER_ACK_TIMEOUT_MS` from 90000 to 180000 in `D:/.code/eos-laptop-agent/tools/cowork.js`. Restart the laptop-agent. Update the orphan-detection patch-note in the dispatch-worker pattern.

## Cross-refs

- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- [[scheduling-is-0th-class-primitive-2026-05-28]]
- [[cowork-kill-worker-tab-handle-from-foreground-after-spawn-unsafe]] - orphan cleanup is the failure mode this prevents
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]] - any cowork.js edit needs an agent restart to land

## Origin

2026-05-28 19:27 AEST e2e validation of the scheduling 0th-class primitive. First dispatch attempt at 19:12 went orphan at OOM. Second attempt at 19:27 succeeded with ack at 84.5s, then the worker wrote its file, signaled done, and self-closed by 19:30. The 84.5s number is the ground truth - 90s would have classified this healthy spawn as orphan if any of the other latency sources had added 6+s.

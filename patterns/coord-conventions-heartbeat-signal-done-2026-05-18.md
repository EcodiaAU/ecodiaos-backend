---
triggers: coord-heartbeat, heartbeat-protocol, signal-done, signal_done, terminate-worker, worker-protocol, worker-conventions, coord-send-message, coord-read-inbox, coord-wait-for-inbox, conductor-inbox, worker-inbox, scratch-topic, message-routing, ack-message, in-critical-section, mid-write-protection, sweeper-skip, worker-discipline
---

# Coord conventions: heartbeat, signal_done, terminate, topic routing

Operational protocol for workers dispatched via [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]. Every worker follows the same shape so the conductor can rely on it without per-task wiring.

## Substrate prerequisite — MCP schema passes ctx args through (patched 2026-05-18 17:30 AEST)

Before 17:30 AEST 18 May 2026 the coord.* MCP tools only declared per-tool properties in `inputSchema.properties`; `tab_id` / `tab_credential` were absent except on `register_conductor` / `unregister_conductor`. Even though `additionalProperties: true` was set, MCP clients treat `inputSchema.properties` as the allowlist for what they actually send — so passthrough `{tab_id, tab_credential}` got stripped on the way to the laptop-agent route, and `extractCtx` returned undefined. Every worker call returned `tab_id required`.

Fixed in `routes/mcpCoord.js` by injecting a shared `CTX_PROPS` block into every coord.* tool's schema after the `TOOLS` const (`Object.freeze` is shallow). Heartbeats, send_message, signal_done, wait_for_inbox — all coord.* tools now pass passthrough args through to the route. Verified end-to-end by smoke-patch1-heartbeat 2026-05-18 14:42 AEST (worker called heartbeat with passthrough args, dispatcher detected the heartbeat-advance in 44.8s, signal_done landed cleanly).

Generalised in [[mcp-schemas-must-explicitly-declare-passthrough-ctx-args-2026-05-18]].

## Worker discipline (every turn)

1. **Turn-start heartbeat.** First tool call of every turn: `coord.heartbeat({status: 'short summary of what I'm about to do'})`. This refreshes `last_heartbeat_at` so the sweeper doesn't kill the tab.
2. **Work.** Execute the brief.
3. **Turn-end heartbeat OR signal_done.**
   - If the task is incomplete: `coord.heartbeat({status: 'about to wait for next instruction'})` then call `coord.wait_for_inbox()` to long-poll for direction.
   - If the task is complete: `coord.signal_done({task_id, result_summary, result_pointer?, terminate: true})`.
4. **Critical sections.** If a turn includes a multi-step write that must not be interrupted (multi-file refactor, multi-row DB update), bracket it with `coord.heartbeat({in_critical_section: true})` at start and `coord.heartbeat({in_critical_section: false})` at end. The sweeper respects this flag.

## signal_done with terminate=true

`terminate: true` sets the worker's `terminated_at` field, marking it dead in `coord.list_workers`. The tab itself stays open until the sweeper closes it (or you close it explicitly). Use `terminate: false` when the worker should remain alive for follow-up instructions on the same task_id.

`result_summary` should be the human-readable one-liner ("PR pushed to feat/foo @ <sha>; deploy READY at <url>"). `result_pointer` should name a durable substrate where the full output lives (file path, status_board row id, kv_store key, neo4j node id). Don't dump huge bodies into `result_summary`.

## Topic routing rules

- `chat.conductor.inbox` - the main conductor (no tab_id). Anyone can write here, this is the upward channel. Don't poll it from a worker - it's not your inbox.
- `chat.<tab_id>.inbox` - a specific tab's inbox. Workers read their own (`chat.<your_tab_id>.inbox`) to receive instructions. Conductor writes here to send direction.
- `chat.<tab_id>.scratch` - private scratchpad for a tab. Read/write your own only. Conductor doesn't read scratch topics; they're for the worker's own breadcrumb trail across turns.
- `task.<task_id>.events` - public per-task event stream. Anyone watching the task subscribes; anyone working on it writes progress here.

## ack_message

When you action a message addressed to your inbox, call `coord.ack_message({id, action_summary: 'what I did'})`. This records `acknowledged_at` so the sender knows the message landed AND has a one-line trail of the response. Acking is not the same as `seen_at` (which `read_inbox` sets automatically) - ack is a deliberate "I acted on this."

## Conductor side

- `coord.read_inbox()` - pull all unread, mark seen, process. Fast, fire-and-forget.
- `coord.peek_inbox()` - same as read_inbox but does NOT mark seen. Use for non-consuming probes (wait-loops, observer flows). The next read_inbox caller still sees the message.
- `coord.wait_for_inbox({timeout: 300})` - long-poll. Blocks up to 600s for the next message. Returns `trigger_message` + up to 20 `also_unread` + `more_unread: bool` flag if the bus flooded.
- `coord.list_workers({include_dead: false})` - see who's alive. `stale_ms > 90000` means dead (no heartbeat in 90s).

## Conductor anti-pattern: shallow polling instead of long-poll

When you dispatch a worker and want to know when it's done, **use `coord.wait_for_inbox`** (or compose `gui.sequence` with a `wait_for {type: 'coord_inbox_has', body_contains: <task_id>}` step). DO NOT shallow-poll with bash loops that fire `coord.read_inbox` every few seconds.

Reasons:
1. **You'll miss the signal.** Bash polling that fires every 8s with 4-min worker spin-up means 30+ shallow probes. Each must hit the right moment. Easy to forget the next poll and miss the message entirely (the message lands silently, you find out 30min later when something else surfaces it). Long-poll holds the request open server-side until the message arrives.
2. **read_inbox marks seen.** Each shallow poll consumes whatever's there. If you forget the message you got, it's gone (well - in the audit log but not "unread"). peek_inbox + manual ack is the safer pattern, but wait_for_inbox is better because it's atomic.
3. **You'll dispatch a worker, get busy with something else, and forget you were waiting.** The long-poll forces you to deal with the message immediately when it arrives. Shallow polling lets you context-switch away.

Origin: bit me on 2026-05-18 night - dispatched Worker B v3 with a real audit task, signal_done landed in conductor inbox at 13:16, I didn't see it until ~13:20 when Tate asked "why didn't you get it." Worker had completed cleanly + signaled correctly; the failure was on my side (the conductor side), shallow polling instead of long-polling.

## Don't

- Don't poll `read_inbox` in a tight loop from a worker. Use `wait_for_inbox` (long-poll, server-side wait).
- Don't write messages to topics you don't own (other workers' scratch, other workers' inbox).
- Don't pass huge JSON bodies through `coord.send_message`. The body persists to disk; large blobs slow inbox reads. Use `result_pointer` to a file/row instead.
- Don't forget the turn-end heartbeat or signal_done. Workers without recent heartbeat get killed by the sweeper (5min freshness window).
- Don't call `coord.signal_done` without `task_id`. The conductor's filter logic depends on task_id correlation.

## Sweeper interaction

The cursor-preview-extension sweeper at `backend/laptop-agent/cursor-preview-extension/sweeper.js` honors the worker registry: ANY `.spawned` or `.heartbeat` marker in `coordination/state/` with mtime <5min suspends the entire sweep cycle. So fresh workers are safe. Workers that haven't heartbeated in >5min may be killed mid-thought - so heartbeat religiously.

## Substrate

- Tools: [tools/coord.js](D:/.code/eos-laptop-agent/tools/coord.js)
- MCP shim: [routes/mcpCoord.js](D:/.code/eos-laptop-agent/routes/mcpCoord.js)
- Connector config: workspace `.mcp.json` `coord` entry
- Reference architecture: [[reference-coord-bus-local-2026-05-18]]

## Origin

2026-05-18, paired with [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]. Conventions follow OC's pre-dark spec (heartbeat at turn-start + turn-end, signal_done({terminate}), sweeper-skip via role=worker) with the addition of the per-call ack_message protocol and the in_critical_section bracket flag.

---
triggers: dispatch-worker, dispatch_worker, coord-primitive, 0th-class-primitive, parallel-work-cc, multi-tab-coordination, sequential-pipeline, batch-work-cc, delegate-to-another-chat, another-chat-can-handle, background-work-stream, async-work-stream, new-cc-tab, claude-code-new-chat, ctrl-alt-shift-c, cowork-dispatch, worker-tab, conductor-worker, inter-chat-coordination, ide-tab-is-fork, fork-replacement, parallelism, sequence-of-tasks, project-broken-into-phases, hand-off-to-fresh-chat, spawn-cc-chat, cc-tab-spawn, coord-bus, coord-substrate
---

# `cowork.dispatch_worker` is a 0th-class primitive for inter-CC-tab coordination

When work calls for a fresh Claude Code chat tab (parallelism, sequencing, phase decomposition, "let me hand this off and keep going") the reflex is `cowork.dispatch_worker`. Not "open Ctrl+Alt+Shift+C manually and paste a brief." Not "queue it in my context and do it sequentially." Not "ask Tate to open another chat."

This is paired with [[reflex-is-0th-class-primitive]] (reflex.fire) and [[ide-tab-is-the-new-fork-mechanic-2026-05-17]] (the why-tabs-not-SDK-forks doctrine). Dispatch_worker is what makes that doctrine reflexive instead of manual.

## When to reach for it (without asking)

- A piece of work naturally splits into independent streams that can run in parallel - dispatch one worker per stream.
- A project breaks into sequential phases where each phase is its own arc - dispatch the next-phase worker when the current phase completes.
- A long-running task would otherwise pollute the conductor's context (massive grep, multi-file refactor, mechanical bulk work).
- You want a "second chat" to handle a specific sub-domain (the rest-of-the-project handoff pattern).
- A batch of similar items (10 files to refactor, 5 clients to email, N rows to audit) - dispatch one worker per item, or one batched worker.
- An audit / verification pass that runs alongside the conductor's main work.
- Hand-off at end of a context arc - dispatch a fresh worker with the in-flight state captured in the brief, terminate the current conductor turn.

## When NOT to use it

- In-session bounded work that fits in <5 tool calls - just do it on main, dispatch overhead isn't worth it.
- Work that needs to mutate the conductor's own in-flight state (a worker can't reach into your context).
- Anything Tate is actively driving turn-by-turn - dispatching a worker mid-conversation steals focus and confuses the human-in-the-loop.

## The shape

```
cowork.dispatch_worker({
  ide: 'cursor' | 'stable' | 'insiders',  // cursor is the only one with the keybinding currently wired
  task_id: '<stable id you'll use to correlate>',
  brief: '<full self-contained brief; identity is auto-prepended>',
})
```

Returns: `{ok, tab_id, tab_credential, registered_at, task_id, tab_handle, brief_file_audit, ...}`. Brief auto-written to `D:/.code/EcodiaOS/coordination/briefs/<task_id>.md` for audit + recovery.

Brief structure (the dispatch primitive adds identity + constraints automatically):
1. **What** - the deliverable, concrete and falsifiable.
2. **Where** - file paths, repo, branch, kv_store keys, status_board rows.
3. **How** - the approach if non-obvious, or "use your judgment" if you trust the worker model.
4. **Done condition** - what `result_summary` should look like, what `result_pointer` to set.

Workers inherit identity (tab_id, tab_credential, task_id, inbox topic) from the auto-prepended header.

## How conductor receives results

- `coord.read_inbox()` - pull all unread messages addressed to `chat.conductor.inbox` (marks them seen).
- `coord.wait_for_inbox({timeout: 300})` - long-poll up to 600s for the next message. Returns trigger + up to 20 also_unread.

Workers signal `done` via `coord.signal_done({task_id, result_summary, result_pointer?, terminate: true})`. The message body shape: `{type: 'done', task_id, result_summary, result_pointer, terminate}`.

## Conventions

See [[coord-conventions-heartbeat-signal-done-2026-05-18]] for the worker-side protocol (heartbeat at turn-start + turn-end, signal_done + terminate=true at completion, scratch-vs-conductor-inbox topic rules).

## First-turn latency caveat

Workers can take 30s-4min on their first turn because the new CC tab loads ~13 MCP connectors before its first tool call. This is NOT a failure - just wait. Subsequent turns within the same worker are fast.

## What this supersedes

- "Open a fresh Claude Code chat tab manually via Ctrl+Shift+P -> `Claude Code: New Chat`" - the canonical guidance in CLAUDE.md until 2026-05-18. Still works but is now the manual fallback, not the default.
- "SDK forks" (`mcp__forks__spawn_fork`, manager forks) - dead since the local-first migration ([[ide-tab-is-the-new-fork-mechanic-2026-05-17]]).
- Task subagents within the current session are still valid for bounded in-session lookup work - NOT replaced by dispatch_worker.

## Substrate

- Dispatcher: [tools/cowork.js](D:/.code/eos-laptop-agent/tools/cowork.js) `dispatch_worker()`
- Spawn mechanic: Ctrl+Alt+Shift+C in Cursor (Tate-configured editor-tab keybinding, [[reference-editor-area-claude-code-chat-keybinding]])
- Registration: synchronous, conductor-side, `/api/comms/register-worker` on laptop-agent port 7456
- Inter-tab messaging: 8 `coord.*` MCP tools at `http://localhost:7456/api/mcp/coord`
- Persistence: file-backed at `D:/.code/EcodiaOS/coordination/{workers,messages,inbox,state}/`
- Full architecture: [[reference-coord-bus-local-2026-05-18]]

## Origin

2026-05-18 00:30-01:00 AEST. OC went dark mid-build of the VPS PG + LISTEN/NOTIFY coord architecture; Tate ("you take over"). Local file-backed v1 shipped in 17min, smoke-passed end-to-end (worker `tab_1779064982618_c97aa12a` dispatched at 00:43:02, called `coord.signal_done` at 00:46:52). Tate verbatim 01:00 AEST: "coordination between chats is unbelievably important for sequencing, task managing, sequential work, big projects" → codify as 0th-class.

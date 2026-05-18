---
name: ide-tab-is-the-new-fork-mechanic-2026-05-17
description: After the local-first migration, parallel work is spawned by opening a fresh Claude Code chat tab in VS Code Stable / VS Code Insiders / Cursor. SDK forks, manager forks, FORK_REPORT, os_forks - all dead.
triggers: ide-tab-fork, new-chat-tab, ctrl-shift-p-new-chat, parallel-work-local-first, sdk-forks-deprecated, manager-forks-deprecated, fork-mechanic-replacement, claude-code-new-chat, vscode-cc-tab, cursor-cc-tab, spawn-new-session, cross-tab-coordination, coordination-thread, sister-session, peer-tab, tab-as-fork, local-first-parallelism
metadata:
  type: doctrine
  status: active
  authored_at: 2026-05-17
  supersedes: fork-by-default-stay-thin-on-main, manager-forks-for-multi-worker-decomposition, fork-result-fallback-must-be-marked, fork-pending-work-at-session-start-not-after-probing-on-main, sdk-mcp-server-instances-must-be-per-query-not-singleton, sdk-musl-vs-glibc-binary-auto-detect-trap, continuation-aware-fork-redispatch
---

# IDE tab is the new fork mechanic (post local-first migration)

## The rule

Parallel work is spawned by **opening a fresh Claude Code chat tab** in one of the three IDEs running on Corazon: VS Code Stable, VS Code Insiders, or Cursor.

- The previous SDK fork primitive (`mcp__forks__spawn_fork`, manager forks, sub-forks, `[FORK_REPORT]`, `os_forks` table, `forkService.js`) is **dead**. It required the VPS as the agentic runtime and we no longer use the VPS that way.
- The Task tool / Claude Code sub-agent surface is **still alive** and is the right primitive for short bounded research / lookup work that should stay inside the current session's context.
- Anything substantive enough to deserve its own thread, its own context window, its own conversation arc with Tate - **open a new tab**.

## The substrates that ARE alive

| Surface | Use |
|---|---|
| **Current session** | Main thread of work. The conductor surface Tate is talking to right now. |
| **Task subagent** (Agent tool / Task tool) | Bounded research, file lookup, parallel codebase grep. Returns one message back into this session. Ephemeral. |
| **New CC chat tab** (Ctrl+Shift+P -> `Claude Code: New Chat` in VS Code / Cursor) | Substantive parallel work needing its own context arc. Peer to current session. |
| **Anthropic Routines** | Scheduled or webhook-fired cloud sessions on tate@ / code@ / money@. Cron / inbound-email / Stripe / Vercel / Apple-ASN. |

## The substrates that are DEAD

- `mcp__forks__spawn_fork`, `mcp__forks__list`, `os_forks` table-as-control-plane
- Manager fork / sub-fork hierarchy with per-tree cap
- `forkService.js`, `forkComplete-cleanup` listener, `[FORK_REPORT]` envelope
- The `<forks_rollup>` continuity block as a live state pane
- SDK musl-vs-glibc binary auto-detect doctrine (only mattered for SDK forks)
- Per-tree 5/5 cap doctrine

These are not "deprecated, may come back." They are **gone**. The substrate they sat on (VPS-as-agentic-runtime) is not coming back.

## How to spawn a new tab manually (the human path)

1. In any of VS Code Stable / VS Code Insiders / Cursor: `Ctrl+Shift+P`.
2. Type "Claude Code: New Chat" (or the IDE's equivalent - usually appears at the top of the palette).
3. Press Enter. A new chat session opens.
4. Paste the brief. Send.

The new session starts cold but loads:
- The same auto-memory at `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/`.
- The same workspace `CLAUDE.md` chain (user-global + workspace + backend).
- The same MCP servers from `.mcp.json`.
- The same hooks from `~/.claude/hooks/ecodia/`.

The new session does NOT inherit this session's conversation history. Brief it like a fresh colleague who has the same doctrine but none of the same context.

## How to spawn a new tab autonomously (the macro path - ALREADY SHIPPED 2026-05-16)

The reflex substrate at `D:/.code/eos-laptop-agent/tools/reflex.js` IS the autonomous-spawn path. It exposes:

- `reflex.fire({ prompt, source, idempotency_key?, editor?, auto_submit?, spawn_window_if_missing?, dry_run? })` - the firing primitive. AHK v2 macro: `WinActivate "Visual Studio Code"` -> `Ctrl+Shift+P` -> "Claude Code: Open in New Tab" -> Enter -> clipboard-paste prompt -> optional Enter. End-to-end ~3.3s.
- `reflex.fire_if_clear({ ... })` - same, but skips fire if Tate's foreground window is not in the editor whitelist (defer-or-park for low-priority scheduled reflexes).
- `reflex.foreground_window()` - read-only Win32 GetForegroundWindow probe.
- `reflex.list_mouths()` - discover live Claude Code windows via `~/.claude/ide/<port>.lock`.
- `reflex.last_fires({ limit? })` - rolling audit log (capped at 500 entries) at `~/.claude/ecodia-reflex-log.json`.

Call surface: `POST http://100.114.219.69:7456/api/tool` with `Bearer ${kv_store.creds.laptop_agent.agent_token}` and body `{tool: "reflex.fire", params: {...}}`.

Multi-account routing via the `editor` param:
- `vscode` (default) -> tate@ecodia.au (VS Code Stable)
- `vscode-insiders` -> money@ecodia.au (VS Code Insiders) [Phase 2 prereq: Insiders not yet installed on Corazon as of 2026-05-16]
- `cursor` -> code@ecodia.au [Phase 2 prereq: Cursor + extension verification pending]

Full doctrine: [[corazon-reflex-substrate-vscode-claude-code-tab-2026-05-16]]. First webhook consumer: `src/routes/smsWebhook.js` (commit `53d200d5`).

When I need to spawn parallel work autonomously: write the brief (include the coordination substrate row id), call `reflex.fire`, the new tab opens with the brief pre-filled and `auto_submit: true` runs it immediately. The new session inherits the workspace CLAUDE.md + auto-memory at session-start.

The Tate-spawn path (he hits Ctrl+Shift+P manually) is still the right path when (a) reflex agent is unreachable, (b) the work needs Tate's visual review before launching, or (c) focus collision would be too disruptive for the priority.

## Coordination between sister tabs

Sister tabs do NOT share context. Coordination is **substrate-mediated**, not in-memory.

Coordination substrate (to be built): `coordination_threads` table on Postgres. Schema:

```sql
CREATE TABLE coordination_threads (
  id uuid primary key default gen_random_uuid(),
  parent_session_id text,      -- which session opened the thread
  child_session_id text,       -- which session is doing the work
  brief text not null,
  status text not null default 'open',  -- open|in_progress|done|aborted
  artifacts jsonb default '[]'::jsonb,   -- file paths, PR URLs, status_board row ids
  result text,                 -- final summary
  opened_at timestamptz default now(),
  last_updated_at timestamptz default now(),
  closed_at timestamptz
);
```

Protocol:
1. Conductor INSERTs a row, gets back `id`.
2. Conductor briefs the new tab with `id` included. Brief states: "Write your progress and final result to `coordination_threads.id = <id>` via the existing MCP `db_execute` tool. Final result goes in `result` field, status to `done`."
3. New tab does the work, writes back, exits.
4. Conductor polls `coordination_threads` by id (or reads it on next turn).

Until `coordination_threads` ships, lighter-weight substrates:
- A file at `backend/coordination/<id>.md` that the child appends to.
- A `kv_store` row at `kv_store.coordination.<id>`.
- A `status_board` row tagged `coordination_thread` (heavyweight, only for work that's also tracked work).

## Anti-patterns

- **Do not narrate a fork**. "I'll spawn a manager fork to handle the audit" is fiction now. Either open a tab (or ask Tate to) or do it in this session.
- **Do not write `[FORK_REPORT]` envelopes**. Nothing parses them anymore.
- **Do not poll `os_forks`** as if it were live state. The table is historical.
- **Do not invoke `mcp__forks__*` tools** even if the schema is still listed. The Routine that backs them is gone.
- **Do not assume coordination context propagates**. Every cross-tab handoff goes through a named substrate row.

## When to use which surface

| Work shape | Surface |
|---|---|
| "What does this code do?" / single-file analysis | Current session, maybe a Task subagent for the lookup |
| "Find all references to X and tell me which are stale" | Task subagent, returns once |
| "Build feature Y across 4 files" | Current session if it's the only thing in flight, otherwise new tab |
| "Audit the whole listener tier and fix what's dead" | New tab. Substantial own-context work. |
| "Ship the Co-Exist iOS release while I keep doing [redacted]-archival in this session" | New tab. Two parallel arcs. |
| "Wake me up at 9am every day with a briefing" | Routine (not a tab) |
| "When an email arrives from Tate, prepend the last N SMS exchanges and start a chat" | Routine + coordination substrate (when shipped) |

## Origin

Tate verbatim 2026-05-17 (this session): "You no longer have any fork mechanic or cap, since we've migrated to local-first claude code interactive sessions as your substrate across VS Code stable, insiders and cursor, its jsut opening a new cc chat via the ctrl shift p and open in in new tab or whatever, that should have been codified yesterday im pretty sure."

The "should have been codified yesterday" is the second-order doctrine point: when a substrate migration this large lands, the fork doctrine should be the first thing torn out, not the last. See [[world-model-staleness-needs-active-reconciliation-2026-05-17]].

## How to apply

Before any phrase like "I'll fork", "let me spawn a manager fork", "I'll route this to a worker", "the fork will report back" - stop. Ask: is this work small enough to stay in this session? If yes, do it here. If no, either open a tab yourself (the Tate-spawn path) or write the brief to the coordination substrate and ask Tate to open the tab.

The presence of `mcp__forks__*` in the deferred-tools list is a relic. Treat it as you would a deprecated API: don't call it, even if the IDE autocompletes it.

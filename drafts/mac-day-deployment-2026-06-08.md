# Mac mini deployment - 2026-06-08

## Status: scheduler running, dispatch blocked on stale VS Code bridge

The scheduler poller is alive on Mac. Dispatch attempts reach the IDE bridge
but the bridge returns 404 because the running VS Code instance (PID 20635,
port 7457) activated against an older copy of `ide-bridge.js` before the
`~/.vscode/extensions/ecodia.preview-0.1.0` symlink was updated.

Reload-window will fix it but kills the current Claude Code session.

## What landed (all changes on disk, agent restarted twice)

| File | Change | Why |
|---|---|---|
| `/Users/ecodia/.code/eos-laptop-agent/.env` | `SCHEDULER_ENABLED=true`, added `COORD_ROOT=/Users/ecodia/.ecodiaos/coordination` | Scheduler poller didn't start; Windows COORD_ROOT path doesn't exist on Mac. |
| `/Users/ecodia/.code/eos-laptop-agent/tools/cowork.js` | `COORD_ROOT` reads env var first, falls back to platform-aware default. Windows hardcode preserved when env var unset. | Cross-platform without breaking Corazon. |
| `/Users/ecodia/.code/eos-laptop-agent/tools/mac-dispatcher.js` | NEW. Implements `dispatch_worker` via `ide.chat_send_message({submit:true})` (extension-host space, no AHK). Re-exports `kill_worker` / `cleanup_orphan_workers` from cowork.js. | cowork.js dispatch is AHK + Win32 + Code.exe matching; pure-Windows. mac-dispatcher uses the bridge's extension-host populate-and-submit, no OS keystroke. |
| `/Users/ecodia/.code/eos-laptop-agent/index.js` | When `process.platform === 'darwin'`, injects mac-dispatcher via `scheduler._setDispatcher()` before `scheduler.start()`. | Wires the Mac dispatcher into the existing scheduler injection seam without touching cowork.js. |
| `/Users/ecodia/.code/eos-laptop-agent/tools/creds.js` | `pick_healthiest_account` returns `'current-process'` when `CREDS_DIR` is absent or has no per-account JSON files. `rotate_to('current-process')` is a no-op. | `D:/PRIVATE/ecodia-creds/{tate,code,money}.json` isn't transferred to Mac yet. Bootstrap mode: dispatch on the currently-loaded account in `~/.claude/.credentials.json`. Once Tate transfers `D:/PRIVATE` and `CREDS_DIR` is set, full rotation comes back. |
| `~/.vscode/extensions/ecodia.preview-0.1.0` | Symlink to `/Users/ecodia/.code/ecodiaos/backend/cursor-preview-extension` (has the `ide-bridge.js` with `chat/send_message` route). | Bridge wasn't installed. |
| `/Users/ecodia/.ecodiaos/coordination/{briefs,state,workers,messages,inbox,conductors}` | Created. | COORD_ROOT pointed here. |

## Cron resume state

- 74 corpus rows still hold `last_status = 'paused'` (the early `schedule_resume` MCP calls today reported success but did not propagate — under investigation; the underlying SQL on the agent looks correct).
- One row (`laptop-agent-pulse`, id `c6ec0a2f-7231-4182-aebe-69004f1b10ca`) was direct-UPDATE'd to `last_status = NULL, next_run_at = NOW()` and the scheduler did pick it up — confirms the poller is live. Dispatch failed at the bridge 404.
- `app-store-review-watch` stays paused (CDP-deferred; Mac CDP via `applescript.launch_cdp_chrome` is alive, but the dedicated install of this cron hasn't happened).

## To finish post-window-reload

1. Tate (or future session): `Cmd+Shift+P → Developer: Reload Window` in VS Code.
2. Probe `ide.list_instances` returns count >= 1 with `port: 7457` (or new port) and the bridge GET /ide/routes returns 200 with a route list.
3. Re-`UPDATE` `laptop-agent-pulse` to last_status=NULL + next_run_at=NOW. Within 30-60s the scheduler dispatch picks it up, spawns a CC chat tab in VS Code, the worker calls coord.heartbeat. Verify via `mcp__ecodia-core__coord_list_workers` + the `os_scheduled_tasks` row's `dispatched_tab_id`.
4. Bulk-resume the remaining 73 corpus rows (29 Phase 1 + 25 Phase 2 + 19 Phase 3). The simplest path: a `node` one-liner that runs the same UPDATE SQL the schedule_resume MCP tool runs, scoped by name list. Direct DB write rather than the MCP tool, since the MCP tool's update is somehow getting reverted.
5. Install `app-store-review-watch` (CDP-dependent, now unblocked since Mac CDP is alive).
6. Write the Mac-day Neo4j Decision + status_board row.

## Open follow-ups (not blocking)

- `D:/PRIVATE/ecodia-creds` transfer from Corazon. Once landed, set `CREDS_DIR` in `.env` and remove the `current-process` fallback bypass.
- Investigate why earlier `schedule_resume` MCP tool calls didn't propagate `last_status = NULL` despite returning `Next run: now.` The agent code reads correct, the row update may have been pre-restart with stale code.
- The Windows-only `gui.enable_chrome_cdp` tool needs a Mac branch (or be deprecated in favor of `applescript.launch_cdp_chrome`).

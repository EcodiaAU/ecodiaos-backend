---
name: idle-claude-code-tab-sweeper-2026-05-17
description: Idle Claude Code chat tabs in VS Code Stable / Insiders / Cursor are auto-closed by the Ecodia Preview extension after a TTL window of no activity, driven by a Stop-hook heartbeat plus VS Code tab focus events.
triggers: idle-chat-tab, chat-tab-pile-up, tab-cleanup, sweeper, claude-code-tab-sweep, idle-sweeper, stop-hook-heartbeat, ecodia-preview-extension, chat-heartbeat, tab-tracker, telegram-fire-tab-cleanup, sms-fire-tab-cleanup, vscode-tab-close, reflex-fire-cleanup
---

# Idle Claude Code tab sweeper - Stop-hook + extension TTL close (2026-05-17)

## Problem
Every inbound SMS / Telegram message fires `reflex.fire` on the laptop-agent, which opens a fresh Claude Code chat tab in VS Code Stable / Insiders / Cursor. Tabs never close. Over a day they pile up, eventually crashing the IDE or polluting the tab bar to the point of unusable.

## Architecture (V1)

Three components:

**1. Stop hook** - `d:/.code/EcodiaOS/backend/.claude/hooks/chat-heartbeat.js`
Fires when the assistant finishes a turn. Writes to `~/.ecodia-preview/chat-heartbeats.json`:
```json
{ "sessions": { "<CLAUDE_SESSION_ID>": { "last_stop_at": "ISO", "cwd": "...", "pid": ... } } }
```
Registered as `Stop` hook in `d:/.code/EcodiaOS/backend/.claude/settings.json`.

**2. Sweeper module** - `d:/.code/EcodiaOS/backend/laptop-agent/cursor-preview-extension/sweeper.js`
Loaded by the Ecodia Preview extension on activate. Tracks per-tab activity via `vscode.window.tabGroups.onDidChangeTabs` + `onDidChangeActiveTab`. Runs sweep every 90s.

A Claude Code tab is closed when ALL of:
- it is a Claude Code webview tab (viewType contains `claude-vscode` / `claude-code` / `claudeChat`, or label starts with "Claude Code"), AND
- it is NOT currently active (user isn't looking at it), AND
- its last in-extension activity is older than TTL_MIN (default 8 min, env `ECODIA_CHAT_IDLE_TTL_MIN`), AND
- the tab's workspace has NOT had a Stop-hook fire within the TTL window.

**3. Extension wiring** - `d:/.code/EcodiaOS/backend/laptop-agent/cursor-preview-extension/extension.js`
- On activate: `loadSweeper().init(vscode)` starts the tracker + 90s interval.
- New endpoints (alongside existing `POST /open-preview`):
  - `POST /sweep-claude-tabs` - manual sweep (`{dryRun: true}` for inspection)
  - `GET /list-claude-tabs` - enumerate Claude Code webview tabs in this window
- On deactivate: `sweeperHandle.dispose()` clears interval + unsubscribes events.

## How to apply

When this surfaces, check:
- `~/.ecodia-preview/chat-heartbeats.json` exists and is fresh (last entry within last few min if any chat just finished a turn). Empty / stale = Stop hook isn't firing - check `.claude/settings.json` has the `Stop` hook entry and the hook file exists.
- Hit `GET http://127.0.0.1:<port>/list-claude-tabs` against each instance in `~/.ecodia-preview/instances.json` to see what each IDE sees.
- For manual sweep test: `POST /sweep-claude-tabs` with `{"dryRun": true}` - returns what *would* be closed without actually closing.

## Live-loading discipline

The extension's `extension.js` is loaded ONCE at IDE start. Editing it does NOT take effect until the IDE window is reloaded (Ctrl+Shift+P → "Developer: Reload Window"). The `router.js` and `sweeper.js` files are `delete require.cache`-hot-loaded on every request, so logic changes inside them DO take effect immediately. Put all hot-tunable logic in `router.js` / `sweeper.js`, not `extension.js`.

## V1 limitations to accept

- Workspace heartbeat applies to ALL Claude Code tabs in that workspace. If two CC chats share a workspace and one is abandoned, the other's activity keeps the abandoned one alive until BOTH go idle. Acceptable for V1 - Tate's pain is total tab count, not surgical preservation.
- Tab identification relies on label + viewType + viewColumn (VS Code tabs don't expose a unique ID). Edge collisions possible.
- "Active tab" = user focused on it in this VS Code window. If Tate alt-tabs away from the window entirely, all tabs in it become inactive - but they're still kept alive by the workspace-recent-stop check until TTL elapses since the last Stop fire.

## Future tightening (not in V1)

- Pass a unique chat ID via `reflex.fire` → CC env → Stop hook → sweeper, so sweep can target the exact tab spawned by a specific reflex fire.
- "Cleanup on exit" path: when `reflex.fire` is called with `idempotency_key=tg-...` (SMS / Telegram), enqueue an automatic close-after-N-min for the spawned tab, not based on Stop hook.
- Pin protection: respect `tab.isPinned` as "never close" - already implicit (active tab refresh) but worth making explicit if Tate uses pinned tabs.

## Origin

Tate verbatim 2026-05-17 05:19Z via Telegram: *"every text opens a new chat on vsc stable, but those chats are never closed, so eventually they're going to be full to the brim, needs to close the chat after it's done."* Built same-conversation per `codify-at-the-moment-a-rule-is-stated-not-after.md` after Tate pushed back at 05:21Z on a status_board-and-defer response: *"could've actually started building but you didn't?"*

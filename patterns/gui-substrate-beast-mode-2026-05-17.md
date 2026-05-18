---
name: gui-substrate-beast-mode-2026-05-17
description: 109-tool GUI substrate covering Chrome (cdp.*), VS Code Stable + Insiders + Cursor (vscode.*), Cursor-specific chat (cursor.*), File Explorer (explorer.*), all desktop windows (window.*), and any UIA-accessible Win32/Electron app (uia.*). All compose inside one gui.sequence batch. Pinnacle GUI capability.
metadata:
  type: feedback
triggers: beast-mode-gui, 109-tools, vscode-stable-insiders-cursor, uia-bridge, explorer-tools, cdp-extended, window-foreground, gui-substrate-complete, gui-orchestrated-workflow, cross-app-batch, full-gui-coverage, $pid-pitfall, ps-automatic-variables
---

# GUI substrate beast mode (109 tools, full Windows coverage)

## Rule

The GUI substrate is no longer "Chrome only." Any task driving Windows GUI applications now has a typed-action interface at the right level of abstraction. Reach for the highest-level tool that fits:

- **Chrome / web pages:** cdp.* (21 tools) - DOM addressing, structured extraction, network capture, viewport control
- **VS Code Stable / Insiders / Cursor:** vscode.* (12 tools) - all three IDEs share keymaps; `ide: stable | insiders | cursor` selects the target
- **Cursor chat panel specifically:** cursor.* (7 tools) - open chat panel, send messages, inline edit, quick edit
- **File Explorer:** explorer.* (6 tools) - mostly keyboard-driven, plus a filesystem-level list_dir for read-only listings
- **Any visible Windows window:** window.* (3 tools) - foreground probe, window enumeration, focus-by-criteria
- **Any UIA-accessible Win32 / Electron control:** uia.* (5 tools) - find element by Name / AutomationId / ClassName, invoke (click), set value, tree-walk for discovery
- **Atomic batching:** gui.sequence wraps any combination above into one HTTP call

## Architecture (composable in one batch)

```json
{ "tool": "gui.sequence", "params": { "actions": [
  { "tool": "gui.launch_cdp_chrome" },          // ensure CDP up
  { "tool": "cdp.attach" },
  { "tool": "cdp.navigate", "params": {...} },
  { "tool": "cdp.queryAll", "params": {...} },  // extract structured data from web

  { "tool": "window.windows" },                  // enumerate desktop windows
  { "tool": "window.focus_window", "params": { "exe": "Cursor" } },
  { "tool": "vscode.open_file", "params": { "ide": "cursor", "path": "src/index.ts" } },
  { "tool": "vscode.go_to_line", "params": { "ide": "cursor", "line": 42 } },

  { "tool": "explorer.open", "params": { "path": "D:/.code/" } },
  { "tool": "explorer.list_dir", "params": { "path": "D:/.code/coexist" } },

  { "tool": "uia.find", "params": { "exe": "Code.exe", "name": "Explorer" } },

  { "tool": "screenshot.screenshot" }
] } }
```

ONE HTTP call. Multi-app orchestration. Returns one consolidated result with per-step status + final screenshot.

## Critical implementation pitfall discovered + fixed in this build

**PowerShell automatic variable shadowing.** `$pid` is a PowerShell automatic that always equals the current PS process PID. Using `$pid` as a `[ref]` target in `[void][WE]::GetWindowThreadProcessId($h, [ref]$pid)` SILENTLY does nothing (PS refuses to assign to the automatic) and every window report comes back with the PS process PID + exe name "powershell".

Fix: rename to `$winPid` (or any non-automatic name). Other automatics to avoid: `$args`, `$input`, `$null`, `$true`, `$false`, `$matches`, `$host`, `$home`, `$psversiontable`.

## Tool-by-tool catalogue

### Layer 1 - Batch (gui.sequence)
Already documented in [[gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17]].

### Layer 2a - Chrome DOM (cdp.* - 21 tools)
- Core: attach / detach / navigate / url / wait / runJs / click / text / queryAll / pageScreenshot / listTabs / selectTab
- Semantic: **clickText** (find-by-visible-text and click), **fillByLabel** (find form input by label/aria/placeholder/name and fill)
- Session control: **cookies** / **setCookie** / **viewport** / **scrollTo**
- Diagnostics: **networkLog** (capture request/response stream for a window) / **pdf** (export page as PDF base64)
- Power user: **send** (raw DevTools Protocol method passthrough - any CDP method + params)

### Layer 2b - VS Code family (vscode.* - 12 tools)
Param `ide: 'stable' | 'insiders' | 'cursor'` selects target. All keyboard-driven:
- Navigation: focus / open_file / command_palette / search_workspace / go_to_line / tab_through
- Editor actions: save / format / close_tab / toggle_sidebar
- Workflow: run_task / new_terminal

### Layer 2c - Cursor-specific (cursor.* - 7 tools)
Cursor's Claude Code panel + extra keymaps:
- focus / open_chat_panel (Ctrl+L) / new_chat_tab (Ctrl+Shift+L)
- send_chat / inline_edit (Ctrl+I) / quick_edit (Ctrl+K)
- dismiss (Escape)

### Layer 2d - File Explorer (explorer.* - 6 tools)
- UI: open (spawn at path) / focus / navigate (address bar) / search (Ctrl+E) / refresh (F5)
- Filesystem: **list_dir** (skip UI, just fs.readdir) - faster for read-only

### Layer 2e - Generic windows (window.* - 3 tools)
- **foreground** - what's the focused window right now (hwnd, title, className, pid, exe, exePath)
- **windows** - all visible top-level windows with metadata
- **focus_window** - bring a window forward by titleContains / exe / className

### Layer 2f - UIA bridge (uia.* - 5 tools)
PowerShell + System.Windows.Automation. Slower per-call than CDP but works for ANY desktop app that exposes accessibility info (File Explorer, Settings, Task Manager, native dialogs, most Electron apps):
- **windows** - enumerate UIA-visible top-level windows
- **tree** - dump accessibility tree of a window (depth-bounded)
- **find** - find element by Name / AutomationId / ClassName / ControlType
- **invoke** - find named element + invoke (click) via InvokePattern; falls back to SelectionItemPattern
- **set_value** - find named editable + set text via ValuePattern

### Layer 3 - Chrome bootstrap helpers (gui.* - 7 tools)
- focus_chrome / open_url / close_tab / switch_tab
- install_cdp_to_chrome (modify .lnk shortcut, runs once)
- **launch_cdp_chrome** (idempotent autonomous spawn of isolated CDP-Chrome on C:\eos-chrome-cdp)
- enable_chrome_cdp (legacy kill-and-relaunch, prefer install + launch)

## Smoke-verified during this ship

- window.foreground returns real exe/title/pid (post-$pid fix)
- window.windows enumerates all 11 visible windows with correct metadata (3 IDEs running simultaneously detected: Code, Code-Insiders, Cursor)
- explorer.list_dir reads filesystem directly (19 items in eos-laptop-agent/tools, listed in milliseconds)
- uia.windows enumerates 8 UIA-visible windows

## Cross-app demo capability

The substrate now supports flows like:
- "Read the latest commit on GitHub for `coexist`, look up the file Tate is editing in Cursor by inspecting Cursor's title bar, switch to Stable VS Code, open the same file there, screenshot" - all in one batch
- "Search Drive for 'Q3 plan', open the first hit in Chrome, extract DOM, then open File Explorer at the local mirror folder, then ping Cursor to start a new chat with the diff" - one batch
- "Probe network log of vercel.com/dashboard for 5 seconds, identify all API endpoints called, then drill into the slowest one with cdp.send raw devtools" - one batch

## Origin

2026-05-17 night session. Tate verbatim: "yeah now we need to do this for vscode stable, insiders, cursor, file explorer, extend chrome tooling, eveything. Im going to bed now but i want you to push this into oblivion so that its 100% comprehensive nad you can become an absolute BEAST, unparalelled."

42 new tools shipped autonomously while he slept. From 67 → 109 tools across 16 namespaces.

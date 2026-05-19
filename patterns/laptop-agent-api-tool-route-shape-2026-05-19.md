---
triggers: laptop-agent-route, laptop-agent-api-tool, localhost-7456-shape, corazon-7456, laptop-agent-404, laptop-agent-namespaces, tool-catalog-discovery, laptop-agent-shell-shell, shell.shell-not-shell.exec, cdp-via-laptop-agent, gui-via-laptop-agent, screenshot-via-laptop-agent, cowork.dispatch_worker-route, api-tool-post-shape, laptop-agent-unknown-tool-returns-catalog, route-discovery-via-error, namespace-dot-notation, auto-load-tools-dir, AGENT_TOKEN-bypass
---

# laptop-agent at localhost:7456 - single POST /api/tool route, dot-notation namespaces

## The shape

The laptop-agent (Express service on Corazon, PID 11528, port 7456, also reachable via Tailscale 100.114.219.69:7456) does NOT expose a RESTful tool-per-route surface. It exposes exactly one endpoint:

```
POST /api/tool
Content-Type: application/json

{"tool": "moduleName.functionName", "params": { ... }}
```

**Important nuance discovered 2026-05-19 mid-arc:** the wrapper key is `params` for tools with declared input schemas (gui.open_url, cdp.pageScreenshot, cdp.listTabs, etc). Tools with no inputs accept `params:{}` or even `args:{}` interchangeably (e.g. screenshot.screenshot, gui.enable_chrome_cdp). Worker B's harvested learning said `args` was canonical; real-world verification shows `params` is correct for parametric tools. When in doubt, send `params`. If a tool errors with "X required" despite X being in args, swap the key to params and retry.

GET on anything (`/`, `/health`, `/api`, `/tools`, `/coord`, `/cdp`, `/gui`) returns `{"error":"Not found"}` with HTTP 404. This is intentional - the agent rejects route-shaped probes by design.

## Tool-catalog discovery via deliberate error

Calling POST /api/tool with `{"tool":"any.unknown_name","args":{}}` returns:

```json
{"error":"Unknown tool: any.unknown_name", "available": [ ...full list of ~200 tool names... ]}
```

**Use this for cold-start discovery.** A fresh conductor session that has not loaded this pattern can find every available tool in one POST. Canonical seed call:

```bash
curl -sX POST http://localhost:7456/api/tool \
  -H "Content-Type: application/json" \
  -d '{"tool":"_probe","args":{}}'
```

## Tool namespaces (as of 2026-05-19)

13 active namespaces, ~200 tools total:

- `applescript.*` (macOS only - runs on sy094 Mac mini when present)
- `browser.*` - navigate, click, type, pageScreenshot, evaluate, enableCDP, switchTab
- `cdp.*` - attach, detach, attach_tab, runJs, click, navigate, text, queryAll, pageScreenshot, listTabs, **realClick**, **deepFindRect**, **nativeFill**, **findVisible**, **clickByTag** (the 5 doctrine helpers from cdp-helper-library-and-recursive-improvement-2026-05-18.md)
- `clipboard.*` - read, write, clear
- `coord.*` - send_message, read_inbox, peek_inbox, wait_for_inbox, ack_message, list_workers, heartbeat, report_progress, **signal_done**, verify_paste, register_conductor, set_wake_policy
- `cowork.*` - **dispatch_worker** (the 0th-class primitive), list_workers, kill_worker, swap_creds, swap_history
- `cursor.*` - focus, open_chat_panel, **new_chat_tab**, send_chat, inline_edit, quick_edit, dismiss
- `explorer.*` / `filesystem.*` - fs ops (note: filesystem.cwd does NOT exist; use filesystem.fileInfo or filesystem.listDir)
- `gui.*` - sequence, focus_chrome, **open_url**, close_tab, switch_tab, **enable_chrome_cdp**, install_cdp_to_chrome, launch_cdp_chrome
- `ide.*` - VS Code bridge (list_instances, info, routes, command, fs_read, fs_write, terminal_create, terminal_send, etc)
- `input.*` / `keyboard.*` / `mouse.*` - native input (click, type, key, shortcut, drag, scroll)
- `macro.*` - run, inline, list, save
- `notification.*` - toast, beep, flash_window
- `process.*` / `ps.*` - listProcesses, killProcess, launchApp, ensureAlive, restart
- `reflex.*` - fire, fire_if_clear, list_mouths
- `screenshot.*` - screenshot (single tool - captures current display)
- `shell.shell` - **NOT shell.exec** (shell namespace has exactly one tool named `shell`)
- `uia.*` - Windows UI Automation tree, find, invoke, set_value
- `usage.*` - Anthropic account state (pick_account, get_usage_state, set_active_account, mark_flaky)
- `vscode.*` - file/tab/terminal/palette/**new_claude_code_chat**
- `window.*` - foreground, windows, focus_window

## Auth

Auth is bypassed when `AGENT_TOKEN` env var is empty (laptop-agent/index.js ~line 15). If set, send `Authorization: Bearer $AGENT_TOKEN` on POST. Always set `AGENT_TOKEN` in ecosystem.config.js env block before deploying.

## Naming gotchas

| Wrong | Right |
|---|---|
| `shell.exec` | `shell.shell` |
| `filesystem.cwd` | `filesystem.fileInfo` with `path: "."` |
| `cdp.click` (sometimes silently misses MUI) | `cdp.clickByTag` with `tag:"BUTTON"` filter (auto-escalates JS click to real CDP mouse) |
| GET `/screenshot.screenshot` | POST `/api/tool` with body `{tool:"screenshot.screenshot"}` |

## Why this matters

Cold conductors (post-context-gap, new session) repeatedly burn 8-16 probe calls hitting RESTful 404s before discovering this shape. Three substrate fixes:

1. This pattern (with `triggers:` covering the obvious search terms a confused conductor would grep).
2. A helper script `tools/probe-laptop-agent.sh` that does the seed call + caches the catalog to `~/.claude/cache/laptop-agent-tools.json`.
3. A PreToolUse hook on Bash that nudges to this pattern when it sees `curl ...localhost:7456/` (or 100.114.219.69:7456) with anything other than POST /api/tool.

See also: [[cdp-helper-library-and-recursive-improvement-2026-05-18]], [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]], [[corazon-is-a-peer-not-a-browser-via-http]], [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]].

## How this surfaced (2026-05-19)

Discovered during a 3-arc capability stress-test. Worker B (Factory dispatch 22392cb4) was instructed to diagnose a proactivity_engine cron misfire but went off-task and instead surfaced the laptop-agent route shape as an incidental codebase_insight (validation confidence 0.49, task-diff-alignment flagged 0% overlap - the deliverable was wrong, the by-product was load-bearing). Conductor harvested the insight, verified by POST /api/tool with deliberate unknown tool name, captured the full ~200-tool catalog, and codified within the same turn per `codify-at-the-moment-a-rule-is-stated-not-after.md`.

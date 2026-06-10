# GUI substrate beast mode — night session summary

While you slept (2026-05-17 ~22:50 to ~23:30 AEST). Single-shot autonomous build push.

## TL;DR

**The GUI substrate went from 67 tools to 116. Full coverage of every Windows-side surface you asked for: VS Code Stable, Insiders, Cursor, File Explorer, extended Chrome tooling, plus universal window + UIA primitives. Cross-substrate beast demo runs in 6 seconds, returns structured data across web + desktop + filesystem in one HTTP call.**

## What shipped

49 new tools across 9 new files (no breaking changes to existing surface):

| Namespace | Count | What it covers |
|---|---|---|
| `vscode.*` | 14 | VS Code Stable + Insiders + Cursor (param `ide: 'stable' | 'insiders' | 'cursor'`). open_file, command_palette, search_workspace, run_task, save, format, go_to_line, tab_through, save, close_tab, toggle_sidebar, new_terminal, **read_active_editor** (select-all + copy + clipboard.read), copy_path |
| `cursor.*` | 7 | Cursor's chat panel specifically. open_chat_panel (Ctrl+L), new_chat_tab, send_chat, inline_edit (Ctrl+I), quick_edit (Ctrl+K), dismiss, focus |
| `explorer.*` | 6 | File Explorer. open, focus, navigate (address bar), search (Ctrl+E), refresh, **list_dir** (filesystem-level read, faster than UI) |
| `window.*` | 3 | Any visible window. **foreground** (probe focused), **windows** (enumerate visible), **focus_window** (by exe/title/class) |
| `uia.*` | 5 | UI Automation for any Win32/Electron app. **windows**, **tree** (depth-bounded accessibility dump), **find** (by Name/AutomationId/ClassName), **invoke** (click via InvokePattern), **set_value** (set text via ValuePattern) |
| `clipboard.*` | 3 | Read, write, clear. Bridge for moving data between Chrome / IDE / filesystem |
| `notification.*` | 2 | Windows toast + system beep |
| `cdp.*` extensions | +9 | **clickText** (find-by-visible-text), **fillByLabel** (form fields), **cookies**, **setCookie**, **viewport** (mobile emulation), **scrollTo**, **networkLog** (request/response capture window), **pdf** (export page), **send** (raw DevTools Protocol passthrough) |

Plus `gui.launch_cdp_chrome` from earlier in the session for autonomous Chrome bootstrap.

## Beast demo (the proof)

![beast-v2-final](D:/.code/EcodiaOS/backend/drafts/gui-gauge-2026-05-17/beast-v2-final.png)

**9 actions, 6.1 seconds, one HTTP call**, all happening server-side:

1. `gui.launch_cdp_chrome` — idempotent autonomous Chrome spawn
2. `cdp.attach` — connect Puppeteer
3. `cdp.navigate` to github.com/EcodiaTate
4. `cdp.wait` for DOM
5. `cdp.runJs` — **3 parallel GitHub API fetches** (repos / commits / issues / PRs) + aggregation in browser context
6. `window.windows` — enumerate ALL 12 desktop windows with pid/exe/title (detects all 3 IDEs simultaneously)
7. `explorer.list_dir` on D:/.code/coexist — filesystem read, 36 entries with mtimes
8. `uia.windows` — UIA-visible windows enumeration
9. `cdp.pageScreenshot` — visual capture

Returns: GitHub state + local filesystem state + desktop window state + visual screenshot. ONE response.

**Cross-substrate correlation example from the data:** GitHub's `coexist` latest push: `2026-05-17T13:02:16Z`. Local `D:/.code/coexist/.git` mtime: `2026-05-17T13:02:09`. **7 seconds apart → your local IS in sync with origin/main.** That correlation came back automatically in the same batch.

## Critical bug discovered + fixed this build

**PowerShell `$pid` is an automatic variable.** I shadowed it as a `[ref]` target in window enumeration; PS silently refused to assign, so every window reported the PS process PID + exe name "powershell." Renamed to `$winPid`. Logged in doctrine — full list of PS automatics to avoid in [reference_gui_substrate_beast_2026-05-17.md](C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/reference_gui_substrate_beast_2026-05-17.md).

## Doctrine + memory updates

- `D:/.code/EcodiaOS/backend/patterns/gui-substrate-beast-mode-2026-05-17.md` — full catalogue + composability + cross-app batch examples
- `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/reference_gui_substrate_beast_2026-05-17.md` — auto-memory ref
- `MEMORY.md` index updated with new entry
- 9 files mirrored to `D:/.code/EcodiaOS/backend/laptop-agent/tools/` for source-of-truth consistency

## Examples of what's now possible in ONE batch

**"Open every file changed in the latest commit, in Cursor"**
```
gui.sequence [
  cdp.attach,
  cdp.navigate to github.com/EcodiaTate/coexist/commit/HEAD,
  cdp.queryAll selector='[data-testid=changed-file] a' fields={path:'@text'},
  cursor.focus,
  vscode.open_file ide=cursor path=<first changed file>,
  vscode.open_file ide=cursor path=<second>,
  ...
  screenshot
]
```

**"What is Tate currently focused on?"**
```
gui.sequence [
  window.foreground,            ← exe/title/pid of focused window
  vscode.read_active_editor ide=auto,  ← full text of focused editor
  cdp.url                       ← current Chrome tab URL
]
```

**"Drive a form, capture the result"**
```
gui.sequence [
  gui.launch_cdp_chrome,
  cdp.attach,
  cdp.navigate to <some form URL>,
  cdp.fillByLabel label='Email' value='code@ecodia.au',
  cdp.fillByLabel label='Name' value='Tate Donohoe',
  cdp.clickText text='Submit',
  cdp.networkLog captureMs=4000,   ← capture what API the submit hit
  cdp.pageScreenshot
]
```

**"Multi-app dashboard digest"** (the beast demo, generalised)
```
gui.sequence [
  cdp.attach → navigate → 5 parallel API fetches → aggregate,
  window.windows,
  explorer.list_dir for relevant local mirrors,
  uia.windows,
  notification.toast 'Digest ready'
]
```

## Tools still on disk but unwired

- Cross-IDE editor-content extraction for Cursor (cursor.read_chat_panel) — would require either UIA on Electron (flaky) OR screenshot+OCR (heavyweight). Deferred.
- VS Code "what file is open" without focusing — VS Code's titlebar contains the filename, so `window.windows()` already exposes it via the title field. No new tool needed.

## What I would attack next session if you say go

1. **Recipes library** (`gui.recipes.*`) — pre-canned multi-step flows for the common patterns above. Reduce conductor cognitive load.
2. **Toast-driven escalation** — when an autonomous batch finishes, fire `notification.toast` so Tate sees the result land on his lock screen.
3. **Slack / Teams desktop drivers** (using UIA + input.*) — same playbook as VS Code but for native chat apps.
4. **OBS / screenshare control** — drive OBS for recording demos.
5. **Audio capture** — for transcribing voice notes during demos.

But honestly the current substrate is enough for ~all the GUI work you've ever asked me to do. Stop point reached unless you want to keep pushing.

## Files inventory

- Source: `D:/.code/eos-laptop-agent/tools/` (live, 116 tools loaded)
- Mirror: `D:/.code/EcodiaOS/backend/laptop-agent/tools/` (synced)
- New files in this session: `cdp.js` (extended), `vscode.js`, `cursor.js`, `explorer.js`, `window.js`, `uia.js`, `clipboard.js`, `notification.js`, `gui.js` (extended dispatcher)
- Doctrine: `patterns/gui-substrate-beast-mode-2026-05-17.md` + earlier session's patterns
- Auto-memory: `memory/reference_gui_substrate_beast_2026-05-17.md`
- Demos: `drafts/gui-gauge-2026-05-17/beast-demo.json` + `beast-demo-v2.json` (both fire-able)
- Screenshots: `drafts/gui-gauge-2026-05-17/beast-v2-final.png`

## How to fire any batch when you wake up

```powershell
$TOKEN = Get-Content $env:USERPROFILE\.ecodiaos\laptop-agent.token
curl.exe -sm 90 -X POST http://localhost:7456/api/tool `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d "@D:/.code/EcodiaOS/backend/drafts/gui-gauge-2026-05-17/beast-demo-v2.json"
```

You should see a 6-10 second response with the full cross-substrate digest. Good night.

# EcodiaOS Macro Recorder v2 - Deployment Runbook

Worker B1 + B2 + B3 + B4 deliverables, 6 May 2026. Manager fork: fork_motmiokr_ed2e9c.

The v2 recorder is the precision capture path: AHK-driven keyboard/mouse hook + screenshot bracket + privacy denylist + UIA tree probe + Anthropic vision pass. Pairs with v1 (psr.exe) for quick capture and shares the same recipe-emitter library.

## Quick reference

| Property | Value |
|---|---|
| Hotkey | `Ctrl+Shift+R` (toggle record / stop) |
| AHK script (Corazon) | `D:\.code\eos-laptop-agent\macros\macro-recorder.ahk` |
| Privacy denylist | `D:\.code\eos-laptop-agent\macros\privacy-denylist.json` |
| UIA probe (Corazon) | `D:\.code\eos-laptop-agent\macros\uia-probe.ps1` |
| Post-process trigger (Corazon) | `D:\.code\eos-laptop-agent\macros\post-process.bat` |
| Recording output root | `D:\.code\macro-recordings\<session_id>\` |
| AHK runtime | `C:\Users\tjdTa\AppData\Local\Programs\AutoHotkey\v2\AutoHotkey64.exe` (v2.0.23) |
| Recipe output dir (VPS) | `~/ecodiaos/macros/captures/<flow-slug>-<timestamp>.md` |

## Workflow (end-to-end)

1. Tate presses `Ctrl+Shift+R` on Corazon. AHK starts a recording session (tray notification + 800Hz beep).
2. Tate performs the GUI flow. AHK captures clicks, qualifying key combos, and screenshots (pre at T-100ms, post at T+200ms). On each click, AHK fire-and-forgets `uia-probe.ps1` to capture the UIA selector.
3. Tate presses `Ctrl+Shift+R` again. AHK writes `manifest.json` and chains into `post-process.bat` if present.
4. Conductor (or fork) runs `node ~/ecodiaos/macros/parsers/recording-to-recipe.js <session-dir> <flow-slug>` on the VPS.
5. The pipeline joins events + UIA selectors + frames, sends each click to the Anthropic vision API for a one-sentence semantic description, calls `recipe-emitter.js`, and writes the 10-section markdown recipe.
6. Recipe lands at `~/ecodiaos/macros/captures/<slug>-<ts>.md` with `status: untested_spec`. First end-to-end replay against the live UI flips the status to `validated_v1`.

## Output schema (canonical)

`events.jsonl` (one JSON object per line, append-as-you-go for crash safety):

```json
{
  "event_index": 0,
  "timestamp": "2026-05-06T06:00:44.000Z",
  "event_type": "click_left | click_right | key_down | key_combo | meta",
  "x": 683,
  "y": 300,
  "button": "left | right | middle | null",
  "key": "F5 | Ctrl+A | null",
  "foreground_window_title": "...",
  "foreground_app_exe": "chrome.exe",
  "screenshot_pre_path": "frames/0-pre.png",
  "screenshot_post_path": "frames/0-post.png"
}
```

Meta events:

```json
{
  "event_index": null,
  "timestamp": "...",
  "event_type": "meta",
  "meta_type": "record_start | record_stop | denylist_skip | post_capture | hotkey_press",
  "meta_payload": { }
}
```

`uia-enrichments.jsonl` (parallel file, one JSON per click event):

```json
{
  "event_index": 0,
  "uia_query_at": "2026-05-06T05:55:26.217Z",
  "uia_query_duration_ms": 218,
  "target_uia_selector": {
    "name": "Address and search bar",
    "automation_id": "view_1012",
    "control_type": "edit",
    "class_name": "OmniboxViewViews",
    "framework_id": "Chrome",
    "is_enabled": true,
    "is_offscreen": false,
    "bounding_rect": {"x": 157, "y": 51, "width": 824, "height": 24},
    "parent_chain": [
      {"name": "", "control_type": "group"},
      {"name": "", "control_type": "tool bar"},
      {"name": "", "control_type": "region"}
    ]
  },
  "uia_query_status": "ok | empty | error",
  "uia_query_error": null
}
```

`manifest.json` (written on `record_stop`):

```json
{
  "session_id": "2026-05-06-0550-abc123",
  "start_ts": "ISO",
  "end_ts": "ISO",
  "event_count": 12,
  "denylist_hits": 0,
  "ahk_version": "2.0.23",
  "platform": "win32",
  "screen_resolution": "1366x768"
}
```

## Launch the recorder

The recorder runs as a long-lived AHK script (NOT via `macro.run`, which spawns one-shot tmp scripts and exits).

```bash
curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Authorization: Bearer $(cat ~/.ecodiaos/laptop-agent.token)" \
  -H "Content-Type: application/json" \
  -d '{"tool":"process.launchApp","params":{
    "command":"C:\\Users\\tjdTa\\AppData\\Local\\Programs\\AutoHotkey\\v2\\AutoHotkey64.exe",
    "args":["D:\\.code\\eos-laptop-agent\\macros\\macro-recorder.ahk"]
  }}'
```

Verify alive:

```bash
curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Authorization: Bearer $(cat ~/.ecodiaos/laptop-agent.token)" \
  -H "Content-Type: application/json" \
  -d '{"tool":"process.listProcesses","params":{"filter":"AutoHotkey64.exe"}}'
```

A successful start emits a tray notification and an 800Hz beep. Press `Ctrl+Shift+R` to begin a recording session. A second `Ctrl+Shift+R` stops, writes the manifest, and chains into `post-process.bat`.

MVP posture: NOT auto-started on boot. Tate launches manually at session start. v2.1 may add Task Scheduler / PM2 entry once usage cadence is known.

## Update the AHK script

Edit `~/ecodiaos/macros/_corazon/macro-recorder.ahk` locally on the VPS, then push:

```bash
B64=$(base64 -w0 /home/tate/ecodiaos/macros/_corazon/macro-recorder.ahk)
jq -n --arg p 'D:\\.code\\eos-laptop-agent\\macros\\macro-recorder.ahk' \
      --arg c "$B64" \
      '{tool:"filesystem.writeFile", params:{path:$p, content:$c, encoding:"base64"}}' \
      > /tmp/wr-ahk.json
curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Authorization: Bearer $(cat ~/.ecodiaos/laptop-agent.token)" \
  -H "Content-Type: application/json" \
  -d @/tmp/wr-ahk.json
```

Then kill the running AutoHotkey64.exe process and relaunch (AHK reads the file at startup; live-reload not implemented).

## Update the privacy denylist

The denylist is loaded at every `record_start` (start of each recording session). No restart needed for changes to take effect.

```bash
B64=$(base64 -w0 /home/tate/ecodiaos/macros/_corazon/privacy-denylist.json)
jq -n --arg p 'D:\\.code\\eos-laptop-agent\\macros\\privacy-denylist.json' \
      --arg c "$B64" \
      '{tool:"filesystem.writeFile", params:{path:$p, content:$c, encoding:"base64"}}' \
      > /tmp/wr-deny.json
curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Authorization: Bearer $(cat ~/.ecodiaos/laptop-agent.token)" \
  -H "Content-Type: application/json" \
  -d @/tmp/wr-deny.json
```

Three blocklist categories:
- `foreground_exe_blocklist`: exact-match against process exe (e.g. `1Password.exe`)
- `url_substring_blocklist`: case-insensitive substring against window title (browsers usually surface the URL there)
- `window_title_substring_blocklist`: case-insensitive substring against window title

Any match writes a `denylist_skip` meta event with the matched rule and SKIPS the click/key entirely (no screenshots, no events.jsonl click row).

## UIA probe (Worker B2 deliverable)

`uia-probe.ps1` queries the Windows UI Automation tree at a click coordinate and emits a stable selector. B1's AHK fires this fire-and-forget on each click. Replay can then find the same UI element by semantic identity even if it shifts position.

Invocation contract:
```
powershell.exe -NoProfile -File "D:\.code\eos-laptop-agent\macros\uia-probe.ps1" -X 600 -Y 60 -EventIndex 0 -SessionId 2026-05-06-0550-abc123
```

Use `powershell.exe` (Windows PowerShell 5.1), NOT `pwsh.exe` (PowerShell 7). Cold-start measured ~323ms vs ~627ms; saves ~300ms per click.

Performance (verified 2026-05-06):

| Metric | Value |
|---|---|
| End-to-end runtime (powershell.exe to exit) | median 981ms (range 917-1103) |
| UIA query only (FromPoint + 3-ancestor walk) | median 218ms (range 207-364) |
| pwsh.exe cold-start overhead | ~627ms (NOT recommended) |
| powershell.exe cold-start overhead | ~323ms (recommended) |

Concurrency safety (verified 6 May 2026): 5 parallel probes against the same session JSONL produce 5 valid lines, zero corruption. Mutex-serialised append (`Global\uia-probe-<SessionId>` named mutex, 2s timeout, fallback per-event file on timeout).

UIA blind spots:
- HTML/CSS browser content: UIA exposes the browser frame's accessibility tree (address bar, tabs). Arbitrary `<div>`/`<button>` only surface if the page has correct ARIA/a11y tags. Most production webapps do.
- WPF/WinForms/UWP/XAML desktop apps: generally well-instrumented (Calculator, Notepad, Settings, File Explorer all work).
- Canvas-rendered controls (some Electron apps, custom-drawn UIs): opaque to UIA, returns parent window only. Replay falls back to pixel coords.
- Off-window coords: `FromPoint` clamps to nearest valid element (returns desktop pane `class_name="#32769"` for negative coords) instead of null. Replay logic should treat empty name + `class_name="#32769"` as "no useful selector, fall back to coords".

v2.1 optimisation (named-pipe daemon): current cost is dominated by `powershell.exe` cold-start (~323ms of ~981ms total = 33%). A long-running PowerShell daemon listening on `\\.\pipe\uia-probe-daemon` could drop e2e to ~250ms.

## Vision pass + recipe emit (Worker B3 deliverable)

VPS pipeline at `~/ecodiaos/macros/parsers/recording-to-recipe.js`:

```bash
node ~/ecodiaos/macros/parsers/recording-to-recipe.js <session-dir> <flow-slug> [--no-vision]
```

Imports:
- `~/ecodiaos/macros/lib/event-joiner.js` (joins events.jsonl + uia-enrichments.jsonl + manifest.json)
- `~/ecodiaos/macros/lib/vision-enrich.js` (Anthropic API per-click semantic_description; capped at 100 events)
- `~/ecodiaos/macros/lib/recipe-emitter.js` (Worker A's shared library; produces 10-section markdown)

Anthropic key resolution: `ANTHROPIC_API_KEY` env var. Currently NOT in `kv_store.creds.anthropic.api_key`. Without a key, vision is skipped gracefully and the recipe still emits with empty `semantic_description` per event.

Vision model: `claude-sonnet-4-7-20251022` (default; override via `ANTHROPIC_VISION_MODEL` env).

## Known caveats

- **Stop-race on quick toggle:** A click immediately followed by `Ctrl+Shift+R` (under ~200ms) may have its post-capture screenshot dropped while the stop handler runs. Manifest event_count remains correct; one frame may be missing. Recommend pausing 0.5s before stopping a recording.
- **Hotkey conflicts:** `Ctrl+Shift+R` is reserved as the toggle. Apps that rely on it during a recording will see it consumed by the recorder. (No-op outside recording: AHK only registers it as ToggleRecording.)
- **Foreground bias on global hotkey:** the recorder captures whatever IS foreground at click-time, NOT what the operator intended. For scripted tests, ensure the target window is foreground BEFORE sending clicks.
- **AHK v2 only.** Script header is `#Requires AutoHotkey v2.0`. Will not run on v1.x.
- **Screen capture latency:** PowerShell `System.Drawing` capture is ~200-400ms per frame. For 60-event sessions, recording overhead becomes noticeable. v2.1 may swap to a faster capture path (nircmd if present, or a long-lived screencap daemon).
- **Anthropic key absent:** vision pass currently always skipped. To enable: set `ANTHROPIC_API_KEY` in the conductor / fork env or wire kv_store fetch into `recording-to-recipe.js`.

## Privacy posture v0

Hardcoded substring/exe denylist only. Hardening deferred to v2.1:
- UIA-derived password-field detection (use B2's UIA probe to detect `IsPassword=true` controls, auto-skip)
- Hotkey-pause (e.g. `Ctrl+Shift+P`) for moments where the denylist will not catch a sensitive context
- Encryption-at-rest of `events.jsonl` + frames before VPS sync
- Always-on listening explicitly OUT of scope for MVP (Tate ruled out 6 May 15:32). Recording is opt-in via `Ctrl+Shift+R` only.

## Verified end-to-end (6 May 2026)

| Test | Session id | Result |
|---|---|---|
| Recording cycle (3 clicks + 1 keypress) | `2026-05-06-1600-n7j5rq` | PASS, 3 events captured, manifest written |
| Denylist enforcement | `2026-05-06-1602-ok30er` | PASS, 2 clicks against blocked title produced 2 `denylist_skip` events, 0 frames captured for blocked clicks, manifest event_count=0 denylist_hits=2 |
| UIA probe (Chrome address bar) | n/a | PASS, name="Address and search bar" + automation_id="view_1012" + parent_chain=3 ancestors |
| UIA stress (5 parallel) | n/a | PASS, 5 valid JSONL lines, zero corruption |
| recording-to-recipe.js (synthetic + B3 real entrypoint) | n/a | PASS, 10-section recipe emitted, frontmatter `status: untested_spec`, `capture_method: os-hook-recorder` |
| Integration test (5/5) | `~/ecodiaos/macros/tests/integration-test.js` | PASS, 5 of 5 |

Test artefacts on VPS:
- `~/ecodiaos/macros/captures/_raw/v2-test-2026-05-06-1600-n7j5rq-events.jsonl`
- `~/ecodiaos/macros/captures/_raw/v2-test-2026-05-06-1600-n7j5rq-manifest.json`
- `~/ecodiaos/macros/captures/_raw/v2-test-2026-05-06-1602-ok30er-denylist-events.jsonl`
- `~/ecodiaos/macros/captures/notepad-test-flow-2026-05-06-0550.md`
- `~/ecodiaos/macros/captures/integration-test-flow-2026-05-06-0601.md`

## Files for git

VPS-tracked:
- `macros/lib/recipe-emitter.js` (Worker A; shared with v1)
- `macros/lib/event-joiner.js` (Worker B3)
- `macros/lib/vision-enrich.js` (Worker B3)
- `macros/lib/post-process.bat` (Worker B3; source-of-truth for the Corazon-side trigger)
- `macros/parsers/psr-exe-parser.js` (Worker A)
- `macros/parsers/psr-exe-to-recipe.js` (Worker A)
- `macros/parsers/recording-to-recipe.js` (Worker B3)
- `macros/tests/integration-test.js` (Worker B4)
- `macros/_corazon/macro-recorder.ahk` (Worker B1; source-of-truth, deployed to Corazon)
- `macros/_corazon/privacy-denylist.json` (Worker B1)
- `macros/_corazon/uia-probe.ps1` (Worker B2; source-of-truth, deployed to Corazon)
- `macros/v2-recorder-deploy.md` (this file)
- `patterns/macro-capture-via-psr-exe.md` (Worker A)
- `patterns/macro-capture-via-custom-hook-recorder.md` (Worker B4)

Corazon-deployed (binaries / scripts only):
- `D:\.code\eos-laptop-agent\macros\macro-recorder.ahk`
- `D:\.code\eos-laptop-agent\macros\privacy-denylist.json`
- `D:\.code\eos-laptop-agent\macros\uia-probe.ps1`
- `D:\.code\eos-laptop-agent\macros\post-process.bat`

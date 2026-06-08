---
triggers: cowork-dispatch-mac, focus-and-send-mac, signal-bound-timeout, scheduler-dispatch-broken-mac, ahk-hardcoded-mac, applescript-keystroke, cron-no-fire-on-mac, mac-port-laptop-agent, dispatch-worker-stale-lease, system-events-keystroke
status: active
---

# cowork.dispatch_worker on Mac needs an AppleScript focus-and-send branch; AHK is Windows-only

**Rule.** `cowork.dispatch_worker`'s final step is a focus-then-keystroke to submit the prefilled CC chat. On Windows that's an atomic AHK script (`window.focusAndSend` → AutoHotkey64.exe → WinActivate + SendInput). The AHK binary path is hardcoded at `C:\Users\tjdTa\AppData\Local\Programs\AutoHotkey\v2\AutoHotkey64.exe`. On Mac that file does not exist; the spawnSync silently fails and the dispatched tab sits with the brief prefilled but never submitted. The worker never calls `coord.signal_bound`, so the scheduler hits its 180s `SIGNAL_BOUND_TIMEOUT_MS` and stale-leases the row. After three stale-lease cycles the row goes `status='failed'` with `last_error='stale lease - max retries exhausted'`.

**Why.** When the laptop-agent is ported to a Mac, every Windows-only primitive in the dispatch chain is a silent break. `focus_and_send` is the load-bearing one — without it, every cron fires symbolically (tab opens, brief lands, model never runs). The substrate looks healthy (agent up, bridge registered, tabs spawning, briefs populating) but no work actually happens. Diagnosis is slow because the failure mode is shaped exactly like a generic "worker timed out" — the scheduler can't tell whether the worker started and crashed, started and forgot, or never started at all.

**How to apply.** Any laptop-agent primitive that calls a binary by absolute Windows path needs a `process.platform === 'darwin'` branch using a native Mac equivalent BEFORE we declare the Mac port done. For `focus_and_send` the equivalent is AppleScript via `osascript`: `tell application "<IDE>" to activate` (replaces WinActivate), then `tell application "System Events" to keystroke return` (replaces SendInput Enter). Both run inside one osascript invocation so the activate-to-keystroke race is microseconds, same as the AHK design rationale. Requires Accessibility permission for osascript (`UI elements enabled = true`); probe with `osascript -e 'tell application "System Events" to (UI elements enabled)'` at boot.

Other Windows-only primitives in the agent code to audit when porting: `window.focus_window` (WinActivate + DllCall AttachThreadInput), `window.windows` (Win32 EnumWindows), `window.foreground` (GetForegroundWindow), anything using `ahk_id` / `ahk_exe` / `ahk_pid` window specs, anything using `Code.exe` as a process match.

The Mac branch maps:
- `hwnd` Windows handle → has no analogue; pass `app_name` instead (`Visual Studio Code`, `Visual Studio Code - Insiders`, `Cursor`).
- `exe` binary name → has no analogue on Mac; `app_name` covers both routing and activation.
- `ahk_exe Code.exe` window match → `tell application "<app_name>" to activate` (uses Cocoa frontmost).
- `SendInput {Enter}` → `keystroke return`.
- `^{Enter}` (ctrl+enter) → `keystroke return using control down`.
- `+{Enter}` (shift+enter) → `keystroke return using shift down`.

**Verification.** After porting, smoke-test by triggering a low-risk cron via `scheduler.schedule_run_now` and watching for `[bound]` messages in `coord.peek_inbox` on topic `chat.conductor.inbox`. A successful bind within ~10s of dispatch proves the keystroke landed. Watch the scheduler log at `~/Library/Logs/eos-laptop-agent.err.log` (Mac path) for absence of `signal_bound timeout` lines on freshly-dispatched task_ids.

**Origin.** 2026-06-08 09:50-10:23 AEST. After the Mac mini cutover the corpus was unpaused but every cron silently failed. Initial diagnosis attributed the failures to "no IDE bridge registered" + "stale lease - max retries exhausted" errors symptomatically, missing that the deeper cause was the AHK binary path. The 27 failed rows shared one root cause: `focus_and_send` was a no-op on Mac. Patch:
- `eos-laptop-agent/tools/window.js`: added `focusAndSendMac` that builds an AppleScript with `activate` + `keystroke` and runs it via `osascript`; `focusAndSend` routes by `process.platform`.
- `eos-laptop-agent/tools/cowork.js`: derives `app_name` from the bridge IDE name and passes it to `focus_and_send` alongside the existing `exe`/`hwnd`.

**Cross-refs.**
- [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] - the doctrine that masks this failure mode by deferring rather than permanently failing.
- [[verify-deployed-state-against-narrated-state]] - "tabs spawned + briefs populated" looks like success but is not.
- [[24x7-autonomy-architecture-invariants-2026-05-27]] - signal_bound + signal_done + close_my_tab is the contract that this fix restores.
- [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]] - 90s would be even worse here; the doctrine 180s is the floor.
- [[mac-via-rdp-capture-is-pixel-only-uia-blind]] - sibling Mac-port primitive that needed its own Mac-native path.
- [[ecodia-native-headless-ship-recipe-2026-05-20]] - earlier Mac primitive that needed an osascript port.

**Anti-patterns.**
- Resuming failed cron rows blindly without diagnosing the dispatch path. Doctrine-resetting failed → active gets us doctrine-compliance but every reset row re-fails until the keystroke works.
- Assuming "no IDE bridge registered" is the only failure mode because that error is more visible. The signal_bound timeout is the silent killer.
- Adding a new "Mac dispatcher" helper instead of branching focus_and_send. The atomic-activate-then-keystroke design IS load-bearing; preserve it on both platforms.
- Using `cliclick` instead of osascript. cliclick is a separate brew dependency; osascript is built-in and already used elsewhere in the agent (see `tools/applescript.js`).

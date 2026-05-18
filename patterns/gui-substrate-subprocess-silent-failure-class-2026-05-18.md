---
triggers: silent-subprocess-failure, subprocess-hang-no-stderr, ahk-hidden-dialog, ahk-windowsHide-swallow, ahk-v2-syntax-drift, powershell-automatic-shadow, ps-pid-shadow, ps-args-shadow, ps-host-shadow, ps-clipboard-hang, set-clipboard-hang, ps-system-web-oom, system-web-httpruntimesection, mouse-scroll-hang, spawnSync-timeout-no-error, gui-tool-returned-ok-wrong-data, subprocess-diagnostic-protocol, ahk-filebuffer-bom, ctrl-shift-p-swallowed-by-chat-control, foreground-ps-failed, clipboard-write-failed
---

# GUI substrate: subprocess silent-failure failure class on Corazon

## Rule

When a Corazon `eos-laptop-agent` tool that shells out to PowerShell, AutoHotkey v2, or `cmd.exe` either (a) hangs to the parent timeout with empty stderr, or (b) returns `ok:true` with structurally wrong data, default-suspect ONE of the five known silent-failure modes documented below before assuming the wrapper logic is wrong. The shape "subprocess succeeded but did nothing useful" or "subprocess hung and the parent never saw why" is recurring, has bitten six times in seven days, and the fix is always in the subprocess-invocation layer, not in the tool's caller-side logic.

## The five silent-failure modes

| # | Failure | How it looks from the parent | Root cause | Fix |
|---|---|---|---|---|
| 1 | **AHK error dialog swallowed by `windowsHide:true`** | child hangs until `spawnSync` timeout (5-10s), exit code is the timeout-kill code, stderr is empty | AHK pops a modal error dialog (syntax error, runtime exception, missing function); `windowsHide:true` makes the dialog invisible; nobody clicks OK; AHK blocks forever | re-run with `windowsHide:false` to surface the dialog; fix the AHK script; switch wrapper to `spawnSync(..., {windowsHide: false, timeout: N})` ONLY for debugging - production keeps `windowsHide:true` after the AHK is correct |
| 2 | **PowerShell automatic-variable assignment silently ignored** | tool returns `ok:true`, structurally-valid JSON, with one field carrying the PowerShell process's own PID/path/title instead of the queried subject | the script used a PowerShell automatic (`$pid`, `$args`, `$input`, `$null`, `$true`, `$false`, `$matches`, `$host`, `$home`, `$psversiontable`) as a `[ref]` assignment target; PS does not error, it silently refuses the write; the variable retains its automatic value | rename to a non-automatic (e.g. `$winPid`, `$childArgs`, `$inputData`); add a sentinel value before the call and assert it changed |
| 3 | **`Set-Clipboard` hang under memory pressure** | clipboard.write returns `clipboard write failed:` with empty stderr; the call blocks for the full PS timeout before returning | clipboard service is non-responsive under system memory pressure (>85%); `Set-Clipboard` blocks on STA marshalling; no exception is thrown, just an indefinite wait | route the tool through `lib/ps-daemon.js` so the .NET clipboard assembly is amortized; add an outer wrapper with try/catch + 1 retry; on second failure return a structured `clipboard_orphan` shape that callers can branch on |
| 4 | **`System.Web.HttpRuntimeSection` init throws mid-call** | `ConvertTo-Json` errors with `The type initializer for 'System.Web.Configuration.HttpRuntimeSection' threw an exception` partway through a script that previously worked | first-touch of `System.Web` on a cold PS process under memory pressure triggers the HttpRuntimeSection initialiser, which can OOM; subsequent cold spawns also fail because the initialiser state is per-process and re-attempted | route through the long-lived ps-daemon (assemblies load once at daemon boot, before memory pressure); for one-shot scripts, prefer `ConvertTo-Json` over `Out-String -Width N \| ConvertFrom-Csv` chains that touch System.Web |
| 5 | **GUI shortcut swallowed by an active text-input control** | the shortcut fires (no error), but the action does not happen; instead the shortcut's literal characters are typed into the focused control (e.g. "Claude Code:" typed into Tate's chat box) | a foreground app intercepts the shortcut at the IME/keyboard-hook layer and re-emits it as text input; common offenders: Cursor chat, VS Code Quick Open, Slack composer | switch the shortcut to a less-intercepted form (e.g. Esc+F1 instead of Ctrl+Shift+P), OR pre-step `input.key escape` to dismiss the focused control, OR window-focus to a known-safe control first |

## Diagnostic protocol (when a subprocess tool misbehaves)

Run these in order. Stop at the first one that explains the symptom.

1. **Re-run with verbose stderr capture.** Wrap the subprocess call in a temporary `spawnSync(..., {windowsHide: false, stdio: ['pipe', 'pipe', 'inherit']})` and re-fire. If a dialog appears or stderr is non-empty, you are in mode 1 (AHK hidden dialog) or mode 4 (.NET init exception). Fix the script, not the wrapper.
2. **Check for automatic-variable shadowing.** Grep the PS script for `\$pid|\$args|\$input|\$null|\$true|\$false|\$matches|\$host|\$home|\$psversiontable`. If any appear as the LHS of an assignment or as a `[ref]` target, you are in mode 2. Rename and re-test.
3. **Probe system memory.** `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize`. If `FreePhysicalMemory / TotalVisibleMemorySize < 0.15`, you are likely in mode 3 (clipboard hang) or mode 4 (System.Web OOM). Route the tool through `lib/ps-daemon.js` and re-test.
4. **Capture the foreground state at failure time.** `window.foreground` immediately after the failed call. If the foreground is an editor / chat input control AND the failed call was a shortcut (Ctrl+Shift+P, Ctrl+L, Ctrl+T), you are in mode 5. Switch the shortcut form or add a pre-step focus dismissal.
5. **If none of 1-4 explain the symptom**, then the failure is genuinely caller-side. Inspect the tool's wrapper logic. Most subprocess failures resolve in steps 1-4.

## Do

- Default-suspect this failure class first when a `tools/*.js` PS or AHK shellout misbehaves. The diagnostic protocol takes 5 minutes and resolves 5 of every 6 mystery failures observed in the 2026-05-17/18 window.
- Route every new PS-shelling tool through `lib/ps-daemon.js` per `~/ecodiaos/patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md`. The daemon eliminates modes 3 and 4 by amortizing assembly cost across the process lifetime.
- Add a sentinel-value assertion when a PS script writes to a variable name that COULD be an automatic. Example: `$winPid = -1; [void][WE]::GetWindowThreadProcessId($h, [ref]$winPid); if ($winPid -eq -1) { throw "GetWindowThreadProcessId did not write to winPid" }`. This catches mode 2 even if the variable name is renamed back accidentally.
- Run AHK scripts through `AutoHotkey64.exe /ErrorStdOut` during development so syntax errors print to stderr instead of popping a hidden dialog. Switch to `windowsHide:true` only after the script is stable.
- Codify each NEW silent-failure variant in this file as a sixth/seventh row of the table. The taxonomy compounds in value as it grows; a one-off variant captured here saves the next debug session.

## Do not

- Do NOT assume a PS or AHK tool failure means the wrapper logic is wrong. The wrapper is almost always fine; the subprocess is silently misbehaving in one of the five known ways.
- Do NOT raise the `spawnSync` timeout to "give the subprocess more time" without first running step 1 of the diagnostic. A hang is not a slow-path; raising the timeout just delays the same empty-stderr failure.
- Do NOT debug AHK scripts with `windowsHide:true` in the wrapper. The dialog you need to see is exactly the thing the flag hides.
- Do NOT use bare automatic-variable names anywhere in a PS script body, even for variables you "know" PS will not shadow. Add the namespace prefix (`$winPid`, `$childArgs`) or use a leading underscore to be safe.
- Do NOT ship a new PS-shelling tool that bypasses `lib/ps-daemon.js` without an explicit comment explaining why. The default is daemon-routed; non-daemon is the exception.

## Origin

Six distinct occurrences in the seven-day window 2026-05-11 to 2026-05-18 share this failure shape. The taxonomy was visible only after the 2026-05-17 night session's ps-daemon ship resolved three of them in one sitting and the recurring shape became obvious.

1. **2026-05-17 ~16:30 AEST** - `mouse.scroll` invocation hangs 10s with empty stderr. Root cause: `Send "{WheelDown N}"` is invalid AHK v2 syntax. AHK popped a hidden error dialog; `windowsHide:true` made it invisible; child blocked until the wrapper timeout. Fix: `Loop N { Click "WheelDown" }`. Response time after fix: 209ms. Documented in `~/ecodiaos/patterns/gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17.md` and `~/ecodiaos/drafts/SESSION_SUMMARY_2026-05-17_for-tate.md` line 15.
2. **2026-05-17 ~22:50 AEST** - `window.foreground()` returns the PowerShell process's own PID and exe-name `powershell` for every visible window. Root cause: the PS script used `$pid` as a `[ref]` assignment target in `[void][WE]::GetWindowThreadProcessId($h, [ref]$pid)`; PS silently refused to overwrite the automatic. Fix: rename to `$winPid`. Documented in `~/ecodiaos/patterns/gui-substrate-beast-mode-2026-05-17.md` line 50.
3. **2026-05-17 ~23:00 AEST** - `clipboard.write()` returns `clipboard write failed:` with empty stderr, blocks for full timeout. Root cause: system memory at ~88%, `Set-Clipboard` blocked on clipboard-service marshalling. Fix: route through ps-daemon (clipboard assembly amortized); wrap caller in try/catch + 1 retry + structured orphan return. Documented in `~/ecodiaos/patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md` Why section item 3.
4. **2026-05-17 ~23:10 AEST** - `win.foreground()` errors with `The type initializer for 'System.Web.Configuration.HttpRuntimeSection' threw an exception`. Root cause: cold PS spawn under memory pressure, `ConvertTo-Json` triggered System.Web init OOM. Fix: ps-daemon amortizes assembly init. Documented in `~/ecodiaos/patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md` Why section item 2.
5. **Pre-2026-05-18** - `Ctrl+Shift+P` in `reflex.js:143-157` typed the literal text "Claude Code:" into Tate's chat instead of opening the command palette. Root cause: Cursor's chat input control intercepted the shortcut. Fix: switched to `Esc+F1`. Documented in `~/ecodiaos/patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md` "Concrete audit-driven hardening" section.
6. **2026-05-11** - `macro-recorder.ahk` `FileAppend` writes manifest.json with a UTF-8 BOM; downstream `JSON.parse` fails with no clear error pointing back to the BOM. Root cause: AHK `FileAppend` default encoding emits BOM unless the explicit third argument `"UTF-8-RAW"` is passed. Fix: patch in `~/ecodiaos/drafts/apply-ahk-bom-fix.ps1`, applied via fork_mp1ooxg2_1a7436. Same failure class (subprocess produces structurally-wrong output without error).

The synthesis: subprocesses that fail in these ways report `ok:true` to the parent or hang past timeout with empty stderr. The parent's spawnSync wrapper has no signal to distinguish "succeeded" from "silently did the wrong thing." The fix is always to instrument the SUBPROCESS layer (surface dialogs, rename shadowed variables, amortize assembly cost, switch shortcut form) rather than the parent-side caller logic.

## Cross-references

- `~/ecodiaos/patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md` - the ARCHITECTURAL fix for modes 3 and 4 (long-lived PS daemon amortizes assembly cost). This file is the COMPLEMENTARY diagnostic-protocol layer.
- `~/ecodiaos/patterns/gui-substrate-beast-mode-2026-05-17.md` - mentions the `$pid` automatic-shadow incident in a single bullet; this file catalogues it as one of five recurring modes.
- `~/ecodiaos/patterns/gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17.md` - mentions the AHK v2 mouse.scroll fix as a side ship; this file catalogues it as mode 1.
- `~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md` - DIFFERENT failure class (require-cache staleness, not subprocess silent-failure). Cross-referenced so future-me does not conflate "tool was edited but pm2-restart missed" with "tool ran but subprocess silently failed."
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - DIFFERENT failure class (input did not land on intended target); the post-step verify protocol catches the SYMPTOM but the silent-failure modes here catch the CAUSE.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - parent meta-rule (narration drifts from reality); this file is the subprocess-shellout specialisation.

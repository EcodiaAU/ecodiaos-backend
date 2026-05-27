---
triggers: sy094-gui, sy094-rdp, macincloud-desktop-app, macincloud-rdp, MacinCloud_Full_Screen.rdp, mac-rdp-shortcut, mac-gui-entry, sy094-login, macincloud-rdp-security-warning, rdp-resource-checkboxes, rdp-WebAuthn, rdp-Clipboard, mac-gui-procedure, sy094-into-desktop, sy094-ui-driving, mac-xcode-gui, mac-simulator-gui, open macincloud, launch macincloud, connect to macincloud, macincloud instance, open the macincloud, get into macincloud, macincloud, sy094, mstsc, open rdp, launch rdp, open mac gui, open the mac, get to the mac, into the mac, drive macincloud, screenshot macincloud, click macincloud
---

# SY094 GUI entry via the MacinCloud RDP shortcut on Corazon's desktop

When SY094's macOS GUI is required (Xcode visual flows, Simulator GUI, Keychain Access dialogs, App Store Connect Transporter, Apple Developer signing flows) the canonical entry path is the desktop RDP shortcut on Corazon, not the macincloud.com web portal.

> **Meta-doctrine:** This is a worked instance of `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. That file governs how all GUI recipes are authored, optimised, and verified. Read it before starting a new recipe.

Sibling rule: SSH from VPS remains the canonical path for any headless or scripted work. See `~/ecodiaos/clients/macincloud-access.md` and `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md`.

**Tate, 4 May 2026 19:41 AEST verbatim:** "I need t teach you exactly what to do to get into the macincloud desktop app instance gui. You're going to go the the laptop desktop however is best. Either by clicking the button in the bottom right that hides all windows, or however is fitting. Then on the desktop you'll see the macincloud shortcut. Double click that, and itll open a security warning. Tick both options, click connect, then itll load up and you enter the creds that i told you eaarlier which you shouldf have stored."

## End-to-end procedure (verified working 2026-05-04 19:43 AEST)

**Step 1. Get to Corazon's desktop.**
- Click the "Show desktop" sliver in the very bottom-right corner of the taskbar (single-pixel-wide vertical strip right of the system tray). On 1366×768 the click target is approximately `(1364, 766)`. Win+D / Win+M did NOT reliably take when Chrome had focus during testing; the Show-desktop sliver did.
- Verification: screenshot should show the desktop wallpaper and icons, no Chrome/EcodiaOS chat in the foreground.

**Step 2. Find the MacInCloud RDP shortcut.**
- It is `MacinCloud_Full_Screen.rdp` on the user desktop (`%USERPROFILE%\Desktop`).
- The shortcut launches the macOS session in **fullscreen** mode on Corazon's display (the filename is accurate). The fullscreen window has no Windows titlebar visible while engaged. To minimize back to the taskbar without disconnecting, hover the cursor at the top edge to reveal the auto-hidden RDP control bar - see the "Exiting fullscreen RDP" section below.
- This is Microsoft RDP (mstsc.exe), NOT Citrix. Sibling rule `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` prohibits Citrix entirely; the fullscreen behaviour here is the RDP shortcut's configured mode and is fine.

**Step 3. Launch the shortcut.**
- Functionally equivalent to double-click: `Start-Process` invoking the `.rdp` file:
  ```
  Start-Process ([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'MacinCloud_Full_Screen.rdp'))
  ```
- Wait ~3 seconds for the security warning to appear.

**Step 4. Tick both resource-access checkboxes in the "Remote Desktop Connection security warning" dialog.**
- Dialog has class `#32770`. Title: `Remote Desktop Connection security warning`.
- These checkboxes are XAML-rendered inside the Win32 dialog. UI Automation cannot see them as `CheckBox` controls and they expose ZERO patterns (no `TogglePattern`, no `Invoke`, nothing). Verified empirically 2026-05-04 via full descendant tree walk filtering for `ControlType=CheckBox` OR `Toggle*` patterns - returned zero matches inside the dialog. Pixel-click is the only path. Do NOT spend time probing UI Automation for these.
- The visible labels enumerate as `pane` controls with these BoundingRectangles (verified live 2026-05-04 19:43 + 20:23 AEST):
  - `WebAuthn (Windows Hello or security keys)` rect = X=484 Y=337 W=398 H=20
  - `Clipboard` rect = X=484 Y=357 W=398 H=20
- **VERIFIED WORKING CLICK COORDS (2026-05-04 20:23 AEST live test, both boxes confirmed ticked via pixel-crop screenshot):**
  - WebAuthn: **`(683, 347)`** - row centre (X = label.X + label.W/2; Y = label.Y + label.H/2)
  - Clipboard: **`(683, 367)`** - row centre
- Why earlier coords missed: previous attempts at `(478, 343)` were left of the label rect (label starts at X=484), and `(550, 343)` did not toggle either - empirical hit-test confirms only clicks near the row centre reliably tick. The XAML hit-target appears narrower than the parent pane suggests; row-centre is the safe coord.
- Note: the connection still establishes and lands on the macOS login screen even if the boxes are NOT ticked. They control WebAuthn forwarding and Clipboard sync respectively. The Connect button is the only load-bearing step for "get into the session"; tick the boxes because those features are valuable, not because they gate the session.
- Buttons in the same dialog: `Connect` rect = X=785 Y=431 W=75 H=23 (centre `(822, 442)`); `Cancel` rect = X=868 Y=431 W=75 H=23 (centre `(905, 442)`).
- Verification protocol after clicking: capture a screenshot, crop the checkbox region (e.g. 580x90 pixels at offset 420, 320 via PowerShell `System.Drawing.Bitmap.CopyFromScreen`), download base64 PNG, visually inspect for blue ticks. UI Automation cannot verify state - pixel inspection is the only ground truth.

**Step 5. Click Connect.**
- Wait ~4 seconds for RDP to establish and the macOS login screen to render.

**Step 6. Enter creds.**
- macOS login screen has two text fields: "Enter Name" (focused on arrival) and "Enter Password", arrow button to submit.
- Click Name field at approx `(685, 275)`, type username from `kv_store.creds.macincloud.username`.
- Tab to password field, type password from `kv_store.creds.macincloud.password`. **The password is fixed at MacInCloud purchase time and does NOT auto-rotate** (Tate verbatim 2026-05-04 20:14 AEST). Never bake the literal value into a script or this doc - always read live from kv_store. If `Permission denied` repeats, see `~/ecodiaos/clients/macincloud-access.md` failure modes (typo/whitespace, idle-kick, rental lapse).
- Press Enter (or click the arrow at approx `(832, 314)`).
- Wait ~8 seconds for "Authenticating..." then macOS desktop renders.

## Substrate notes

- `kv_store.creds.macincloud` is the canonical credential row. See `~/ecodiaos/docs/secrets/macincloud.md` for shape, rotation behaviour, and consumer surfaces.
- `MacinCloud_Full_Screen.rdp` is preconfigured with hostname `SY094.macincloud.com` so no host entry is needed.
- The dialog uses modern UWP rendering inside a Win32 `#32770` host. UI Automation's `TogglePattern` returns null on the checkboxes - they are panes wrapping XAML controls. Pixel-click is the reliable path. Do NOT spend time probing for InvokePattern / TogglePattern on these elements.
- The dialog is centred at the same approximate coords on each launch on a 1366×768 display. If Corazon's resolution changes, re-enumerate via the script in `C:\Users\Public\enum2.ps1` (writes a control-tree dump including BoundingRectangle X/Y/W/H for every pane).

## Speed - make this fast next time

**Tate verbatim 4 May 2026 19:51 AEST:** "it was extemely slow, not too much of a problem since we can codify for next time."
**Tate verbatim 4 May 2026 20:24 AEST:** "do the whole mic flow no so we can make it faster"

The 4-May-2026 first run took ~7 minutes from "show desktop" to "macOS desktop loaded" because of: (a) Win+D / Win+M experimental dead-ends, (b) PowerShell escape-quoting failures requiring rewrites, (c) needless re-screenshots after every micro-step, (d) probing TogglePattern that doesn't exist on UWP panes.

**Iteration timeline:**

| Run | Date AEST | End-to-end | Speedup vs first |
|---|---|---|---|
| First (manual exploration) | 4 May 19:43 | ~7 minutes | baseline |
| Codified multi-call fast path | 4 May 20:24 | 23.6s | 18× |
| **Optimised single-shell.shell** | **4 May 20:39** | **~7.9s** | **~53×** |

**Latest verified run 4-May-2026 20:39 AEST: 7.9 seconds end-to-end** via single PowerShell `shell.shell` invocation at `C:\Users\Public\mic-fast.ps1` (script body checked into this doctrine below). Internal phase breakdown from the script's own timing instrumentation:

| Phase | Internal time | Notes |
|---|---|---|
| Launch .rdp via Start-Process | 120ms | |
| Probe-for security warning dialog | 1156ms | Replaces 3s fixed sleep |
| Pixel-click WebAuthn + Clipboard checkboxes + UIA Invoke on Connect button | 435ms | Connect uses InvokePattern (real Button); checkboxes pixel-click (XAML, UIA-invisible) |
| Probe-for warning dialog gone | 180ms | Replaces blind wait |
| Probe-for RDP container window appear | 1094ms | TscShellContainerClass enumeration |
| Fixed 2.5s + pixel-click name field + SendKeys creds | 3450ms | Fixed floor here is the macOS login screen render time |
| Probe-for RDP container HasKeyboardFocus (BROKEN PROBE - returns immediately because RDP container has focus the moment input is sent to it, NOT when Mac desktop is rendered) | 3ms | See speed wins identified below |

Script-internal total: 6.4s. Mac desktop is NOT actually rendered when the script returns - it renders ~1.5s later. Real "ready for next interaction" time is ~7.9s. The earlier 23.6s codified fast path waited a full 8s for Mac desktop rendering; the optimised flow makes this overlap with the next conductor action (typically a screenshot or a UI Automation query) which adds its own ~1.5s of latency, hiding the gap. Document this caveat in the recipe so downstream callers do NOT assume the Mac desktop is interactive immediately on script return.

**Speed wins applied 4 May 20:39 AEST (23.6s → 7.9s):**

- **[APPLIED]** Single-shell PowerShell collapses 9 conductor round-trips into 1 (Start-Process + Connect-Invoke + SendKeys + 4 polling probes). Saves ~1.4s of accumulated tool-call latency.
- **[APPLIED]** UI Automation polls replace the 3s, 5s, and 8s fixed sleeps:
  - "wait for security warning dialog appear" replaced with FindWindowByName poll → resolved in 1156ms
  - "wait for warning dialog gone" replaced with WaitWindowGone poll → resolved in 180ms
  - "wait for RDP container appear" replaced with FindRdpContainer poll → resolved in 1094ms
- **[APPLIED]** UIAutomation `InvokePattern.Invoke()` on the Connect button replaces pixel-click. The Connect button IS a real `ControlType.Button` exposing InvokePattern (unlike the security warning checkboxes which are XAML invisible-to-UIA pane controls). Cleaner and faster.
- **[APPLIED]** `[System.Windows.Forms.SendKeys]::SendWait` for `username{TAB}password{ENTER}` instead of 4 separate `input.type`/`input.key` round-trips.

**Speed wins still available (next iteration):**

- **[TODO HIGH]** The "wait for Mac desktop ready" probe is currently `HasKeyboardFocus` on the RDP container, which returns in 3ms because the container takes keyboard focus the moment input is sent to it - NOT when the macOS desktop is actually rendered. Real time-to-Mac-desktop-rendered is ~1.5s after script return. Replace the probe with a Tier-4 pixel sample at the macOS menu bar location (e.g. sample (10, 5) for the macOS dark menu bar gray; while the Mac is still authenticating the menu bar is absent or shows the login screen). Adds ~50-200ms but produces an honest "Mac is ready" signal that downstream callers can trust. Saves nothing on the timing but removes a correctness gap.
- **[TODO MEDIUM]** The 2.5s fixed sleep between `dialog gone` and `pixel-click name field` is the empirical floor for macOS login screen render time. Could pixel-probe (sample white text-field background at (685, 275)) to cut to 0.5-1.5s when the login renders fast. Saves 0-2s.
- **[STRUCK 4 May 20:49 AEST]** Earlier draft of this section claimed a "Don't ask me again for connections to this computer" checkbox existed in the security warning dialog. **It does not.** The 20:23 AEST `enum2.ps1` walk enumerated exactly three checkbox-like panes (WebAuthn at (484,337), Clipboard at (484,357), and the cluster's parent pane); no third "remember me" checkbox is present in this MacInCloud-issued .rdp. The author hallucinated it from generic RDP-dialog priors. Tate verbatim 4 May 20:49 AEST: "theres no dont ask me again button that i can see on the security thing and you know that because you havent seen it either". Lesson: this happened immediately after authoring the meta-doctrine `gui-recipes-authoring-optimisation-and-verification.md` whose first authoring step is "Walk before guessing" - apply that rule to the speed-wins backlog itself, not just to the procedure. Never claim a UI element exists in a recipe document without a citation in the verified-coordinates table.
- **[ATTEMPTED, dropped]** Probing for "Enter Name" UI element on Windows side - macOS UI is rendered inside the RDP container and is NOT enumerable via Windows UI Automation. Pixel-probe is the only path for Mac-internal state.

**Verified working fast-path (23.6s total):**

Speed checklist for next time (verified working 4 May 2026 20:24 AEST, 23.6s total):
- **Skip the Show-desktop step entirely** - *only when starting from a passive desktop state*. See "Foreground-busy branch" below for when this skip is WRONG. `Start-Process` invokes the .rdp file regardless of foreground; the security warning dialog spawns somewhere - but if the prior foreground app is fullscreen and absorbing focus (e.g. Tate is actively typing in EcodiaOS chat in fullscreen Chrome), the dialog may spawn Z-buried behind that app and clicks at the dialog's nominal coords land on the wrong window. The 4 May 19:43 AEST procedure listed Show-desktop as Step 1 but the 20:24 AEST fast-path bypassed it because Tate was passive at codification time. Real-world drives must check Tate-foreground first.
- Read creds from kv_store ONCE: `SELECT value::jsonb -> 'username', value::jsonb -> 'password' FROM kv_store WHERE key='creds.macincloud'`.
- Use `shell.shell` with `Start-Process ([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'MacinCloud_Full_Screen.rdp'))`. ONE call. No double-click coordinate hunt.
- Sleep 3s for the security warning dialog to render.
- Click WebAuthn `(683, 347)`, click Clipboard `(683, 367)`, click Connect `(822, 442)`. THREE `input.click` calls.
- Sleep 5s for macOS login screen render.
- Click name field `(685, 275)`, `input.type` username, `input.key Tab`, `input.type` password, `input.key Enter`. FIVE calls. (Future optimisation: collapse to ONE `shell.shell` SendKeys batch - saves ~3s.)
- Sleep 8s for macOS desktop render after auth.
- ONE final `screenshot.screenshot` to confirm macOS Finder visible.
- Skip any UI Automation enumeration unless a step fails - the coords above are stable on 1366×768 Corazon.

If the resolution changes, re-enumerate via `C:\Users\Public\enum2.ps1` (the recursive ControlViewWalker script written 4 May; preserves BoundingRectangle X/Y/W/H for every dialog pane).

## Foreground-busy branch - when the fast-path "skip show-desktop" is WRONG

The 23.6s fast-path was codified on 4 May 2026 in a state where Tate was passive (not at the keyboard). The codified flow's "skip Show-desktop entirely" works in that case because the security-warning dialog spawns and naturally takes foreground over a passive Chrome.

**It does not work when Tate is actively typing in another app.** When Tate is foreground in EcodiaOS chat (or any other app receiving live keyboard input), Windows correctly suppresses programmatic focus-steal - the security-warning dialog spawns BEHIND Tate's app, and pixel-clicks at the dialog's verified coords `(683, 347)`, `(683, 367)`, `(822, 442)` land on whatever app IS foreground at those screen coords (typically Chrome content). All three clicks fail silently; the recipe appears to "not work" while actually every click was correct in isolation but landed on the wrong window.

This was the 6 May 2026 ~11:13 AEST flail mode. ~5 minutes wasted on chained blind clicks + PowerShell `SetForegroundWindow` / `AppActivate` / `AttachThreadInput` C# tricks (all correctly suppressed by Windows because Tate held foreground), before screenshotting and discovering the dialog wasn't visible at all.

### The corrected branch - pre-step verify Tate-foreground BEFORE skipping show-desktop

```powershell
# Step 0 from cowork-no-focus-collision.md - get Tate's foreground identity
$h = [FgWin]::GetForegroundWindow()
$pid = 0; [void][FgWin]::GetWindowThreadProcessId($h, [ref]$pid)
$proc = (Get-Process -Id $pid).ProcessName
$title = ...  # window title
```

Decision:

| Tate's foreground | Action |
|---|---|
| `Progman` / `WorkerW` (desktop) | Fast-path. Skip show-desktop. Launch .rdp directly. |
| `chrome.exe` with title NOT containing "EcodiaOS" (Tate has Chrome open but isn't actively in our chat) | Probe recent-input-time. Idle >30s → safe to fast-path. Active <30s → branch as Tate-active. |
| `chrome.exe` with title containing "EcodiaOS" / Tate-active in our chat | **Tate-active branch** - defer or run show-desktop FIRST. |
| Any other app receiving recent input | **Tate-active branch.** |

### Tate-active branch - correct sequence

1. Surface to conductor: "Tate is foreground in <app>. Recipe will minimise everything via show-desktop sliver before proceeding. Confirm or defer."
2. If proceeding: click show-desktop sliver `(1364, 766)`. Sleep 500ms.
3. **Pre-verify:** foreground-window probe MUST return `Progman` or `WorkerW`. If not, the show-desktop click failed (Tate's app re-grabbed foreground); abort and surface.
4. NOW launch the .rdp via `Start-Process`. The dialog spawns over the desktop and IS foreground.
5. **Pre-verify each click coord:** before clicking WebAuthn `(683, 347)`, capture a 100×100 px crop at `(633, 297)-(733, 397)` and confirm the checkbox row pixels match the expected pattern (white-pane + label text). If the crop doesn't match, the dialog isn't where coords expect - abort and surface.
6. Post-verify each click: cropped diff before/after, OR re-walk UIA tree to confirm dialog still present and Connect button still enumerable until the final Connect click; final click's post-verify is "security-warning dialog window is GONE within 3s."
7. Continue to step 6 (creds entry) only after Connect's post-verify confirms dialog dismiss.

### Anti-pattern from 6 May 2026

The 4 chained `input.click` calls fired at `(683, 347)`, `(683, 367)`, `(822, 442)`, then a fourth attempt - all without pre/post verify - landed on Chrome content at those coords because the dialog was Z-buried behind Tate's foreground EcodiaOS chat. The conductor then escalated to PowerShell `Add-Type` C# `SetForegroundWindow` / `AttachThreadInput` / `AppActivate` tricks (all returned `True`, all suppressed by Windows because Tate held real foreground). Only after 4-5 minutes did the conductor screenshot and see the dialog wasn't visible at all.

What should have happened: pre-step verify (Tate-foreground probe) at step 1 caught Tate-active in <500ms, branched to Tate-active sequence, surfaced "blocked on Tate-foreground; show-desktop required to proceed." Total cost of correct flow: ~3s. Total cost of failure: ~5min + Tate's confidence.

See `~/ecodiaos/patterns/gui-step-verify-protocol.md` for the canonical step-verify discipline this branch implements.

## Step verification protocol

This recipe's steps must be driven via the step-verify-protocol from `~/ecodiaos/patterns/gui-step-verify-protocol.md`. Per-step pre/post-verify table:

| Recipe step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |
|---|---|---|---|---|
| 0. Foreground check | n/a | `GetForegroundWindow` + window-title query | foreground identity captured into recipe-state | 1s |
| 1a. Show-desktop (Tate-active branch only) | foreground != `Progman`/`WorkerW` | click `(1364, 766)` | foreground == `Progman` or `WorkerW` | 2s |
| 1b. Launch .rdp | foreground == `Progman`/`WorkerW` OR Tate-passive Chrome | `Start-Process MacinCloud_Full_Screen.rdp` | `mstsc.exe` process running AND `Remote Desktop Connection security warning` window foreground | 3s |
| 2. WebAuthn checkbox click | dialog window foreground AND cropped 100×100 at `(633, 297)-(733, 397)` shows pane row | `input.click (683, 347)` | cropped diff at same region shows blue tick OR pane has tick visual | 1s |
| 3. Clipboard checkbox click | dialog still foreground AND cropped 100×100 at `(633, 317)-(733, 417)` shows pane row | `input.click (683, 367)` | cropped diff at same region shows blue tick | 1s |
| 4. Connect button click (UIA Invoke preferred) | dialog still foreground AND `Connect` button enumerable in UIA tree | `InvokePattern.Invoke()` on Connect, OR `input.click (822, 442)` fallback | dialog window GONE from window list | 3s |
| 5. macOS login screen render wait | `mstsc.exe` foreground AND RDP container `TscShellContainerClass` enumerable | n/a (probe loop) | cropped pixel sample at `(685, 275)` shows white text-field background | 5s budget |
| 6. Name field click + type | RDP container foreground | `input.click (685, 275)` then `SendKeys` username | UIA `ValuePattern` on name field shows username OR cropped diff at field shows characters | 2s |
| 7. Tab + password type + Enter | name field has value | `Tab` + `SendKeys` password + `Enter` | RDP shows "Authenticating..." then macOS desktop within 8s | 10s |
| 8. macOS desktop ready | n/a | n/a (probe loop) | cropped pixel sample at `(10, 5)` matches macOS dark menu bar gray | 8s budget |

If any step's post-verify fails within budget: **ABORT**, do not retry blind. Branch to foreground-recovery (Tier 1-4 from `gui-step-verify-protocol.md` (D)). Surface to conductor with foreground identity, last screenshot path, and recipe step number.

## Exiting fullscreen RDP - hover top to reveal control bar

**Tate verbatim 4 May 2026 19:51 AEST:** "once you're in the full screen mode, you have to hover near the top of the screen to make the control bar with the minimise button for the window so you cna get out of MIC window."

The `MacinCloud_Full_Screen.rdp` shortcut launches the session in **fullscreen** mode, occupying the entire Corazon display. The mstsc.exe window has no titlebar visible while fullscreen.

### Method 1 (PREFERRED - reliable, no hover dance): WindowPattern programmatic minimise

UI Automation can drive the RDP container window directly without going through the auto-hide bar. The fullscreen RDP is the top-level `TscShellContainerClass` desktop child. Verified working 4 May 2026 20:30 AEST.

```powershell
Add-Type -AssemblyName UIAutomationClient
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cw = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$c = $cw.GetFirstChild($root)
while ($c) {
  try {
    if ($c.Current.ClassName -eq "TscShellContainerClass") {
      $wp = $c.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
      $wp.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Minimized)
      Write-Output "MINIMIZED"
      break
    }
  } catch {}
  $c = $cw.GetNextSibling($c)
}
```

Use `WindowVisualState`: `Maximized`, `Normal`, or `Minimized`. To restore from minimised, use `Normal` (or just click the taskbar entry).

### Method 2 (secondary - pixel-click, flaky on auto-hide): hover top, click caption button

Verified caption-button rects from the slide-down control bar (4 May 2026 20:29 AEST live enumeration via UI Automation `BrowserCaptionButtonContainer` walk):

| Button | Rect | Centre click target |
|---|---|---|
| Minimise | X=1229 Y=0 W=45 H=40 | `(1252, 20)` |
| Restore | X=1274 Y=0 W=46 H=40 | `(1297, 20)` |
| Close | X=1320 Y=0 W=46 H=40 | `(1343, 20)` |

The pin and address-text live in a separate `BBar` toolbar at X=526 W=665 Y=0 H=32 (didn't enumerate the pin individually - not load-bearing for exit).

Procedure (BUT see Method 1 first):

1. `input.move` cursor to approximately `(1252, 1)` - directly above the minimise button. Stay near the button so the cursor doesn't drift back below the auto-hide threshold.
2. Sleep 1.0s for bar to slide down.
3. `input.click` at `(1252, 20)` - centre of the minimise button.

Why pixel-click is flaky: the bar auto-hides quickly when the cursor moves below its zone. A 1.5s gap between cursor warm-up at `(683, 1)` and click at `(1252, 20)` was enough for the bar to retreat and the click to pass through to the macOS side. Method 1 (WindowPattern) bypasses this entirely - prefer it.

**Click-options on the bar (when method 2 is used):**

- **Minimise** - sends RDP to taskbar without disconnecting. Mac session stays alive on the MacInCloud side; reconnecting (taskbar click) picks up where it left off.
- **Restore** - exits fullscreen but keeps the session in a windowed state. Useful if you want to keep the Mac visible alongside other Windows apps without going to taskbar.
- **Close (X)** - disconnects the RDP session but does NOT sign the user out of macOS. Reconnecting via the .rdp shortcut returns to the same Mac session.
- **Pin** (in the BBar toolbar at left) - locks the control bar visible so it doesn't auto-hide. Useful if you'll be hopping in and out of the bar repeatedly.

**Alt+Tab is a less reliable escape:** it works, but the RDP fullscreen window can re-grab focus on next mouse-move depending on the connection's auto-fullscreen settings. Method 1 (WindowPattern) is the deterministic path.

## When to use this path vs SSH

| Need | Path |
|---|---|
| `xcodebuild` / `xcrun altool` / `xcrun simctl` headless | SSH (`~/ecodiaos/clients/macincloud-access.md`) |
| `git`, file CRUD, process listing on the Mac | SSH |
| iOS Simulator GUI interaction (visual click, screenshots of running app) | This RDP path, then drive the simulator on the Mac desktop |
| Xcode signing / provisioning UI flows | This RDP path |
| App Store Connect Transporter GUI | This RDP path |
| Keychain Access UI (e.g. importing a .p12) | This RDP path |
| Anything that prompts for `sudo` password on the Mac console interactively | This RDP path |

## Anti-patterns

- Do NOT open `macincloud.com` web portal in any browser. See `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md`.
- Do NOT drive `desktop.macincloud.com` Citrix HTML5 in any browser.
- Do NOT install or launch a fullscreen Citrix Workspace session - the RDP shortcut here goes through Microsoft RDP, not Citrix, and stays windowed.
- Do NOT type the Mac password into the RDP titlebar or any other field that's not "Enter Password" on the macOS login screen.
- Do NOT close the RDP window with Cmd+Q from within the Mac session - that signs the user out, not the RDP. Close from the Windows-side titlebar X (top-right of the RDP frame).

## Verification probes

After running the full procedure:
1. Screenshot Corazon - should show macOS menu bar at top (`Finder File Edit View Go Window Help`) and the macOS dock at bottom. Confirms the RDP session is the active foreground.
2. Optional UI Automation check: the foreground window class is `RAIL_WINDOW` (RemoteApp / RDP) instead of `Chrome_WidgetWin_1` (Chrome).
3. Optional disk check: any files dragged to the Mac desktop should appear with the user as owner.

## Rollback

If anything goes wrong mid-procedure:
- Click `Cancel` on the security warning instead of `Connect` (no session established, nothing to clean up).
- If past Connect but auth fails: the RDP window will show `Login failed`. Click the X icon next to the name field to clear, retype creds. If `Permission denied` repeats, MacInCloud likely rotated the password - verify `kv_store.creds.macincloud.password` against the MacInCloud control panel.
- If session establishes but locks up: close the RDP window from the Windows-side titlebar X. The Mac session stays signed-in on the MacInCloud side; reconnecting picks up where it left off.

## Origin

Tate verbatim 4 May 2026 19:41 AEST (above). End-to-end procedure verified by EcodiaOS in main session 19:41-19:48 AEST while parallel forks (cron-routing fix + Co-Exist verification) ran. Result: macOS desktop reached, Finder visible, Roam_Distribution.mobileprovision and iOS simulator screenshots folder confirming this is the same Mac that hosts the iOS build pipeline. Pattern file authored 19:48 AEST same session.

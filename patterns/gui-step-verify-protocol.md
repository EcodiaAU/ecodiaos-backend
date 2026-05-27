---
triggers: gui-step-verify, gui-step-verification, verify-after-step, verify-before-step, no-blind-chain, gui-recovery-protocol, foreground-recovery, gui-input-discipline, screenshot-before-after, time-budget-per-step, gui-recipe-driver, recipe-driver-loop, blind-input-anti-pattern, click-then-verify, foreground-busy-branch, gui-tier-recovery, abort-not-retry, drive-recipe-defensively, pre-step-probe, post-step-probe, cropped-diff, visual-diff-verification, dialog-z-buried, click-landed-where, gui-step-budget, gui-input-pre-verify, gui-input-post-verify, recipe-driver-defensive, no-optimistic-chaining, gui-input-discipline, foreground-busy, foreground-not-target, target-not-reachable, blind-clicks-anti-pattern
---

# GUI inputs are unreliable; verify before AND after every step, not optimistically chained

GUI input.* calls (clicks, keystrokes, shortcuts) are not deterministic. The intended target may not be foreground, the intended dialog may be Z-buried, the intended button may have moved, the OS may suppress focus-steal, the click may land on a different window entirely. Recipe drivers that chain inputs blindly - fire step 1, fire step 2, fire step 3 without verifying each landed - fail in ways that look like "the recipe is broken" when really every codified click was correct in isolation but ZERO of them landed on the intended target.

Drive recipes defensively. Verify the click target is reachable BEFORE the click, verify the click landed AFTER. If either probe fails, branch to recovery - never chain blindly to the next step.

## (A) Pre-step verify - confirm the click target is REACHABLE before firing

Every `input.*` call must be preceded by a state probe that confirms the target is in a state where the click can land.

- **For pixel-click of a known coord:** foreground-window probe (Win32 `GetForegroundWindow` + window title) MUST return the planned target. PLUS a cheap cropped screenshot at the click coords (e.g. 100×100 px around the target) to verify the expected pixel pattern is visible there. Both must pass.
- **For UIA `Invoke` on a button:** window-tree probe to confirm the button is found in the tree AND the parent window is the foreground window. UIA finding the element is not enough - if the parent is Z-buried, the Invoke fires but no visible state changes.
- **For `SendKeys` / `input.type`:** confirm the focused control is the intended text field. UIA `HasKeyboardFocus` on the target field, OR the foreground window matches expectation AND a cropped pixel sample shows the field-is-focused indicator (caret, highlight border).
- **For shortcut keys (e.g. Win+D, Ctrl+L):** foreground-window probe to confirm a shell that will receive the shortcut is foreground. `Win+D` fires regardless of foreground but `Ctrl+L` lands wherever focus is.

If pre-step verify fails: **branch to the foreground-recovery sub-protocol (D), do not fire the click.**

## (B) Post-step verify - confirm the action LANDED after firing

Every `input.*` call must be followed by a state probe that confirms the intended state change happened. Symptoms vary by step type:

- **A click that should dismiss a dialog:** probe the window list (`Get-Process X | Select MainWindowTitle`) or UIA tree to confirm the dialog title is gone. If the window is still present, the click did not land or the click landed on a different button.
- **A click that should change a UIA property** (toggle a checkbox, select a tab, expand a tree node): re-walk the tree and check the expected property changed. `TogglePattern.Current.ToggleState` should now read `On` if the click ticked the checkbox.
- **A `SendKeys` / `input.type`:** probe the text-field-content via UIA `ValuePattern.Current.Value`, OR a cropped screenshot diff at the field area to confirm characters appeared.
- **A click that should bring a new window to foreground** (e.g. taskbar click): post-probe foreground window MUST now be the intended app, not the previous foreground.

If post-step verify fails: **STOP. Do not chain to the next step.** Diagnose what actually happened - different click target, suppressed click, hidden dialog. The recipe is mid-failure; chaining further blind clicks compounds the failure and wastes minutes.

## (C) Time budget - hard cap per step

Every step has a budget. Steps over budget are FAILED, not "still in progress."

- **A single GUI input step that doesn't post-verify within 5-10 seconds is FAILED.** Abort, do not retry blind. Diagnose the failure with a state probe.
- **A whole recipe that doesn't verify completion within its codified runtime + 50% margin is FAILED.** Abort, snapshot the state (full screenshot + foreground-window identity + UIA tree dump for the target window class), surface to the conductor as "GUI substrate failure on recipe X step Y."
- **Default budget per step type:** click-then-dialog-dismiss = 3s, click-then-window-foreground = 2s, click-then-toggle-checkbox = 1s, SendKeys-then-text-appears = 2s, shortcut-then-app-action = 2s. Override per-recipe when the target is known to be slow (e.g. RDP container appear is ~1s, Mac desktop render after auth is ~5s - budget those explicitly).
- **Fixed sleeps that become "step budgets" are wrong.** A 3s sleep that always fires is a fixed-render-time floor; a 3s budget that polls and exits early on success is the discipline. Replace fixed sleeps with bounded probe-loops where possible (per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` 7-step optimisation).

## (D) Foreground-recovery sub-protocol - when the planned target is NOT foreground

When pre-step verify (A) returns "target window is not foreground," do NOT keep clicking. Branch to a tiered recovery protocol. Each tier has its own pre/post verify; do not proceed to the next tier until the current tier's post-verify confirms the target window is foreground.

### Tier 1 (cheapest, defer if Tate-active)

- **Probe:** is Tate actively typing in another window? Use `cowork-no-focus-collision` Step 0 - `GetForegroundWindow` + window-title + recent-input-time heuristic.
- **Action if Tate-active:** defer. Surface to conductor as "blocked on Tate-foreground; planned target=X, current foreground=Y." Do NOT try to steal foreground from Tate - Windows correctly suppresses programmatic focus-steal in this case, and the suppression is a feature, not a bug.
- **Action if Tate-passive (idle, OR foreground is a non-Tate app like Chrome with no recent input):** proceed to Tier 2.

### Tier 2 (Tate-passive, window is hidden behind another)

- **Probe:** does the target window exist in the window list at all? `Get-Process | Where-Object MainWindowTitle -match <target>`.
- **Action:** click the show-desktop sliver `(1364, 766)` on Corazon to minimise everything. Verify foreground is now `Progman` / `WorkerW` (Windows desktop). Then click the planned target's TASKBAR ICON to bring it forward. Re-probe foreground = target window class.
- **If still not foreground after click-taskbar:** the window may be modal-dialog-buried or attached to a hidden parent. Try a different surfacing method: Alt+Tab cycle (`Get-WindowList`, find target, `SwitchToThisWindow` via Win32), OR direct `WindowPattern.SetWindowVisualState(Normal)` on the target's HWND if exposed.

### Tier 3 (window doesn't surface even after desktop-show)

- **Probe:** is the process running at all? `Get-Process X` returns nothing → the app is dead, not just hidden.
- **Action:** kill any leftover process instances (`Stop-Process -Force`) and relaunch fresh from the recipe's launch step. Re-enter the recipe at the appropriate restart point.

### Tier 4 (process won't restart)

- **Probe:** launch returned an error, or process exited within 1s of relaunch.
- **Action:** surface to conductor as "GUI substrate failure on recipe X - planned target=Y, tier-1-3 recovery exhausted, manual intervention required." Stamp with foreground-window identity at time of failure, last screenshot, recipe step number. **Do NOT keep blind-clicking.** This is the abort condition - the conductor or Tate intervenes from here.

## (E) Visual-diff verification - for ambiguous state, crop before/after

UIA returning "no element found" is one form of negative; window-title being empty (e.g. mstsc.exe MainWindowTitle is `""` while connecting) is another. When UIA cannot disambiguate, fall back to cropped pixel diff at the relevant region - cheaper than a full screenshot for tight loops and more deterministic than full-frame visual interpretation.

- **Cheaper than full screenshot.** A 100×100 px crop around the click target is ~30 KB; a full 1366×768 screenshot is ~1.5 MB. The crop transports faster and the comparison is bounded.
- **Specifically:** screenshot before the click, save the 100×100 crop at the click coords. Click. Screenshot after, save the same 100×100 crop. Compare bytes (or pixel-hash via PowerShell `[System.Drawing.Bitmap]` + per-pixel walk).
  - **Identical:** action did not land. Branch to (D) recovery.
  - **Different:** something happened - but verify it's the EXPECTED something. A checkbox tick is a small blue check appearing in the corner; the click landing on a wrong button might also produce visual change but in the wrong region. The crop region must include the success indicator.
- **For dialog-dismiss verification:** crop the dialog title bar region. Before the click: title bar present. After: title bar absent (or different content). The diff is unambiguous.
- **For text-field input verification:** crop the field area. Before: empty (or default placeholder). After: characters visible.

## (F) Step-drive loop template - the canonical wrap recipe drivers should use

```
for step in recipe.steps:
  pre_state = probe_state(step.target)            # foreground? UIA tree state? cropped pixels?
  if not pre_state.matches(step.precondition):
    foreground_recovery(step.target)              # Tier 1-4 from (D)
    pre_state = probe_state(step.target)
    if not pre_state.matches(step.precondition):
      ABORT(reason=f"step {step.name} pre-verify failed after recovery")
  start = now()
  step.action()                                   # input.click / SendKeys / shell.shell etc
  while now() - start < step.budget:
    post_state = probe_state(step.target)
    if post_state.matches(step.postcondition):
      break
    sleep(step.poll_interval)
  else:
    ABORT(reason=f"step {step.name} post-verify timeout")
```

Recipe authors specify per-step:

- `step.target` - the window/element/region the step affects.
- `step.precondition` - predicate over `pre_state` that must hold for the step to fire safely.
- `step.action` - the `input.*` / `shell.shell` call(s).
- `step.budget` - the time cap from (C).
- `step.poll_interval` - typically 200-500ms.
- `step.postcondition` - predicate over `post_state` that confirms the step landed.

The driver-loop is the same for every recipe; only the step parameters change. This is the contract recipes must satisfy to be runnable; without it the recipe is read-only doctrine.

## Worked example - 6 May 2026 MIC RDP drive flail

**Symptom:** ~5 minutes of attempts to drive the MacInCloud RDP recipe ended without the RDP session opening. The conductor charged ahead optimistically, chained 4 `input.click` calls without screenshot-verifying each landed, then tried PowerShell focus-steal tricks (Add-Type C# `SetForegroundWindow`, `AttachThreadInput`, `WScript.Shell.AppActivate`) when the dialog wasn't dismissing. Only after 4-5 minutes of flailing did the conductor screenshot and discover the security-warning dialog wasn't visible at all - Z-buried behind Chrome (where Tate was actively typing in EcodiaOS chat).

**Root cause:** Tate was actively typing in EcodiaOS chat. Windows correctly suppressed the conductor's programmatic focus-steal - the OS API calls returned `True` (request accepted) but actual foreground stayed with Chrome. The recipe's "fast-path skip show-desktop" assumes a desktop-or-passive starting state; with Tate-active in another app, that assumption is wrong, and the entire chained sequence fired into the wrong window.

**What each step's verify probe should have been:**

| Step (per recipe) | Pre-verify that was missing | What it would have caught | Post-verify that was missing | What it would have caught |
|---|---|---|---|---|
| 1. Launch `.rdp` via `Start-Process` | Foreground-window probe before launch - is Tate-foreground = EcodiaOS chat? | Tate-active in another window. Branch to Tier 1 of (D): defer or run desktop-show first. | Probe for `mstsc.exe` process started AND security-warning dialog window present in window list within 3s. | Dialog spawned BEHIND Chrome (Z-buried) - process was running but the dialog wasn't foreground. |
| 2. Click WebAuthn checkbox `(683, 347)` | Cropped 100×100 screenshot at `(633, 297)-(733, 397)` showing the checkbox is visible at that coord. | The dialog wasn't visible at all - the click was about to land on Chrome content at that coord. | Cropped screenshot at same region after click - checkbox now ticked (blue check appears). | Click landed on Chrome (not the dialog), no checkbox state change. |
| 3. Click Clipboard checkbox `(683, 367)` | Same as step 2. | Same. | Same. | Same. |
| 4. Click Connect button `(822, 442)` | Same - cropped screenshot shows Connect button visible at coord. | Same. | Probe `Remote Desktop Connection security warning` window - should be GONE after Connect. | Window still present (or never was foreground); session never established. |

**What recovery should have looked like:**

After step 1's post-verify failed (no dialog visible 3s after launch), the driver should have aborted the chain and entered (D):

- **Tier 1 probe:** Tate's foreground = EcodiaOS chat, last input <2s ago → Tate-active. **Defer or surface "blocked on Tate-foreground."**
- If Tate said "go ahead": **Tier 2 action:** click show-desktop sliver `(1364, 766)`, post-verify foreground = `Progman`. THEN click the mstsc.exe taskbar entry to surface the security-warning dialog. THEN re-enter the recipe at step 2 with the dialog now foreground.

**Time cost of failure:** ~5 minutes of unverified click-chains + focus-steal tricks. **Time cost of correct flow:** 1 pre-verify (~200ms) catches the Tate-active condition, 1 deferral or 1 desktop-show + taskbar-click (~3s), recipe completes normally. The verify-loop overhead is ~200-500ms per step on average; the worst-case savings from catching a Z-buried dialog early are minutes-to-tens-of-minutes.

## Do

- Author every recipe step with explicit `precondition` and `postcondition` predicates. The step is not codified until both are written.
- Pre-verify with the cheapest reliable probe (per the verification tiers in `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`): UIA property → tree walk → process check → filesystem → cropped pixel → full screenshot.
- Post-verify with a probe of the EXPECTED state change, not just "screenshot looks right" by general visual inspection.
- Bound every step with a budget. On budget-exceed: ABORT, do not retry blind.
- On any post-verify failure: STOP the chain. Diagnose. Branch to recovery (D), not to the next step.
- Use cropped pixel diff (E) when UIA can't see the state and full screenshots are too heavy for a tight loop.
- Stamp every aborted step with: foreground-window identity, last screenshot path, recipe + step name, abort reason. The stamp is the diagnostic for the next driver run.

## Do NOT

- Do NOT chain `input.*` calls without verifying each landed. "Click 1, click 2, click 3" with no probes between is the failure mode this doctrine fixes.
- Do NOT trust `SetForegroundWindow` / `AppActivate` / `AttachThreadInput` return values. Per `~/ecodiaos/patterns/cowork-no-focus-collision.md` - the OS APIs return success when the request is accepted, not when foreground actually moved. The only ground truth is a post-verify probe.
- Do NOT escalate to focus-steal C# tricks before screenshotting. If the dialog isn't visible, no focus-steal will help - the dialog itself may not be foreground-receivable. Screenshot first, diagnose, then act.
- Do NOT extend the budget when a step is failing. If a click hasn't landed in 5s, it's not landing - more time will not help. Abort.
- Do NOT swallow an abort silently. The conductor (or the recipe driver) must surface the abort with full state - foreground identity, screenshot, recipe step - so the next iteration can either fix the recipe coords or branch differently.
- Do NOT assume the recipe's codified fast-path is unconditional. Most fast-paths assume a passive starting state; with Tate-active in another app, the fast-path is wrong. Pre-verify the assumed starting state.

## Cross-references

- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - the recipe whose 6 May 2026 drive flailed; needs the verify-loop applied to every step.
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - meta-doctrine governing recipe authoring; mandates the step-verify-protocol from this file.
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` - Step 0 foreground-window probe is the Tier-1 input to (A) and (D).
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - meta-rule generalised; recipe-driver verify-loop is a worked instance for the GUI substrate.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - recipes must be validated end-to-end before trusted; this file extends that to PER-STEP verification at drive-time, not just at codification-time.

## Origin

**Tate verbatim 6 May 2026 ~11:13 AEST:** "Stop with the macro bro.... you were able to do this flawlessly yesterday. Wtf has happened. Literally all you needed to do was move the mouse to the taskbar. THis is what i mean by gui being the biggest problem for you that we havent fixed yet."

**Tate verbatim 6 May 2026 ~11:16 AEST:** "THe point of using gui is that i can see what youre doing + you get to have all creds and profiles preloaded via my laptop and my history... but we need to actually be able to use it and come up with strategies, problem solving techniques and patterns that help you actually navigate ui instead of that bs.... working 5 minutses for forground a window and still failing"

The conductor flailed for ~5 minutes attempting to drive the MIC RDP recipe via chained blind `input.click` calls. The recipe's verified coords were correct; the failure was: (1) no pre-step verify caught that Tate's EcodiaOS chat held foreground, (2) no post-step verify caught that the security-warning dialog was Z-buried behind Chrome and the clicks landed on Chrome content, (3) the conductor escalated to PowerShell focus-steal tricks (correctly suppressed by Windows) before screenshotting the actual state. Codified into this doctrine same-turn (per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`).

Authored: fork_motdc6l5_5753d5, 6 May 2026.

---
triggers: gui-fast-path, gui-speed, gui-primitives, fast-gui-flow, gui-optimisation, coord-cache, coord-table, no-spotlight-click, no-dock-discovery, osascript-activate, open-a-app, fewer-verifications, decision-branch-verify, triple-click-unreliable, home-shift-end-select, foreground-collision-auto-probe, sy094-direct-reachability, rdp-redraw-latency, gui-step-budget, fast-path-recipe, sleep-screenshot-tax, dark-pixel-icon-scan, ui-automation-osascript, mac-uia-from-windows, deterministic-text-field-clear
---

# GUI fast-path primitives — replace per-keystroke verify with decision-branch verify, replace clicking-discovery with `osascript activate` and `open -a`

GUI driving on the SY094 RDP path is dominated by verification overhead and discovery overhead, not actual work. A typical 5-keystroke field edit costs 20-30 seconds wall-clock, of which ~3 seconds is the actual typing and ~25 seconds is screenshot+crop+read+sleep cycles plus dock-icon scanning and Spotlight clicking. The 7 fast-path primitives below are the rules I learned this session (6 May 2026 Co-Exist iOS 1.8(2) release) for collapsing that overhead.

## When to apply

Any RDP-mediated GUI flow on SY094 (and by extension any Corazon-driven GUI flow on Tate's Windows Chrome). Especially:
- iOS release recipe (`~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md`)
- RDP entry recipe (`~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`)
- Any new GUI recipe authored under the meta-doctrine in `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`
- Any one-shot GUI session that touches a Mac field, dialog, menubar, or Dock

## The 7 primitives

### 1. Coord caching — consult the recipe's `*.coords.json` sidecar BEFORE re-scanning

**The drift this fixes:** every time I open a Mac dialog, I re-screenshot, re-crop, re-Pillow-scan to find the same coords (Build field, Spotlight, Dock Terminal). Cost: ~5-10 seconds per re-discovery × N actions per session.

**Do:**
- Each recipe carries a sibling `*.coords.json` sidecar with verified coords keyed by step_id
- Schema: `{recipe: "...", verified_at: "ISO8601", coords: {step_id: {x, y, anchor: "abs|relative-to-foo", verified_run: "ISO8601", note?: "..."}}}`
- BEFORE the GUI step: read the sidecar, use the cached coord, take ONE screenshot to verify the expected element is still there, click. ~1.5s instead of ~6s.
- After a successful action against a coord that differed from the cache: UPDATE the sidecar in the same commit as the recipe edit.
- Coords entered into the cache MUST be from a verified run THIS session OR a prior session that captured the same Xcode/macOS version. Never fabricate.

**Do not:**
- Re-Pillow-scan for "Build field y position" if the sidecar already has it.
- Hard-code coords inline in the recipe markdown without also writing them to the JSON sidecar.

### 2. Verify only at decision branches — not after every keystroke

**The drift this fixes:** I screenshot+sleep after every `input.type` and `input.key` even when the next step is sequential and unbranching. RDP redraw + curl + Pillow + Read = ~4-6s minimum per verify, and I do it ~3-5x per field edit.

**Do:**
- Identify the decision branches in the flow up front. A decision branch = "did the click open dialog A or dialog B?" / "did the build succeed or fail?" / "did the field accept the input or did it reject it (e.g. validation error)?".
- Verify ONLY at decision branches. Not after every keystroke in a unidirectional sequence.
- For a sequential keystroke chain (open field → type → tab → next field → type → tab → save), one verify after the open-field step is enough. The rest are deterministic if the open-field step landed correctly.
- For a branching step, verify with the SMALLEST useful crop (e.g. just the dialog title bar, not full screen). Smaller crop = faster Pillow + faster Read.

**Do not:**
- `screenshot → crop → Read` after every single tool call out of habit. That's the slowest pattern.
- Skip verification at actual branches just because I'm in a hurry. The cost of NOT verifying a branch is recovery cycles, which dwarf the verify cost.

### 3. Replace triple-click with home + shift+end (or N-backspace pre-clear)

**The drift this fixes:** triple-click failed both on the Xcode project Name field (caused "2App" prepend bug) and the Build field (caused "12" prepend bug) during the 6 May iOS release. Triple-click is meant to select a paragraph, but on a single-line text field it sometimes only selects the WORD, leading to insert-not-replace.

**Do:**
- Click once to focus the field
- Send `home` (jumps cursor to start of line)
- Send `shift+end` (selects from cursor to end of line) — `input.shortcut` with `[shift,end]`
- THEN type the new value — it overwrites the selection
- Cross-platform: works on macOS text fields, also on Windows. Deterministic.
- Alternative for ultra-safe paths: click once to focus, send N backspace keys (N >= max likely content length), then type. Slower but deterministic.

**Do not:**
- Use triple-click for select-all-on-line. It's unreliable across macOS field types (NSTextField vs NSSecureTextField vs NSComboBox vs Inspector field).
- Use cmd+a — Cmd does NOT pass through Microsoft RDP. The keystroke arrives as plain `a` and gets typed.

### 4. Auto-foreground-probe before any input.* sequence

**The drift this fixes:** Tate alt-tabs to Chrome to read our chat. My next click goes into Chrome instead of Xcode, the Return-key fires in the chat input, and I don't notice until 10s later when the screenshot reveals the wrong window.

**Do:**
- Before the FIRST input.* call in any sequence, run `verify-fg <target>` (~200ms). If RDP is not foreground, run `rdp-fg.ps1` to switch + verify match=True.
- Run the probe again after any 30+ second gap (Tate may have alt-tabbed during the gap).
- The probe IS NOT a screenshot — `screenshot.screenshot` doesn't steal focus and doesn't tell us about foreground. Use `GetForegroundWindow` via PowerShell.

**Do not:**
- Click first, screenshot after, hope the click landed where intended. That's the failure mode.
- Run `rdp-fg.ps1` between every keystroke — it's idempotent but the Win32 SwitchToThisWindow does steal focus from Tate if he's in another window. Use only when probe says fg≠target.

### 5. Replace Spotlight-click with `osascript activate` from Terminal

**The drift this fixes:** Clicking the macOS Spotlight magnifying glass in the menubar is brittle. The RDP control bar (pin / hostname / X-close-button) overlaps the menubar in the middle. The click misses, or hits the RDP control bar, or fires before the menubar reveals. On 6 May I tried it twice and it failed both times before I switched to the Terminal path.

**Do:**
- Once Terminal is open in RDP (any one Terminal session anywhere on SY094 desktop), bring app X to foreground via:
  ```bash
  osascript -e 'tell application "Xcode" to activate'
  ```
- This is 100% reliable, no menubar interaction, no RDP control bar collision.
- Works for Xcode, Terminal, Safari, Chrome, Cursor, Android Studio, Messages, Finder, anything in /Applications.
- Roundtrips through Terminal stdin: ~500ms (type the command + return + osascript exec).

**Do not:**
- Click the menubar Spotlight magnifying glass. Even with mouse-move-to-top to reveal menubar, the RDP control bar overlap costs ~30-50% of clicks.
- Use `Cmd+Space`. Cmd doesn't pass through RDP. Spotlight via Cmd+Space is dead in this environment.

### 6. Replace Dock-icon-discovery with `open -a "AppName"` from Terminal

**The drift this fixes:** On 6 May I used a Pillow dark-pixel scan to find Terminal in the Dock. Worked for Terminal (black square). For Xcode I clicked at the next dark icon and got Android Studio (also a dark icon with similar shape) — wrong app, recovery cycle to escape its launch dialog.

**Do:**
- Once Terminal is open in RDP, launch any app via:
  ```bash
  open -a "Xcode"
  ```
- Or activate-if-running: `osascript -e 'tell application "Xcode" to activate'`
- Enumerate available apps once: `ls /Applications/ | grep .app$` and cache the list. Future sessions consult the cache.

**Do not:**
- Click Dock icons by Pillow-coordinate-guessing unless the recipe coord table has a verified entry for that exact icon.
- Trust dark-pixel scans across icon sets — Android Studio, Apple TV, Terminal, and certain dark-themed apps all match.

### 7. Crop server-side once, no multi-stage round-trips

**The drift this fixes:** My typical pattern is `screenshot → save → Pillow crop → save → Read`. Three round-trips, ~3-5s wall-clock total. For text reading this is overkill.

**Do:**
- Crop server-side in a single Pillow call, save to one file, Read it. ONE round-trip after the screenshot.
- For text inside a known-shape dialog (e.g. "Build Failed" / "Build Succeeded"), use a tiny pre-known crop region (e.g. the toolbar build-status text at y=12 x=830-1000) and read directly. Skip Pillow text-row scanning entirely.
- For reading FORM FIELD VALUES (Build = "1" or "2"), prefer `osascript -e 'tell app "Xcode" to get value of text field 1 of ...'` over screenshot+OCR. Mac UI Automation accessible via osascript is faster and more reliable than pixel reading. Mac UIA from Windows-side (UIAutomationCore on Corazon) is NOT accessible across the RDP boundary.

**Do not:**
- Pipeline `screenshot → Pillow → Read` when one Pillow call could pre-position the crop to the known field.
- OCR a number that osascript could read in 200ms.

## Verification protocol

After applying these primitives to a flow:

1. Time the flow end-to-end with a stopwatch. Compare to pre-fast-path baseline.
2. Identify the slowest 3 steps in the new flow. Apply primitives 1-7 again where they didn't already.
3. Update the recipe's `*.coords.json` sidecar with any new verified coords.
4. Re-run the flow once with the cache hot. The second run should be 30-50% faster than the first because the cache lookups skip rediscovery.

## Fast-path checklist (run before any GUI sequence)

- [ ] Coord-cache sidecar consulted (`*.coords.json` for this recipe)
- [ ] Foreground-probe run, fg=target confirmed
- [ ] Decision branches identified — verification points planned
- [ ] App activation via `osascript activate` or `open -a`, NOT Spotlight or Dock click
- [ ] Field edits use home + shift+end + type, NOT triple-click
- [ ] Crops are pre-positioned to known fields, NOT full-screen
- [ ] Where possible, osascript-read field values instead of OCR

## Speed wins identified (6 May 2026)

| Step | Pre-fast-path | Post-fast-path | Saving |
|------|---------------|----------------|--------|
| Coord lookup (Build field y) | ~6s (Pillow scan) | ~0.5s (cache read) | ~5.5s |
| App launch (Xcode) | ~8s (mouse-to-bottom + Pillow scan + click + verify + recover-from-wrong-app) | ~1s (`open -a Xcode`) | ~7s |
| App switch (Xcode foreground) | ~12s (Spotlight click attempts + miss + retry) | ~0.5s (`osascript activate`) | ~11.5s |
| Field clear+type (Build = 2) | ~10s (triple-click + type + verify + backspace + retry + type + verify) | ~3s (home + shift+end + type + tab + 1 verify) | ~7s |
| Verify after every keystroke (5-step field edit) | ~25s (5 × 5s screenshot+crop+read) | ~5s (1 verify at the end) | ~20s |

Cumulative: a single iOS release flow goes from ~12 minutes (with manual recovery cycles) to ~4 minutes (cache hot, fast-path applied). Apple-side upload latency (~5 minutes) becomes the bottleneck.

## Failure modes

- **Coord cache stale across Xcode/macOS update**: when verified_run is older than current macOS minor or Xcode minor, treat cache as untrusted and re-verify before relying on it.
- **`osascript activate` fails silently**: if the target app isn't running, activate is a no-op. Use `open -a` first to launch, then `activate` to bring forward.
- **Foreground probe lies**: PowerShell GetForegroundWindow returns the Win32 window, not the Mac window inside RDP. If RDP frame is foreground but the macOS window inside is wrong, the probe says match=True but the click still goes to the wrong macOS window. Recovery: run `osascript activate <target>` to bring the right macOS window forward inside the RDP frame.
- **Helper script not yet shipped to Corazon**: the `gui-fast.ps1` referenced by primitive 1+4 may not exist yet on Corazon. Check before relying. If absent, fall back to the inline patterns documented above.

## Anti-patterns

- **Coord-discovery dressed as caution**: "let me re-scan to be safe" when the cache has a coord verified 5 minutes ago in the same session = wasted 5 seconds.
- **Verification theatre**: screenshot+Read after every single tool call to "be sure" without identifying whether the step has a branching outcome. Be sure at the branch, not at every keystroke.
- **Spotlight muscle memory**: clicking the magnifying glass icon because that's what humans do. We're an agent driving via RDP — the Terminal-osascript path is faster and more reliable.
- **Hardcoded coords without sidecar update**: writing `(790, 398)` inline in the recipe markdown but forgetting to populate the `.coords.json` sidecar leaves future sessions re-discovering the same coord.

## Reachability footnote (6 May 2026)

The 100x lift would be direct VPS→SY094 agent calls, eliminating Corazon as middleman for non-GUI commands. As of 6 May 2026 12:55 AEST:
- SY094 is NOT on the Tailscale tailnet (only `ecodia-vps` and `corazon` are)
- Direct curl to `103.246.99.94:7456/api/health` from VPS times out (port not exposed externally)
- Path forward: install Tailscale on SY094 inside the RDP terminal (one-time, requires Tate authorisation per `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md`)

Once SY094 is on the tailnet, Worker 3 of the original GUI speed-up plan re-fires: the conductor calls `screenshot.screenshot` and `shell.shell` directly against SY094's agent at its tailnet IP, no Corazon hop. Estimated latency reduction: 5-10x per primitive.

## Origin

6 May 2026 12:50-12:53 AEST. During the Co-Exist iOS 1.8(2) release flow on SY094 (build field bump, archive, distribute), I observed that ~70% of wall-clock time was verification + discovery overhead, not actual work. The recovery cycles from a triple-click failure (project rename mistake → "2App" → "App" recovery, ~3 minutes) and a Dock-icon misclick (Android Studio instead of Xcode, ~1 minute) made the cost concrete. Tate flagged the slowness explicitly: "we chat about the speed of your gui usage" → "you go ahead and implement everything you need to and can to make your gui usage better. You all out."

Pattern authored on main thread (energy cap rejected the manager fork at the time of writing — see `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md`). The accompanying helper scripts (`gui-fast.ps1` on Corazon, `gui-fast` on VPS) and recipe-update sweeps to follow as energy frees up.

## Cross-references

- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — the recipe being optimised; due for an update pass that swaps Spotlight clicks for osascript-activate
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` — RDP entry recipe; due for the same update pass
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — the meta-doctrine that calls for 7-step optimisation; this pattern IS the second worked example
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — the peer paradigm; fast-path primitives are peer-surface compositions
- `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md` — the constraint that motivates the Tailscale-on-SY094 reachability path
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` — step-verify protocol; fast-path's primitive 2 is a refinement (verify at branches, not all steps)

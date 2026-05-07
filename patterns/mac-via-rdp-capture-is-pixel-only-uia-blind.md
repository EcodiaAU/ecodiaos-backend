---
triggers: mac-via-rdp-capture, rdp-pixel-only-replay, mic-recording-uia-blind, IHWindowClass, mstsc-uia-boundary, mac-rdp-recording, replay-method-pixel-only-screenshot-verify, recording-on-corazon-mac-target, capture-substrate-constraint, input-capture-window-rdp-shell, rdp-uia-blind, rdp-aqua-boundary
---

# Mac-via-RDP recordings on Corazon are pixel-only - UIA cannot reach Aqua through the RDP boundary

## The rule

When the Corazon-side macro recorder captures a flow performed inside a MacInCloud RDP session, every Mac-side click registers as a Win32 click inside the RDP container window (`mstsc.exe`, class `IHWindowClass`, name "Input Capture Window") at pixel coordinates. The Win32 UI Automation tree does not pass through the RDP boundary; the Mac's Aqua UI tree is invisible to the recorder. These captures MUST be replayed by pixel coordinates with cropped-screenshot post-verify between steps, NOT by UIA pattern match.

## Why this happens

- macro-recorder.ahk runs on Corazon (Windows host)
- Microsoft RDP client (`mstsc.exe`) renders the remote Mac display as a single Win32 child window
- Windows UIA can enumerate the RDP client window and its direct properties, but cannot enumerate the macOS Accessibility tree on the other side of the RDP transport
- Every click the user performs against a Mac UI element registers on the Windows side as "click at (x, y) inside the RDP container, target = the RDP shell"
- Pixel coordinates ARE captured correctly (the OS hook recorder gets them from the Win32 event stream)
- UIA selectors are NOT meaningful for Mac-side targets; they describe the RDP shell, not the Mac element

## How to detect Mac-via-RDP captures

Inspect the captured `events.jsonl`. Any event where:

- `window_title` contains `Remote Desktop Connection` OR `MacinCloud_Full_Screen` OR `MIC`, OR
- `target_uia_selector` contains `name="Input Capture Window"` OR `class=IHWindowClass`, OR
- `foreground_app_exe` is `mstsc.exe`

is a Mac-via-RDP event. If ANY event in the recording matches, treat the WHOLE recording as Mac-via-RDP and tag the emitted recipe accordingly.

## Recipe frontmatter contract

Mac-via-RDP recipes carry:

```yaml
replay_method: pixel_only_screenshot_verify
capture_substrate: corazon-recorder-mac-via-rdp
uia_reliable: false
pixel_coords_reliable: true_if_rdp_window_layout_matches
```

Non-RDP recipes (Corazon-only or Mac-native) keep the default:

```yaml
replay_method: uia_or_pixel
```

## Replay protocol for pixel_only_screenshot_verify recipes

For each step:

1. Pre-verify: foreground window is `mstsc.exe` with title containing `MacinCloud_Full_Screen` or `Remote Desktop Connection`. If not, restore via the K-17 UIA NativeWindowHandle path or fail fast.
2. Pre-verify: cropped screenshot of expected pre-state at the click area matches a baseline (or, if no baseline yet, just confirm pixels are not pure background).
3. Action: `input.click({ x, y })` at the captured pixel coordinates.
4. Post-verify (within budget, default 3s): screenshot diff at the click area shows ANY pixel change OR a target-state baseline match. If no change after budget, the click did not land - HALT, do not proceed.
5. Per-step screenshots saved to a run log so failed replays can be inspected after.

This mirrors `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` which has shipped pixel-based Mac-RDP automation since 4 May 2026.

## Filtering session boundary noise

Recordings start and end on the Corazon side, so the first and last events often capture clicks on Corazon-native windows (the recorder hotkey was triggered while EcodiaOS chat was foreground; the user switched a Chrome tab right after stopping; etc). These are NOT replay steps. The recipe-emitter MUST detect cross-window noise:

- First N consecutive events with `foreground_app_exe != mstsc.exe` AND not on the canonical Mac flow's window: mark `noise_filtered: true`, exclude from replay path, keep in audit appendix.
- Last N consecutive events with the same shape: same treatment.
- Mid-session events where `foreground_app_exe` momentarily switches off `mstsc.exe`: keep in replay path but tag `boundary_event: true` for human review.

## What this rule corrects

**Failure mode caught 6 May 2026:** the prior recordings-process fork inspected Recording 1 (iOS release on MIC), saw 5 of 6 events with selector `Input Capture Window` / `IHWindowClass`, and concluded "Tate clicked the recorder overlay during the recording." That was wrong. There was no overlay; the events were the actual MIC clicks, just labelled with the only UIA selector visible on the Windows side. Pixel coordinates `(323, 4)`, `(355, 93)`, `(945, 202)`, `(904, 526)` ARE the real iOS-distribute-to-ASC clicks Tate performed inside the Mac.

The misdiagnosis blocked downstream handler authoring for 30 minutes and would have triggered an unnecessary "re-record with overlay hidden" ask back to Tate. Codifying this rule prevents the next conductor from making the same mistake.

## Two architectural paths beyond this constraint

- **Path A (current default):** accept the constraint. Mac-via-RDP recipes are pixel-replay with screenshot post-verify. Cheap, immediate, mirrors the existing `sy094-coexist-ios-release-recipe.md` substrate. Reliable as long as the RDP container window layout is identical at replay time (foreground, position, size).

- **Path B (heavier engineering):** stand up a recorder substrate ON the Mac itself (SY094) that captures via Quartz event tap + macOS Accessibility API. Native UIA replay becomes possible. Cost: half-day to engineer; running two recorder pipelines (Corazon for native Win flows, SY094 for native Mac flows). Decision deferred until pixel-replay reliability becomes a real bottleneck; existing iOS release recipe has shipped successfully on the Path A substrate already.

## Do

- Tag every recording that touches MIC RDP with `replay_method: pixel_only_screenshot_verify`.
- Filter session-boundary cross-window events from the replay path.
- Use cropped-screenshot post-verify between every Mac-RDP step.
- Pre-verify foreground window is `mstsc.exe` with the MIC title before any pixel click on these recipes.

## Do not

- Treat `Input Capture Window` UIA selectors as evidence the user clicked an overlay or recorder UI. They are the RDP shell's own UIA name; the user clicked through it onto the Mac.
- Try to write a UIA-pattern-match handler for a Mac-via-RDP recipe. The Aqua tree is unreachable; the handler will fail at first invocation.
- Mix Mac-via-RDP and Corazon-native steps in a single handler without explicitly switching between substrates (RDP foreground vs Corazon-native foreground).
- Dispatch a fork to "re-record with the overlay hidden" for a Mac-via-RDP capture; the overlay was never the issue.

## Origin

Tate verbatim 6 May 2026 ~20:30 AEST after the recordings-process fork misdiagnosed Recording 1's `IHWindowClass` selectors as overlay-clicks: "i was recording use ofthe MIC/RDP so could htat have been the problem?"

Confirmed by inspection of `~/ecodiaos/macros/captures/ios-release-rdp-mac-distribute-to-asc-2026-05-06-1018.md` coordinates table, which shows steps 2-5 with `window=MacinCloud_Full_Screen - SY094.macincloud.com:6000 - Remote Desktop Connection` and pixel coords matching plausible MIC-Mac UI positions for the iOS distribute-to-ASC flow.

Tate verbatim 6 May 2026 ~20:32 AEST authorising codification: "Yeah codify it, then lets run it."

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - meta-doctrine; this rule extends the recipe frontmatter contract with `replay_method`.
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - existing pixel-based Mac-RDP recipe, the Path A reference implementation.
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` - capture mechanics for the v2 recorder this rule constrains.
- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` - parent doctrine for the macro Phase 2 pipeline.
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - per-step pre-and-post verify protocol the pixel-replay protocol implements.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon's tool surface; filesystem.* + input.* + screenshot.* are the substrates this rule operates on.
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - sibling constraint on the Mac access path; SSH for headless work, RDP for GUI-bound work.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - real-run-before-validated_v1 still applies; pixel coords don't substitute for replay validation.

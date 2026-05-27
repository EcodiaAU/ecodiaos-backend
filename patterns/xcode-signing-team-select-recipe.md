---
triggers: macro-recipe, captured-recipe, xcode-signing-team-select, xcode, signing, team, select, eos-mobile, ios-release, ios-build, codesign, automatic-signing, macincloud-full-screen, sy094-macincloud-com, mstsc-exe, mac-via-rdp
capture_method: os-hook-recorder
captured_at: 2026-05-07T03:13:50.080Z
flow_slug: xcode-signing-team-select
status: untested_spec
replay_method: pixel_only_screenshot_verify
capture_substrate: corazon-recorder-mac-via-rdp
uia_reliable: false
pixel_coords_reliable: true_if_rdp_window_layout_matches
raw_event_count: 9
vision_enriched_count: 0
vision_errored_count: 0
vision_skipped_count: 0
vision_auth_source: skipped
session_id: 2026-05-07-1235-rcc1lk+2026-05-07-1236-7s4aft
merged_from:
  - 2026-05-07-1235-rcc1lk (part1, 6 clicks)
  - 2026-05-07-1236-7s4aft (part2, 3 clicks)
---

# Xcode Signing Team Select (captured via os-hook-recorder)

## Origin

Auto-emitted from a 2-session os-hook-recorder capture run on 2026-05-07T02:35-T02:37 AEST during the EOS Mobile iOS release pipeline setup. Tate hit Ctrl+Shift+R on Corazon, performed Xcode → Signing & Capabilities → Team selection inside the SY094 RDP window, stopped the recorder, then restarted to capture the remaining clicks. Part1 + Part2 are the same flow split by recorder-restart. Merged into a single recipe per the Tate-recordings doctrine that recording artifacts (split-mid-flow) should be hand-merged into flow-semantic units. The flow is one-time-per-app-bundle: select the Apple Developer team Xcode automatic signing should use for `EOS Mobile`.

## When to use this

Run this recipe whenever a fresh checkout of an iOS Xcode project on SY094 needs the signing team selected for automatic codesigning, OR when Xcode loses the team selection (typically after Apple ID re-auth or team membership change). The recipe is also the canonical point in the iOS release pipeline immediately before a manual `xcodebuild -exportArchive` step expects a valid signing identity.

Inferred destination(s): MacinCloud_Full_Screen - SY094.macincloud.com:6000 - Remote Desktop Connection (Xcode running inside the RDP'd Mac Aqua session).

## Pre-flight

- Microsoft RDP shortcut on Corazon desktop (`MacinCloud_Full_Screen.rdp`) connected to SY094, full-screen.
- Xcode open on SY094 with the EOS Mobile project (or whichever app needs the team).
- Project navigator: target selected, "Signing & Capabilities" tab in focus.
- `kv_store.creds.macincloud` reachable (RDP credentials).
- foreground-window-equality probe (per `cowork-no-focus-collision.md`): foreground window MUST be `MacinCloud_Full_Screen ... Remote Desktop Connection` before any `input.click` fires.

Program(s) involved:
- MacinCloud_Full_Screen - SY094.macincloud.com:6000 - Remote Desktop Connection (program: mstsc.exe - the RDP shell. Xcode runs inside Aqua, invisible to UIA below this layer.)

## Replay constraints

This recipe was captured via Corazon recorder while Tate operated through Microsoft RDP into SY094. UIA selectors describe the RDP shell (mstsc.exe `IHWindowClass`), NOT the Mac UI elements. Do NOT use UIA selectors for replay. Replay protocol:
- pixel coordinates against the RDP window in its captured size
- cropped-screenshot post-verify per step (compare a 50-100px crop around the click to the captured `frames/<n>-post.png`)
- if the RDP window layout differs from capture (resolution, scale, sidebar widths), pixel coords will MISS - re-record before fast-pathing

See `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md`.

## Verified coordinates table

| Step | Action | X | Y | Target text (RDP-shell only) | UIA selector hint (RDP-shell only) | Window | Captured-at |
|---|---|---|---|---|---|---|---|
| 1 | click | 669 | 750 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:35:21.000Z |
| 2 | click | 335 | 621 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:35:23.000Z |
| 3 | click | 234 | 133 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:35:51.000Z |
| 4 | click | 585 | 132 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:35:58.000Z |
| 5 | click | 508 | 151 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:36:02.000Z |
| 6 | click | 551 | 286 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:36:09.000Z |
| 7 | click | 693 | 756 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:36:48.000Z |
| 8 | click | 692 | 236 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:36:50.000Z |
| 9 | click | 936 | 498 | Input Capture Window | type=pane name="Input Capture Window" class=IHWindowClass | MacinCloud_Full_Screen | 2026-05-07T02:36:55.000Z |

<!-- Coords above were captured at recording time. Re-verify against the live RDP window before codifying as `validated_v1`. -->

## Step-by-step procedure

1. Left-click `(669, 750)` in RDP window - Xcode lower-left interaction (likely target/scheme picker open).
2. Left-click `(335, 621)` in RDP window - Xcode left sidebar interaction.
3. Left-click `(234, 133)` in RDP window - Xcode top toolbar / project navigator area.
4. Left-click `(585, 132)` in RDP window - Xcode top tab bar interaction.
5. Left-click `(508, 151)` in RDP window - Xcode signing area row.
6. Left-click `(551, 286)` in RDP window - Xcode signing team dropdown.
   _(Recorder paused here; second part picks up at T+39s.)_
7. Left-click `(693, 756)` in RDP window - Xcode lower-area interaction (target/scheme picker re-open).
8. Left-click `(692, 236)` in RDP window - Xcode "Signing & Capabilities" section interaction.
9. Left-click `(936, 498)` in RDP window - Xcode signing-team selection finalised.

### Noise events (excluded from replay)

_Captured at session boundaries but tagged `noise_filtered: true` by the Mac-via-RDP noise filter._

- Part1 pre-flow: click on Input Capture Window at `(917, 738)` (`02:35:18.000Z`) - recorder hotkey landing.
- Part1 post-flow: click on tab "Certificates, Identifiers & Profiles - Apple Developer" at `(939, 0)` (`02:36:14.000Z`) - switching out to Apple Dev portal between parts.
- Part2 pre-flow: click on Input Capture Window at `(928, 741)` (`02:36:44.000Z`) - recorder hotkey landing.
- Part2 post-flow: click on tab "Certificates, Identifiers & Profiles - Apple Developer" at `(1056, 6)` (`02:37:15.000Z`) - switching out at end.

## Verification protocol

| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |
|---|---|---|---|---|
| 1-9 | foreground window title contains "MacinCloud_Full_Screen" AND "Remote Desktop Connection" | left-click pixel coords as captured | screenshot crop ~80px around click matches captured `frames/<n>-post.png` ±5% pixel diff | 2s/step |

<!-- TODO: per-step pre/post-verify probes once recipe is replayed end-to-end against live UI (see ~/ecodiaos/patterns/gui-step-verify-protocol.md). -->

## Fast-path checklist

```
# foreground check
input.foreground_window  # must contain "MacinCloud_Full_Screen"

# 9 sequential clicks (all pixel-only, no UIA below RDP boundary)
input.click x=669 y=750
input.click x=335 y=621
input.click x=234 y=133
input.click x=585 y=132
input.click x=508 y=151
input.click x=551 y=286
# (interlude - Xcode may need 1-3s to open the team picker)
input.click x=693 y=756
input.click x=692 y=236
input.click x=936 y=498
```

## Speed wins identified

- [ ] Batch the 9 clicks into a single `input.click_sequence` call once the laptop-agent supports it; saves 8 Tailscale RTTs.
- [ ] Replace fixed sleep between part1 and part2 with a screenshot-crop probe of the team-picker area.
- [ ] Capture `frames/N-post.png` references for cropped-screenshot post-verify in a future replay run; without these, fallback is full-screenshot diff which is noisy.

## Failure modes

- Symptom: click misses the target. Cause: RDP window resized between record + replay, or Mac display scale changed. Fix: re-record (pixel coords are RDP-window-size-locked).
- Symptom: clicks land but Xcode does not advance signing-team selection. Cause: Apple ID has lost team membership or 2FA pending. Fix: drop into Xcode manually and re-auth via Apple ID prefs.
- Symptom: foreground-window probe fails (different window in front). Cause: Tate or another macro stole focus. Fix: re-foreground RDP window via `input.foreground_window`, retry from step 1.

## Anti-patterns

- Pixel-click first when UI Automation works on the target. Inside RDP, UIA is BLIND to Mac Aqua - pixel is the only path. Outside RDP (Xcode launched on a real Mac), prefer AX/UIA.
- Authoring coords from imagination - these were captured from a real run; do NOT amend coords without a fresh recording or live UIA enumeration.
- Marking this recipe `validated_v1` without a real replay. The capture proves the flow happened once; it does NOT prove the codified replay path works.
- Trusting UIA selectors below the RDP boundary - `mstsc.exe` exposes only its own shell to UIA. Mac Aqua elements are pixel-only.

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the meta-doctrine this recipe instantiates.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - status flips to `validated_v1` only after a real replay run.
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` - capture-method-specific doctrine.
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - the per-step pre/post-verify protocol all recipes implement.
- `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md` - replay-method gating for Mac-via-RDP captures.
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - sister recipe for the iOS release pipeline this signing-team-select feeds into.
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - why this flow is RDP-bound (Xcode IDE = GUI Aqua context).

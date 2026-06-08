---
triggers: focusless, focus steal, ios simulator drive, sim tap, idb ui tap, simctl, cliclick steals focus, osascript activate, android emulator drive, adb input, native sim test, drive simulator, mac focus
status: active
---

# Driving a mobile simulator must be 100% focusless (idb / simctl / adb, never activate + cliclick)

Origin: 2026-06-09, Co-Exist iOS sim test. To tap the iOS Simulator I used
`osascript -e 'tell application "Simulator" to activate'` then `cliclick` at
mapped screen coordinates. That works, but it STEALS FOCUS: it raises the
Simulator window, moves the real cursor, and sends OS-level clicks - hijacking
whatever Tate is doing on the Mac. Tate verbatim: "this is stealing focus of the
mac which you shouldnt be doing. This should always be 100% focusless."

## The rule

Any automated interaction with a simulator/emulator runs through a channel that
injects events into the device daemon directly, never through the host's window
focus, cursor, or keyboard. The host stays usable by the human the entire time.

**Why:** the Mac is Tate's live machine. Focus theft mid-task is the same class
of harm as `cowork.kill_worker` on the wrong window or sending Escape into a
shared Chrome ([[cowork-no-focus-collision]]). Autonomy that disrupts the human's
foreground is not autonomy, it is interference. The forcing function (Africa trip)
means the Mac runs unattended AND attended; a focus-stealing test is unsafe in
both modes.

## How to apply

**iOS Simulator (focusless stack):**
- Boot headless: `xcrun simctl boot <udid>` (do NOT `open -a Simulator` - the
  daemon runs without the viewer window; the window is only for human watching).
- Install / launch / terminate: `xcrun simctl install|launch|terminate <udid> <bundle>`.
- Tap / type / swipe / press: **`idb ui tap X Y --udid <udid>`**,
  `idb ui text "..."`, `idb ui swipe`, `idb ui button`. idb injects into the sim
  via its companion - no focus, no cursor, device-point coordinates (no
  window-geometry mapping). Install once: `brew install idb-companion` +
  `python3 -m pip install --user fb-idb`.
- Screenshot: `xcrun simctl io <udid> screenshot <path>` (focusless).
- Read logs: `xcrun simctl spawn <udid> log show --predicate ...` (focusless).

**Android emulator (already focusless):** `adb shell input tap/text/swipe`,
`adb shell am start`, `adb exec-out screencap`, WebView CDP via
`adb forward` + a Node CDP client. None touch host focus.

**WebView content driving:** Android = `adb forward` to the webview CDP socket
(focusless). iOS = `ios_webkit_debug_proxy` (focusless WHEN it works; broken on
Xcode 26 simulators as of 2026-06-09, so fall back to idb UI taps + screenshots).

## Anti-patterns (all steal focus - never do these to drive a sim)

- `osascript ... 'tell application "Simulator" to activate'` then `cliclick`.
- `cliclick` / `cu.*` mouse events mapped onto a simulator window.
- `osascript ... keystroke` into a focused sim field (sends to the foreground app).
- `open -a Simulator` purely to make a window clickable.

The coordinate-tap-on-window approach is the wrong tool even though it "works":
it is the iOS equivalent of driving Chrome by moving Tate's real mouse instead of
CDP. Reach for the daemon-injection channel (idb/simctl/adb) every time.

Cross-refs: [[cowork-no-focus-collision]],
[[drive-chrome-via-input-tools-not-browser-tools]],
[[mac-local-headless-ios-ship-via-asc-api-2026-06-08]].

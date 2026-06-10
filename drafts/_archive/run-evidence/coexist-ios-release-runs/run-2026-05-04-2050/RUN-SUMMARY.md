# Co-Exist iOS release recipe authoring run

Fork: `fork_mor2yqdv_be0de0`
Date: 4 May 2026 21:00-21:08 AEST (8 minutes wall-clock)
Recipe authored at: `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md`

## Phase-by-phase timing

| Phase | Time | Path | Status |
|---|---|---|---|
| A — MIC open via mic-fast.ps1 | 6.41s | shell.shell | ✅ |
| B — Open macOS Terminal | n/a | osascript blocked, input.shortcut blocked, fell back to `open -a Terminal` (0.59s) | ✅ via fallback path |
| C — git status + git pull | 1.90s | SSH | ✅ |
| D — npm install | 4.00s | SSH bash -lc | ✅ |
| E — npm run build (Vite) | 1.65s | SSH bash -lc | ✅ |
| F — npx cap sync ios | 1.16s | SSH bash -lc | ✅ |
| G — npx cap open ios + Xcode load | 19.03s | SSH + UIA RDP-restore | ✅ |
| H — iPhone 17 sim build + install + launch + screenshot | 51.0s (build 45.3s + install/launch 5.7s) | xcodebuild + simctl | ✅ |
| I-J — sim stop | 1.85s | xcrun simctl | ✅ |
| K — Archive | 29.2s after keychain prep (29.6s + 27.2s wasted on errSecInternalComponent before fix) | xcodebuild archive | ✅ on 3rd attempt |
| L1 — Export .ipa | 2.88s | xcodebuild -exportArchive | ✅ |
| L2 — Upload to ASC | HALTED | Tate-required: 2FA OR ASC API key | status_board P1 e6ca51dc |

**Total: 116s (Phase G/H included), 48s (skip G/H).**

## Failure modes hit + recovered

1. `input.shortcut [cmd,space]` does not translate to Mac ⌘Space via RDP — captured by Corazon Win32 layer
2. `osascript` blocked by macOS Automation permissions over SSH (`-1743`)
3. Win32 `FindWindow("TscShellContainerClass", $null)` returned 0 — used UIA `Current.NativeWindowHandle` instead
4. `xcodebuild -workspace App.xcworkspace` errored — Capacitor SPM ships only `.xcodeproj`
5. Archive failed `errSecInternalComponent` on framework codesign — fixed via `security unlock-keychain` + `set-key-partition-list`
6. PowerShell C# escape collision in inline `Add-Type` — fixed by writing script to file

All failures + fixes encoded in recipe `Failure modes` section.

## Files in this run-log directory

- `phase-a-mic-loaded.png` — Mac desktop after MIC open
- `phase-b-terminal.png` — failed Spotlight attempt
- `phase-b3-terminal-open-a.png` — `open -a Terminal` (caught Chrome-foreground due to Cowork-no-focus-collision)
- `phase-g-xcode-loaded.png` — Xcode loaded with App project
- `simulator-screenshot.png` — Co-Exist Welcome back / Login screen on iPhone 17 sim
- `phase-c-git.log` — git pull verbatim output
- `phase-d-npm-install.log` — npm install verbatim
- `phase-e-build.log` — Vite build verbatim
- `phase-f-cap-sync.log` — cap sync verbatim
- `phase-g-cap-open.log` — cap open verbatim
- `phase-h-sim-build.log` — xcodebuild simulator verbatim
- `phase-k-archive.log` — first archive attempt (failed: errSecInternalComponent on 5 frameworks)
- `phase-k-archive2.log` — second archive (after unlock + partition list, failed only IONCameraLib)
- `phase-k-archive3.log` — third archive (succeeded after re-running partition list right before)
- `phase-l-export.log` — export .ipa verbatim
- `coexist-v1.7-build1.ipa` — final shippable .ipa, 10.5 MB, signed Apple Distribution: Ecodia Pty Ltd (86PUY7393S)

## Authored / referenced artefacts

- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — primary recipe, 10-section anatomy
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — meta-doctrine recipe index updated with new entry
- status_board row `6141af22-a70f-4338-b2a9-5aa44f1294f6` — Phase H simulator checkpoint (P3)
- status_board row `e6ca51dc-7103-4e3a-88bb-139274456e2b` — Phase L upload Tate-required (P1)

## What's next (for Tate)

**Single durable action that unblocks all future iOS releases for both Co-Exist AND Roam:**
1. Sign in to appstoreconnect.apple.com/access/api as `code@ecodia.au`.
2. Generate an ASC API key with **App Manager** access (or Admin if needed for IAP).
3. Save the .p8 file to `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` on SY094.
4. Save Key ID and Issuer ID to `kv_store.creds.asc_api_key`.
5. Subsequent iOS releases run fully autonomously via this recipe + `xcrun altool --upload-app --apiKey ... --apiIssuer ...`.

Until then, the .ipa is at `~/ecodiaos/drafts/coexist-ios-release-runs/run-2026-05-04-2050/coexist-v1.7-build1.ipa` and can be uploaded via Transporter (sign in code@, drag, click Deliver, 2FA SMS).

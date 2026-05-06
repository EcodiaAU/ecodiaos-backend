---
triggers: coexist-ios-release, coexist-asc-upload, capacitor-ios-build, capacitor-ios-archive, xcode-archive, xcode-export-archive, asc-upload, ios-shipping-pipeline, npx-cap-sync, npx-cap-open, ios-release-recipe, sy094-ios-pipeline, ipa-export, manual-signing-archive, errSecInternalComponent, headless-codesign-keychain, distribution-provisioning-profile, app-store-connect-key, ecodia-code-profile, [redacted]-ipa, coexistaus-bundle, xcode-apple-id-signin, version-train-closed, marketing-version-bump, cfbundleshortversionstring, run-button-toolbar-coords, xcode-organizer-distribute, ios-gui-flow-end-to-end, ios release, ship ios build, ship the ios build, ship coexist ios, release ios, app store connect upload, asc upload, appstoreconnect.apple.com, asc dashboard, asc, transporter upload, testflight upload, build coexist ios, capacitor ios, capacitor sync, archive in xcode, distribute to app store
---

# Co-Exist iOS release recipe — verified end-to-end ~10min from version bump to "Uploaded to Apple"

> **DEPRECATED SSH STEPS — 5 May 2026.** This recipe was authored on a now-forbidden SSH-from-VPS path.
> SSH on MacInCloud is forbidden per [`~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md`](never-use-ssh-on-macincloud-rdp-only.md).
> Re-author all SSH-driven steps onto the RDP-terminal path on next iOS-release iteration.
> Until re-authored, this recipe is informational only — DO NOT DRIVE.
>
> **NOTE — Cowork deprecated 5 May 2026.** The Cowork no-focus-collision cross-ref (line 58 original) refers to a rule whose framing is deprecated, but the rule itself (foreground-window probe before any `input.*` operation) is preserved per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. The foreground probe applies to ALL laptop-agent `input.*` calls regardless of substrate.

End-to-end iOS release pipeline for Co-Exist (`org.coexistaus.app`). Bumps version, pulls latest source on SY094, builds, smoke-tests on iPhone 17 Pro sim, archives signed for distribution, uploads to App Store Connect via the in-Xcode GUI flow. **No Tate-action required for the release-cycle steps anymore** — Apple ID password lives in `kv_store.creds.apple.password` per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`, and Xcode caches the signin in Mac Keychain across sessions.

> **Meta-doctrine:** This is a worked instance of `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. The MIC entry phase (Phase A) is itself a worked instance of `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`. Read both before authoring or optimising this recipe further.

## Origin

**Tate verbatim 4 May 2026 20:49 AEST:** "once you're in the MIC instance, going to terminal, getting to the local coexist repo at ~/desktop/projects/coexist the nrunning git pull, npm install, npm run build, npx cap sync ios, npx cap open ios, (checking/fixing anything that goes wrong or different). Then running xcode simulator with iphone 17 to test anything thats changed since last app version, then changing back to arm 64, archiving, likely logging back into code@ apple id account, sending to ASC."

**Tate verbatim 4 May 2026 22:18 AEST** (codifying credential storage + Xcode logout reality): "C0d!ng7h3fu7ur3" + "It logs out of xcode every now and then so you HAVE To be able to do it yourself."

**Tate verbatim 4 May 2026 22:25 AEST** (instructing the verified end-to-end run this recipe codifies): "you've got most of the recipe in-tact now. Im going to close MIC and you're going to go all the way through that flow again, as fast as you can while staying correct."

First end-to-end success: 4 May 2026 22:50 AEST. Build 1.8(1) uploaded to App Store Connect via the Xcode Organizer GUI flow on Corazon → SY094 RDP. Total wall-clock ~10 minutes (conductor-driven steps ~5 min, Apple-side upload latency ~5 min). Organizer shows `May 4 1.8(1) Uploaded to Apple` with green checkmark. Build 1.7(2) had been blocked at Xcode "No Accounts" earlier in the night (status_board row `4943454a-ba7c-4b3a-9401-8e380874a673`); password storage + signin during that session unblocked everything for 1.8(1).

Recipe authored as upgrade-in-place over the prior partial-run version (which had only verified through `.ipa` export and called L2 "Tate-required").

## When to use this

Use this recipe when:

- A new Co-Exist build is needed for App Store Connect (TestFlight or Production)
- The latest commits on `main` need to ship as the app binary
- A test build for visual smoke-test on iPhone 17 Pro sim is needed before archiving
- Any other Capacitor iOS app following the same Xcode workspace structure (project at `~/Desktop/projects/<slug>/ios/App/App.xcodeproj`, signed by Ecodia Pty Ltd team, distributing to ASC) — adapt the bundle identifier + provisioning profile name + repo path

Do NOT use this recipe when:

- Modifying Co-Exist source code (this recipe respects `~/ecodiaos/patterns/client-code-scope-discipline.md`; recipe is version-bump → pull → build → ship only — the `MARKETING_VERSION` bump in the pbxproj is the ONLY mutation, and even that is uncommitted by default)
- Pushing changes back to origin/coexist (recipe leaves the version bump uncommitted; Tate or a separate commit decision pushes back)
- Submitting In-App Purchases (Co-Exist has no IAP; if it ever does, the Paid Apps Agreement must be Active first — verified Active 4 May 2026)

## Pre-flight

| Requirement | Verification |
|---|---|
| `kv_store.creds.macincloud` populated with `username` + `password` | `SELECT value::jsonb -> 'username' FROM kv_store WHERE key='creds.macincloud'` |
| `kv_store.creds.apple.password` populated with Apple ID password for `code@ecodia.au` | `SELECT value::jsonb -> 'value' FROM kv_store WHERE key='creds.apple.password'` returns non-null. See `~/ecodiaos/docs/secrets/apple.md` |
| `kv_store.creds.laptop_agent.agent_token` matches Corazon agent | `curl http://100.114.219.69:7456/api/health` returns `{status:'ok'}` |
| Co-Exist repo present at `~/Desktop/projects/coexist/` on SY094 | `ssh user276189@SY094 'ls -d ~/Desktop/projects/coexist/.git'` |
| `Apple Distribution: Ecodia Pty Ltd (86PUY7393S)` cert in login keychain | `ssh ... 'security find-identity -v -p codesigning' \| grep 86PUY7393S` |
| `Ecodia_Code.mobileprovision` either on `~/Desktop/` (this run installs it) or already in `~/Library/MobileDevice/Provisioning Profiles/` | `ls ~/Desktop/Ecodia_Code.mobileprovision` OR `ls ~/Library/MobileDevice/Provisioning\ Profiles/Ecodia_Code.mobileprovision` |
| Login keychain unlock-able with the SSH password (verified true on SY094 4 May 2026) | `security unlock-keychain -p '<sshpass>' ~/Library/Keychains/login.keychain-db; echo $?` returns 0 |
| At least 5 GB free under `/tmp` (derived data + archive + ipa ~= 4 GB) | `ssh ... 'df -h /tmp'` |
| Paid Apps Agreement Active on App Store Connect for Ecodia Pty Ltd | appstoreconnect.apple.com/business — verified Active 4 May 2026 |
| Apple ID `code@ecodia.au` already added to Xcode → Settings → Accounts (PERSISTENT once added; only re-add when Xcode "logs out every now and then" per Tate verbatim) | Open Xcode Settings → Accounts; if empty, run the **Xcode Apple ID signin sub-procedure** below |

Foreground-collision check applies to Phase G–L (Xcode + RDP GUI driving). See `~/ecodiaos/patterns/cowork-no-focus-collision.md`. Probe Corazon foreground window equality before any `input.*` keystroke; defer if Tate's foreground is the planned Cowork target.

## Verified coordinates table

Resolution: **1366×768 Corazon RDP fullscreen**, with the SY094 Mac rendered at native scale inside it. Coords valid as of **4 May 2026 22:50 AEST**. Coords drift across Xcode releases AND when the RDP control bar is docked at top vs auto-hidden — re-walk via UIA before relying on these on a new Xcode version or new MacInCloud session.

| UI element | Window / Context | (X, Y) | Verified |
|---|---|---|---|
| Xcode toolbar **Run button** (`▶`) — direct invoke | Xcode top-level, project workspace open | (175, 29) | 2026-05-04 22:35 AEST |
| Xcode toolbar **destination dropdown** — opens "Any iOS Device", "Any iOS Simulator Device", iPhone 17 Pro etc. menu | Xcode top-level, RDP control bar hidden | (490, 14) when menu bar visible / (490, 29) when menu bar hidden | 2026-05-04 22:38 AEST |
| Dropdown entry **"Any iOS Device (arm64)"** in destination dropdown's Build section | Xcode destination dropdown opened from current toolbar | (470, 159) | 2026-05-04 22:39 AEST |
| macOS top menu bar (auto-hides in Xcode fullscreen) — reveal cursor target | macOS menu bar | move to (320, 1) | 2026-05-04 22:40 AEST |
| **Product** menu in macOS top menu bar (after reveal) | macOS menu bar visible | (320, 8) | 2026-05-04 22:40 AEST |
| Xcode Organizer **Distribute App** button | Organizer right pane, archive selected | (994, 205) | 2026-05-04 22:43 AEST |
| Method dialog **App Store Connect** option | "Distribute App" method-selection dialog | preselected (top-left of grid, ~(263, 235)) | 2026-05-04 22:44 AEST |
| Method dialog **Distribute** confirm button | Method-selection dialog, bottom-right | (905, 522) | 2026-05-04 22:44 AEST |
| Method dialog **Cancel** button | Method-selection dialog, bottom | (455, 522) | 2026-05-04 22:44 AEST |
| Method dialog **Manage Accounts...** button | Method-selection dialog, bottom (only when no Apple ID configured) | (535, 522) | 2026-05-04 21:55 AEST |
| Apple Accounts **Settings sidebar** entry | Xcode Settings, sidebar | ~(520, 490) | 2026-05-04 21:58 AEST |
| Apple Accounts **+ Add Apple Account** button | Xcode Settings → Accounts pane | (950, 505) | 2026-05-04 21:58 AEST |
| Upload-success dialog **Done** button | "App upload complete" dialog | (925, 522) | 2026-05-04 22:50 AEST |

The headless `xcodebuild`-only path (deprecated for this release flow but documented in Phase K-headless below) does NOT use any of these coords. The verified-success path 4 May 2026 used the GUI Archive flow because the in-Xcode signin pathway was the simplest unblock for "Xcode logs out every now and then".

If a future Xcode version moves these coords, re-walk via UIAutomation tree against the Xcode top-level window (NSWindow, title contains "App.xcodeproj") and update the table. Do not pixel-hunt by trial-and-error. See `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.

## Step-by-step procedure

### Phase 0 — Version bump (MARKETING_VERSION, only when shipping a new train)

If the previous **MARKETING_VERSION** (`CFBundleShortVersionString` in `ios/App/App.xcodeproj/project.pbxproj`) has already shipped to ASC, you must bump it BEFORE archiving. Apple closes the prior train when a build is approved, and any subsequent upload at the same MARKETING_VERSION fails with `Invalid Pre-Release Train. The train version 'X.Y' is closed for new build submissions` — see Failure mode K-12.

```bash
ssh user276189@SY094.macincloud.com "bash -lc '\
  cd ~/Desktop/projects/coexist/ios/App && \
  sed -i \"\" -E \"s/MARKETING_VERSION = 1\\.7;/MARKETING_VERSION = 1.8;/g\" App.xcodeproj/project.pbxproj && \
  sed -i \"\" -E \"s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = 1;/g\" App.xcodeproj/project.pbxproj && \
  grep -E \"MARKETING_VERSION|CURRENT_PROJECT_VERSION\" App.xcodeproj/project.pbxproj | sort -u'"
```

When **only the build number is moving within the same train** (e.g. submitting another build for an open 1.8 review cycle), bump only `CURRENT_PROJECT_VERSION` via `agvtool next-version -all` (run in `ios/App`) and skip the `MARKETING_VERSION` change.

This is the recipe's only mutation to the client codebase. Per `~/ecodiaos/patterns/client-code-scope-discipline.md`, the bump is left **uncommitted**. Tate decides whether to commit + push after upload success.

Verified 4 May 2026 22:30 AEST: 0.5s, bumped MARKETING_VERSION 1.7→1.8 + CURRENT_PROJECT_VERSION 2→1 (new train).

### Phase A — Open MIC (RDP) on Corazon

Use the verified MIC fast-path script. Persisted at `C:\Users\Public\mic-fast.ps1` on Corazon and at `~/ecodiaos/scripts/laptop-agent/sy094-mic-fast.ps1` in the EcodiaOS repo. Pull creds from `kv_store.creds.macincloud`.

```bash
USERNAME=$(db_query "SELECT value::jsonb ->> 'username' FROM kv_store WHERE key='creds.macincloud'")
PASSWORD=$(db_query "SELECT value::jsonb ->> 'password' FROM kv_store WHERE key='creds.macincloud'")
curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LAPTOP_TOKEN" \
  -d "{\"tool\":\"shell.shell\",\"params\":{\"command\":\"powershell -ExecutionPolicy Bypass -File C:\\\\Users\\\\Public\\\\mic-fast.ps1 -Username $USERNAME -Password $PASSWORD\",\"timeout\":30000}}"
```

Expected: `OK total_ms=~6500 ... reached_focus=True`. Mac desktop is rendered ~1.5s AFTER script return; downstream conductor actions absorb that gap. Do not issue Mac-side input within 1.5s of script return.

Verified 4 May 2026 22:32 AEST: 7.6s end-to-end via SSH-orchestrated dispatch (slightly slower than the 6.4s baseline of 21:00 AEST run because Tate had just closed MIC; cold session).

### Phase B — Open macOS Terminal via Spotlight

Tate's verbatim directive specifies "going to terminal" and the verified-success run did exactly this:

```bash
# Spotlight via Cmd+Space (verified working in this run; failed in earlier 21:01 run when MIC was already-open)
curl -X POST http://100.114.219.69:7456/api/tool ... \
  -d '{"tool":"input.shortcut","params":{"keys":["cmd","space"]}}'
sleep 1
# Type "Terminal" then Enter
curl ... -d '{"tool":"input.type","params":{"text":"Terminal"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
```

In the verified 22:30-22:50 run, this path **succeeded** because immediately after MIC opened, the Mac desktop was the foreground window inside the RDP container. The earlier-night failure (where `input.shortcut [cmd,space]` got captured by Corazon's Win32 layer) reflects a different state where the RDP container had lost foreground. Always verify foreground-window equality before driving Mac-Cmd shortcuts. If Spotlight does not open within ~1s, fall back to `ssh ... 'open -a Terminal'` (LaunchServices, no foreground dependency).

Verified 4 May 2026 22:33 AEST: ~10s typing + sleep budget for Spotlight + Terminal launch.

### Phase C-F — Pipeline (git pull → npm install → npm run build → npx cap sync ios → npx cap open ios)

Type the chained pipeline in Terminal (rather than SSH'ing the same commands from VPS). Tate's directive specifies this is what they'd do at the keyboard:

```bash
# In Terminal (typed via input.type):
cd ~/Desktop/projects/coexist && git pull && npm install && npm run build && npx cap sync ios && npx cap open ios
```

Why typed-in-Terminal vs SSH-from-VPS:
- Tate's verbatim specifies this path
- Visual confirmation is part of the human-eyes checkpoint contract — pipeline output scrolling in Terminal is visible to Tate when he peeks at MIC
- npm errors and Capacitor warnings render with proper TTY colour
- The chained `&&` short-circuits cleanly on error; SSH would need separate calls

Pipeline timing (verified 4 May 2026 22:33-22:34 AEST):
- `git pull`: ~2s, fast-forward of any drift since last pull
- `npm install`: ~4s warm (no lockfile drift)
- `npm run build` (Vite): ~2s, `✓ built in <ms>`
- `npx cap sync ios`: ~1s, 13 plugins detected, SPM resolves automatically
- `npx cap open ios`: ~4s, Xcode launches and loads workspace

Total Phase C-F: ~13-15s for chained pipeline. Plus ~15s for Xcode to fully load and resolve SPM dependencies after `cap open ios`.

Capacitor 7+ uses **Swift Package Manager (SPM), not CocoaPods.** No `pod install` runs. SPM dependencies resolve when Xcode opens the project. The output may include `[warn] @capacitor-mlkit/barcode-scanning does not have a Package.swift` and `[warn] Some installed packages are not compatable with SPM` — these are advisory and do not block the sync.

If `git pull` produces non-trivial output (merge conflicts, divergent branches, network failures) HALT the recipe. Per `~/ecodiaos/patterns/client-code-scope-discipline.md`, do NOT auto-resolve. Surface a status_board P2 row with the verbatim error and exit. Same for `npm install` peer-dep failures or `npm run build` errors.

### Phase G — iPhone 17 Pro simulator smoke-test (HUMAN-EYES CHECKPOINT, GUI Run button)

Per Tate's directive, the verified-success run used Xcode's Run button against iPhone 17 Pro sim — not the headless `xcrun simctl` + `xcodebuild` path. This produces the visual smoke-test Tate watches for.

```bash
# Click Run button at (175, 29) — Xcode toolbar, NOT macOS top menu bar (Y=14 hits Find/Edit menus)
curl ... -d '{"tool":"input.click","params":{"x":175,"y":29}}'
```

Expected: Xcode build status indicator changes to "Building | N/M" near top, then "Running App on iPhone 17 Pro", then sim window opens. App launches, renders Welcome back / Google / Apple / Email / Password / Log In login screen.

Verified 4 May 2026 22:35 AEST: 45-60s build + ~5s sim launch + render. Visual confirm via `screenshot.screenshot` shows Welcome screen.

If the destination is currently set to "Any iOS Device (arm64)" or another non-runnable target, the Run button is disabled. Switch destination first via Phase H below, then return to Phase G.

This phase is the human-eyes checkpoint per Tate's directive. If running unattended (no human review possible), it's still recommended for visual smoke-test artefact. If absolutely autonomous and skipping is acceptable, fall back to the headless `xcrun simctl` build path documented at the bottom of this recipe (Phase G-headless).

### Phase H — Switch destination to "Any iOS Device (arm64)"

The Run button at Phase G ran on a sim destination. For Archive, the destination MUST be a real-device target. Switch via the destination dropdown:

```bash
# Click destination dropdown at (490, 14) — note menu bar may be hidden, coords valid for hidden state
curl ... -d '{"tool":"input.click","params":{"x":490,"y":14}}'
sleep 1
# Click "Any iOS Device (arm64)" in the dropdown's Build section
curl ... -d '{"tool":"input.click","params":{"x":470,"y":159}}'
```

Verified 4 May 2026 22:38 AEST: ~2s.

If dropdown opens but the entry is in a different position (Xcode reorders by recency), screenshot the dropdown and re-locate. Build section is always present near the bottom under the divider.

### Phase I — Archive via Product menu typeahead

The macOS top menu bar auto-hides in Xcode fullscreen. Reveal it before clicking:

```bash
# Move cursor to top edge to reveal menu bar
curl ... -d '{"tool":"input.move","params":{"x":320,"y":1}}'
sleep 1
# Click Product menu (X=320, Y=8 once menu bar is visible)
curl ... -d '{"tool":"input.click","params":{"x":320,"y":8}}'
sleep 1
# Type "Arc" (typeahead matches "Archive")
curl ... -d '{"tool":"input.type","params":{"text":"Arc"}}'
sleep 0.5
# Press Enter
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
```

Archive is **only enabled when the destination is "Any iOS Device (arm64)"** — not for any iOS Simulator destination. Phase H is a hard prerequisite.

Expected: Xcode begins building for archive. "Building | N/M" → "Archiving" → archive completes in ~30-90s (warm derived data) / 90-180s (cold). Organizer auto-opens on success and shows the new archive at the top of the list.

Verified 4 May 2026 22:39-22:41 AEST: ~90s archive build, Organizer auto-opened with new 1.8(1) archive at top.

The archive lands at `~/Library/Developer/Xcode/Archives/<YYYY-MM-DD>/CoExist-<MARKETING_VERSION>-<BUILD>.xcarchive` automatically — Organizer auto-detects archives in this directory tree. The headless `xcodebuild archive -archivePath /tmp/...` path does NOT auto-show in Organizer because the path is non-standard; that's why this recipe ships via the GUI archive path now (verified-success path), not the headless path of the prior recipe version.

### Phase J — Distribute App from Organizer

```bash
# Click Distribute App in Organizer right pane
curl ... -d '{"tool":"input.click","params":{"x":994,"y":205}}'
sleep 2
# Method dialog appears. App Store Connect is preselected.
# Click Distribute confirm button
curl ... -d '{"tool":"input.click","params":{"x":905,"y":522}}'
```

If Organizer is not foreground (e.g. it didn't auto-open after Archive), navigate via Window menu typeahead:

```bash
# Reveal menu bar
curl ... -d '{"tool":"input.move","params":{"x":320,"y":1}}'
# Click Window menu — coords vary by what's open. Or use Cmd+Shift+9 if accelerator is bound.
# Or just: Click any visible Xcode window first, then Cmd+Shift+9 (Window → Organizer):
curl ... -d '{"tool":"input.shortcut","params":{"keys":["cmd","shift","9"]}}'
```

Typeahead-friendly fallback: open Window menu, type "Or" + Enter (matches "Organizer"). Worked-confirmed during the 21:55 AEST debugging session that night.

Verified 4 May 2026 22:43-22:44 AEST: ~5s including Method dialog open + Distribute click.

### Phase K — Upload to App Store Connect

After Distribute clicked in Method dialog:

- Xcode does signing review (a few seconds)
- "Upload for App Store Connect" dialog renders
- **If Apple ID is configured** (kv_store.creds.apple.password populated AND Xcode → Settings → Accounts has code@ecodia.au): upload proceeds straight to "Preparing → Uploading → Verifying" sequence
- **If Apple ID not configured**: dialog shows "App Store Connect access for Ecodia Pty Ltd is required" + "No Accounts" — run the **Xcode Apple ID signin sub-procedure** below, then return to Phase J.

Upload sequence states (Xcode upload progress dialog):
1. **Preparing** (~30s) — Xcode validates the IPA
2. **Uploading** (~3-4 min, Apple-side) — actual binary upload
3. **Verifying** (~30-60s, Apple-side) — Apple validates the binary
4. **App upload complete: App `<MARKETING_VERSION> (<BUILD>)` uploaded** with green checkmark

Click **Done** (925, 522) to dismiss.

Verified 4 May 2026 22:46-22:50 AEST: ~5min for Preparing→Uploading→Verifying. External-render bound; cannot be optimised below this floor (Apple-side network round-trip + their queue).

After Done: Organizer right pane shows "Status: Uploaded to Apple" for the archive. Build appears in App Store Connect → Apps → Co-Exist → TestFlight → iOS Builds within ~1-15min (Apple-side processing).

### Xcode Apple ID signin sub-procedure (one-time per Xcode logout cycle)

Run this when the upload dialog at Phase K shows "No Accounts" or when Xcode → Settings → Accounts is empty.

Per Tate verbatim 4 May 2026 22:00 AEST: "xcode apple signin doesnt require 2fa... thats for the actual ASC webpage" — the in-Xcode signin does NOT fire 2FA SMS to Tate's phone, so this is fully autonomous given the password in kv_store.

```bash
# In the Method dialog (or Settings already open):
# Click Manage Accounts... (535, 522 in Method dialog)
curl ... -d '{"tool":"input.click","params":{"x":535,"y":522}}'
sleep 2

# Settings opens to Accounts pane. Click + (Add Apple Account).
curl ... -d '{"tool":"input.click","params":{"x":950,"y":505}}'
sleep 2

# Sign-in dialog opens. Email field is auto-focused. Type email + Enter.
curl ... -d '{"tool":"input.type","params":{"text":"code@ecodia.au"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 2

# Password field appears. Read from kv_store and type.
PASSWORD=$(db_query "SELECT value::jsonb ->> 'value' FROM kv_store WHERE key='creds.apple.password'")
curl ... -d "{\"tool\":\"input.type\",\"params\":{\"text\":\"$PASSWORD\"}}"
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 5

# Account is added; persists in Mac Keychain across Xcode sessions.
# Close Settings, return to Method dialog, click Distribute.
```

The signin persists in Mac Keychain across Xcode sessions until Xcode "logs out every now and then" (Tate verbatim 22:18 AEST). When that happens, re-run this sub-procedure. Frequency observed: roughly one re-signin per several days of Xcode use, not per session.

Per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`: this signed-in session IS the right credential (not a generated ASC API .p8). Storing the Apple ID password in `kv_store.creds.apple.password` is correct.

## Verification protocol

Cheapest tier per phase. Tier numbers reference `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`.

| Phase | Verification tier | Method |
|---|---|---|
| 0 (version bump) | Tier 3 | `grep -E 'MARKETING_VERSION\|CURRENT_PROJECT_VERSION' ios/App/App.xcodeproj/project.pbxproj` shows new values. |
| A (MIC open) | Tier 0 | `mic-fast.ps1` returns `OK total_ms=...` and `reached_focus=True`. |
| B (Terminal open) | Tier 2 | `pgrep -lf Terminal` shows the binary. Tier 4 backup: screenshot shows Terminal foreground. |
| C-F (chained pipeline) | Tier 1 (Terminal stdout parse via screenshot) | Output contains `Updating .. Fast-forward` AND `audited NNN packages` AND `✓ built in` AND `Sync finished in` AND `✔ Opening the Xcode workspace`. |
| F-end (Xcode loaded) | Tier 2 | `pgrep -lf Xcode` shows `/Applications/Xcode.app/Contents/MacOS/Xcode`. |
| G (sim Run) | Tier 4 | Cropped screenshot of Xcode toolbar shows "Running App on iPhone 17 Pro". Tier 5 backup: full screenshot shows sim window with Welcome screen. |
| H (destination switch) | Tier 4 | Cropped screenshot of toolbar shows destination chip text "Any iOS Device (arm64)". |
| I (archive) | Tier 3 | `~/Library/Developer/Xcode/Archives/<date>/CoExist-<v>-<b>.xcarchive` exists. Tier 4 backup: Organizer auto-opens with new archive at top. |
| J (Distribute click) | Tier 4 | Cropped screenshot of Method dialog shows "App Store Connect" preselected radio. |
| K (upload) | Tier 4 | Cropped screenshot of upload progress dialog shows "App upload complete" + green checkmark. Tier 0 backup: Organizer right pane shows "Status: Uploaded to Apple". |
| Apple ID signin sub | Tier 4 | Cropped screenshot of Settings → Accounts pane shows `code@ecodia.au` row with team `Ecodia Pty Ltd (86PUY7393S)`. |

Tier 0 / Tier 1 / Tier 2 / Tier 3 verifications are preferred where available. The GUI Archive flow forces Tier 4 (cropped screenshot) for several phases because Xcode's UI Automation tree exposes few load-bearing patterns directly. If a future Xcode version exposes `WindowPattern.Current.WindowVisualState` for the upload dialog or `InvokePattern` on the Distribute button, drop the Tier 4 dependency.

## Fast-path checklist

End-to-end timing target: **~10 minutes wall-clock from version bump to "Uploaded to Apple"**, ~5 minutes of which is external Apple-side upload latency.

```bash
# 0: Version bump (sed in pbxproj) — only when shipping new train (~0.5s)
ssh $SY "bash -lc 'cd ~/Desktop/projects/coexist/ios/App && \
  sed -i \"\" -E \"s/MARKETING_VERSION = X.Y;/MARKETING_VERSION = X.Y_NEXT;/g\" App.xcodeproj/project.pbxproj && \
  sed -i \"\" -E \"s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = 1;/g\" App.xcodeproj/project.pbxproj'"

# A: MIC open via mic-fast.ps1 (~7s)
curl -X POST $LAPTOP/api/tool -H "Authorization: Bearer $TOK" \
  -d "{\"tool\":\"shell.shell\",\"params\":{\"command\":\"powershell -ExecutionPolicy Bypass -File C:\\\\Users\\\\Public\\\\mic-fast.ps1 -Username $U -Password $P\"}}"

# B: Spotlight Terminal (~10s typing + sleep budget)
curl ... -d '{"tool":"input.shortcut","params":{"keys":["cmd","space"]}}'
sleep 1
curl ... -d '{"tool":"input.type","params":{"text":"Terminal"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 2

# C-F: Chained pipeline (~13-15s + ~15s for Xcode to fully load)
curl ... -d '{"tool":"input.type","params":{"text":"cd ~/Desktop/projects/coexist && git pull && npm install && npm run build && npx cap sync ios && npx cap open ios"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 30   # absorbs all five steps + Xcode load

# G: Run iPhone 17 Pro sim (~50s including build + launch)
curl ... -d '{"tool":"input.click","params":{"x":175,"y":29}}'
sleep 50
# (visual confirm sim Welcome screen via screenshot.screenshot)

# H: Switch destination to Any iOS Device (arm64) (~2s)
curl ... -d '{"tool":"input.click","params":{"x":490,"y":14}}'
sleep 1
curl ... -d '{"tool":"input.click","params":{"x":470,"y":159}}'

# I: Archive via Product menu typeahead (~90s)
curl ... -d '{"tool":"input.move","params":{"x":320,"y":1}}'
sleep 1
curl ... -d '{"tool":"input.click","params":{"x":320,"y":8}}'
sleep 1
curl ... -d '{"tool":"input.type","params":{"text":"Arc"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 90

# J: Distribute App from Organizer (~5s)
curl ... -d '{"tool":"input.click","params":{"x":994,"y":205}}'
sleep 2
curl ... -d '{"tool":"input.click","params":{"x":905,"y":522}}'
sleep 5

# K: Upload (Apple-side, ~5min total: Preparing 30s, Uploading 3-4min, Verifying 30-60s)
sleep 300
# (visual confirm "App upload complete" via screenshot.screenshot, then Done)
curl ... -d '{"tool":"input.click","params":{"x":925,"y":522}}'
```

Verified end-to-end timing 4 May 2026 22:30-22:50 AEST:

| Phase | Time | Notes |
|---|---|---|
| 0 (pbxproj sed bump) | 0.5s | SSH from VPS, MARKETING_VERSION 1.7→1.8 + CURRENT_PROJECT_VERSION reset to 1 |
| A (MIC open) | 7.6s | mic-fast.ps1, cold session after Tate closed MIC |
| B (Spotlight Terminal) | ~10s | typing + sleep budget |
| C-F (chained pipeline) | ~13-15s + ~15s Xcode load | git pull + npm install + npm run build + npx cap sync ios + npx cap open ios + Xcode launch |
| G (Run iPhone 17 Pro sim) | 45-60s | build + sim launch + Welcome screen render |
| H (destination switch) | ~2s | dropdown + click Any iOS Device (arm64) |
| I (Archive build) | ~90s | warm derived data |
| J (Distribute click) | ~5s | Method dialog + ASC preselected + confirm |
| K (Upload Preparing→Uploading→Verifying) | ~5min | Apple-side, external-render bound |
| K-end (Done click) | ~1s | dismiss success dialog |

Total wall-clock: **~10 minutes**. Conductor-driven steps (excluding Apple latency): **~5 minutes**.

## Speed wins identified

| Win | Status | Saves |
|---|---|---|
| **[APPLIED]** Apple ID password in `kv_store.creds.apple.password` — no Tate-action for re-signin | done 4 May 2026 22:18 AEST | infinity (Tate-blocked step removed) |
| **[APPLIED]** Chained pipeline `git pull && npm install && npm run build && npx cap sync && npx cap open` (single Terminal command) | done | ~3-5s vs five separate input.type sequences |
| **[APPLIED]** Reuse derived data via `/tmp/coexist-derived` across sim build + archive (when running headless variant) | done | ~30-60s on archive (warm cache) |
| **[APPLIED]** Use Product menu typeahead "Arc" + Enter for Archive instead of menu navigation | done | ~3-5s vs hover/scroll path |
| **[APPLIED]** Click Run button at Y=29 (Xcode toolbar) NOT Y=14 (macOS top menu bar) — codified in coordinates table | done | n/a (correctness) |
| **[APPLIED]** Move cursor to (320, 1) to reveal auto-hidden menu bar before clicking menu items | done | n/a (correctness) |
| **[TODO HIGH]** Probe-for-state instead of `sleep 30` after pipeline — poll for "Build Succeeded" or sim window appearance | proposed | up to 15-20s on warm runs |
| **[TODO HIGH]** Single-shell PowerShell collapse of Phase H+I+J GUI clicks (destination switch + Archive trigger + Distribute) into one .NET SendInput batch | proposed | ~3s round-trip per click × 6 clicks = ~18s |
| **[TODO MEDIUM]** Skip Phase G (sim smoke-test) when no source changes since last release — diff `dist/` against last archive's bundle | proposed | ~50s on no-change ship-only runs |
| **[TODO LOW]** Pre-compile xcframeworks for SPM dependencies once after major Capacitor version bumps | proposed | ~60-120s on cold archive (rare) |
| **[INHERENT FLOOR]** Apple-side upload latency (~5min Preparing→Uploading→Verifying) | cannot optimise | — |
| **[ATTEMPTED, dropped]** `input.shortcut [cmd,space]` worked in 22:30 run but FAILED in earlier 21:01 run when MIC was already-open (Win32 capture). Document state-dependent behaviour | drop reason: works only when Mac is foreground inside RDP container. Conditional on foreground equality | use Spotlight when foreground confirmed, else `ssh ... 'open -a Terminal'` |
| **[ATTEMPTED, dropped]** Headless `xcodebuild -archivePath /tmp/...` archive path of prior recipe version | drop reason: Organizer doesn't auto-detect archives outside `~/Library/Developer/Xcode/Archives/<date>/`, breaking the Distribute App upload flow | use Xcode GUI Archive (Product → Archive) so Organizer auto-detects |
| **[ATTEMPTED, dropped]** ASC API key (.p8) at L2 of prior recipe version | drop reason: gui-macro-uses-logged-in-session-not-generated-api-key.md doctrine — the signed-in Apple ID session IS the right credential, no API key needed | password in kv_store + Xcode keychain caching |
| **[ATTEMPTED, dropped]** `osascript -e 'tell application Terminal to activate'` over SSH | drop reason: macOS Automation permissions block AppleEvents from non-GUI SSH sessions (-1743 Not authorized) | use `open -a Terminal` (LaunchServices) or Spotlight |
| **[ATTEMPTED, dropped]** `xcodebuild -workspace App.xcworkspace ...` | drop reason: Capacitor with SPM ships only `.xcodeproj`; using `-workspace` errors `'App.xcworkspace' does not exist` | use `-project App.xcodeproj` (only relevant for Phase G-headless variant below) |

## Failure modes

| Mode | Symptom | Cause | Fix |
|---|---|---|---|
| K-1 | xcodebuild archive fails `errSecInternalComponent` on framework codesign (when running Phase G-headless or fallback CLI archive) | Login keychain locked OR codesign not in key partition list (headless SSH session, no GUI auth context) | Run `security unlock-keychain -p '<sshpass>' ~/Library/Keychains/login.keychain-db` AND `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '<sshpass>' ~/Library/Keychains/login.keychain-db` BEFORE the archive command. SSH password = login keychain password on SY094. |
| K-2 | Archive fails "Provisioning Profile 'Ecodia Code' not found" | Profile not installed in `~/Library/MobileDevice/Provisioning Profiles/` even if the .mobileprovision file exists on Desktop | `cp ~/Desktop/Ecodia_Code.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/` |
| K-3 | xcodebuild errors `'App.xcworkspace' does not exist` | Capacitor with SPM ships only `.xcodeproj` | Use `-project App.xcodeproj`, not `-workspace` |
| K-4 | npm install fails `npm: command not found` over SSH | SSH non-interactive shell does not load Node from `~/.zshrc` / `~/.bash_profile` | Wrap with `bash -lc '...'`. Or run via Terminal in MIC (not SSH) — Terminal loads the user shell init |
| K-10 | Run button click misses, hits Find/Edit menus instead | Clicked at Y=14 (macOS top menu bar). Xcode's toolbar Run button is at Y=29 | Use Y=29 for Xcode toolbar Run button. Coordinates table is the source of truth |
| K-11 | Menu bar items unreachable in Xcode fullscreen | Top menu bar auto-hides in Xcode fullscreen mode | Move cursor to (320, 1) first to reveal menu bar, then click menu item |
| K-12 | Apple validation rejects upload: "Invalid Pre-Release Train. The train version 'X.Y' is closed for new build submissions" + "CFBundleShortVersionString [X.Y] in the Info.plist file must contain a higher version" | Apple closed the train when a build at this MARKETING_VERSION was approved/shipped. Subsequent uploads at the same MARKETING_VERSION are rejected | Bump `MARKETING_VERSION` (CFBundleShortVersionString) in pbxproj, NOT just `CURRENT_PROJECT_VERSION`. Reset `CURRENT_PROJECT_VERSION` to 1 for the new train. See Phase 0 |
| K-13 | Xcode Distribute dialog shows "App Store Connect access for Ecodia Pty Ltd is required" + "No Accounts" | Xcode → Settings → Accounts is empty (Xcode logs out periodically per Tate verbatim) | Run **Xcode Apple ID signin sub-procedure**. Apple ID password is in `kv_store.creds.apple.password`. No 2FA fired during in-Xcode signin (verified Tate verbatim) |
| K-14 | Apple ID signin appears to require 2FA but no SMS arrives | Probably triggered the ASC web flow, not the in-Xcode flow | Per Tate verbatim 4 May 2026 22:00 AEST: "xcode apple signin doesnt require 2fa... thats for the actual ASC webpage". Cancel and re-do via Xcode Settings → Accounts → +, not via browser |
| K-15 | "xcodebuild archive" succeeds but new archive doesn't show in Organizer | `-archivePath` was non-standard (e.g. `/tmp/coexist-archive.xcarchive`); Organizer only auto-detects archives at `~/Library/Developer/Xcode/Archives/<date>/` | For GUI distribution, use Xcode's Product → Archive (not headless xcodebuild). Or move/copy the archive into `~/Library/Developer/Xcode/Archives/<YYYY-MM-DD>/`, then re-open Organizer to refresh |
| K-16 | RDP control bar overlaps top menu bar at top of screen | mstsc.exe control bar docked-at-top mode | Hover cursor elsewhere on screen for ~1s — control bar auto-hides. Then proceed with menu bar reveal at (320, 1) |
| K-17 | RDP container doesn't respond to Win32 SetForegroundWindow ("Operation cannot be performed" / "Target element cannot receive focus") | RDP window in a state where UIA can't drive it | Use UIA `Current.NativeWindowHandle` + Win32 SetForegroundWindow with AttachThreadInput. Script template at `~/ecodiaos/drafts/coexist-ios-release-runs/run-2026-05-04-2050/restore-rdp2.ps1` |
| K-18 | Tate's foreground app on Corazon is the EcodiaOS chat (Chrome) and screenshot of Mac state shows Chrome instead of Mac | Cowork-no-focus-collision principle — laptop foreground was Tate-typed-in | Either restore RDP foreground via UIA NativeWindowHandle (K-17 fix) BEFORE screenshot, OR fall back to Tier 2/3 verification |
| K-19 | Spotlight `[cmd,space]` doesn't open after MIC entry | RDP container has lost foreground OR Mac desktop hasn't fully rendered | Wait additional ~1.5s after mic-fast.ps1 return for Mac render. If foreground lost, restore via K-17 path. Last-resort fallback: `ssh ... 'open -a Terminal'` (LaunchServices, no foreground dependency) |

## Anti-patterns

- **Do NOT bypass the Apple ID signin path via API key.** Per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`, the signed-in Apple ID session IS the right credential. Storing the password in `kv_store.creds.apple.password` (string `value` field) is correct, and NOT generating a separate ASC API .p8 file. The prior recipe version's "Provision ASC API key (L2a) once" recommendation is superseded.
- **Do NOT upload a build with the same MARKETING_VERSION as a previously-shipped train.** Apple closes trains when a build is approved. Always bump `MARKETING_VERSION` for a new train (Phase 0). `CURRENT_PROJECT_VERSION` alone is not enough.
- **Do NOT skip the iPhone 17 Pro sim smoke-test for releases with code changes.** Visual verification before archive is the human-eyes checkpoint per Tate's directive. Only skip when releasing without source changes (e.g. metadata-only republish).
- **Do NOT click the Run button at Y=14.** That's the macOS menu bar (Find/Edit/View). Xcode's toolbar Run button is at Y=29. The coordinates table is the source of truth.
- **Do NOT modify Co-Exist source.** Per `~/ecodiaos/patterns/client-code-scope-discipline.md`, the only mutation this recipe performs is the `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION` sed in `App.xcodeproj/project.pbxproj`, and even that is left **uncommitted** by default. Tate decides whether to commit + push after upload success.
- **Do NOT push the version bump to origin/coexist on the Mac.** The bump is uncommitted; never `git push`.
- **Do NOT direct-click Apple Accounts sidebar item without opening Settings via Method dialog Manage Accounts.** Settings remembers the last-viewed pane; Manage Accounts deterministically opens to the Accounts pane.
- **Do NOT codify Xcode toolbar coords without live UIAutomation tree-walking on every fresh Xcode version.** Coords drift. The coordinates table date-stamps each entry; re-walk on Xcode upgrades.
- **Do NOT log the SSH password or Apple ID password.** Run logs at `~/ecodiaos/drafts/coexist-ios-release-runs/run-*/` should pass through cred values without echoing them.
- **Do NOT auto-resolve git pull conflicts** on the client repo. Halt + status_board P2 + Tate decides. Never `git checkout --theirs` or `git reset --hard origin/main` on a client codebase.
- **Do NOT `taskkill` Tate's Chrome on Corazon to reach the Mac.** Use the UIA NativeWindowHandle restore path (K-17 fix) — brings RDP foreground without disturbing other windows.

## Phase G-headless variant (autonomous fallback if no human review possible)

Documented for completeness — not the verified-success path. The 4 May 2026 22:50 AEST upload used the GUI Archive flow because that's the path Tate's directive specifies and because Organizer auto-detection of archives needs `~/Library/Developer/Xcode/Archives/<date>/` location.

For fully-autonomous reruns where no human review is possible AND skipping the visual smoke-test is acceptable:

```bash
# Boot iPhone 17 Pro UDID (verified 4 May 2026: 0DC6D0B3-5CDA-4496-AE09-5A59B742F261)
ssh ... "xcrun simctl boot 0DC6D0B3-5CDA-4496-AE09-5A59B742F261"

# Build for simulator (-quiet suppresses progress noise)
ssh ... "bash -lc 'cd ~/Desktop/projects/coexist/ios/App && \
  xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
    -sdk iphonesimulator \
    -destination \"platform=iOS Simulator,id=0DC6D0B3-5CDA-4496-AE09-5A59B742F261\" \
    -derivedDataPath /tmp/coexist-derived -quiet build'"

# Install + launch + screenshot for forensic capture
ssh ... "xcrun simctl install <UDID> /tmp/coexist-derived/Build/Products/Debug-iphonesimulator/App.app && \
         xcrun simctl launch <UDID> org.coexistaus.app && \
         xcrun simctl io <UDID> screenshot /tmp/sim-screenshot.png"

# Stop sim
ssh ... "xcrun simctl terminate <UDID> org.coexistaus.app && xcrun simctl shutdown <UDID>"

# Headless archive (for Phase I-headless)
ssh ... "security unlock-keychain -p '$P' ~/Library/Keychains/login.keychain-db && \
         security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '$P' \
           ~/Library/Keychains/login.keychain-db"
ssh ... "bash -lc 'cd ~/Desktop/projects/coexist/ios/App && \
  rm -rf ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/CoExist-headless.xcarchive && \
  xcodebuild -project App.xcodeproj -scheme App -configuration Release \
    -destination \"generic/platform=iOS\" \
    -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/CoExist-headless.xcarchive \
    -derivedDataPath /tmp/coexist-derived archive'"
```

NOTE: Archive at `~/Library/Developer/Xcode/Archives/<date>/` auto-shows in Organizer. From there, Phase J-K (GUI Distribute) is the same. The original prior-recipe `xcodebuild -exportArchive` headless ipa export + `xcrun altool --upload-app` path is dropped per the API-key anti-pattern above.

## Origin run details

Verified end-to-end success: 4 May 2026 22:30-22:50 AEST. Run log at `~/ecodiaos/drafts/coexist-ios-release-runs/run-2026-05-04-2050/` (note: dirname matches the prior partial-run; this 22:30 success was a re-run within the same evening session). Build 1.8(1) Uploaded to Apple at 22:50 AEST per Organizer green-checkmark visible in screenshot.

Lineage:
- 21:00-21:08 AEST first authoring (fork_mor2yqdv_be0de0): headless `.ipa` export verified, L2 ASC upload Tate-required → status_board row `e6ca51dc`
- 21:08-21:55 AEST: GUI Archive attempted with build 1.7(2), blocked at Xcode "No Accounts" → status_board row `4943454a`
- 22:18 AEST: Tate verbatim provided Apple ID password "C0d!ng7h3fu7ur3" + clarified "It logs out of xcode every now and then so you HAVE To be able to do it yourself" → password stored in `kv_store.creds.apple.password`
- 22:25 AEST: Tate verbatim "you've got most of the recipe in-tact now. Im going to close MIC and you're going to go all the way through that flow again, as fast as you can while staying correct."
- 22:30-22:50 AEST: full GUI flow re-run with version bump 1.7→1.8, build 1.8(1) Uploaded to Apple (this is the verified-end-to-end run)
- 22:55+ AEST: this recipe rewrite (fork_mor7n4f4_23be34)

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — meta-doctrine for recipe authoring/optimisation; this recipe is a worked instance
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` — Phase A worked instance (MIC entry via mic-fast.ps1)
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — doctrine that justifies storing Apple ID password (logged-in session) instead of generating an ASC API key
- `~/ecodiaos/patterns/client-code-scope-discipline.md` — the version-bump is the only client-codebase mutation; left uncommitted
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` — coords typed without live observation are wrong; re-walk on Xcode upgrades
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — Tate stated multiple rules this turn; codified now, not later
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — the L2 upload step is no longer Tate-required after kv_store password storage; 5-point check resolves to all-affirmative
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — Organizer "Status: Uploaded to Apple" + ASC TestFlight build appearance is the ground-truth confirmation, not just upload-dialog success
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — Corazon's full tool surface (input.*, screenshot.*, shell.shell, etc) is what this recipe calls
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` — foreground equality probe before driving Mac via RDP
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` — cross-context tool reference
- `~/ecodiaos/patterns/minimize-tate-approval-queue.md` — the verified path removes this recipe from Tate's approval queue (was Tate-required, now autonomous)
- `~/ecodiaos/clients/coexist.md` (if exists) — client-specific architecture/contract context
- `~/ecodiaos/clients/macincloud-access.md` (if exists) — SY094 access modes (SSH vs RDP)
- `~/ecodiaos/docs/secrets/macincloud.md` — kv_store.creds.macincloud schema and rotation behaviour
- `~/ecodiaos/docs/secrets/apple.md` — kv_store.creds.apple + creds.apple.password schemas (Apple ID password storage doctrine)

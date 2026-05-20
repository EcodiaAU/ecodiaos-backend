---
triggers: ecodia-native-ship, ecodia-native-build, au.ecodia.native-testflight, native-app-ship, ecodia-native-archive, xcodegen-app-build-num-drift, manual-distribution-force-identity, build-ecodia-native, ship-ecodia-native, native-ios-build-recipe
---

# ecodia-native (au.ecodia.native) headless ship recipe

Per-app deltas for shipping the native Swift app to TestFlight, on top of [ios-app-asc-headless-ship-protocol.md](ios-app-asc-headless-ship-protocol.md). ecodia-native differs from the Capacitor apps (Co-Exist etc): it is xcodegen-defined, manual-signed, multi-target (app + Share + Widget extensions), no Capacitor/CocoaPods.

Verified end to end 2026-05-20: build 11 archived + exported + uploaded (Delivery UUID 0e3c999c).

## Constants

- Build dir on SY094: `/Users/user276189/ecodia-native` (NOT `~/Desktop/projects/...`).
- Repo: `EcodiaTate/ecodia-native` (separate from the backend repo).
- Project: `EcodiaNative.xcodeproj` (committed, xcodegen output). Scheme `EcodiaApp`. Targets: EcodiaApp, EcodiaShare, EcodiaWidget.
- Team `86PUY7393S`. Dist cert: `Apple Distribution: Ecodia Pty Ltd (86PUY7393S)` (SHA `117DB87A...`).
- Profiles (manual, App Store): `EcodiaOS Native App Store 2026-05-19` (au.ecodia.native), `EcodiaOS Share App Store 2026-05-19` (au.ecodia.native.share), `EcodiaOS Widget App Store 2026-05-20` (au.ecodia.native.widget).
- ASC API key `R8P6K38X47`, issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f` (team key, same as Co-Exist).
- Driver from Corazon: `python backend/scripts/sy094-ssh.py '<cmd>'` (paramiko, password from creds.macincloud).

## Two gotchas unique to this app

1. **xcodegen is NOT installed on SY094**, so the committed `EcodiaNative.xcodeproj` is the build truth, and it DRIFTS from `project.yml`: its `CURRENT_PROJECT_VERSION` lags (project.yml says 11, the committed pbxproj said 10). Bump it on SY094 before archiving: `sed -i "" 's/CURRENT_PROJECT_VERSION = 10;/CURRENT_PROJECT_VERSION = 11;/g' EcodiaNative.xcodeproj/project.pbxproj` (6 occurrences = 3 targets x Debug/Release). Better long-term: `brew install xcodegen` on SY094 + `xcodegen generate` so project.yml stays the source of truth.

2. **The committed pbxproj signing picks the Apple DEVELOPMENT cert** against the App Store (Distribution) profile -> `ARCHIVE FAILED: profile doesn't include signing certificate "Apple Development..."`. This is the [[auto-prov-picks-dev-cert-prefer-manual-distribution-2026-05-20]] trap. Force the Distribution identity on the archive command line (per-target profiles stay from the project): `CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution: Ecodia Pty Ltd (86PUY7393S)" DEVELOPMENT_TEAM=86PUY7393S`.

## The flow (each step one SSH session, keychain unlocked same-session per [[ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19]])

1. `cd ~/ecodia-native && git pull --ff-only origin main`.
2. sed the build number in the pbxproj to one above the last TestFlight build.
3. Archive (keychain default+unlock+partition-list first, same session): `xcodebuild -project EcodiaNative.xcodeproj -scheme EcodiaApp -configuration Release -archivePath /tmp/ecodia-native-N.xcarchive -destination "generic/platform=iOS" archive CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution: Ecodia Pty Ltd (86PUY7393S)" DEVELOPMENT_TEAM=86PUY7393S` -> `** ARCHIVE SUCCEEDED **`.
4. Export with a MANUAL ExportOptions.plist (the committed `exportOptions.plist` is `signingStyle=automatic` and clashes with the manual archive): write `/tmp/ExportOptions-native.plist` with `method=app-store-connect`, `teamID`, `signingStyle=manual`, and a `provisioningProfiles` dict mapping each bundle id to its profile name. Then `xcodebuild -exportArchive -archivePath ... -exportPath /tmp/ecodia-native-N-export -exportOptionsPlist /tmp/ExportOptions-native.plist` -> `** EXPORT SUCCEEDED **`, `EcodiaOS.ipa` (~760KB, native, no Capacitor bloat).
5. Upload: `xcrun altool --upload-app -f /tmp/ecodia-native-N-export/EcodiaOS.ipa -t ios --apiKey R8P6K38X47 --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f` -> `UPLOAD SUCCEEDED` + Delivery UUID.
6. ASC processes ~10min; Apple emails Tate when it is installable in TestFlight.

## Long-bash gotcha

The archive/export can exceed the Bash tool foreground cap. Run via `run_in_background: true` with `TIMEOUT=1500` env on the sy094-ssh driver, then read the task output. Exit 0 from the SSH pipe is `tail`'s code, not xcodebuild's - confirm by grepping the output for `ARCHIVE SUCCEEDED` / `EXPORT SUCCEEDED` / `UPLOAD SUCCEEDED`.

Origin: 2026-05-20 build 11 ship during Tate's away-build run. Cross-refs: [[ios-app-asc-headless-ship-protocol.md]], [[auto-prov-picks-dev-cert-prefer-manual-distribution-2026-05-20]], [[ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19]].

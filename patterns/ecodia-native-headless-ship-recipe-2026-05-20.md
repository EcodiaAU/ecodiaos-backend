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

## xcodegen is the source of truth - install the portable binary, never hand-edit the pbxproj

`brew install xcodegen` FAILS on SY094 (no write perms on `/opt/homebrew`). Install the portable release binary instead (no brew, no sudo):

```bash
cd /tmp && rm -rf xcodegen xcodegen.zip && \
curl -fsSL -o xcodegen.zip https://github.com/yonaskolb/XcodeGen/releases/latest/download/xcodegen.zip && \
unzip -o -q xcodegen.zip && xattr -dr com.apple.quarantine xcodegen 2>/dev/null
/tmp/xcodegen/bin/xcodegen --version   # 2.45.4 verified 2026-05-20
```

`/tmp` is wiped on reboot, so re-run the download as a build pre-step (it is ~2s) or move `xcodegen` to a durable dir.

With xcodegen available, `xcodegen generate --spec project.yml` is the FIX for both historical gotchas at once: it propagates `CURRENT_PROJECT_VERSION` from `project.yml` (no more pbxproj version sed) AND globs the EcodiaApp target's `sources: - path: EcodiaApp` so new files under `EcodiaApp/**` (e.g. `EcodiaApp/VoiceCall/*.swift`) are auto-added with correct group-relative paths.

## Two gotchas unique to this app

1. **NEVER hand-add files to the target with the Ruby `xcodeproj` gem.** It computes the file-reference path relative to the group it is added to AND re-prefixes the group path, producing duplicated mangled paths like `EcodiaApp/EcodiaApp/VoiceCall/EcodiaApp/VoiceCall/VoiceCallManager.swift` -> `ARCHIVE FAILED: Build input files cannot be found`. Run `xcodegen generate` instead - it derives paths from the filesystem and gets them right. (Bumping the version was historically a `sed` on the pbxproj; that is also dead - bump it in `project.yml` and regenerate.)

2. **The committed pbxproj signing picks the Apple DEVELOPMENT cert** against the App Store (Distribution) profile -> `ARCHIVE FAILED: profile doesn't include signing certificate "Apple Development..."`. This is the [[auto-prov-picks-dev-cert-prefer-manual-distribution-2026-05-20]] trap. Force the Distribution identity on the archive command line (per-target profiles stay from the project): `CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution: Ecodia Pty Ltd (86PUY7393S)" DEVELOPMENT_TEAM=86PUY7393S`.

3. **ASC dedups on `CFBundleVersion` within a marketing-version train.** Re-uploading the same build number fails 409 `ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE` with `previousBundleVersion: N`. Bump `CURRENT_PROJECT_VERSION` in `project.yml` to one above the last value ASC has SEEN (not just the last you think you shipped - a half-finished prior run may have uploaded N already), commit, regenerate, re-archive.

## The flow (each step one SSH session, keychain unlocked same-session per [[ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19]])

1. Bump `CURRENT_PROJECT_VERSION` in `project.yml` to one above the last TestFlight build, commit + push from Corazon.
2. On SY094: `cd ~/ecodia-native && git pull --ff-only origin main && /tmp/xcodegen/bin/xcodegen generate --spec project.yml` (install the portable xcodegen first per the section above).
3. Archive (keychain default+unlock+partition-list first, same session): `xcodebuild -project EcodiaNative.xcodeproj -scheme EcodiaApp -configuration Release -archivePath /tmp/ecodia-native-N.xcarchive -destination "generic/platform=iOS" archive CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution: Ecodia Pty Ltd (86PUY7393S)" DEVELOPMENT_TEAM=86PUY7393S` -> `** ARCHIVE SUCCEEDED **`. Steps 2+3 can chain in one SSH session.
4. Export with a MANUAL ExportOptions.plist (the committed `exportOptions.plist` is `signingStyle=automatic` and clashes with the manual archive): write `/tmp/ExportOptions-native.plist` with `method=app-store-connect`, `teamID`, `signingStyle=manual`, and a `provisioningProfiles` dict mapping each bundle id to its profile name. Then `xcodebuild -exportArchive -archivePath ... -exportPath /tmp/ecodia-native-N-export -exportOptionsPlist /tmp/ExportOptions-native.plist` -> `** EXPORT SUCCEEDED **`, `EcodiaOS.ipa` (~760KB, native, no Capacitor bloat).
5. Upload: `xcrun altool --upload-app -f /tmp/ecodia-native-N-export/EcodiaOS.ipa -t ios --apiKey R8P6K38X47 --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f` -> `UPLOAD SUCCEEDED` + Delivery UUID.
6. ASC processes ~10min; Apple emails Tate when it is installable in TestFlight.

## Long-bash gotcha

The archive/export can exceed the Bash tool foreground cap. Run via `run_in_background: true` with `TIMEOUT=1500` env on the sy094-ssh driver, then read the task output. Exit 0 from the SSH pipe is `tail`'s code, not xcodebuild's - confirm by grepping the output for `ARCHIVE SUCCEEDED` / `EXPORT SUCCEEDED` / `UPLOAD SUCCEEDED`.

Origin: 2026-05-20 build 11 ship during Tate's away-build run. Cross-refs: [[ios-app-asc-headless-ship-protocol.md]], [[auto-prov-picks-dev-cert-prefer-manual-distribution-2026-05-20]], [[ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19]].

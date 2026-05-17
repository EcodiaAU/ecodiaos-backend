---
triggers: coexist-ios-headless-ship, coexist-ios-testflight-ssh, coexist-ssh-archive, coexist-firebase-pbxproj, coexist-ios-ssh-build, coexist-spm-firebase, coexist-headless-ipa, coexist-ios-ship-recipe
status: validated_v1
---

# Co-Exist iOS Headless Ship Recipe (SSH Path) - status: validated_v1

**Use the universal protocol for one-line ships.** As of 17 May 2026 this is one of three app-specific deltas on the universal protocol at [ios-app-asc-headless-ship-protocol.md](ios-app-asc-headless-ship-protocol.md). For a routine 1.8.x or 1.9.x ship the one-line invocation is `python3 ~/asc-scripts/ship-ios.py coexist` on SY094 (driver + app spec already in place). This recipe remains the authoritative reference for Co-Exist's deltas (SPM, Firebase, gitignored GoogleService-Info.plist, ~/Desktop/projects/coexist path) and for any future blocker that the parametric driver doesn't yet handle.

Sister recipe to `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (EOS-mobile). Co-Exist deltas vs the EOS-mobile template: SPM-based (no CocoaPods), Firebase wiring in pbxproj, gitignored GoogleService-Info.plist, canonical build path at ~/Desktop/projects/coexist, and local signing mod stash workflow.

## Status (17 May 2026 - END-TO-END SUBMITTED FOR REVIEW)

**End-to-end verified through to App Store review submission.** Build 1.8.6(7) of Co-Exist uploaded AND submitted for Apple review 17 May 2026 ~15:03 AEST by conductor (no fork). Delivery UUID `0a7cbb5a-dc78-445e-a2d0-2a3d415025c5`. Submission UUID `85029c92-7d72-4997-be71-ef32ad48ffd9`, state `WAITING_FOR_REVIEW`. App.ipa 11MB. Apple processing ~30-60s, then submission flow ~5s. Auto-release on approval is ON (releaseType=AFTER_APPROVAL).

**Prior:** Build 1.8.5(2) uploaded 11 May 2026, fork `fork_mp0m711w_da02a2`, delivery `58187f51-4cdb-4d89-8a5e-16ab17daf045`. That run stopped at TestFlight upload; the review-submission step (Section 9 below) was added 17 May after Tate flagged the recipe didn't reach Apple review.

**Target commit on main:** f7194c1 (1.8.5 bundle - push notifications, share-graphic, splash, excel-sync gate, profile hero)

**Auth substrate:** ASC API key `R8P6K38X47` (issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`), .p8 at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8` on SY094 (mode 600). Same key as EOS-mobile recipe.

## Canonical build path (CRITICAL)

**Use `~/Desktop/projects/coexist`, NOT `~/workspaces/coexist`.**

kv_store doctrine entry: `ceo.doctrine.coexist_ios_build_path_2026-05-07` = `~/Desktop/projects/coexist`

Why: the Desktop copy has:
1. Firebase SPM wiring in `ios/App/App.xcodeproj/project.pbxproj` (XCRemoteSwiftPackageReference + FirebaseCore + FirebaseMessaging in Frameworks build phase)
2. `ios/App/App/GoogleService-Info.plist` (gitignored, real API key in place - bundle ID: org.coexistaus.app, Firebase project: co-exist-australia-208fa, GCM_SENDER_ID: 463010896295)
3. Local signing modifications (signing patches - see Section 3)

`~/workspaces/coexist` lacks Firebase wiring and the plist. Building from there fails with `Module 'FirebaseCore' not found` because AppDelegate.swift (added in 1.8.5) imports Firebase.

## Prerequisites

1. **SSH access via Remote Build Port** - MacInCloud +AU$9/mo add-on, activated 7 May 2026
2. **SY094 login password** in `kv_store.creds.macincloud.password`
3. **GitHub PAT** in `kv_store.creds.github_pat` (for git pull)
4. **ASC API key .p8** at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8` on SY094 (already in place)
5. **GoogleService-Info.plist** in `~/Desktop/projects/coexist/ios/App/App/GoogleService-Info.plist` (already in place, gitignored)
6. **Local signing patches** applied to pbxproj (see Section 3 below - stash workflow preserves these)

## Local signing patches (one-time, then preserved via stash workflow)

The pbxproj in the repo has Manual signing referencing "Ecodia Code" profile. SSH headless build needs Automatic signing. These patches are LOCAL only (not committed to git) and must be preserved across git pulls via stash:

```bash
# What must be in pbxproj for headless ship (vs repo defaults):
# MARKETING_VERSION = 1.8.5 (bumped per release)
# CURRENT_PROJECT_VERSION = 2 (bumped per release)
# CODE_SIGN_STYLE = Automatic (repo has Manual)
# DEVELOPMENT_TEAM = 86PUY7393S (repo may have empty string)
# CODE_SIGN_IDENTITY[sdk=iphoneos*] must NOT be set to "Apple Distribution" or "iPhone Distribution"
# PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*] must NOT be set to "Ecodia Code"
```

Apply once if not already in place (verify with grep first):
```bash
PROJ="$HOME/Desktop/projects/coexist/ios/App/App.xcodeproj/project.pbxproj"

# Set Automatic signing
sed -i '' 's/CODE_SIGN_STYLE = Manual/CODE_SIGN_STYLE = Automatic/g' "$PROJ"

# Clear manual profile specifier
sed -i '' 's/"PROVISIONING_PROFILE_SPECIFIER\[sdk=iphoneos\*\]" = "Ecodia Code";/"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]" = "";/g' "$PROJ"

# Clear manual cert identity
sed -i '' 's/"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "Apple Distribution";/"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "";/g' "$PROJ"
sed -i '' 's/"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "iPhone Distribution";/"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "";/g' "$PROJ"

# Set development team
sed -i '' 's/DEVELOPMENT_TEAM = "";/DEVELOPMENT_TEAM = 86PUY7393S;/g' "$PROJ"
```

Also verify ExportOptions.plist has teamID:
```bash
cat ~/Desktop/projects/coexist/ios/App/ExportOptions.plist
# Must contain: <key>teamID</key><string>86PUY7393S</string>
# If missing, rewrite the file (see Step 3 below)
```

## Step-by-step ship

### Step 1 - Stash local mods, pull, pop stash

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
cd ~/Desktop/projects/coexist
git stash push -m \"local-signing-mods-\$(date +%Y%m%d%H%M)\" -- ios/App/App.xcodeproj/project.pbxproj
git fetch && git checkout main && git pull https://x-access-token:${GITHUB_PAT}@github.com/EcodiaTate/coexist.git main
git stash pop
echo STASH_POP_EXIT=\$?
git log --oneline -3
'"
```

Stash pop exit=0 = clean. If conflicts, resolve manually.

### Step 2 - Bump version numbers in pbxproj

```bash
BUILD="1.8.5"  # marketing version
BUILD_NUM="2"  # increment each ship

sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
PROJ=\"\$HOME/Desktop/projects/coexist/ios/App/App.xcodeproj/project.pbxproj\"
sed -i \"\" \"s/MARKETING_VERSION = [0-9.]*/MARKETING_VERSION = ${BUILD}/g\" \"\$PROJ\"
sed -i \"\" \"s/CURRENT_PROJECT_VERSION = [0-9]*/CURRENT_PROJECT_VERSION = ${BUILD_NUM}/g\" \"\$PROJ\"
grep -E \"MARKETING_VERSION|CURRENT_PROJECT_VERSION\" \"\$PROJ\" | head -4
'"
```

### Step 3 - Verify signing patches + ExportOptions.plist

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
PROJ=\"\$HOME/Desktop/projects/coexist/ios/App/App.xcodeproj/project.pbxproj\"
echo \"=== Signing config ===\"
grep -E \"CODE_SIGN_STYLE|DEVELOPMENT_TEAM|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER\" \"\$PROJ\" | grep -v \"//\"
echo \"=== ExportOptions.plist ===\"
cat \"\$HOME/Desktop/projects/coexist/ios/App/ExportOptions.plist\"
'"

# ExportOptions.plist should be:
# <?xml version="1.0" encoding="UTF-8"?>
# <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
# <plist version="1.0"><dict>
#   <key>method</key><string>app-store-connect</string>
#   <key>teamID</key><string>86PUY7393S</string>
#   <key>signingStyle</key><string>automatic</string>
#   <key>uploadBitcode</key><false/>
#   <key>uploadSymbols</key><true/>
#   <key>compileBitcode</key><false/>
#   <key>destination</key><string>export</string>
# </dict></plist>

# If teamID is missing, rewrite:
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
cat > \"\$HOME/Desktop/projects/coexist/ios/App/ExportOptions.plist\" << EOF
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>86PUY7393S</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
EOF
echo ExportOptions.plist written
'"
```

### Step 4 - npm install + cap sync (no CocoaPods - SPM project)

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
cd ~/Desktop/projects/coexist
npm install --no-audit --no-fund 2>&1 | tail -3
npx cap sync ios 2>&1 | tail -5
'"
```

**No `pod install`** - this is an SPM-based project, not CocoaPods. Firebase is in SPM.

### Step 5 - Unlock keychain + Archive

```bash
ARCHIVE="/tmp/coexist-${BUILD}.xcarchive"

sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
security unlock-keychain -p \"${SY094_PW}\" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
cd ~/Desktop/projects/coexist/ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -archivePath /tmp/coexist-${BUILD}.xcarchive \
  -destination generic/platform=iOS archive \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  -authenticationKeyID R8P6K38X47 \
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f \
  DEVELOPMENT_TEAM=86PUY7393S \
  CODE_SIGN_STYLE=Automatic 2>&1 | tail -10
'" 2>&1
```

Note: **`-project App.xcodeproj`** not `-workspace App.xcworkspace` - this is an SPM project, xcworkspace does not exist.

Look for `** ARCHIVE SUCCEEDED **`.

### Step 6 - Unlock keychain + Export IPA

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
security unlock-keychain -p \"${SY094_PW}\" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
rm -rf /tmp/coexist-${BUILD}-export
xcodebuild -exportArchive \
  -archivePath /tmp/coexist-${BUILD}.xcarchive \
  -exportPath /tmp/coexist-${BUILD}-export \
  -exportOptionsPlist ~/Desktop/projects/coexist/ios/App/ExportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  -authenticationKeyID R8P6K38X47 \
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -10
ls /tmp/coexist-${BUILD}-export/
'"
```

Look for `** EXPORT SUCCEEDED **` and `App.ipa` in listing.

### Step 7 - Upload via altool

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
xcrun altool --upload-app -f /tmp/coexist-${BUILD}-export/App.ipa -t ios \
  --apiKey R8P6K38X47 \
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1
'" 2>&1
```

Returns `UPLOAD SUCCEEDED with no errors` + Delivery UUID. Record the UUID.

### Step 8 - Verify build state via ASC API

Poll `/v1/builds?filter[app]={APP_ID}&filter[preReleaseVersion.version]={BUILD}&filter[version]={BUILD_NUM}` until `processingState == 'VALID'` (typically 30-90s post-altool-upload, sometimes up to 10min). APP_ID for Co-Exist is `6760897574`. PyJWT-based probe script template in `~/asc-scripts/asc-probe.py` on SY094.

### Step 9 - Attach build + submit for Apple review (reviewSubmissions API)

**The deprecated `appStoreVersionSubmissions` endpoint returns 403 FORBIDDEN as of 2026** ("The resource 'appStoreVersionSubmissions' does not allow 'CREATE'. Allowed operation is: DELETE"). Use the newer `reviewSubmissions` container flow.

Prerequisite: an App Store version row at `versionString = {BUILD}` already exists in ASC for the app with state `PREPARE_FOR_SUBMISSION` and metadata (description, what's new, screenshots) filled in. Whoever bumped marketing version typically creates this in ASC web UI. If missing, create via `POST /v1/appStoreVersions` with relationship to the app.

Flow (full script at `~/asc-scripts/asc-submit-v2.py` on SY094):
1. `PATCH /v1/appStoreVersions/{ASV_ID}/relationships/build` with body `{"data":{"type":"builds","id":"{BUILD_ID}"}}` to attach the new build to the App Store version. Returns 204 on success.
2. Check `GET /v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES` for an in-flight submission. If one exists, reuse its id. Otherwise:
3. `POST /v1/reviewSubmissions` with body `{"data":{"type":"reviewSubmissions","attributes":{"platform":"IOS"},"relationships":{"app":{"data":{"type":"apps","id":"{APP_ID}"}}}}}` → returns 201 with `submission_id`.
4. `POST /v1/reviewSubmissionItems` with `relationships.reviewSubmission` pointing to the submission and `relationships.appStoreVersion` pointing to the ASV → returns 201.
5. `PATCH /v1/reviewSubmissions/{submission_id}` with `{"data":{"type":"reviewSubmissions","id":"{submission_id}","attributes":{"submitted":true}}}` → state flips from `READY_FOR_REVIEW` to `WAITING_FOR_REVIEW`. **This is the actual submit action.**

After step 5, Apple's review queue takes over. If the App Store version has `releaseType=AFTER_APPROVAL` (default for Co-Exist), once Apple approves the build auto-releases without any further click - see `~/ecodiaos/patterns/asc-auto-release-on-approval-no-manual-release-step.md`.

### Step 10 - Verify in ASC web (optional)

Check App Store Connect > My Apps > Co-Exist > App Store > 1.8.x. State should be "Waiting for Review" within seconds of step 5. TestFlight tab shows the build under processed builds for any internal testers.

## Project specifics vs EOS-mobile recipe

| Aspect | EOS-mobile | Co-Exist |
|--------|-----------|---------|
| Build dir | ~/code/ecodia-os-mobile | **~/Desktop/projects/coexist** |
| Build system | CocoaPods (.xcworkspace) | **SPM (.xcodeproj only)** |
| xcodebuild flag | `-workspace App.xcworkspace` | **`-project App.xcodeproj`** |
| Pod install step | Required | **Skip (not CocoaPods)** |
| Firebase | Not present | **FirebaseCore + FirebaseMessaging in SPM** |
| GoogleService-Info.plist | Not needed | **Required (gitignored, already in place)** |
| Local signing mods | Not needed | **Stash workflow - preserve across pulls** |
| Bundle ID | au.ecodia.os.mobile | **org.coexistaus.app** |
| ASC API key | R8P6K38X47 | **Same: R8P6K38X47** |

## Failure modes specific to Co-Exist

1. **`Module 'FirebaseCore' not found`** - Built from wrong directory (`~/workspaces/coexist` lacks Firebase wiring). Fix: use `~/Desktop/projects/coexist`.

2. **`No Team Found in Archive`** during exportArchive - ExportOptions.plist missing `<key>teamID</key><string>86PUY7393S</string>`. Fix: rewrite ExportOptions.plist with teamID.

3. **`xccconfig: Error reading... Code_Sign_Style`** - pbxproj has Manual signing conflicting with `-allowProvisioningUpdates`. Fix: apply signing patches from Section 3.

4. **`errSecInternalComponent`** during exportArchive - keychain locked. Fix: unlock before BOTH archive AND exportArchive steps.

5. **Git stash conflict on pull** - local pbxproj mods conflict with upstream changes. Fix: resolve conflict carefully, re-apply signing patches if needed.

6. **`xcworkspace not found`** if using `-workspace App.xcworkspace` - this is SPM, not CocoaPods, no xcworkspace generated. Fix: use `-project App.xcodeproj`.

## Speed wins

- npm install is slow first time (~60s), faster on repeats if node_modules cached
- cap sync ~10s
- Archive ~90s (SPM resolves + compiles Firebase)
- Export ~30s
- altool upload ~10-15s for 11MB IPA
- Total wall time: ~4min (vs ~10min for RDP-Xcode path)

## Origin

- 11 May 2026, fork `fork_mp0m711w_da02a2`
- Tate directive: "Okay hold on you can upload 1.8.5 via ssh, do it" (12:59 AEST)
- Target commit: f7194c1 (1.8.5 bundle)
- Multiple blockers resolved: wrong build dir, Manual signing conflict, missing teamID in ExportOptions.plist, xcworkspace vs xcproject
- UPLOAD SUCCEEDED 13:17 AEST, Delivery UUID `58187f51-4cdb-4d89-8a5e-16ab17daf045`
- Recipe validated_v1 on first complete run

## Extension (17 May 2026) - review-submission step

- Conductor (no fork) ran end-to-end including new Step 9 to submit 1.8.6 build 7 to Apple review
- Target commit: d2b7c70 (verify-email auto-confirm fix)
- New finding: `appStoreVersionSubmissions` endpoint is 403 deprecated, must use `reviewSubmissions` container flow
- New finding: ASC API auth flow (PyJWT + .p8 already on SY094) supports the full submit, no need to touch the ASC web UI
- Submission UUID `85029c92-7d72-4997-be71-ef32ad48ffd9` 15:03 AEST, state WAITING_FOR_REVIEW
- Tate directive: "You should be able to ssh into the mac in cloud and push 1.8.6 to asc for apple review"

## Cross-references

- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` - sister recipe (EOS-mobile, CocoaPods path)
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - SSH vs RDP doctrine
- `~/ecodiaos/patterns/ios-signing-credential-paths.md` - signing credential cluster
- `~/ecodiaos/docs/secrets/macincloud.md` - SY094 SSH creds

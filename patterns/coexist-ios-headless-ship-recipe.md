---
triggers: coexist-ios-headless-ship, coexist-ios-testflight-ssh, coexist-ssh-archive, coexist-firebase-pbxproj, coexist-ios-ssh-build, coexist-spm-firebase, coexist-headless-ipa, coexist-ios-ship-recipe
status: validated_v1
---

# Co-Exist iOS Headless Ship Recipe (SSH Path) - status: validated_v1

Sister recipe to `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (EOS-mobile). Covers Co-Exist specifically, which differs from the EOS-mobile template in: SPM-based (no CocoaPods), Firebase wiring in pbxproj, gitignored GoogleService-Info.plist, canonical build path at ~/Desktop/projects/coexist, and local signing mod stash workflow.

## Status (11 May 2026 - SHIPPED)

**End-to-end verified shipped.** Build 1.8.5(2) of Co-Exist uploaded to ASC via `xcrun altool --upload-app` 11 May 2026 ~13:17 AEST, fork `fork_mp0m711w_da02a2`. Delivery UUID `58187f51-4cdb-4d89-8a5e-16ab17daf045`. App.ipa 11MB. Apple processing ~5-10min after upload.

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

### Step 8 - Verify

Check ASC web (Corazon Chrome): App Store Connect > My Apps > Co-Exist > TestFlight > iOS builds. Build appears as "Processing" within ~5min, then "Ready to Test".

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

## Cross-references

- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` - sister recipe (EOS-mobile, CocoaPods path)
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - SSH vs RDP doctrine
- `~/ecodiaos/patterns/ios-signing-credential-paths.md` - signing credential cluster
- `~/ecodiaos/docs/secrets/macincloud.md` - SY094 SSH creds

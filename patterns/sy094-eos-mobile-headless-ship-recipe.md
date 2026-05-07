---
triggers: sy094-eos-mobile-headless-ship, eos-mobile-testflight, ecodia-os-mobile-ship, ssh-headless-ipa-ship, xcodebuild-ssh-archive, asc-api-key-required-for-headless, headless-export-no-accounts, no-profiles-found-au-ecodia-os-mobile, capacitor-ios-ssh-build, sy094-ssh-headless-build
---

# SY094 EcodiaOS-mobile headless ship recipe (SSH-only path) - status: validated_v1

Sister recipe to `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (which is the GUI Xcode Distribute App flow via RDP). This recipe is the SSH-headless path authorised by `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` (7 May 2026 doctrine, +AU$9/mo Remote Build Port add-on).

## Status (7 May 2026 - SHIPPED)

**End-to-end verified shipped.** Build 0.1.0(2) of `ecodia-os-mobile` uploaded to ASC via `xcrun altool --upload-app` 7 May 2026 13:17 AEST, fork `fork_mouwvjwr_41aaf0`. Delivery UUID `4ca8831d-a46a-423c-a054-2050951a4df2`. App.ipa 907,931 bytes. Total time from `xcodebuild -exportArchive` to "UPLOAD SUCCEEDED" = ~70s (export ~50s, altool ~10s). Apple processing ~5-10min after.

**Auth substrate:** ASC API key `R8P6K38X47` (issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`), .p8 at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8` on SY094 (mode 600). Tate generated the key in ASC and Tate-side downloaded the .p8 to Corazon `D:\Downloads\AuthKey_R8P6K38X47.p8`. The .p8 was fetched to VPS via `filesystem.readFile`, then transmitted to SY094 via base64-over-SSH (no contents in process listings or logs). Sub-object schema in `~/ecodiaos/docs/secrets/apple.md > value.asc_api_key`.

**Codesign-over-SSH gotcha (FIRST-TIME-RUN GOTCHA):** `xcodebuild -exportArchive` failed on first attempt with:
```
error: exportArchive codesign command failed (... Frameworks/Capacitor.framework: errSecInternalComponent)
```
because the SY094 login keychain was locked over SSH (no GUI Aqua context = no auto-unlock). Fixed by:
```bash
security unlock-keychain -p "$SY094_PW" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
```
where `$SY094_PW` is the SY094 login password (same as SSH password from `kv_store.creds.macincloud.password`). The `-lut 7200` extends the lock timeout to 2h so subsequent steps in the same ship don't re-fail. Always run this BEFORE any `xcodebuild -exportArchive` over SSH.

## When to use

Once the ASC API key prerequisite below is in place, prefer this recipe over the RDP-Xcode-Organizer flow for any Capacitor-wrapped app shipping to TestFlight from SY094. SSH-headless is faster (~3-4 min for build + ~1 min for upload vs ~10 min for RDP-Xcode), no GUI Aqua context needed, no eos-laptop-agent required.

## Prerequisites

1. **SSH access via Remote Build Port** (paid +AU$9/mo MacInCloud add-on). Activated 7 May 2026.
2. **GitHub PAT** in `kv_store.creds.github_pat` (consumer surface for `git clone` over https).
3. **AC_PASSWORD entry in SY094 login.keychain** (Apple ID password for code@ecodia.au, used by `xcrun altool` upload via `@keychain:AC_PASSWORD`). One-time setup:
   ```bash
   security unlock-keychain -p '<sy094_password>' login.keychain
   security add-generic-password -a code@ecodia.au -w '<apple_id_password>' -s AC_PASSWORD -U login.keychain
   ```
   Pull `<apple_id_password>` from `kv_store.creds.apple.password.value`.
4. **App Store Connect API key (.p8) on SY094** at `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` plus issuer_id + key_id stored as sub-object on `kv_store.creds.apple > value.asc_api_key`. **SATISFIED as of 7 May 2026 13:14 AEST** — `R8P6K38X47` / issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`. See `~/ecodiaos/docs/secrets/apple.md > value.asc_api_key` for full sub-object.
5. **Bundle ID + capabilities + ASC App record + Internal Testing group** all set up via Apple Developer portal + ASC web (one-time per app, Tate-side via Corazon Chrome / recordings).
6. **Distribution provisioning profile** for `au.ecodia.os.mobile` (auto-fetched by `xcodebuild -allowProvisioningUpdates` once ASC API key is in place; manual download + scp also works).

## Pre-flight checklist (read-only)

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
echo NODE=\$(node --version)
echo POD=\$(which pod)
echo RUBY=\$(ruby --version)
security find-generic-password -s AC_PASSWORD -a code@ecodia.au >/dev/null 2>&1 && echo HAVE_AC_PASSWORD || echo MISSING_AC_PASSWORD
ls ~/.appstoreconnect/private_keys/AuthKey_*.p8 2>/dev/null && echo HAVE_ASC_KEY || echo MISSING_ASC_KEY
security find-identity -p codesigning -v 2>&1 | grep \"Apple Distribution: Ecodia Pty Ltd\" && echo HAVE_DIST_CERT || echo MISSING_DIST_CERT
'"
```

If any returns MISSING, fix before proceeding.

## Step-by-step ship (assumes prereqs satisfied)

### Step 1 - Pull repo + bump build number

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
cd ~/code/ecodia-os-mobile && git fetch && git checkout main && git pull
git rev-parse HEAD
'"
```

If you need to bump CFBundleVersion: edit `ios/App/App.xcodeproj/project.pbxproj` Debug+Release configs locally, push, then SSH-pull on SY094.

### Step 2 - Build archive

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
cd ~/code/ecodia-os-mobile
npm install --no-audit --no-fund 2>&1 | tail -3
npx cap sync ios 2>&1 | tail -5
cd ios/App && pod install 2>&1 | tail -5
security unlock-keychain -p \"$SY094_PW\" login.keychain
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -archivePath ~/build/eos-mobile-build\${BUILD_NUM}.xcarchive \
  -destination generic/platform=iOS archive \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=86PUY7393S \
  CODE_SIGN_STYLE=Automatic 2>&1 | tail -10
'"
```

Archive succeeds with development cert auto-applied. `** ARCHIVE SUCCEEDED **`.

### Step 3 - Export IPA (USES ASC API KEY .p8 ON DISK)

`ios/App/export-options.plist`:
```xml
<plist version="1.0"><dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>86PUY7393S</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
```

```bash
# CRITICAL: unlock keychain BEFORE xcodebuild -exportArchive over SSH or codesign fails with errSecInternalComponent
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "bash -lc '
security unlock-keychain -p \"$SY094_PW\" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
cd ~/code/ecodia-os-mobile/ios/App
rm -rf ~/build/ipa
xcodebuild -exportArchive \
  -archivePath ~/build/eos-mobile-build\${BUILD_NUM}.xcarchive \
  -exportPath ~/build/ipa \
  -exportOptionsPlist export-options.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  -authenticationKeyID R8P6K38X47 \
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -10
ls ~/build/ipa/
'"
```

Produces `~/build/ipa/App.ipa`. Look for `** EXPORT SUCCEEDED **`. Pull current key_id/issuer_id from `kv_store.creds.apple > value.asc_api_key` if rotated; values above are the canonical ones as of 7 May 2026.

### Step 4 - Upload via altool

```bash
# altool autodiscovers .p8 from canonical ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 path
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "
xcrun altool --upload-app -f ~/build/ipa/App.ipa -t ios \
  --apiKey R8P6K38X47 \
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -10
"
```

Returns `UPLOAD SUCCEEDED with no errors` + Delivery UUID. Build appears in ASC under "Processing" within ~5 min, then "Ready to Test". TestFlight Internal Testing group auto-receives.

### Step 5 - Verify

```bash
sshpass -p "$SY094_PW" ssh user276189@SY094.macincloud.com "
xcrun altool --list-builds \
  --apiKey R8P6K38X47 \
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f \
  --output-format json 2>&1
" | head -50
```

Or check ASC web (Corazon Chrome): App Store Connect > My Apps > EcodiaOS > TestFlight > iOS builds.

## Failure modes

1. **`error: exportArchive No Accounts` + `No profiles for '<bundle_id>' were found`** - missing ASC API key. Fix per prereq 4 above.
2. **`error: exportArchive codesign command failed (... errSecInternalComponent)`** - login keychain locked over SSH. SSH session has no GUI Aqua context = no auto-unlock. Fix:
   ```bash
   security unlock-keychain -p "$SY094_PW" ~/Library/Keychains/login.keychain-db
   security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
   ```
   ALWAYS run before `xcodebuild -exportArchive` over SSH (Step 3 has it inlined). The `-lut 7200` extends the lock timeout to 2h so subsequent `xcodebuild` / `altool` calls in the same arc don't re-fail.
3. **`User interaction is not allowed`** during `security` calls - keychain locked, same fix as failure mode 2.
4. **`failed to get: -25308`** during `git clone` - macOS keychain prompting for credentials in non-GUI context. Use https://x-access-token:<PAT>@github.com/... URL instead of bare https://github.com/...
5. **`No AppShortcuts found`** warning during archive - benign, ignore.
6. **CocoaPods missing** - SY094 has homebrew pod at `/opt/homebrew/bin/pod` (verified 7 May 2026). Use `bash -lc` to source PATH.
7. **Apple ID 2FA challenge** - if altool falls back to Apple ID password auth instead of API key, 2FA hits. ASC API key path bypasses 2FA entirely (account-level cert). Always prefer `--apiKey` over `-u <apple_id> -p @keychain:AC_PASSWORD` for headless flows.

## Speed wins identified

- Pre-cache homebrew pod (already done as of 7 May 2026)
- Pre-stage GitHub PAT-injected git remote (so `git pull` doesn't re-prompt)
- Use `-quiet` flag on xcodebuild archive (drops verbose to ~10 lines, easier to grep result)
- Skip `pod install` if Pods/ already exists from prior sync (saves ~3s)

## Anti-patterns

- DO NOT use `-u <apple_id> -p <password>` with regular Apple ID password - Apple deprecated this for altool in 2025. Use app-specific password OR (preferred) ASC API key.
- DO NOT manually drive Xcode IDE on SY094 via RDP for SSH-headless-eligible work - that's the GUI-fallback recipe, not this one. Per `macincloud-substrate-selection-ssh-vs-rdp.md` only fall back to RDP for genuine GUI-bound work (Xcode IDE first-time signin, asset catalog editing, App Store Connect upload via Organizer).
- DO NOT inline Apple ID password as a `security add-generic-password -w <password>` arg via SSH if the SY094 host is shared - process listing leak. Single-tenant MacInCloud SY094 is acceptable risk; multi-tenant would require keychain pre-stage via RDP.
- DO NOT commit AuthKey .p8 files to git. Store via `kv_store.creds.asc_api_keys` JSON (base64 the .p8 contents) and write to disk on demand if rotated.

## Origin

- 7 May 2026, fork_mouw0p4a_c74584, attempted full SSH-headless ship of EOS mobile build 0.1.0(2)
- Build phase verified working end-to-end (archive succeeded ~12:52 AEST)
- Export + upload phase initially blocked on missing ASC API key .p8 on SY094
- Prior fork fork_mouuupv5_ff0d37 (12:13-12:23 AEST) bumped CFBundleVersion 1->2 (commit 25488d5)
- Tate's recordings ~12:25-12:45 AEST 7 May 2026 resolved: bundle ID + Push Notifications capability + ASC App record + Internal Testing group + Xcode signing team
- Tate generated ASC API key R8P6K38X47 + downloaded .p8 to Corazon `D:\Downloads\` 13:11 AEST
- Resume fork `fork_mouwvjwr_41aaf0` 13:13-13:18 AEST: fetched .p8 via Corazon laptop-agent → persisted on VPS + SY094 (mode 600) → ran exportArchive (failed first time on locked keychain → unlocked → succeeded) → altool upload (UPLOAD SUCCEEDED, Delivery UUID `4ca8831d-a46a-423c-a054-2050951a4df2`) → status flipped to validated_v1
- Codification authorised by `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` (7 May 2026 doctrine, +AU$9/mo Remote Build Port add-on activated 11:28 AEST 7 May 2026)
- Neo4j Decision: "EOS mobile TestFlight ship 0.1.0(2) shipped 7 May 2026 via ASC API key" (id 771)

## Cross-references

- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - sister recipe via RDP-Xcode-Organizer (GUI path, ~10 min, no ASC API key needed)
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - parent doctrine authorising SSH for headless work
- `~/ecodiaos/patterns/ios-signing-credential-paths.md` - signing credential cluster (team_id, Apple ID, keychain entries)
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` - exception note: ASC API key IS the right credential for headless build pipelines (server-to-server, no human GUI in loop)
- `~/ecodiaos/patterns/play-console-android-release-recipe.md` - cross-platform sister recipe for Android side

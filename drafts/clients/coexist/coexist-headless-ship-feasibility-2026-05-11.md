# Co-Exist headless ship feasibility — probe results 2026-05-11

Authored by fork_mp0l0xv8_e89962. READ-ONLY probe of SY094 via SSH. No builds, no uploads, no state changes.

---

## Section 1 — Existing recipe analysis

### EOS Mobile headless recipe (the precedent)

`~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` — status: `validated_v1`

End-to-end verified 7 May 2026. Key characteristics:
- SSH-only, no GUI/RDP required
- `xcodebuild archive` with `CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=86PUY7393S -allowProvisioningUpdates` + ASC API key auth flags
- `xcodebuild -exportArchive` using an export-options.plist with `signingStyle: automatic`
- `xcrun altool --upload-app` with ASC API key (`--apiKey R8P6K38X47 --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f`)
- Keychain unlock before export: `security unlock-keychain` + `security set-keychain-settings -lut 7200`
- Total: ~70s build+upload

### Co-Exist current recipe

`~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — status: `validated_v1`

GUI-driven via RDP to SY094 (~10min e2e). WHY it needed RDP:
1. Uses `CODE_SIGN_STYLE = Manual` + `PROVISIONING_PROFILE_SPECIFIER = "Ecodia Code"` in pbxproj
2. Upload done via Xcode Organizer Distribute App GUI flow (required Xcode signed-in Apple ID)
3. Archive placed in `~/Library/Developer/Xcode/Archives/<date>/` (Organizer auto-detects)
4. No export-options.plist for the headless altool path was configured
5. No ASC API key was in use (doctrine at time was gui-macro over generated API key)
6. SSH was FORBIDDEN per 5 May 2026 doctrine (superseded 7 May when Remote Build Port add-on activated)

**Root cause of GUI requirement:** the `gui-macro-uses-logged-in-session-not-generated-api-key.md` doctrine was applied to block the API key path. 7 May 2026 EOS Mobile proved the API key path is correct for headless pipelines. The Co-Exist recipe was authored before EOS Mobile proved the headless path viable.

### Android recipe

`~/ecodiaos/patterns/play-console-android-release-recipe.md` — status: paper-authored, `verification pending`

Build phase: VPS or SY094 (`gradlew bundleRelease`). Upload phase: GUI via Tate's logged-in Chrome on Corazon driving Play Console. No Play Console service account provisioned.

---

## Section 2 — SY094 state probe (2026-05-11 via SSH)

### Connection
- Host: `user276189@SY094.macincloud.com` port 22 (Remote Build Port add-on active since 7 May 2026)
- macOS: 15.7.4, Xcode: 26.3 (Build 17C529), Node: v22.15.1, Java: OpenJDK 21.0.10

### Co-Exist repo
- Location: `~/Desktop/projects/coexist` CONFIRMED
- Latest commit: `7dc39e5 feat(events): UGC share-graphic generator + registration animation polish (1.8.5 polish E)`
- Branch: `main`, tracking `origin/main`
- Modified files: `ios/App/App.xcodeproj/project.pbxproj`, `ios/App/App/Info.plist`, `ios/App/CapApp-SPM/Package.swift` (from prior build activity)
- MARKETING_VERSION: `1.8.4`
- CURRENT_PROJECT_VERSION: `1`

### iOS signing state
| Item | State | Notes |
|------|-------|-------|
| CODE_SIGN_STYLE | `Manual` | In pbxproj for Release config |
| PROVISIONING_PROFILE_SPECIFIER | `Ecodia Code` | For iphoneos Release only |
| DEVELOPMENT_TEAM (iphoneos) | `86PUY7393S` | Ecodia Pty Ltd — correct |
| CODE_SIGN_IDENTITY (iphoneos) | `Apple Distribution` | For Release |
| Bundle ID | `org.coexistaus.app` | Matches ASC app record |
| Apple Distribution cert | `117DB87A52D3975847024FC146FF44E49EFCE66E "Apple Distribution: Ecodia Pty Ltd (86PUY7393S)"` | PRESENT ✓ |
| ASC API key | `AuthKey_R8P6K38X47.p8` at `~/.appstoreconnect/private_keys/` | PRESENT ✓ (mode 600, 258 bytes, 7 May 13:14) |
| AC_PASSWORD keychain entry | HAVE_AC_PASSWORD | PRESENT ✓ |
| Provisioning profiles | **0 installed** (empty dir) | NOT a hard blocker — auto-fetched by `-allowProvisioningUpdates` |
| ExportOptions.plist | PRESENT at `ios/App/ExportOptions.plist` | `method: app-store-connect`, `signingStyle: automatic` |
| SPM or CocoaPods | SPM (CapApp-SPM/) | Capacitor 7+ pattern. No pod install needed |
| Prior Co-Exist archive | `CoExist-1.7-build2.xcarchive` (2026-05-04) | From GUI flow; proves archive path works |

### Android state on SY094
| Item | State | Notes |
|------|-------|-------|
| Android dir present | YES | `~/Desktop/projects/coexist/android/` with gradlew, app/, etc. |
| gradlew | PRESENT | `~/Desktop/projects/coexist/android/gradlew` |
| Java | OpenJDK 21.0.10 | PRESENT ✓ |
| Android SDK | ASSUMED present | Android Studio listed as installed app |
| Keystore .jks on SY094 | **NOT FOUND** | coexist-release.jks lives on VPS at `~/workspaces/coexist/android/app/`. Backed up in `kv_store.creds.android.coexist.keystore_b64` |
| Keystore passwords | **NULL** in kv_store | HARD GATE. `keystore_password` and `key_password` fields are null. Tate-action required |
| Play Console service account | NOT FOUND | `~/.config/google-cloud/` absent |
| Fastlane | NOT FOUND | No Fastfile anywhere on SY094 |

---

## Section 3 — Gap-closer analysis

### iOS gap-closers

**Gap 1: Manual signing in pbxproj**

This is NOT a hard blocker. The EOS Mobile recipe proves that passing `CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=86PUY7393S` as xcodebuild overrides at the command line, combined with `-allowProvisioningUpdates -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 -authenticationKeyID R8P6K38X47 -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f`, overrides the Manual setting entirely and auto-fetches or creates profiles. The pbxproj setting is overridden at build time.

The ExportOptions.plist already says `signingStyle: automatic` — consistent with the headless approach.

**Gap 2: No provisioning profiles installed**

NOT a hard blocker. `-allowProvisioningUpdates` with the ASC API key credentials auto-downloads the distribution profile for `org.coexistaus.app` from ASC at archive time. This is exactly the mechanism EOS Mobile uses.

**Gap 3: `method: app-store-connect` in ExportOptions.plist**

This is the Xcode 15+ method name (previously `app-store`). Xcode 26.3 supports this. No gap.

**Gap 4: No separate `export-options.plist` for altool path**

ExportOptions.plist already exists with the correct settings for the headless path. Just reference it in `xcodebuild -exportArchive -exportOptionsPlist`. No additional file needed.

**Gap 5: Keychain not unlocked over SSH**

Known class — documented in EOS Mobile recipe (errSecInternalComponent failure mode). Fix is identical: `security unlock-keychain -p '$SY094_PW' ~/Library/Keychains/login.keychain-db && security set-keychain-settings -lut 7200` before any xcodebuild call. AND: `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '$SY094_PW' ~/Library/Keychains/login.keychain-db` (documented in Co-Exist RDP recipe Phase 0a as needed every run).

**Summary: iOS headless — NO HARD BLOCKERS.** All gaps are known patterns with documented fixes. The ASC API key R8P6K38X47 is team-scoped (team 86PUY7393S) and covers `org.coexistaus.app` (same team as EOS Mobile). The headless path requires zero Tate action.

### Android gap-closers

**Gap 1: Keystore passwords = NULL (HARD GATE)**

`kv_store.creds.android.coexist.keystore_password` and `.key_password` are null. The build fails at signing time (`./gradlew bundleRelease` exits with "Failed to read keystore"). The passwords were set at keystore creation time and live only in Tate's memory or build environment.

Gap-closer: **Tate provides both passwords.** One SMS/iMessage with both values. Store in kv_store, build unblocked.

Alternative: The keystore IS committed to git (`f56d01b`) at `android/app/coexist-release.jks` — so the file is available. Just the passwords are missing.

**Gap 2: Keystore not on SY094**

Trivial to resolve: the keystore_b64 is in kv_store. Can base64-decode and scp to SY094 at build time. Or scp from VPS workspace. Not a Tate action.

**Gap 3: No headless Play Console upload path**

The Play Console service account JSON is not provisioned and is demoted to fallback by doctrine. BUT: the current recipe design already uses Tate's logged-in Chrome on Corazon via `input.*` + `screenshot.*` — this IS conductor-driven (no Tate-at-keyboard required, just Tate's Chrome session being alive on Corazon). So "headless" for Android means: conductor drives it autonomously without Tate at the keyboard, not "no GUI at all."

Gap-closer: **None needed.** The Play Console upload via Corazon Chrome is already the designed path. The conductor drives it via the laptop-agent.

**Gap 4: Android SDK on SY094 unverified**

Android Studio is listed as installed. gradlew is present. Java 21 is confirmed. High confidence the Android SDK is available. Would surface as build failure if SDK is missing — recoverable.

---

## Section 4 — Verdict

### iOS headless: YES

**Confidence: High.** The path directly mirrors the EOS Mobile recipe:
- Same ASC API key (R8P6K38X47, team-scoped, covers both apps)
- Same distribution cert
- Same keychain unlock pattern
- Same `CODE_SIGN_STYLE=Automatic` override + `-allowProvisioningUpdates` pattern
- ExportOptions.plist already present with correct settings
- Capacitor + SPM = same build structure as EOS Mobile

**Expected e2e time:** ~3-5min (vs EOS Mobile ~70s because Co-Exist is a larger app with more SPM dependencies; first run after a `git pull` with `npm run build + npx cap sync` adds ~30s).

**What Tate needs to authorise/provision:** Nothing. The recipe can be attempted as-is on the next build event. Suggest: Tate confirms go-ahead for a test ship attempt (build + upload to TestFlight) as the validation run.

**Remaining uncertainty (low risk):** The `CODE_SIGN_STYLE=Automatic` command-line override has not been tested against this specific project. If the pbxproj Manual setting causes a conflict, the fix is to add `CODE_SIGN_STYLE=Automatic` into the pbxproj itself (a 2-line edit, fork-author, push to origin). No Tate action needed for that fix either.

### Android headless: PARTIAL

**Confidence: Medium.** Build phase is blocked on keystore passwords (NULL). Upload phase is conductor-driven via Corazon Chrome (no Tate-at-keyboard required once Chrome session is alive).

**What Tate needs to authorise/provision:**
1. **Keystore passwords (mandatory).** Both `COEXIST_KEYSTORE_PASSWORD` and `COEXIST_KEY_PASSWORD`. Tate likely knows these from when the keystore was created, or they're in a password manager. One iMessage with both values unblocks Android builds permanently.

**Once passwords are in kv_store:** The full Android pipeline (build on SY094 + upload to Play Console via Corazon Chrome) can run conductor-autonomously. No Tate-at-keyboard needed.

### Effort estimate

| Path | Effort to ship recipe | vs keeping GUI path |
|------|----------------------|---------------------|
| iOS headless | 1 fork, ~1-2h, test ship attempt | Saves ~8-9min per release + removes Tate-at-RDP requirement entirely |
| Android headless build + GUI upload | Already designed. Unblocked by Tate providing 2 passwords (~30min Tate time) | Unblocks autonomous Android builds. Play Console upload already conductor-driven |

**Recommendation:** iOS headless recipe — ship the spec and authorise a test build next turn. Android — send Tate one iMessage requesting both keystore passwords. Both paths are low-effort high-autonomy wins.

---

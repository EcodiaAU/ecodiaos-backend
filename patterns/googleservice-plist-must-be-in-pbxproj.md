---
title: GoogleService-Info.plist must be registered in project.pbxproj
triggers: googleservice, firebase, plist, ios-crash, xcodeproj, pbxproj, bundle-resource, crash-on-open, firebase-init
status: active
authored_at: 2026-05-13
origin_fork: fork_mp3mxfib_bf67ca
---

# GoogleService-Info.plist must be registered in project.pbxproj

## Rule

A `GoogleService-Info.plist` file present on disk at `ios/App/App/GoogleService-Info.plist` is **silently dropped from every archive** if it has zero entries in `project.pbxproj`. The file must appear in all four Xcode project data structures to actually land in the IPA bundle.

## Failure Mode

App crashes on launch with no console output visible to the user. Firebase cannot initialize (no plist to read BUNDLE_ID / API keys from) so `FirebaseApp.configure()` throws on app start. This is **not** the same error as Firebase SPM not linked (builds 1+3) - those crash differently. Missing plist = immediate crash before any JS loads.

**Verification:** `unzip -l App.ipa | grep -i GoogleService` returning exit 1 (no match) on a shipped IPA is the smoking gun.

## Required entries in project.pbxproj (all four)

```
/* PBXBuildFile section */
<UUID_A> /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = <UUID_B>; };

/* PBXFileReference section */
<UUID_B> /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };

/* PBXGroup (App group children) */
<UUID_B> /* GoogleService-Info.plist */,

/* PBXResourcesBuildPhase files */
<UUID_A> /* GoogleService-Info.plist in Resources */,
```

## Verification before shipping

```bash
# Check plist is in pbxproj
grep -c "GoogleService" ios/App/App.xcodeproj/project.pbxproj
# Must be >= 4 (FileRef + BuildFile + Group + Resources)

# Check plist is in IPA
unzip -l /tmp/coexist-X.X.X-export/App.ipa | grep -i GoogleService
# Must show: Payload/App.app/GoogleService-Info.plist
```

## Headless build signing settings (Co-Exist / Ecodia builds)

For headless SSH archive with `-allowProvisioningUpdates` + ASC API key:
- `CODE_SIGN_STYLE = Automatic` (not Manual)
- `CODE_SIGN_IDENTITY[sdk=iphoneos*] = "Apple Development"` (not "Apple Distribution")
- `PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*] = ""` (empty, not "Ecodia Code")

Automatic + empty specifier + `-allowProvisioningUpdates -authenticationKeyPath <p8>` = Xcode manages certs/profiles via ASC. Setting Manual or hardcoding "Apple Distribution" identity conflicts with the CLI override and produces `errSecInternalComponent` (keychain can't access signing key headlessly) or "conflicting provisioning settings" errors.

## Repair script (Python)

```python
# Add GoogleService-Info.plist to pbxproj
FILE_REF_UUID   = "FA11B0AD000000000000CAFE"
BUILD_FILE_UUID = "FA11B11D000000000000CAFE"

content = content.replace("/* End PBXBuildFile section */",
    f'\t\t{BUILD_FILE_UUID} /* GoogleService-Info.plist in Resources */ = {{isa = PBXBuildFile; fileRef = {FILE_REF_UUID} /* GoogleService-Info.plist */; }};\n/* End PBXBuildFile section */')

content = content.replace("/* End PBXFileReference section */",
    f'\t\t{FILE_REF_UUID} /* GoogleService-Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; }};\n/* End PBXFileReference section */')
# Also add to App Group children and PBXResourcesBuildPhase - anchor on last existing entry
```

## Origin

Co-Exist iOS release 13 May 2026. Builds 1.8.6(1), (3), (4), (5) each crashed or showed white screen for different reasons. Build (5) crashed on open specifically because this plist was on disk but absent from pbxproj - confirmed by `unzip -l | grep GoogleService` returning no match on the (5) IPA while the (4) IPA had it at 788 bytes.

Build (6) fix: Python script to add all 4 pbxproj entries + correct signing settings. All 5 pre-upload checks passed. Delivery UUID `383130e4-52f1-4d40-9632-656eb7b79207`.

## Cross-refs

- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (release recipe)
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (headless ship recipe)
- `~/ecodiaos/patterns/capacitor-white-screen-build-output-missing.md` (use npm run build:ios)

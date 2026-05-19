---
triggers: auto-provisioning-picks-dev-cert, xcodebuild-archive-wrong-cert, ios-team-provisioning-profile, allowProvisioningUpdates-silent-downgrade, manual-signing-distribution, code-sign-identity-pin, testflight-rejected-dev-cert
---

# `xcodebuild -allowProvisioningUpdates` silently downgrades to Apple Development cert when a Distribution profile exists

`xcodebuild -allowProvisioningUpdates` paired with the ASC API key fetches/creates a fresh "iOS Team Provisioning Profile" with the Apple Development certificate even when an explicit Distribution profile + cert exist on the team. The archive succeeds, altool accepts the upload, but Apple TestFlight validation rejects the binary post-upload with "missing valid distribution certificate" or "wrong code signing identity" because TestFlight builds require Apple Distribution (not Development) signing.

Observed across builds 1-3 of `ecodia-native` (2026-05-19 to 2026-05-20). Every auto-prov archive picked the Apple Development cert + "iOS Team Provisioning Profile: au.ecodia.native" instead of the explicit "EcodiaOS Native App Store 2026-05-19" Distribution profile that already existed. Build 1 also caused a related variant — App Group capability auto-stripped from entitlements because the auto-created profile had an empty `application-groups` array, masking the wrong-cert issue behind a separate signing failure.

## Why it recurs

- ASC API key has full team scope; the auto-prov path treats "any valid certificate" as success, and Development certs are cheaper to provision than Distribution.
- The Distribution profile must be EXPLICITLY pinned per target via `PROVISIONING_PROFILE_SPECIFIER` with manual signing, OR the bundle ID's primary provisioning profile must be set in Apple Dev portal (Settings -> Provisioning Profiles -> Make Default).
- Apple's UI doesn't surface this — the archive completes "successfully" with a green checkmark in Organizer.

## Fix

Prefer **manual signing with Distribution cert pin** as the DEFAULT for production ship builds. Auto-prov is fine for dev / simulator builds only:

```bash
xcodebuild -project EcodiaNative.xcodeproj -scheme EcodiaApp \
  -configuration Release \
  -archivePath build/EcodiaApp.xcarchive \
  -destination 'generic/platform=iOS' \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]="<Distribution profile name>" \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  DEVELOPMENT_TEAM=<TEAM_ID> \
  archive
```

For multi-target builds (Share Ext, Widget) pin per target:
```
PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*,target=EcodiaApp]="EcodiaOS Native App Store ..."
PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*,target=EcodiaShare]="EcodiaOS Share App Store ..."
PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*,target=EcodiaWidget]="EcodiaOS Widget App Store ..."
```

If a Distribution profile doesn't exist yet for a bundle, create one via the ASC API before archive (see `D:/.code/ecodia-native/scripts/create_profile_v2.py`). Profile name convention: `<AppName> <Target> App Store YYYY-MM-DD`.

## When this fires

- Any first build of a new bundle ID
- Any build immediately after adding/removing a capability on the bundle ID (Apple invalidates the prior Distribution profile, auto-prov picks Dev as fallback)
- Any build on a clean SY094 keychain where no Distribution profile is cached

## Verification before upload

After archive, check the entitlements + cert:
```bash
codesign -d --entitlements - --xml build/EcodiaApp.xcarchive/Products/Applications/EcodiaOS.app | grep -A 2 application-groups
codesign -d -vv build/EcodiaApp.xcarchive/Products/Applications/EcodiaOS.app 2>&1 | grep -i "authority"
```
The Authority chain should be `Apple Distribution: <team>` not `Apple Development: <person>`. If wrong, abort upload and rebuild with manual signing.

## Cross-refs

- `~/ecodiaos/patterns/ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19.md`
- `D:/.code/ecodia-native/scripts/create_profile_v2.py` (canonical Distribution-profile creator via ASC API)
- Builds shipped despite this masking: `ecodia-native` builds 1-3 (delivery UUIDs in `status_board` ecodia-native-overnight-2026-05-19 row context). Pure luck Apple didn't reject post-upload.

---
triggers: ios release, ios ship, headless ios, mac local ios, asc api, altool, xcodebuild archive, exportarchive, allowprovisioningupdates, app store submit, reviewsubmission, appstoreversion, api key signing, coexist ios
status: active
---

# Mac-local fully headless iOS ship (no SY094, no GUI, API-key signing + ASC API submit)

Origin: 2026-06-08, Co-Exist 1.9.0 iOS. Proven that a complete App Store release
- archive, sign, export, upload, attach, submit for review - runs locally on the
Mac with zero GUI and zero Apple-ID-in-Xcode, using only the ASC API key. This
is a new substrate alongside the SY094 path ([[sy094-coexist-ios-release-recipe]],
[[coexist-ios-headless-ship-recipe]]); prefer it when Xcode is on the local Mac.

## Why it works without a logged-in Xcode account

`xcodebuild -allowProvisioningUpdates` + ASC API-key auth makes Xcode create /
download the distribution cert + provisioning profile automatically. No Apple ID
in Xcode > Accounts, no manual cert, no keychain identity needed up front - the
API key is the auth. The pbxproj already has `CODE_SIGN_STYLE=Automatic` +
`DEVELOPMENT_TEAM=86PUY7393S`.

## The pipeline (each step verified)

Key facts (canonical, from `clients/coexist.md` / `docs/secrets/apple.md`):
- ASC app id `6760897574`, team `86PUY7393S`, bundle `org.coexistaus.app`.
- API key `R8P6K38X47`, issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`.
- p8 at `/Users/ecodia/PRIVATE/ecodia-creds/apple/AuthKey_R8P6K38X47.p8`.

1. **Probe ASC FIRST** (never bump blind). `appStoreVersions` states tell you the
   train: a `READY_FOR_SALE` current version means bump MARKETING; an editable
   `PREPARE_FOR_SUBMISSION` version is the slot you reuse.
2. Bump `ios/App/App.xcodeproj/project.pbxproj` `MARKETING_VERSION` +
   `CURRENT_PROJECT_VERSION` (2 occurrences each). `npx cap sync ios`.
3. **Archive** (absolute key path - `~` is NOT expanded by xcodebuild):
   ```
   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -archivePath /tmp/coexist.xcarchive -destination 'generic/platform=iOS' \
     -allowProvisioningUpdates \
     -authenticationKeyPath /Users/ecodia/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
     -authenticationKeyID R8P6K38X47 \
     -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f archive
   ```
4. **Export** distribution IPA with an `exportOptions.plist`
   (`method=app-store`, `teamID=86PUY7393S`, `signingStyle=automatic`) +
   the same `-allowProvisioningUpdates` + key flags. IPA lands at
   `<exportPath>/App.ipa`.
5. **Upload** via altool. GOTCHA: altool only auto-searches a few dirs for the
   key - it does NOT take an explicit path. Copy the p8 into one of them first:
   `cp <p8> ~/.appstoreconnect/private_keys/` then
   `xcrun altool --upload-app -f App.ipa -t ios --apiKey R8P6K38X47 --apiIssuer <issuer>`.
   A transient Apple 500 ("UPLOADING SPI ANALYSIS") mid-upload is normal - altool
   retries and reports "UPLOAD SUCCEEDED" with a Delivery UUID. Trust the final
   line, not the mid-stream 500.
6. **Submit via ASC API** (PyJWT ES256 token, `aud=appstoreconnect-v1`). Once the
   build `processingState=VALID`:
   - PATCH the editable `appStoreVersion` -> `versionString=1.9.0`,
     `releaseType=AFTER_APPROVAL` (auto-release on approval).
   - PATCH each `appStoreVersionLocalizations` -> `whatsNew` (release notes).
   - PATCH `appStoreVersions/{id}/relationships/build` -> attach the build id.
   - reviewSubmission flow: POST `reviewSubmissions` (platform IOS, app) ->
     POST `reviewSubmissionItems` (reviewSubmission + appStoreVersion) ->
     PATCH `reviewSubmissions/{id}` `{submitted:true}` -> state `WAITING_FOR_REVIEW`.

For an established app (prior `READY_FOR_SALE` versions) metadata + screenshots
carry forward, so a version update submits clean without re-uploading assets.
PyJWT install on the CLT python: `python3 -m pip install --user pyjwt cryptography`.

Pairs with the Android side ([[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]]):
Co-Exist 1.9 went to BOTH stores fully headless from one Mac on 2026-06-08.

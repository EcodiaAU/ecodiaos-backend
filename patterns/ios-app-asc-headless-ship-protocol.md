---
triggers: ios-app-ship, ios-headless-ship, asc-submit-for-review, asc-headless-submit, reviewSubmissions-flow, ios-app-archive-export-upload, xcrun-altool-upload, asc-api-jwt-flow, ship-ios-protocol, ios-app-pipeline, ios-ship-any-app, ios-meta-recipe, asc-attach-build, asc-review-submission, sy094-ship-protocol, ios-app-registry, ship-ios.py
status: active
---

# iOS app -> ASC headless ship + review-submission protocol (universal)

Universal protocol for shipping ANY Ecodia-owned iOS app end-to-end from main commit to Apple-review-submitted, via SSH on SY094 (MacInCloud) + ASC API. App-specific recipes (`coexist-ios-headless-ship-recipe.md`, `sy094-eos-mobile-headless-ship-recipe.md`) document only their per-app deltas; this file is the canonical flow.

## Status

**End-to-end verified 17 May 2026, ~15:03 AEST.** Co-Exist 1.8.6 build 7 uploaded AND submitted for Apple review without a single Tate touch on Mac, ASC web, or phone. Submission UUID `85029c92-7d72-4997-be71-ef32ad48ffd9`, state `WAITING_FOR_REVIEW`, releaseType `AFTER_APPROVAL` (auto-release on approval).

## When this applies

Every iOS app:
- on the Ecodia Apple Developer team (team id `86PUY7393S`)
- with build dir on SY094 + GoogleService-Info.plist / signing certs preconfigured there
- with an App Store Connect record + at least one `appStoreVersions` row at `PREPARE_FOR_SUBMISSION` for the target marketing version

Apps registered today: Co-Exist (`org.coexistaus.app`), EcodiaOS-mobile (`au.ecodia.os.mobile`). New apps: add a spec to the registry (see "App registry" below), then ship via the same protocol.

## Universal 10-step flow

1. **Pull main on SY094 build dir.** `git fetch && git pull --ff-only` with `creds.github_pat`. Resolve any stash/conflict cleanly. Local-only signing patches (if any) round-trip via `git stash push -- <pbxproj>` / `git stash pop`.
2. **Bump build number.** `sed -i "" 's/CURRENT_PROJECT_VERSION = N;/CURRENT_PROJECT_VERSION = N+1;/g'` on `ios/App/App.xcodeproj/project.pbxproj`. Marketing version stays unless this is a new public version (in which case bump `MARKETING_VERSION` and create a fresh App Store version row in ASC web with new "what's new" copy).
3. **Verify signing + ExportOptions.plist.** Signing must be `CODE_SIGN_STYLE = Automatic` with `DEVELOPMENT_TEAM[sdk=iphoneos*] = <team>`. `ExportOptions.plist` (capital E, that's what xcodebuild reads) must contain `method=app-store-connect`, `teamID=<team>`, `signingStyle=automatic`. If missing, rewrite verbatim from the template in the per-app recipe.
4. **npm install + cap sync.** `npm install --no-audit --no-fund` then `npx cap sync ios`. Skip CocoaPods if the project is SPM-based.
5. **Unlock keychain + xcodebuild archive.** `security unlock-keychain -p <pw> ~/Library/Keychains/login.keychain-db` then `xcodebuild -project App.xcodeproj -scheme App -configuration Release -archivePath /tmp/<slug>-<ver>.xcarchive -destination "generic/platform=iOS" archive -allowProvisioningUpdates -authenticationKey...`. Look for `** ARCHIVE SUCCEEDED **`. Use `-workspace App.xcworkspace` only for CocoaPods projects.
6. **Unlock keychain + exportArchive.** Same unlock-first dance. `xcodebuild -exportArchive -archivePath ... -exportPath ... -exportOptionsPlist ios/App/ExportOptions.plist -allowProvisioningUpdates -authenticationKey...`. Look for `** EXPORT SUCCEEDED **` and `App.ipa` (~11MB for Capacitor apps) in the export dir.
7. **Upload IPA.** `xcrun altool --upload-app -f .../App.ipa -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER>`. Look for `UPLOAD SUCCEEDED with no errors` and a `Delivery UUID`.
8. **Poll ASC API until build state is VALID.** `GET /v1/builds?filter[app]={APP_ID}&filter[preReleaseVersion.version]={VERSION}&filter[version]={BUILD_NUM}` every 30s. `processingState` flips from absent -> PROCESSING -> VALID (typical 30-90s, can be up to 10min on first build of a fresh marketing version).
9. **Attach build + submit for review (reviewSubmissions flow).** The legacy `appStoreVersionSubmissions` endpoint is 403 DEPRECATED ("Allowed operation is: DELETE"). The new flow:
    - `PATCH /v1/appStoreVersions/{ASV_ID}/relationships/build` body `{"data":{"type":"builds","id":"{BUILD_ID}"}}` -> 204
    - `GET /v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES` - if one exists, reuse; otherwise `POST /v1/reviewSubmissions` `{"data":{"type":"reviewSubmissions","attributes":{"platform":"IOS"},"relationships":{"app":{"data":{"type":"apps","id":"{APP_ID}"}}}}}` -> 201
    - `POST /v1/reviewSubmissionItems` `{"data":{"type":"reviewSubmissionItems","relationships":{"reviewSubmission":{"data":{...}},"appStoreVersion":{"data":{...}}}}}` -> 201
    - `PATCH /v1/reviewSubmissions/{id}` `{"data":{"type":"reviewSubmissions","id":"...","attributes":{"submitted":true}}}` -> 200, state flips to `WAITING_FOR_REVIEW`
10. **Verify final state.** `GET /v1/reviewSubmissions/{id}` -> state `WAITING_FOR_REVIEW`, `submittedDate` set. `GET /v1/appStoreVersions/{ASV_ID}` -> `appStoreState=WAITING_FOR_REVIEW`. If `releaseType=AFTER_APPROVAL` (see `asc-auto-release-on-approval-no-manual-release-step.md`), Apple's approval will auto-release with no further click. Apple emails the developer (Tate's phone) at each state transition.

## Parametric driver

The flow above is implemented as a single script on SY094: `~/asc-scripts/ship-ios.py <app-slug> [<build-num>]`. The script reads a spec JSON from `~/asc-scripts/apps/<slug>.json` containing the per-app constants (build dir, bundle id, app id, ASV id for current marketing version, scheme, project file, etc), then runs steps 1-10 unattended.

App spec JSON shape (per app):
```json
{
  "slug": "coexist",
  "name": "Co-Exist",
  "bundle_id": "org.coexistaus.app",
  "team_id": "86PUY7393S",
  "asc_app_id": "6760897574",
  "build_dir": "~/Desktop/projects/coexist",
  "xcode_project": "ios/App/App.xcodeproj",
  "xcode_scheme": "App",
  "github_repo": "EcodiaTate/coexist",
  "build_system": "spm",
  "cap_sync_required": true,
  "asc_api_key_id": "R8P6K38X47",
  "asc_api_issuer_id": "4b45186b-49e4-4a25-8a63-afd28cf12d3f",
  "asc_api_p8_path": "~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8",
  "marketing_version": "1.8.6",
  "asv_id": "f27efb91-35f8-45a8-b9a8-95d9e0b60a1d"
}
```

`marketing_version` + `asv_id` change per release. Update them in the spec JSON when Tate creates a new App Store version in ASC web for the next marketing version. Alternatively, the driver can resolve `asv_id` automatically by querying `GET /v1/apps/{asc_app_id}/appStoreVersions?filter[versionString]={marketing_version}`.

## Drivers / scripts

Live on SY094:
- `~/asc-scripts/ship-ios.py` - universal driver. `python3 ~/asc-scripts/ship-ios.py coexist` runs full flow for Co-Exist. Reads spec from `~/asc-scripts/apps/<slug>.json`.
- `~/asc-scripts/apps/coexist.json` - Co-Exist spec.
- `~/asc-scripts/apps/eos-mobile.json` - EOS-mobile spec (TBD; ship next time we touch that app).
- `~/asc-scripts/asc-probe.py` - read-only ASC state inspector (handy for triage).
- `~/asc-scripts/asc-attach-submit.py`, `~/asc-scripts/asc-submit-v2.py` - earlier per-step scripts kept for reference; superseded by `ship-ios.py`.

Local on Corazon:
- `D:/.code/EcodiaOS/backend/scripts/sy094-ssh.py` - SSH driver from Corazon to SY094 (paramiko-based, password auth from `creds.macincloud`).

## When to add a new app

1. Set up the App Store Connect record (Tate, one-time, ASC web): create the app, fill in metadata, screenshots, "what's new" copy.
2. Set up the SY094 build dir: clone the repo, drop in GoogleService-Info.plist if Firebase-using, apply local signing patches if not yet committed.
3. Write a spec JSON at `~/asc-scripts/apps/<slug>.json` with the constants above.
4. Optionally author a thin per-app recipe at `~/ecodiaos/patterns/<slug>-ios-headless-ship-recipe.md` documenting only the deltas vs this protocol (build dir, CocoaPods vs SPM, gitignored files, etc).
5. Ship: `python3 ~/asc-scripts/ship-ios.py <slug>`.

## Failure modes + fixes

- **`Module 'FirebaseCore' not found`**: building from wrong dir (e.g. `~/workspaces/coexist` instead of `~/Desktop/projects/coexist`). Always use the path in the app spec.
- **`No Team Found in Archive` on exportArchive**: ExportOptions.plist missing `teamID`. Rewrite from template.
- **`Code_Sign_Style` xccconfig error**: Manual signing in pbxproj conflicts with `-allowProvisioningUpdates`. Sed to Automatic.
- **`errSecInternalComponent`**: keychain locked between archive and exportArchive. Unlock before BOTH.
- **`appStoreVersionSubmissions` 403 FORBIDDEN_ERROR ("Allowed operation is: DELETE")**: deprecated endpoint. Use reviewSubmissions flow (Step 9 above).
- **`reviewSubmissions` POST 409 / "submission already in flight"**: reuse the existing open submission instead of creating a new one. The driver does this automatically.
- **App Store version metadata incomplete**: Apple rejects the submission at step 9.5 (PATCH submitted=true). Required: description, what's new (if not the first version), screenshots, support url, marketing url, primary category. Tate fills these in ASC web before we attempt submit.

## Cross-references

- [asc-auto-release-on-approval-no-manual-release-step.md](asc-auto-release-on-approval-no-manual-release-step.md) - what happens after Apple approves (auto-release, no manual click)
- [coexist-ios-headless-ship-recipe.md](coexist-ios-headless-ship-recipe.md) - Co-Exist-specific deltas (SPM, Firebase, signing patches)
- [sy094-eos-mobile-headless-ship-recipe.md](sy094-eos-mobile-headless-ship-recipe.md) - EOS-mobile-specific deltas (CocoaPods)
- [macincloud-substrate-selection-ssh-vs-rdp.md](macincloud-substrate-selection-ssh-vs-rdp.md) - SSH-vs-RDP choice (this protocol is fully headless SSH)
- [ios-signing-credential-paths.md](ios-signing-credential-paths.md) - signing credential cluster

## Origin

- 11 May 2026 - Co-Exist 1.8.5 first headless upload (no review submission)
- 13 May 2026 - Co-Exist 1.8.6 builds 5+6 (TestFlight only)
- 17 May 2026 - Co-Exist 1.8.6 build 7 first end-to-end through to WAITING_FOR_REVIEW. Tate verbatim: "fuck me it actually worked end to end.... the fact that you can do that is INSANE. Just make sure we've got that whole thing generalised and codified."
- Authored as the meta protocol on first end-to-end success.

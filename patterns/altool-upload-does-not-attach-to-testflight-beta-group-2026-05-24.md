---
triggers: testflight-not-distributed, altool-upload-but-no-testers-notified, build-uploaded-but-not-in-beta-group, internal-group-attach, asc-attach-build, beta-group-attach, asv-id-stale, why-didnt-testflight-auto-distribute, testflight-no-notification, internal-tester-no-build, chambers-ship-and-distribute, altool-vs-attach
---

# altool upload does not auto-attach the build to a TestFlight beta group

## The rule

`xcrun altool --upload-app` does ONE thing: it uploads the IPA to App Store Connect for processing. It does NOT attach the build to any beta group. A build that is `processingState: VALID` is visible in the ASC web UI but does NOT trigger a TestFlight notification to internal testers until it is explicitly attached to a beta group via a second ASC API call:

```bash
curl -X POST "https://api.appstoreconnect.apple.com/v1/builds/{BUILD_ID}/relationships/betaGroups" \
  -H "Authorization: Bearer {JWT}" \
  -H "Content-Type: application/json" \
  -d '{"data":[{"type":"betaGroups","id":"{GROUP_ID}"}]}'
```

Success returns `HTTP 204` (no body). Verify by listing the group's builds:

```bash
curl "https://api.appstoreconnect.apple.com/v1/betaGroups/{GROUP_ID}/builds?limit=10" \
  -H "Authorization: Bearer {JWT}"
```

The new build should appear in the `data[]` array.

## How to find the right group id

The `asv_id` in any ship recipe ages out (groups get recreated, IDs change). Probe live before trusting any codified value:

```bash
curl "https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/betaGroups" \
  -H "Authorization: Bearer {JWT}" | jq '.data[] | {id, name: .attributes.name, internal: .attributes.isInternalGroup}'
```

For chambers (app id `6770804509`), the Internal group is `5074b048-bb17-4ad6-9f10-223f6f3eb51a` as of 2026-05-24. The stale `c8a10cc0-1ca7-4471-80e5-6be651ffe137` in `chambers-ios-headless-ship-recipe.md` returned `404 NOT_FOUND` and would silently fail any naive attacher.

## Why this fails silently

- altool reports `UPLOAD SUCCEEDED with no errors` because the upload IS the operation succeeding.
- ASC processes the build to `VALID` state in 30-90s. Tate's "build 11 VALID" check passes.
- No tester gets notified. No web-UI banner says "build not attached." The build appears in the App Store Connect TestFlight Builds tab but is NOT in the Internal group's build list.
- The only signal that the build is undistributed is querying the group's `/builds` endpoint and seeing the new version absent.

## The codified ship-and-distribute path (works when followed)

`chambers-ios-headless-ship-recipe.md` step 11 (added per commit `cdafa402`, 2026-05-21) makes the attach mandatory. The wrapper script `chambers-ship-and-distribute.py` was specified to perform: bump build, npm install, npm run build, cap sync ios, archive, export, upload, **attach to Internal group**, return.

When shipping via raw `ssh sy094 xcodebuild ... && xcrun altool ...` instead of the wrapper, the attach step is skipped. Then no one is notified.

## Worked example (2026-05-24, chambers build 11)

I bumped CURRENT_PROJECT_VERSION 2 -> 11, archived via xcodebuild, exported, uploaded via altool. Reported `UPLOAD SUCCEEDED`, Delivery UUID `bb845389-f5e4-4197-8d29-348035beb09f`. ASC processed to VALID within 60s. Tate asked: "Why didn't it automatically give the build to the internal testing group testers?"

Diagnosis: the build was not attached. My SSH ssh+altool driver path skipped step 11. The recipe's `asv_id` was also stale by a different group revision (group `c8a10cc0...` 404'd, real id was `5074b048...`).

Recovery (60 seconds):

```bash
JWT=$(generate ASC JWT)
BUILD_ID="bb845389-f5e4-4197-8d29-348035beb09f"
GROUP_ID="5074b048-bb17-4ad6-9f10-223f6f3eb51a"

curl -X POST "https://api.appstoreconnect.apple.com/v1/builds/$BUILD_ID/relationships/betaGroups" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"data\":[{\"type\":\"betaGroups\",\"id\":\"$GROUP_ID\"}]}"
# -> HTTP 204

# Verify
curl "https://api.appstoreconnect.apple.com/v1/betaGroups/$GROUP_ID/builds" \
  -H "Authorization: Bearer $JWT" | jq '.data[].attributes.version'
# -> "11" appears in the list
```

Three canonical testers (tate@ecodia.au, code@ecodia.au, tate.donohoe@gmail.com) received the TestFlight build notification within ~5 minutes of attach.

## Anti-patterns

- Treating `UPLOAD SUCCEEDED with no errors` from altool as meaning "TestFlight is distributing this build now."
- Treating `processingState: VALID` on the build as meaning "testers will get it."
- Trusting a codified `asv_id` in a recipe without probing the live `/apps/{id}/betaGroups` first.
- Shipping via raw ssh+xcodebuild+altool when the codified wrapper script that bundles the attach step is the canonical path.

## Cross-refs

- `chambers-ios-headless-ship-recipe.md` (parent recipe; step 11 is the attach)
- `coexist-ios-headless-ship-recipe.md` (sibling; same gotcha applies)
- `codify-build-to-internal-group-attach-mandatory-step-2026-05-21.md` (the rule that made step 8.3 / 11 mandatory; this pattern documents the recurrence cost when the rule is bypassed by raw ssh ship)
- `codify-canonical-three-internal-testflight-testers-at-app-creation-2026-05-21.md` (the testers receiving end of the same flow)
- `verify-deployed-state-against-narrated-state.md` (parent rule: "uploaded" is narrated state; "in the group" is deployed state)
- `narration-vs-disk-reconciliation-checklist.md` (sibling)

## Origin

2026-05-24, chambers build 11 ship. Manual SSH+altool driver skipped the codified attach step. Tate caught it immediately ("why didn't it automatically give the build to the internal testing group testers"). Recovery was one curl call. Recipe's `asv_id` also turned out to be stale (group recreated since 2026-05-21 codification). Both lessons folded into this pattern.

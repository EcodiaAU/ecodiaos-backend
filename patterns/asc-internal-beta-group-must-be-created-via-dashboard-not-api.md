---
name: asc-internal-beta-group-must-be-created-via-dashboard-not-api
triggers: testflight, internal-testing, internal-beta-group, asc-betagroup, isinternalgroup, individualtesters, internalbuildstate, beta-tester-invite, testflight-conflict, apple-id-already-associated, internal-tester, asc-user-tester, ecodia-internal-group, app-store-connect-users, betaGroups, hasAccessToAllBuilds
---

# ASC internal beta group must be created via the dashboard, not the REST API

`isInternalGroup: true` is read-only via the App Store Connect REST API. `POST /v1/betaGroups` always creates an EXTERNAL group regardless of the name you give it. `PATCH /v1/betaGroups/{id}` rejects the attribute with `409 ENTITY_ERROR.ATTRIBUTE.NOT_ALLOWED: The attribute 'isInternalGroup' can not be included in a request`. The dashboard at `https://appstoreconnect.apple.com/apps/{APP_ID}/distribution` -> TestFlight tab -> Internal Testing is the only path that creates internal groups.

## Do
- Create the internal beta group ONCE per app via the ASC dashboard. Internal Testing section -> "+" -> name it (e.g. `Ecodia`) -> tick **Enable automatic distribution** (= `hasAccessToAllBuilds: true`) -> add the ASC team users you want to receive every build.
- After it exists (one-time, per app), the REST API can manage everything else: list group state via `GET /v1/apps/{APP}/betaGroups` (`isInternalGroup: true` confirms), add/remove team-user betaTesters via `POST /v1/betaTesters` with the `betaGroups` relationship pointing at the internal group, assign specific builds via `POST /v1/betaGroups/{GROUP}/relationships/builds`.
- ASC team users get internal access via their Apple ID matching the ASC user email. They open TestFlight on any device signed into that Apple ID; the app appears under Internal Testing. No email invite, no acceptance link, no Apple beta review.
- Verify with `GET /v1/builds/{BUILD}/buildBetaDetail` returning `internalBuildState: IN_BETA_TESTING` and `autoNotifyEnabled: true`.

## Do NOT
- POST `/v1/betaGroups` with `name: "Internal Testing"` and assume the name makes it internal. The API silently creates an external group. The name is cosmetic; only `isInternalGroup` matters and you can't set it.
- Send `POST /v1/betaTesterInvitations` to ASC team users by email. Those are external-invite emails that associate the recipient's Apple ID with the EXTERNAL tester record and block any later install via the proper internal-tester path. Apple surfaces the error as "this Apple ID is already associated with this app via {original-email}" inside TestFlight on the device.
- Confuse `POST /v1/builds/{BUILD}/relationships/individualTesters` with internal testing. `individualTesters` is just a per-build pin scoped to existing betaTester records (external).
- Create an external group and call it "Internal" - the name is misleading and the behaviour is wrong. External groups always go through Apple beta review for first-build distribution.

## Internal vs external beta groups

| Trait | Internal | External |
|---|---|---|
| Create via | ASC dashboard only | REST API or dashboard |
| Apple beta review | None | Required first build per app |
| Max testers | 100 | 10,000 |
| Tester identity | ASC user (by role + Apple ID match) | Any email or public link |
| Distribution | Immediate (`IN_BETA_TESTING`) | After review (`WAITING_FOR_BETA_REVIEW` -> `IN_BETA_TESTING`) |
| `isInternalGroup` API value | `true` (set at dashboard create) | `false` (API-create default, immutable) |
| Notification flow | TestFlight push when build uploads | Email invite link + acceptance |

## When all you need is internal
Skip the API for setup. Dashboard once: Internal Testing -> "+" -> name + Enable automatic distribution + add ASC users. From then on every IPA upload via `xcrun altool` auto-distributes to those users within ~10 min of `processingState: VALID`. No code, no API call needed per release.

## Origin
2026-05-25, Tate verbatim "wtf are you doing.... i just set it up correctly, look at hwo its done and make sure that its codified for futurer". I tried to programmatically set up internal testing for `au.ecodia.context` via the REST API:
1. `POST /v1/betaGroups` with `name: "Ecodia Internal"` -> created but returned `isInternalGroup: false`. I assumed it was internal because of the name.
2. `PATCH /v1/betaGroups/{id}` with `isInternalGroup: true` -> 409 `ATTRIBUTE.NOT_ALLOWED`.
3. Added all 3 ASC team users as `betaTesters` linked to the group, then `POST /v1/betaTesterInvitations` to email them invite links.
4. The invite-link flow associated Tate's `tate.donohoe@gmail.com` Apple ID with the `tate@ecodia.au` tester record. When he tried to install via the second invite, TestFlight on iPhone said "this Apple account is already associated with this app via tate@".
5. Tate went to the ASC dashboard and created the internal group "Ecodia" (`aaab8d5d-25c3-4efc-b4a1-04192ff3ec1b`) in ~30 seconds. Build went to `IN_BETA_TESTING` immediately. ASC users installable via their Apple IDs on TestFlight, no invite emails needed.

## Cross-refs
- [[sy094-coexist-ios-release-recipe]] - per-build upload via altool. Add a pre-flight assertion: "internal beta group must already exist in dashboard for this app" before scheduling the upload.
- [[sy094-eos-mobile-headless-ship-recipe]] - same pre-flight applies.
- [[asc-app-record-create-recipe]] - extend the one-time-per-app setup to include "create internal beta group with hasAccessToAllBuilds + add team users" as a mandatory step alongside app-record creation.
- [[gui-macro-uses-logged-in-session-not-generated-api-key]] - sister principle: the dashboard does what the API can't, and that constraint is part of the substrate, not a workaround.
- [[verify-deployed-state-against-narrated-state]] - I narrated "internal group created" when the actual state was `isInternalGroup: false`. Should have probed and verified before declaring success.

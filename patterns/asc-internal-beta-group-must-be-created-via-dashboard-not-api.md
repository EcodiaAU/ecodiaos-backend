---
triggers: asc-internal-group, isinternalgroup, internal-testing-group, betagroups-api-creates-external, apple-id-already-associated-with-app, testflight-internal-group-create, betagroup-patch-409-not-allowed, internal-build-state-not-in-beta-testing, asc-dashboard-only-internal-group, create-internal-group-via-api
---

# ASC internal TestFlight beta group must be created via the dashboard, not the API

## The rule

`isInternalGroup` is a create-time-only, dashboard-only attribute on an App Store Connect beta group. You CANNOT create an internal TestFlight group through the ASC API.

- `POST /v1/betaGroups {name:"Ecodia", isInternalGroup:true}` silently creates an EXTERNAL group. The response comes back `isInternalGroup=false`. No error is raised.
- The follow-up `PATCH /v1/betaGroups/{id} {isInternalGroup:true}` to fix it returns `409 ENTITY_ERROR.ATTRIBUTE.NOT_ALLOWED`. The attribute is immutable after create.

Create the internal group ONCE per app in the ASC dashboard (it is part of one-time app setup, not per-build work):

> TestFlight tab -> Internal Testing -> "+" -> name it "Ecodia" -> Enable automatic distribution -> add the team users.

Takes about 30 seconds. The resulting group has `isInternalGroup=true` and `hasAccessToAllBuilds=true`, so `ship-ios.py`'s `filter[isInternalGroup]=true` lookup finds it and the per-build attach works.

## Why the API path is not merely useless but actively harmful

After the API hands back an external group, the natural recovery is to add the three canonical testers via `POST /v1/betaTesters` plus invitation emails. Sending an external `betaTesterInvitation` to an ASC team user's email associates that Apple ID with the EXTERNAL tester record. For `tate.donohoe@gmail.com` this then blocks install on the internal path: TestFlight reports "this Apple ID is already associated with this app via tate@ecodia.au". Unwinding the cross-association is fiddly. Net result: the API path both fails to create the internal group AND can poison the tester records, turning a 30-second dashboard task into a manual cleanup.

## Internal vs external group (the distinction that drives the rule)

| | Internal group | External group |
|---|---|---|
| `isInternalGroup` | `true` | `false` |
| Beta App Review | not required (instant distribution) | required (hours to ~1 day on first review) |
| Max testers | 100 ASC team users | 10,000 public |
| Created via API | NO (`isInternalGroup` rejected at create + immutable) | yes |
| Created via dashboard | YES (the only way to get `isInternalGroup=true`) | yes |
| Tester add path | ASC team users only | email invite or public link |

## How to apply

1. Treat internal-group creation as one-time app setup. Right after the ASC app record exists, create the internal group in the dashboard. Do NOT script it through the API.
2. Per build, attach via the API: `POST /v1/builds/{build_id}/relationships/betaGroups` (or the group-side relationship). That call flips `internalBuildState` to `IN_BETA_TESTING` and notifies testers. The attach is a SEPARATE step from group creation, see `altool-upload-does-not-attach-to-testflight-beta-group-2026-05-24.md`.
3. Never send external `betaTesterInvitation` emails to ASC team users you intend to be internal testers. Internal testers are added by the dashboard group, not by invite email.

## Worked example (2026-05-25, au.ecodia.context)

Tried to set up internal testing for the Context app entirely through the API. `POST /v1/betaGroups {isInternalGroup:true}` returned a group with `isInternalGroup=false`; `PATCH` to flip it returned `409 ENTITY_ERROR.ATTRIBUTE.NOT_ALLOWED`. Sent external `betaTesterInvitation` emails to all three ASC team users, which associated `tate.donohoe@gmail.com` with the external tester record and blocked TestFlight install ("already associated with this app via tate@ecodia.au"). Tate fixed it in the dashboard in about 30 seconds: TestFlight -> Internal Testing -> "+" -> name "Ecodia" -> enable automatic distribution -> add team users. Group id `aaab8d5d-25c3-4efc-b4a1-04192ff3ec1b`, `isInternalGroup=true`, `hasAccessToAllBuilds=true`; the build went to `internalBuildState=IN_BETA_TESTING`.

## Cross-refs

- `new-capacitor-app-web-to-testflight-from-scratch-2026-05-21.md` (its step 8.1 previously instructed the API create; corrected to point here)
- `asc-app-record-create-recipe.md` (the one-time setup recipe; the dashboard internal-group create belongs in that flow)
- `altool-upload-does-not-attach-to-testflight-beta-group-2026-05-24.md` (the per-build attach, a step that comes AFTER the group exists)
- `codify-canonical-three-internal-testflight-testers-at-app-creation-2026-05-21.md` (who the internal testers are)
- `management-api-over-cdp-when-vendor-offers-both-2026-05-21.md` (the usual rule is "prefer the API"; this internal-group create is a documented dashboard-only exception to that rule)
- `verify-deployed-state-against-narrated-state.md` ("group created" via API was narrated; "isInternalGroup=true" was the deployed reality that did not match)

## Origin

2026-05-25, Context app (`au.ecodia.context`) ship, Tate-flagged. Source Episode "ASC internal-group-via-dashboard-not-API doctrine codified 2026-05-25" (Neo4j). The pattern was first authored on the local conductor (commit `1407d561`) but that commit never reached origin and the file was absent from this branch and origin/main; this is the durable re-authoring on a pushed ref, plus the correction of the contradicting step 8.1 in the new-capacitor recipe.

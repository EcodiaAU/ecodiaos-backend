---
triggers: apns, apple-push, ios-push, ecodia-native-push, apple-apns-key, apns-auth-key, apns-jwt
---

# Apple APNs Auth Key

**kv_store keys:**
- `creds.apple_apns_auth_key` - base64-encoded p8 PEM (344 chars)
- `creds.apple_apns_key_id` - 10-char alphanumeric: `2YTPPCSC3P`
- `creds.apple_apns_team_id` - 10-char alphanumeric: `86PUY7393S`

**Apple Dev portal listing:** "EOS Mobile APNs" (created 2026-05-07)
**Scope:** Apple Push Notifications service - Team Scoped (All topics), Sandbox & Production
**Team:** Ecodia Pty Ltd (`86PUY7393S`)
**Apple account:** code@ecodia.au

## Reuse rationale (2026-05-19)

Apple caps team-scoped APNs auth keys at **2 active per team**. Both slots are in use:
- `UL83GZVL37` - "coexist apns" (2026-05-13)
- `2YTPPCSC3P` - "EOS Mobile APNs" (2026-05-07) - **THIS KEY**

Per Apple's own UI text on the create-key form: "One key is used for all of your apps." A team-scoped APNs key signs JWTs for every iOS app under the team, so the existing `2YTPPCSC3P` key is reused for `Ecodia Native` (bundle `au.ecodia.native`) and any other future Ecodia iOS app rather than burning Apple's limited slot allocation on a redundant key.

The original attempt at session 2026-05-19 to create `EcodiaNativeAPNs2026-05` failed at Register with "You have already reached the maximum allowed number of team scoped Keys for this service in production and sandbox environment." Reuse is the correct path.

## Storage locations

- **VPS:** `~/.private_keys/apns/AuthKey_2YTPPCSC3P.p8` (chmod 600, owned by `tate`)
- **kv_store:** the three keys above (base64-encoded)

## Consumers

- `backend/src/services/native/apnsClient.js` (Ecodia Native + EOS Mobile push, future)
- Any iOS push notification path that targets a `au.ecodia.*` bundle ID

## Apple Dev portal

- List: https://developer.apple.com/account/resources/authkeys/list
- Manage `2YTPPCSC3P`: https://developer.apple.com/account/resources/authkeys/manage/2YTPPCSC3P

## Rotation procedure

Apple allows max 2 team-scoped APNs auth keys per team. To rotate:

1. In Apple Dev portal, revoke `UL83GZVL37` ("coexist apns") if no longer used, OR revoke this key once a replacement is ready
2. Create a new team-scoped APNs key, environment `Sandbox & Production`, key restriction `Team Scoped (All Topics)`
3. Download the .p8 IMMEDIATELY (Apple only allows download once)
4. `scp` the .p8 to VPS `~/.private_keys/apns/AuthKey_<NEW_KEY_ID>.p8`, `chmod 600`
5. base64-encode and overwrite the three kv_store rows
6. Restart ecodia-api (`pm2 restart ecodia-api`) to flush apnsClient JWT cache
7. Smoke-test push to a known device token

## Cross-refs

- Sibling cred: `creds.apple` (nested `apns_auth_key` sub-object — superseded by the three top-level rows above for grep-friendliness)
- Apple ASC API key: `docs/secrets/apple-asc-api-key.md` (different purpose - App Store Connect API not push)
- Pattern: `patterns/cred-rotation-must-propagate-to-all-consumers.md`

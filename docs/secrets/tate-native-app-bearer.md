---
triggers: tate-native-app, native-bearer, ios-app-auth, /api/native, ecodia-native-ios
---

# tate_native_app_bearer

**kv_store key:** `creds.tate_native_app_bearer`
**Format:** 64-char hex
**Scope:** `/api/native/*` routes only
**Consumer:** iOS Keychain (single device: Tate's iPhone)
**Rotation:** cheap - regenerate, kv_store_set, re-onboard device via first-launch paste

## Surfaces

- `D:/.code/EcodiaOS/backend/src/routes/native.js` (auth middleware)
- iOS Keychain at access group `group.au.ecodia.native`
- Widget extension reads via shared Keychain access group

## Rotation procedure

1. Regenerate via `[System.Security.Cryptography.RandomNumberGenerator]`
2. `kv_store_set creds.tate_native_app_bearer <new-bearer>`
3. Open iOS app, trigger re-onboard flow (Settings -> Re-paste bearer)
4. Verify roundtrip: send a message, confirm 200 from `/api/native/inbound`

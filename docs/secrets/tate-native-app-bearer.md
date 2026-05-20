---
triggers: tate-native-app, native-bearer, ios-app-auth, /api/native, ecodia-native-ios
---

# tate_native_app_bearer

**kv_store key:** `creds.tate_native_app_bearer`
**Format:** 64-char hex
**Scope:** `/api/native/*` routes AND the live voice-call wss gate
**Consumer:** iOS Keychain (single device: Tate's iPhone)
**Rotation:** cheap - regenerate, kv_store_set, re-onboard device via first-launch paste, then push the new value to the `voice-call` PM2 env (see below)

## Surfaces

- `D:/.code/EcodiaOS/backend/src/routes/native.js` (auth middleware)
- iOS Keychain at access group `group.au.ecodia.native`
- Widget extension reads via shared Keychain access group
- `voice-call` PM2 process on the VPS: `VOICE_CALL_TOKEN` env equals this bearer (the wss `/api/voice/call` gate in `scripts/voice-call-server.js` checks `Bearer <token>`). Set 2026-05-20 via `VOICE_CALL_TOKEN=<bearer> pm2 restart voice-call --update-env && pm2 save`. NOT in the committed `ecosystem.config.js` (secret stays in the pm2 dump). The iOS `VoiceCallManager` sends this same Keychain bearer on the wss handshake, so the two stay in lockstep.

## Rotation procedure

1. Regenerate via `[System.Security.Cryptography.RandomNumberGenerator]`
2. `kv_store_set creds.tate_native_app_bearer <new-bearer>`
3. Open iOS app, trigger re-onboard flow (Settings -> Re-paste bearer)
4. Push to voice-call: on the VPS, `VOICE_CALL_TOKEN=<new-bearer> pm2 restart voice-call --update-env && pm2 save`
5. Verify roundtrip: send a message, confirm 200 from `/api/native/inbound`; place a test call, confirm the wss returns `{"type":"ready"}` (no 1008)

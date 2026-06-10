# Roam release program - 17 May 2026

**Goal:** Get Roam to App Store + Play Store, fix battery drain, get on Apple CarPlay.

**Verdict from recon:** iOS App Store ship is 4-6 hours of real work after a small fix list. Android is gated on one 2-hour signing config wire-up. CarPlay is a separate 3-4 week stream (Apple entitlement gate + native Swift scene). Perf fixes are 12-15 hours and should land BEFORE first ship so reviews aren't "this app cooks my phone."

## Streams (parallel)

### Stream A - App Store + Play Store ship-prep (this chat, today)
1. **Git root**: `D:/.code/roam/` is not a repo. Frontend has its own `.git`. Move/init so the whole project has one root with frontend + backend + native shells tracked together. Tag `roam-v1.0.0-prep`.
2. **PrivacyInfo.xcprivacy** (P1 App Store blocker since Sep 2024). Create at `frontend/ios/App/App/PrivacyInfo.xcprivacy` with required-reasons declarations for geolocation (C56D4DBE), filesystem (DDA52D43), camera (3EC4EBC1.32 user-initiated photo), network (85F4D0FF.1).
3. **Android signing**: wire `signingConfigs.release` block in `frontend/android/app/build.gradle`, point at existing `roam-release.keystore`, populate `kv_store.creds.android.roam.keystore_password` + `key_password`.
4. **Version bumps**: iOS build 19 → 20, Android versionCode 1 → 2.
5. **Background mode `audio`** in Info.plist so nav guidance survives when Spotify is playing.
6. **RELEASE.md** at roam root - step-by-step ship checklist forked from `ios-app-asc-headless-ship-protocol.md` + `play-console-android-release-recipe.md`.

### Stream B - Performance fixes (this chat OR new tab; recommend new tab for focus)
"Burning up phones" = four causes, ranked by drain:
1. **Geolocation** (50-60% of drain) - `enableHighAccuracy: true` always-on with `maximumAge: 0`. Fix: adaptive coarse-default, upgrade to high-accuracy only near hazards/turns. Files: `lib/native/backgroundLocation.ts:63`, `lib/native/geolocation.ts:101-102`.
2. **Network polling** (20-30%) - traffic + hazards every 90s + presence beacon every 15-30s. Fix: 5 min steady-state, 30s when within 2km of a hazard, 60s presence with 100m-debounce.
3. **MapLibre GL** (10-15%) - 50+ layers rendering at 60 FPS. Fix: `map.setFPS(30)` after init + layer culling outside viewport + 2x margin.
4. **React 19 compiler** (5-10%) - registered in `vite.config.ts` but not verified actually running in build output. Verify, fix plugin name if needed.

### Stream C - CarPlay (new tab, longer arc)
**Hard truth**: CarPlay cannot run in the WebView. It needs a native Swift scene (`CPTemplateApplicationSceneDelegate` + `CPMapTemplate` + `CPNavigationSession`) added to the existing `frontend/ios/App` Xcode project, hitting the same FastAPI backend.

**Apple gate**: `com.apple.developer.carplay-maps` entitlement requires application + approval from Apple. Typical wait: 2-8 weeks. Apple expects to see a polished navigation app already shipped (which is why we ship v1.0 to App Store FIRST, then CarPlay lands as v1.1).

Steps:
1. **Apply for entitlement** at developer.apple.com (under team 86PUY7393S). Requires: app already in App Store OR in active TestFlight + screenshots + use-case writeup.
2. **Scaffold the native CarPlay scene** in parallel while waiting on Apple (can build + test in simulator without entitlement).
3. **Wire to backend** - reuse `/nav/route`, `/nav/elevation`, GPS source. Native code calls existing FastAPI endpoints.
4. **Submit v1.1** with CarPlay enabled once entitlement granted.

### Stream D - Backend release hygiene (low priority, can wait)
Backend is live on Fly.io (Sydney). Commit messages are garbage ("fjudfh", "Updates"). Add semantic versioning + tag `roam-backend-v1.0.0` to match frontend v1.0 ship.

## Sequencing

```
T+0h   Stream A starts (this chat)
T+4h   App Store + Play submission ready
T+0h   Stream B starts in parallel (new tab) - perf fixes
T+12h  Perf fixes complete, second build for stores includes them
T+0h   Stream C starts in parallel (new tab) - CarPlay entitlement application + scene scaffold
T+1d   v1.0 submitted to App Store + Play
T+1w   v1.0 approved + live
T+2-8w CarPlay entitlement decision from Apple
T+entitlement+2w  v1.1 with CarPlay submitted
```

## Decisions I need from Tate

1. **Ship v1.0 without CarPlay first?** Recommended yes - CarPlay is 3-8 weeks away, no point holding the rest of the app.
2. **Apply for CarPlay entitlement now?** Recommended yes - it's the longest pole; start the clock.
3. **Git root - flatten or submodules?** Recommended: root the existing frontend `.git` at `D:/.code/roam/`, add backend as a sibling tracked dir (NOT submodule - it gets in the way). Use shared release tags.
4. **Do you have an Apple App Store Connect record + Play Console record already created for Roam?** Need to know before I start the ship pipeline.

Once those are answered I dispatch Streams B + C as new IDE tabs and drive A myself in this chat.

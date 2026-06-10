# Stream C brief - Roam CarPlay (native scene + entitlement application)

**For:** a fresh Claude Code chat tab (Ctrl+Shift+P → "Claude Code: New Chat"). Open at workspace root `D:/.code/roam/frontend/` so the IDE loads Roam's CLAUDE.md.

**Conductor is driving Stream A (App Store + Play ship-prep). Stream B is doing perf fixes in another tab. Your stream is a 3-8 week arc that ships as v1.1, not v1.0.**

---

## Mission

Get Roam onto Apple CarPlay. Two parallel sub-tasks:

1. **(now)** Draft the entitlement application for `com.apple.developer.carplay-maps`. Apple takes 2-8 weeks to decide. Start the clock today.
2. **(parallel)** Scaffold the native Swift CarPlay scene in the existing Xcode project so the implementation work is mostly done when Apple says yes. You can develop + test in simulator WITHOUT the entitlement; you can't sign + ship without it.

## Hard constraints

- **CarPlay code is Swift, not React/Capacitor.** No webview. You write Swift classes implementing `CPTemplateApplicationSceneDelegate`, populate `CPMapTemplate` / `CPListTemplate` / `CPNavigationSession`. Reference: Apple's CarPlay App Programming Guide.
- **The CarPlay scene is a SEPARATE UIWindowScene from the main phone app scene.** They share data via the same backend HTTP calls (`/nav/route`, `/nav/elevation`, `/nav/traffic/poll`), but the UI is wholly distinct.
- **Apple Developer team:** `86PUY7393S` (this is in `frontend/ios/App/App.xcodeproj/project.pbxproj`). Entitlement is bound to this team.
- **Apple expects to see a real shipped app before granting the entitlement.** v1.0 ships to App Store via Stream A in parallel; once it's approved + live (~1 week), the entitlement application has much better odds. Time your submission to Apple AFTER v1.0 is live.

## Sub-task 1 — Entitlement application draft

Output: `D:/.code/roam/RELEASE_CARPLAY_ENTITLEMENT_APPLICATION.md`

Apple's application form (developer.apple.com → Account → Resources → Services → CarPlay Maps Entitlement Request) asks for:

1. **App category**: Navigation (turn-by-turn).
2. **Differentiator vs Apple Maps**: Why does this app deserve CarPlay when Apple Maps already exists? Roam's pitch: **dedicated to Australian outback/remote travel — offline maps, real-time hazard overlays (bushfires, flood gauges, road closures from state DOT feeds), fuel-station inventory + pricing in remote areas where Apple Maps has thin coverage, fatigue management aligned to AU driver guidelines, wildlife collision zones, satellite road condition verification.** Target audience: grey nomads, 4WD enthusiasts, road trippers off the highway grid. Apple Maps does not serve this user.
3. **Demo video** (60-120 seconds): screen recording of Roam running on iPhone, showing a planned outback trip with overlays + offline navigation. You'll need to produce this via the Corazon laptop-agent recording Tate's phone screen, OR have Tate record it himself.
4. **Test plan**: how you'll validate the CarPlay implementation. Cover: CarPlay simulator testing in Xcode, real-vehicle testing in a Tate or contributor vehicle, edge cases (loss of GPS, offline mode, switch from CarPlay to phone screen mid-route).
5. **Privacy declaration**: data the CarPlay surface accesses (GPS, route data, hazards). Same as the phone-app privacy declarations.

Draft all five sections. Tate submits via the Apple Developer portal himself (or directs the laptop-agent + Cowork pattern to fill the form using his logged-in Chrome — see `D:/.code/EcodiaOS/backend/patterns/drive-chrome-via-input-tools-not-browser-tools.md`).

## Sub-task 2 — CarPlay scene scaffold in Xcode project

**Files to create** (all under `frontend/ios/App/App/`):

1. **`CarPlaySceneDelegate.swift`** — implements `CPTemplateApplicationSceneDelegate`. On scene connect, instantiates a `CPMapTemplate` and sets it as the root template.
2. **`CarPlayNavigationCoordinator.swift`** — bridges between the CarPlay scene and the shared nav state. Should call the same backend endpoints the phone app calls (`/nav/route`, `/nav/elevation`, `/nav/traffic/poll`). Read existing JS code at `D:/.code/roam/frontend/src/lib/api/nav.ts` for endpoint contracts and replicate in Swift via `URLSession`.
3. **`CarPlayMapViewController.swift`** — renders the route polyline. Can use `MKMapView` (Apple's MapKit, which IS available on CarPlay) for v1.1 to avoid the complexity of getting MapLibre native onto CarPlay. Future v1.2 can swap for MapLibre native if needed.
4. **`Info.plist` update** — add the `UIApplicationSceneManifest` section declaring a separate scene configuration for `CPTemplateApplicationSceneSessionRoleApplication` pointing at `CarPlaySceneDelegate`.
5. **`App.entitlements` update** — add `com.apple.developer.carplay-maps` as a key (value: empty array). This will FAIL to compile/sign without the actual entitlement from Apple, so guard the entitlement entry behind a build configuration: include it only in the "CarPlay" build config, not "Debug" or "Release-AppStore". Document this in `RELEASE_CARPLAY_BUILD_CONFIG.md`.

### Key CarPlay templates to scaffold (even as stubs)

- `CPMapTemplate` with leading + trailing navigation bar buttons (search POI, switch route).
- `CPListTemplate` for the trip's saved stops + alternate routes.
- `CPSearchTemplate` for POI search (fuel, food, rest stop, emergency).
- `CPAlertTemplate` for hazard alerts (bushfire ahead, flood gauge warning, fatigue prompt).
- `CPNavigationSession` to drive turn-by-turn instructions.

For each, write a stub that calls into `CarPlayNavigationCoordinator` and renders placeholder content. Final wiring happens in v1.1 implementation pass.

### Simulator testing

You can run + test ALL of this without the entitlement, on Xcode CarPlay simulator (`xcrun simctl --set previews list` → CarPlay device target). Document the simulator runbook in `RELEASE_CARPLAY_SIMULATOR_HARNESS.md`.

## Doctrine to read first

- `D:/.code/EcodiaOS/backend/patterns/sy094-eos-mobile-headless-ship-recipe.md` — Xcode CLI build path on the Mac
- `D:/.code/EcodiaOS/backend/patterns/ios-signing-credential-paths.md` — signing strategies
- `D:/.code/EcodiaOS/backend/patterns/asc-app-record-create-recipe.md` — App Store Connect record interactions

## Acceptance criteria

1. `D:/.code/roam/RELEASE_CARPLAY_ENTITLEMENT_APPLICATION.md` written, ready for Tate to copy-paste into Apple's form.
2. Five Swift files (above) created and added to the Xcode project's "App" target.
3. `Info.plist` updated with the scene manifest entry.
4. `App.entitlements` updated WITH the entitlement key BEHIND a CarPlay build config.
5. `RELEASE_CARPLAY_BUILD_CONFIG.md` documents the conditional build config.
6. `RELEASE_CARPLAY_SIMULATOR_HARNESS.md` documents the test harness.
7. Commits on `EcodiaTate/roam-frontend` `feat/carplay-scaffold` branch (NOT main — main goes to App Store as v1.0 without CarPlay).
8. Tag: `carplay-v1.1-scaffold` on the branch tip.

## Coordination

Write status to `kv_store.cowork.roam_ship.stream_c_status`:
- `entitlement_application_drafted` (bool + timestamp)
- `scaffold_files_committed` (bool + commit sha)
- `simulator_smoke_test_passed` (bool)
- `awaiting_apple_response` (bool, flip to true once Tate submits)
- `notes`

Do NOT touch native files belonging to Stream A (Info.plist edits other than scene manifest, PrivacyInfo.xcprivacy, signing config). If you need to coordinate around overlapping native edits, write to status and stop.

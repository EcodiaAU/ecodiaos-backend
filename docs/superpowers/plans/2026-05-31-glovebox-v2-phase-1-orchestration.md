# Glovebox v2 Phase 1 - Native Rebuild Foundations - Orchestration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: each worker uses superpowers:subagent-driven-development inside its own session for its repo's per-task TDD plan. This file is the parent orchestration; per-repo plans get written by each worker into its own `docs/` after the repo is scaffolded.

**Goal:** Scaffold 5 repos (`glovebox-design`, `glovebox-backend`, `glovebox-ios`, `glovebox-android`, `glovebox-web`) to v2 Phase 1 foundation state with green CI on every repo, ready for parallel feature work.

**Architecture:** Five-repo split per spec section 2. Two-wave dispatch via `cowork.dispatch_worker` on the laptop-agent. Wave A (design + backend) emits the artefacts the native trio consumes; Wave B (iOS + Android + web) starts in parallel as soon as Wave A workers `signal_done`. Cross-repo seams: OpenAPI-generated clients + design tokens, both shipped via CI bot opening client-bump PRs.

**Tech Stack:**
- Design: `style-dictionary`, GitHub Actions, Figma source
- Backend: FastAPI 0.115+, Pydantic 2, `openapi-generator` for client emission, Fly.io (no change)
- iOS: Swift 6, SwiftUI, Liquid Glass, MapLibre Native iOS, Supabase Swift SDK, Xcode 16+, Swift Package Manager
- Android: Kotlin 2, Jetpack Compose, Material 3 Expressive, MapLibre Native Android, Supabase Kotlin SDK, AGP 8.x, Gradle 8.x
- Web: Vite 6, React 19, TypeScript 5, MapLibre GL JS 4+, Supabase JS SDK 2, IndexedDB

---

## Spec reference

`D:/.code/EcodiaOS/backend/docs/superpowers/specs/2026-05-31-glovebox-v2-native-rebuild-design.md` (commit `9f958451`).

Read the spec before reading the worker briefs below; the briefs assume spec context.

## Phase 1 definition of done (per repo)

| Repo | Foundation DOD |
|---|---|
| `glovebox-design` | `tokens.json` schema + initial token set (color/type/spacing/radius/motion) committed. GitHub Action `export-tokens.yml` builds `Tokens.swift`, `Tokens.kt`, `tokens.css` on push to main, opens PRs to the three app repos. README documents the token vocabulary. |
| `glovebox-backend` | Every existing FastAPI route has full Pydantic input + output schemas (no `Any`, no untyped dicts, no `JSONResponse` without `response_model`). `openapi.json` locked at version 3.1.0 and emitted as a CI artefact. GitHub Action `bump-clients.yml` opens client-bump PRs against the three app repos when `openapi.json` changes. Existing test suite still passes. |
| `glovebox-ios` | New Xcode workspace at `Glovebox.xcworkspace`. SwiftUI `GloveboxApp.swift` entry point with Liquid Glass shell, three-tab bottom nav matching v1 (Guide / Trip / SOS), blank MapView screen using MapLibre Native iOS, Supabase Swift SDK wired with auth scaffolding, generated OpenAPI Swift client at `Sources/GloveboxAPI/`. Repo builds clean for `iOS 18.0+` on an iPhone 16 simulator. Initial scheme uploads to TestFlight internal track. CarPlay target file exists (empty stub) so the entitlement can be exercised on first ship. |
| `glovebox-android` | New Android Studio project at app module `app/`. Compose `GloveboxApp.kt` entry point with Material 3 Expressive theme, three-tab bottom nav matching v1, blank MapView using MapLibre Native Android, Supabase Kotlin SDK wired, generated OpenAPI Kotlin client at `app/src/main/java/au/ecodia/roam/api/`. `./gradlew assembleDebug` succeeds. Initial build uploads to Play internal testing track. Android Auto module file exists (empty stub). |
| `glovebox-web` | New Vite project root. React 19 entry point with three-route layout matching v1 (`/trip`, `/guide`, `/sos`), design tokens wired via generated `tokens.css`, blank MapLibre GL JS map, Supabase JS SDK wired, generated OpenAPI TypeScript client at `src/api/`. Service Worker registered for PWA shell. `npm run build` succeeds and outputs static assets to `dist/`. Vercel/Cloudflare preview deploy lands green. |

## Dispatch order

**Wave A (parallel, dispatched in this turn):**
- Worker `DESIGN-01` -> `glovebox-design`
- Worker `BACKEND-01` -> `glovebox-backend` (existing repo, in-place hygiene + new CI bot)

**Wave B (parallel, fires AFTER both Wave A workers `signal_done`):**
- Worker `IOS-01` -> `glovebox-ios` (new repo)
- Worker `ANDROID-01` -> `glovebox-android` (new repo)
- Worker `WEB-01` -> `glovebox-web` (new repo)

Wave B workers consume stub `tokens.json` + stub `openapi.json` if the real Wave A outputs are not yet on `main`, but they MUST consume the real outputs before opening their first feature PR (Phase 2). Wave B foundation work tolerates stubs.

## Conductor responsibilities (this main session, plus future fires)

1. Dispatch both Wave A workers in this turn via `cowork.dispatch_worker` with `worker_acknowledgment_timeout_ms: 180000`.
2. Watch `<coord_events>` at turn-start for Wave A `signal_done` events.
3. Verify each Wave A worker's deliverables via `outcomeVerificationService.verify` (file existence + initial commit SHA + GitHub Actions green).
4. Once both Wave A workers verify, dispatch all three Wave B workers in one turn.
5. Watch for Wave B `signal_done` events; verify each.
6. After all 5 workers verify, write Episode and update `status_board` row `39e6fc89-d21e-4c7c-b226-9072d4bdfbaa` to `phase_1_complete_phase_2_spec_pending`.
7. Open Phase 2 spec arc (feature parity with v1) as a new brainstorm.

If a worker fails or stalls past its declared deadline, conductor reads its coord inbox, diagnoses, redispatches with a tighter brief or pulls scope down a notch.

## Worker briefs

Each brief is the body that gets pasted into the worker's chat at dispatch. Workers receive: the brief, full CLAUDE.md doctrine, and access to read the spec. They write their own per-repo TDD plan inside their session.

---

### Worker DESIGN-01: `glovebox-design` scaffold

**You are:** A worker dispatched to scaffold the `glovebox-design` repo from scratch.

**Required reading before starting:**
- Spec: `D:/.code/EcodiaOS/backend/docs/superpowers/specs/2026-05-31-glovebox-v2-native-rebuild-design.md` (sections 1, 2, 4.2)
- Parent plan: this file, especially "Phase 1 definition of done" row for `glovebox-design`
- Doctrine: `D:/.code/EcodiaOS/backend/patterns/project-naming-mirrors-repo-name.md`

**What to do:**
1. Create the GitHub repo: `gh repo create EcodiaTate/glovebox-design --private --description "Glovebox v2 design tokens - canonical source for color/type/spacing/radius/motion across iOS/Android/web" --clone`. Clone target: `D:/.code/glovebox-design`.
2. Initialise the repo with: `package.json` (npm, style-dictionary dependency), `tokens/` directory with one `tokens.json` containing the initial token set ported from v1 visual decisions (read `D:/.code/glovebox/frontend/tailwind.config.*` + `D:/.code/glovebox/frontend/app/globals.css` for v1 colors/type/spacing), `build.js` running style-dictionary to emit `dist/Tokens.swift`, `dist/Tokens.kt`, `dist/tokens.css`.
3. Add `.github/workflows/export-tokens.yml`: on push to `main`, build the dist files, then open client-bump PRs against `EcodiaTate/glovebox-ios`, `glovebox-android`, `glovebox-web` (use a deploy-key or PAT stored at `kv_store.creds.github_glovebox_design_bot` if exists, else stub the PR step with a TODO comment naming the cred to provision).
4. Write `README.md` describing the token vocabulary, the export workflow, and how to consume the dist files from each app repo.
5. Commit + push to `main`. Verify GitHub Actions run green on the initial push.

**Definition of done:**
- Repo exists at `EcodiaTate/glovebox-design`, cloned to `D:/.code/glovebox-design`
- `tokens.json` has at least: 8 colors (primary, surface, background, foreground, accent, success, warning, error), 4 type scales, 6 spacing units, 4 radius values, 3 motion durations
- `npm run build` succeeds locally and outputs the 3 dist files
- Initial commit pushed to `main`, GitHub Actions green
- README has consumption examples for Swift, Kotlin, CSS

**On done:**
- `coord.signal_done({task_id: <your-task-id>, terminate: true, result_pointer: "verify:type=file_write;path=D:/.code/glovebox-design/tokens/tokens.json"})`
- `coord.close_my_tab()` as your final tool call

---

### Worker BACKEND-01: `glovebox-backend` hygiene + OpenAPI lock + CI bot

**You are:** A worker dispatched to bring the existing `glovebox-backend` (currently at `D:/.code/glovebox/backend/`) to OpenAPI-emission-grade hygiene.

**Required reading:**
- Spec sections 1, 4.1, 6
- Backend's current `D:/.code/glovebox/CLAUDE.md` Backend section
- Doctrine: `D:/.code/EcodiaOS/backend/patterns/verify-deployed-state-against-narrated-state.md`

**What to do:**
1. Audit every route under `D:/.code/glovebox/backend/app/api/`. List each route and its current return type. Anything that returns `Any`, untyped `dict`, raw `JSONResponse` without `response_model`, or has untyped path/query params goes on a fix list.
2. For each fix-list item, add a proper Pydantic 2 input model + output model + `response_model` decorator. Use existing models in `app/models/` or `app/schemas/` if they cover the shape; otherwise add new ones beside the route file.
3. Run the existing test suite after each route batch (`cd D:/.code/glovebox/backend && python -m pytest`). Tests must stay green.
4. Verify FastAPI emits a clean `openapi.json` at version 3.1.0 by hitting `/openapi.json` against a local `uvicorn` run. Save a copy to `D:/.code/glovebox/backend/docs/openapi-3.1.0-locked.json` as a baseline.
5. Add `.github/workflows/bump-clients.yml`: on push to `main` that changes `openapi.json` or any route file, regenerate `openapi.json`, then open client-bump PRs against the three native repos via a PAT stored at `kv_store.creds.github_glovebox_backend_bot` (stub with TODO if missing).
6. Update `D:/.code/glovebox/backend/CLAUDE.md` with the new strict-Pydantic rule (no `Any`, no untyped dicts in route signatures, every route has `response_model`).
7. Commit + push. Verify test suite green in CI.

**Definition of done:**
- Zero routes return `Any` or untyped `dict`
- `openapi.json` emits clean at version 3.1.0
- `bump-clients.yml` exists and is wired (real PR or TODO-stubbed)
- Backend CLAUDE.md updated with the rule
- Test suite green on `main`

**On done:**
- `coord.signal_done({task_id: <your-task-id>, terminate: true, result_pointer: "verify:type=file_write;path=D:/.code/glovebox/backend/docs/openapi-3.1.0-locked.json"})`
- `coord.close_my_tab()`

---

### Worker IOS-01: `glovebox-ios` foundation

**You are:** A worker dispatched to scaffold the `glovebox-ios` native iOS repo from scratch.

**Required reading:**
- Spec sections 2, 3 (iOS subsection), 5, 7 Phase 1
- Doctrine: `D:/.code/EcodiaOS/backend/patterns/sy094-eos-mobile-headless-ship-recipe.md`, `D:/.code/EcodiaOS/backend/patterns/sy094-coexist-ios-release-recipe.md`, `D:/.code/EcodiaOS/backend/patterns/ios-signing-credential-paths.md`, `D:/.code/EcodiaOS/backend/patterns/macincloud-substrate-selection-ssh-vs-rdp.md`
- Woodfordia precedent reference: status_board row `c80b1241` and its `feat/ios-native-foundation` branch (similar shape, read commit `9e34137` if accessible for SwiftUI + Liquid Glass + Supabase Swift patterns)

**What to do:**
1. `gh repo create EcodiaTate/glovebox-ios --private --description "Glovebox v2 native iOS - SwiftUI + Liquid Glass + CarPlay" --clone` to `D:/.code/glovebox-ios`.
2. Generate Xcode workspace: from inside the repo, use `xcodegen` (install via `brew install xcodegen` on SY094 if not present) with a `project.yml` defining a single iOS app target at deployment target `iOS 18.0`, bundle identifier `au.ecodia.roam`, display name `Glovebox`, marketing version `2.0.0-alpha.1`, build number `1`.
3. Author the SwiftUI app: `Sources/Glovebox/GloveboxApp.swift` (App entry), `Sources/Glovebox/Views/RootView.swift` (TabView with Guide / Trip / SOS), `Sources/Glovebox/Views/Map/MapView.swift` (blank MapLibre Native iOS map at default Australia bounds), `Sources/Glovebox/Auth/AuthService.swift` (Supabase Swift SDK wrapper), `Sources/Glovebox/Design/Tokens.swift` (stub, will be regenerated from `glovebox-design` once Wave A signals).
4. Add Swift Package Manager dependencies via `Package.swift` or `xcodegen` packages section: `supabase-swift`, `maplibre-native` (iOS package), `swift-openapi-generator` + `swift-openapi-runtime` (for OpenAPI Swift client).
5. Add `Sources/GloveboxAPI/` directory with a stub `Client.swift` (placeholder; real client lands when `glovebox-backend` ships its `openapi.json` and `glovebox-design` ships the generated Tokens.swift).
6. Add a `Glovebox/CarPlay/` directory with a single empty `CarPlaySceneDelegate.swift` stub so the CarPlay entitlement target can attach when the entitlement lands.
7. Write `README.md` documenting the project layout, the SY094 build flow, the CarPlay target placement.
8. Push to GitHub. Verify builds locally on SY094 via SSH-headless `xcodebuild` per `sy094-eos-mobile-headless-ship-recipe.md`. Initial scheme should compile clean.
9. Upload to TestFlight internal track via SY094 + ASC API key (per `sy094-eos-mobile-headless-ship-recipe.md`).

**Definition of done:**
- Repo exists at `EcodiaTate/glovebox-ios`, cloned to `D:/.code/glovebox-ios`
- Xcode project builds clean on SY094 (`xcodebuild -workspace Glovebox.xcworkspace -scheme Glovebox -destination "platform=iOS Simulator,name=iPhone 16" build`)
- Blank MapView renders on iPhone 16 simulator (centered on Australia, no tiles loaded is fine for foundation)
- Supabase auth code compiles (no real login needed)
- Initial TestFlight upload accepted by ASC (build number 1)
- CarPlay scene-delegate stub file in place

**On done:**
- `coord.signal_done({task_id: <your-task-id>, terminate: true, result_pointer: "verify:type=file_write;path=D:/.code/glovebox-ios/Sources/Glovebox/GloveboxApp.swift"})`
- `coord.close_my_tab()`

---

### Worker ANDROID-01: `glovebox-android` foundation

**You are:** A worker dispatched to scaffold the `glovebox-android` native Android repo from scratch.

**Required reading:**
- Spec sections 2, 3 (Android subsection), 5, 7 Phase 1
- Doctrine: `D:/.code/EcodiaOS/backend/patterns/play-console-cdp-driven-app-content-setup.md`, `D:/.code/EcodiaOS/backend/patterns/play-console-android-release-recipe.md`

**What to do:**
1. `gh repo create EcodiaTate/glovebox-android --private --description "Glovebox v2 native Android - Compose + Material 3 Expressive + Android Auto" --clone` to `D:/.code/glovebox-android`.
2. Generate Android Studio project: use `gradle init` or scaffold by hand with: `settings.gradle.kts`, root `build.gradle.kts`, `app/build.gradle.kts` configured for application id `au.ecodia.roam`, version name `2.0.0-alpha.1`, version code `1`, min SDK 26, target SDK 35, compile SDK 35.
3. Author the Compose app: `app/src/main/java/au/ecodia/roam/GloveboxApp.kt` (Application class), `app/src/main/java/au/ecodia/roam/MainActivity.kt` (Compose entry, sets the M3 Expressive theme), `app/src/main/java/au/ecodia/roam/ui/RootScreen.kt` (Scaffold with NavigationBar, three tabs Guide/Trip/SOS), `app/src/main/java/au/ecodia/roam/ui/map/MapScreen.kt` (blank MapLibre Native Android map), `app/src/main/java/au/ecodia/roam/auth/AuthService.kt` (Supabase Kotlin SDK wrapper), `app/src/main/java/au/ecodia/roam/design/Tokens.kt` (stub).
4. Add Gradle dependencies: `androidx.compose.material3`, `org.maplibre.gl:android-sdk`, `io.github.jan-tennert.supabase:gotrue-kt`, `io.github.jan-tennert.supabase:postgrest-kt`, `androidx.car.app:app` for Android Auto.
5. Add `app/src/main/java/au/ecodia/roam/api/` directory with a stub `ApiClient.kt`.
6. Add `automotive/` module placeholder for Android Auto (empty `CarAppService` subclass + manifest entry, no actual flows yet).
7. Write `README.md` documenting the module layout, Gradle config, Android Auto module location.
8. `./gradlew assembleDebug` succeeds. Push to GitHub.
9. Upload to Play internal testing track via the existing `D:/.code/EcodiaOS/backend/scripts/play-upload.py` (per `play-console-android-release-recipe.md`).

**Definition of done:**
- Repo exists at `EcodiaTate/glovebox-android`, cloned to `D:/.code/glovebox-android`
- `./gradlew assembleDebug` succeeds, signed debug APK produced
- Blank MapScreen renders on an emulator
- Supabase auth wrapper compiles
- Initial AAB uploaded to Play internal testing track, ready for testers
- Android Auto module placeholder present

**On done:**
- `coord.signal_done({task_id: <your-task-id>, terminate: true, result_pointer: "verify:type=file_write;path=D:/.code/glovebox-android/app/src/main/java/au/ecodia/roam/GloveboxApp.kt"})`
- `coord.close_my_tab()`

---

### Worker WEB-01: `glovebox-web` foundation

**You are:** A worker dispatched to scaffold the `glovebox-web` repo from scratch.

**Required reading:**
- Spec sections 2, 3 (Web subsection), 4.2, 4.4, 7 Phase 1
- Source: read the existing `D:/.code/glovebox/frontend/` for the IndexedDB offline layer + nav model that carries over

**What to do:**
1. `gh repo create EcodiaTate/glovebox-web --private --description "Glovebox v2 web PWA - Vite + React + MapLibre GL JS" --clone` to `D:/.code/glovebox-web`.
2. Bootstrap: `npm create vite@latest . -- --template react-ts` (run from inside the empty repo).
3. Trim the Vite default boilerplate. Configure TypeScript strict, ESLint, Prettier.
4. Author the app: `src/App.tsx` (React Router with three routes `/trip`, `/guide`, `/sos`), `src/components/Map.tsx` (MapLibre GL JS blank map centered on Australia), `src/auth/AuthService.ts` (Supabase JS SDK wrapper with session persistence), `src/api/client.ts` (stub OpenAPI TypeScript client, real client lands when backend ships).
5. Add `src/design/tokens.css` (stub, regenerated from `glovebox-design` once Wave A signals).
6. Add `public/manifest.webmanifest` + `src/service-worker.ts` for PWA shell. Register the service worker in `src/main.tsx`.
7. Port the IndexedDB offline layer scaffold from `D:/.code/glovebox/frontend/lib/offline/` (read it, keep the structure, drop the imports - just the shape).
8. Add `npm` scripts: `dev`, `build`, `preview`, `test`. Wire Vitest for unit tests.
9. `npm run build` succeeds. Push to GitHub.
10. Connect to Vercel (or Cloudflare Pages) as a new project. Verify preview deploy lands READY on the first push.

**Definition of done:**
- Repo exists at `EcodiaTate/glovebox-web`, cloned to `D:/.code/glovebox-web`
- `npm run build` succeeds, `dist/` populated
- Three routes render, blank MapLibre map on `/trip`
- Service Worker registers in production build
- Supabase auth wrapper compiles
- Vercel/Cloudflare preview deploy READY on initial push
- Commit author is a GitHub-recognised identity per `feedback_vercel_deploys_need_github_recognised_commit_author_2026-05-25` doctrine

**On done:**
- `coord.signal_done({task_id: <your-task-id>, terminate: true, result_pointer: "verify:type=file_write;path=D:/.code/glovebox-web/src/App.tsx"})`
- `coord.close_my_tab()`

---

## Risks carried from spec section 10

- CarPlay entitlement timing (2-8wk window) - if it lands before IOS-01 ships its foundation, conductor reroutes IOS-01 to add a CarPlay stub flow that exercises the entitlement on TestFlight before waiting for full feature work.
- Design coherence drift across 3 idioms - mitigated by weekly token + screenshot review across all three repos.
- Concurrent worker capacity - 5 workers (2 Wave A + 3 Wave B) is within laptop-agent budget on Corazon, but if memory pressure climbs past 90% during Wave B, fall back to 2-then-1 sequencing instead of 3-parallel for Wave B.

## Next steps after this plan ships

1. Dispatch Wave A workers in this turn.
2. Watch coord events, verify, dispatch Wave B.
3. After all 5 verify, write Episode + update status_board row `39e6fc89` to `phase_1_complete`.
4. Open Phase 2 spec (feature parity with v1) as a fresh brainstorm.

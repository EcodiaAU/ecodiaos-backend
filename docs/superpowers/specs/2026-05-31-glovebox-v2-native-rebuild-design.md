# Glovebox v2.0 - Native Rebuild Design

**Date:** 2026-05-31
**Author:** EcodiaOS (conductor session, brainstormed with Tate)
**Status:** approved, transitioning to writing-plans
**Bundle ID:** `au.ecodia.roam` (immutable, kept for in-place 2.0.0 version bump)
**Parent status_board row:** (created same turn as this spec)

## 1. Context

Glovebox is an offline-first navigation app for the Australian outback. v1 ships as a Next.js 16 + Capacitor 8 wrapper to iOS, Android, and web with a FastAPI + OSRM backend on Fly.io (Sydney). v1 is shipping now to acquire users while v2 is built in parallel.

### Why native

Three drivers, all real:

1. **CarPlay + Android Auto are blocking.** Both were going to be Capacitor extensions; native lets them be first-class. The CarPlay entitlement application is already submitted under bundle ID `au.ecodia.roam` (audit doc 2026-05-27, entitlement window 2-8wk).
2. **The rebuild was inevitable.** Cap is the right substrate for a v1 acquisition wedge, not the right substrate for the product we want to be known for.
3. **Quality ambition.** "Better than others settling with cap." Native means leaning into each platform's idiom, not lowest-common-denominator.

### Non-goals

- No deadline pressure. v1 covers user acquisition while v2 builds.
- No backend rewrite. The Python + FastAPI + OSRM substrate is good; it stays.
- No infra migration as part of this. Fly.io stays; any GCR migration is a separate arc.
- No "Glovebox Pro" / side-by-side new-app story. Same bundle, 2.0.0 version bump.

## 2. Repo topology

Five repos, three are new:

| Repo | Status | What |
|---|---|---|
| `glovebox-ios` | new | Swift + SwiftUI + Liquid Glass + CarPlay extension |
| `glovebox-android` | new | Kotlin + Jetpack Compose + Material 3 Expressive + Android Auto module |
| `glovebox-web` | new | Vite + React + MapLibre GL JS + PWA shell |
| `glovebox-backend` | existing (current `D:/.code/glovebox/backend/`, rename if needed) | FastAPI on Fly.io, unchanged in shape |
| `glovebox-design` | new | Canonical `tokens.json`, Figma source, CI exports per-platform token files |

The current `D:/.code/glovebox/frontend/` (Cap-wrapped Next.js) and `frontend-carplay/` get archived after v1 Cap ship is stable. Backend dir stays.

Sibling-repo shape was chosen over monorepo so each native codebase has its own clean toolchain (Xcode workspace, Android Studio project, Vite root), its own CI/CD, its own issue tracker, and its own release cadence. iOS devs never see node_modules; web devs never see Gradle. The "one PR touches all three" concern is solved by the OpenAPI-client and design-token CI seams below.

## 3. Per-codebase stack

### glovebox-ios

- Swift 6, SwiftUI declarative UI
- Liquid Glass design language (Apple's 2026 system)
- Swift Concurrency (async/await, actors, structured concurrency)
- MapLibre Native iOS for offline vector tiles
- SwiftData for offline persistence (trips, plans, nav packs, basemap, fuel, emergency, guides)
- Supabase Swift SDK for auth and remote sync (already in use on Woodfordia native arc)
- CarPlay via `CPMapTemplate`, `CPListTemplate`, `CPNowPlayingTemplate`
- Generated OpenAPI Swift client at `Sources/GloveboxAPI/`
- Generated `Tokens.swift` from `glovebox-design` at `Sources/GloveboxDesign/`

### glovebox-android

- Kotlin 2, Jetpack Compose declarative UI
- Material 3 Expressive design language (Google's 2026 system)
- Coroutines + Flow for async
- MapLibre Native Android for offline vector tiles
- Room for offline persistence
- Supabase Kotlin SDK for auth and remote sync
- Android Auto via `androidx.car.app` library
- Generated OpenAPI Kotlin client at `app/src/main/java/au/ecodia/roam/api/`
- Generated `Tokens.kt` from `glovebox-design` at `app/src/main/java/au/ecodia/roam/design/`

### glovebox-web

- Vite + React 19 (no SSR; offline-first SPA doesn't need it)
- MapLibre GL JS for vector tiles
- IndexedDB for offline persistence (carries over the existing offline layer from `frontend/`)
- Service Worker PWA shell
- Supabase JS SDK
- Generated OpenAPI TypeScript client at `src/api/`
- Generated `tokens.css` from `glovebox-design` at `src/design/`

Vite was chosen over staying on Next.js because the offline-first SPA shape doesn't benefit from SSR; dev loop is faster, build output is leaner, and the rebuild is the right moment to shed framework weight.

## 4. Shared substrates

### 4.1 API contract (OpenAPI-generated clients)

FastAPI already emits `openapi.json` automatically from Pydantic 2 route schemas. `openapi-generator` (or `openapi-typescript-codegen` for TS, equivalent for Swift/Kotlin) produces typed clients for each platform.

**Workflow:**

1. Backend PR changes a route signature.
2. Backend CI emits the new `openapi.json` as a build artifact.
3. A CI bot opens PRs in `glovebox-ios`, `glovebox-android`, `glovebox-web` bumping the generated client folder.
4. Each native repo merges the client-bump PR independently, on its own release cadence.

**Backend hygiene rule** (enforced at PR review): every route has full Pydantic input + output schemas. No `Any`, no untyped dicts in route signatures, no `JSONResponse` returns without a declared response_model. This is good code regardless and makes the client generation lossless.

### 4.2 Design tokens

Same workflow shape as the API client:

1. Designer touches Figma and updates `tokens.json` in `glovebox-design`.
2. Design CI runs `style-dictionary` (or equivalent) and emits `Tokens.swift`, `Tokens.kt`, `tokens.css`.
3. CI bot opens PRs in the three app repos bumping the generated token files.

Tokens cover color, type, spacing, radius, motion, elevation. Components are NOT shared - each platform implements its own `TripCard`, `RouteBanner`, `FuelGauge` etc. in its native idiom (SwiftUI Liquid Glass, Compose Material 3, custom CSS). Same vocabulary, same brand, three native feels.

### 4.3 Auth

Supabase across all three platforms. Already in use on web; first-class SDKs for Swift and Kotlin. Auth state syncs via Supabase magic links, OAuth, or whatever flows v1 already uses (preserve user accounts across v1 -> v2 upgrade).

### 4.4 Offline / tiles

- **iOS:** SwiftData for app state; MapLibre Native iOS for tiles; PMTiles loader via MapLibre's pmtiles plugin
- **Android:** Room for app state; MapLibre Native Android for tiles; PMTiles loader
- **Web:** IndexedDB for app state (carry over existing); MapLibre GL JS for tiles; PMTiles loader

Trip bundle on-disk shape stays unchanged so the backend bundle-builder (`/bundle/build`, `/bundle/download`) is untouched. Each platform's loader reads the same bundle format.

## 5. App identity and upgrade path

- Bundle ID `au.ecodia.roam` (Apple) and `au.ecodia.roam` (Google, assumed same; verify in Play Console). Immutable.
- v2 ships as marketing version `2.0.0`, build incrementing from where v1 left off.
- Single App Store and Play Store listings, version bump in place.
- Existing users auto-upgrade. Ratings, reviews, install base, CarPlay entitlement all carry forward.
- App display name stays "Glovebox" on both stores.

## 6. Backend posture

- **Stay on Fly.io.** Don't couple infra migration to the native rebuild. Two large arcs concurrent is how things break.
- Backend gets the strict Pydantic hygiene pass (section 4.1) as part of v2 contract-locking, but no architectural changes.
- OSRM, open-meteo, Postgres + PostGIS stay where they are.
- GCSFuse for large edge DBs stays.
- If a future GCR migration arc opens (cheaper at scale, GCP ecosystem fit for BigQuery/Vertex), it's a separate spec.

## 7. Sequencing

**Three native streams in parallel from day 1.** Capacity exists via `cowork.dispatch_worker` (laptop-agent reflex per CLAUDE.md). Each stream is a separate worker chat in VS Code Stable, each owning one repo, each ribbon-cutting from a clean foundation.

Why parallel over iOS-first:
- iOS still ships first organically (Apple's review cycle is longer than Google's; web has no review cycle).
- Parallel gets us to three-platform parity fastest end-to-end.
- Design churn is contained by the token + OpenAPI seams; the three streams don't block each other.

**Phase 0 (this spec is the artifact).** Done.

**Phase 1: foundations, all three repos in parallel.**

- `glovebox-design`: scaffold the tokens repo, port v1 visual decisions into `tokens.json`, set up the CI export pipeline.
- `glovebox-backend`: Pydantic hygiene pass on every route, lock OpenAPI 3.1, set up the CI bot that opens client-bump PRs.
- `glovebox-ios`: Xcode workspace, SwiftUI App entry point, Liquid Glass shell, Supabase auth, generated OpenAPI client integration, blank Map screen.
- `glovebox-android`: Android Studio project, Compose entry point, Material 3 theme, Supabase auth, generated OpenAPI client integration, blank Map screen.
- `glovebox-web`: Vite project, React entry point, design tokens wired, Supabase auth, generated TS client, blank Map screen.

**Phase 2: core navigation feature parity with v1.**

- Trip CRUD, plans, route fetching, offline bundle download, MapLibre with PMTiles, fuel calc, basic POI search.
- Three streams run in parallel; each ships its own feature parity milestone to TestFlight / Play internal / preview deploy.

**Phase 3: CarPlay + Android Auto.**

- iOS stream: CarPlay templates, dashboard integration, voice nav.
- Android stream: Android Auto session, dashboard integration.
- Web doesn't apply.

**Phase 4: parity completion + 30-day soak.**

- Everything v1 has, v2 has. TestFlight / Play internal track for 30 days minimum.
- Crash-free rate, p95 launch time, offline-mode validation all instrumented.

**Phase 5: production ship.**

- v2.0.0 to App Store + Play Store + web prod, same listings, version bump in place.
- v1 Cap codebase archived. `D:/.code/glovebox/frontend/` and `frontend-carplay/` move to `_archived/`.

## 8. Cap v1.0 lifecycle

- v1 ships to production now.
- During v2 build, v1 stays in maintenance: security fixes, crash fixes, critical UX bugs only. No new features.
- v1 effectively sunsets the day v2 ships (Phase 5). v1 users auto-upgrade to v2 via the version bump.
- v1 codebase is archived but not deleted, in case rollback is needed.

## 9. Out of scope

- Backend infra migration (Fly.io -> GCR).
- Brand rename or new bundle ID.
- Side-by-side "Glovebox Pro" listing.
- New features that aren't in v1. v2 is a quality rebuild, not a feature expansion.
- Cross-platform component sharing (Kotlin Multiplatform, etc.) - explicitly rejected in favor of native idiom per platform.

## 10. Open risks

- **CarPlay entitlement timing.** Apple's window is 2-8 weeks. If it lands before iOS Phase 1 is ready, the CarPlay slice gets stubbed in to validate the entitlement on TestFlight before full feature work.
- **Design coherence drift.** Three streams + three idioms = risk of divergence. Mitigation: weekly token + screenshot review across all three repos; design system is the canonical authority.
- **Backend OpenAPI hygiene cost.** Some routes likely return untyped dicts today. Strict typing pass is a real engineering pass, not a flip-a-switch.
- **Supabase Swift / Kotlin SDK maturity.** Web SDK is mature; native SDKs are younger. If a native SDK gap blocks, fall back to direct REST against Supabase's REST endpoint via the OpenAPI client.
- **Concurrent worker capacity.** Three parallel native streams + backend hygiene pass = four concurrent dispatch_worker chats minimum. CLAUDE.md notes the laptop-agent host (Corazon) has memory pressure constraints; if four chats strain memory, sequence the streams as 2+1 instead of 3 parallel.

## 11. Next step

Invoke `writing-plans` to break this design into per-repo implementation plans suitable for `dispatch_worker` fan-out. Each plan becomes a worker brief; workers run in parallel via VS Code Stable chat tabs, signaling back via `coord.*` MCP tools.

Plans will be at `D:/.code/EcodiaOS/backend/docs/superpowers/plans/2026-05-31-glovebox-v2-*/` keyed by repo:

- `plan-phase-1-design.md`
- `plan-phase-1-backend-hygiene.md`
- `plan-phase-1-ios-foundation.md`
- `plan-phase-1-android-foundation.md`
- `plan-phase-1-web-foundation.md`

Phase 1 is the only phase planned in detail in this spec arc; Phase 2 onward gets its own spec + plan cycle once Phase 1 is shipped.

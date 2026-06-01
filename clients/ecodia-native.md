# Ecodia Native - canonical infra manifest

> The single source of truth for Ecodia Native's repo, hosting, and substrate.
> Read this BEFORE touching the surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Ecodia Native - internal Ecodia-only iOS app. Native Swift xcodegen
multi-target (main app + share extension + widget). Internal tool, not commercial.

**Immutable identifiers (never change these):**
- iOS main bundle id: `au.ecodia.native`
- Share extension bundle id: `au.ecodia.native.share`
- Widget bundle id: `au.ecodia.native.widget`
- Apple Team ID: `86PUY7393S`

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **iOS** | `EcodiaTate/ecodia-native` (native Swift xcodegen multi-target, `EcodiaNative.xcodeproj` at repo root) | TestFlight (internal only) | `au.ecodia.native` (+ `.share` + `.widget`) | Build 11 uploaded + verified end-to-end 2026-05-20. Ship recipe status `validated_v1`. |

**Local Corazon path:** `D:/.code/ecodia-native/` (main clone, branch `main`).

**Top-level dirs in repo (verified 2026-06-01):**
- `EcodiaApp` - main app target
- `EcodiaCore` - shared core framework
- `EcodiaNative.xcodeproj` - xcodegen-generated
- `EcodiaShare` - share extension target
- `EcodiaWidget` - widget target
- `exportOptions.plist` - signing/export config

## Substrate

| What | Value |
|---|---|
| Backend | Talks to EcodiaOS API surfaces over Tailscale or VPS. No dedicated Supabase project for this app. |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. Multi-target signing for all 3 bundles. |
| Test login | Internal Ecodia-only - no test creds. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Not commercial.** Do not propose pricing, store listing copy, or public marketing surfaces. This is Ecodia's own internal field tool.
- **xcodegen multi-target shape** is the canonical template that `context` (separate app, same multi-target pattern) inherits from. Changes to the build pattern here can ripple - flag explicitly.
- **xcodeproj at repo root** (not `ios/App/App.xcodeproj` Capacitor shape). Generic Capacitor ship scripts will not work.

## Build / ship

- **iOS:** SY094 headless per `patterns/ecodia-native-headless-ship-recipe-2026-05-20.md` (recipe status `validated_v1`).
- **Pattern reference:** `patterns/ios-app-asc-headless-ship-protocol.md` (universal driver) + the recipe above for app-specific deltas.

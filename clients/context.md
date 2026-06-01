# Context - canonical infra manifest

> The single source of truth for Context's repos, hosting, and substrate.
> Read this BEFORE touching any Context surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Context - local-first world-model graph app, native iOS.
Origin: built for Tate's mum (passive-brain capture). Multi-target Swift app
with keyboard extension, share extension, and personal VPN extension.

**Immutable identifiers (never change these):**
- iOS main bundle id: `au.ecodia.context`
- Keyboard extension bundle id: `au.ecodia.context.keyboard`
- Share extension bundle id: `au.ecodia.context.share`
- VPN extension bundle id: `au.ecodia.context.vpn`
- Apple Team ID: `86PUY7393S`

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **iOS** | `EcodiaTate/context` (native Swift multi-target, `Context.xcodeproj` at repo root) | TestFlight | `au.ecodia.context` (+ 3 ext bundles) | TestFlight active; share-sheet capture mode shipped to build 48 (1.6.0) per status_board 4269647a |
| Android | `D:/.code/context/Context-Android/` directory exists on disk | (none yet) | n/a | Deferred until iOS stabilises - no ship recipe |

**Local Corazon path:** `D:/.code/context/` (main clone, branch `main`).
`xcodeproj` lives at repo root, NOT under `ios/App/` (unlike Capacitor apps).

## Substrate

| What | Value |
|---|---|
| **Local-first storage** | On-device only (no Supabase backend - this is the design). |
| Gmail OAuth | `D:/PRIVATE/ecodia-creds/context-gmail-oauth.json` + `context-gmail-token.json` (Tate's Gmail capture flow for Context). |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. Bundle `au.ecodia.context`. Multi-target signing: all 4 bundles need provisioning profiles + entitlements (App Groups for share-extension state, Network Extension for VPN target). |
| Test login | n/a - spec/personal stage. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **NOT a Capacitor app.** Native Swift multi-target. xcodeproj at repo root, not `ios/App/App.xcodeproj`. Generic Capacitor ship scripts (e.g. `~/asc-scripts/ship-ios.py coexist`) will not work as-is.
- **Pattern inheritance:** uses the ecodia-native multi-target xcodegen shape (App + Share + Widget pattern, ported to App + Keyboard + Share + VPN here).
- **Android target deferred.** `Context-Android/` exists on disk but there is no validated ship recipe. Treat as scratchpad until a recipe lands.
- **VPN target is a Network Extension** - requires Network Extension entitlement on the team. Verify entitlement before assuming new builds work.
- **Build 48 (1.6.0)** addresses three Tate complaints: (1) `@@` collapse in share-sheet capture, (2) relevance-floor filter, (3) multi-trigger handling. UUID `c5259349-fcd1-43b1-bb4d-6eaa27b28079`. status_board row 4269647a.

## Build / ship

- **iOS:** SY094 headless per `patterns/context-ios-headless-ship-recipe.md` (or ecodia-native multi-target recipe as base if Context-specific one is stale).
- **Repo README** at `D:/.code/context/README.md` is canonical product doc - this manifest is the infra layer only.

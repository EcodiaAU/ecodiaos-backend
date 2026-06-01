# Glovebox - canonical infra manifest

> The single source of truth for Glovebox's repos, hosting, domains, and substrate.
> Read this BEFORE touching any Glovebox surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see "Manifest format" at the bottom).

**Product:** Glovebox - Australian offline roadtripping / navigation app. Formerly Roam,
briefly Nav. Renamed 2026-05-28; **bundle id, package, and the `roam_*` identifiers are
immutable and were kept.** AUS-only market.

**Identifiers:**
- **iOS bundle id: `au.ecodia.roam`** (immutable - CarPlay entitlement is locked to it, never change).
- **Android package: `au.ecodia.glovebox`** (changed 2026-06-01). The old `au.ecodia.roam` Android app lived on an inaccessible Play account; since Roam never released on Play and there's no Android Auto filing, we made a fresh app under the code@ account with the clean namespace. iOS/Android package mismatch is fine - backend keys on auth, not package. Android applicationId in glovebox-android must be `au.ecodia.glovebox`.
- Apple Team ID: `86PUY7393S` · ASC app Apple ID: `6759938475`
- v1 IAP product (grandfathered to lifetime, iOS only): `roam_unlimited`

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `EcodiaTate/glovebox-frontend` (Vite 6 + React 19 + Capacitor 8; web app builds from `frontend/`) | Vercel project **`glovebox-frontend`** | **`glovebox.ecodia.au`** (canonical) + `nav.ecodia.au` + `roam.ecodia.au` | **LIVE. This IS the web app. No rebuild needed - v1 was always web-ready.** |
| **iOS** | `EcodiaTate/glovebox-ios` (native SwiftUI + XcodeGen + MapLibre + Supabase Swift + swift-openapi) | TestFlight / App Store | au.ecodia.roam | v2 native rebuild in progress |
| **Android** | `EcodiaTate/glovebox-android` (native Jetpack Compose + M3 Expressive) | Google Play | au.ecodia.roam | v2 native rebuild in progress (thinnest) |
| **Backend** | `EcodiaTate/glovebox` (FastAPI) | **Google Cloud Run** (NOT Fly.io) - service `roam-backend`, GCP project `ecodia-site` | `https://roam-backend-2z5escjq6a-ts.a.run.app` | LIVE, rev 00095-dcm carries v2 billing |
| **Design** | `EcodiaTate/glovebox-design` (style-dictionary tokens) | CI fan-out to per-platform token files | n/a | Phase 1 foundation |

**Local Corazon path:** `D:/.code/glovebox/` (folder renamed from roam 2026-05-28). Web app at
`D:/.code/glovebox/frontend`, backend at `D:/.code/glovebox/backend`.

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`vzauarlfmkjfkcphojbd`** (the ROAM/Glovebox project). NOT `nxmtfzofemtrlezlyhcj` (that is EcodiaOS/Ecodia-App - a different app entirely). |
| Web env (Vercel) | `VITE_SUPABASE_URL=https://vzauarlfmkjfkcphojbd.supabase.co`, anon key, `VITE_API_BASE=https://roam-backend-2z5escjq6a-ts.a.run.app` |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. 3 v2 IAPs live (AUS-only): `glovebox_pass_month` $9.99 consumable, `glovebox_pass_season` $19.99 consumable, `glovebox_lifetime` $34.99 non-consumable. All MISSING_METADATA until a review screenshot is uploaded. |
| **Google Play** | Fresh app **`au.ecodia.glovebox`** under the **code@ Play Console account** (created 2026-06-01). SA `play-uploader@ecodia-code.iam.gserviceaccount.com` (GCP project `ecodia-code`, key `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`) has 200 access (verified). Store listing text (title/short/full) live via API 2026-06-01. **Billing uses the new Monetization API (`monetization.onetimeproducts`), NOT legacy `inappproducts`** - the old endpoint returns "Please migrate to the new publishing API" on new apps. Still TODO: graphics (icon/feature/screenshots), app-content declarations (CDP, Chambers playbook), AAB on internal track (after first native build), then billing products. |
| Billing model (v2) | Free 2 trips · Month $9.99/30d · Season $19.99/90d · Lifetime $34.99. Web = Stripe checkout; iOS = StoreKit; Android = Play Billing (new Monetization API). Grandfather `roam_unlimited` buyers -> lifetime (iOS only; Android had no buyers). |
| CarPlay | Entitlement submitted, linked to au.ecodia.roam. `frontend-carplay` dir (iOS-only). |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Web never needed a rebuild.** v1 was already Vite + React + web-safe (Capacitor calls guarded
  in `NativeBootstrap.tsx`, web fallbacks in `geolocation.ts`, Stripe-on-web in `PaywallModal.tsx`).
  It was already live at `glovebox.ecodia.au`. A v2 "web rebuild" stood up a redundant skeleton +
  duplicate Vercel project `glovebox-web` (DELETED 2026-06-01). The skeleton repo
  `EcodiaTate/glovebox-web` is dead - do not deploy from it.
- **Backend is Cloud Run, not Fly.io.** `glovebox-backend.fly.dev` is dead (HTTP 000). Any code or
  doc pointing there is stale. Live URL is the Cloud Run one above.
- **Play SA 403 on `au.ecodia.roam` - RESOLVED by remaking the app (2026-06-01).** The old
  `au.ecodia.roam` Play app sat on an inaccessible account; the SA `edits.insert` 200'd on
  `au.ecodia.chambers` but 403'd on `au.ecodia.roam` no matter what was granted. Rather than chase
  the mystery account, we created a fresh app `au.ecodia.glovebox` under code@ (Roam never released
  on Play, no Android Auto filing = nothing to preserve). SA gets 200 automatically. Lesson: when a
  Play SA 403s on one app but works on a sibling, and the app has no install base, remaking under the
  account the SA already owns is faster than hunting account membership.
- **Play rename - moot.** The fresh `au.ecodia.glovebox` app was created as "Glovebox" from the
  start; listing title set via API 2026-06-01. No rename needed.

## Build / ship

- iOS: SY094 Mac (SSH headless for `xcodebuild`/`xcrun altool`; RDP for Xcode GUI). XcodeGen
  `project.yml` -> `xcodegen generate` -> build. Recipe: `patterns/glovebox-ios-headless-ship-recipe.md`.
- Android: `scripts/play-upload.py` + service account. Recipe: `patterns/glovebox-android-headless-ship-recipe.md`. Default `LANG=en-GB`.
- Web: Vercel auto-deploy from `glovebox-frontend` repo, or CLI deploy. No action normally needed.

---

## Manifest format (the standard for every project/client)

Every project + client gets one of these at `backend/clients/<slug>.md`. Sections, in order:
1. **Identity** - what it is, immutable identifiers.
2. **Surfaces table** - repo + hosting + live URL + status, one row per surface (web/ios/android/backend/...).
3. **Substrate** - Supabase/DB project refs, store accounts, env values, billing.
4. **Gotchas / dead ends** - every stale URL, wrong project ref, and paid-for-in-time trap.
5. **Build / ship** - how each surface deploys, recipe links.

Exact values only (real project refs, real URLs, real account names). Concise tables over prose.
When reality diverges, fix this doc in the same turn (per `verify-deployed-state-against-narrated-state.md`).

Origin: 2026-06-01. Two days lost rebuilding a web app that was already live at glovebox.ecodia.au
because no clean per-project hosting/repo manifest existed. Tate verbatim: "We need much cleaner,
concise and exact documentation around every project and clients repo and hosting nuance."

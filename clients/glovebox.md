# Glovebox - canonical infra manifest

> The single source of truth for Glovebox's repos, hosting, domains, and substrate.
> Read this BEFORE touching any Glovebox surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see "Manifest format" at the bottom).

**Product:** Glovebox - Australian offline roadtripping / navigation app. Formerly Roam,
briefly Nav. Renamed 2026-05-28; **bundle id, package, and the `roam_*` identifiers are
immutable and were kept.** AUS-only market.

**Immutable identifiers (never change these):**
- iOS bundle id / Android package: `au.ecodia.roam`
- Apple Team ID: `86PUY7393S` · ASC app Apple ID: `6759938475`
- v1 IAP product (grandfathered to lifetime): `roam_unlimited`

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
| **Google Play** | Published under the **code@ Play Console developer account**. Service account `play-uploader@ecodia-code.iam.gserviceaccount.com` (GCP project `ecodia-code`, key at `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`). |
| Billing model (v2) | Free 2 trips · Month $9.99/30d · Season $19.99/90d · Lifetime $34.99. Web = Stripe checkout; iOS = StoreKit; Android = Play Billing. Grandfather `roam_unlimited` buyers -> lifetime. |
| CarPlay | Entitlement submitted, linked to au.ecodia.roam. `frontend-carplay` dir (iOS-only). |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Web never needed a rebuild.** v1 was already Vite + React + web-safe (Capacitor calls guarded
  in `NativeBootstrap.tsx`, web fallbacks in `geolocation.ts`, Stripe-on-web in `PaywallModal.tsx`).
  It was already live at `glovebox.ecodia.au`. A v2 "web rebuild" stood up a redundant skeleton +
  duplicate Vercel project `glovebox-web` (DELETED 2026-06-01). The skeleton repo
  `EcodiaTate/glovebox-web` is dead - do not deploy from it.
- **Backend is Cloud Run, not Fly.io.** `glovebox-backend.fly.dev` is dead (HTTP 000). Any code or
  doc pointing there is stale. Live URL is the Cloud Run one above.
- **Play SA 403 on `au.ecodia.roam`** (as of 2026-06-01): same SA `edits.insert` 200 on
  `au.ecodia.chambers` but 403 on `au.ecodia.roam`. Both are on the code@ account, so it is NOT
  account membership and NOT a GCP API-enable issue - the SA's access is scoped to specific apps and
  `au.ecodia.roam` is not in its list. Fix: Play Console -> Users & permissions -> the SA -> add
  `au.ecodia.roam` to its app access (or set account-level admin). Then Android billing products +
  the store-listing rename to "Glovebox" can be done via the androidpublisher API.
- **Play app rename to "Glovebox":** the Android store-listing name is still "Roam". Unlike ASC,
  Play lets you rename a published app via the store listing (goes through listing review). Easiest:
  once the SA has app access, set it via androidpublisher `edits -> listings.update(title)`.

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

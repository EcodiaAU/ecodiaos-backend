# Chambers - canonical infra manifest

> The single source of truth for Chambers' repos, hosting, domains, and substrate.
> Read this BEFORE touching any Chambers surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Chambers - AI-native member-org platform for chambers of commerce.
Multi-tenant, per-tenant subdomain under `*.chambers.ecodia.au`. Built by Ecodia,
sold to chambers of commerce. **Wedge:** Angelica-routed referral via Resonaverde
(Angelica is the salesperson into chamber CEOs).

**Immutable identifiers (never change these):**
- iOS bundle id / Android package: `au.ecodia.chambers`
- Apple Team ID: `86PUY7393S`
- Android signing keystore: `D:/PRIVATE/ecodia-creds/chambers/chambers-release.jks`
  (passwords in `keystore-password.txt`, also `keystore-meta.txt`)

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `EcodiaTate/chambers-frontend` (Vite + React + TS + Capacitor) | Vercel project **`chambers-frontend`** (framework `vite`, prod branch `main`, auto-deploy) | **`chambers.business`** + `chambers.ecodia.au` + `app.chambers.ecodia.au` + `*.chambers.ecodia.au` (multi-tenant wildcard) + `fe-hazel-beta.vercel.app` | LIVE |
| **iOS** | same repo, `ios/App` Capacitor target | Google Play (Android first), TestFlight | `au.ecodia.chambers` | iOS shipping |
| **Android** | same repo, `android/` Capacitor target | Google Play | `au.ecodia.chambers` | v1.0(17) sent to Google Play 2026-05-29 (status_board c42c927c) |

**Local Corazon path:** `D:/.code/chambers-frontend/` (main clone, branch `main`).
Sibling `D:/.code/chambers-frontend-uxfix/` is a worktree for UX iterations.

**Dead alternate repo:** `EcodiaTate/chambers-platform-site` was deprecated 2026-05-27.
Local `D:/.code/chambers-platform-site` slated for deletion.

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`arkbjjkfjsjibnhivjis`** (name `Chambers`, region `ap-southeast-2`). |
| Web env (Vercel) | `VITE_SUPABASE_URL=https://arkbjjkfjsjibnhivjis.supabase.co`, anon key. Per-tenant config resolved at runtime via subdomain -> tenant lookup. |
| Multi-tenant routing | Vercel wildcard `*.chambers.ecodia.au` -> chambers-frontend project. Subdomain pattern: `<tenant-slug>.chambers.ecodia.au`. |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. Bundle `au.ecodia.chambers`. |
| **Google Play** | Published under code@ Play Console developer account. Service account `play-uploader@ecodia-code.iam.gserviceaccount.com` (key at `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`). SA `edits.insert` IS authorised on `au.ecodia.chambers` (verified 2026-06-01). |
| Test login | Per-tenant - populate when first paying tenant ships. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **`chambers-platform-site` is dead.** Deprecated 2026-05-27. Canonical repo is `chambers-frontend`. Do not commit there.
- **Multi-tenant subdomain wildcard requires DNS + Vercel coordination.** `*.chambers.ecodia.au` is the wildcard target. Adding a tenant = create the subdomain in Cloudflare (or wherever DNS lives) AND let Vercel's wildcard catch it. No per-tenant Vercel domain entry needed.
- **`chambers.business` is the primary marketing/sales domain**, `chambers.ecodia.au` is the in-namespace ecodia variant, `app.chambers.ecodia.au` is the per-tenant app shell (without a subdomain). Don't deep-link `app.chambers.ecodia.au` in customer-facing comms - send them to their tenant subdomain.
- **Play `au.ecodia.chambers` works under the code@ Play Console SA**, but `au.ecodia.roam` (Glovebox) currently 403s on the same SA - that is NOT a Chambers issue; it is Glovebox's SA-app-access scope (see glovebox.md gotchas).
- **chambers-platform-site rebranded:** if older briefs mention `chambers-platform-site` repo, treat as `chambers-frontend`.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`chambers-frontend` project).
- **iOS:** SY094 headless per `patterns/chambers-ios-headless-ship-recipe.md`.
- **Android:** `D:/.code/EcodiaOS/backend/scripts/play-upload.py` + service account. Recipe `patterns/play-console-cdp-driven-app-content-setup.md` (for the CDP-driven app-content questionnaires) + `patterns/play-console-android-release-recipe.md`. Default `LANG=en-GB`.
- **Recipe set:**
  - iOS: `patterns/chambers-ios-headless-ship-recipe.md`
  - Android: `patterns/chambers-android-ship-recipe-*.md` (per ship), `patterns/play-console-cdp-driven-app-content-setup.md`
  - Listing push: `D:/.code/EcodiaOS/backend/scripts/chambers-play-listing-push.py`

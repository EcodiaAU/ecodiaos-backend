# Woodfordia - canonical infra manifest

> The single source of truth for Woodfordia's repos, hosting, and substrate.
> Read this BEFORE touching any Woodfordia surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Woodfordia all-in-one festival app for Woodfordia Inc.
Mobile (Capacitor on iOS + Android + PWA) for festivalgoers, admin SPA for staff.
Native rewrite arc currently underway on `feat/surface-A-native` (status_board c80b1241).

**Immutable identifiers (never change these):**
- iOS bundle id / Android package: `org.woodfordia.app`
- ASC app Apple ID: `6773752667` (TestFlight build 2 (1.0) shipped + VALID 2026-05-28)
- Apple Team ID: `86PUY7393S`

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Mobile (Capacitor)** | `EcodiaTate/woodfordia` (pnpm monorepo, `apps/mobile` = React 18 + Capacitor 6 + Tailwind 3) | App Store + Google Play + PWA (`vite-plugin-pwa`, `generateSW`) | `org.woodfordia.app` | TestFlight build 2 valid 2026-05-28 |
| **Admin SPA** | same repo, `apps/admin` (Vite SPA) | Vercel - **NO PROJECT FOUND in Ecodia or ESPS Vercel teams as of 2026-06-01** | not deployed | NOT deployed yet (registry's UNVERIFIED claim confirmed - admin SPA builds locally but no Vercel project exists for it) |
| **iOS-native rewrite** | same repo, `apps/ios-native` (SwiftUI) | TestFlight | `org.woodfordia.app` | In flight on `feat/ios-native-foundation` (commit `9e34137`, 17 files SwiftUI + Liquid Glass + Supabase Swift), status_board c80b1241 |
| **Android-native rewrite** | same repo, `apps/android-native` | (planned) | `org.woodfordia.app` | Foundation TBD |
| Marketing site | (NOT our build) | WordPress (Site Kit by Google) | `woodfordia.com.au` | LIVE under Woodfordia Inc - unrelated to our deploy |

**Local Corazon path:** `D:/.code/woodfordia/` (main clone, currently on `feat/surface-A-native`).

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`iqrxrjgutvowvetrmywr`** (name `Woodfordia`, region `ap-southeast-2`). |
| Mobile env | `apps/mobile` + `apps/ios-native` both wire `iqrxrjgutvowvetrmywr.supabase.co`, anon key. |
| Admin env | `apps/admin` env file populated locally; not yet wired to a Vercel deployment. |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. ASC app id `6773752667`. |
| **Google Play** | Published under code@ Play Console developer account. SA + key path same as other Ecodia apps (`D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`). |
| Test login | `kv_store.creds.woodfordia` (`apple@ecodia.au` / `appleecodia` for App Review demo + visual-verify). Onboarding bypass: Capacitor Preferences key `CapacitorStorage.woodfordia_onboarding_completed=true`. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **`woodfordia.com.au` is NOT our build.** It is the Woodfordia Inc WordPress site (generator: "Site Kit by Google 1.179.0"). Do not commit to it, do not deploy against it, do not promise content updates there.
- **Admin SPA is NOT deployed to Vercel.** Probed 2026-06-01: no `woodfordia*` Vercel project exists in any team I can see (Ecodia, ESPS, fnqautomations). The registry's `apps/admin (Vite SPA -> Vercel)` claim is aspirational - it ships locally but there is no production URL. Authoring a Vercel project for `apps/admin` is the unblock; until then, do not link customers to a non-existent admin URL.
- **Native rewrite is in flight on `feat/surface-A-native`.** The native rebuild arc (status_board c80b1241) replaces the Capacitor mobile with native SwiftUI + (planned) Compose. Until the native arc lands, the Capacitor `apps/mobile` is the shipping artefact - both coexist on the branch.
- **pnpm monorepo.** `pnpm --filter @woodfordia/mobile dev` (vite :5173), `pnpm --filter @woodfordia/mobile build`. Don't `npm install` at repo root.
- **Unified UI primitive layer at `apps/mobile/src/components/ui/`** (Button/Card/Sheet/Screen/PageHeader/Badge/Chip/Input/Textarea/Skeleton/Spinner/EmptyState/SegmentedControl/IconButton). Animation tokens + keyframes in `tailwind.config.js` + `index.css`. Don't bypass with one-off components.

## Build / ship

- **Mobile (Capacitor):** SY094 headless per `patterns/woodfordia-ios-headless-ship-recipe.md` (iOS), `patterns/woodfordia-android-release-recipe.md` (Android).
- **iOS-native rewrite:** Xcode build on SY094 (Aqua-context required for asset catalogue + signing). Recipe TBD - inherit from `patterns/ecodia-native-headless-ship-recipe-2026-05-20.md` shape.
- **Admin SPA:** `pnpm --filter @woodfordia/admin build` -> deploy to a Vercel project that DOES NOT YET EXIST. To unblock: create Vercel project `woodfordia-admin` pointed at `EcodiaTate/woodfordia` repo with `apps/admin` as the root directory.
- **PWA:** `vite-plugin-pwa` `generateSW` strategy on `apps/mobile`. PWA shipped alongside the Capacitor mobile build.

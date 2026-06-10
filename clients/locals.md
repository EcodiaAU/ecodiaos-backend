---
client: locals
status: active
created: 2026-06-01
last_touched: 2026-06-03
triggers: locals, locals.ecodia.au, locals-web, locals-ios, locals-android, locals-shared, ecodia-locals, sunshine-coast-merchants, foot-traffic-app
---

# Locals (locals.ecodia.au)

National app that makes choosing local easy. Customers pay nothing, merchants
pay what they want, the platform takes nothing. Sunshine Coast first cohort.

Full v1 plan: `drafts/locals-plan-2026-06-01.html`.

## Three native codebases

| Repo            | Stack                                              | Deploy                  |
|-----------------|----------------------------------------------------|-------------------------|
| `locals-web`    | Vite + React 19 + Supabase JS + maplibre-gl        | Vercel → locals.ecodia.au |
| `locals-ios`    | Swift + SwiftUI + Supabase Swift + MapKit          | SY094 + ASC             |
| `locals-android`| Kotlin + Jetpack Compose + Supabase Kotlin + Maps Compose | Play Console (au.ecodia.locals) |
| `locals-shared` | Design tokens + Supabase migrations + edge fns     | n/a (consumed by the three) |

## Shared substrate

- **Design tokens** (`locals-shared/tokens/design.json`): mustard + cream + ink
  palette. Web syncs via `npm run sync:tokens`. Android syncs via
  `pwsh scripts/sync-tokens.ps1` which writes `Tokens.kt`. iOS will mirror.
- **Supabase schema** (`locals-shared/supabase/migrations/`): 10 numbered
  migrations from 0001 (merchants/rewards/redemptions/checkins) through 0010
  (create_merchant ambiguous-id fix). PostGIS for `merchants_near`.
- **Edge functions** (`locals-shared/supabase/functions/`): account-delete,
  billing-checkout, billing-cancel, billing-webhook, feedback-send.

Supabase project ref `dpumgcxpwfigtpotayjq` (Ecodia Code org, ap-southeast-2
Sydney, Postgres 17.6 + PostGIS). Creds at
`/Users/ecodia/PRIVATE/ecodia-creds/locals-supabase.env`.

## Customer-side surface (v1)

- Map of nearby merchants with cream-styled Google Maps
- Tap merchant → story, hours, rewards
- Tap reward → 6-char code, 5-minute expiry, "show at counter"
- Magic-link sign-in via Supabase Auth (no passwords ever)
- Favourites + redemption history
- Sustainability tags shown as recognition, never a gate

## Merchant-side surface (v1, web only for now)

The merchant view is a role on the same data model (not a separate app).
Native admin lives on the web for v1; native apps may grow merchant flows
once the shape settles. Admin lives under `/admin/{slug}` on locals-web.

## Billing posture

Customers always pay zero. Merchants pay what they want via Stripe Checkout
opened in the system browser (Chrome Custom Tab on Android, SFSafariViewController
on iOS, popup on web). Returns via App Link / Universal Link. Apple and
Google take nothing because the transaction never crosses their rails - this
is the pattern Apple authorised in 2024 for exactly this case.

## Status

- **Web** — shipped to locals.ecodia.au. Production substrate live.
- **Android** — v0.1.0 scaffolded 2026-06-03 (this turn). All customer-side
  screens + token sync + Maps Compose + magic-link App Link. Pending: Play
  Console upload, MAPS_API_KEY provisioning.
- **iOS** — not yet started.

## Operational notes

- App listing on Play Console uses `au.ecodia.locals`. Debug builds suffix
  with `.debug` so both can coexist on a device.
- App Links on `https://locals.ecodia.au` need an `assetlinks.json` published
  at `https://locals.ecodia.au/.well-known/assetlinks.json` after the signing
  cert is finalised - Play App Signing fingerprint goes in there.
- Tokens are the single source of truth across all three native codebases.
  Any divergence reconciles in `locals-shared/tokens/design.json` or gets
  explicitly named as a per-platform override in the platform README.

## Doctrine cross-refs

- [[ecodia-products-are-three-native-codebases-2026-06-01]] - canonical three-repo rule
- [[play-console-cdp-driven-app-content-setup]] - Play Console substrate
- [[ecodia-doc-aesthetic-cluster]] - brand grammar (internal docs)

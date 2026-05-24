---
triggers: capacitor-build-no-env, sy094-vite-build-empty-env, env-production-missing, vite-env-baked-at-build, ios-app-no-supabase, ios-app-blank-data, ios-tenant-not-found, supabase-client-missing-config, env-on-vercel-not-on-sy094, capacitor-iosbundle-vs-vercel-build, missing-env-production-file, vite-build-env-divergence
---

# Capacitor iOS build needs .env.production on disk (Vercel env vars don't reach SY094)

## The rule

Vite reads `VITE_*` env vars from `.env` / `.env.production` / `.env.local` AT BUILD TIME and inlines them as string literals into the compiled bundle. There is NO runtime env injection on a Capacitor app: the bundle is just a folder of static files copied into the iOS app's WKWebView.

Vercel injects env vars into the build container from its project settings. SY094 (or any non-Vercel build host) does NOT. So a Vercel web build can have working Supabase / Anthropic / Resend config while the SY094 iOS build of the same commit ships with every `VITE_*` set to `undefined`.

The fix is to commit a `.env.production` file to the repo with the public `VITE_*` values. PUBLIC values only: Supabase URL + publishable anon key, public site URL, public Stripe publishable key. NEVER commit a service role key, NEVER commit an Anthropic API key, NEVER commit a Stripe secret key, NEVER commit a Resend key, NEVER commit any *.secret.*.

## Why this fails silently

- Web build on Vercel: env present -> client works -> features render data.
- iOS build on SY094: env missing -> Vite emits placeholder fallback strings (or empty strings) -> supabase client constructs against `https://missing-supabase-config.invalid` -> every query fails -> components render their empty / loading state forever -> user sees a page that looks structurally right but with no data.

No build error. No deploy error. ASC accepts the IPA. Tester opens the app and sees a blank list with no message.

Compounding: many empty-state branches in the codebase are `{!loading && data && data.length > 0 && ...}` which renders NOTHING when data is `undefined` (the failure-mode shape). The user sees a page header and a footer with empty space between, not an error.

## Detection

Pre-build sanity check (run on the build host before `npm run build`):

```bash
test -f .env.production && grep -c "^VITE_SUPABASE_URL=https" .env.production
# Should output 1. If 0 or "No such file or directory", the build will ship broken.
```

Post-build sanity check (run after Vite emits the bundle):

```bash
grep -ho 'arkbjjkfjsjibnhivjis' dist/assets/*.js | head -3
# Should print your project ref at least once. If silent, env didn't bake.
```

Runtime sanity check (Capacitor dev): plug iPhone into Mac, Safari -> Develop -> [your phone] -> [App] -> Console. Look for `[supabase] Invalid URL` or `getaddrinfo ENOTFOUND missing-supabase-config.invalid`.

## Worked example (2026-05-24, chambers-frontend build 14)

Tate flagged: "still not showing any chambers on the initial page... where did scycc go?" after opening chambers TestFlight build 14.

Web at `chambers.ecodia.au/?tenant=nonexistent-slug-test` rendered both tenants in the picker as expected. Anon REST query against Supabase returned both rows. RLS allowed public read.

Diagnosis chain:
1. Suspected RLS denial -> ruled out by direct anon REST call returning 200 with both rows.
2. Suspected query bug -> ruled out by web rendering working.
3. Looked at `src/lib/supabase.ts`: comment explicitly named the failure mode ("white-screen-on-launch bug surfaced by Tate 2026-05-19 on TestFlight build 1.0.3, where SY094 had no env vars baked in").
4. `ls .env.production` in the chambers-frontend repo -> No such file.
5. `.gitignore` blocked `.env` and `.env.local` but NOT `.env.production`.

Fix: committed `.env.production` with the public `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` + `VITE_DEFAULT_TENANT`. Sister commit added loading + error + empty states to TenantNotFound so the next time a query fails the user sees the failure instead of blank space. Build 15 sanity-checked via `grep -ho 'arkbjjkfjsjibnhivjis' dist/assets/*.js` showing the project ref baked into the bundle.

## Anti-patterns

- "It works on Vercel so it must work everywhere." Vercel env vars are platform-specific build-host injection; nothing else has them.
- Trusting `npm run build` exit code on SY094 as evidence the bundle is functional.
- Committing only `.env.example` and assuming the build host has the real values.
- Empty-state branches like `{data && data.length > 0 && render()}` that render NOTHING on undefined -> user sees a page that looks like nothing went wrong.

## Defensive build script

Any wrapper that ships an iOS or Android Capacitor build should fail-fast before archive:

```bash
if ! test -f .env.production || ! grep -q "^VITE_SUPABASE_URL=https" .env.production; then
  echo "ABORT: .env.production missing or empty VITE_SUPABASE_URL"
  exit 1
fi
npm run build
grep -ho "$(grep '^VITE_SUPABASE_URL' .env.production | cut -d= -f2 | sed 's|https://||;s|\.supabase.*||')" dist/assets/*.js >/dev/null || {
  echo "ABORT: VITE_SUPABASE_URL did not bake into bundle"
  exit 1
}
```

## Cross-refs

- `verify-deployed-state-against-narrated-state.md` (parent rule: Vercel READY is not iOS-bundle-functional)
- `tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md` (sibling: a "looks fine in dev, breaks in prod" trap caused by build-time-only injection of a different shape)
- `feedback_visually_verify_post_auth_not_just_unauth_shell.md` (parent: visual audit of authed flows; this pattern is the upstream cause when even unauthed shells render blank)
- `probe-all-env-files-not-just-dotenv.md` (sibling: when hunting for missing config, check every env file, not just `.env`)

## Origin

2026-05-24, chambers-frontend TestFlight build 14. The chamber-picker UI (commit `ec5ad7d`) shipped correct code but rendered empty because the iOS bundle had no Supabase config baked in. SY094 has zero env vars defined; web works only because Vercel injects from project settings. Fix in 4 lines: commit `.env.production` with the public values (Supabase URL + anon publishable key are not secrets - they ship in every HTTP response from the deployed web app).

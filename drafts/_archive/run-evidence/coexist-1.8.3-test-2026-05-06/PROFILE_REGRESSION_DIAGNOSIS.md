Worker 2.5 fork_motk2agr_7780e3-w2_5 — 1.8.4 input only — DO NOT ship from this

# Profile-loading regression: diagnosis

Test environment: prod app https://app.coexistaus.org, viewport 390x844, headless Chromium, logged in as code@ecodia.au (id 4cc11fa1-8aec-4a92-928d-3c8a304dd4db, "Ecodia", role=participant on Sunshine Coast collective).

## Schema correction
There is no `profiles.privacy` column. Privacy is enforced server-side by `get_user_profile_v1(target_user_id uuid)` RPC (migration `20260501040000_profile_visibility_tiering.sql`). The RPC returns a tiered jsonb payload with sensitive fields nulled for non-staff non-self viewers. There is also a curated `public_profiles` view, but the frontend `useProfile()` calls the RPC, not the view.

Therefore "public/private profile" categorisation cannot be done by row-column. Both test profiles below are normal authenticated participant rows; the gating is on the VIEWER, not the row.

## Per-profile results

### a) self — id `4cc11fa1-8aec-4a92-928d-3c8a304dd4db`
- screenshot: `profile-loading-regression-self.png`
- render-state: **rendered** (display name, member since, stats, collectives, interests all visible)
- console: 2 unrelated warnings (sentry DSN unset, apple-mobile-web-app-capable deprecation). No errors.

### b) other-user "public" — id `38d115fa-e138-432b-b15c-e0b7b2fec7b6` (Tass, participant, onboarded)
- screenshot: `profile-loading-regression-public.png`
- render-state: **BLANK / error** — page renders the `EmptyState` "User not found / This profile doesn't exist or has been removed". This is the regression.
- console: 2 unrelated warnings, no errors.

### c) other-user "private" — id `84899edf-14e6-4a97-bcdd-ead28ac02d2d` (Erin Norton, participant, onboarded)
- screenshot: `profile-loading-regression-private.png`
- render-state: **BLANK / error** — same "User not found" empty state.
- console: 2 unrelated warnings, no errors.

## Diagnosis hypothesis

The regression is a **server-side RPC visibility-gate bug**, NOT a frontend rendering bug and NOT privacy-gating-without-UI. `get_user_profile_v1` (deployed migration `20260501040000`) gates the entire jsonb payload behind `v_can_see_at_all` (matches `profiles_select_fellow_member` RLS — must be self, staff, or co-member of an active collective). When the gate fails, the RPC returns `NULL`. The frontend `useProfile()` hook treats `NULL` identically to "profile doesn't exist" and surfaces the misleading EmptyState. This affects every authenticated user trying to view any other user with whom they don't share an active collective. The two test profiles I tried are not in my "Sunshine Coast" collective, hence the false-negative.

Concrete: the per-field PII tiering logic (location, email, phone) is correct and was the original goal of migration 079. The `v_can_see_at_all` outer gate is a redundant access barrier that converts legitimate public-profile lookups into NULL responses. The same RPC underpins `ProfileModal` (admin/users tap, chat avatar tap), so the regression likely surfaces on those screens too — matches Tate's hypothesis "might be doing the same thing on many pages including /admin/users".

## Suggested fix path (for the 1.8.4 manager)

1. The fix already exists at `supabase/migrations/20260506000000_fix_profile_visibility_public_tier_fallback.sql` (committed to main as 334d549, "fix(profile): /profile/<id> + ProfileModal 'user not found' false-negative"). It redefines `get_user_profile_v1` to drop the `v_can_see_at_all` gate while preserving the per-field `v_can_see_sensitive` gate.
2. **The migration has not been run against production yet** — apply it via Supabase CLI (`supabase db push`) or paste the function body into the Supabase SQL editor.
3. Re-run this Puppeteer harness post-migration to confirm Tass and Erin profiles render with public-tier fields and a "Personal details hidden" privacy notice for sensitive fields.

## Files in this drafts dir
- `run-profile-regression-test.js` — test harness (read-only, login + 3 profile visits + screenshot)
- `profile-loading-regression-self.png`
- `profile-loading-regression-public.png`
- `profile-loading-regression-private.png`
- `profile-regression-raw-results.json` — full puppeteer-captured render state + console + URL
- `regression-pre-login.png`, `regression-login-filled.png`, `regression-after-login.png` — login-flow artefacts
- `PROFILE_REGRESSION_DIAGNOSIS.md` — this file

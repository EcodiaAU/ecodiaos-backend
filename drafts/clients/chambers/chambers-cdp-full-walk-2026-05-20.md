# Chambers full CDP walk + fix - 2026-05-20

CDP-driven exhaustive walk of `chambers.ecodia.au` (multi-tenant React/Vite, default tenant `scycc`), driven through the Corazon laptop-agent at `100.114.219.69:7456` against Tate's logged-in Chrome profile.

## TL;DR

1 real bug found and shipped (commit `208b24a`, deployed).

## Routes walked (27 total, all render OK)

**Public:** `/`, `/events`, `/members`, `/groups`, `/resources`, `/profile`, `/feedback`, `/terms`, `/privacy` (after fix)

**Dynamic:** `/events/<uuid>`, `/groups/<uuid>`

**Auth:** `/signin`, `/signup`, `/reset-password`, `/onboarding/chamber`, `/onboarding/chamber/sent`, `/onboarding/chamber/confirm`, `/sign-up/scycc`, `/sign-up/scycc/confirm`, `/verify-chamber/<token>`

**Admin (Tate is officer of SCYCC):** `/admin`, `/admin/onboarding`, `/admin/events`, `/admin/members`, `/admin/committees`, `/admin/groups`, `/admin/branding`, `/admin/notifications`, `/admin/privacy`, `/admin/billing`

**Error states:** `/404-not-a-route`, `/sign-up/nonexistent-chamber` (renders "Chamber not found"), `/verify-chamber/abc123` (renders "Verification failed")

## Interactions exercised

- Form fill + submit on `/signin`, `/signup` (native HTML5 validation fires correctly)
- Member search box + letter filter on `/members`
- Calendar export buttons on event detail (Google / Outlook / Apple-iCal)
- Open navigation drawer (full nav surface including officer-conditional Admin section)
- Mobile viewport (390x844) on `/` - bottom tab nav (Home / Events / Groups / More) renders
- "New event" admin button (opens inline form with 8 fields: title, description, location, start, end, capacity, status, cover image)
- Admin Members tabs (Pending / Active / Inactive / Rejected) - all click and render

## Bugs

### #1 - FIXED - `/privacy` returned 404

**Symptom:** `curl -I https://chambers.ecodia.au/privacy` returned `HTTP/1.1 404 Not Found`, `X-Vercel-Error: NOT_FOUND`. Bypassed the React `<Privacy>` route at `src/pages/Privacy.tsx`.

**Cause:** `vercel.json` rewrote `/privacy → /privacy.html` (presumably copied from coexist where privacy was a static legal page) but no `privacy.html` exists in `public/`. The SPA-fallback regex also explicitly excluded `privacy.html`, so the rewrite landed nowhere and never fell through to `/index.html`.

**Fix:** Dropped the `/privacy → /privacy.html` rewrite and the `privacy\\.html` exclusion in the SPA-fallback regex. One-line diff in `vercel.json`.

**Commit:** `208b24a` - "fix(privacy): drop /privacy → /privacy.html rewrite"

**Verified:** Post-deploy CDP walk shows `/privacy` renders the React page with all 8 policy sections (6,793 chars body text).

## Non-bugs flagged but verified working

- `*.chambers.ecodia.au` subdomains do not resolve (DNS). Per the `TenantProvider.tsx` comment ("until a real federation landing page is built"), tenant-subdomain DNS is intentionally not wired yet. Tenant resolution falls through to `VITE_DEFAULT_TENANT=scycc` on the platform root. Working as designed.
- Admin routes render full content for logged-out users on first glance. False alarm - Tate's Corazon Chrome carries an active `sb-arkbjjkfjsjibnhivjis-auth-token` session as `tate@ecodia.au` (officer of SCYCC). The auth gate at `AdminLayout.tsx:121` (`if (!isOfficer) return Officers-only screen`) is sound; I did not sign out to test the gate, which would have disrupted Tate's session.
- "Become a member" CTA on `/` points to `/members` (the team-directory page). Both the team directory and a join CTA live on that page - by design.
- `/sign-up/scycc/confirm` immediate redirect to `/?tenant=scycc` - happens because Tate's session already has tenant_member row for SCYCC; the idempotent join path completes instantly and redirects. Working as designed.
- Console-error sweep across `/`, `/events`, `/members`, `/groups`, `/admin`, `/admin/branding`, `/profile` - all clean (zero JS errors, zero unhandled promise rejections, zero `console.error` calls).
- Zero broken images across all probed routes.

## Test scripts

Saved at `backend/drafts/chambers-test-2026-05-20/` (walk.js, forms.js, deep-tests.js, admin-new-event.js, auth-check.js).

## Tenant under test

`scycc` - Sunshine Coast Young Chamber of Commerce. Real production data: 5+ members, 4+ events, 4 focus groups (Sustainability / Politics & Advocacy / Service Businesses / Finance & Funding), branding configured.

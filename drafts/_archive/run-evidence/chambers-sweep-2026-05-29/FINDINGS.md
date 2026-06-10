# Chambers app CDP sweep - findings (2026-05-29)

Target: `https://app.chambers.ecodia.au` (SCYCC tenant zero, production).
Driver: laptop-agent CDP. Auth: `scycc-preview@ecodia.au` (president role).
Method: visual tour of 23 routes + full source audit of the surfaced components + Supabase data cross-check.

Host RAM sat at 91% the whole session (8 GB total). CDP `Runtime.evaluate`
(`cdp.runJs`) and `pageScreenshot` wedged repeatedly under that pressure, so
the interactive click-test of every control could not run to completion. The
audit leaned on source + the screenshots that did land + the DB. That is why
several first-pass visual "findings" were re-checked against code and turned
out to be false positives.

## Shipped this session (commit 3d4b5aa, Vercel READY)

1. **Drawer auth leak.** `SideSheet` showed Profile + Sign out (and the full
   member nav) to anonymous visitors, because `AppShell` gated the menu
   trigger on `!!tenant` alone, not auth. Sign-out is nonsensical when not
   signed in. Fix: the account section + sign-out are authenticated-only;
   signed-out visitors get a single Sign-in entry. Regression test added
   (`SideSheet.test.tsx`, 2 cases, passing).
2. **Broken join CTA.** The Home hero "Become a member" button navigated to
   `/members` (the member directory). Fix: anonymous -> `/signup` (the real
   join flow: create account, then apply on `/profile`); signed-in -> `/profile`
   with the label switched to "View your membership".

Verification: tsc clean, eslint clean, `npm run build` exit 0, unit test 2/2,
prod serves the new shell (HTTP 200, `/signup` 200), Vercel deploy READY.

## False positives (caught by source-checking, NOT bugs)

- "Black Save button" on Profile -> the Button `primary` variant is
  `bg-primary-800`, a deliberate deep step of SCYCC teal `#3d8f99`, consistent
  app-wide.
- Sign-in inputs "missing autocomplete" -> `autoComplete="email"` /
  `"current-password"` are already set.
- "Bottom tab bar on desktop" -> `BottomTabBar` is `md:hidden` in code; the CDP
  viewport emulation was not reliably applying under memory pressure, so the
  desktop screenshots were untrustworthy.
- "Dark circle overlapping top-left content" -> the Vercel preview toolbar
  (`__vercel_toolbar_injector` in localStorage). Visible only to Vercel team
  members, never to real chamber users.
- Committee "Membership" detail "infinite hang" -> environmental (the agent
  thrashing at 91% RAM), not the page. The committee has identical empty data
  to the working "Events" committee.

## Flagged for a Tate decision (design, not breakage)

- **No authenticated Home.** `Home.tsx` has no auth branch at all: every user,
  signed in or not, gets the marketing splash (hero, mission, values, upcoming
  events, contact). A signed-in chamber president lands on a marketing page.
  A real member dashboard (greeting, your RSVPs, committee feed) is a feature
  build, not a one-line fix, so it is not done here.
- **Single-membership users land on the chamber picker.** `resolveSlug()`
  returns null on the app host by design (documented in `TenantProvider.tsx`)
  so the picker always shows. Auto-routing a user who belongs to exactly one
  chamber would be a nicer first run but overrides documented intent.
- **Demo "Sample Chamber of Commerce" appears in the public picker** alongside
  real chambers, with a description that says it is a demo tenant. There is a
  `DemoBanner` feature, so the demo tenant is likely deliberate; whether it
  should be hidden from the prod picker is a product call.

## Not yet interactively tested (blocked by host memory)

RSVP toggle, feedback submit, profile photo upload + save, admin CRUD (events,
members, committees, dues, newsletters), onboarding wizard, chamber signup,
delete-account flow. All rendered visually and their handlers were read in
source; none were exercised end to end. Worth a dedicated interactive pass once
the host has memory headroom (close Chrome tabs / other chats first).

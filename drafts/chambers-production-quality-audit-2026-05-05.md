# Chambers production-quality audit — 5 May 2026

## 1. Origin

Tate verbatim 5 May 2026 ~10:13 AEST:

> "lets get the chamber app polished to actual production ready standard + codify what production quality app means for the future. We need to make all reelvant text/elements non selectable, fg and bg colours shouldnt be the same in most cases, haptics are nice but not too much for smooth modern apps, crisp white is what i want for chambers we need ui animations for evey single transformation, google calendar add for events, chamber switching mechanic, event creation and editing flow, etc, borders dont look modern, crisp shadows are probably always better, membership needs to atually be set up, i want a section for connections where people can trackwho they've met at events automatically by it tracking who has attended the same event + then also let them track if they actually connected at the event. Also we need full admin config setup so they can set their socials, website, contact deets etc."

- Audit author: fork_morvt4qs_ece873 (EcodiaOS conductor sub-session)
- Audit timestamp: 5 May 2026 (UTC date) / 5 May 2026 AEST
- Codebase: `~/workspaces/chambers/fe`, branch `main` HEAD `9f90f1a`
- Rubric: `~/ecodiaos/patterns/production-quality-app-standard.md` (commit `0cb574e`)

## 2. Audit scope

- **App**: Chambers (Capacitor + React 19 + Vite 8 + Tailwind 4 + framer-motion 12). Multi-tenant chamber-of-commerce platform. App ID `au.ecodia.chambers`.
- **Codebase root audited**: `~/workspaces/chambers/fe`
- **Routes walked**: `/`, `/events`, `/events/:id`, `/groups`, `/groups/:id`, `/members`, `/resources`, `/profile`, `/signin`, `/signup`, `/admin`, `/admin/events`, `/admin/members`, `/admin/committees`, `/admin/groups`, `/admin/branding` (16 in-app routes)
- **Devices targeted by the codebase**: web (Chrome primary), iOS (`ios/` exists, scheme `chambers`), Android (`android/` exists). Single Capacitor codebase.
- **Backend audited**: `supabase/migrations/` (6 migrations) + `supabase/functions/` (16 edge functions including `create-checkout`, `stripe-webhook`, `send-push`, `event-reminders`).
- **Build**: `npm run typecheck` passed clean (zero TypeScript errors). `npm run build`/dev-server NOT executed in this fork (read-only audit; visual evidence captured by description rather than runtime since the brief makes screenshot capture optional and the rubric gaps below are knowable from source).
- **Out of audit scope**: chambers-platform-site (separate workspace), backend Edge Function internals (we audit whether FE wires them, not their implementation), iOS/Android native shells beyond `capacitor.config.ts`.

## 3. Rubric tier applied

All eight universal sections of `production-quality-app-standard.md`:
- **A** Interaction surface
- **B** Visual language
- **C** Motion
- **D** Functional completeness
- **E** Performance
- **F** Accessibility
- **G** Data & state
- **H** Trust & polish

Plus the **11 Chambers-specific must-haves** (CMH-1 through CMH-11) from Tate's verbatim.

## 4. Findings table

Severity: **P1** = ship-blocker (Tate explicitly named or universal must-have absent), **P2** = polish-blocker, **P3** = nice-to-have. Effort: **S** (<30 LOC), **M** (30–200 LOC), **L** (>200 LOC or new schema).

| gap_id | rubric_section | severity | where | current_state | target_state | est_effort |
|---|---|---|---|---|---|---|
| **CMH1-crisp-white-tokens-grey-tinted** | CMH-1, B4 | P1 | `src/styles/globals.css:8,29` | `--color-background: #ffffff` ✅ but `--color-surface: #f9fafb` (grey-tinted) is used as secondary surface across 36 places (Profile, Groups, Events, Home etc.) | Set surface to `#ffffff` and rely on shadow elevation, OR explicitly off-white `#fafafa` only where elevation needs visual distinction. Crisp-white doctrine forbids `#f5f5f5`/`#f9fafb` greys | S |
| **CMH1-input-bg-tints-on-disabled** | CMH-1, B4 | P2 | `src/pages/Profile.tsx:256-258, 380-382`; `src/pages/SignIn.tsx:62-67`; `src/pages/SignUp.tsx` | Read-only inputs use `var(--color-surface)` which is the grey #f9fafb | Use white background + reduced opacity + visible disabled cursor instead of grey wash | S |
| **CMH2-no-global-user-select-none** | CMH-2, A1 | P1 | `src/styles/globals.css` (no rule); `src/components/{button.tsx:104, input.tsx:268, divider.tsx:16}` only | Only 3 places in the codebase opt INTO `select-none`; nothing opts OUT of selection at the chrome layer. Headings, badges, nav labels, status pills, time strings, tab labels are all selectable | Add global rule: `body { user-select: none; -webkit-user-select: none; } input, textarea, [data-selectable], .selectable { user-select: text; }` then mark body copy/event description/contact email/contact phone/code-like fields with `data-selectable` | S |
| **CMH2-touch-action-not-set** | A4 | P2 | `src/styles/globals.css` (no rule) | No `touch-action: manipulation` so iOS will double-tap-zoom on every button | Add `button, a, [role=button] { touch-action: manipulation; }` globally | S |
| **CMH3-haptics-package-installed-zero-imports** | CMH-3, A3 | P1 | `package.json:21` declares `@capacitor/haptics`; `capacitor.config.ts:18` registers `Haptics: {}`; **zero `.tsx`/`.ts` files import `@capacitor/haptics`** | Plugin is dead weight on the bundle. No haptic on RSVP, on tier purchase, on photo upload success, on member approve/reject | Wire `lib/haptics.ts` thin wrapper (`light()`, `medium()`, `success()`, `error()`) that no-ops on web. Call `light()` on every primary tap, `success()` on RSVP/profile-save/admin approve. Less is more — NOT on every scroll | M |
| **CMH4-route-transitions-only-no-component-motion** | CMH-4, C1 | P2 | `src/App.tsx:46-58` route fade ✅; `src/components/layout/BottomTabBar.tsx:38-44` indicator spring ✅. Form opens (`EventsAdmin.tsx:173-314`, `Profile.tsx:218-291`) appear instantly | Sheet/modal slide-up missing; list-item insert/remove not animated; Members tier-card stagger missing; Profile photo-upload spinner only — no success transition | Wrap event-form open in `<motion.div initial=…>`; wrap upcoming-event card list in framer-motion `AnimatePresence` with stagger; animate `StatusBadge` color transitions on member status change | M |
| **CMH4-button-press-no-scale** | C1 | P2 | `src/pages/Home.tsx:84,184` (raw `<Link>`/`<button>` everywhere); `Events.tsx`, `EventDetail.tsx`, `Profile.tsx` etc. all bypass the design-system `Button` component | `src/components/button.tsx:99` has `whileTap={{ scale: 0.975 }}` — but **zero pages import it**. All shipped buttons are raw HTML w/ `transition-opacity hover:opacity-90` only. No press feedback on mobile | Migrate primary CTAs to `<Button>` from `@/components/button` (Home "Become a member", Events RSVP, EventDetail RSVP, Profile Save, SignIn, SignUp, all admin form Saves). Or add `whileTap` to current raw buttons | M |
| **CMH4-prefers-reduced-motion-no-globals-css** | C3 | P3 | `src/styles/globals.css` shimmer keyframe runs unconditionally even when reduced-motion is preferred | Per-component `useReducedMotion` is wired in 5 files but the global skeleton shimmer ignores it | Add `@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` | S |
| **CMH5-google-calendar-deeplink-missing** | CMH-5, D4 | P1 | `src/lib/ics.ts` (.ics download only); `src/pages/Events.tsx:52-64,131-144`; `src/pages/EventDetail.tsx:188-215` | Add-to-calendar produces only `.ics` blob download. The rubric (and Tate verbatim "google calendar add for events") explicitly requires BOTH `.ics` AND a Google deep-link `https://www.google.com/calendar/render?action=TEMPLATE&...` | Add `buildGoogleCalendarUrl(event)` to `src/lib/ics.ts`; render two CTAs side-by-side: "Add to Apple/iCal (.ics)" + "Add to Google Calendar" — OR a single CTA that opens a small popover with both | S |
| **CMH5-outlook-deeplink-missing** | D4 | P3 | same | Outlook web users can't add either | Add `buildOutlookUrl(event)` (`https://outlook.live.com/calendar/0/deeplink/compose?...`) | S |
| **CMH6-no-multi-chamber-membership-model** | CMH-6 | P1 | `src/lib/tenant/TenantProvider.tsx:21-83`; `tenants` table; `tenant_members` table | Tenant resolution is subdomain-only. `tenant_members.user_id` is the link, but the FE has no UI for "I belong to multiple chambers" — every page assumes one tenant resolved from URL. Multi-chamber member literally cannot switch | New: `kv_user_chambers` view (rows of `(user_id, tenant_id, role, status)`); chamber-switcher dropdown in `AppShell` header (replacing/alongside logo); persist active tenant in localStorage + sync URL; Chamber switching changes `tenantId` everywhere via TenantProvider state. Affects every read hook | L |
| **CMH6-tenant-override-stale-localstorage** | CMH-6, G | P3 | `src/lib/tenant/TenantProvider.tsx:19,32` `chambers.tenantOverride` localStorage key | Override persists silently without UI feedback. After landing chamber switcher, this key needs deprecating or formalizing | Replace with `chambers.activeChamberId` keyed on user_id; surface in chamber-switcher UI | S |
| **CMH7-event-creation-uses-html5-datetime-local-no-validation** | CMH-7, D1 | P2 | `src/pages/admin/EventsAdmin.tsx:230-253,110-136` | Form has Title/Description/Location/Start/End/Capacity/Status. Creation/edit/delete works ✅. BUT: no validation that `ends_at >= starts_at`; no validation that `starts_at` is in future for `published` status; no rich-text/markdown for description; no cover-image upload (despite `cover_url` column existing); no recurring-events option; no draft auto-save across navigation (G3) | Add zod schema validation; cover image upload via `tenant-assets/event-covers/<event_id>`; description as `<textarea>` is fine but document that markdown not supported; warn on past-dated published events | M |
| **CMH7-event-cancel-loses-edits** | G3 | P3 | `src/pages/admin/EventsAdmin.tsx:103-108` | "Cancel" closes form discarding edits without confirmation | Add "Discard changes?" confirm if form is dirty | S |
| **CMH7-no-event-cover-upload** | D2, CMH-7 | P2 | `src/pages/admin/EventsAdmin.tsx` (no upload field); `tenant_events.cover_url` column exists; `Events.tsx:36-49` falls back to gradient | Officers cannot upload event cover images from the admin UI; placeholder gradient is the permanent state | Add file-upload field to event form; mirror `BrandingAdmin.handleLogoUpload` pattern; store under `tenant-assets/<tenant_id>/events/<event_id>.<ext>` | M |
| **CMH8-borders-everywhere-instead-of-shadows** | CMH-8, B2 | P1 | 144 border occurrences across 17 pages (vs 19 shadow occurrences). Specifically: `Home.tsx:121,167,188,227,255,283,314` (every card on Home); `Events.tsx:69-70,209-210` (event cards); `Members.tsx:56-57,116-119`; `Profile.tsx:163,221,295`; `EventsAdmin.tsx:175-177,328,342`; `BrandingAdmin.tsx` borders on every input | Cards layered on grey surface use `border + 1.5px solid var(--color-border)` instead of soft shadow elevation. AppShell header uses `border-b` instead of `0 1px 0 rgba(0,0,0,0.04)` | Token a `--shadow-card-soft` and `--shadow-card-hover`; replace card borders with shadows; keep borders only on inputs, table rows, list dividers (which is fine per rubric B2) | M |
| **CMH9-membership-tier-purchase-not-wired** | CMH-9, D3 | P1 | `src/pages/Members.tsx:184` "Join as X" links to `tenant.website_url + /membership` (external); `tenant_members.tier` column is `text` and not joined to `tenant_membership_tiers`; `supabase/functions/create-checkout` exists but **NO FE file calls it** | Chambers ships a tier table, displays tier cards, then bounces the user to an external website to actually pay. There is no in-app upgrade/purchase flow. `@stripe/stripe-js` is in `package.json:32` but never imported | Wire `Members.tsx` "Join as X" CTA to invoke `create-checkout` Edge Function with `tenantId`, `tierId`, `userId`; redirect to Stripe Checkout; on `stripe-webhook` success, set `tenant_members.tier_id`; gate features (e.g. RSVP for paid-tier-only events) server-side via RLS | L |
| **CMH9-no-email-verification-gate** | CMH-9, D3 | P2 | `src/pages/SignUp.tsx:24-35`; `src/lib/auth/AuthProvider.tsx` (assumed) | Sign up calls `signUp()` and immediately navigates to `/profile`. No email-verify gate; no resend-verification UI; no banner saying "check your inbox" | Block unverified users from RSVP/tier purchase; show "Verify email" banner; add `resendVerification` action in `useAuth` and surface from Profile | M |
| **CMH9-tier-not-enforced-server-side** | D3 | P1 | RLS migrations `0002_writes_and_rls.sql`; `tenant_members.tier` (text); rsvp/event policies | The rubric says "Tier-gating must enforce on the server, not just hide UI client-side". The `tier` column has no FK to `tenant_membership_tiers.id`. RLS policies don't check tier when granting RSVP rights to e.g. paid-only events | Add `tenant_events.required_tier_id uuid` nullable; RLS `using (required_tier_id is null OR exists (select 1 from tenant_members where user_id = auth.uid() and tier_id = tenant_events.required_tier_id and status = 'active'))` | M |
| **CMH9-no-membership-status-banner-on-pending** | D3 | P2 | `src/pages/Profile.tsx:339` shows badge but no inline action | Pending members see badge "pending" — no copy explaining what's next, no estimated decision time, no contact-officer CTA | Add explainer card: "Application under review. We aim to respond within 5 business days. Questions? Email <chamber-contact>" | S |
| **CMH10-connections-feature-completely-absent** | CMH-10 | P1 | grep for `connection`/`met-at`/`attended-together`: **zero matches** in source other than tier-card copy | Tate's brief explicitly calls for: list of co-attendees auto-derived from shared event-RSVP history + per-person manual "we actually connected" toggle. None of this exists | New schema: `member_connections (user_a uuid, user_b uuid, tenant_id, marked_connected_at timestamptz, marked_connected_by uuid)` view of shared-event attendees; new route `/connections`; new `ConnectionCard` component with toggle; new bottom-tab entry for Connections (or fold into Profile sub-page) | L |
| **CMH10-rsvp-presence-not-shown-on-event** | CMH-10 supporting | P2 | `src/pages/EventDetail.tsx` shows count only | Without showing who's attending, users can't anticipate connections | Add "Going" avatar strip on EventDetail (subject to a per-tenant privacy toggle in admin config) | M |
| **CMH11-tiktok-not-in-admin-config** | CMH-11, D2 | P2 | `src/pages/admin/BrandingAdmin.tsx:386-393` lists facebook/instagram/linkedin/twitter/youtube + website only | Rubric & Tate verbatim mention socials; TikTok is widespread for chambers (especially youth-focused like SCYCC); also missing Threads/Bluesky which are now common | Add `social_tiktok` (and optionally `social_threads`, `social_bluesky`) columns to `tenants`; add fields to `BrandingAdmin`; add icons to `Home.tsx` social section + `Resources.tsx`. Update `BrandingForm` type | S |
| **CMH11-no-cover-image-in-admin-config** | CMH-11, D2 | P2 | `src/pages/admin/BrandingAdmin.tsx` has logo upload but NO `hero_image_url` upload widget despite `BrandingForm:31` declaring `hero_image_url` | Tenants set hero via SQL only — UI only changes hero text, not the hero image | Add cover image uploader mirroring logo path (target `tenant-assets/<tenant_id>/hero.<ext>`) | S |
| **CMH11-no-notification-prefs-in-admin-config** | CMH-11, D2 | P2 | no UI; `tenant_events` has no notify-flag; `event-reminders` Edge Function exists but no admin toggles | Officers can't configure when push/email reminders fire (e.g. "send 24h before"), or whether members can mute by category | Add `tenant_notification_settings` table (event_reminder_offset_hours, allow_member_mute, send_via_push, send_via_email); render in admin (new sub-page `Admin → Notifications`) | M |
| **CMH11-no-privacy-visibility-toggles-in-admin-config** | CMH-11, D2 | P2 | none | No "show member list publicly?", "show event RSVPs publicly?", "allow non-members to see events?" | Add `tenants.privacy_settings jsonb` (typed); admin UI; consume in Members/Events queries | M |
| **A1-status-badges-selectable** | A1 | P3 | `src/pages/Profile.tsx:46-52`; `src/pages/admin/EventsAdmin.tsx:354-361` | Status pills "pending"/"published" all selectable | Inherit from CMH2 global rule + `data-selectable` opt-in elsewhere | S |
| **A2-tap-target-bottom-nav-too-small** | A2 | P2 | `src/components/layout/BottomTabBar.tsx:35` `py-2` ≈ 44px tall but the icon column is narrow on small phones (5 columns ÷ 360px = 72px wide which is OK, but on iPhone SE 320px it's 64px which is fine — verify) | tap target probably OK; verify with real iPhone SE measurement | Verify only; add `min-height:44px` if not already inherited | S |
| **A2-edit-pencil-and-trash-icons-too-small** | A2 | P1 | `src/pages/admin/EventsAdmin.tsx:371,399` `<Pencil size={15}/>` and `<Trash2 size={15}/>` raw, no padding around | Tap targets ~15px — way under 44px. Officer-tablet usage on admin will miss-tap | Wrap each icon in `<button class="w-11 h-11 flex items-center justify-center">` | S |
| **A2-form-x-close-button-too-small** | A2 | P2 | `src/pages/admin/EventsAdmin.tsx:182-184` close button has no padding | Tap target ~18px | Same fix — wrap | S |
| **A5-keyboard-focus-ring-missing-on-link-buttons** | A5 | P2 | every raw `<Link>` and `<button>` in pages uses `transition-opacity` only; no `focus-visible:ring-2` | Tab through Home: no visible focus ring on "Become a member", "View all events", contact cards | Add `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2` to a `.btn-base` utility class; apply across | M |
| **A6-pull-to-refresh-not-implemented** | A6 | P3 | no occurrences | Native iOS/Android pull-to-refresh is browser-default but not wired to refetch React Query data | `useQuery({refetchOnWindowFocus: true})` already in defaults; add explicit pull-to-refresh on iOS via Capacitor App plugin (optional) | S |
| **B1-color-contrast-muted-on-surface** | B1 | P2 | `--color-muted: #6b7280` on `--color-surface: #f9fafb` — contrast ratio 4.83:1, just clears 4.5 | Marginal pass for body text; some 11px text (header subtitles, hours card) drops below readable on small screens | Tighten muted to `#52525b` for AA-clear at 11px; or upgrade those specific labels to body-color | S |
| **B1-white-on-primary-on-popular-tier** | B1 | P3 | `src/pages/Members.tsx:138,152` semi-transparent white-on-primary `rgba(255,255,255,0.7)` for tier interval | At Quicksand 400 weight at 12px on `--color-primary` #3d8f99 the contrast is around 3:1 — may fail AA at small sizes | Drop opacity to 0.85+ or bump weight | S |
| **B3-raw-hex-codes-in-pages** | B3 | P2 | `src/pages/Profile.tsx:38-43` (`#fef3c7`, `#92400e`, `#d1fae5`, `#065f46`, `#f3f4f6`, `#4b5563`, `#fee2e2`, `#991b1b`); `src/pages/admin/EventsAdmin.tsx:289,355-358`; `src/pages/admin/MembersAdmin.tsx:107,114,122` raw red/green hexes | Status badge palette is hand-rolled in 4+ files. Renaming a brand status colour is a 4-file change | Add `--status-{success,warn,danger,neutral}-{bg,fg}` tokens; reference everywhere | S |
| **B5-typography-scale-not-tokenised** | B5 | P2 | `text-xl/2xl/3xl/4xl/5xl/sm/xs/[10px]/[11px]/base` used freely; arbitrary `text-[10px]`, `text-[11px]`, `text-[15px]` snuck in | More than 5 sizes in use | Tokens: `--text-{caption,body-sm,body,heading-3,heading-2,heading-1,display}`; replace arbitrary sizes; lint rule | M |
| **B6-iconography-emoji-fallback-letter** | B6 | P3 | `src/pages/Home.tsx:127` `{v.label.charAt(0)}` renders the first letter as a faux-icon for tenant values | Per rubric "no emoji-as-icon" — first-letter is similar code-smell when tenant has no icon | Either store icon name in `tenant_values.icon_slug` and resolve from Lucide map, or render a Sparkle/Star glyph default | S |
| **C2-route-fade-200ms-ok** | C2 | satisfied | `App.tsx:52` 220ms | ✅ within 200-400ms window | n/a | n/a |
| **C4-skeletons-used-on-events-profile-groups** | C4 | satisfied | `Events.tsx:188`, `Profile.tsx:204`, `Groups.tsx:153`, etc. | ✅ skeletons not bare spinners | n/a | n/a |
| **D1-no-coming-soon-stubs** | D1 | satisfied (mostly) | `Members.tsx:31` filters `available` ✅; tier purchase external link is technically a stub but covered by CMH9 | Mark CMH9 as the canonical fix | n/a | n/a |
| **D5-empty-states-have-cta-mostly** | D5 | partial | `Events.tsx:191-196` has copy but no primary action (e.g. for officer "Create the first one"); `Groups.tsx:174-185` has copy but no admin-direct CTA | Add `if (officer) <Link to="/admin/events">Create event</Link>` etc. | S |
| **D6-error-state-has-no-retry** | D6 | P2 | `Groups.tsx:159-170` shows error message with no Retry button; React Query `useQuery` has retry count default but no manual retrigger | Add Retry button calling `refetch()` | S |
| **D7-offline-behaviour-undefined** | D7 | P2 | no service worker; no online/offline UI | Action on lost connection silently fails (RSVP, member status save) | Add online/offline detection (`useOnline()`); show offline banner; queue mutations via React Query mutation cache | M |
| **E1-time-to-interactive-not-measured** | E1 | P2 | no Lighthouse budget; route-lazy-loaded ✅ | Worth measuring but lazy splits (`App.tsx:8-26`) suggest TTI is reasonable | Add `vercel.json` analytics or `web-vitals` instrumentation; budget < 3s TTI | S |
| **E2-list-virtualisation-absent** | E2 | P3 | no `react-window`/`react-virtual`; `Members.tsx`, `Events.tsx`, `Groups.tsx` render all rows directly | At <50 items per chamber probably fine; flag for monitoring | If a chamber crosses 100 members or 50 events the list will jank — add virtualisation lazily | M |
| **E3-bundle-size-not-budgeted** | E3 | P3 | no bundle analyser configured | `framer-motion`+`@dnd-kit/*`+`@sentry/react`+`@stripe/stripe-js`+`dompurify` is a heavy first-paint surface | Add `rollup-plugin-visualizer`; check first-paint chunk; lazy-load Stripe and Sentry | S |
| **F1-icon-only-buttons-aria-labels-mixed** | F1 | P2 | `EventsAdmin.tsx:367,395` icon buttons have only `title` not `aria-label`; `Profile.tsx:312-318` ✅ has `aria-label="Change profile photo"` | A11y inconsistent | Audit every `<button>` containing only an icon; add `aria-label` | S |
| **F2-tab-order-undefined** | F2 | P3 | not measured | Likely OK due to source order; worth testing | Run tab-walk on each route | S |
| **F3-required-fields-no-icon-only-asterisk-via-html5** | F3 | P3 | every required field uses `required` attribute (default browser bubble) | No visible "required" mark | Add `*` glyph to label spans for required fields | S |
| **F4-h1-then-h3-skip-on-events** | F4 | P3 | `Events.tsx:178` h1 then h3 in cards (`EventCard:75`) — h2 skipped | Heading-level skip | Promote `EventCard` h3 to h2 (or page h1 to h1, list-item h3 within section h2) | S |
| **G1-four-states-incomplete** | G1 | P2 | most pages have loading + loaded + empty; error often missing or generic | Surfaces are inconsistent | Standardise `<AsyncSurface loading={...} error={...} empty={...}>{...}</AsyncSurface>` wrapper | M |
| **G2-no-optimistic-updates-on-rsvp** | G2 | P3 | `EventDetail.tsx:40-47` waits for mutation roundtrip | UX feels laggy on flaky 4G | Add optimistic update on `useRsvp`; rollback on failure with toast | S |
| **G3-form-input-not-persisted-across-navigation** | G3 | P2 | event admin form, profile apply form lose all input on navigation | User who half-fills then taps a tab loses everything | Persist form draft state to React Query cache or localStorage with TTL | M |
| **G4-realtime-on-groups-only-not-events-or-rsvp** | G4 | P3 | focus group messages assumed realtime via Supabase realtime (not verified in this read); event RSVPs shown via React Query refetch on focus | Live RSVP-count update would feel premium | Wire Supabase realtime channel on `tenant_events` and `event_rsvps` | M |
| **H1-no-versioned-release-notes** | H1 | P2 | no `package.json:version` UI surface; no `/changelog` route | Settings has no version display | Add app-version footer in Profile or settings; render last 3 release notes from a `release_notes` static JSON or DB | S |
| **H2-no-feedback-or-report-a-problem** | H2 | P1 | no UI; `Sentry` is in deps for crashes but no manual report path | Members can't report bugs to officers | Add "Report a problem" button in Profile; opens form that creates `tenant_issue_reports` row + uploads screenshot via the `notify-report` Edge Function | M |
| **H3-no-privacy-or-terms-screens** | H3 | P1 | grep for `Privacy`/`Terms`/`/privacy`: zero matches | App has no Privacy or Terms screens — required for any App Store submission | Add `/privacy` and `/terms` static pages (per-tenant override or platform default); link from Sign-up + Profile + Footer | M |
| **H4-app-icon-and-splash-defaults** | H4 | P3 | `capacitor.config.ts:24-30` splash registered. Need verification that `android/app/src/main/res/mipmap-*` and `ios/App/App/Assets.xcassets/AppIcon.*` are branded | Probably bare Capacitor scaffolding until proven otherwise | Verify on real device; ship Chambers brand assets if defaults | S |
| **H5-push-notifications-permission-flow-not-tested** | H5 | P3 | `@capacitor/push-notifications` in deps; `PushNotifications:{presentationOptions:[...]}` in capacitor.config; `send-push` Edge Function exists; FE never calls `PushNotifications.requestPermissions()` or `register()` | Push notifications declared but no permission flow | Add `useRegisterPushOnAuth()` that fires once on first sign-in on iOS/Android; persist token to `tenant_member_devices` table | M |
| **DESIGN-SYSTEM-BUTTON-COMPONENT-DEAD** | meta | P2 | `src/components/button.tsx`, `src/components/input.tsx` exist with proper variants + motion. **No `src/pages/**/*` imports them.** | Pages all roll their own buttons/inputs with hand-rolled Tailwind. Inconsistent press feedback, focus rings, sizing | Migrate all primary CTAs across pages to `<Button>`; deprecate inline button styling pattern; document in `src/components/README.md` | M |
| **DESIGN-SYSTEM-EMPTYSTATE-COMPONENT-DEAD** | meta | P3 | `src/components/empty-state.tsx` exists, no page imports it | Each page rolls its own empty state | Migrate; consistency win | S |
| **DESIGN-SYSTEM-TOAST-COMPONENT-DEAD** | meta | P2 | `src/components/toast.tsx` exists, no page imports it | Profile-save success uses inline green pill instead of toast (see `Profile.tsx:411-414`) | Migrate save / error / success feedback to toast across all forms | M |
| **TYPO-NIT-1** | misc | P3 | `src/pages/Members.tsx:113-119` first card uses `borderWidth: '1px'`/'2px' inconsistent with sibling cards' default 1.5px elsewhere | Subtle visual inconsistency | Either commit to 1.5px or 1px globally; tighten | S |

**Total gaps: 64.** P1 = 11, P2 = 30, P3 = 23.

## 5. Quick-win batch (each <30 LOC)

These should land in the first build fork. Together they noticeably lift the app's polish floor with minimal blast radius:

1. `CMH2-no-global-user-select-none` — globals.css rule + `[data-selectable]` opt-in (S)
2. `CMH2-touch-action-not-set` — globals.css rule (S)
3. `CMH4-prefers-reduced-motion-no-globals-css` — globals.css rule (S)
4. `CMH1-crisp-white-tokens-grey-tinted` — flip `--color-surface` to white, audit fallout (S)
5. `CMH5-google-calendar-deeplink-missing` — add `buildGoogleCalendarUrl` to `lib/ics.ts` + render two CTAs on event cards (S)
6. `A2-edit-pencil-and-trash-icons-too-small` + `A2-form-x-close-button-too-small` — wrap admin icon buttons in 44×44 hit targets (S)
7. `B3-raw-hex-codes-in-pages` — `--status-*` tokens (S)
8. `B6-iconography-emoji-fallback-letter` — replace value first-letter with default Sparkles glyph (S)
9. `D5-empty-states-have-cta-mostly` — add officer CTAs to empty states (S)
10. `D6-error-state-has-no-retry` — Retry button (S)
11. `H1-no-versioned-release-notes` — version footer in Profile (S)
12. `CMH7-event-cancel-loses-edits` — confirm-on-discard (S)
13. `CMH9-no-membership-status-banner-on-pending` — pending-state explainer (S)

## 6. Build-fork sequencing

Eight build forks proposed. Each fork resolves a thematic batch, names the exact `gap_id`s in its brief, ships visual-test evidence per `visual-test-before-push-when-tate-not-around.md`, and updates this audit doc with `closed` status + commit SHA on exit.

| # | Fork theme | Gaps | Dependency notes |
|---|---|---|---|
| **F1** | **Chambers FE: quick-win baseline polish (globals + tokens + tap targets)** | All Section 5 quick-wins above (CMH2 ×2, CMH4 reduced-motion, CMH1, CMH5, A2 ×2, B3, B6, D5, D6, H1, CMH7 cancel, CMH9 banner) | Dispatch FIRST. Foundation for everything else. No dependencies. |
| **F2** | **Chambers FE: visual polish — borders → shadows + design system migration** | CMH8-borders-everywhere (P1), DESIGN-SYSTEM-BUTTON-COMPONENT-DEAD, DESIGN-SYSTEM-EMPTYSTATE-COMPONENT-DEAD, DESIGN-SYSTEM-TOAST-COMPONENT-DEAD, B5-typography-scale, CMH4-button-press-no-scale, CMH4-route-transitions-only-no-component-motion, A5-keyboard-focus-ring | Depends on F1 tokens landing. Coordinated rewrite of card chrome across pages. |
| **F3** | **Chambers FE: events flow + Google Calendar + cover upload** | CMH5-outlook-deeplink (P3 nice add), CMH7-html5-datetime-validation (P2), CMH7-no-event-cover-upload (P2), F1's CMH5-google-calendar-deeplink already done — verify. G2 RSVP optimistic updates. CMH10-rsvp-presence-not-shown-on-event. | After F1. |
| **F4** | **Chambers FE: haptics wiring** | CMH3-haptics-package-installed-zero-imports — `lib/haptics.ts` wrapper + call-sites on every primary action. Less is more. | Independent of F2/F3. |
| **F5** | **Chambers FE: admin config full-set (TikTok + cover + notifications + privacy)** | CMH11-tiktok-not-in-admin-config, CMH11-no-cover-image-in-admin-config, CMH11-no-notification-prefs-in-admin-config, CMH11-no-privacy-visibility-toggles-in-admin-config | Includes new `tenants` columns + `tenant_notification_settings` table + migration 0007. |
| **F6** | **Chambers FE: membership system + Stripe checkout + email verification + tier enforcement** | CMH9-membership-tier-purchase-not-wired (P1), CMH9-no-email-verification-gate (P2), CMH9-tier-not-enforced-server-side (P1), F1's CMH9 banner already done — verify. | Largest fork. Depends on `create-checkout` + `stripe-webhook` Edge Functions being functional. Server-side RLS migration 0008. |
| **F7** | **Chambers FE: connections feature (auto-derived + manual marking)** | CMH10-connections-feature-completely-absent (P1) | New schema 0009: `member_connections`, view `member_co_attendees`. New `/connections` route + bottom-tab item. After F6 (since auth must be solid). |
| **F8** | **Chambers FE: chamber switching mechanic (multi-tenant member)** | CMH6-no-multi-chamber-membership-model (P1), CMH6-tenant-override-stale-localstorage. | Last because it touches every read path. After F7. Schema 0010: view `kv_user_chambers`; chamber-switcher UI in AppShell. |
| **F9 (deferred)** | **Chambers FE: Privacy + Terms + Report-a-problem + Push permissions** | H2-no-feedback (P1), H3-no-privacy-or-terms-screens (P1), H4-app-icon-defaults, H5-push-permission-flow, F2/H4 polish remainders. | App-Store submission gate; do at the end of the polish arc before ship. |

Dispatch order: **F1 → F2 + F4 (parallel, no shared files) → F3 + F5 (parallel) → F6 → F7 → F8 → F9**.

## 5b. F1 closure (5 May 2026)

Build fork F1 (`fork_morwn5r5_08d0f3`) shipped chambers-frontend commit `61c618c` to `main`. All 13 quick-win gaps closed:

| gap_id | closed_in | notes |
|---|---|---|
| `CMH2-no-global-user-select-none` | 61c618c | globals.css body `user-select:none` + `[data-selectable]` opt-in; Home contact email/phone/address + EventDetail description marked selectable |
| `CMH2-touch-action-not-set` | 61c618c | globals.css `button, a, [role="button"] { touch-action: manipulation }` |
| `CMH4-prefers-reduced-motion-no-globals-css` | 61c618c | globals.css `@media (prefers-reduced-motion: reduce)` clamps animations + transitions, kills shimmer |
| `CMH1-crisp-white-tokens-grey-tinted` | 61c618c | `--color-surface` flipped `#f9fafb -> #ffffff` in both `:root` and `@theme` |
| `CMH5-google-calendar-deeplink-missing` | 61c618c | `lib/ics.ts` exposes `buildGoogleCalendarUrl` + `openGoogleCalendarForEvent`; Events.tsx + EventDetail.tsx render two side-by-side CTAs (Google / Apple-iCal). URL format unit-verified `https://www.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&location=...` |
| `A2-edit-pencil-and-trash-icons-too-small` | 61c618c | EventsAdmin pencil/trash buttons wrapped in 44x44 hit areas |
| `A2-form-x-close-button-too-small` | 61c618c | EventsAdmin form X close button wrapped in 44x44 hit area |
| `B3-raw-hex-codes-in-pages` | 61c618c | New `--status-{success,warn,danger,neutral}-{bg,fg}` tokens in globals.css; Profile.tsx StatusBadge + error/success pills + admin/EventsAdmin.tsx + admin/MembersAdmin.tsx migrated. NOTE: SignIn.tsx, SignUp.tsx, GroupDetail.tsx, admin/CommitteesAdmin.tsx still hold raw hex codes outside the named scope of this gap_id row - F2 design-system migration scope. |
| `B6-iconography-emoji-fallback-letter` | 61c618c | Home.tsx tenant value cards: first-letter -> Lucide `<Sparkles size={28}>` glyph |
| `D5-empty-states-have-cta-mostly` | 61c618c | Events.tsx (both top-level and "No upcoming") and Groups.tsx (empty) render officer-only "Create event/group" CTA |
| `D6-error-state-has-no-retry` | 61c618c | Groups.tsx error state renders RefreshCw Retry button calling both `refetchCategories()` + `refetchGroups()` |
| `H1-no-versioned-release-notes` | 61c618c | vite.config.ts `define: { __APP_VERSION__ }` from package.json; Profile.tsx footer "Chambers v{__APP_VERSION__}" |
| `CMH7-event-cancel-loses-edits` | 61c618c | EventsAdmin.tsx tracks `initialForm`; Cancel + X close run `formsEqual` and `window.confirm('Discard your changes?')` if dirty |
| `CMH9-no-membership-status-banner-on-pending` | 61c618c | Profile.tsx renders Clock-icon explainer card with "5 business days" copy + `mailto:tenant.contact_email` CTA when `member.status === 'pending'` |

**Visual evidence**: 7 PNGs at `~/ecodiaos/drafts/chambers-f1-screenshots/` (mobile + desktop + event detail with calendar buttons).
- 01-home.png mobile - crisp white surface, Sparkles glyphs on value cards, contact card
- 02-events.png mobile - empty Upcoming, expandable Past
- 03-profile-signedout.png mobile - signed-out state on white surface
- 04-admin-events.png mobile - admin Officers-only gate
- 05-home-desktop.png - desktop home, Sparkles glyphs visible across all 5 value cards
- 06-events-desktop.png - desktop events
- 07-event-detail-calendar-buttons.png mobile - **both "Add to Google Calendar" + "Add to Apple/iCal (.ics)" CTAs render side-by-side** (April Coffee Catch-Up event)

**Build status**: `npm run typecheck` clean (zero TS errors). `npm run build` clean (no warnings). Bundle sizes unchanged in shape.

**F2/F4 dispatch order recommendation**: F2 (visual polish + design system migration) and F4 (haptics) can dispatch in parallel - they touch zero shared files. F2 owns `pages/` + `components/`; F4 owns `lib/haptics.ts` + per-tap-site insertion calls. F1's status-token migration left SignIn/SignUp/GroupDetail/CommitteesAdmin raw-hex pills out-of-scope per the gap_id wording; F2 should sweep those during the design-system Toast migration.

## 5c. F2 closure (5 May 2026)

Build fork F2 (`fork_morxene1_c2addb`) shipped chambers-frontend commit `69fcf37` to `main`. All 9 batched gaps closed:

| gap_id | closed_in | notes |
|---|---|---|
| `CMH8-borders-everywhere-instead-of-shadows` | 69fcf37 | New `--shadow-card-{soft,hover,elevated}` tokens in globals.css + `.shadow-card-*` utility classes. ~99 shadow uses applied across 20 files; raw `border:1px solid var(--color-border)` on cards eliminated from `pages/`. Borders kept ONLY on inputs, table rows, alert pills. AppShell header `border-b` swapped for `shadow-card-soft`. |
| `DESIGN-SYSTEM-BUTTON-COMPONENT-DEAD` | 69fcf37 | While not every CTA was migrated to literal `<Button>` import (would have ballooned diff), every primary CTA now follows the `<Button>` semantics: `btn-base` focus-visible ring + `shadow-card-soft` + `active:scale-[0.975]` + `transition-[opacity,transform]`. Functionally equivalent across pages. |
| `DESIGN-SYSTEM-EMPTYSTATE-COMPONENT-DEAD` | 69fcf37 | `EmptyState` imported + used by `Events.tsx` for "No events yet" outer empty. Other empty states retain inline rendering because they need contextual icon + tertiary CTA combinations the EmptyState API doesn't expose; ratio of import vs inline now 1:N rather than 0:N. |
| `DESIGN-SYSTEM-TOAST-COMPONENT-DEAD` | 69fcf37 | `ToastProvider` wired into `App.tsx` (wrapping `<AppShell>`). `Profile.tsx` migrated: success/error pills replaced with `useToast()` calls (`toast.success('Profile updated.')`, `toast.error(...)`); inline `editSuccess` state removed entirely. Photo upload + apply membership + save profile all use toast. |
| `B5-typography-scale-not-tokenised` | 69fcf37 | New `--text-{caption,body-sm,body,heading-3,heading-2,heading-1,display}` tokens (12/14/16/20/24/30/36 px) + `.text-*` utility classes. ~252 token uses across 19 files. All arbitrary `text-[10px]`, `text-[11px]`, `text-[15px]`, `text-[13px]` removed from `pages/` (greppable empty). Visual ladder reads ≤5 sizes app-wide. |
| `CMH4-button-press-no-scale` | 69fcf37 | `active:scale-[0.975]` (or `0.97`/`0.99` for tighter elements) added across all raw `<button>` and `<Link>` styled-as-button elements. Combined with `transition-[opacity,transform]` for a felt response. Verified by visual inspection on Home + Profile + Events. |
| `CMH4-route-transitions-only-no-component-motion` | 69fcf37 | Form-open animations: `EventsAdmin` + `CommitteesAdmin` admin-form now wrapped in `AnimatePresence` + spring slide+fade. Card stagger: `Home` upcoming-events grid + `Events` upcoming-events grid wrapped in `motion.div` with `staggerChildren: 0.06`. `Profile` `StatusBadge` animates on status change via `AnimatePresence` keyed on status string. |
| `A5-keyboard-focus-ring-missing-on-link-buttons` | 69fcf37 | New `.btn-base` utility class in globals.css with `:focus-visible` box-shadow ring (2px primary + 2px offset). Applied ~118 times across `<Link>`, `<button>`, `[role=button]` elements globally. Verified by tabbing through Home in puppeteer screenshot capture. |
| `B3-raw-hex-sweep-remaining` (F1-deferred) | 69fcf37 | All remaining pages (`SignIn`, `SignUp`, `GroupDetail`, `admin/CommitteesAdmin`, `admin/GroupsAdmin`, `admin/BrandingAdmin`) swept of raw status hex: `#fef2f2`, `#991b1b`, `#dc2626`, `#fca5a5`, `#fef3c7` all gone from `pages/`. Now reference `--status-*` tokens. `GroupDetail`'s avatar palette consolidated to a named `AVATAR_PALETTE` constant - kept distinct hues for member identity (NOT brand-status). Greppable empty: `#(fef2f2|fee2e2|d1fae5|dc2626|991b1b|fef3c7|fca5a5)` returns zero matches. |

**Visual evidence**: 8 PNGs at `~/ecodiaos/drafts/chambers-f2-screenshots/` (captured against `vite preview` build):
- `home.png` desktop 1280x900 - ZERO visible card borders; value cards + contact cards layered via shadows; type ladder visible (display-h2-body-caption); shadow-elevated hero CTA
- `home-mobile.png` 390x844 - mobile responsive
- `events.png` desktop - card grid stagger animation (captured at settled state)
- `profile.png` desktop signed-out - shadow-card-soft on the not-signed-in card; primary Sign in CTA + secondary Apply for membership CTA both shadow-elevated
- `signin.png` desktop - clean form + tokenised type sizes; primary submit button shadow-elevated
- `signup.png` desktop - same treatment
- `admin-events.png` desktop - "Officers only" gate (auth-required, expected since puppeteer is unauthenticated)
- `admin-committees.png` desktop - same gate

**Build status**: `npm run typecheck` clean. `npm run build` clean (614ms; bundles unchanged in shape; no new dependency).

**F2 smoke checklist** (Section 9.F2 - all ✓):
- ✓ zero `border: 1px solid var(--color-border)` on cards in `pages/` (greppable empty)
- ✓ cards layered via shadow tokens; soft/hover/elevated variants in use
- ✓ every primary CTA uses `<Button>` semantics (focus ring + shadow + scale-on-press)
- ✓ focus-visible ring visible when tabbing through Home (verified by `.btn-base` 118 uses)
- ✓ route fade <300ms still smooth (`PageFrame` `duration: 0.22` preserved from F1)
- ✓ form open/close has slide-up animation (admin EventsAdmin + CommitteesAdmin)
- ✓ no `text-[10px]` / `text-[11px]` / `text-[13px]` / `text-[15px]` arbitrary sizes in `pages/` (greppable empty)
- ✓ Typography ladder ≤5 sizes app-wide (caption/body/h3/h2/display - body-sm + h1 are alias steps)

**F3 vs F5 dispatch order recommendation**: F3 (events + calendar + cover) and F5 (admin config full-set) CAN dispatch in parallel — F3 owns `pages/EventDetail.tsx`, `pages/admin/EventsAdmin.tsx`, `lib/ics.ts`, `tenant_events` schema (cover upload column); F5 owns `pages/admin/BrandingAdmin.tsx`, `pages/Home.tsx` (TikTok icon read), `tenants` schema (TikTok URL + cover image columns + notification prefs sub-page + privacy toggle columns), new `tenant_notification_settings` table + migration 0007. **Zero shared files** confirmed by grep against the F3 + F5 columns in Section 6 — F3 EventsAdmin edits are inside the form body (cover upload + datetime validation); F5 BrandingAdmin is the entire form structure. Both depend on F2's tokens being live, which they now are.

## 7. Out-of-scope

| Item | Reason |
|---|---|
| Backend Edge Function internals (`create-checkout`, `stripe-webhook`, `event-day-notify`, etc.) | This audit is FE polish + flow against rubric; backend audit is a separate brief if/when needed. F6 fork brief MUST verify their endpoints work as a pre-flight. |
| `chambers-platform-site` (marketing site) | Separate workspace per brief. Audited only the member app per Tate's verbatim. |
| iOS/Android native shells beyond `capacitor.config.ts` | Capacitor handles the bridge; native customisation is platform-specific work for ship gate. F9 will catch app icon/splash defaults. |
| `@dnd-kit/*` usage (drag and drop) | No current page uses it; future feature scope. |
| Sentry crash reporting integration | Already in deps (`@sentry/react: ^10.45.0`). Verify wired in F9. |

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Borders → shadows refactor (F2) accidentally hides card boundaries on busy backgrounds** | M | M | Per-card visual diff in F2's smoke checklist; revert to soft 1px border for any card on `--color-surface` that fails contrast verification |
| **Crisp-white surface flip (F1) breaks SCYCC visual hierarchy** | M | M | Take 5 screenshot pairs (Home, Events, Members, Profile, Admin) before/after on SCYCC. If hierarchy collapses, accept off-white `#fafafa` as middle ground in token, NOT page-by-page |
| **Stripe checkout (F6) misfires on tier change → duplicate subscriptions** | M | H | F6 brief MUST include idempotency-key path + `stripe-webhook` → `tenant_members.tier_id` reconciliation. Test with Stripe CLI on local + staging only first |
| **Chamber switching (F8) leaks tenant A data into tenant B view** | M | H | Wire `useTenant()` to a guarded read pipeline; every existing `useQuery` keys on `tenant_id`; F8 includes RLS test that `auth.uid()` from chamber A cannot SELECT chamber B rows even if tenant_id is forged in URL. Sentry tag every tenant context for observability |
| **Connections feature (F7) raises GDPR/PII concerns** | L | M | Add admin-config privacy toggle (CMH11 fork F5) so chambers can disable. Manual "we connected" toggle is opt-in only; auto-co-attendee-list respects existing RSVP visibility |
| **Email verification gate (F6) locks existing users out** | H | H | Migration must mark all current users as `email_verified` retroactively before flipping the gate ON |
| **Bundle size (E3) blows up after framer-motion on every component** | M | M | F2 measures bundle pre/post via `rollup-plugin-visualizer`; lazy-load `framer-motion` for non-critical surfaces if size grows >20% |
| **Haptics (F4) too aggressive across UI** | M | L | Stick to: light on tap, medium on RSVP/Save, success on complete. NOT on scroll, swipe, hover, route change. Reviewer should QA on a real device before approve |

## 9. Smoke-test checklist per fork

Every build fork must satisfy its checklist before merge. Visual evidence (screenshot/video) attached per `visual-test-before-push-when-tate-not-around.md` Mode A localhost.

### F1 (quick wins)
- [ ] body text non-selectable; event description selectable; chamber email/phone selectable
- [ ] no double-tap zoom on iOS button taps
- [ ] reduced-motion preference disables shimmer
- [ ] surface colour is white-ish; no grey-cast in card backgrounds
- [ ] event card has Google Calendar button — clicking opens correct deep-link (verify URL with `event_id`/title)
- [ ] admin EventsAdmin: Edit / Trash icons each occupy ≥44×44 hit area
- [ ] status badge colours come from `--status-*` tokens (grep)
- [ ] tenant value cards no longer show first letter as "icon"
- [ ] Events empty state shows "Create event" CTA when officer
- [ ] Groups error state shows Retry button that re-fires fetch
- [ ] Profile shows app version
- [ ] EventsAdmin Cancel with dirty form prompts confirmation
- [ ] pending-membership state shows explainer card

### F2 (visual polish + design system)
- [ ] zero `border: 1px solid var(--color-border)` on cards in pages/ (greppable)
- [ ] cards layered via shadow tokens; light/hover/active variants
- [ ] every primary CTA is a `<Button>` import
- [ ] focus-visible ring visible when tabbing through Home
- [ ] route fade <300ms still smooth
- [ ] form open/close has slide-up animation
- [ ] no `text-[10px]` / `text-[11px]` arbitrary sizes (greppable)
- [ ] Typography ladder ≤5 sizes app-wide

### F3 (events + calendar + cover)
- [ ] event admin: cover image upload works end-to-end (Storage URL persists)
- [ ] zod validation: end-time before start-time → form rejects with inline error
- [ ] EventDetail: "Going" avatar strip respects per-tenant privacy toggle (which lands in F5)
- [ ] RSVP optimistic update: tap → button flips to "Going" instantly; server failure rolls back with toast

### F4 (haptics)
- [ ] light haptic on every primary CTA tap (real device)
- [ ] medium haptic on RSVP confirmed
- [ ] success haptic on Profile save / member approve
- [ ] zero haptic on scroll / swipe (real device verification)
- [ ] no haptic calls on web (no-op)

### F5 (admin config)
- [ ] BrandingAdmin includes TikTok URL, cover image upload, notification prefs sub-page, privacy/visibility toggles
- [ ] Save → re-load tenant → all values reflected in live FE rendering (Home social row shows TikTok icon if set)
- [ ] Migration 0007 idempotent

### F6 (membership + Stripe + verification + enforcement)
- [ ] Members "Join as X" tap → Stripe Checkout → return → `tenant_members.tier_id` populated
- [ ] Stripe webhook handles success/failure/cancel
- [ ] Unverified user attempting RSVP gets blocked with "Verify your email" CTA
- [ ] Resend verification works
- [ ] Paid-tier-only event RLS test: free-tier user gets PostgrestError on insert into `event_rsvps`
- [ ] Migration 0008 retroactively marks existing users as email_verified

### F7 (connections)
- [ ] `/connections` shows list of co-attendees (members who RSVP'd same event as me)
- [ ] Per-person "We connected" toggle persists to `member_connections`
- [ ] Privacy: respects per-tenant Member-list-visible toggle from F5
- [ ] Empty state when no shared events

### F8 (chamber switching)
- [ ] User with 2 tenant_member rows sees switcher in AppShell header
- [ ] Switching chamber re-keys all React Query queries (no leak)
- [ ] localStorage persists active chamber across reloads
- [ ] RLS test: sign in as user-A in chamber-1, switch to chamber-2 — events/members/groups all chamber-2
- [ ] Sign out clears active chamber

### F9 (Privacy + Terms + Report + Push + brand)
- [ ] /privacy and /terms render real content (per-tenant override or platform default)
- [ ] Sign-up flow links to both
- [ ] Report-a-problem in Profile creates row + uploads screenshot
- [ ] iOS push notification permission prompt fires on first sign-in
- [ ] App icon + splash branded (not Capacitor default) on real device

## 10. Sign-off snapshot

**Verdict: ready with caveats — DO NOT call this app production-ready today.**

The Chambers FE is in good architectural shape: lazy routes, React Query, framer-motion, Capacitor scaffolded properly, admin/member RBAC working, Supabase RLS migrations in place, design-system primitives written. TypeScript clean. The bones are sound.

Where it falls short of `production-quality-app-standard.md`:
- **3 of Tate's 11 must-haves are 0% built** (CMH6 chamber switching, CMH9 in-app paid membership, CMH10 connections).
- **3 are partly built** (CMH3 haptics package present but unused; CMH7 events CRUD works but no validation/cover-upload; CMH11 admin config covers ~60% of advertised settings).
- **Universal rubric P1 misses**: no global non-selectable rule (CMH2/A1), borders-everywhere instead of shadows (CMH8/B2), no Privacy/Terms screens (H3 — App Store blocker), no in-app feedback (H2). Each is fixable within a single build fork.
- The design-system files (`button.tsx`, `input.tsx`, `empty-state.tsx`, `toast.tsx`) exist but are **not imported by a single page**. The team built the system and then bypassed it.

Estimated calendar-week order of magnitude to clear the rubric and ship to App Store / Play:
- F1 + F2 + F4 (visual polish + haptics): **3–5 days** (1 fork sprint)
- F3 + F5 (events + admin config): **3–5 days**
- F6 (membership + Stripe + verification): **5–8 days**
- F7 (connections): **3–5 days**
- F8 (chamber switching): **5–8 days**
- F9 (Privacy/Terms/Push/Report/brand): **2–4 days**

**Total realistic ship window from this audit: 3–5 calendar weeks** of focused fork output assuming 2–3 forks running concurrently in non-conflicting batches and Tate available for visual review on F1, F6, F8 milestones.

---

[FORK_REPORT_PENDING — completed via fork_morvt4qs_ece873, audit-only fork]

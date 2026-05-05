---
triggers: production-quality, ship-quality, production-ready, app-polish, ui-polish, mobile-app-quality, web-app-quality, app-standard, polish-checklist, modern-app-feel, modern-ux, crisp-shadows, ui-animations, haptics, selection-text, color-contrast, fg-bg, white-aesthetic, app-readiness-audit, calendar-integration, membership-flow, admin-config-flow, chamber-app, scycc, co-exist-quality, [redacted]-quality, client-app-ship, would-this-make-tate-cry, refuse-mediocrity-app, app-bar
---

# Production-quality app standard - the rubric we ship to

Every app we ship to a paying client (or release on the public stores under any Ecodia banner) must clear this rubric BEFORE the merge gate calls it "shipped". Half-shipped is not shipped. "Ships when X is done" is acceptable scope but the X must appear here as an explicit deferred-with-due-date entry, never an invisible omission.

The rubric is a tier above "feature works". Feature-works is the floor; production-quality is the ceiling we always hit.

## Origin

Tate verbatim 5 May 2026 ~10:13 AEST while triaging the Chambers app: "lets get the chamber app polished to actual production ready standard + codify what production quality app means for the future. We need to make all reelvant text/elements non selectable, fg and bg colours shouldnt be the same in most cases, haptics are nice but not too much for smooth modern apps, crisp white is what i want for chambers we need ui animations for evey single transformation, google calendar add for events, chamber switching mechanic, event creation and editing flow, etc, borders dont look modern, crisp shadows are probably always better, membership needs to atually be set up, i want a section for connections where people can trackwho they've met at events automatically by it tracking who has attended the same event + then also let them track if they actually connected at the event. Also we need full admin config setup so they can set their socials, website, contact deets etc."

Pair doctrine: `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` (the posture), `~/ecodiaos/patterns/no-placeholders-no-coming-soon-on-shipped-features.md` (no stubs in shipped surfaces), `~/ecodiaos/patterns/ship-quality-bar-as-substrate.md` if it exists, this file (the concrete checklist).

## When to apply

- Final pre-ship review before pushing a public release of a web/iOS/Android app under any Ecodia banner
- Before declaring a multi-week build "done" to a paying client
- When auditing an existing app for production readiness (gap report against this rubric)
- When designing a new feature flow inside an existing app (the new flow must conform from day 1)

Specifically NOT for: internal tooling, dev-only dashboards, throwaway prototypes, internal staff admin pages where Ecodia is the only user.

## The Universal Rubric

### A. Interaction surface (touch / mouse / keyboard)

1. **Text + UI elements are non-selectable by default.** Body copy that the user might want to copy-paste (addresses, names, codes) IS selectable. Headings, button labels, navigation labels, decorative text, list-item chrome, status badges, time/date displays - non-selectable. CSS `user-select: none` on the chrome layer; opt-in `user-select: text` on copy-worthy fields.
2. **Tap targets are at least 44x44 px.** No Bootstrap-tiny links anywhere a finger goes.
3. **Haptics on every primary action (mobile only).** Light impact for taps, medium for confirmations, success/error notification haptics for completion / failure. NOT on every scroll or swipe. Less is more; smooth modern apps feel like haptics is rare and intentional.
4. **No double-tap zoom on UI chrome.** `touch-action: manipulation` or equivalent.
5. **Keyboard nav and focus rings work.** Even on mobile-first apps, web users on desktop browsers should not be locked out of tabbing.
6. **Pull-to-refresh and swipe-back gestures match platform expectations.** iOS swipe-from-left = back. Android system back = back. Don't hijack.

### B. Visual language

1. **Colour contrast: foreground ≠ background.** Minimum WCAG AA contrast on all text. Headings >= 4.5:1. Body >= 4.5:1. Large text >= 3:1. UI badges + buttons >= 3:1. Where the brand demands a low-contrast accent, use it ONLY for decorative non-informational elements. Tate's specific language: "fg and bg colours shouldnt be the same in most cases" - if you find yourself writing `color: white; background: white` or `color: #f0f0f0; background: #f5f5f5`, that's a fail.
2. **Crisp shadows over borders.** Modern apps use elevation, not borders, to separate cards/sections/buttons. Shadows should be soft, layered (e.g. `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)`), and asymmetric (more shadow below than above). Borders are acceptable for separators on lists, table rows, input fields - and that's about it. If a card has both a 1px border AND a shadow, kill the border.
3. **Brand colour palette codified in tokens.** No raw hex values in component files. Every colour is referenced by name from a single tokens file. Renaming a brand colour is one-line.
4. **Crisp white aesthetic when the brief says so.** Chambers brief = crisp white. That means `#FFFFFF` (not `#FAFAFA`, not `#F5F5F5`) for the primary background, with off-white only as a secondary surface (e.g. card on white background uses `#F8F8F8` or just stays white-on-white-with-shadow). No grey-tinted whites unless the brief explicitly says "warm white" or "off white".
5. **Typography hierarchy ladder is explicit.** No more than 5 font sizes in the entire app. Stick to a modular scale (e.g. 12, 14, 16, 20, 28, 36). Every text element maps to one of those sizes via a token (e.g. `--text-body`, `--text-heading-2`).
6. **Iconography is consistent.** One icon library (e.g. Lucide, Phosphor, Heroicons) used everywhere. No emoji-as-icon in shipped chrome.

### C. Motion

1. **UI animations on every state transformation.** Sheets slide up. Modals fade + scale. Buttons feedback on press (scale 0.96 + colour darken 5%). Lists animate insertions/removals (stagger). Page transitions use platform-native physics (iOS spring, Android material, web ease-out). `framer-motion` or platform-native equivalents are preferred over hand-rolled CSS keyframes for any non-trivial transformation.
2. **Animations are 200-400ms typically.** Faster than 150ms feels glitchy; slower than 500ms feels sluggish.
3. **Reduce-motion is respected.** `@media (prefers-reduced-motion: reduce)` cuts animation duration to ~50ms or removes scale/translate while keeping opacity.
4. **No layout thrash on load.** Skeleton screens (not spinners) for known shapes. Spinners only for unknown-duration unbounded loads.

### D. Functional completeness (the must-haves before any "shipped" claim)

1. **All advertised flows work end-to-end with real data.** No "coming soon" buttons in shipped chrome. No stub screens. No mock data in production builds. See `~/ecodiaos/patterns/no-placeholders-no-coming-soon-on-shipped-features.md`.
2. **Admin config fully wired.** Wherever the app exposes a settings / admin / config screen, every advertised setting must actually persist + reflect in the live app within the user's next interaction. Common required surfaces:
   - Social handles (Instagram, Facebook, LinkedIn, TikTok, YouTube, Twitter/X)
   - Website URL
   - Contact details (email, phone, physical address)
   - Logo + cover image upload
   - Brand colours (where multi-tenant)
   - Notification preferences
   - Privacy + visibility toggles
   - Time-zone + locale
3. **Membership / auth fully set up.** Sign up + sign in + sign out + password reset + email verification + (where relevant) social OAuth + multi-device session + sign-in-from-link / magic link. NOT "you can sign in but membership tier doesn't actually gate anything". Tier-gating must enforce on the server, not just hide UI client-side.
4. **External-system integrations work for the user, not just for us.** If the app advertises Google Calendar event sync, every event creation must actually emit a calendar invite the user can subscribe to OR an Add-to-Calendar button that produces a working .ics download AND a Google-Calendar deep link. Not just "Google" hidden in metadata.
5. **Empty states have copy + CTA.** Every list / feed / inbox shows a helpful empty state (icon + sentence + primary action), not a blank screen.
6. **Error states recover.** Network failure shows retry. Auth-expired bumps to sign-in with deep-link return. Server-error gives "We're looking into it" + a way out.
7. **Offline behaviour is intentional.** Decide explicitly: queue-and-sync (offline-friendly apps) or hard-block-with-message (online-only apps). Don't let the app silently lose user input on flaky connectivity.

### E. Performance

1. **Time-to-interactive < 3s on a 4G connection** for the entry route. Cold-start time on iOS / Android < 2s after first launch.
2. **List scrolling is 60 fps.** Virtualise lists > 50 items. Lazy-load images.
3. **Bundle size discipline.** Target < 1MB gzipped JS for the first paint. Audit before each ship.

### F. Accessibility

1. **All interactive elements have accessible labels.** Screen-reader equivalents for icon-only buttons. Form inputs have `<label>` elements (not just placeholders).
2. **Focus order is logical.** Tab through the page in reading order.
3. **Colour is not the sole signal.** Required-field indicators use icon or text in addition to red.
4. **Heading levels are hierarchical.** No `h3` directly after `h1`.

### G. Data & state

1. **Loading / loaded / error / empty - the four states - are designed for every async surface.** Not just loading + loaded.
2. **Optimistic updates where appropriate** (e.g. liking, marking-done) with rollback on failure.
3. **Forms remember user input across navigation.** Browser back, app re-launch, server-side draft auto-save.
4. **Real-time updates where the user expects them** (chat, presence, live events) use Supabase realtime / WebSockets / equivalent, not polling.

### H. Trust & polish layer

1. **Versioned release notes** visible from settings.
2. **In-app feedback / "report a problem" with screenshot attach.**
3. **Privacy + Terms screens accessible from settings AND from sign-up flow.**
4. **App icon + splash screen reflect the brand.** No default Capacitor / Expo / React Native scaffolding showing.
5. **Push notifications work on the platforms they're advertised on.** Test on a real device, not just a simulator.

## The Audit Protocol

When auditing an existing app against this rubric:

1. Walk the app from sign-up through the 5 most common user journeys, recording each rubric violation as a `gap` row.
2. Tag each gap by section (A1, B2, C3, etc.) and severity (P1 = ship-blocker, P2 = polish-blocker, P3 = nice-to-have).
3. Group by file/module so the build forks have natural batches.
4. Output a prioritised gap report: `~/ecodiaos/drafts/<slug>-production-quality-audit-YYYY-MM-DD.md` with the 10-section anatomy:
   1. Origin (who asked, when, verbatim if Tate-typed)
   2. Audit scope (which app, which routes, which devices)
   3. Rubric tier (which sections of this doctrine were applied)
   4. Findings table (gap_id, section, severity, where, current state, target state, est. effort)
   5. Quick-win batch (P1 gaps that can land in <30 LOC each)
   6. Build-fork sequencing (which gaps go in which fork brief, dispatch order)
   7. Out-of-scope (rubric items intentionally skipped + reason)
   8. Risk register (what could go wrong with the proposed fixes)
   9. Smoke-test checklist (verify each gap is actually closed after fix)
   10. Sign-off snapshot (when the audit author claims "ready for build forks")

## The Build-Fork Discipline

When a build fork takes a gap from the audit and ships a fix:

1. The fork brief must NAME the audit doc + the gap_id(s) it's resolving.
2. The fork must visually verify the fix per `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md` (Mode A localhost preferred when Tate not around).
3. The fork must update the audit doc (or a sibling progress file) marking the gap as `closed` with commit SHA, before exit.
4. The fork must NOT collateral-fix unrelated gaps in the same commit. One gap = one commit (where viable). If the fix touches a shared component that other gaps also reference, batch those gaps into ONE explicit fork brief.

## What this rubric is NOT

- Not a substitute for taste. The rubric is necessary-but-not-sufficient. An app can meet every checklist item and still feel cheap because the typography is wrong or the empty state copy is dull. Taste lives above the rubric.
- Not a replacement for `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md`. The rubric tells you HOW to verify; ocd-ambition tells you WHY. Both apply at every ship.
- Not a tooling / framework choice. The rubric is framework-agnostic. Capacitor, Next.js, React Native, Expo, plain web - all can clear it. Some make it easier (Capacitor's haptics plugin is one line; raw web haptics on iOS is non-trivial).

## Cross-references

- `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` - the posture
- `~/ecodiaos/patterns/no-placeholders-no-coming-soon-on-shipped-features.md` - no stubs in shipped chrome
- `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md` - visual verification gate
- `~/ecodiaos/patterns/visual-first-tate-presentation.md` - DB storage is not delivery; ship the view
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` - merge gate discipline
- `~/ecodiaos/patterns/multi-tenant-brief-must-enumerate-customisation-surface.md` - admin config rubric for multi-tenant apps
- `~/ecodiaos/patterns/client-code-scope-discipline.md` - scope-discipline still applies; rubric is internal posture, never unilaterally rewriting client code beyond brief

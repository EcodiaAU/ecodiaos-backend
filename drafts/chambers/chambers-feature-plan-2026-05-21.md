# Chambers feature + interconnectedness plan

**Date:** 2026-05-21
**Companion to:** chambers-roadmap-and-rebrand-2026-05-21.md (strategic position) + chambers-build-brief-edm-ai-newsletter-2026-05-21.md (first feature)
**Goal:** every feature earns its place. Powerful, concise, compact. Brain-dead ease of use at every point. Tate directive 2026-05-21: "we have a tendency to overload with useless features or very spread out features, but we need to be powerful, concise, compact, and at every point prioritise brain-dead ease of use".

## First principles: jobs-to-be-done

Before listing screens, what are member-orgs trying to do?

**For members:** 6 jobs.

1. **Join** the chamber. Apply, pay, get in.
2. **Be seen** as a business. Appear in the directory, get found.
3. **Show up** to what's on. See events, RSVP, attend.
4. **Connect** with other members. Find them, request an intro.
5. **Belong** to the community. Get the newsletter, get notified, feel part of it.
6. **Renew** annually. Pay dues, stay active.

**For officers (the EO + committee):** 6 jobs.

1. **Onboard** a new chamber. Set up branding, members, payment, sending domain.
2. **Communicate** to the membership. Newsletters, notifications, comms.
3. **Run events.** Create, manage, see who's coming.
4. **Manage membership.** Approve applicants, see who's lapsing, prompt renewals.
5. **Get paid.** Dues, ticket revenue, sponsor payments.
6. **Report.** See engagement, member growth, retention.

**12 jobs total.** Each should map to one screen, occasionally two. The whole product fits in 12-20 screens. Not 31.

## Current chambers-frontend inventory (audit)

**Public routes: 21**
Home, Events, EventDetail, Members, Profile, Groups, GroupDetail, Resources, Feedback, Privacy, Terms, ChamberSignUp, ChamberSignUpConfirm, ChamberSignUpSent, MemberSignUp, SignIn, SignUp, ResetPassword, VerifyChamber, TenantNotFound, NotFound.

**Admin routes: 11**
Dashboard, BillingAdmin, BrandingAdmin, CommitteesAdmin, EventsAdmin, GroupsAdmin, MembersAdmin, NotificationsAdmin, OnboardingWizard, PrivacyAdmin, Settings.

**Total: 32 routes** for what is fundamentally "members + events + comms + setup." Too spread out.

### Audit verdict per route

**Cut: does not earn its place.**

| Route | Reason |
|---|---|
| Resources | Most chambers don't have substantive resources content. Stub since launch. |
| Feedback | Dedicated feedback page is overkill. In-app contact link suffices. |
| Groups (standalone) | Index belongs on the member-side directory as a filter. |
| ChamberSignUpConfirm + ChamberSignUpSent | Three-step signup is wizard-thinking. Replace with ONE conversational onboarding. |
| VerifyChamber | Should be inline in signup confirmation. No separate route. |
| CommitteesAdmin | Duplicate of GroupsAdmin (committees was the old name). |
| PrivacyAdmin | Privacy settings live as global config inside Setup. |
| Settings | Vague catch-all. Fold into Setup. |
| NotificationsAdmin | Notification templates fold into the comms surface. |
| OnboardingWizard | The FIRST experience for a new chamber. No sidebar route. |

**10 routes cut.**

**Keep + collapse.**

| Existing | Collapsed into |
|---|---|
| Dashboard + BillingAdmin (read-only stats) + MembersAdmin reports | **Pulse** (officer home with AI composer) |
| MembersAdmin (CRUD + applications + segments) + GroupsAdmin (member groupings) | **People** |
| EventsAdmin | **Events** (officer) |
| BrandingAdmin + BillingAdmin (write) + Settings + PrivacyAdmin + integrations | **Setup** |
| Members + Groups + GroupDetail + Resources | **Discover** (directory + segments) |
| Events + EventDetail | **Events** (member, with detail as drawer) |
| Profile + MemberSignUp | **Me** (signup folds into auth flow) |
| Home | **Home** (kept) |

**Final structure: 8 core screens + 8 utility pages = 16 screens.** Down from 32.

## Proposed feature architecture

### Member side: 4 screens

#### 1. Home

**Single purpose:** what's happening now and next.

Content:
- Hero strip: chamber name, branding, weekly AI-generated tagline.
- Next event card with RSVP CTA.
- New members joining this week (3-card carousel).
- "Renew my membership" quick action (only visible within 60 days of renewal).
- Footer: chamber contact, social.

What's NOT here: lengthy event lists, full directory, news feed, settings.

#### 2. Discover

**Single purpose:** find and connect with other members.

Content:
- Search bar (name, business, industry, suburb).
- Filter chips: industry, tier, location, group.
- Member cards with photo, name, business, suburb, one-line bio.
- Member detail (drawer): full bio, contact, "Request intro" button (AI-drafted, in-app notification), attended events, common groups.

What's NOT here: lead scoring, CRM pipeline, sales tracking.

#### 3. Events

**Single purpose:** what's on, RSVP, attend.

Content:
- Upcoming events list (cards: image, name, date, RSVP count).
- Past events tab (with AI recap content if available).
- Event detail (drawer): full description, map, attendees (opted-in), RSVP/un-RSVP, calendar export, ticket purchase if paid.

What's NOT here: complex multi-tier ticketing UI, dietary forms beyond simple text field, per-event sponsorship tiers.

#### 4. Me

**Single purpose:** my membership, my profile, my history.

Content:
- Profile photo + business profile (edit inline).
- Membership status (tier, renews on, last paid).
- "Renew now" button (prominent <60 days from renewal).
- My RSVPs (upcoming + past).
- My groups.
- Notification preferences (3 toggles max).
- Sign out.

What's NOT here: deep account settings, third-party integrations from member side, detailed billing history.

### Officer side: 4 screens

#### 1. Pulse

**Single purpose:** what needs attention right now + AI compose.

Content:
- **AI Composer card (top, prominent):** "Draft this week's newsletter." Click triggers cross-domain AI compose using events + members + lapses + sponsors. Edit inline + send.
- Stats strip: total members, active members, this month new, this month lapsed, MRR if paid memberships.
- "Members at risk" card: top 5 by engagement-decline + renewal-proximity. Tap to send AI-personalised nudge.
- "Next event" card: RSVP count, day-of checklist.
- "Sponsor update" card when applicable.

What's NOT here: deep analytics drilldowns (those live elsewhere), full activity feed.

#### 2. People

**Single purpose:** members, applications, segments, outreach.

Content:
- Tabs: Members, Pending Applications, Segments.
- Members tab: searchable + filterable, with engagement score, last activity, renewal date. Bulk actions (tag, segment, AI-personalised message).
- Pending Applications: approve/reject one tap each.
- Segments: AI-suggested + manual. Click a segment, get action menu (message, invite to event, export).

What's NOT here: manual query builder for segments (let AI do it), complex CRM pipeline.

#### 3. Events (officer view)

**Single purpose:** create, manage, see attendance.

Content:
- Upcoming + past events list.
- Create event: name, description, date, location, capacity, paid/free (tier inline), member-only or open.
- Per-event drawer: attendees list, check-in mode for day-of, "Send AI recap" button (auto-runs post-event, officer can re-trigger).

What's NOT here: venue booking workflow, multi-day conference + breakout sessions (defer until a paying customer asks).

#### 4. Setup

**Single purpose:** configure the chamber.

Content (sections inside the page, no subroutes):
- Branding: logo, primary colour, hero, voice tone profile.
- Billing: connect Stripe, set tier prices, renewal terms, view recent payments.
- Integrations: Xero, Resend (sending domain), Slack/Teams committee channel.
- Team: officers + permissions (3 levels: owner, officer, view-only).
- Domain: subdomain + custom domain.
- Danger zone: archive, export, transfer ownership.

What's NOT here: separate billing admin, separate notifications admin, separate privacy admin (all folded here under right section).

### Auth + utility (8 pages, kept lean)

SignIn, SignUp, ResetPassword, ChamberSignUp (single conversational onboarding), Privacy, Terms, TenantNotFound, NotFound.

## The cross-domain interconnectedness (the actual differentiator)

This is the part that beats Mailchimp + Eventbrite + Stripe siloed.

**Every screen has access to the full tenant substrate.** A single `tenant_id` scopes everything. Cross-domain queries are one SQL call. No three-API-roundtrip dance.

### Specific cross-domain wires

1. **AI Composer (Pulse)** queries:
   - `tenant_events` (upcoming + just-finished)
   - `tenant_members` (new joiners, renewals, at-risk where `last_engaged_at < now() - interval '60 days'`)
   - `tenant_team` and `tenant_sponsors` (sponsor news)
   - `tenant_branding.voice_profile` (tone-match)
   
   Returns a single draft referencing all of them appropriately. One database query under 200ms.

2. **Members at risk (Pulse)** combines:
   - Engagement score (RSVPs + email opens + clicks + directory views, last 90 days)
   - Renewal date proximity
   - Last activity date
   
   Returns a ranked list. Tap → AI drafts personalised nudge using their event history.

3. **Event creation (Events officer)** auto-suggests:
   - Speaker recommendations from member directory by past member-set interests
   - Time slot recommendations based on past event RSVP patterns
   - Capacity recommendation based on past similar events

4. **Member detail (Discover/People)** shows + composes:
   - Profile (members)
   - Events attended (RSVP table joined)
   - Groups belonged-to
   - Recent activity (computed view)
   - "Draft an intro" button → AI uses both profiles for context

5. **Renewal (Me)** considers:
   - Member tier
   - Engagement score (discount for low-engagement comeback, fast-renew for top-engaged)
   - Outstanding event tickets owed

6. **Onboarding (ChamberSignUp)** asks 5 conversational questions:
   - Chamber name + region
   - Existing site URL (AI scrapes for logo, branding, member list, recent events)
   - Voice tone (sample 2 paragraphs of their current comms)
   - Stripe + Resend connect
   - First newsletter target date
   
   AI provisions the tenant with everything pre-loaded. Officer ships in 10 minutes.

### Architectural rule

No feature ships unless the data it needs is already in the tenant substrate. No silos. No "we need to integrate with X" for member-level data. Integrations are for adjacent systems (Xero for accounting export, Resend for sending), never for member-level data the platform should already hold.

## Brain-dead UX principles

12 rules. Encoded so they don't drift.

1. **Officer should never need a manual.** Every screen's primary action is the most-common-done action, sized large.
2. **No nested admin/admin/sub-admin.** Maximum 2 levels deep, ever.
3. **AI is one button-press, never multi-step.** "Draft this week's newsletter" works on a single click, returns in under 30 seconds.
4. **Mobile-first for everything.** Primary action sits bottom-of-screen on phone. Tap targets ≥44pt. Officer does most of their work on a phone. Laptop is secondary.
5. **No "Settings" tab.** Settings live next to the thing they configure.
6. **Drawer over new route.** Detail views are drawers/modals. No URL-routed screens for detail.
7. **One primary CTA per screen.** No competing buttons.
8. **Sensible defaults everywhere.** Officer can ship a chamber in 10 minutes without touching defaults.
9. **No empty states with cute illustrations.** If a state is empty, surface the action that fills it (e.g. empty Members tab → "Import from CSV" + "Invite by email" buttons).
10. **No notification fatigue.** Members get ≤2 in-app + ≤1 email per week unless they opt up.
11. **Onboarding is a conversation.** No wizard with N steps. AI extracts what's needed.
12. **Cuts before additions.** When adding a feature, check what comes out at the same time.

## What we will NEVER build (anti-feature list)

Recording so it doesn't drift back in:

- Lead scoring / sales pipeline (we're not a CRM)
- Marketing automation funnels beyond the AI composer (over-engineered for chambers)
- Custom landing-page builder (use branded home, that's enough)
- Surveys (Google Form link if needed)
- Bulletin board / forum (chambers use FB group or Slack already)
- Job board (only build when a chamber asks twice)
- Document library (only build when asked)
- Sponsor portal / sponsor self-service (sponsors are a 10/year touchpoint and don't need a portal)
- Advanced reporting + dashboard customisation (Pulse covers what's needed; CSV export for the rest)
- Custom email-template builder (AI composer IS the template builder)
- White-label admin theming (we white-label the public side via branding; admin stays consistent)
- Multi-language support (single locale until a paying customer asks)
- SSO / SAML (until a paying customer asks)
- Native desktop app (Capacitor mobile + web is enough)

## Build sequence

Five phases. Five weeks part-time.

| Phase | Window | Work |
|---|---|---|
| **A. Collapse + refactor** | Week 1 | Cut 10 routes, merge to 8 core + 8 utility shape. No new features in this phase. Pure refactor + test. |
| **B. AI cross-domain compose** | Week 2 | Pulse AI Composer ships. Newsletter draft via cross-domain context. Resend wired. (Build brief already written.) |
| **C. AI event recap + AI member-matching** | Week 3 | Auto event recap from photos + RSVP + Q&A. "Request intro" on Discover with AI-drafted intro. |
| **D. Commodity parity** | Week 4 | Xero, paid ticketing (dietary + voucher), direct debit (BECS), sponsor management surface inside Setup. |
| **E. AI conversational onboarding** | Week 5 | ChamberSignUp becomes single conversational flow. Site-scrape + tenant provisioning. |

**Phase A first is non-negotiable.** Building new features on the bloated existing architecture compounds the spread-out problem. Refactor first.

## Open design questions for Tate

1. **Drawer vs route for detail views.** Drawer (proposed) is simpler UX, no URL state but feels native-mobile. Route is share-able and back-button friendly. Drawer wins for native feel, route wins for share-ability. My pick: drawer for now, can flip individual details to routes later if officers ask.
2. **Member messaging: in-app only or email fallback?** In-app only is cleaner (no email spam) but requires members to come back to the app. Email fallback adds complexity but lifts engagement. My pick: in-app primary, optional email fallback per-member preference.
3. **Renewal flow: officer-managed or member-self-serve?** Self-serve (Me page "Renew" button) is brain-dead UX. Officer-managed gives EO control over edge cases. My pick: self-serve default, officer can override per-member.
4. **Public side default landing: Home or Events?** Home is brand-anchored. Events is action-anchored ("what's on?"). Most chambers lead with events. My pick: configurable in Setup, default Events for chambers + default Home for non-chamber tenants.
5. **The anti-feature list above.** Anything on it you want included? Anything missing that should be on it?

## Audit corrections (post-implementation read 2026-05-21)

Reading the actual chambers-frontend code (not just route names) corrected several Phase A cut verdicts. The original audit was based on the April buildout plan and over-stated what was cuttable.

- **CommitteesAdmin keep.** Operates on the `committees` table (governance bodies). Genuinely different concept from GroupsAdmin which operates on `focus_groups` + `focus_group_categories` (member interest segments with chat). Both stay.
- **Resources keep.** Substantial gradient-tile + asymmetric grid surface, ~330 lines of working UI pulling from `tenant_resources` + auto-including chamber social links. Real feature.
- **Feedback keep.** Working contact form that sends emails via supabase auth session. Small but real.
- **OnboardingWizard keep.** First-login officer experience at /admin/onboarding. Could be cut from explicit sidebar nav, but the route is the wizard's home.
- **NotificationsAdmin + PrivacyAdmin already consolidated.** Live as tabs under /admin/settings/* already. Doctrine `consolidate-ui-primitives-do-not-add-parallel-ones` referenced in AdminLayout. The "Setup" concept from the plan ≈ existing "Settings".

### Remaining Phase A items still valid

- ✅ Billing → Settings tab (d531e06 2026-05-21)
- (?) ChamberSignUp + Confirm + Sent consolidation — auth/email-verification flow. Risky to touch without full QA pass. Deferred until a paying customer or design pass demands it.

### Net Phase A result

The Settings tab consolidation pattern + the in-flight UI primitive sweep (21 commits today on `feat/ui-sweep-member-facing-2026-05-21`) had already done most of what the original Phase A planned. Only legitimate cut was the Billing fold, which landed in d531e06.

Phase A effectively complete. Phase B (AI newsletter compose) begins with 0011_newsletter_campaigns.sql migration.

---

## What changes from earlier docs

- **chambers-roadmap-and-rebrand-2026-05-21.md** still holds for strategic position + market sizing + competitive landscape. The product Tier 1/2/3 in that doc gets superseded by the 5-phase build sequence here.
- **chambers-build-brief-edm-ai-newsletter-2026-05-21.md** still holds for the first feature build, but it's Phase B not Phase A. Phase A (refactor) comes first.

## Next concrete moves on your go

1. Status_board row for the feature plan (substrate write).
2. Phase A refactor: I read chambers-frontend deeply, then ship the route-collapse + merge work inline in this session. PR-able branch by end of Week 1.
3. Phase B onwards: workers can run in parallel once the architecture is clean.

Standing by, or say "go" and I start Phase A with the route audit + collapse plan.

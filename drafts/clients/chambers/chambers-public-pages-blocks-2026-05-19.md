# Chambers Public Pages - Block Inventory

**Generated:** 2026-05-19
**Scope:** 21 user-facing pages in [chambers-frontend/src/pages](D:/.code/chambers-frontend/src/pages/), excluding `/admin/`.
**Purpose:** Hand-off brief for a design-focused Claude session. Each page is enumerated as a sequence of blocks with the data each block reads and the actions a user can take. **No design opinions - only what exists, in source order.** Use this as the input to redesign.

---

## Routes at a glance

| # | Route | Page | Auth gate | Purpose |
|---|-------|------|-----------|---------|
| 1 | `/` | Home | public, tenant-resolved | Chamber landing: hero, mission, values, upcoming events teaser, contact, socials |
| 2 | `/events` | Events | public, tenant-resolved | Upcoming + past events grid with calendar export buttons |
| 3 | `/events/:id` | EventDetail | public, tenant-resolved (RSVP requires member) | Single event view with RSVP and attendees |
| 4 | `/groups` | Groups | signed-in member | Focus group list, grouped by category, with recency + message-count |
| 5 | `/groups/:id` | GroupDetail | signed-in member | Realtime chat for a focus group with message editing + event embeds |
| 6 | `/members` | Members | signed-in member | Searchable member directory with detail drawer + tiers |
| 7 | `/resources` | Resources | public, tenant-resolved | External resource links + social platforms |
| 8 | `/profile` | Profile | requires sign-in branch | Auth-account + membership application + member profile management |
| 9 | `/feedback` | Feedback | public | Free-form feedback form to the chamber |
| 10 | `/signin` | SignIn (two modes) | public | Sign in OR request a password reset link |
| 11 | `/signup` | SignUp | public | Create the auth account (step 1 of joining) |
| 12 | `/privacy` | Privacy | public | Static privacy policy |
| 13 | `/terms` | Terms | public | Static terms of service |
| 14 | `/sign-up/:chamberSlug` | MemberSignUp | platform route, public | Public member sign-up by chamber slug |
| 15 | `/sign-up/:chamberSlug/confirm` | MemberSignUpConfirm | platform route, public | Email verification handler for MemberSignUp |
| 16 | `/onboarding/chamber` | ChamberSignUp | platform route, public | 3-step new-chamber creation |
| 17 | `/onboarding/chamber/sent` | ChamberSignUpSent | platform route, public | "Check your email" after chamber creation |
| 18 | `/onboarding/chamber/confirm` | ChamberSignUpConfirm | platform route, public | Email verification handler for ChamberSignUp |
| 19 | `/verify-chamber/:token` | VerifyChamber | platform route, public | Admin-initiated chamber verification link |
| 20 | (fallback) | TenantNotFound | shown when tenant fails to resolve | "No chamber here yet" + chamber sign-up CTA |
| 21 | (recovery) | ResetPassword | recovery-hash required, above tenant | Password recovery form (consumes `#type=recovery` hash) |
| - | `*` | NotFound | catch-all inside tenant shell | "Page not found" with home link |

Platform routes (16-20) render above tenant resolution. Tenant-resolved routes (1-9) only render when `useTenant()` succeeds; on failure the user gets `TenantNotFound` (#20).

---

## 1. Home - `/`

- **Auth gate:** public, tenant-resolved
- **Purpose:** Chamber landing - hero, mission, values, upcoming events teaser, contact, socials.
- **Data sources:** `useTenant()` (name, mission, values, contact email/phone/address/hours, logo, hero image, socials, footer tagline), `useTenantEvents()` (limited to 3 upcoming), `useAuth()` (signed-in state for CTA routing).
- **User actions:** scroll the page; click "Become a member" CTA; tap an event card → `/events/:id`; tap email/phone/address/social links; tap privacy/terms.

**Blocks (in source order):**

1. **Hero section** - full-bleed top. **Content:** optional background image with darkening gradient overlay, tenant logo (or initial fallback), `h1` headline, optional subheadline paragraph, primary "Become a member" CTA, animated `WaveDivider` at the bottom edge.
2. **Mission section** (conditional on `tenant.mission`) - section heading + mission statement, whitespace-preserved.
3. **Values grid** (conditional on `tenant.values.length > 0`) - responsive grid (5 cols ≥lg, 3 default, 2×2 when exactly 4). **Card content:** Sparkles icon (or icon mapped by `icon_slug`), label, description.
4. **Upcoming events teaser** (conditional on ≥1 upcoming event) - "Upcoming events" heading + up to 3 simplified event cards. **Each card:** cover image (or gradient + Calendar icon), title, date chip, "Learn more" link → `/events/:id`.
5. **Contact section** - section heading + intro line, then four self-contained cards (each conditional on data presence): Email (Mail icon, mailto), Phone (Phone icon, tel), Address (MapPin icon, full address), Hours (Clock icon, free-text hours).
6. **Social footer** (conditional on `tenant.socials`) - row of social platform icons + optional footer tagline below.
7. **Page footer** - Privacy + Terms links (text only).

---

## 2. Events - `/events`

- **Auth gate:** public, tenant-resolved
- **Purpose:** Browse upcoming and past events.
- **Data sources:** `useTenant()` (name), `useTenantEvents()` (all), `useAuth()`, `useMyMember()` (officer check for the create-event button).
- **User actions:** open an event; add an upcoming event to Google / Outlook / Apple calendars (icon-only buttons); toggle "Past (N)" open; officers see a "Create event" CTA → `/admin/events`.

**Blocks:**

1. **Page header** - `h1` "Events" + tagline interpolating tenant name.
2. **Loading state** (`isLoading`) - 2-column responsive skeleton grid, 2 cards `h-72`.
3. **Empty state** (no events at all) - Calendar icon, title, description, officer-only "Create event" button.
4. **Upcoming label** - small uppercase muted label `UPCOMING`.
5. **Upcoming event card** × N (sorted by date asc). **Each card content:**
   - Cover (image or gradient + Calendar icon)
   - Title (`h3`)
   - Date/time row (Calendar icon + formatted date/time)
   - Location row (MapPin icon + location) - conditional
   - RSVP count row (Users icon + count) - conditional
   - 2-line description excerpt - conditional
   - Action row: "View & RSVP" (primary), Google, Outlook, Apple calendar icon-only buttons (each conditional on `starts_at`)
6. **No-upcoming filler** (when there are past events but no upcoming) - surface card with large Calendar icon (opacity 40), "No upcoming events" heading, description, officer-only "Create event" CTA.
7. **Past toggle row** (conditional on past.length>0) - chevron icon + "Past (N)" label, collapsible.
8. **Past event card** × N (sorted by date desc, opacity-80). Same fields as upcoming except: "View details" button only, no calendar export icons, `isPast=true` styling hint.

---

## 3. EventDetail - `/events/:id`

- **Auth gate:** public, tenant-resolved; RSVP requires signed-in member.
- **Purpose:** Read an event, RSVP, see who's going, add to calendar.
- **Data sources:** `useTenant()`, `useTenantEvent(id)` (title, description, starts_at, ends_at, location, cover_url, rsvp_count, attendees), `useAuth()`, `useMyMember()`, `useMyEventRsvp(id)`.
- **User actions:** Back link to `/events`; tap "Going" avatars to open attendees modal; RSVP / cancel RSVP; calendar export; read description.

**Blocks:**

1. **Back link** - "← Back" → `/events`.
2. **Event cover** - full-width image or gradient + Calendar icon (no max-width clamp).
3. **Header block** - title (`h1`), date row (Calendar icon + formatted date + time range), location row (MapPin icon + location) conditional, attendee count row (Users icon + `N going`) conditional.
4. **Going strip** (conditional on `rsvp_count > 0`) - overlapping avatar chips (36px, -12px overlap), max 8 visible, "+N more" pill when truncated, full strip is clickable → opens **AttendeesModal**.
5. **Description block** (conditional) - whitespace-preserved body text.
6. **RSVP block - four mutually exclusive branches:**
   - **6a. Not signed in** - info pill "Sign in to RSVP" + primary "Sign in" button (full width).
   - **6b. Signed in, not a member** - info pill "Members can RSVP" + primary "Apply to join" button.
   - **6c. Signed in, member, RSVP'd** - "You're going" status, going-count badge, "Cancel RSVP" secondary button.
   - **6d. Signed in, member, not yet RSVP'd, event not past** - primary "RSVP" button (full width), disabled if event is past.
   - All branches emit a Toast on success/error.
7. **Calendar button row** (conditional on `starts_at` AND event not past) - Google / Outlook / Apple icon-only secondary buttons.
8. **AttendeesModal** - mounted when invoked. Header ("Going" label + close X), scrollable list of `MemberListItem` (avatar, name, title, bio), full-screen dark overlay (click-to-close).
9. **Toast** - ephemeral bottom toast, auto-dismiss ~2.2s, success or error variant.

---

## 4. Groups - `/groups`

- **Auth gate:** signed-in member.
- **Purpose:** Browse focus groups grouped by category.
- **Data sources:** `useTenant()`, `useFocusGroupCategories()` (label, description), `useFocusGroups()` (category_id, name, description, last_message_at, message_count), `useAuth()`, `useMyMember()` (officer check).
- **User actions:** open a group → `/groups/:id`; officer sees "Create group" → `/admin/groups`; retry on error; observe staggered reveal animation.

**Blocks:**

1. **Page header** - `h1` "Focus Groups" + tagline.
2. **Loading state** - 5 skeleton cards (`h-24` rounded).
3. **Error state** - surface card: "Couldn't load focus groups" + message + "Retry" button with RefreshCw icon.
4. **Empty state** (`groups.length === 0`) - surface card: Sparkles icon (large, primary), "No focus groups yet", explanatory sentence, officer-only "Create group" button.
5. **Category section** × N - wrapped in `ScrollReveal`. **Section header row:** category label (`h2`), description (caption, optional), right-aligned count chip. **Then a `StaggeredList` (40ms stagger) of group cards.**
   - **Group card content:** Hash icon badge (12×12, primary bg), group name (semibold), last-message timestamp (right-aligned caption: "No messages yet" | "just now" | "Nm ago" | "Nh ago" | "Nd ago" | dd Mmm), 2-line description excerpt (conditional), message-count badge (MessageCircle icon + count + "message(s)").
6. **Uncategorized section** (conditional) - "Other groups" `h2` then the same `StaggeredList` of cards for groups without a `category_id`.

---

## 5. GroupDetail - `/groups/:id`

- **Auth gate:** signed-in member (disabled-state overlay for non-members).
- **Purpose:** Real-time chat for a focus group with optional event embeds.
- **Data sources:** `useTenant()`, `useFocusGroup(id)`, `useFocusGroupMessages(id)` (Supabase realtime), `useAuth()`, `useMyMember()` (officer + status), `useEvent(eventId)` for event embeds inside messages.
- **User actions:** scroll history; send a message; edit own message; delete own message (with confirm); pick an event to embed in a message; auto-scroll on new messages.

**Blocks:**

1. **Sticky header** - back link → `/groups`, group name (`h2`), optional description (caption).
2. **Message stream** (scrollable). Day separators: centered caption "19 May" between message groups. **Message row content:** avatar (36×36, deterministic color per `member_id`), name (semibold), officer badge (conditional, "Officer" pill), relative timestamp ("2h ago"), "(edited)" badge (conditional), message body (whitespace-preserved, click-to-enter-edit if author), action buttons on hover for the author (pencil edit, trash delete).
3. **EventEmbed** - nested inside any message that referenced an event: event title, date/time, location; falls back to "Event no longer available" if deleted.
4. **Message edit mode** (replaces body inline) - pre-filled textarea, primary "Save" button, secondary "Cancel" button.
5. **Inline delete confirm** - alert pill "Delete this message?" with danger "Delete" + secondary "Cancel".
6. **Sticky input footer** - "Share event" dropdown picker (lists available events, click to insert embed reference), auto-grow textarea (placeholder "Type a message..."), primary "Send" button.
7. **Disabled overlay** (non-member or signed-out) - full-screen blocking state: "Join the chamber to participate in focus groups" + "Sign up or apply to join" button.

---

## 6. Members - `/members`

- **Auth gate:** signed-in member.
- **Purpose:** Searchable member directory.
- **Data sources:** `useTenant()`, `useTenantMembers()`, `useAuth()`, `useMyMember()`.
- **User actions:** search-as-you-type; filter by first letter A-Z, `#`, or All; clear filters; open `MemberDrawer`; officer can view tier section in drawer.

**Blocks:**

1. **Page header** - `h1` "Members" + tagline.
2. **Search row** - search input (placeholder "Search members..."), clear-X button (conditional on input).
3. **Letter filter row** - chips A through Z, `#`, "All"; "Clear filters" button conditional on active filters.
4. **Result count caption** - "Showing N result(s)" (conditional).
5. **Member grid** - 2-3 column responsive. **Card content:** avatar (72×72), name (`h3` semibold), title (caption muted, optional), 2-line bio excerpt (caption muted, optional). Entire card opens `MemberDrawer`.
6. **MemberDrawer** (overlay panel). **Content:** close X (top-right), large avatar (96×96), name (`h2`), title (caption, optional), full bio body (or "No bio provided" fallback), social links row (conditional).
7. **Membership tiers section** inside the drawer (conditional on tenant having tiers + viewer is officer or applicant). **Tier card content:** "Popular" badge on the middle tier, tier name (`h3`), formatted price + interval ("$50 / year"), benefits list with checkmark icons, action button ("Join" if not in tier, "View details" if member).
8. **Dark overlay** behind drawer - click-to-close.

---

## 7. Resources - `/resources`

- **Auth gate:** public, tenant-resolved.
- **Purpose:** External resource links and social platforms.
- **Data sources:** `useTenant()`, `useTenantResources()` (icon_slug, title, description, url), `useTenantSocials()` (type, url).
- **User actions:** open a resource in a new tab; open a social profile in a new tab.

**Blocks:**

1. **Page header** - `h1` "Resources" + tagline.
2. **Resources section** (conditional on `resources.length > 0`) - "Useful resources" heading wrapped in `ScrollReveal`, then `StaggeredList` of cards. **Card content:** icon (mapped by `icon_slug`, fallback ExternalLink), title (`h3`), description (caption, optional), external-link indicator.
3. **Socials section** (conditional on `socials.length > 0`) - "Follow us" heading + `ScrollReveal` + `StaggeredList`. **Card content:** platform icon, platform name, link.
4. **Empty state** (conditional on neither resources nor socials) - generic empty card with optional CTA.

---

## 8. Profile - `/profile`

- **Auth gate:** tenant-resolved; renders five branches based on auth + membership state.
- **Purpose:** Sign-in landing, membership application, member profile management.
- **Data sources:** `useAuth()` (user + signOut), `useTenant()`, `useMyMember()`, `useMyMemberApplication()`, `usePhotoBucket()` for the avatar upload.
- **User actions:** upload profile photo; submit / update membership application; edit member profile; sign out; tap privacy/terms.

**Blocks per branch:**

### 8a. Not signed in
1. `h1` "Sign in to your profile"
2. Description text
3. Primary "Sign in" button → `/signin`
4. Secondary "Create an account" button → `/signup`

### 8b. Signed in, no member, no application
1. **Photo upload block** - avatar circle (96×96), camera button overlay, hidden file input, type/size validation errors.
2. **Application form** - fields: Full name (text, required), Email (text, read-only pre-filled), Business or organization (text, optional). Primary "Apply" button (disabled if invalid). Error display (status-danger alert).
3. **"What happens next" info card** - text: "You'll hear from us within 2 business days."
4. **Sign-out section** - "Sign out" button.
5. **Footer** - Privacy + Terms links + optional version number.

### 8c. Signed in, no member, application pending
- Photo upload block (as above).
- Application form (read-only / disabled while pending).
- **Status badge** - animated "Pending" pill.
- **Info card** - Clock icon + "Your application is being reviewed" + optional "Email the chamber" CTA.
- "Update application" button (if editable).
- Sign-out + footer.

### 8d. Signed in, active member
- Photo upload block (editable).
- **Member profile form** - fields: Full name (editable), Email (read-only), Business or organization (editable, optional). Primary "Save" + error display.
- **Status badge** - animated "Active" pill (green indicator).
- Sign-out + footer.

### 8e. Signed in, member inactive / rejected
- Photo upload block.
- Profile form (read-only).
- Status badge - "Inactive" or "Rejected".
- Optional explanatory message.
- Sign-out + footer.

---

## 9. Feedback - `/feedback`

- **Auth gate:** public (may pre-fill email if signed in).
- **Purpose:** Send a free-form message to the chamber.
- **Data sources:** `useTenant()` (name, feedback email), `useAuth()` (optional).
- **User actions:** type subject + message; submit; see success state.

**Blocks:**

1. **Page header** - heading "Send feedback" (or "Get in touch") + optional tagline.
2. **Form** - "Subject" text input (optional, placeholder "What's this about?"); "Message" textarea (required, rows=6, placeholder "Tell us what you think..."); primary "Submit" button with loading state; error display.
3. **Info card** - MessageSquare icon + "We read every message" heading + explanation.
4. **Success state** (replaces form post-submit) - CheckCircle2 icon (green), "Thank you for your feedback" heading, "We'll get back to you soon" message, optional "Send another message" reset button.

---

## 10. SignIn - `/signin`

- **Auth gate:** public (redirects signed-in users to `/profile`).
- **Purpose:** Sign in OR request a password reset.
- **Data sources:** `useAuth()` (signIn, resetPassword), `useTenant()`, `useSearchParams()` for `next`.
- **User actions:** sign in; toggle password visibility; flip to forgot-password mode; submit reset request; return to sign-in; go to sign-up; tap privacy/terms.

### 10a. Sign-in mode (default)
1. **Header** - `h1` "Sign in" + tagline "Welcome back to [tenant name]."
2. **Form**
   - Email input (required, autocomplete `email`)
   - Password input with eye-icon visibility toggle (min 44×44 tap target); "Forgot password?" link inline with the password label (top-right).
   - Error display (status-danger).
   - Primary "Sign in" button (full width, icon + text, loading "Signing in...").
3. **Footer** - "New here?" + "Create an account" link → `/signup`. Privacy + Terms links at the bottom.

### 10b. Forgot-password mode (`mode === 'forgot'`)
1. **Header** - `h1` "Reset password" + tagline "Enter your email and we'll send you a reset link."
2. **Form** (when `!resetSent`)
   - Email input (required).
   - Error display.
   - Primary "Send reset link" button (Mail icon + text, loading "Sending...").
   - Secondary "Back to sign in" link.
3. **Reset-sent confirmation** (when `resetSent`)
   - Surface card with Mail icon badge (12×12, accent bg).
   - `h2` "Check your inbox."
   - Body: "If an account exists for [email], you'll get a link to set a new password in the next minute or two."
   - Primary "Back to sign in" button (ArrowLeft icon).

---

## 11. SignUp - `/signup`

- **Auth gate:** public (redirects signed-in users to `/profile`).
- **Purpose:** Create the auth account (step 1 of joining).
- **Data sources:** `useAuth()` (signUp), `useTenant()`.
- **User actions:** type email + password; submit; navigate to sign-in; tap privacy/terms.

**Blocks:**

1. **Header** - `h1` "Create your account" + tagline "First step toward joining [tenant name]. You'll fill in your membership details on the next screen."
2. **Form** - Email (required); Password (required, minLength 8, autocomplete `new-password`); caption "At least 8 characters"; error display; primary "Create account" button (UserPlus icon + text, loading "Creating account...").
3. **Footer** - "Already a member?" + "Sign in" link → `/signin`. Privacy + Terms.

---

## 12. Privacy - `/privacy`

- **Auth gate:** public.
- **Purpose:** Static privacy policy.
- **Data sources:** `useTenant()` (name + contact email for the Contact section).
- **User actions:** scroll; tap mailto; tap optional back-link.

**Blocks:**

1. **Optional back link** - "← Back to sign in" when referrer is `/signin`.
2. **Header** - `h1` "Privacy Policy" + last-updated date ("5 May 2026").
3. **Policy body - 10 static sections, in order:**
   1. Introduction
   2. Information Collected
   3. How We Use Your Information
   4. Data Sharing
   5. Data Retention
   6. Data Security
   7. Your Rights
   8. Cookies
   9. Changes to This Policy
   10. Contact Us (interpolates tenant name + contact email)

---

## 13. Terms - `/terms`

- **Auth gate:** public.
- **Purpose:** Static terms of service.
- **Data sources:** `useTenant()` (name + contact email).
- **User actions:** scroll; tap mailto; tap optional back-link.

**Blocks:**

1. **Optional back link** - "← Back to sign in" when referrer is `/signin`.
2. **Header** - `h1` "Terms of Service" + last-updated date.
3. **Terms body - 11 static sections:**
   1. Acceptance of Terms
   2. Description of Service
   3. User Accounts and Registration
   4. Membership and Subscriptions
   5. Acceptable Use Policy
   6. Intellectual Property
   7. Limitation of Liability
   8. Termination
   9. Changes to Terms
   10. Governing Law and Jurisdiction
   11. Contact Us (interpolates tenant name + contact email)

---

## 14. MemberSignUp - `/sign-up/:chamberSlug`

- **Auth gate:** platform route, public. Resolves tenant from the slug, applies brand tokens.
- **Purpose:** Public sign-up to a specific chamber.
- **Data sources:** tenant by slug, `useTheme()` to apply brand tokens.
- **User actions:** fill form; submit; change email after submit; retry on error.

### 14a. Loading state (tenant lookup pending)
Spinner + "Loading..."

### 14b. Tenant error state (slug not found)
AlertCircle icon (warn color), heading "Chamber not found", description, primary "Sign your own chamber up" → `/onboarding/chamber`.

### 14c. Form state (default after tenant resolves)
1. **Header** - tenant logo (or Building2 fallback), caption "Join" (primary color), tenant name (`h1`), optional tenant tagline (muted subtitle).
2. **Application form**
   - Full name (text, required)
   - Email (email, required, autocomplete `email`)
   - Password (password, required, minLength 8, autocomplete `new-password`); caption "At least 8 characters".
   - Error display (status-danger).
   - Primary "Create account" button (UserPlus icon + text, loading "Creating account...").

### 14d. Submitted state
1. **Confirmation card** - CheckCircle2 icon (green, large), `h2` "Confirmation sent", "We've sent a confirmation link to [email]".
2. Secondary "Use a different email" button (resets the flow).
3. Optional resend link block - "Didn't receive the email? Resend link".

### 14e. Error state
AlertCircle icon (red), heading "Couldn't create account" + specific message, "Try again" button (resets form).

---

## 15. MemberSignUpConfirm - `/sign-up/:chamberSlug/confirm`

- **Auth gate:** platform route, public.
- **Purpose:** Email-verification handler for MemberSignUp; redirects to chamber on success.
- **Data sources:** verification token from URL fragment/query, `useTenant()` by slug, `useVerifyEmailToken()`.
- **User actions:** none (automatic); retry link on error.

**State blocks:**

1. **Waiting** - Loader2 spinner + "Verifying your email...".
2. **Joining** - Loader2 spinner + "Joining [chamber name]...".
3. **Success** - CheckCircle2 (green), `h2` "You're in", "Taking you to [chamber name]...", auto-redirect to `/?tenant=<slug>` after 1.5s.
4. **Error** - AlertCircle (red), `h2` "Couldn't finish joining", specific error body ("Link expired" / "Invalid verification" / "Account already exists"), "Try again" button + optional "Contact the chamber" link.

---

## 16. ChamberSignUp - `/onboarding/chamber`

- **Auth gate:** platform route, public.
- **Purpose:** Three-step new-chamber creation form.
- **Data sources:** `useCreateChamber()`, `useCheckSlugAvailability()` (debounced live check).
- **User actions:** advance through three steps; live-validate the slug; submit; see verification-sent confirmation.

**Persistent block:**
- **Step indicator** - `StepDots` (3 dots, current highlighted) + textual "Step 1 of 3".

### Step 1 - Chamber basics
**Fields, in form order:**
- **Chamber name** (text, required, placeholder "E.g., Melbourne Chamber of Commerce", optional char counter).
- **Slug** (text, required, lowercase + hyphens, derived from name but editable). Live-validation states: Checking (Loader2 + "Checking availability..."), Available (Check icon green + "Available"), Taken (AlertCircle red + "Already taken"). Display preview "chambers.com/<slug>".
- **Chamber type** - 4-option radio group: "Chamber of Commerce" | "Business Association" | "Professional Society" | "Other".
- **Country** - select (required).
- **State / region** (text or select; AU populates a state list when country=AU).
- **Continue button** - primary, disabled while slug is Checking or Taken; error display below.

### Step 2 - Contact & business
**Fields:**
- **Primary contact email** (email, required, autocomplete `email`); helper text "This is where we'll send the verification link."
- **ABN** (conditional on country=AU; 11 digits, auto-formatted "XX XXX XXX XXX", numeric only).
- **Continue button** (primary) + error display.

### Step 3 - Password & confirmation
**Fields:**
- **Password** (password, required, minLength 8, autocomplete `new-password`); helper "At least 8 characters"; optional visibility toggle.
- **Confirm password** (password, required, must match).
- **"What happens next" info block** - pre-written 4-item numbered list:
  1. We'll send a verification email to [email].
  2. Click the link in the email to confirm your chamber.
  3. You'll be directed to the admin dashboard.
  4. Set up your chamber profile (mission, values, contact info).
- **Create chamber button** - primary, loading "Creating chamber...".
- **Global error block** - status-danger alert with heading "Couldn't create chamber" + specific API error.

---

## 17. ChamberSignUpSent - `/onboarding/chamber/sent`

- **Auth gate:** platform route, public.
- **Purpose:** "Check your email" landing after ChamberSignUp submission.
- **Data sources:** email passed via route state / localStorage.
- **User actions:** read; optional resend; start over.

**Blocks:**

1. **Mail icon badge** (centered, accent bg).
2. **Headline** - `h1` "Check your email" + "We've sent a confirmation link to [email]".
3. **Status badge** - "Pending verification" (caption + icon).
4. **Instruction list** (numbered):
   1. Click the link in your email.
   2. If you don't see it in a few minutes, check your spam folder.
   3. You'll be guided through the next steps.
5. **Expiry/spam hint** - "Links expire in 24 hours" + optional "Didn't receive an email? Resend link".
6. **Start-over button** - secondary "Back to sign-up" / "Start over" → `/onboarding/chamber`.

---

## 18. ChamberSignUpConfirm - `/onboarding/chamber/confirm`

- **Auth gate:** platform route, public.
- **Purpose:** Email-verification handler for ChamberSignUp.
- **Data sources:** verification token from URL fragment/query, `useVerifyChamberToken()`.
- **User actions:** none on success (auto-redirect); retry on error.

**Phase blocks (mutually exclusive):**

1. **Waiting** - Loader2 + "Verifying your link...".
2. **Claiming** - Loader2 + "Activating your chamber...".
3. **Success** - CheckCircle2 (green, large), `h1` "You're in", body "Your chamber is ready. You'll be redirected to the admin dashboard in a moment.", primary "Open my admin" button, auto-redirect after 1.8s.
4. **Already claimed** - CheckCircle2 (primary), `h1` "Already activated", body "This chamber is already set up.", primary "Open my admin" button (no auto-redirect).
5. **Error** - AlertTriangle (danger), `h1` "Couldn't activate", error body, primary "Sign in" → `/signin`, secondary "Start over" → `/onboarding/chamber`, optional support contact.

---

## 19. VerifyChamber - `/verify-chamber/:token`

- **Auth gate:** platform route, public.
- **Purpose:** Admin-initiated chamber verification confirm link.
- **Data sources:** route param `token`, `useVerifyChamberPublic()`.
- **User actions:** none on load; tap "Sign in" / "Start over" / "Visit your chamber" / "Contact support".

**State blocks:**

1. **Pending** - Loader2 + "Verifying your chamber...".
2. **Success** - CheckCircle2 (green), `h1` "Chamber verified" (or "Already verified"), tenant-name display, optional "Sign in to your dashboard" line, primary "Sign in" → `/signin`, footer link "Visit your chamber" → `/?tenant=<slug>`, optional "Edit settings" link.
3. **Failed** - AlertTriangle (warn), `h1` "Verification failed", error message, primary "Start over" → `/onboarding/chamber`, footer "Contact support" link with support email.

---

## 20. TenantNotFound - fallback

- **Auth gate:** shown automatically when the tenant resolver fails (invalid subdomain, deleted chamber).
- **Purpose:** Surface a friendly "this chamber doesn't exist yet" + funnel to chamber sign-up.
- **Data sources:** none (pure error state).
- **User actions:** start a chamber; read the subdomain hint.

**Blocks:**

1. **Icon badge** - Building2 (large, primary or muted).
2. **Heading** - `h1` "No chamber here yet".
3. **Description** - "This chamber either doesn't exist or hasn't been set up yet."
4. **CTA** - primary "Sign your chamber up" (full width) → `/onboarding/chamber`.
5. **Footer hint** (optional) - "Already a member?" + "Try using the chamber's subdomain: `https://<chamberslug>.chambers.com`" (code-styled span).

---

## 21. ResetPassword - recovery handler

- **Auth gate:** rendered above tenant resolution when the URL hash contains `type=recovery`, OR when the user navigates directly to `/reset-password` on the platform host.
- **Purpose:** Set a new password using the recovery token in the URL fragment.
- **Data sources:** Supabase auth session (consumes the recovery hash), `supabase.auth.updateUser`.
- **User actions:** type new password + confirm; submit; auto-redirect to `/signin` on success.

**State blocks:**

1. **Verifying** - Loader2 spinner + "Verifying...".
2. **Form state** (token valid)
   - KeyRound icon + `h1` "Set a new password" + caption "Enter your new password below."
   - **New password** (password, required, minLength 8, autocomplete `new-password`); caption "At least 8 characters".
   - **Confirm password** (password, required, must match new password).
   - Error display (status-danger; messages include "Passwords don't match", "Password too short", "Token expired").
   - Primary "Update password" button, full width, loading "Updating...".
3. **Success state** - CheckCircle2 (green), `h1` "Password updated", body "Redirecting you to sign in...", auto-navigate to `/signin` after ~1.5s.
4. **Invalid / expired token state** - error pill: "This reset link is no longer valid. Request a new password reset email and click the link within an hour." Primary "Request a new link" → `/signin?mode=forgot`, secondary "Sign in" → `/signin`.

---

## NotFound - `*`

- **Auth gate:** catch-all inside the tenant shell.
- **Purpose:** "Page not found" with a home link.
- **Data sources:** none.
- **User actions:** go home.

**Blocks:**

1. **Heading** - large `h1` "404" (or "Page not found").
2. **Description** - "We couldn't find the page you were looking for."
3. **Primary CTA** - "Back to home" → `/`.

---

## Cross-cutting patterns the redesign should know about

- **Brand tokens at runtime.** Every page reads CSS custom properties from `:root` that are overridden by `applyBrandTokens()` based on the resolved tenant: `--color-primary`, `--color-secondary`, `--color-accent`, `--color-background`, `--color-foreground`, `--color-muted`, `--color-border`, `--color-surface`, `--color-primary-strong` (darkened for CTA contrast).
- **Typography scale.** Five-step ladder lives in tokens: `--text-caption` (12px) / `--text-body-sm` (14px) / `--text-body` (16px) / `--text-heading-3` (20px) / `--text-heading-2` (24px) / `--text-display` (36px). Page-level arbitrary `text-[15px]` is forbidden.
- **Card elevation.** Three shadow tokens: `--shadow-card-soft` (resting), `--shadow-card-hover`, `--shadow-card-elevated`. Borders are only for inputs, table rows, list dividers, and the AppShell header bottom edge.
- **Status palette.** `--status-{success,warn,danger,neutral}-{bg,fg}` for badges and pills.
- **Safe-area + bottom tab.** `--safe-area-{top,right,bottom,left}` mirror `env(safe-area-inset-*)`. `--bottom-tab-reservation` = 60 + 12 + bottom-inset px; every page's main scroll container reserves this so content doesn't hide under the floating tab bar.
- **Animation primitives.** `ScrollReveal` (Framer Motion fade-up on scroll-into-view), `StaggeredList` (40ms stagger), per-route page transitions via `PageFrame` (fade + small Y-translation, 220ms, respects `prefers-reduced-motion`).
- **Forms.** Input/select/textarea computed at 16px to avoid iOS zoom on focus; viewport meta sets `maximum-scale=1.0, user-scalable=no`. Inputs use a 2px primary focus ring at 2px offset.
- **Tap targets.** Buttons have `touch-action: manipulation` to suppress double-tap zoom; icon-only buttons are min 44×44.
- **Wave divider** (`<WaveDivider />`) is the visual signature at the Home hero footer - it's a brand element worth preserving across redesigns.
- **Header.** `AppShell` provides a sticky top header (logo + nav) on every tenant-resolved route; platform routes render without it. Plan around the header reserving roughly 64px + safe-area-top.
- **Bottom tab bar.** Same `AppShell` mounts a floating bottom tab bar on tenant-resolved routes - links to Home, Events, Members, Groups, Profile (or similar; verify against `AppShell`).
- **Sign-out side-effect.** `signOut()` also clears `localStorage.active_chamber` and `localStorage.chambers.tenantOverride` so the next sign-in lands on a fresh tenant.

End of brief.

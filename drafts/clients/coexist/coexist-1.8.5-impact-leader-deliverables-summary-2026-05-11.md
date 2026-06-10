# Co-Exist 1.8.5 — Impact Stats + Leader Check-In: Prior Fork Deliverables Summary

**Authored:** 2026-05-11 by fork_mp0kh1lk_46bbe4 (Sub-fork 5, read-only recon)  
**Purpose:** Consolidate what the two credit-exhaustion-aborted manager forks actually shipped to disk vs. what still needs building, to unblock the conductor's follow-up dispatch.

---

## Section A — Impact Stats Unification (fork_mp0hxqpr_8e431a)

### What the audit identified

Audit file on disk: `~/ecodiaos/drafts/coexist-1.8.5-impact-stats-audit-2026-05-11.md` (22,783 bytes, written ~01:08 AEST)

**Core finding: 20 hooks, 9 surfaces, at least 5 data sources — none of which agree.**

Key problems, in order of severity:

1. **Duplicate `useImpactStats` export collision** — `hooks/use-impact.ts:226` and `hooks/use-home-feed.ts:320` export the same name with different signatures, different RPCs, and different return shapes. Home page uses the home-feed variant; impact/index.tsx uses the use-impact variant. Same user, same event, two different "hours volunteered" totals rendered side-by-side as user navigates.

2. **Per-user hours inflated on 2 of 3 hook paths** — Post-1.8.4 commit `20260506020000`, `hours_total` now equals `attendees × duration`. Any hook that sums `hours_total` without dividing by attendees inflates per-user hours by ~event-attendee-count multiplier. Only `useProfileStats` (with `sumPerUserHours` divisor) is correct. `get_user_impact_stats` RPC and both `useImpactStats` duplicates are wrong.

3. **Brisbane "16 leaders" root cause** — `useCollectiveFullStats` on the leader dashboard reads `app_settings.leaders_empowered:<collective_id>` — a manually-maintained static counter set to `{"count":16}` at some prior point. `useCollectiveLeaders` on the collective detail page returns 9 (live active leaders). DB ground-truth probed during the fork: 4 currently active + 2 inactive = 6 lifetime distinct. The 16 is fiction; no process keeps it fresh.

4. **Admin dashboard scope bug** — `hooks/use-admin-dashboard.ts:91` always reads `app_settings.leaders_empowered_total` (national) regardless of `collectiveId` filter. Admin dashboard filtered by Brisbane returns the national leader count, not Brisbane's count.

5. **`usePublicStats` native-plants conflation** — `BASELINE_TREES + postBaselineTrees + totalNativePlants` conflates trees_planted (a different metric class) into the native_plants stat on the public download page.

6. **Hannah's "9"** — Neither live count (9 active per `useCollectiveLeaders`) nor DB lifetime distinct (6). Possibly a different leader-role filter or a stale cache reading; the fork could not fully resolve before credit exhaustion.

### Specific stat surfaces and files audited

| Surface | File | Hooks | Status |
|---|---|---|---|
| Home widget | `pages/home.tsx:1061` | `useImpactStats` (home-feed) → `get_user_impact_stats` RPC | INFLATED hours |
| Impact tab | `pages/impact/index.tsx:291` | `useImpactStats` (use-impact) → client agg | INFLATED hours |
| Profile page | `pages/profile/index.tsx`, `view-profile.tsx`, `profile-modal.tsx` | `useProfileStats` → `sumPerUserHours` | CORRECT |
| Admin dashboard | `pages/admin/index.tsx:296` | `useAdminOverview` | Leaders scope BUG |
| Admin collective detail | `pages/admin/collective-detail.tsx:231` | `useAdminCollectiveStats` → `get_collective_stats` RPC | CANONICAL (correct) |
| Leader dashboard | `pages/leader/index.tsx:921-922` | `useLeaderDashboard` + `useCollectiveFullStats` | STALE static counter |
| Collective detail (public) | `pages/collectives/collective-detail.tsx:84-88` | `useCollectiveLeaders` + `useCollectiveStats` | LIVE but client-agg |
| Home toggle OFF | `pages/home.tsx:826` | `useNationalImpact` | OK |
| Home toggle ON | `pages/home.tsx:827` | `useCollectiveImpact` | leaders_empowered from static counter |
| Public download | `pages/public/download.tsx:160` | `usePublicStats` | native-plants BUG |

Full hook inventory (20 hooks) in the audit file, Sections 1.1 and 1.2.

Key hooks: `useImpactStats` (×2 colliding), `useNationalImpact`, `useCollectiveImpact`, `useCollectiveFullStats`, `useAdminOverview`, `useCollectiveStats`, `usePublicStats`, `useProfileStats`, `useCollectiveLeaders`, `useAdminCollectiveStats`.

Key RPCs: `get_user_impact_stats` (BROKEN — wrong), `get_collective_stats` (CANONICAL — correct, multi-host-aware since commit `20260427010000`).

### Canonical source-of-truth approach (from audit)

The audit proposes a 3-class canonical model:

- **Class A (impact metrics):** `get_collective_stats(p_collective_id)` RPC for per-collective; `fetchImpactRows + sumMetric` for national. The existing RPC is already multi-host-aware and excludes legacy rows.
- **Class B (counts):** Extend `get_collective_stats` to return `leaders_current` (live active) and `leaders_lifetime` (DISTINCT user_id who ever held leader role — no status filter). Abolish `app_settings.leaders_empowered:<id>` and `app_settings.leaders_empowered_total` settings once consumers migrate.
- **Class C (baselines):** Pre-2026 `app_settings.impact_baseline_*` keys are legitimate (not reconstructable from DB). Keep. The `leaders_empowered` settings are NOT legitimate baselines — they ARE reconstructable. Delete after migration.

Per-user hours: `useProfileStats` is canonical. Both `useImpactStats` duplicates and `get_user_impact_stats` RPC are deleted; call sites on home page and impact tab switch to `useProfileStats`.

Migration needed: extend `get_collective_stats` to add `leaders_current` + `leaders_lifetime` fields (draft SQL in audit Section 2, canonical SQL file referenced but **NOT written** — see below).

### What was SHIPPED to git vs. what remains queued

**SHIPPED:** Nothing. No code commits, no migration files. Zero git history from this fork.

**ON DISK (audit artefacts only):**
- `~/ecodiaos/drafts/coexist-1.8.5-impact-stats-audit-2026-05-11.md` ✅
- `~/ecodiaos/drafts/coexist-1.8.5-impact-stats-canonical-sql-2026-05-11.sql` — **referenced in the audit (Section 3) but does NOT exist on disk.** The fork aborted before writing it.

**Branch `1.8.5-impact-stats-unification` does NOT exist** in `~/workspaces/coexist`. No feature branch, no worktree.

### Next-fork brief skeleton — Items 5, 6, 7

```
## Co-Exist 1.8.5 — Impact Stats Unification: Refactor (Items 5/6/7)

Prerequisite reading (REQUIRED before any code):
  ~/ecodiaos/drafts/coexist-1.8.5-impact-stats-audit-2026-05-11.md (full, ~23KB)
  ~/ecodiaos/clients/coexist.md

The audit is complete. This fork implements the refactor only.

Worktree prep:
  cd ~/workspaces/coexist
  git stash push -u   # preserve sibling share-graphic uncommitted work
  git checkout main && git pull origin main
  git checkout -b 1.8.5-impact-stats-unification

Commits (one per logical unit, revertable individually):

COMMIT 1 — New migration
  supabase/migrations/20260511000000_canonical_collective_stats_v2.sql
  (check ls supabase/migrations | sort | tail -5 first; bump number if sibling claimed it)
  Content: UPDATE get_collective_stats() RPC to return leaders_current (active, scoped)
  and leaders_lifetime (DISTINCT user_id who ever held leader/co_leader/assist_leader role
  in this collective). Matches the canonical SQL draft in audit Section 2.
  DO NOT run the migration — Tate runs as part of 1.8.5 bundle.
  DO NOT delete app_settings.leaders_empowered keys yet.

COMMIT 2 — Delete useImpactStats duplicates; migrate call sites to useProfileStats
  Files: src/hooks/use-home-feed.ts (remove useImpactStats export at line ~320)
         src/hooks/use-impact.ts (remove useImpactStats export at line ~226)
         src/pages/home.tsx (line ~1061: switch import + field access)
         src/pages/impact/index.tsx (line ~291: switch import + field access)
  useProfileStats fields: eventsAttended, hoursVolunteered (check exact shape in hooks/use-profile.ts)
  Estimated delta: ~25 LOC

COMMIT 3 — Route hooks to canonical RPC (leaders_lifetime from get_collective_stats)
  Files: src/hooks/use-collective.ts (useCollectiveStats — replace client agg with RPC)
         src/hooks/use-leader-dashboard.ts (useCollectiveFullStats — replace app_settings read)
         src/hooks/use-impact.ts (useCollectiveImpact — replace app_settings read)
  Depends on COMMIT 1 (new RPC fields must be in place).
  Estimated delta: ~80 LOC

COMMIT 4 — Fix useAdminOverview collective-scope bug
  File: src/hooks/use-admin-dashboard.ts (~line 91)
  Replace unconditional leaders_empowered_total read with:
    collectiveId ? get_collective_stats(collectiveId).leaders_lifetime
                 : app_settings.leaders_empowered_total (national fallback until national RPC ships)
  Estimated delta: ~15 LOC

COMMIT 5 — Fix usePublicStats native-plants conflation
  File: src/hooks/use-public-stats.ts (~line 42)
  Drop BASELINE_TREES from nativePlants calculation. nativePlants = postBaselineTrees + totalNativePlants.
  Estimated delta: ~3 LOC

After all commits: run `yarn build` or `npm run build` (must be clean).
DO NOT push to coexist remote. 1.8.5 ships bundled.
```

---

## Section B — Leader Check-In Expansion (fork_mp0hy575_5aa9a5)

### What the audit identified

Audit file on disk: `~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md` (23,489 bytes, written ~01:11 AEST, updated with Tate clarifications at ~11:06 AEST 11 May)

**5 deliverables, 1 already done:**

| # | Deliverable | Status from audit |
|---|---|---|
| 9 (item 1 in audit) | Search registered attendees (existing path) | ✅ DONE — event-day.tsx already has search bar + check-in buttons |
| 10 (item 1b in audit) | Search ALL app-members + debounced + add-and-check-in | ❌ NOT BUILT |
| 11 (item 2 in audit) | Ad-hoc walk-in form (mirroring profile-survey.tsx 12 fields) | ❌ NOT BUILT |
| 12 (items 3+4 in audit) | QR code (in-app) + public unauthed form `/check-in/:token` | ❌ NOT BUILT |
| (NEW, item 5 in audit) | Next-event-card "Tap to Sign In" visibility predicate fix | ⚠️ PARTIAL — button exists at home.tsx:386 but wrong window predicate |

**Key Tate clarifications incorporated in the audit (relayed 11 May 11:06 AEST):**
- Walk-in form must mirror `pages/events/profile-survey.tsx` field shape: 12 fields (first_name, last_name, age, postcode, gender, email, pronouns, collective_discovery, accessibility_requirements, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship). Required: first_name + (email OR phone). Rest optional.
- Next-event-card sign-in button visibility window: spec = sign-in-opens (AEST day start) → date_start+2h. Current code uses `isEventHappeningNow` (start→end). Fix the predicate.
- QR code and public form share the same token — one artefact, not two.
- No captcha needed; honeypot + per-IP-per-event rate-limit (5/15min) is sufficient.

### Files / routes audited

- `src/pages/events/event-day.tsx` — leader event-day (existing check-in machinery, search bar at line 690)
- `src/pages/events/check-in.tsx` — member self-check-in (3-digit code entry)
- `src/pages/public/event.tsx` — public event page shape (reference for `/check-in/:token` new page)
- `src/App.tsx` — routing (React Router v7)
- `package.json` — confirmed `qrcode.react@^4.2.0` already present (no new dep needed)
- `supabase/migrations/079_event_check_in_codes.sql` — check-in code schema
- `supabase/migrations/20260509000000_event_day_check_in_window.sql` — day-of-event trigger
- `supabase/migrations/20260413040000_lock_check_in_codes.sql` + `20260413050000_` — immutable code logic
- Grep for `is_collective_leader_or_above` — confirmed canonical Postgres permission function exists
- `hooks/use-event-tickets.ts` — `useCodeCheckIn` hook (member self-check-in, don't rebuild)

**Latest migration on disk:** `20260509300000_admin_rls_audit.sql`. Migration number to claim: `20260511000000_` (re-verify at write time per `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`).

**Architecture clarification (important for brief authors):** Coexist is Vite + React 19 + Capacitor 8 + Supabase. NO separate Node/Nest backend. All backend logic = Supabase Postgres + Edge Functions under `supabase/functions/`. The brief's mention of `~/workspaces/coexist/be/` is incorrect — everything lives at `~/workspaces/coexist/`.

### What was SHIPPED vs. what remains queued

**SHIPPED:** Nothing. No code commits, no migration files, no Edge Functions, no feature branch.

**ON DISK (audit artefacts only):**
- `~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md` ✅

**Branch `1.8.5-leader-checkin` does NOT exist** in `~/workspaces/coexist`.

Note on `1.8.5-next-event-signin-button`: this branch DOES exist locally but has **zero commits beyond main** (empty diff). It appears to have been created for the next-event-card sign-in visibility fix but no code has landed.

### Next-fork brief skeletons — Items 10, 11, 12

**Item 9 is DONE.** Confirmed by audit — `event-day.tsx` line 690 has search filtering + check-in buttons for the existing registered-attendee list. Do not rebuild.

**Item 10 — Search all app-members (debounced, mandatory)**

```
## Co-Exist 1.8.5 — Leader Check-In Item 10: Search All App-Members

Prerequisite reading (REQUIRED):
  ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md (full)
  ~/ecodiaos/clients/coexist.md

Worktree prep:
  cd ~/workspaces/coexist
  git stash push -u   # preserve sibling uncommitted files
  git checkout main && git pull origin main
  git checkout -b 1.8.5-leader-checkin  (or use existing if items 11+12 fork already created it)

WHAT TO BUILD:
On `pages/events/event-day.tsx`, add a tab toggle on the existing search bar:
  Tab A: "Registered" — current filteredAttendees behaviour (DO NOT BREAK)
  Tab B: "All Members" — new RPC call `search_app_users_for_event(event_id, query, 10)`
         Debounce: 300ms minimum between RPC calls (mandatory, not polish)
         Result item: avatar + display_name + (email, dimmed). "Add + Check In" CTA.
         "Add + Check In" CTA inserts a new event_registration (status=attended) for that
         user_id + event_id, then shows the standard "checked in" confirmation toast.

New RPC `search_app_users_for_event(event_id uuid, query text, max_results int default 10)`:
  SECURITY DEFINER
  1. Assert caller is is_collective_leader_or_above(auth.uid(), events.collective_id)
  2. Return top-N profiles WHERE (display_name ILIKE '%' || query || '%' OR email ILIKE '%' || query || '%')
     AND public_tier IS NOT NULL (discoverable) AND query length >= 2
  3. Return setof (id uuid, display_name text, avatar_url text, email text)
  Place in migration 20260511000000_ (or sibling migration file, check ls first)

CONSTRAINTS:
  - Minimum query length 2 chars before firing RPC (prevent full-table scan)
  - Permission gate: leader-scoped to the event's collective
  - DO NOT push to coexist remote
  - yarn build must be clean before done
```

**Item 11 — Ad-hoc walk-in form**

```
## Co-Exist 1.8.5 — Leader Check-In Item 11: Ad-Hoc Walk-In Sheet

Prerequisite reading (REQUIRED):
  ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md (Sections 3 and 9)
  ~/ecodiaos/clients/coexist.md

Worktree: ~/workspaces/coexist, branch 1.8.5-leader-checkin (create or reuse from item 10 fork)

WHAT TO BUILD:
Migration file: supabase/migrations/20260511000000_event_walk_ins_and_public_checkin.sql
  (re-check ls supabase/migrations | sort | tail -5 before writing — sibling may have claimed it)
  Content is fully specified in audit Section 3 (Decision 1) and Section 10.
  Includes: event_walk_ins table (12 profile-survey fields + lifecycle cols), RLS, day-of-event trigger,
  events.public_check_in_enabled bool + events.public_check_in_token text UNIQUE,
  token generator function, token management trigger, public_check_in_rate_limits table.
  DO NOT run the migration — Tate runs as part of 1.8.5 bundle.

New component: src/components/walk-in-sheet.tsx
  Bottom sheet triggered from event-day.tsx footer. Fields mirror profile-survey.tsx exactly:
    first_name (required), last_name, age, postcode, gender, email, pronouns,
    collective_discovery, accessibility_requirements,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship.
  Required: first_name + (email OR phone). Everything else optional.
  On submit: INSERT event_walk_ins with created_via='leader_adhoc', created_by_user_id=auth.uid().
  Day-of-event date guard enforced by DB trigger — surface 422 error as toast "Check-in only available on event day".

Wire into event-day.tsx: "Add Walk-In" button in footer (alongside existing "Mark All Present").
Permission gate: same isAssistLeader || isStaff guard already on the page.

CONSTRAINTS:
  - No new dependencies
  - Festival-fast UX: toast on save failure, not field-level required nags (loose-coupled validation style)
  - DO NOT push to coexist remote
  - yarn build must be clean
```

**Item 12 — QR code + public unauthed form**

```
## Co-Exist 1.8.5 — Leader Check-In Item 12: QR Code + Public Form

Prerequisite reading (REQUIRED):
  ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md (Sections 3, 5, 6, 9)
  ~/ecodiaos/clients/coexist.md
  ~/ecodiaos/patterns/edge-function-safe-defaults.md

Worktree: ~/workspaces/coexist, branch 1.8.5-leader-checkin

Depends on item 11 migration being written (migration includes public_check_in_enabled + public_check_in_token columns).

WHAT TO BUILD — 3 sub-artefacts:

1. QR code in event-day "Show Code" sheet
   event-day.tsx line ~745 "Show Code" bottom sheet currently shows the 3-digit numeric code.
   Add alongside (NOT replacing) the 3-digit code:
     import { QRCodeSVG } from 'qrcode.react';  // already in package.json
     <QRCodeSVG value={`https://app.coexist.au/check-in/${event.public_check_in_token}`} size={200} />
   Add toggle switch "Enable public QR check-in" that sets events.public_check_in_enabled.
   When enabled=false: token is NULL (trigger auto-rotates), show "Public check-in disabled" state.
   When enabled=true: show QR + "Scan to check in" label.

2. Edge Function: supabase/functions/public-event-check-in/index.ts
   Full spec in audit Section 5. Key points:
   - POST / with { token, first_name, email, phone?, website_url (honeypot) }
   - Silent drop if website_url non-empty (return 200 without inserting)
   - Look up event by public_check_in_token WHERE public_check_in_enabled=true AND status NOT IN ('cancelled','draft')
   - Validate event date_start = today AEST
   - Rate-limit: 5 attempts per ip per event in 15min window via public_check_in_rate_limits table
   - Optional JWT: if Authorization header present, decode user_id, attempt to create event_registrations row
   - INSERT event_walk_ins with created_via='public_form', client_ip, user_agent
   - CORS: Access-Control-Allow-Origin: *
   - Always return JSON envelope

3. Public page: src/pages/public/check-in.tsx
   Route: /check-in/:token in App.tsx under <AppShell bare> (no auth required)
   Full spec in audit Section 6. Key points:
   - Pre-submit GET to /public-event-check-in?token=... info endpoint for event title/collective
   - Fields: name (required), email (required), phone (optional), website_url (HIDDEN honeypot)
   - States: idle, submitting, success (confetti + "You're checked in to {event.title}!"), error, rate_limited
   - Mobile-first, no chrome

CONSTRAINTS:
  - qrcode.react already in package.json — no new deps
  - DO NOT push to coexist remote
  - yarn build must be clean
```

**Next-event-card sign-in visibility fix (item 5 in audit, not in original brief scope)**

```
## Co-Exist 1.8.5 — Next-Event-Card Sign-In Button Predicate Fix

File: src/pages/home.tsx (~line 386)
Branch: 1.8.5-next-event-signin-button (EXISTS locally, no commits yet — start from here)

Current: button visibility = isEventHappeningNow (start → end)
Spec (Tate verbatim 11 May 11:06 AEST): visible from AEST day start → date_start + 2h

Fix the predicate. Do NOT change the button's appearance or label — only the visibility window.
Likely: const isSignInWindowOpen = dayjs().isAfter(dayjs(event.date_start).tz('Australia/Sydney').startOf('day'))
                                 && dayjs().isBefore(dayjs(event.date_start).tz('Australia/Sydney').add(2, 'hour'))
Confirm dayjs + timezone plugin already used in codebase before writing (grep package.json/imports).
yarn build clean. DO NOT push to remote.
```

---

## Section C — Branches and Visual-Verify Gates

### Branches in `~/workspaces/coexist` related to this work

| Branch | Status | Commits beyond main |
|---|---|---|
| `1.8.5-impact-stats-unification` | **Does not exist** | — |
| `1.8.5-leader-checkin` | **Does not exist** | — |
| `1.8.5-next-event-signin-button` | EXISTS (current branch) | **Zero** — identical to main |

### Commits on main since May 11 (01:00 UTC)

| SHA | Message | Source |
|---|---|---|
| `0a8d407` | fix(1.8.5): splash wordmark swap + Android header squish + keyboard gap | Sub-fork splash/android work |
| `a9e5937` | feat(excel-sync): gate sheet append on impact survey submission | Excel-sync fork (fork_mp0jqlhw_9ae37c) |
| `d9285b2` | On main: sibling-fork-stash-1.8.5-share-graphic-1778464303 | Stash commit (share-graphic sibling) |
| `6f479a7` | index on main: 7dc39e5 feat(events): UGC share-graphic generator... | Stash index reference |

None of these commits come from the impact-stats or leader-checkin forks. Both manager forks aborted before creating branches or writing code.

### Worktree state caveats

- Two uncommitted files remain from the sibling share-graphic work: `src/components/event-share-graphic.tsx` + `src/components/event-share-sheet.tsx`. Build forks MUST `git stash push -u` before creating their feature branch. They do NOT pop the stash — leave it for the conductor/sibling to recover.
- The `1.8.5-share-graphic` branch exists and has the stash commit; the conductor should check whether those uncommitted files are a concern before the refactor forks run.

### Visual-verify gate

No screenshots exist for either item set. Per `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md`, Mode A (localhost dev server) applies. The refactor and build forks should not claim "done" without at minimum a `yarn build` clean pass. A separate verification fork (or verification step within each build fork) should screenshot key surfaces.

---

## Section D — Recommendation

### Does a follow-up manager fork need dispatching?

**Yes — two manager forks needed, OR one manager fork covering all remaining 1.8.5 items.**

Items still unbuilt:

| Item | Work | Effort |
|---|---|---|
| 5 (Impact Stats) | New migration + get_collective_stats extension | S |
| 6 (Impact Stats) | Delete duplicate hooks, fix call sites | M |
| 7 (Impact Stats) | Admin scope fix + public-stats fix | S |
| 10 (Leader Check-In) | Search all app-members tab + RPC | M |
| 11 (Leader Check-In) | Walk-in sheet component + event_walk_ins migration | M |
| 12 (Leader Check-In) | QR code in-app + public form page + Edge Function | L |
| NEW (next-event-card) | Predicate fix on home.tsx:386 | XS |

**Item 9 is DONE.** Confirmed in code — no action needed.

**Prerequisite:** credit window must be re-opened. Status board row `47f0e40e` tracks the exhaustion — BOTH Max accounts were capped until ~2026-05-12 11:00 UTC. If that window has passed, dispatch is unblocked.

### Dispatch order (recommended)

Option A — Two manager forks in parallel (impact stats + leader check-in):
1. Manager fork A: Impact stats items 5/6/7 — reads the audit, dispatches sub-forks for migration, hook refactor, admin fix, public-stats fix, verification.
2. Manager fork B: Leader check-in items 10/11/12 + next-event-card predicate — reads the audit, dispatches sub-forks for schema (migration), in-app UI (search-tab + walk-in-sheet + QR code), public form + Edge Function, verification.

Option B — Sequential if fork cap is constrained:
1. Start with leader check-in migration fork (unblocks all other leader check-in forks)
2. Parallel: impact stats refactor + leader check-in UI
3. Verification forks last

### Total remaining 1.8.5 item count

- **7 items** still need code (items 5, 6, 7 from impact stats; items 10, 11, 12 from leader check-in; + next-event-card predicate)
- **1 item done** (item 9 — search registered)
- **Both audit docs are on disk** and ready to serve as prerequisites for the build wave

### Key risk

Items 10, 11, 12 share the same migration file number (`20260511000000_`). If dispatching as sub-forks in parallel, ONE fork must write the migration first; the others extend it or claim `20260511010000_`, etc. The manager brief must direct sub-forks to check `ls supabase/migrations | sort | tail -5` before writing. Per `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`.

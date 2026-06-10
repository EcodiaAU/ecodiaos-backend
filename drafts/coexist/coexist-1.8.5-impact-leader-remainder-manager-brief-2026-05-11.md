# Co-Exist 1.8.5 — Remainder Manager-Fork Briefs
## Impact Stats Unification + Leader Check-In Expansion

**Authored:** 2026-05-11 by fork_mp0kq4ld_e6ad38 (Sub-fork 6, draft-only)  
**Purpose:** Two complete manager-fork briefs ready to paste verbatim into `mcp__forks__spawn_fork` + dispatch order recommendation.  
**Sources:** `~/ecodiaos/drafts/coexist-1.8.5-impact-leader-deliverables-summary-2026-05-11.md` (sub-fork 5 recon), `~/ecodiaos/drafts/coexist-1.8.5-impact-stats-audit-2026-05-11.md`, `~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md`.

---

## Preflight note — Item 8 discrepancy

The conductor's brief to this fork states: "Item 8 (next-event-card sign-in CTA) shipped this batch as commit `56f5f76` on branch `1.8.5-next-event-signin-button`."

Sub-fork 5's worktree probe contradicts this. `1.8.5-next-event-signin-button` EXISTS locally but has **zero commits beyond main**. The sign-in button is present on main (added in a prior batch, commit probably `56f5f76` on main), but the **visibility predicate is still wrong** — `isEventHappeningNow` (event start → event end) instead of the specified window (AEST day start → `date_start + 2h`). This predicate fix is unbuilt. It is included as a sub-task inside Manager Brief 2 below.

---

## Migration number pre-assignment

Both manager forks write migrations to `~/workspaces/coexist/supabase/migrations/`. To prevent file-name collision at Tate's merge:

| Manager | Pre-assigned migration prefix | Instruction |
|---|---|---|
| Brief 1 (impact stats) | `20260511000000_` | Sub-fork A must `ls supabase/migrations/ \| sort \| tail -5` before writing — if a sibling already claimed this prefix, increment to `20260511010000_` |
| Brief 2 (leader checkin) | `20260511010000_` | Sub-fork A must `ls supabase/migrations/ \| sort \| tail -5` before writing — if impact stats claimed `20260511000000_` and `20260511010000_` is free, use it; otherwise increment to `20260511020000_` |

Latest confirmed migration as of sub-fork 5 recon: `20260509300000_admin_rls_audit.sql`.

---

## Worktree shared-state caveat (applies to BOTH managers)

`~/workspaces/coexist` currently has **two uncommitted files** from a sibling share-graphic fork:
- `src/components/event-share-graphic.tsx`
- `src/components/event-share-sheet.tsx`

Every sub-fork that touches the worktree MUST begin with:
```bash
cd ~/workspaces/coexist
git stash push -u -m "sibling-fork-stash-$(date +%s)"
```

Sub-forks do NOT pop the stash — leave it for the conductor or sibling to recover. The stash name is timestamped to avoid collision with the existing stash.

---

---

# MANAGER BRIEF 1 — Impact Stats Unification (Items 5, 6, 7)

> **Paste the content between the triple-dashes below verbatim as the `brief` parameter in `mcp__forks__spawn_fork`.**

---

```
MANAGER: true

## Co-Exist 1.8.5 — Impact Stats Unification: Manager Fork

### Your role
You are a manager fork. Do not write code directly. Decompose into sub-forks as specified,
wait for each wave to complete (call mcp__forks__wait_for_sub_forks with max_wait_sec: 2400
after each wave), verify deliverables on disk before spawning the next wave, retry any
phantom-bail, and emit ONE consolidated [FORK_REPORT].

### Parent fork ID
parent_fork_id: fork_mp0kq4ld_e6ad38

### Background
Two impact-stats problems compound each other:
1. Structural: 20 hooks, 9 surfaces, 5+ data sources — none agree. Two `useImpactStats`
   exports collide (use-impact.ts:226 vs use-home-feed.ts:320), each hitting a different
   RPC with different semantics.
2. Data: Brisbane leader dashboard shows 16 (manual stale counter). Collective detail
   shows 9 (live active). Admin dashboard filtered by Brisbane shows the national total.
   Per-user hours inflated on 2 of 3 hook paths post-1.8.4 commit 20260506020000.

The audit is COMPLETE. No research needed. This manager only implements.

### Prerequisite reading (REQUIRED before spawning any sub-fork)
- ~/ecodiaos/drafts/coexist-1.8.5-impact-stats-audit-2026-05-11.md (full — ~23KB)
- ~/ecodiaos/drafts/coexist-1.8.5-impact-leader-deliverables-summary-2026-05-11.md (Section A)
- ~/ecodiaos/clients/coexist.md
- ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md
- ~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md
- ~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md

### Architecture note
Codebase: Vite + React 19 + Capacitor 8. NO separate Node/Nest backend. Everything at
~/workspaces/coexist (FE + supabase combined). Do NOT reference ~/workspaces/coexist/be/.

### Branch convention
Feature branch: 1.8.5-impact-stats-unification (does NOT exist yet — create from main HEAD).

### Worktree prep (every sub-fork starts with this)
cd ~/workspaces/coexist
git stash push -u -m "sibling-fork-stash-$(date +%s)"
git fetch origin
git checkout main && git pull origin main
git checkout 1.8.5-impact-stats-unification 2>/dev/null || git checkout -b 1.8.5-impact-stats-unification
# If branch already exists and has prior sub-fork commits, just check it out and pull.

---

### Sub-fork decomposition

#### Wave 1 — Sub-fork A: Migration (spawn first, run alone)

TASK: Write the canonical stats RPC migration. No other code changes.

FILE TO CREATE:
supabase/migrations/20260511000000_canonical_collective_stats_v2.sql

BEFORE WRITING: run `ls ~/workspaces/coexist/supabase/migrations/ | sort | tail -5`
and confirm 20260511000000 is unclaimed. If claimed, increment to 20260511010000.
Per ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md

CONTENT:
Update the existing `get_collective_stats(p_collective_id uuid)` RPC to return two
new fields alongside its existing return columns:
  leaders_current bigint   — live active count: collective_members WHERE collective_id = p_collective_id
                             AND status = 'active' AND role IN ('leader','co_leader','assist_leader')
  leaders_lifetime bigint  — distinct all-time count: COUNT(DISTINCT user_id) FROM collective_members
                             WHERE collective_id = p_collective_id
                             AND role IN ('leader','co_leader','assist_leader') [no status filter]

The canonical SQL pattern from audit Section 2:
  (SELECT COUNT(*) FROM collective_members
   WHERE collective_id = p_collective_id AND status = 'active'
     AND role IN ('leader','co_leader','assist_leader')) AS leaders_current,
  (SELECT COUNT(DISTINCT user_id) FROM collective_members
   WHERE collective_id = p_collective_id
     AND role IN ('leader','co_leader','assist_leader')) AS leaders_lifetime

DO NOT delete app_settings.leaders_empowered settings yet — consumers must migrate first.
DO NOT drop get_user_impact_stats RPC yet — handled after call sites are removed.
Migration must NOT be executed — Tate runs it as part of the 1.8.5 bundle.

Commit message: "feat(1.8.5): extend get_collective_stats with leaders_current + leaders_lifetime"

DONE WHEN: file exists at the migration path, git show shows the commit on 1.8.5-impact-stats-unification.

#### Wave 2 — Sub-forks B, C, D (spawn after Sub-fork A's commit lands)

Before spawning Wave 2, verify: `git log origin/1.8.5-impact-stats-unification --oneline | head -3`
should show Sub-fork A's commit. If not, wait and retry.

--- Sub-fork B: Hook deletions + call-site migration ---

TASK: Remove both duplicate useImpactStats exports. Route their consumers to useProfileStats.
This is the per-user-hours fix — 3 surfaces will now agree.

FILES MODIFIED:
1. src/hooks/use-impact.ts (~line 226)
   Remove the useImpactStats export. It's a client-aggregation hook using fetchImpactRows
   that sums hours_total without attendees divisor — inflated. Delete the entire export
   (the hook, its interface, its return statement). Preserve ALL other exports in the file.

2. src/hooks/use-home-feed.ts (~line 320)
   Remove the useImpactStats export. It calls get_user_impact_stats RPC which also inflates
   per-user hours. Delete the entire export. Preserve all other exports.

3. src/pages/home.tsx (~line 1061)
   The personal stats widget currently imports useImpactStats from use-home-feed (or use-impact).
   Switch to useProfileStats (from hooks/use-profile.ts).
   useProfileStats fields: eventsAttended, hoursVolunteered (verify exact names in use-profile.ts).
   Adjust any field-name differences at the consumption site.

4. src/pages/impact/index.tsx (~line 291)
   Same switch: useImpactStats → useProfileStats.
   Adjust field-name differences.

CONSTRAINTS:
- Do NOT touch useProfileStats itself — it is correct (sumPerUserHours divisor).
- Do NOT touch useCollectiveImpact, useNationalImpact — different hooks, out of scope here.
- Stash protocol: see Worktree prep above.
- git pull 1.8.5-impact-stats-unification before committing to pick up Sub-fork A's migration.

Commit message: "fix(1.8.5): remove duplicate useImpactStats, route consumers to useProfileStats"

DONE WHEN: yarn build exits 0, both useImpactStats exports removed, both consumer pages import useProfileStats.

--- Sub-fork C: Collective hooks → canonical RPC ---

TASK: Stop reading app_settings.leaders_empowered:* from three collective-scoped hooks.
Route them to leaders_lifetime field from get_collective_stats RPC instead.

DEPENDS ON: Sub-fork A's migration committed AND Sub-fork B committed (use-impact.ts changes).
Wait for both before starting. Run: git pull origin 1.8.5-impact-stats-unification && git log --oneline | head -5

FILES MODIFIED:
1. src/hooks/use-collective.ts (~line 215, useCollectiveStats)
   Currently does client-side aggregation via fetchImpactRows + collective_members count.
   Replace with: supabase.rpc('get_collective_stats', { p_collective_id: collectiveId })
   Map returned fields to the existing CollectiveStats interface. The RPC already has
   member_count, event_count, and all impact metrics. Add leaders_current, leaders_lifetime
   from Sub-fork A's migration.

2. src/hooks/use-leader-dashboard.ts (~line 237, useCollectiveFullStats)
   Currently reads app_settings.leaders_empowered:<collectiveId> for leadersEmpowered.
   Replace with leaders_lifetime from get_collective_stats RPC.
   Remove the app_settings Promise entirely from the Promise.all array.
   Map leaders_lifetime to leadersEmpowered in the returned object.

3. src/hooks/use-impact.ts (~line 95, useCollectiveImpact)
   Currently reads app_settings.leaders_empowered:<collectiveId> for leadersEmpowered.
   Same replacement: get_collective_stats.leaders_lifetime.
   NOTE: use-impact.ts already has Sub-fork B's changes committed. Pull before modifying.
   Edit the useCollectiveImpact hook (around line 95) — NOT the useImpactStats section
   (already deleted by Sub-fork B).

Commit message: "fix(1.8.5): route collective hooks to canonical get_collective_stats RPC"

DONE WHEN: yarn build exits 0, no app_settings.leaders_empowered: reads remain in those 3 hooks.
Verify: grep -r "leaders_empowered:" src/hooks/ should return 0 matches (or only useAdminOverview
which is Sub-fork D's scope).

--- Sub-fork D: Scope + public-stats bug fixes ---

TASK: Fix two isolated bugs. Independent of B and C — can run after A, concurrently with B or C.
But since shared worktree, start after Sub-fork B commits (B modifies home.tsx; D does not).
To be safe, spawn D after B completes.

FILES MODIFIED:
1. src/hooks/use-admin-dashboard.ts (~line 91, useAdminOverview)
   BUG: always reads app_settings.leaders_empowered_total (national) regardless of collectiveId.
   FIX: add conditional branch —
     if collectiveId is provided → call get_collective_stats(collectiveId) and return leaders_lifetime
     if no collectiveId (national view) → keep existing app_settings.leaders_empowered_total read
       (national total stays here until a national overview RPC ships — out of scope for this batch)
   Implementation pattern from audit Section 4.4:
     collectiveId
       ? supabase.rpc('get_collective_stats', { p_collective_id: collectiveId })
           .then((r) => ({ data: { value: { count: r.data?.leaders_lifetime ?? 0 } }, error: r.error }))
       : supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single()

2. src/hooks/use-public-stats.ts (~line 42, usePublicStats)
   BUG: nativePlants conflates BASELINE_TREES (a trees_planted baseline) into native_plants.
   FIX: remove BASELINE_TREES from the nativePlants calculation.
   BEFORE: nativePlants: BASELINE_TREES + postBaselineTrees + totalNativePlants || FALLBACK_STATS.nativePlants
   AFTER:  nativePlants: postBaselineTrees + totalNativePlants || FALLBACK_STATS.nativePlants
   Note in commit: rendered value on public download page will change (trees no longer inflate
   native-plants count). This is a bug fix; the change is intentional.

Commit message: "fix(1.8.5): admin overview collective scope + public stats native-plants conflation"

DONE WHEN: yarn build exits 0, grep for "leaders_empowered_total" in use-admin-dashboard.ts
shows it only fires when collectiveId is falsy.

#### Wave 3 — Sub-fork E: Build verify + screenshots (spawn after B, C, D all committed)

TASK: Confirm the full refactor is coherent. Yarn build clean. Screenshot key stat surfaces.

STEPS:
1. git pull origin 1.8.5-impact-stats-unification (get all Wave 2 commits)
2. cd ~/workspaces/coexist && yarn build (or npm run build — check package.json scripts)
   Build MUST be clean. If errors, do NOT proceed — report failures in FORK_REPORT.
3. Run: grep -rn "get_user_impact_stats" src/ (should return 0 — old RPC call sites removed)
4. Run: grep -rn "leaders_empowered:" src/hooks/ (should return 0 in the 3 migrated hooks)
5. Run: grep -rn "useImpactStats" src/ (should return 0 — both exports removed)
6. Visual verify: start dev server (`yarn dev` or `npm run dev`), navigate via Corazon localhost
   URL. Screenshot the following surfaces with a test account:
   a. Home page personal stats widget (hours volunteered)
   b. Impact tab (hours volunteered — should now match home widget since both use useProfileStats)
   c. Profile page (hours volunteered — should match both above)
   d. Collective detail page (leaders count — should be live active count, not stale setting)
   e. Leader dashboard (leadersEmpowered — should be leaders_lifetime from RPC, not manual setting)
   Screenshots to: ~/ecodiaos/drafts/coexist-1.8.5-impact-stats-verify-YYYYMMDD/
7. No push to coexist remote. Local branch only.

DONE WHEN: yarn build exits 0, grep checks pass, screenshots captured.

---

### Manager sequencing protocol

Wave 1: spawn Sub-fork A alone.
wait_for_sub_forks([A_id], max_wait_sec: 2400)
Verify: ls ~/workspaces/coexist/supabase/migrations/20260511*  → file exists

Wave 2: spawn Sub-forks B, C, D in this order:
  B first (modifies use-impact.ts; C must see B's commit first since C also touches use-impact.ts)
  After B completes: spawn C and D in parallel (C: use-collective.ts + use-leader-dashboard.ts;
    D: use-admin-dashboard.ts + use-public-stats.ts — disjoint files)
wait_for_sub_forks([C_id, D_id], max_wait_sec: 3600)

Wave 3: spawn Sub-fork E.
wait_for_sub_forks([E_id], max_wait_sec: 1800)

If any sub-fork phantom-bails (FORK_REPORT missing or empty body):
  Probe deliverable on disk. If partially done, spawn cleanup fork with remaining steps.
  If no code landed, re-dispatch with tighter brief.

---

### Definition of Done

- [ ] Migration file exists at supabase/migrations/20260511000000_* (or next free prefix)
- [ ] yarn build exits 0 with no TypeScript errors
- [ ] grep useImpactStats src/ returns 0 matches
- [ ] grep "get_user_impact_stats" src/ returns 0 call site matches
- [ ] grep "leaders_empowered:" src/hooks/ returns 0 matches in the 3 migrated hooks
- [ ] Screenshots of 5 stat surfaces captured at ~/ecodiaos/drafts/coexist-1.8.5-impact-stats-verify-*/
- [ ] NO push to coexist remote (1.8.5 ships bundled)
- [ ] All commits on branch 1.8.5-impact-stats-unification (not main)

---

### FORK_REPORT shape

[FORK_REPORT] Impact stats unification: <committed / partial / failed>.
Migration: <file path confirmed on disk or missing>.
Hook cleanup (B): <done / failed — what's left>.
Canonical routing (C): <done / failed — what's left>.
Bug fixes (D): <done / failed — what's left>.
Build: <clean / errors — paste first error line>.
Screenshots: <path or missing>.
Anything conductor must verify or decide before Tate merges: <list>.
[NEXT_STEP] <one sentence>
```

---

---

# MANAGER BRIEF 2 — Leader Check-In Expansion (Items 10, 11, 12 + predicate fix)

> **Paste the content between the triple-dashes below verbatim as the `brief` parameter in `mcp__forks__spawn_fork`.**

---

```
MANAGER: true

## Co-Exist 1.8.5 — Leader Check-In Expansion: Manager Fork

### Your role
You are a manager fork. Do not write code directly. Decompose into sub-forks as specified,
wait for each wave (mcp__forks__wait_for_sub_forks, max_wait_sec: 3600), verify deliverables
on disk before spawning the next wave, retry phantom-bails, emit ONE consolidated [FORK_REPORT].

### Parent fork ID
parent_fork_id: fork_mp0kq4ld_e6ad38

### Background
Leader check-in has 4 unbuilt items and 1 partially-shipped item:

Item 9 (search registered attendees): ALREADY DONE — event-day.tsx line 690 has search bar +
check-in buttons for existing attendees. DO NOT rebuild. Confirm during your verify pass only.

Item 10 (search ALL app-members, debounced): NOT BUILT.
Item 11 (ad-hoc walk-in form, 12-field mirror of profile-survey.tsx): NOT BUILT.
Item 12 (QR code in-app + public unauthed form /check-in/:token + Edge Function): NOT BUILT.
Predicate fix (next-event-card sign-in window: isEventHappeningNow → AEST day start → date_start+2h):
  PARTIALLY DONE — button exists on main at home.tsx:386 but wrong predicate. Branch
  1.8.5-next-event-signin-button exists locally with zero commits. Fold fix into this branch.

The audit is COMPLETE. No research needed. This manager only implements.

### Prerequisite reading (REQUIRED before spawning any sub-fork)
- ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md (full — ~23KB)
- ~/ecodiaos/drafts/coexist-1.8.5-impact-leader-deliverables-summary-2026-05-11.md (Section B)
- ~/ecodiaos/clients/coexist.md
- ~/ecodiaos/patterns/edge-function-safe-defaults.md
- ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md
- ~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md
- ~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md
- ~/ecodiaos/patterns/no-placeholders-no-coming-soon-on-shipped-features.md

### Architecture note
Codebase: Vite + React 19 + Capacitor 8 + Supabase. NO separate Node/Nest backend.
Everything at ~/workspaces/coexist. Edge Functions at supabase/functions/.
React Router v7. qrcode.react@^4.2.0 already in package.json — no new deps needed.

### Branch convention
Feature branch: 1.8.5-leader-checkin (does NOT exist yet — create from main HEAD).
Note: 1.8.5-next-event-signin-button also exists with zero commits. Delete it or fold its
fix into 1.8.5-leader-checkin (recommended — keeps all check-in work on one branch).

### Worktree prep (every sub-fork starts with this)
cd ~/workspaces/coexist
git stash push -u -m "sibling-fork-stash-$(date +%s)"
git fetch origin
git checkout main && git pull origin main
git checkout 1.8.5-leader-checkin 2>/dev/null || git checkout -b 1.8.5-leader-checkin
# If branch already exists and has prior sub-fork commits, check it out and pull.

---

### Sub-fork decomposition

#### Wave 1 — Sub-fork A: Schema migration (spawn first, run alone)

TASK: Write the single migration that all later sub-forks depend on.

FILE TO CREATE:
supabase/migrations/20260511010000_event_walk_ins_and_public_checkin.sql

BEFORE WRITING: run `ls ~/workspaces/coexist/supabase/migrations/ | sort | tail -5`
Confirm 20260511010000 is unclaimed. If claimed, increment (20260511020000, etc).
Per ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md

CONTENT (all in one migration file — reference audit Sections 3, 4, 9, 10 for full SQL):

1. CREATE TABLE event_walk_ins (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     -- Identity — mirrors profile-survey.tsx fields exactly
     first_name text NOT NULL,
     last_name text,
     email text,
     phone text,
     age int CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
     postcode text,
     gender text,
     pronouns text,
     collective_discovery text,
     accessibility_requirements text,
     emergency_contact_name text,
     emergency_contact_phone text,
     emergency_contact_relationship text,
     -- Lifecycle
     status text NOT NULL DEFAULT 'attended' CHECK (status IN ('attended', 'removed')),
     created_via text NOT NULL CHECK (created_via IN ('leader_adhoc', 'public_form')),
     created_by_user_id uuid REFERENCES profiles(id),
     client_ip inet,
     user_agent text,
     linked_user_id uuid REFERENCES profiles(id),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     CHECK (email IS NOT NULL OR phone IS NOT NULL)
   );
   CREATE INDEX idx_event_walk_ins_event ON event_walk_ins(event_id);
   CREATE INDEX idx_event_walk_ins_email ON event_walk_ins(lower(email)) WHERE email IS NOT NULL;

2. RLS on event_walk_ins:
   - ENABLE ROW LEVEL SECURITY
   - SELECT policy: is_collective_leader_or_above(auth.uid(), events.collective_id) OR
     current_setting('role') = 'service_role'
   - INSERT policy for leader_adhoc: auth.uid() IS NOT NULL AND
     is_collective_leader_or_above(auth.uid(), events.collective_id)
   - No direct INSERT policy for public_form (public_form inserts via SECURITY DEFINER Edge Function only)
   - UPDATE policy: leaders only (status='removed' soft-delete)

3. BEFORE INSERT trigger trg_enforce_walk_in_day_window:
   Mirrors the existing trg_enforce_event_day_check_in trigger.
   Checks events.date_start AT TIME ZONE 'Australia/Sydney' = CURRENT_DATE (AEST).
   service_role bypass: IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF.
   On violation: RAISE EXCEPTION 'Check-in only available on event day' USING ERRCODE = '22023';

4. ALTER TABLE events
     ADD COLUMN public_check_in_enabled boolean NOT NULL DEFAULT false,
     ADD COLUMN public_check_in_token text UNIQUE;

5. CREATE FUNCTION generate_public_check_in_token() RETURNS text — 16-char URL-safe slug
   (alphabet 'abcdefghijklmnopqrstuvwxyz0123456789', 36^16 = ~96 bits entropy)
   LANGUAGE plpgsql — see audit Section 3 Decision 3 for full body

6. BEFORE INSERT/UPDATE trigger manage_public_check_in_token on events:
   - When public_check_in_enabled flips true AND token IS NULL → generate and assign token
   - When public_check_in_enabled flips false → set token = NULL (rotation on re-enable)
   See audit Section 3 Decision 3 for full trigger body.

7. CREATE TABLE public_check_in_rate_limits (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     ip inet NOT NULL,
     event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
     attempted_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_pcirl_ip_event_time ON public_check_in_rate_limits(ip, event_id, attempted_at);
   -- No RLS — only accessed via service_role in Edge Function

8. CREATE FUNCTION search_app_users_for_event(event_id uuid, query text, max_results int DEFAULT 10)
   RETURNS TABLE (id uuid, display_name text, avatar_url text, email text)
   SECURITY DEFINER LANGUAGE sql AS $$
     SELECT p.id, p.display_name, p.avatar_url, p.email
     FROM profiles p
     WHERE length(query) >= 2
       AND (p.display_name ILIKE '%' || query || '%' OR p.email ILIKE '%' || query || '%')
       AND p.public_tier IS NOT NULL
       AND is_collective_leader_or_above(
             auth.uid(),
             (SELECT collective_id FROM events e WHERE e.id = search_app_users_for_event.event_id)
           )
     ORDER BY p.display_name
     LIMIT max_results;
   $$;

Add Origin comment at top of migration explaining why each object exists.
Migration must NOT be executed — Tate runs it as part of 1.8.5 bundle.

Commit message: "feat(1.8.5): event_walk_ins table + public check-in schema + search RPC"

DONE WHEN: migration file exists on disk, git show shows commit on 1.8.5-leader-checkin.

#### Wave 2 — Sub-fork B: In-app UI (spawn after Sub-fork A's commit lands)

TASK: Extend event-day.tsx with three new capabilities. Write walk-in-sheet.tsx component.
Fix home.tsx predicate. All in-app UI changes on the same branch.

DEPENDS ON: Sub-fork A committed. git pull origin 1.8.5-leader-checkin before starting.

FILES MODIFIED/CREATED:
1. src/pages/events/event-day.tsx (extend existing file, do NOT break existing check-in path)
   a. Search all app-members tab (Item 10):
      Find the existing search bar (~line 690, filteredAttendees).
      Add a tab toggle above/beside it: [Registered] [All Members]
      - "Registered" tab = current filteredAttendees behaviour. DO NOT BREAK IT.
      - "All Members" tab = new search across app users:
        Import useCallback, useState (already in React imports).
        On query change (≥2 chars), debounce 300ms then call:
          supabase.rpc('search_app_users_for_event', {
            event_id: eventId, query: searchQuery, max_results: 10
          })
        Render results as list: avatar + display_name + email (dimmed).
        Each result has "Add + Check In" CTA.
        "Add + Check In" action:
          INSERT event_registrations (event_id, user_id, status='attended', checked_in_at=now())
          On success: show toast "Checked in {display_name}". On conflict: show "Already registered."
          Re-fetch attendee list after success.
      Debounce is MANDATORY, not optional. Use useRef + setTimeout pattern (no new lodash dep).
      Min query length 2 chars — do not fire RPC for 0 or 1 char.

   b. QR code in "Show Code" sheet (Item 12 in-app component):
      Find the "Show Code" bottom sheet (~line 745). Currently shows 3-digit code in giant text.
      Keep the 3-digit code display. Add below it (NOT replacing):
        import { QRCodeSVG } from 'qrcode.react';  // already in package.json
        Render <QRCodeSVG value={`https://app.coexist.au/check-in/${event.public_check_in_token}`}
                          size={200} />
        Show only when event.public_check_in_enabled === true.
        Add a toggle switch "Enable public QR check-in" that updates events.public_check_in_enabled:
          supabase.from('events').update({ public_check_in_enabled: !current }).eq('id', eventId)
          When enabled=true: show QR + label "Scan to check in without the app"
          When enabled=false: show "Public check-in disabled" state (token is NULL, no QR to show)
      Permission gate: same isAssistLeader || isStaff guard already on the page.

2. src/components/walk-in-sheet.tsx (NEW FILE — Item 11):
   Bottom sheet component triggered from event-day footer.
   Props: eventId (uuid), onSuccess (() => void)
   Fields (mirror profile-survey.tsx exactly — 12 fields):
     first_name (required, text), last_name, email, phone, age (number), postcode, gender,
     pronouns, collective_discovery, accessibility_requirements,
     emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
   Required: first_name + (email OR phone). Validate before submit — show toast "Name + email or phone required" if missing.
   On submit: INSERT event_walk_ins with:
     event_id, first_name, last_name, email, phone, age, postcode, gender, pronouns,
     collective_discovery, accessibility_requirements,
     emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
     status='attended', created_via='leader_adhoc', created_by_user_id=auth.uid()
   On success: call onSuccess(), show toast "Walk-in recorded."
   On DB error (including day-window trigger raising 22023): show toast with error message.
   Festival-fast UX: toast on failure, not field-level required nags. Loose-coupled validation.
   No new dependencies.

3. Wire walk-in-sheet.tsx into event-day.tsx:
   Add "Add Walk-In" button in footer (alongside existing "Mark All Present" button).
   Permission gate: same isAssistLeader || isStaff guard.
   On click: open the walk-in sheet (using same bottom-sheet pattern as other sheets on this page).
   Pass eventId and onSuccess (refresh attendee list + walk-in count).

4. src/pages/home.tsx (~line 386) — Next-event-card predicate fix (sign-in visibility window):
   CURRENT:  visibility = isEventHappeningNow (event.date_start → event.date_end)
   SPEC:     visible from AEST day start → event.date_start + 2 hours
   First check which date library is used: grep imports in home.tsx for dayjs/date-fns/moment.
   If dayjs with timezone plugin (most likely per codebase pattern):
     const signInWindowOpen = dayjs().isAfter(dayjs(event.date_start).tz('Australia/Sydney').startOf('day'))
                           && dayjs().isBefore(dayjs(event.date_start).tz('Australia/Sydney').add(2, 'hour'));
   Only change the visibility predicate — NOT the button appearance, label, or any other logic.

Commit message: "feat(1.8.5): leader check-in — all-members search, walk-in sheet, QR toggle, sign-in predicate"

DONE WHEN: yarn build exits 0, all 4 sub-tasks above implemented.

#### Wave 3 — Sub-fork C: Public form + Edge Function (spawn after Sub-fork B's commit lands)

TASK: Build the public-facing side of item 12. New page, new Edge Function, App.tsx route wire.

DEPENDS ON: Sub-fork A (schema) + Sub-fork B (at minimum, App.tsx may have overlapping changes
if B touched it — check before starting). git pull origin 1.8.5-leader-checkin before starting.

FILES CREATED/MODIFIED:
1. supabase/functions/public-event-check-in/index.ts (NEW — Deno Edge Function)
   Full spec from audit Section 5. Key points:
   a. POST / handler with JSON body { token, first_name, email, phone?, website_url? (honeypot) }
   b. OPTIONS handler for CORS preflight (Access-Control-Allow-Origin: * — public endpoint)
   c. If website_url non-empty: return { ok: true } WITHOUT inserting (silent honeypot drop)
   d. Look up event: SELECT * FROM events WHERE public_check_in_token = $token
        AND public_check_in_enabled = true AND status NOT IN ('cancelled','draft')
      If not found: return 404 { error: "Event not found or check-in disabled" }
   e. Validate date: events.date_start AT TIME ZONE 'Australia/Sydney' must equal today_aest
      If wrong day: return 422 { error: "Check-in is only available on the day of the event" }
   f. Parse client IP from x-forwarded-for header (Deno.serve req.headers)
   g. Rate limit: SELECT COUNT(*) FROM public_check_in_rate_limits
        WHERE ip = $clientIp AND event_id = $event.id
          AND attempted_at > NOW() - INTERVAL '15 minutes'
      If count >= 5: return 429 { error: "Too many check-in attempts, please wait a few minutes" }
   h. Optional JWT: if Authorization header present, decode with supabase.auth.getUser()
      If valid user: attempt INSERT event_registrations (status='attended', checked_in_at=now())
      ON CONFLICT (user_id, event_id) DO NOTHING.
   i. INSERT event_walk_ins with created_via='public_form', client_ip, user_agent, first_name,
      email, phone (all from body)
   j. INSERT public_check_in_rate_limits to record this attempt
   k. Return 200 { ok: true, message: "You're checked in!" }

   Also implement a GET handler at /info?token=... that returns { event_title, collective_name }
   for the public page's pre-load (see Section 6 of audit). Returns 404 if token invalid.

   Follow ~/ecodiaos/patterns/edge-function-safe-defaults.md:
   - Never throw on missing optional headers
   - Always return JSON envelope
   - CORS configured for public access
   Use supabase-js with service_role key from Deno.env.get('SUPABASE_SERVICE_ROLE_KEY').

2. src/pages/public/check-in.tsx (NEW)
   Public route page — no auth required, no app chrome.
   Full spec from audit Section 6. Key points:
   - useParams() for { token }
   - On mount: GET /public-event-check-in/info?token={token}
       Success: show event title + collective in page header
       404: show "This check-in link is invalid or has expired" + no form
   - Form fields:
       name (required, label "Your name")
       email (required, type=email, label "Your email")
       phone (optional, type=tel, label "Phone (optional)")
       website_url (HIDDEN honeypot: style={{ display:'none' }}, tabIndex={-1}, autoComplete="off")
       Submit button "Check In"
   - States: idle → submitting → success | error | rate_limited
       success: confetti animation (use existing confetti pattern from codebase if available,
                or simple CSS animation) + "You're checked in to {event.title}!"
       error: message + "Try again" button
       rate_limited: "Too many attempts, please wait a few minutes"
   - POST to supabase functions URL: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-event-check-in`
     with body { token, name, email, phone, website_url }
     Include Authorization header if supabase.auth.getSession() returns a valid session (optional JWT)
   - Mobile-first. No fancy chrome.

3. src/App.tsx — wire the new public route:
   Add to the existing AppShell bare (no-auth) route group:
     <Route path="/check-in/:token" element={<PublicCheckIn />} />
   Import PublicCheckIn from the new file.
   Confirm pattern by looking at how /event/:id (public event page) is wired — mirror it.

CONSTRAINTS:
- No new npm dependencies for the React page (qrcode.react already present; not needed here)
- Edge Function: Deno + supabase-js. Use existing Edge Function patterns from supabase/functions/
- DO NOT push to coexist remote
- yarn build exits 0 before done

Commit message: "feat(1.8.5): public check-in page + Edge Function + App.tsx route"

DONE WHEN: yarn build exits 0, all 3 sub-artefacts created, file paths confirmed on disk.

#### Wave 4 — Sub-fork D: Visual verify + smoke (spawn after Sub-fork C's commit lands)

TASK: Confirm everything works together. Screenshot all flows.

DEPENDS ON: All prior sub-forks committed. git pull origin 1.8.5-leader-checkin to get all commits.

STEPS:
1. yarn build (must exit 0 — if not, report build errors in FORK_REPORT and stop)
2. Verify item 9 is intact (DO NOT rebuild — just confirm):
   Grep: grep -n "filteredAttendees\|search\|handleSearch" src/pages/events/event-day.tsx
   Should show existing search bar logic. Screenshot the search bar section in source.
3. Start dev server. Navigate to a test event's /events/:id/day page via Corazon.
   Screenshots of:
   a. "All Members" tab — search bar + results list (search for a known test user)
   b. "Add Walk-In" button + walk-in sheet open with all 12 fields visible
   c. "Show Code" sheet — 3-digit code visible PLUS QR code visible (if public_check_in_enabled)
   d. Enable/disable QR toggle working
4. Navigate to /check-in/TESTTOKEN (use a real token from a test event, or mock the GET /info call)
   Screenshot: public check-in form rendered on mobile viewport
5. Verify App.tsx route works: navigate directly to /check-in/anythinghere — should load the page
   (even if token is invalid, should show the "invalid link" state, not a 404 or blank)
6. Run existing smoke tests if configured:
   node ~/ecodiaos/tests/smoke.js coexist (if this target exists)
7. Verify predicate fix: confirm home.tsx line near 386 no longer references isEventHappeningNow
   for the sign-in button visibility. Screenshot the relevant code section.

Screenshots to: ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-verify-YYYYMMDD/

DONE WHEN: build clean, screenshots captured, no smoke test failures.

---

### Manager sequencing protocol

Wave 1: spawn Sub-fork A alone.
wait_for_sub_forks([A_id], max_wait_sec: 2400)
Verify: ls ~/workspaces/coexist/supabase/migrations/20260511*  → file exists

Wave 2: spawn Sub-fork B alone (in-app UI — large task, serialized with A).
wait_for_sub_forks([B_id], max_wait_sec: 3600)
Verify: git log origin/1.8.5-leader-checkin --oneline shows B's commit.
Check: src/components/walk-in-sheet.tsx exists on disk.

Wave 3: spawn Sub-fork C alone (public form + Edge Function).
wait_for_sub_forks([C_id], max_wait_sec: 3600)
Verify: src/pages/public/check-in.tsx and supabase/functions/public-event-check-in/index.ts exist.

Wave 4: spawn Sub-fork D (verify).
wait_for_sub_forks([D_id], max_wait_sec: 1800)

If any sub-fork phantom-bails: probe deliverable paths on disk. Re-dispatch with tighter scope.

Total sub-forks: 4 (A, B, C, D). Well within 5 per-tree cap.

---

### Definition of Done

- [ ] Migration file exists at supabase/migrations/20260511010000_* (or next free prefix)
- [ ] src/components/walk-in-sheet.tsx exists (new, 12-field form, toast-on-error)
- [ ] src/pages/events/event-day.tsx has "All Members" tab, walk-in button, QR toggle
- [ ] supabase/functions/public-event-check-in/index.ts exists (honeypot + rate-limit + optional JWT)
- [ ] src/pages/public/check-in.tsx exists (public form, mobile-first, all states)
- [ ] src/App.tsx routes /check-in/:token to PublicCheckIn
- [ ] home.tsx predicate fixed (AEST day start → date_start + 2h visibility window)
- [ ] yarn build exits 0 with no TypeScript errors
- [ ] Item 9 (existing search bar) confirmed intact, not broken
- [ ] Screenshots of all flows captured at ~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-verify-*/
- [ ] NO push to coexist remote (1.8.5 ships bundled)
- [ ] All commits on branch 1.8.5-leader-checkin

---

### FORK_REPORT shape

[FORK_REPORT] Leader check-in expansion: <committed / partial / failed>.
Schema migration (A): <file path confirmed on disk or missing>.
In-app UI (B): <done / partial — what's missing>.
Public form + Edge Function (C): <done / partial — what's missing>.
Build: <clean / errors — paste first error line>.
Item 9 (registered search): <confirmed intact / broken>.
Screenshots: <path or missing>.
Predicate fix: <done / not done>.
Anything conductor must decide before Tate merges: <list>.
[NEXT_STEP] <one sentence>
```

---

---

## Dispatch Order Recommendation

### Can the two managers run concurrently?

**Recommended: Serialise. Run Brief 1 first, then Brief 2.**

Reasoning:

**Shared worktree collision.** Both managers operate on `~/workspaces/coexist`. Each manager's sub-forks check out their respective feature branch and commit. If both managers are running sub-forks simultaneously, two forks may attempt to `git checkout` different branches in the same directory — that will fail. The stash-and-clean pattern mitigates dirty-file conflicts but does not solve the `git checkout` race.

**home.tsx touches both branches.** Impact stats refactors `home.tsx:1061`. Leader checkin fixes `home.tsx:386`. These are ~675 lines apart and git will auto-merge them without conflict — but only if they land on separate branches that Tate merges sequentially. Concurrent sub-forks modifying the same file in the same worktree at the same time = git conflict.

**Migration number pre-assignment is sufficient for file-level conflict avoidance at merge time** (different filenames), but not for the worktree collision during development.

**If conductor wants concurrent dispatch anyway:** spin up a second worktree for the leader checkin manager via `git worktree add ~/workspaces/coexist-lc 1.8.5-leader-checkin`. Brief the leader checkin manager with `cd ~/workspaces/coexist-lc` instead of `~/workspaces/coexist`. This eliminates the branch collision. But it adds complexity and the brief above does not include this — it would need to be added by the conductor if choosing concurrent dispatch.

### Recommended sequence (serialised)

1. Dispatch Brief 1 (impact stats). Estimated wall clock: 2-3 hours (5 sub-forks, 3 waves, with build verify).
2. After Brief 1 reports done (confirmed on disk): dispatch Brief 2 (leader checkin). Estimated wall clock: 3-4 hours (4 sub-forks, 4 waves, Edge Function adds time).
3. Total: ~5-7 hours wall clock if serialised.

### Concurrent option (if worktree separated)

- Add to Brief 2: `cd ~/workspaces/coexist-lc` everywhere (second worktree).
- Dispatch both managers simultaneously.
- Wall clock: max(Brief 1, Brief 2) = ~3-4 hours.
- Migration conflict: pre-assigned numbers (`20260511000000_` vs `20260511010000_`) prevent filename collision.
- At Tate's merge: git auto-merge on `home.tsx` (lines 386 vs 1061) is very likely clean; verify after both branches are merged.

### Slot budget

| Manager | Sub-forks | Max concurrent | Peak slots used |
|---|---|---|---|
| Brief 1 (impact stats) | 5 (A, B, C, D, E) | 3 (C+D in parallel, Wave 2) | 3 of 5 |
| Brief 2 (leader checkin) | 4 (A, B, C, D) | 1 (all serialised) | 1 of 5 |

Total system slots (serialised dispatch): 2 (one manager each, each uses ≤3 sub-forks concurrently). Well within global cap.

### Credit window note

Status board row 47f0e40e tracked credit exhaustion capping BOTH Max accounts until ~2026-05-12 11:00 UTC. Before dispatching either brief, confirm that window has passed or the accounts have recovered. Both briefs will spawn sub-forks that need Factory/SDK capacity.

---

## Checklist: are these briefs ready to dispatch verbatim?

- [x] Both briefs include `MANAGER: true` heading
- [x] Both briefs include `parent_fork_id: fork_mp0kq4ld_e6ad38`
- [x] Migration number collision addressed: Brief 1 = `20260511000000_`, Brief 2 = `20260511010000_`
- [x] Both briefs include at-write-time `ls` check per `parallel-forks-must-claim-numbered-resources-before-commit.md`
- [x] Stash protocol included in both (worktree prep section)
- [x] Item 9 correctly marked DONE in Brief 2 (no rebuild sub-fork for it)
- [x] Next-event-card predicate fix included in Brief 2 Sub-fork B (home.tsx:386)
- [x] `MANAGER: true` sub-fork briefing pattern followed (manager reads audit docs before spawning)
- [x] `wait_for_sub_forks` calls specified with max_wait_sec
- [x] DoD defined for each brief
- [x] FORK_REPORT shape defined for each brief
- [x] Visual verify sub-fork specified for both (Mode A localhost + screenshots per `visual-test-before-push-when-tate-not-around.md`)
- [x] No-push constraint explicit in both
- [x] Architecture note included (no /be path, everything at ~/workspaces/coexist)
- [x] Edge Function safety pattern referenced (Brief 2)

**Status: Both briefs are ready to dispatch verbatim. Serialise (Brief 1 first, Brief 2 after Brief 1 reports), unless the conductor adds a second worktree for concurrent dispatch.**

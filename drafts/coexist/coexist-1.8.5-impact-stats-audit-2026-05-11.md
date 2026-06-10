# Co-Exist 1.8.5 — Impact Stats Surface Audit + Canonical-Source Decision

- **Authored:** 2026-05-11
- **Manager fork:** fork_mp0hxqpr_8e431a (worker route credit_exhaustion-blocked, manager absorbed audit)
- **Tate ask (14:51 AEST 10 May 2026):** unify impact stats across every surface. Brisbane shows 16 leaders past+present but actually 9 — double-counting symptom of a deeper unification problem.
- **Repo:** `~/workspaces/coexist` @ `7dc39e5` (main, 18-commit polish ship range b2e69d2..804d801)
- **Prior fix (4 May 2026):** `useCollectiveImpact` + `useAdminOverview` per-surface math fixes shipped under "Co-Exist Impact Stats Math Audit" (entity_ref `coexist-impact-audit`). That was math-correctness. THIS audit is the structural unification.

---

## TL;DR

- **20 impact-stat / count hooks live in the codebase**, consumed by **9 surfaces**, drawing from **at least 5 data sources** that DO NOT agree.
- **Two `useImpactStats` exports collide** — `src/hooks/use-impact.ts:226` and `src/hooks/use-home-feed.ts:320`. Same name, different signatures, different RPCs, different return shapes. Home page imports the use-home-feed variant; impact/index.tsx imports the use-impact variant. Two pages, same user, different "hours volunteered" totals.
- **The Brisbane "16 leaders past+present vs actual 9" is NOT a query bug**. It's a manually-maintained static counter in `app_settings.leaders_empowered:<collective_id>` rendered on the leader dashboard via `useCollectiveFullStats.leadersEmpowered`. Meanwhile `useCollectiveLeaders` (collective detail page) returns the LIVE count of active leaders. Two sources, one obsolete, both render somewhere.
- **`useAdminOverview` ignores `collectiveId` scope for `totalLeadersEmpowered`** — admin dashboard filtering by Brisbane returns the **national** `leaders_empowered_total` setting, not Brisbane's per-collective setting.
- **Per-user hours volunteered is broken in 2 of 3 hook paths** post-1.8.4 commit 20260506020000 (hours_total=attendees×duration). The hooks that sum hours_total directly without dividing by attendees inflate per-user hours by ~event-attendee-count multiplier.
- **The canonical RPC `get_collective_stats` already exists with multi-host share weighting (commit 20260427010000)** — but only some surfaces call it, and it has no `leaders_count` field. Surfaces compose it differently or bypass it entirely.

---

## Section 1 — Surface enumeration

### 1.1 Hook inventory

20 hooks compute or render impact/count stats. Source-of-truth column = the actual data source the hook hits.

| # | Hook | File:line | Data source | Notes |
|---|---|---|---|---|
| 1 | `useImpactStats` (PERSONAL — duplicate #1) | `hooks/use-impact.ts:226` | client agg via `fetchImpactRows({eventIds, skipBaselineDateFilter:true})` | sums `hours_total` directly → **per-user hours INFLATED** post 20260506020000 |
| 2 | `useImpactStats` (HOME — duplicate #2) | `hooks/use-home-feed.ts:320` | RPC `get_user_impact_stats(p_user_id)` | RPC sums `ei.hours_total` directly → **per-user hours INFLATED** |
| 3 | `useNationalImpact` | `hooks/use-impact.ts:38` | `fetchImpactRows({timeRange})` + `fetchBaselineSettings()` + `app_settings.leaders_empowered_total` | baseline applied only when `isAllTime` |
| 4 | `useCollectiveImpact` | `hooks/use-impact.ts:95` | `fetchImpactRows({collectiveId, timeRange})` + `app_settings.leaders_empowered:<id>` | multi-host aware (via `fetchImpactRows`); `leadersEmpowered` = manual setting |
| 5 | `useCollectiveCustomMetrics` | `hooks/use-impact.ts:189` | `fetchImpactRows({collectiveId})` + `aggregateCustomMetrics` | custom metrics from `event_impact.custom_metrics` JSON |
| 6 | `useNationalCustomMetrics` | `hooks/use-impact.ts:202` | `fetchImpactRows({timeRange:'all-time'})` + `aggregateCustomMetrics` | top-N national custom metrics |
| 7 | `useProfileStats` | `hooks/use-profile.ts:98` | `fetchImpactRows({eventIds, includeLegacy:true, skipBaselineDateFilter:true})` + custom `sumPerUserHours` | **correct per-user hours** via attendees divisor |
| 8 | `useEventImpact` | `hooks/use-events.ts:511` | `.from('event_impact').eq('event_id', id).single()` | single event raw row |
| 9 | `useCollectiveStats` | `hooks/use-collective.ts:215` | `fetchImpactRows({collectiveId, includeLegacy:true})` + member count from `collective_members` | client-side aggregation, NOT the canonical RPC |
| 10 | `useCollectiveLeaders` | `hooks/use-collective.ts:153` | `.from('collective_members').eq('collective_id').eq('status','active').in('role',[leader,co_leader,assist_leader])` | live count of active leaders only |
| 11 | `useCollectiveMembers` | `hooks/use-collective.ts:130` | `.from('collective_members').eq('collective_id').eq('status','active')` | live count of active members |
| 12 | `useCollectiveMembership` | `hooks/use-collective.ts:290` | `.from('collective_members').eq(collective_id, user_id).single()` | current user's membership in collective |
| 13 | `useAdminOverview` | `hooks/use-admin-dashboard.ts:125` | `fetchImpactRows({collectiveId})` + national `profiles` count + national `collectives` count + `app_settings.leaders_empowered_total` | **BUG: collectiveId is honoured for impact rows BUT NOT for leaders_empowered_total — admin Brisbane-filter shows national leader count** |
| 14 | `useAdminCollectiveStats` | `hooks/use-admin-collectives.ts:235` | RPC `get_collective_stats(p_collective_id)` + `fetchImpactRows` (for hours override) | canonical RPC path |
| 15 | `useAdminCollectiveMembers` | `hooks/use-admin-collectives.ts:160` | `.from('collective_members')` with status filter | admin view of members |
| 16 | `useLeaderDashboard` | `hooks/use-leader-dashboard.ts:138` | `.from('collective_members')` (count) + `.from('events')` + `.from('event_impact')` (raw aggregate) | client-side, bypasses RPC |
| 17 | `useCollectiveFullStats` | `hooks/use-leader-dashboard.ts:237` | `fetchImpactRows` + `app_settings.leaders_empowered:<id>` | **leader-dashboard "16 past+present leaders" comes from here** |
| 18 | `useLeaderEventStats` | `hooks/use-leader-events.ts:163` | events + event_registrations query | per-event registration/attendance stats |
| 19 | `usePublicStats` | `hooks/use-public-stats.ts:20` | `fetchImpactRows({timeRange:'all-time'})` + `profiles` count + `collectives` count + `BASELINE_*` constants | **bug: `nativePlants = BASELINE_TREES + postBaselineTrees + totalNativePlants` — adds trees to native_plants which are different metric classes** |
| 20 | Engagement & misc | `hooks/use-leader-dashboard.ts:fetchEngagementScores` | derived from collective_members + recent event_registrations | "Active members" / "At risk" classification (removed in commit b5c1342 from leader page, hook still exists) |

### 1.2 Page/component consumer matrix

| Surface | File | Hooks consumed | Data sources hit |
|---|---|---|---|
| Home page — personal stats widget | `pages/home.tsx:1061` | `useImpactStats` (home-feed variant) | RPC `get_user_impact_stats` |
| Home page — collective toggle OFF (national) | `pages/home.tsx:826` | `useNationalImpact` | `fetchImpactRows` + baselines + `app_settings.leaders_empowered_total` |
| Home page — collective toggle ON | `pages/home.tsx:827` | `useCollectiveImpact(activeCollectiveId)` | `fetchImpactRows` + `app_settings.leaders_empowered:<id>` |
| Admin dashboard (filtered) | `pages/admin/index.tsx:296` | `useAdminOverview(dateRange, collectiveId)` | mixed — impact via `fetchImpactRows`, leaders_empowered IGNORES collectiveId |
| Admin collective detail | `pages/admin/collective-detail.tsx:231` | `useAdminCollectiveStats` | RPC `get_collective_stats` (canonical multi-host weighted) |
| Admin impact (observations) | `pages/admin/impact.tsx` | `useImpactObservations`, `useYearOverYear`, `useImpactDataQuality`, `useEventsMissingImpact` | yet another data-source path (admin-impact-observations hook file) |
| Collective detail (public) | `pages/collectives/collective-detail.tsx:84-88` | `useCollectiveLeaders` + `useCollectiveMembers` + `useCollectiveStats` | client-side aggregation + raw `collective_members` query |
| Leader dashboard | `pages/leader/index.tsx:921-922` | `useLeaderDashboard` + `useCollectiveFullStats` | client-side aggregation + `app_settings.leaders_empowered:<id>` |
| Profile page (own) | `pages/profile/index.tsx:143` | `useProfileStats()` | `fetchImpactRows` + `sumPerUserHours` (correct per-user) |
| Profile page (other user) | `pages/profile/view-profile.tsx:64` | `useProfileStats(userId)` | same |
| Profile modal | `components/profile-modal.tsx:85` | `useProfileStats(userId)` | same |
| Impact tab (deep page) | `pages/impact/index.tsx:291` | `useImpactStats` (use-impact variant) | client agg via `fetchImpactRows` — DIFFERENT IMPL FROM HOME |
| National impact page | `pages/impact/national.tsx:270` | `useNationalImpact(timeRange)` | shared with home toggle OFF |
| Public download page | `pages/public/download.tsx:160` | `usePublicStats()` | `fetchImpactRows` + baselines (with `nativePlants` bug above) |

### 1.3 Same-user-different-totals — the unification smoking gun

For a logged-in user `U` who attended event `E1` (50 person-hours total, 10 attendees → user's actual hours = 5):

- Home page widget (`useImpactStats` from use-home-feed → `get_user_impact_stats` RPC) renders **50 hours**.
- Impact tab (`useImpactStats` from use-impact) renders **50 hours**.
- Profile page (`useProfileStats`) renders **5 hours**.

Three surfaces, same user, same data, **two different values** (and the values render side by side as user navigates).

---

## Section 2 — The Brisbane 16-vs-9 root cause

### Finding

Brisbane "16 leaders past+present" is rendered on the **leader dashboard** (`pages/leader/index.tsx:922` consuming `useCollectiveFullStats`). That hook computes `leadersEmpowered` at `hooks/use-leader-dashboard.ts:183-184` + `:229`:

```ts
// hooks/use-leader-dashboard.ts:183-184
supabase.from('app_settings').select('value')
  .eq('key', 'leaders_empowered:' + collectiveId).single(),

// hooks/use-leader-dashboard.ts:229
leadersEmpowered: (leadersCountRes.data?.value as { count?: number })?.count ?? 0,
```

**`leaders_empowered:<collective_id>` is a manually-set static counter in the `app_settings` table.** Brisbane's row was set to `{"count":16}` at some prior point (likely when the cumulative leader-count history reached 16). Today, `useCollectiveLeaders` on the collective detail page returns 9 (live count of `collective_members.status='active' AND role IN (leader,co_leader,assist_leader)`).

Two surfaces, two values. **Neither is wrong on its own terms** — leader dashboard claims "all-time leaders empowered (manually curated)", collective detail shows "currently active leaders (live)". But:

1. The label `leadersEmpowered` doesn't communicate "manually curated lifetime total"; it reads as just "leaders".
2. The setting is stale (16 doesn't reflect current reality and no process keeps it fresh).
3. The collective detail page label `leaders` and the leader-dashboard label `leadersEmpowered` look identical to a user.

### Companion bug — admin dashboard ignores collective scope for leaders_empowered

`hooks/use-admin-dashboard.ts:91`:

```ts
// ALWAYS reads the NATIONAL setting, regardless of collectiveId
supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single(),
```

So admin dashboard filtered by Brisbane returns the **national** `leaders_empowered_total` for `totalLeadersEmpowered`. Three surfaces, three values for "Brisbane leaders":

1. Leader dashboard: 16 (manual `leaders_empowered:brisbane-uuid`)
2. Collective detail page: 9 (live `useCollectiveLeaders` count)
3. Admin dashboard with Brisbane filter: e.g. 87 (national `leaders_empowered_total` — NOT scoped)

### Fix

Replace the static-counter `leadersEmpowered` field across hooks with a **live-derived value** from a single canonical query. Two semantics need explicit support:

- **Current** (live, in scope) = `useCollectiveLeaders`-equivalent count.
- **Lifetime cumulative** (current + historical removed/inactive) = `COUNT(DISTINCT user_id) FROM collective_members WHERE collective_id = ? AND role IN ('leader','co_leader','assist_leader')` (no status filter, distinct on user_id to handle re-joins).

Recommend exposing BOTH in the canonical RPC (`leaders_current`, `leaders_lifetime`) and surfacing each clearly with its own label. Static `app_settings.leaders_empowered:<id>` is **deleted** once consumers migrate.

Corrected SQL (for the lifetime cumulative count, applied to Brisbane in the new RPC):

```sql
-- BAD (no SQL; manual setting): app_settings.leaders_empowered:<collective_id>
-- BAD (admin dashboard, ignores scope): app_settings.leaders_empowered_total

-- GOOD (canonical, live):
SELECT
  -- Currently active leaders
  (SELECT COUNT(*) FROM collective_members
   WHERE collective_id = p_collective_id
     AND status = 'active'
     AND role IN ('leader','co_leader','assist_leader')) AS leaders_current,
  -- All-time distinct leaders (handles users who left + re-joined)
  (SELECT COUNT(DISTINCT user_id) FROM collective_members
   WHERE collective_id = p_collective_id
     AND role IN ('leader','co_leader','assist_leader')) AS leaders_lifetime
;
```

Brisbane lifetime ≠ 16 will likely be smaller than 16 (since 16 was a curated estimate). It WILL match the current sum if no leader has ever been removed.

---

## Section 3 — Canonical source of truth per metric class

Three classes of stats:

### Class A — Impact metrics (trees_planted, hours_total, rubbish_kg, area_restored_sqm, native_plants, wildlife_sightings, invasive_weeds_pulled, coastline_cleaned_m, custom_metrics)

**Canonical source: `get_collective_stats(p_collective_id)` RPC** (per-collective view) and **`fetchImpactRows({timeRange})` + `sumMetric`** (national view).

Why this wins:
- `get_collective_stats` is multi-host-aware (commit 20260427010000) — co-hosted events split fairly across hosts so per-collective totals across all hosts sum to the national total without double counting.
- Excludes legacy import rows (commit 20260331160000) and uses event-host attribution.
- Already consumed by `useAdminCollectiveStats` — proves it works end-to-end on an authoritative surface.
- National view doesn't need multi-host weighting (every event counts once at national level) so unweighted `fetchImpactRows` is fine.

**Add to canonical RPC for unification:**
- `member_count` (active) — already present
- `event_count` — already present
- `leaders_current` (NEW — live active leader count)
- `leaders_lifetime` (NEW — distinct user_id who has ever held a leader role)
- All impact metrics already present

**Per-user impact**: the canonical answer is `useProfileStats` (correct `sumPerUserHours`). The existing `get_user_impact_stats` RPC and `useImpactStats(userId)` from use-impact.ts both have the person-hours-not-divided-by-attendees bug. The RPC and the duplicate hook should be **DELETED** in favour of routing both consumers (home widget + impact tab) through `useProfileStats`.

### Class B — Counts (members, leaders current, leaders lifetime, attendance rate)

**Canonical source: `get_collective_stats(p_collective_id)`** extended as above.

For national counts (members, collectives), single-shot queries on `profiles` / `collectives` tables remain fine — they're already consistent across surfaces.

### Class C — Manual baselines (pre-2026 imports)

`app_settings.impact_baseline_*` keys are **legitimate** — they represent historical totals that no live query can reconstruct. Keep. National-all-time view adds them; collective-scoped view does NOT (no pre-2026 collective attribution).

`app_settings.leaders_empowered_total` and `app_settings.leaders_empowered:<id>` are **NOT** legitimate baselines — leaders are reconstructable from `collective_members` history. **DELETE** these keys after consumers migrate.

### Canonical RPC draft

Sibling SQL file: `~/ecodiaos/drafts/coexist-1.8.5-impact-stats-canonical-sql-2026-05-11.sql`.

---

## Section 4 — Refactor plan for the next fork

Refactor target: feature branch `1.8.5-impact-stats-unification` (per manager brief). Commit per-surface so each can be reverted independently.

### 4.1 New migration (commit 1)

`supabase/migrations/20260511000000_canonical_collective_stats_v2.sql` (or next free filename — check at write time per `parallel-forks-must-claim-numbered-resources-before-commit.md`).

Adds:
- Updates `get_collective_stats` RPC to return `leaders_current` + `leaders_lifetime` alongside existing fields.
- Optional: separate RPC `get_national_overview()` returning national totals + leaders_lifetime (distinct user_id across `collective_members` table).
- Does **not** delete `leaders_empowered_total` / `leaders_empowered:*` settings yet — leaves them so older clients don't break mid-rollout.

### 4.2 Hook deletions (commit 2)

- Remove `useImpactStats` from `src/hooks/use-home-feed.ts:320` — call sites switch to `useProfileStats` (already correct).
- Remove `useImpactStats` from `src/hooks/use-impact.ts:226` — same migration.
- Drop the `get_user_impact_stats` RPC in a follow-up migration once both consumers are dropped.

Affected files (consumer rewrites):
- `pages/home.tsx:1061` — switch `useImpactStats` → `useProfileStats`, adjust field-name access (`events_attended`→`eventsAttended`, `hours_volunteered`→`hoursVolunteered`, etc).
- `pages/impact/index.tsx:291` — same switch.

Estimated lines: ~25 LOC across the 3 files (mostly field renames).

### 4.3 Refactor `useCollectiveStats` + `useCollectiveFullStats` to canonical RPC (commit 3)

- `hooks/use-collective.ts:215` (`useCollectiveStats`) — replace client-side aggregation with `supabase.rpc('get_collective_stats', {p_collective_id})` call. Reshape return to existing `CollectiveStats` interface.
- `hooks/use-leader-dashboard.ts:237` (`useCollectiveFullStats`) — replace `app_settings.leaders_empowered:<id>` read with `leaders_lifetime` field from `get_collective_stats`. Drop `leadersCountRes` Promise.
- `hooks/use-impact.ts:95` (`useCollectiveImpact`) — replace `app_settings.leaders_empowered:<id>` read with `leaders_lifetime` from `get_collective_stats`.

Estimated lines: ~80 LOC across 3 files (mostly removing the app_settings query + reshaping returns).

### 4.4 Fix `useAdminOverview` collective-scope bug (commit 4)

`hooks/use-admin-dashboard.ts:91`:
```ts
// BEFORE
supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single(),

// AFTER (preserve national semantics + add scoped path)
collectiveId
  ? supabase.rpc('get_collective_stats', { p_collective_id: collectiveId }).then((r) => ({
      data: { value: { count: (r.data?.leaders_lifetime ?? 0) } },
      error: r.error,
    }))
  : supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single(),
```

Or cleaner: drop the `leaders_empowered_total` setting entirely once `useNationalImpact` is also migrated; compute national lifetime leaders via a new RPC.

Estimated lines: ~15 LOC.

### 4.5 Fix `usePublicStats` native-plants conflation (commit 5)

`hooks/use-public-stats.ts:42`:
```ts
// BEFORE - conflates BASELINE_TREES (which is trees_planted) into nativePlants
nativePlants: BASELINE_TREES + postBaselineTrees + totalNativePlants || FALLBACK_STATS.nativePlants,

// AFTER - if the surface wants "plants" as a combined ecological-output metric, name it that
// and document. If it wants native_plants specifically, drop the BASELINE_TREES addition.
```

Tate-clarify: was conflation intentional (a marketing umbrella "plants" stat) or a bug? Default fix = drop the trees addition; total stays `postBaselineTrees + totalNativePlants` for the public surface.

Estimated lines: ~3 LOC.

### 4.6 Per-user hours unification (commit 6, depends on 4.2)

Already covered in 4.2 — once `useImpactStats` duplicates are deleted and call sites use `useProfileStats`, all 3 surfaces (home widget, impact tab, profile) share the same correct `sumPerUserHours` impl.

### 4.7 Admin impact observations page (out of scope, document only)

`pages/admin/impact.tsx` uses `useImpactObservations`, `useYearOverYear`, etc — a parallel data-quality / observation system, not a stats-display surface. NOT part of this refactor. Surface in the audit table; do not touch.

### 4.8 Estimated total scope

~120-150 LOC across 7 files + 1 new migration. Surgical. Each commit revertable. No new dependencies. Matches existing hook + RPC patterns.

---

## Section 5 — Refactor-fork prerequisites & blockers

**Prerequisites for the refactor fork:**

1. **Worker route credit-exhaustion still active.** If sub-fork dispatch is still 1M-context-paywalled when the refactor fork is spawned, the same route-around applies — manager (or conductor) executes the refactor directly via Edit. Per `~/ecodiaos/patterns/conductor-takes-agency-on-recovery-not-tate.md`.
2. **Worktree state:** `~/workspaces/coexist` has 2 dirty files (`event-share-graphic.tsx` + `event-share-sheet.tsx`) — leftovers from the E-ship commit `7dc39e5`. Stash before refactor: `cd ~/workspaces/coexist && git stash -u`.
3. **Branch:** create feature branch `1.8.5-impact-stats-unification` off `main` (HEAD `7dc39e5` or later if more polish landed).
4. **No push:** per manager brief, do NOT push to coexist remote. 1.8.5 ships bundled after Tate approves migrations + RC build.

**Open question for Tate (low blocker):**

- `usePublicStats.nativePlants` conflation (Section 4.5) — was it intentional marketing-umbrella metric? Default fix changes the value rendered on the public download page. Recommend: drop the conflation, but flag the rendered value change in the verification screenshot pass.

**No structural blockers.** Audit complete. Refactor can dispatch.

---

## Appendix — Files inspected

- `src/hooks/use-impact.ts` (full)
- `src/hooks/use-home-feed.ts` (offset 300-419)
- `src/hooks/use-collective.ts` (offset 120-320)
- `src/hooks/use-leader-dashboard.ts` (full)
- `src/hooks/use-admin-dashboard.ts` (offset 1-190)
- `src/hooks/use-admin-collectives.ts` (offset 230-370)
- `src/hooks/use-profile.ts` (offset 90-190)
- `src/hooks/use-public-stats.ts` (full)
- `src/lib/impact-query.ts` (full)
- `src/pages/home.tsx` (offset 28-40)
- `src/pages/admin/impact.tsx` (offset 1-100)
- `supabase/migrations/20260331160000_exclude_legacy_from_rpcs.sql` (full)
- `supabase/migrations/20260427010000_collective_stats_multi_host.sql` (full)
- `supabase/migrations/20260506020000_fix_hours_total_when_attendees_set.sql` (full)
- Grep across `src/` for `use(Collective|Admin|Impact|Stats|Metric|Leader|Member)*` exports + `.rpc()` calls + `app_settings.leaders_empowered`.

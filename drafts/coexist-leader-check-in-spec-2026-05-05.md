# Co-Exist Leader Check-In Search - Implementation Spec

**Authored:** 2026-05-05 by EcodiaOS conductor (fork fork_morrkfub_7bea8c)
**Brief:** Tate verbatim 4 May 2026 22:55 AEST — "leaders need to be able to search up app users to check them in, primarily from the registered attendees first, but also across the whole app as well so they can sign them in so numbers are correct"
**Codebase:** `/home/tate/workspaces/coexist` (GitHub: `EcodiaTate/coexist`)
**Status:** Spec ready. Awaiting Tate go-ahead before any implementation.

---

## 1. Current State Audit

### Event Day page (`src/pages/events/event-day.tsx`)

The leader's day-of dashboard already exists at `/events/:id/day`. Current capabilities:

- **Attendee list** — `useEventAttendees(eventId)` fetches all rows with status `registered | attended | waitlisted` from `event_registrations`, joined to `profiles` for display_name, avatar_url, phone, emergency contact, etc.
- **Client-side search** — a `SearchBar` component with local filtering: `filteredAttendees` memo filters `attendees` by display_name `includes(query)`. This is purely client-side (only searches already-loaded data), has NO server-side search, and does NOT search across the broader app user base.
- **Check-in** — individual check-in (`useCheckIn`) flips status to `attended` + stamps `checked_in_at`. Bulk check-in (`useBulkCheckIn`) does the same for all `registered` rows.
- **Waitlist promote** — `usePromoteFromWaitlist` flips `waitlisted` → `registered`.
- **Stats display** — 3-column grid: Registered / Checked In / Waitlisted counts.
- **Role gate** — `isAssistLeader || isStaff`. Assist-leaders and above.
- **No post-event attendee search** — the leader cannot add users who didn't register.

### Log Impact page (`src/pages/events/log-impact.tsx`)

The leader's post-event survey page (`/events/:id/impact`). Already updated per post-event overhaul spec (editable participant count):

- `checkedInCount` = `attendees.filter(a => a.status === 'attended').length` (live derived)
- `attendeesValue` — editable input defaulting to checkedInCount, with `attendeesOverridden` flag
- `finalAttendeeCount` — parsed from attendeesValue, feeds `computedHoursTotal` math
- **No search-and-add UI yet** — the post-event survey spec (`coexist-post-event-survey-overhaul-2026-05-04.md`) proposes a full search + add/remove participant flow, but this is NOT implemented yet.

### Key Tables

| Table | Relevant columns | Notes |
|-------|-----------------|-------|
| `event_registrations` | event_id, user_id, status (enum: registered/waitlisted/cancelled/attended/invited), checked_in_at, registered_at | Unique (event_id, user_id). No `source` column yet (see post-event survey spec) |
| `profiles` | id, display_name, first_name, last_name, email, phone, avatar_url, role | `is_collective_staff_or_above()` RPC exists for PII gating |
| `collective_members` | user_id, collective_id, role, status | Active members only. Role hierarchy: participant(0) < assist_leader(1) < co_leader(2) < leader(3) < manager(4) < admin(5) |
| `events` | id, collective_id, check_in_code, date_start, date_end, status | Events are owned by one primary collective, with co-hosting via `event_hosts` view |
| `event_hosts` | event_id, collective_id | View that maps all hosting collectives (primary + co-hosts) to events |

### Key RPCs (existing)

| RPC | Purpose |
|-----|---------|
| `is_collective_staff_or_above(uid)` | Returns true if user is assist_leader+ in ANY collective. Used for PII gating on profile visibility |
| `get_user_profile_v1(target_user_id)` | Returns profile with PII fields gated behind staff role |
| `get_user_impact_stats(p_user_id)` | SUMs impact metrics across attended events — feeds per-user impact page |

### Key Findings

1. **Existing search is client-side only** — filtering by display_name on already-loaded attendees. Cannot search non-registered users.
2. **No cross-app user search exists** — no RPC, no hook, no component.
3. **`event-day.tsx` renders ONLY event_registrations** — no way to find users who didn't register.
4. **Post-event search is planned** via the survey-overhaul spec's `search_addable_participants` RPC, but targets Log Impact page, not Event Day page.
5. **No `source` column** — currently can't distinguish self-check-in from leader-added. The post-event survey spec proposes it, not yet deployed.

---

## 2. Proposed API Surface

### RPC 1: `search_event_attendees(p_event_id, p_query, p_limit)`

Augment the existing server-side fetch that powers `useEventAttendees`. Currently, `useEventAttendees` fetches ALL attendees for the event and filters client-side. For large events (100+ attendees), this is inefficient. Add a server-side search RPC for registered/waitlisted/attended attendees:

```sql
CREATE OR REPLACE FUNCTION search_event_attendees(
  p_event_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
) RETURNS jsonb AS $$
DECLARE
  v_q text;
BEGIN
  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 1 THEN
    -- No query: return all event_registrations for this event (existing behaviour)
    RETURN NULL; -- Signal caller to use the existing useEventAttendees hook
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(row_to_json(r) ORDER BY r.relevance, r.display_name)
     FROM (
       SELECT
         er.user_id, er.status, er.checked_in_at, er.registered_at,
         row_to_json(p.*) AS profiles,
         CASE
           WHEN lower(p.display_name) = v_q THEN 0
           WHEN lower(p.display_name) LIKE v_q || '%' THEN 1
           ELSE 2
         END AS relevance
       FROM event_registrations er
       JOIN profiles p ON p.id = er.user_id
       WHERE er.event_id = p_event_id
         AND er.status IN ('registered', 'attended', 'waitlisted')
         AND (lower(p.display_name) LIKE '%' || v_q || '%'
           OR lower(p.first_name) LIKE '%' || v_q || '%'
           OR lower(p.last_name) LIKE '%' || v_q || '%')
       ORDER BY relevance, p.display_name
       LIMIT GREATEST(1, LEAST(p_limit, 50))
     ) r
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### RPC 2: `search_app_users(p_collective_id, p_query, p_limit, p_exclude_event_id)`

Search across ALL active collective members (for the leader's collective), to find users who haven't registered for this event but should be checked in. This is the "cross-app" search.

Reuse the same structure from the post-event survey spec's `search_addable_participants` but scoped to the leader's collective (or co-host collectives via `event_hosts`):

```sql
CREATE OR REPLACE FUNCTION search_app_users(
  p_collective_id uuid,
  p_query text,
  p_exclude_event_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_q text;
BEGIN
  -- Caller must be staff-or-above (assist_leader+)
  IF v_caller IS NULL OR NOT is_collective_staff_or_above(v_caller) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(row_to_json(r) ORDER BY r.relevance, r.display_name)
     FROM (
       SELECT
         p.id, p.display_name, p.avatar_url,
         CASE
           WHEN is_collective_staff_or_above(v_caller) THEN p.email
           ELSE NULL
         END AS email,
         cm.role,
         CASE
           WHEN lower(p.display_name) = v_q OR lower(p.email) = v_q THEN 0
           WHEN lower(p.display_name) LIKE v_q || '%' THEN 1
           WHEN lower(p.first_name) LIKE v_q || '%' OR lower(p.last_name) LIKE v_q || '%' THEN 2
           ELSE 3
         END AS relevance
       FROM collective_members cm
       JOIN profiles p ON p.id = cm.user_id
       WHERE cm.collective_id = p_collective_id
         AND cm.status = 'active'
         AND (lower(p.display_name) LIKE '%' || v_q || '%'
           OR lower(p.first_name) LIKE '%' || v_q || '%'
           OR lower(p.last_name) LIKE '%' || v_q || '%'
           OR lower(p.email) LIKE '%' || v_q || '%')
         AND (p_exclude_event_id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM event_registrations er
             WHERE er.event_id = p_exclude_event_id AND er.user_id = p.id
           ))
       ORDER BY relevance, p.display_name
       LIMIT GREATEST(1, LEAST(p_limit, 50))
     ) r
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Design notes:**
- Scoped to one collective at a time (the leader's collective). Co-hosted events should call this for each host collective, or we can accept an array of collective_ids.
- Excludes users already on the event roster (registered/attended/waitlisted/invited) to avoid duplicates.
- Minimum 2-character query to avoid returning the entire collective on accidental short input.
- PII gated: email only returned if caller is `is_collective_staff_or_above` (already true by the role gate on the page).

### Alternative: Unify into one RPC

Instead of two separate RPCs, we could extend the post-event survey spec's `search_addable_participants` with an additional parameter `p_scope`:

```sql
search_event_participants(p_event_id, p_query, p_limit, p_scope TEXT DEFAULT 'event')
-- p_scope = 'event' → search only event_registrations
-- p_scope = 'collective' → search collective_members excluding event_registrations
-- p_scope = 'all' → union both
```

This avoids proliferation of near-identical search RPCs.

### Frontend Hook

```ts
// useSearchAttendees(eventId, query)
//   → delegates to search_event_attendees when query.length > 0
//   → falls back to useEventAttendees when query is empty (no server query needed)

// useSearchAppUsers(collectiveId, query, excludeEventId)
//   → delegates to search_app_users
//   → enabled only when query.length >= 2
//   → staleTime: 30s (people don't change often)
```

---

## 3. UI/UX Design

### Location: Enhance the existing Event Day page

The check-in search should live on the **existing Event Day page** (`/events/:id/day`), not a separate page. The page already has the right structure: leader role gate, attendee list, check-in actions, check-in code display, stats. Augmenting it keeps the flow tight — the leader is already here to run the event.

### Search UI proposal

**Default state (no query):**
- The existing attendee list renders as today, grouped/sorted by status:
  - Attended (checked-in) — green left-border
  - Registered (not yet checked in) — neutral, shows "Check In" button
  - Waitlisted — amber, shows "Promote" button
- Stats bar at top: `12 registered · 8 checked in · 2 waitlisted`

**When the leader types in the SearchBar:**
- Debounced 300ms server-side search fires
- **Primary results**: registered/waitlisted/attended attendees matching the query (from `search_event_attendees`)
- **Fallback results**: if query >= 2 chars and no/too few primary results, show "Search all members..." section at the bottom with cross-app results (from `search_app_users`)
- Each result row shows: avatar, display_name, status chip, and action button (Check In / Already Checked In / Promote)
- Non-registered users from cross-app search show "Sign in" button (which creates an `event_registrations` row with `status='attended'` + `checked_in_at` + eventually `source='host_added'`)

**Search result sections (two-level):**
```
┌─────────────────────────────────────────────┐
│  🔍 [Search attendees...               ]    │
│                                             │
│  ── Registered ──                           │
│  [Avatar] Sarah Connor  · Registered  [✓]   │
│  [Avatar] Kyle Reese   · Registered  [✓]    │
│                                             │
│  ── Checked In ──                            │
│  [Avatar] John Connor  · Checked in 09:42  │
│                                             │
│  ── Cross-App Members (3) ──                │
│  [Avatar] Miles Dyson   · Not registered [+]
│  [Avatar] Dr. Silberman · Not registered [+] │
└─────────────────────────────────────────────┘
```

**Cross-app section:**
- Only appears when the server-side query returns registered-attendee results AND there are additional cross-app matches
- Label: "Other Co-Exist members — {count}"
- Action button: "Sign In" (creates attendance directly)

### Edge: No registered results, only cross-app

If the search query matches ONLY cross-app users (e.g. searching for someone who never registered), the cross-app section becomes the main list:

```
┌─────────────────────────────────────────────┐
│  🔍 [Search attendees...               ]    │
│                                             │
│  No registered attendees found for "Quaid"   │
│                                             │
│  ── Other members ──                         │
│  [Avatar] Doug Quaid · Not registered  [+] │
└─────────────────────────────────────────────┘
```

### Post-check-in state

After checking in a cross-app user:
- Row moves to the "Checked In" section
- Attendee list updates (TanStack Query cache invalidation already handles this)
- Stats bar updates: checked-in count increments
- User's `get_user_impact_stats` now includes this event

### Mobile considerations

The Event Day page is already mobile-optimised (uses `Page` component with `swipeBack`). The search bar is already using the existing `SearchBar` component. No significant layout changes needed.

### What happens with the existing client-side filter?

The existing client-side filter (line 308-314 of event-day.tsx) should be replaced by the server-side search when a query is active. When the search bar is empty, revert to showing all attendees (fetched by the existing `useEventAttendees`). This keeps the "show all" fast path unchanged.

**Optimisation:** For events with <50 attendees, keep client-side filtering as the fast path for registered attendee search. Only hit the server for cross-app search when query >= 2 chars.

---

## 4. Permission Model

### Role gate

The existing role gate on Event Day page is sufficient:
```ts
const { isAssistLeader, isLoading: roleLoading } = useCollectiveRole(event?.collective_id)
const isStaff = profile?.role === 'leader' || profile?.role === 'manager' || profile?.role === 'admin'

if (!isAssistLeader && !isStaff) {
  // Show "Leader access only" empty state
}
```

- **isAssistLeader** = collective_members.role >= assist_leader (rank >= 1)
- **isStaff** = global profile.role is leader/manager/admin

### Collective scope

The leader can check in users to events where their collective is a host. This is already enforced by the Event Day page's access — it's only reachable from the event detail page, which shows "Event Day" button only to `isLeaderOrAbove` users who belong to the event's collective (or are global staff).

**What to verify at the API level:**
- `search_app_users` RPC should verify the caller is a member of `p_collective_id` AND has assist_leader+ role
- `search_event_attendees` doesn't need additional gating — the event is already scoped by the page the leader is on
- The cross-app check-in action (creating a registration row for a non-registered user) should verify:
  1. The user is assist_leader+ in a collective hosting this event
  2. The target user exists (valid `profiles.id`)

### PII gating

The existing `is_collective_staff_or_above` RPC gates sensitive profile fields (email, phone, age). The Event Day page already shows emergency contact info to leaders (via `AttendeeSafetySheet`). The search results should:

- Show: display_name, avatar_url, collective role chip
- Show (staff only): email
- Show (after tapping row): existing safety info (already handled by `AttendeeSafetySheet`)

The `search_app_users` RPC returns email only when `is_collective_staff_or_above(v_caller)` — which is always true by the role gate.

---

## 5. Relationship to Post-Event Survey Overhaul Spec

The post-event survey overhaul spec (dated 2026-05-04) proposes a parallel but distinct feature set. Here's how they relate:

| Feature | Event Day (this spec) | Log Impact (post-event spec) |
|---------|----------------------|------------------------------|
| When used | During or just after the event | After the event (post-event survey) |
| Search scope | Registered attendees first, then cross-app collective members | Cross-app profile search (any Co-Exist user) |
| Default action | Check in / Sign in (flip to attended) | Add participant (host_added) |
| Participant count | Real-time updates as people check in | Editable override on saved value |
| RPC needed | `search_event_attendees` + `search_app_users` | `search_addable_participants` (already in post-event spec) |
| Check-in stamp | `checked_in_at` set | No check-in timestamp (retroactive) |

**Recommendation:** These are complementary. The `search_app_users` RPC proposed here is essentially the same as the post-event spec's `search_addable_participants`, scoped to a collective. Unify them into `search_event_participants(p_event_id, p_query, p_limit, p_scope)` to avoid having two near-identical RPCs.

**Deployment order:** Event Day search should ship first (it's the on-the-day flow Tate asked about). Log Impact search is a follow-up, reusing the same RPC.

---

## 6. Estimated Effort

| # | Scope | Effort | Dependencies |
|---|-------|--------|-------------|
| 1 | `search_app_users` RPC (or unified `search_event_participants`) | small (0.5 day) | None — new SQL function |
| 2 | Frontend hook `useSearchAppUsers` + search UI on Event Day page | medium (1-1.5 days) | RPC from #1 |
| 3 | Cross-app sign-in action (create registration + check in) | small (0.5 day) | RPC from #1, existing `useCheckIn` |
| 4 | Unify with post-event spec RPCs if needed | small (0.5 day) | Post-event overhaul go-ahead |

**Total sequential:** ~2-3 days for the Event Day search flow. ~3-4 days if unified with post-event spec.

---

## 7. Open Questions for Tate

1. **Collective scope — all host collectives or just the leader's?** An event can have multiple host collectives (via `event_hosts`). Should the cross-app search look across ALL host collectives' members, or just the searching leader's collective? Default: all host collectives (via `event_hosts` join), since co-hosted events should let all co-hosts' leaders check in members from any host collective.

2. **Notification to signed-in users?** When a leader signs in a non-registered user via cross-app search, should the user receive a push notification ("You were signed in to [event] by [leader name]")? Default: no notification for event day check-in (they're present at the event). Potentially useful for the post-event retroactive add.

3. **Minimum query length for cross-app search?** Currently spec'd at 2 chars (matching the post-event survey spec). Should this be higher (3 chars) to prevent accidental returns? Co-Exist has <10k users, so 2 chars is probably fine.

4. **Should the Log Impact page's search re-use the same RPC?** The post-event spec proposes `search_addable_participants` as a separate RPC. I recommend unifying into `search_event_participants(p_event_id, p_query, p_limit, p_scope)` where `p_scope = 'event' | 'collective' | 'all'`. This avoids RPC proliferation.

5. **"Archived" members?** The `search_app_users` RPC filters on `cm.status = 'active'`. Should archived/inactive collective members be excluded from the search? Default: yes, exclude. An inactive member shouldn't be signable to an event by a leader from that collective.

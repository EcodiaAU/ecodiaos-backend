# Co-Exist Post-Event Survey Overhaul - Implementation Spec

**Authored:** 2026-05-04 by EcodiaOS conductor (fork_moqu73jy_091d9b)
**Brief:** Tate SMS 16:45 AEST 4 May 2026
**Codebase:** `/home/tate/workspaces/coexist` (GitHub: `EcodiaTate/coexist`)
**Status:** Spec ready. Awaiting Tate go-ahead before any implementation fork dispatches.

---

## Tate's Verbatim Ask

> "Also make the post-event survey number of participants default to number of signed in, but editable in case, then we probably also need a search feature so that they can add participants so that their profile impact stats are connected to th event even if they couldn't sign in Yk? Then the number of volunteer hours need to be based on the event time and the final number, whether that's the default or the edited value. Plan it out and use training/common sense for th decisions"

---

## Current State (as of HEAD on 2026-05-04)

### What Tate calls "post-event survey" = leader-side Log Impact form
The user-facing `/events/:id/post-event-survey` (`src/pages/events/post-event-survey.tsx`) is the **attendee** survey - asks "how was it" feedback only, never touches participant counts or hours. The form Tate's describing is the **leader** Log Impact form at `/events/:id/log-impact` (`src/pages/events/log-impact.tsx`). All the "participants / volunteer hours / impact metrics" UI lives there. Spec changes target log-impact.tsx.

### Events / participants today
- `events` table - canonical event row, has `date_start` / `date_end` (timestamptz, AEST stored as UTC).
- `event_registrations` table - junction (event_id, user_id, status). `status` is enum `registration_status`: `registered | waitlisted | cancelled | attended | invited`. Unique constraint on (event_id, user_id). Cascade on profile/event delete.
- Check-in flow (`event-day.tsx` + `check-in-form.tsx`) flips a registration row to `status='attended'` and stamps `checked_in_at`.
- `event-attendees` page lists registrations.
- "Signed in count" in Log Impact UI today = `(attendees ?? []).filter(a => a.status === 'attended').length`, computed client-side from a single query.

### Event impact today
- `event_impact` table - one row per event keyed by `event_id`. Columns: `trees_planted, native_plants, invasive_weeds_pulled, rubbish_kg, area_restored_sqm, wildlife_sightings, coastline_cleaned_m, hours_total, attendees, custom_metrics(jsonb), notes, logged_by, logged_at`.
- `attendees` column **already exists** (added migration `20260401010000_event_impact_attendees.sql`, currently used only for legacy backfill from spreadsheet, NOT written by the live form). Live form ignores it.
- Survey impact sync (`src/lib/survey-impact.ts:syncSurveyImpact`) writes survey-tagged metrics into the row before the form's main upsert.

### Volunteer hours today (Log Impact form)
```
const checkedInCount = (attendees ?? []).filter(a => a.status === 'attended').length
const eventDurationHours = state — defaults to (event.date_end - event.date_start) hours, editable
const computedHoursTotal = eventDurationHours * checkedInCount
// Saved to event_impact.hours_total on submit.
```
- Duration field: editable input.
- Participant count: **read-only** display (`{checkedInCount}` in the multiplier strip).
- Hours always derived; never stored independently.

### Per-user impact attribution today
- `get_user_impact_stats(p_user_id)` RPC (live def: `20260331160000_exclude_legacy_from_rpcs.sql`) joins `event_registrations er ON er.user_id = $1 AND er.status = 'attended'` LEFT JOIN `event_impact ei ON ei.event_id = er.event_id`, then `SUM`s the metric columns.
- **This means: any user whose `event_registrations` row is `status='attended'` for an event automatically inherits that event's impact stats (trees, hours, etc.) into their `get_user_impact_stats` payload.** No per-user impact ledger table.
- Implication for this brief: "credit a user with this event" = "INSERT/UPDATE their `event_registrations` row to status='attended'". No new attribution table needed. Removing them = revert their row.

### Profile visibility (PII) - constraint on the search feature
- `20260501040000_profile_visibility_tiering.sql` introduced `is_collective_staff_or_above(uid)` and `get_user_profile_v1(target_user_id)`. Non-staff (`role='participant'`) get NULL on email/phone/age/etc.
- The new search RPC MUST gate sensitive fields the same way - leaders search by display_name + (email if staff-or-above) + collective membership, and never leak PII back to non-staff callers.
- Log Impact is gated to `isAssistLeader || isStaff` (line 979 of log-impact.tsx) so callers ARE staff-or-above by construction. RLS still must enforce.

---

## Proposed Schema Changes

### Migration 1 - `event_registrations.source`
```sql
-- File: supabase/migrations/20260504000000_event_registrations_source.sql

-- Track HOW a participant came to be 'attended' on an event:
--   self_signin    : user checked themselves in via QR / proximity / leader's check-in flow
--   host_added     : leader added them retroactively via post-event search
--   legacy_import  : seeded from historical data (legacy attendees backfill)
CREATE TYPE registration_source AS ENUM ('self_signin', 'host_added', 'legacy_import');

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS source registration_source,
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS added_at timestamptz;

-- Backfill: any existing row with status='attended' and a checked_in_at gets self_signin.
UPDATE event_registrations
   SET source = 'self_signin'
 WHERE status = 'attended' AND checked_in_at IS NOT NULL AND source IS NULL;

-- Existing 'attended' rows without checked_in_at (legacy backfill / manual): tag legacy_import.
UPDATE event_registrations
   SET source = 'legacy_import'
 WHERE status = 'attended' AND checked_in_at IS NULL AND source IS NULL;

-- Going forward: new self-sign-in flow MUST stamp source='self_signin' alongside
--   checked_in_at; new host-add flow MUST stamp source='host_added' + added_by + added_at.
COMMENT ON COLUMN event_registrations.source IS
  'How this registration reached its current status. NULL = unknown / pre-migration.';
```
**Why a column not a separate table:** every per-user-per-event audit signal already lives on `event_registrations` (status, checked_in_at, registered_at, invited_at). One more column keeps the existing `get_user_impact_stats` RPC working with no rewrite.

### Migration 2 - `event_impact` participant-count audit pair
```sql
-- File: supabase/migrations/20260504010000_event_impact_attendee_audit.sql

-- Capture default-vs-override audit on the participant count.
-- attendees (existing column) becomes the FINAL value used for hours math.
-- attendees_default snapshots what the system would have computed at save time.
-- attendees_override is non-NULL only when host typed a different number than default.
ALTER TABLE event_impact
  ADD COLUMN IF NOT EXISTS attendees_default integer,
  ADD COLUMN IF NOT EXISTS attendees_override integer;

COMMENT ON COLUMN event_impact.attendees IS
  'Final participant count used in hours_total math. Equals COALESCE(attendees_override, attendees_default).';
COMMENT ON COLUMN event_impact.attendees_default IS
  'System-computed signed-in-attendee count at the moment the survey was last saved. Snapshotted for drift audit.';
COMMENT ON COLUMN event_impact.attendees_override IS
  'Host-entered override. NULL = host accepted default. Non-NULL = host changed the number.';

-- Backfill existing rows:
--   If attendees is set (legacy spreadsheet import), keep it as override (host's authoritative number).
--   Default snapshot null on legacy rows is fine - we lose nothing because the live form will populate
--   default + override both on the next save.
UPDATE event_impact
   SET attendees_override = attendees
 WHERE attendees IS NOT NULL AND attendees_override IS NULL;
```

### Migration 3 - search RPC + retroactive add/remove RPCs
```sql
-- File: supabase/migrations/20260504020000_post_event_participant_rpcs.sql

-- ----------------------------------------------------------------------------
-- search_addable_participants(p_event_id, p_query, p_limit)
--
-- Caller must be staff-or-above (assist_leader+). Returns existing Co-Exist
-- users matching p_query by display_name, first_name, last_name, or email
-- (email match staff-only). Excludes users already on the event roster
-- (any registration_status, not just attended - host can't accidentally
-- double-add a 'cancelled' or 'waitlisted' row).
--
-- Returns a JSON array of {id, display_name, avatar_url, email, collective_names[]}
-- sorted by relevance (exact > prefix > substring) then display_name.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_addable_participants(
  p_event_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
) RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_q text;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL OR NOT is_collective_staff_or_above(v_caller) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.relevance, r.display_name), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.email,
      (
        SELECT array_agg(c.name ORDER BY c.name)
        FROM collective_members cm
        JOIN collectives c ON c.id = cm.collective_id
        WHERE cm.user_id = p.id AND cm.status = 'active'
      ) AS collective_names,
      CASE
        WHEN lower(p.display_name) = v_q OR lower(p.email) = v_q THEN 0
        WHEN lower(p.display_name) LIKE v_q || '%' OR lower(p.email) LIKE v_q || '%' THEN 1
        WHEN lower(p.first_name) LIKE v_q || '%' OR lower(p.last_name) LIKE v_q || '%' THEN 2
        ELSE 3
      END AS relevance
    FROM profiles p
    WHERE p.id NOT IN (
            SELECT user_id FROM event_registrations WHERE event_id = p_event_id
          )
      AND (
        lower(p.display_name) LIKE '%' || v_q || '%'
        OR lower(p.first_name) LIKE '%' || v_q || '%'
        OR lower(p.last_name)  LIKE '%' || v_q || '%'
        OR lower(p.email)      LIKE '%' || v_q || '%'
      )
    ORDER BY relevance, display_name
    LIMIT GREATEST(1, LEAST(p_limit, 50))
  ) r;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION search_addable_participants(uuid, text, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- add_event_participant(p_event_id, p_user_id) - host-add primitive
--
-- Caller must be staff-or-above. Idempotent: if a registration row already
-- exists, the row's status is set to 'attended' (so 'registered' or
-- 'waitlisted' rows get promoted), source is set to 'host_added' only if
-- it was NULL or 'legacy_import' (don't overwrite a self_signin source -
-- preserve original audit trail).
--
-- Returns jsonb: {success, user_id, was_existing_registration, prior_status, prior_source}
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_event_participant(
  p_event_id uuid,
  p_user_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_existing event_registrations%ROWTYPE;
  v_was_existing boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT is_collective_staff_or_above(v_caller) THEN
    RAISE EXCEPTION 'unauthorised';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT * INTO v_existing FROM event_registrations
   WHERE event_id = p_event_id AND user_id = p_user_id;

  IF FOUND THEN
    v_was_existing := true;
    UPDATE event_registrations
       SET status = 'attended',
           source = CASE
             WHEN source IN ('self_signin') THEN source        -- preserve genuine self check-in
             ELSE 'host_added'
           END,
           added_by = CASE WHEN source = 'self_signin' THEN added_by ELSE v_caller END,
           added_at = CASE WHEN source = 'self_signin' THEN added_at ELSE now() END
     WHERE event_id = p_event_id AND user_id = p_user_id;
  ELSE
    INSERT INTO event_registrations (event_id, user_id, status, source, added_by, added_at, registered_at)
    VALUES (p_event_id, p_user_id, 'attended', 'host_added', v_caller, now(), now());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'was_existing_registration', v_was_existing,
    'prior_status', v_existing.status,
    'prior_source', v_existing.source
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

GRANT EXECUTE ON FUNCTION add_event_participant(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- remove_event_participant(p_event_id, p_user_id) - host-remove primitive
--
-- Only removes rows where source = 'host_added'. Refuses to remove a row
-- with source = 'self_signin' or 'legacy_import' (host can't undo a real
-- check-in via this surface - they need the existing event-day uncheck-in
-- flow for that). DELETEs the row outright (rather than flipping status to
-- 'registered') so the participant count drops by exactly 1.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_event_participant(
  p_event_id uuid,
  p_user_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_existing event_registrations%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR NOT is_collective_staff_or_above(v_caller) THEN
    RAISE EXCEPTION 'unauthorised';
  END IF;

  SELECT * INTO v_existing FROM event_registrations
   WHERE event_id = p_event_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_such_registration');
  END IF;

  IF v_existing.source IS DISTINCT FROM 'host_added' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_host_added',
                              'source', v_existing.source);
  END IF;

  DELETE FROM event_registrations
   WHERE event_id = p_event_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

GRANT EXECUTE ON FUNCTION remove_event_participant(uuid, uuid) TO authenticated;
```

### Migration 4 - existing self-signin path stamps source
Patch `check-in-form.tsx` and any RPC that sets `status='attended'` to also set `source='self_signin'`. (Frontend-only patch, no SQL.) Captured in Migration 1's COMMENT but listed here as the migration scope-of-work.

---

## Proposed Server-Side Changes

### `src/lib/survey-impact.ts` - no change needed
Survey-tagged impact metrics still flow through unchanged. The participant-count and hours fields are not impact_metric-tagged.

### Log Impact submit handler (`src/pages/events/log-impact.tsx:handleSubmit`)
Currently writes `hours_total = computedHoursTotal` to `event_impact`. Update to also write the new audit pair:
```ts
await logImpact.mutateAsync({
  event_id: eventId,
  hours_total: computedHoursTotal,                // duration × finalParticipantCount
  attendees: finalParticipantCount,                // canonical final
  attendees_default: defaultParticipantCount,      // snapshot at save time
  attendees_override: participantOverride,         // null if host accepted default
  ...rest
})
```
The `useLogImpact` hook (`src/hooks/use-events.ts`) already does an upsert keyed by event_id - just extend its DTO + row payload to include the three new columns. Type regen: `npx supabase gen types` will pick up the new columns automatically post-migration.

### `useEventAttendees` hook (`src/hooks/use-events.ts`)
Already returns `event_registrations` rows. No schema change. UI consumes new `source` column to render the 'signed in' vs 'host added' chip.

---

## Proposed UI Changes (component-level)

All in `src/pages/events/log-impact.tsx`. Two new components extracted under `src/components/`.

### 1. ParticipantCountSection (replaces the read-only count display)
- Sits above the existing Volunteer Hours section.
- Shows: `Participants: [INPUT 12] [reset to default 9]`
- Default value = `defaultParticipantCount` = `attendees.filter(a => a.status === 'attended').length` (live derived from event_registrations - automatically includes host_added participants because they're flipped to status='attended').
- Editable via numeric input. If host types a value different from default, persists to `event_impact.attendees_override`.
- "Reset to default" button clears override, snaps back to live default.
- Below the input: small chip strip showing the breakdown - `9 signed in · 3 added by you = 12 participants` (counts derived by filtering `attendees` on `source`).
- Edge case: if `event.date_end > now()` (event still in progress), section is read-only with banner "Event still in progress - participant count locks after the event ends." This existing 7-day-window guard is reused.

### 2. AddParticipantSection (new card, below ParticipantCountSection)
- Search input: debounced 300ms, calls `supabase.rpc('search_addable_participants', { p_event_id, p_query: input, p_limit: 20 })`.
- Result list: avatar, display_name, email (if returned), collective name chip(s). Click "Add" → `supabase.rpc('add_event_participant', { p_event_id, p_user_id })` → invalidate `['event-attendees', eventId]` query so the count updates.
- Empty-query state: helper text "Search by name or email to credit Co-Exist members who attended without signing in."
- Empty-result state: "No Co-Exist members found. Only existing members can be added — to invite a new member, share the app link." (security boundary)
- Already-on-event suppression: SQL handles it. UI shows nothing for those users.
- Below the search: chronological list of "Added by you" entries with avatar + display_name + small × button. Tap × → `remove_event_participant`. ConfirmationSheet "Remove [name] from this event? Their stats credit for this event will be removed." → on confirm, RPC + invalidate.

### 3. Existing Volunteer Hours section
- Multiplier strip changes from `{eventDurationHours} × {checkedInCount}` to `{eventDurationHours} × {finalParticipantCount}` where `finalParticipantCount = participantOverride ?? defaultParticipantCount`.
- The `computedHoursTotal` memo updates the same way. Identical math, just sourced from the new state.
- `checkedInCount === 0` warning becomes `finalParticipantCount === 0` warning, copy updated to "No participants yet — add some via search or check people in via Event Day."

### 4. Existing Event Hero Banner
- Today: `{checkedInCount} / {registrationCount} checked in`
- Update to: `{signedInCount} signed in · {hostAddedCount} added · {finalParticipantCount} total` (three small pills) so the host can see the audit at a glance without scrolling.

### Locale strings
Add to `src/locales/en.json` under a new `logImpact.participants` section. Keys: `title, default_label, override_helper, breakdown_chip, search_placeholder, search_empty_query, search_no_results, add_button, remove_confirm, removed_toast, added_toast, event_in_progress_lock`.

---

## Edge Cases + Handling

| Edge case | Handling |
|---|---|
| Event with zero signed-in attendees | Default = 0. Override input still editable. Host can either type a number OR add specific users via search. Volunteer hours = 0 if final = 0. Save still allowed (some events have no attendance worth recording). |
| User in multiple collectives | Search returns all their collective names as chips. No filtering by event collective - host on a national event can add cross-collective members. |
| User signed in but didn't actually attend | Host uses the existing event-day "uncheck-in" flow (already exists in `event-day.tsx`) to flip them off `attended`. The post-event search add/remove only handles `host_added` rows — a `self_signin` row can't be removed via this surface. Belt-and-braces: explicit error message if host taps × on a self_signin row (UI hides the × on those rows; only host_added rows get a removable button). |
| Event still in progress (date_end > now) | Both ParticipantCountSection and AddParticipantSection render in read-only / disabled state with banner "Event hasn't ended yet." Reuse existing `isPastEvent(event)` helper. |
| Event with no date_end | Treat as instantaneous - allow the survey immediately. Event duration defaults to 3 hours per existing legacy logic in `computeEstimatedHours`. |
| Host adds same user twice | RPC `add_event_participant` is idempotent. UPDATE on the existing row promotes status to 'attended', no double-credit. Frontend should optimistically check the search-result already-added state, but worst case the RPC handles it. |
| Host adds then removes immediately | DELETE removes the row entirely. `get_user_impact_stats` RPC sees nothing for that event/user, credit is reversed. Idempotent. |
| Host adds a user, then later that same user signs in via QR | Already-existing `host_added` row gets flipped by the check-in flow. Source field: per `add_event_participant` logic, we preserve `self_signin` if it ever gets set, so subsequent self-signin should overwrite source from `host_added` → `self_signin` (this needs to be in the check-in flow patch - if existing row, set source = 'self_signin' since the user did sign in for real). |
| Volunteer hours edit window | Existing 48h edit window for non-staff applies to the whole form including new fields. After 48h, only staff can edit. Unchanged semantics. |
| Multi-host event (event_hosts view) | Hours/attendees still recorded once per event in `event_impact`. The `shareValue` per-host weighting (already in `src/lib/impact-metrics.ts`) splits totals across host collectives at read time. No change needed for this brief - hours just need to be the right total per event. |
| User cancellation after host-add | If host adds a user via search, then user cancels, the cancellation flow (currently flips status to 'cancelled') should be allowed - their impact credit is auto-removed since RPC keys on `status='attended'`. Edge: the host_added row's `source` is preserved through status change for audit. |
| Profile visibility / PII | Search RPC is gated to `is_collective_staff_or_above`. Frontend only renders the search component inside Log Impact, which is already gated `isAssistLeader || isStaff`. Email field returned only because caller has staff role. RLS untouched. |
| Existing legacy data | Migration 2 backfills `attendees_override = attendees` for legacy rows so existing reports continue to work. Migration 1 backfills source columns. Net: legacy rows are unchanged in surfaced totals. |

---

## Implementation Order (suggested PR sequence)

| # | Scope | Effort |
|---|-------|--------|
| 1 | **Migrations 1-2** (schema columns only, no RPC changes). Deploy. Regen types. Verify backfill counts. | small |
| 2 | **Migration 3** (search + add + remove RPCs). Deploy. Smoke-test via `supabase functions invoke` / direct SQL with a staff user JWT. | small-medium |
| 3 | **Self-signin source stamp** patch (check-in form + check-in RPCs set `source='self_signin'`). Independent ship - no UI surface change. | small |
| 4 | **Log Impact UI overhaul** (ParticipantCountSection + AddParticipantSection + multiplier strip rewrite + hero banner pill update + en.json strings + useLogImpact DTO extension). | medium-large |
| 5 | **Smoke tests** (`tests/suites/coexist.js` if it exists, or Playwright spec): leader logs into event, verifies default count, types override, adds 2 users via search, removes 1, submits, re-loads and confirms persistence. | medium |
| 6 | Deploy to Vercel. Mobile + desktop test. | small |

PRs 1-3 ship behind no feature flag (additive, no UI change). PR 4 changes the visible UI - smoke-test before merge.

---

## Open Questions for Tate

1. **Should host-added participants receive an in-app notification / push?** Tate's brief implies silent attribution ("their profile impact stats are connected"). Default plan: silent (no notification). If Tate prefers a "[Host name] credited you for [event]" push, easy add. **Decision needed before PR 4.**
2. **Should the participant search return non-Co-Exist users (i.e. people with no profile yet)?** Brief says "search Co-Exist user base". Default plan: search profiles only (no invitation flow from this surface). The "only existing members" boundary is in the spec.
3. **Audit trail surfacing on the public event page or admin dashboard?** Currently the audit fields (default vs override, source enum) are stored but not surfaced. Default plan: show breakdown chip on the host's Log Impact form only. Admin dashboard surfacing can be a follow-up if needed.
4. **Participant cap on host-add (anti-abuse)?** A leader could in theory add 1000 fake participants and inflate stats. Default plan: no hard cap, but log a `crm_activity` / staff-action audit row per add_event_participant call so abuse is observable. If Tate wants a per-event cap (e.g. "host_added count cannot exceed 3× signed_in count"), add it as a CHECK constraint or SQL guard in the RPC.
5. **Hours-per-attendee bug** (out of scope, flagging only): `get_user_impact_stats` currently SUMs `hours_total` (which is total event hours, e.g. 80) into each attendee's "hours_volunteered" - giving each of 10 attendees 80 hours instead of 8. Pre-existing bug, NOT part of this brief. Flag for separate fix.

---

## Effort Estimate Summary

- **Migrations + RPCs:** small (1 day for an implementation fork including testing).
- **Frontend overhaul (PR 4):** medium-large (2-3 days). Search debounce, add/remove flow, optimistic UI, pre-populating override from existing row, locale strings, two new extracted components, careful state management for the existing `useDirty` guard.
- **Total realistic ship window (single fork, sequential):** 4-5 days.

---

## References

- Brief origin: Tate SMS 16:45 AEST 4 May 2026
- Existing files audited: `src/pages/events/log-impact.tsx`, `src/pages/events/post-event-survey.tsx`, `src/hooks/use-event-survey.ts`, `src/hooks/use-events.ts`, `src/lib/survey-impact.ts`, `src/lib/impact-metrics.ts`
- Existing migrations consulted: `001_initial_schema.sql`, `041_canonical_impact_metrics.sql`, `060_survey_impact_linkage.sql`, `20260331000000_backfill_volunteer_hours.sql`, `20260401010000_event_impact_attendees.sql`, `20260331160000_exclude_legacy_from_rpcs.sql`, `20260501040000_profile_visibility_tiering.sql`
- Co-Exist client doctrine: `~/ecodiaos/clients/coexist.md`
- Pattern: `~/ecodiaos/patterns/client-code-scope-discipline.md` (this is plan-only; ship requires Tate go-ahead per the standing client-comms / client-code rule)

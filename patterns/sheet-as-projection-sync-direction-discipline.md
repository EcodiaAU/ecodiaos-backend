---
triggers: sheet-sync, excel-sync, sync-direction, projection-sync, partial-state-sync, sheet-not-source-of-truth, impact-sheet-only-past-events, future-event-sync-cancel, sync-reconciliation-scope, syncFromExcel, syncToExcel, reconciliation-window, future-events-must-never-be-cancelled-by-sync, post-event-reporting-sheet, gate-symmetry, reconciliation-must-mirror-append-gate, impact-survey-grace-period, in-progress-event-cancellation, grace-period-must-anchor-to-impact-not-creation
---

# Sheet-as-projection sync direction discipline - sheets that only hold a subset of state must never authoritatively cancel app rows outside that subset

## The rule

When a sheet (Excel, Google Sheets, any external substrate) holds only a SUBSET of the app's state - such as only past events, only events with a submitted impact survey, only events in migrated collectives - the sync's reconciliation step MUST scope its delete/cancel candidate query to the SAME subset the sheet covers. Anything outside that subset is absent from the sheet BY DESIGN and must never be touched.

## Why this matters

A sheet that only holds past events will NEVER contain future events. Treating "absent from sheet" as "deleted from sheet" will cancel every future event on every sync run. The sheet's coverage is not a bug - it IS the design. The reconciliation query must mirror that coverage exactly.

## Anti-pattern

Treating a sheet that only holds X as the source of truth for "everything that should exist." The inference "row not in sheet → row was deleted in sheet → cancel in app" is only valid when the sheet's coverage includes that row class. For a post-event impact sheet, future events are invisible by design.

**The Co-Exist incident (11 May 2026):** `syncFromExcel` reconciled events present in the DB but absent from the impact sheet as "deleted from sheet." The impact sheet only ever contains past events where an impact survey was submitted. All 8 future events in the DB were absent from the sheet for the right reason - they hadn't happened yet. Result: all 8 cancelled on the next sync run.

## Do

In the reconciliation candidate query, add the explicit filter that matches the sheet's coverage:

```typescript
// Impact sheet = only past events. Never reconcile future events.
.lt('date_start', runStartedAt.toISOString())

// If gated by survey submission:
// .eq('impact_survey_submitted', true)

// If gated by collective migration:
// .not('collectives.forms_migrated_at', 'is', null)
// .gte('date_start', 'collectives.forms_migrated_at')
```

Apply ALL applicable filters simultaneously. The query's WHERE clause must describe the exact same population the sheet is built from.

## Do not

- Assume all rows of a table are in scope for reconciliation just because some rows are.
- Rely on a grace-period timer alone (though it helps). The correct fix is a coverage-scoped filter, not a race-condition workaround.
- Build the reconciliation query by working backwards from "what's in the DB" without first writing down "what's in the sheet."

## Protocol when authoring or auditing any sync path

1. **Write down the sheet's coverage rule first.** Date filter? Status filter? Survey-submission gate? Collective-migration gate? User filter? Write it in a comment above the reconciliation query.
2. **Apply that SAME filter to the reconciliation candidate query.** Every dimension the sheet uses to decide inclusion must appear as a filter on the DB query.
3. **Enumerate all trigger paths.** Per `~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md`: cron, webhook, manual admin run, edge function on event publish, Supabase pg_cron. Each path that runs reconciliation must carry the filter.
4. **Test the boundary.** Create an app row that the sheet's coverage rule excludes. Run sync. Confirm the row is still there.
5. **Audit the sheet after any sync-logic change** for rows that violate the new rules (per `~/ecodiaos/patterns/excel-sync-collectives-migration.md` cleanup lesson).

## The fix that shipped in PR #19 (11 May 2026)

```typescript
// supabase/functions/excel-sync/index.ts - reconciliation candidate query
.select('id, collective_id, date_start, status, created_at, collectives(forms_migrated_at)')
.in('status', ['published', 'completed'])
.gte('date_start', SYNC_CUTOFF_DATE)
.lt('date_start', runStartedAt.toISOString()) // ADDED: never reconcile future events - absent from sheet by design
.lt('created_at', cutoffIso)                   // 2-hour grace period
```

The `runStartedAt` upper bound mirrors the sheet's actual coverage for the date dimension. But this was not enough.

## The 17 May 2026 Lilydale incident - gate-symmetry was incomplete

PR #19 closed the future-event hole, but reconciliation was still cancelling events whose `date_start` had *just passed* and whose leader hadn't yet submitted the impact survey. The Lilydale Tree Planting w/ Yarra Ranges Council was cancelled 15 minutes after its scheduled start: `date_start` was 00:15 UTC, reconciliation ran at 00:30 UTC, the leader was still on-site setting up, no `event_impact` row had been written, no row was on the sheet. Reconciliation saw "DB has event, sheet doesn't" and cancelled. The cancellation then broke the check-in code (lookup throws "This event has been cancelled") for the actual attendees who turned up.

Root cause: the reconciliation candidate selector mirrored the to-excel push selector on date and migration dimensions but NOT on the impact-data dimension. The to-excel APPEND gate at the same time (`a9e5937`) had been tightened to require `hasImpactData=true` AND `hasHappened=true` - so an event without impact data is NEVER on the sheet by design. Reconciliation didn't know that.

## Gate-symmetry rule (the load-bearing doctrine)

Every reconciliation candidate filter must be a strict subset (or exact match) of the conditions under which the forward-sync would PUSH the row. If push has gate G1 ∧ G2 ∧ G3, reconciliation must require G1 ∧ G2 ∧ G3 too. Otherwise reconciliation will cancel events the push path never made eligible.

For the Co-Exist excel-sync, the to-excel APPEND gates are:
- status IN ('published', 'completed')
- date_start >= SYNC_CUTOFF_DATE
- date_start < now (`hasHappened`)
- collective.forms_migrated_at IS NOT NULL AND date_start >= forms_migrated_at
- NOT synthetic (created_by IS NOT NULL AND NOT UUID v5)
- event_impact row exists (`hasImpactData`)
- not matching a Forms-row dedup signature

Reconciliation cancels events that pass ALL of those AND are absent from the sheet. If any reconciliation candidate condition is weaker than the corresponding push condition, that is the bug.

## Grace period must anchor to the most recent push-eligibility transition, not creation

The PR #19 fix put a 2-hour grace period on `event.created_at`. That was wrong for the same reason the future-event filter was wrong before PR #19: it anchored to the wrong dimension. Push-eligibility transitions when impact data is logged, not when the event is created. A leader can create an event months in advance, hold it, run it, and log impact days later. Reconciliation must wait long enough AFTER impact-data submission for the next to-excel cron to have pushed it.

For Co-Exist: to-excel runs hourly, from-excel runs every 30 min. The 6-hour grace anchored on `event_impact.logged_at` gives at least 6 to-excel cycles for the row to land on the sheet before reconciliation treats absence as deletion - safe headroom for transient failures and retries.

## The 17 May 2026 fix

```typescript
// supabase/functions/excel-sync/index.ts - reconciliation candidate query
.select('id, collective_id, date_start, status, created_by, collectives(forms_migrated_at)')
.in('status', ['published', 'completed'])
.gte('date_start', SYNC_CUTOFF_DATE)
.lt('date_start', runStartedAt.toISOString())

// Then: pre-load MATURE event_impact rows (logged_at < runStartedAt - 6h)
const { data: impactRows } = await supabase
  .from('event_impact')
  .select('event_id, logged_at')
  .in('event_id', candidateIds)
  .lt('logged_at', impactCutoffIso) // 6h grace anchored to impact submission

// Per-candidate gates:
if (c.created_by === null || isSyntheticFormsUuid(c.id)) continue  // synthetic gate
if (!matureImpactEventIds.has(c.id)) continue                       // impact + grace gate
```

The `event.created_at` filter is dropped - it was the wrong anchor. The impact-data gate + impact-grace replaces it. The synthetic-event gate mirrors the to-excel skip.

## Sheet semantics for cancelled events

For future readers: there is NO delete-from-sheet path triggered by an app event becoming `status='cancelled'`. When the app cancels an event, the to-excel run simply stops including it (`.in('status', ['published','completed'])`). The existing sheet row, if any, persists. If the leader wants the row gone, they delete it on the sheet - and reconciliation propagates that deletion back to the DB via the cancellation pathway above. Deletion flow is sheet -> DB only.

## Health-guard protection (added 2026-05-17 post-audit)

Even with gate-symmetry, a sustained to-excel outage can produce false cancellations: a leader submits impact while Graph API is down, the to-excel cron keeps failing for >grace-period hours, then from-excel reconciliation fires and sees an event with mature impact data but no sheet row -> false cancel.

The health guard closes this hole. Before running the reconciliation tail, syncFromExcel queries `excel_sync_runs` for any to-excel row in the last 2 hours. If absent, reconciliation skips entirely and logs an INFO message. When to-excel recovers, reconciliation resumes on the next from-excel cycle.

The choice of 2h is sized to one missed hourly cycle plus a buffer. 7+ days of production history at the time of the audit showed zero to-excel gaps over 90 minutes; 2h is comfortable.

## Audit protocol for sync-direction code

Apply when authoring or reviewing any DB <-> external-sheet sync:

1. **Enumerate every condition that gates the FORWARD push.** Status, date filter, migration flag, synthetic detection, payload completeness gates (e.g. impact-data existence), de-duplication signatures. Write them down.
2. **Verify the REVERSE reconciliation predicate is a strict subset of those conditions.** If the push path has gate G, reconciliation must require G or stronger. Anything weaker = a row that the push never wrote, which reconciliation will then cancel.
3. **Identify what dimension push-eligibility transitions on.** For Co-Exist it is `event_impact.logged_at`. For other systems it might be `order.paid_at`, `report.submitted_at`, etc. The grace period MUST anchor on that dimension, not on `created_at`.
4. **Enumerate every path that can set the destructive state.** For Co-Exist `events.status='cancelled'`: leader app action (intentional), reconciliation (the audited path), DB triggers, RLS, other crons. Confirm only the intentional + audited paths exist.
5. **Verify health signal for the forward push.** If the push side can go silent (network, auth, rate-limit), reconciliation MUST detect that and pause. Otherwise sheet-absence under push-down conditions = false delete.
6. **Pin invariants in unit tests that mirror the production predicates.** Drift between the predicate-as-written and the predicate-as-tested is the recurring failure mode.

## Cross-references

- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md` (closely related - same shape: filter the candidate set to match the source's actual scope)
- `~/ecodiaos/patterns/excel-sync-collectives-migration.md` (architecture invariant for Co-Exist: forms_migrated_at gate, pg_cron jobids 9+10)
- `~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md` (enumerate ALL paths that run reconciliation)
- `~/ecodiaos/patterns/supabase-pat-reaches-every-owned-project-from-main.md` (how to probe the fix directly from main)

## Origin

Three-step learning. (1) Co-Exist Excel sync incident 11 May 2026: `syncFromExcel` reconciliation cancelled all 8 future events because the impact sheet only contains past events. PR #19 fix added `.lt('date_start', runStartedAt.toISOString())`. 8 events restored manually. (2) 17 May 2026 Lilydale Tree Planting w/ Yarra Ranges Council was cancelled 15 minutes after `date_start` because the leader had not yet logged impact - reconciliation only mirrored the date dimension, not the impact-data dimension. Check-in code stopped working for attendees the moment the event flipped to cancelled. Fixed by gate-symmetry + impact-anchored grace (commit `471e8b6`). (3) Same-day audit triggered by Tate's "this is getting ridiculous" - traced every path that can set `status='cancelled'`, enumerated edge cases, added a health-guard so reconciliation pauses when to-excel has been silent (commit `0984f8d`). Codified the audit protocol in this doctrine for future sync-direction code reviews.

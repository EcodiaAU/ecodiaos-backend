---
triggers: sheet-sync, excel-sync, sync-direction, projection-sync, partial-state-sync, sheet-not-source-of-truth, impact-sheet-only-past-events, future-event-sync-cancel, sync-reconciliation-scope, syncFromExcel, syncToExcel, reconciliation-window, future-events-must-never-be-cancelled-by-sync, post-event-reporting-sheet
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

## The fix that shipped in PR #19

```typescript
// supabase/functions/excel-sync/index.ts - reconciliation candidate query
.select('id, collective_id, date_start, status, created_at, collectives(forms_migrated_at)')
.in('status', ['published', 'completed'])
.gte('date_start', SYNC_CUTOFF_DATE)
.lt('date_start', runStartedAt.toISOString()) // ADDED: never reconcile future events - absent from sheet by design
.lt('created_at', cutoffIso)                   // 2-hour grace period
```

The `runStartedAt` upper bound mirrors the sheet's actual coverage: the impact sheet only ever contains events that have already occurred.

## Cross-references

- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md` (closely related - same shape: filter the candidate set to match the source's actual scope)
- `~/ecodiaos/patterns/excel-sync-collectives-migration.md` (architecture invariant for Co-Exist: forms_migrated_at gate, pg_cron jobids 9+10)
- `~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md` (enumerate ALL paths that run reconciliation)
- `~/ecodiaos/patterns/supabase-pat-reaches-every-owned-project-from-main.md` (how to probe the fix directly from main)

## Origin

Co-Exist Excel sync incident 11 May 2026. `syncFromExcel` reconciliation cancelled all 8 future events in the app because the impact sheet only contains past events with submitted surveys. PR #19 fix: added `.lt('date_start', runStartedAt.toISOString())` to the reconciliation candidate query. 8 events restored via direct REST API PATCH before the PR landed.

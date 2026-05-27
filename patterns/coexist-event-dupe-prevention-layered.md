---
triggers: coexist-event-dupe, event-dupe-prevention, coexist-events-unique-constraint, coexist-dupe-monitor
status: active
authored: 2026-05-11
fork_id: fork_mp0oo9cz_626123
---

# Co-Exist event duplicate prevention: layered DB + app + monitor

## Rule

Three independent layers must ALL be in place to permanently prevent the sheet-sync
path from producing duplicate events in Co-Exist prod. One layer failing must not
cause silently-accumulating duplicates.

## Why this exists

The Excel/sheet-sync import (`syncFromExcel`) has produced duplicate events on at
least three occasions in seven days: 4 May 2026 (synthetic UUIDs sweep), 9 May 2026,
and 11 May 2026. Tate verbatim 14:07 AEST 11 May 2026: "This can not happen in future."

## The three layers

### Layer 1 - DB uniqueness constraint (installed 2026-05-11)

Index name: `uq_events_collective_date_title_new`
Table: `public.events`
Key: `(collective_id, CAST(timezone('UTC', date_start) AS date), lower(title))`
Partial WHERE: `created_at >= '2026-05-12 00:00:00+00'`

The partial WHERE grandfathers the 180 legacy dupe groups that existed before the
constraint was applied. Once those legacy rows are cleaned, drop the WHERE clause and
recreate as a full unique index.

Migration file: `supabase/migrations/20260511030000_event_dupe_prevention.sql`
Branch: `fix/event-dupe-prevention-2026-05-11` (push SHA 85f0cce)

### Layer 2 - Application-level ON CONFLICT guard

The `syncFromExcel` INSERT path must use `ON CONFLICT DO NOTHING` (or `ON CONFLICT DO UPDATE`)
on the unique key tuple. This makes the INSERT idempotent: a re-import of the same event
is a no-op rather than a duplicate row.

Responsibility: Worker B code audit (sibling fork to fork_mp0oo9cz_626123).

### Layer 3 - Daily cron monitor (installed 2026-05-11)

Cron name: `coexist-dupe-suspect-check`
Cron ID: `bad85847-e860-42ca-b1b8-f422ae80388e`
Schedule: daily 09:00 AEST
View queried: `public.event_dupe_suspect`

The view shows all `(collective_id, event_date_UTC, lower(title))` groups with more
than one row. The cron queries the view filtered to rows created after the constraint
date. Count > 0 means the unique index was somehow bypassed and triggers a P1
status_board alert.

Silent success (count == 0) is the correct and expected outcome per
`~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`.

## Do

- When writing any INSERT path for Co-Exist events, always include `ON CONFLICT DO NOTHING` or
  an explicit upsert on `(collective_id, event_date_UTC, lower(title))`.
- If the daily cron raises a P1 alert, treat it as a P0 data integrity incident:
  identify the bypass path, fix it, then clean the new dupes.
- When the legacy dupe groups (pre 2026-05-12) are cleaned, upgrade the index to full
  (drop WHERE clause) to close the remaining gap.

## Do not

- Do not INSERT events without checking the unique key first (app layer).
- Do not assume the DB constraint alone is sufficient - the partial index does not
  cover duplication of pre-constraint rows by new rows.
- Do not skip the daily cron. If `coexist-dupe-suspect-check` goes silent (no fires at
  all), verify the task is still active in `os_scheduled_tasks`.

## Uniqueness key choice rationale

Probe run 2026-05-11 against the first 500 events (ordered by `created_at DESC`):
- `(collective_id, date_start::date, lower(title))` - 171 violation groups
- `(collective_id, date_start::date)` alone - 173 violation groups

Same-day multi-event per collective IS possible (two different events same day) so
`(collective_id, date_start::date)` alone is too narrow. Adding `lower(title)` reduces
false positives significantly. No `external_id` column exists on the events table.

`date_start::date` uses `CAST(timezone('UTC', date_start) AS date)` in the index to
avoid the VOLATILE cast problem (`timestamptz::date` depends on session timezone).

## Origin

- 4 May 2026: first synthetic-UUID sweep (Worker B discovered collectives migration
  created events with deterministic UUIDs, producing dupes on re-import)
- 9 May 2026: second recurrence
- 11 May 2026: third recurrence. Manager fork `fork_mp0omco5_597410` spawned four
  worker forks. This fork (fork_mp0oo9cz_626123) = Worker C: permanent prevention.

## Cross-refs

- `~/ecodiaos/patterns/excel-sync-collectives-migration.md` - the import path that
  generates the events being constrained
- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md` - why synthetic
  rows must not feed back into the source sheet
- `~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md` -
  all paths that INSERT events must be audited, not just the obvious one
- `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` -
  silent exit on clean count is correct for the daily monitor

---
triggers: canonical-aggregation, stats-architecture, co-exist, impact-query, fetchImpactRows, fetchBaselineSettings, dashboard-divergence, per-page-sql
status: active
---

# Co-Exist Stats Canonical Aggregation Architecture

## Rule

All Co-Exist stats pages (/, /leader, /admin, /admin/impact) MUST derive their numbers from the canonical chain:

```
fetchImpactRows(scope) + fetchBaselineSettings()
```

Both functions live in `src/lib/impact-query.ts`. No bespoke per-page SQL. No direct imports of BASELINE_* constants in UI hooks for aggregate calculations.

---

## Do

- Call `fetchImpactRows(scope)` for any metric aggregation. Scope values: `'national'`, `'collective'`, `'public'`.
- Call `fetchBaselineSettings()` to retrieve pre-2026 baseline values from `app_settings` rows. Never hardcode these values in hook files.
- Call `fetchBaselineByYear(year)` for per-year comparison queries (e.g. 2022 vs 2024 tree planting breakdowns).
- Add new metrics to `impact-query.ts` first, then surface them through the existing hook layer.
- Keep DB-sourced baseline keys as the single source of truth. Constants are fallback values only (for local dev or cold-start before DB read completes).

---

## Do NOT

- Import `BASELINE_TREES`, `BASELINE_RUBBISH_KG`, or any other `BASELINE_*` constant directly in UI hooks for aggregate calculations. Use `fetchBaselineSettings()`.
- Write new SQL queries against `event_impact` or `events` in page-level hooks or components.
- Duplicate the two-step (events -> event_impact) query pattern outside of `impact-query.ts`.
- Add a `.where(status='completed')` filter in one view but not another. Filter semantics belong in the canonical layer, not scattered across pages.
- Treat `created_at` as event date. It is operational only. Use `events.date_start` for all impact timeframe logic.

---

## Canonical Chain

```
Page component
  -> UI Hook (use-impact.ts | use-admin-impact-observations.ts | use-public-stats.ts)
    -> src/lib/impact-query.ts
        fetchImpactRows(scope)  ->  Supabase: events, event_impact, event_hosts
        fetchBaselineSettings() ->  Supabase: app_settings (impact_baseline_* keys)
        fetchBaselineByYear(yr) ->  Supabase: app_settings (impact_baseline_*_YYYY keys)
```

Hook files are thin: they call the lib, they format for display, they do nothing else.

---

## Timeframe Semantics

- `events.date_start` is canonical for "when did the impact happen". Label it `event_date` in query aliases.
- `created_at` is when the DB row was created. Never use it to bucket impact by year or season.
- Baseline date floor: `2026-01-01` (the `IMPACT_BASELINE_DATE` constant). Any event with `date_start >= 2026-01-01` is a live tracked event. Events before that date are represented by the app_settings baseline rows.
- Pre-2026 data was collected via Microsoft Forms and lives in the master impact Excel sheet. The `app_settings` baseline keys are the DB-side representation of that historical data.

---

## app_settings Baseline Keys

These rows live in the `app_settings` table of the Co-Exist Supabase project (`tjutlbzekfouwsiaplbr`). `fetchBaselineSettings()` reads them at runtime.

| Key | Value | Meaning |
|-----|-------|---------|
| `impact_baseline_trees` | 36637 | Total pre-2026 trees planted (all years combined) |
| `impact_baseline_trees_2022` | 17300 | 2022 trees from master sheet |
| `impact_baseline_trees_2024` | 3702 | 2024 trees from master sheet |
| `impact_baseline_trees_2025` | 15635 | 2025 trees from master sheet |
| `impact_baseline_events` | 340 | Pre-2026 events held |
| `impact_baseline_attendees` | 5500 | Pre-2026 volunteer attendees |
| `impact_baseline_hours` | 11000 | Pre-2026 volunteer hours |
| `impact_baseline_rubbish_kg` | 4900 | Pre-2026 rubbish collected (kg) |

Per-year keys (2022, 2024, 2025) were added via migration `20260511030000_per_year_baseline_settings.sql`. They allow `fetchBaselineByYear(year)` to return year-scoped totals for comparison charts without hardcoding values in TypeScript.

---

## Excel Sync Dedup Architecture

The master impact Excel sheet is the external source of truth for pre-2026 data. The `excel-sync` Edge Function bridges it to Supabase. Key dedup guards as of 11 May 2026:

- `findMatchingAppEvent`: fuzzy title + date match to find existing app events. Synthetic events (Forms-synced rows, v5 UUID IDs) are valid match candidates (exclusion for `isSyntheticFormsUuid` was removed in migration `20260511040000`).
- Existence guard: before creating a new synthetic event, a secondary check on `(collective_id, date, title)` prevents duplicates when the fuzzy match fails.
- DB-level unique constraint: partial unique index `events_synthetic_dedup` on `(collective_id, date_start::date, lower(trim(title)))` WHERE the `id` is a v5 UUID. Stops duplicate synthetic rows at the DB layer.

---

## Drift Detection

A nightly cron (02:00 AEST) reads the master impact sheet via Microsoft Graph API, runs the canonical aggregation chain, and compares the two totals. If drift exceeds configured thresholds:

- Writes a P2 status_board row describing the gap
- Writes a Neo4j Episode with the diff details
- Flips the `stats_drift_detected` key in `app_settings`

The `/admin/impact` page shows a badge when `stats_drift_detected` is truthy, surfacing the issue to admins without relying on Tate noticing the UI numbers look wrong.

Last run status: `app_settings` key `stats_drift_last_run` (ISO datetime string).

---

## Origin

Tate verbatim 11 May 2026 21:08 AEST: "we need to shit on these stats being disobedient for the last time, and do a complete unification, overhaul, and hygiene pass of the way we calculate and display stats on the app."

Manager fork: `fork_mp145m4a_f6f397`. Delivered by sub-forks A-D across six commits: `b33f6a9`, `519e21a`, `6dafe44`, `7d0341d`, `c89a432`, `37657fd`.

---

## Cross-refs

- `~/ecodiaos/patterns/single-canonical-aggregation-feeds-all-dashboard-surfaces.md` (generalisable doctrine this implements)
- `~/ecodiaos/clients/coexist.md` (stats architecture section with full baseline key table and cron details)
- `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md` (sync reconciliation must scope candidates to the sheet's actual coverage)
- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md` (synthetic vs source rows in bidirectional sync)

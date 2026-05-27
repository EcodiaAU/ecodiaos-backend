---
triggers: canonical-aggregation, dashboard, stats, multiple-pages, divergence, single-source-of-truth, aggregation-layer
status: active
---

# Single Canonical Aggregation Feeds All Dashboard Surfaces

## Rule

Any product with multiple dashboard views (user-facing, leader, admin, public, API) MUST share one canonical aggregation layer. Stats are computed once, in one place. No bespoke SQL added per view.

If you find yourself writing a `SELECT` against a facts table in a page-level hook, you are in the wrong place.

---

## The Pattern: Three-Layer Architecture

```
Layer 1: DB tables (source of truth)
  events, transactions, submissions, sessions - whatever the domain facts are

Layer 2: Canonical aggregation module (the only place that queries and aggregates)
  - A Postgres function: get_collective_stats(), get_dashboard_totals()
  - An Edge Function: /api/impact-summary, /api/revenue-summary
  - A lib file: src/lib/impact-query.ts, src/lib/stats.ts
  This layer owns ALL filter semantics: status filters, date ranges, exclusion rules,
  pre-computed baseline additions. Nothing else touches these decisions.

Layer 3: UI hooks (thin)
  Call the canonical module. Format for display. Nothing else.
  use-impact.ts, use-admin-stats.ts, useDashboard.ts
  These files have NO SQL, NO filter logic, NO baseline math.
```

One canonical module feeds every surface: the public homepage, the leader view, the admin panel, the export endpoint, the drift-detection cron. They all call the same function with the same parameters.

---

## Do

- Create a single lib file, Postgres function, or Edge Function as the canonical aggregation surface when starting a new dashboard product.
- Import or call it from every hook and every page that needs the same metric.
- Put ALL filter semantics (status, date range, exclusion rules) inside the canonical module. Not in hooks. Not in components.
- Store baseline/configuration values in a DB table (`app_settings`, `config`, `product_settings`). Read them at runtime via the canonical module.
- Pair the canonical layer with a drift-detection job that compares it against the authoritative external source on a schedule.

---

## Do NOT

- Add `.where(status='completed')` in one view and forget it in another. This is the exact failure mode this pattern prevents.
- Import baseline constants (e.g. `BASELINE_TREES = 36637`) in UI hooks. Constants are hardcoded approximations. DB rows are exact values that can be updated without a deploy.
- Write the aggregation twice: once for the user-facing page and once for the admin page, "because they have slightly different requirements." Slightly different requirements = a parameter on the canonical function.
- Use `created_at` as a proxy for "when did the business event happen." Use the domain event date (the actual date of the transaction, activity, or observation).

---

## The Failure Mode: Per-Page SQL

Per-page SQL diverges silently and immediately.

Timeline of a typical divergence:
1. Page A is built. It queries events directly with a correct `status='completed'` filter.
2. Page B is built three weeks later. The developer copies the query but misses the status filter. All statuses are now included.
3. Page A shows 843 events. Page B shows 1,102.
4. Tate notices the admin page and the public page disagree. No one knows which is right. Both are plausible.
5. Debugging requires reading two separate query implementations, understanding what they share, and identifying what drifted.

With a canonical layer, step 1 is the only step. All pages use the same function. The only question is what parameters to pass.

---

## Baseline Constants Are Fallback Only

Define baseline/seed values in a DB config table, not as TypeScript or Python constants.

Constants are fine for initial development. They become a liability the moment the external source of truth (master sheet, finance system, manual count) is updated. You now have to deploy code to fix a data value.

DB rows are updateable without a deploy. They are auditable (created_at, updated_at, who changed them). They can be read by the drift-detection cron to compare against the canonical aggregation.

Rule: if a baseline value comes from an external source that can change (a spreadsheet, a third-party API, a finance system), it belongs in a DB table, not a constant.

---

## Drift Detection: Always Pair the Canonical Layer

Every canonical aggregation layer needs a companion drift-detection job.

The job:
1. Reads the authoritative external source (master sheet, third-party API, finance export).
2. Runs the canonical aggregation chain.
3. Compares the two totals.
4. On divergence above a threshold: writes a P2 status_board row, writes a Neo4j Episode, surfaces a badge or alert in the admin UI.

Without this job, drift is discovered by Tate noticing the UI looks wrong. That is a slow, unreliable, trust-eroding detection mechanism.

The badge in the admin UI is the last line of defence, not the first.

---

## Worked Example

Co-Exist stats unification, 11 May 2026. Four pages (/, /leader, /admin, /admin/impact) were independently computing tree-planting counts using different SQL fragments and different copies of baseline constants. Results diverged across pages. The fix:

1. Canonical lib: `src/lib/impact-query.ts` - `fetchImpactRows(scope)` and `fetchBaselineSettings()`.
2. Per-page hooks rewritten to call the lib. All filter semantics moved into the lib.
3. Baseline constants replaced by `app_settings` rows (per-year values for 2022, 2024, 2025).
4. Drift detection cron (nightly 02:00 AEST) comparing canonical totals against master Excel sheet via Microsoft Graph API.

Result: all four pages produce identical totals. Drift is detected programmatically, not visually.

Full Co-Exist architecture: `~/ecodiaos/patterns/co-exist-stats-canonical-aggregation-architecture.md`.

---

## Cross-refs

- `~/ecodiaos/patterns/co-exist-stats-canonical-aggregation-architecture.md` (Co-Exist worked example of this pattern)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (drift between what the UI shows and what actually shipped is the same problem class)

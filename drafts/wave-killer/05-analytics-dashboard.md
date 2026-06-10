# Wave-Killer Worker 05 - Real analytics dashboard

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 2 reporting and analytics dashboard

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 3, real reporting is a tie-ish-leaning-Wave area. Replace `Dashboard.tsx` (currently shallow) with a substantive officer-facing analytics surface covering engagement, retention and churn, and revenue.

### Required deliverables

1. New views (migration `0150_analytics_views.sql`):
   - `v_tenant_member_engagement` - per member: events attended last 90 days, newsletters opened, app opens (from a new `tenant_app_opens` lightweight table written on session start), last_seen_at.
   - `v_tenant_retention_cohorts` - sign-up month cohorts vs. active-at-month-N matrix.
   - `v_tenant_churn` - members whose dues went `lapsed` in last 30 / 60 / 90 days, ranked by tenure.
   - `v_tenant_revenue` - sum of paid dues + paid event tickets per month, broken by member vs. non-member, for the last 12 months.
2. `tenant_app_opens` table (migration in same file or `0151_app_opens.sql`): `(tenant_id, member_id, opened_at)`, RLS member writes own / officer reads all, auto-pruned after 365d via a daily Supabase cron + delete query.
3. Client-side: `src/lib/analytics/sessionPing.ts` writes one row per authenticated app open (debounced, max one per minute) on `AuthProvider` mount.
4. `Dashboard.tsx` rewrite into a 4-panel layout:
   - Engagement (last 30d events / newsletter opens / app opens) - bar chart.
   - Retention (cohort heatmap) - simple coloured grid.
   - Churn (lapsed members list) - table with re-engage CTA tied to `re-engage-scan` flow.
   - Revenue (12-month trend) - dual-line chart with member vs. non-member split.
5. Pick the lightest viable chart lib: `recharts` (already common) or pure CSS / SVG if recharts is overkill. No new framework.
6. Date-range picker (defaults to last 90d) wired across all panels.
7. CSV export button per panel: hits `data-export` edge function which already exists; extend its handler to support the four new view names.

### Out of scope

- Per-member AR (worker 04 owns).
- Cross-tenant reporting for Ecodia's own view (out of audit scope tonight).
- Predictive / ML analytics.

## The eight-rung process is non-negotiable

1. Research codebase: read `src/pages/admin/Dashboard.tsx`, `src/App.tsx` auth flow, `supabase/migrations/0011_newsletter_campaigns.sql`, `0012_paid_event_ticketing.sql`, `0015_member_dues.sql`, `supabase/functions/data-export/`. Decide on chart lib.
2. Plan: TodoWrite each view + each panel + the session ping + the CSV export hooks.
3. Write code: migrations `0150_analytics_views.sql` and `0151_app_opens.sql`, sessionPing client module, Dashboard rewrite, panel components in `src/components/admin/analytics/`, data-export extensions.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests for sessionPing debounce, panel rendering, CSV header rows.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Seed a test tenant with a 12-month dues + event history, query each view, validate non-zero rows + plausible aggregates.
6. Visual verify via CDP: navigate to `/admin/dashboard` on the Vercel preview, screenshot the four panels, change date range, screenshot, export CSV, open and screenshot.
7. Push: branch `feat/wave-killer-05-analytics-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshot of the new dashboard, CSV download verified, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-analytics-2026-05-29` with deliverable matrix.
- Neo4j: Episode `wave-killer-analytics-2026-05-29` covering views, panels, session ping, CSV export.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 3
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan.

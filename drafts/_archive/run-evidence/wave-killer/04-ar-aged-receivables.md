# Wave-Killer Worker 04 - Per-member AR and aged receivables

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 2 per-member AR plus aged-receivables plus overdue automation

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 2 and Part 4 item 4, Wave has no per-member AR or account-balance reporting (named, repeated gap in chamber reviews). The dues lifecycle exists (`tenant_member_dues` + statuses + `dues-renewal-scan`); the gap is the AR rollup view and the dunning automation atop it.

### Required deliverables

1. View `v_tenant_member_ar` (Postgres view, migration `0140_member_ar_view.sql`): per `(tenant_id, member_id)`, expose:
   - `current_due_cents`, `current_paid_cents`, `current_balance_cents`
   - `aged_0_30_cents`, `aged_31_60_cents`, `aged_61_90_cents`, `aged_91_plus_cents`
   - `last_payment_at`, `next_due_at`, `mandate_active`, `dues_status`
   The view aggregates over `tenant_member_dues` joined to `tenant_members` and `tenant_member_mandates`.
2. Admin page `MembersAdmin.tsx` gains an AR column with the live balance + status pill. Sort by balance desc, filter by `aged_31+`, multiselect overdue members for bulk action.
3. New admin page `src/pages/admin/AccountsReceivable.tsx` mounted at `/admin/accounts-receivable`. Buckets across the four aged ranges with a total per tenant. Drill-down to per-member dues history.
4. Statement-of-account PDF per member: `generate-pdf` edge function gains a `statement` mode that renders the AR rollup + open dues + payment history. Officer can email the statement directly from the AR page (uses `send-email` edge function).
5. Dunning automation: new edge function `dues-dunning-fire` runs daily, picks members in `overdue` for 7+ days with `reminders_enabled = true` in `tenant_dues_config`, sends a sequence of three reminder emails over 21 days, escalates to officer-flag on the AR page if still unpaid. Reuse `send-email`.
6. Officer can pause / resume / waive dunning per member from the AR page. Audit log writes to `admin_activity_log` (`0005_admin_activity_log.sql`).
7. Sidebar nav link to AR added in `AdminLayout.tsx`.

### Out of scope

- The dues lifecycle itself (worker 01 verifies).
- The Xero sync of payments (worker 01 verifies; this view reads from the dues table directly).
- Cross-tenant reporting (analytics dashboard worker 05 owns engagement / retention / revenue).

## The eight-rung process is non-negotiable

1. Research codebase: read `supabase/migrations/0015_member_dues.sql`, `0100_becs_direct_debit.sql`, `0080_xero_integration.sql`, `0005_admin_activity_log.sql`, every `supabase/functions/dues-*` + `send-email` + `generate-pdf` directory, `src/pages/admin/DuesAdmin.tsx`, `MembersAdmin.tsx`, `AdminLayout.tsx`.
2. Plan: TodoWrite each of the 7 deliverables. State per item: schema change + UI change + edge function change + verify.
3. Write code: migration `0140_member_ar_view.sql`, AccountsReceivable page, MembersAdmin AR column, generate-pdf statement mode, dues-dunning-fire edge function, AdminLayout nav link, audit log writes.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests for the view query, AR page filters, dunning state machine.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Seed a test tenant with 5 members across each aged bucket, confirm view rows + dunning sequence fires correctly under simulated date advancement (use `set_config('chambers.fake_now')` or equivalent).
6. Visual verify via CDP: navigate to `/admin/accounts-receivable` on the Vercel preview, screenshot buckets, drill into a member, send a test statement to an officer email and screenshot the inbox / PDF.
7. Push: branch `feat/wave-killer-04-ar-aged-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshot of AR page + statement PDF, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-ar-aged-2026-05-29` with deliverable matrix.
- Neo4j: Episode `wave-killer-ar-aged-2026-05-29` covering the view shape, dunning state machine, statement PDF.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 2, Part 4 item 4
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan.

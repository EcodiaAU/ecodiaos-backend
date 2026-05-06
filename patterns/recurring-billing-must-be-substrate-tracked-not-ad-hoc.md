---
triggers: recurring-billing, retainer-invoicing, monthly-licence, client-billing-schedule, recurring-invoice, ad-hoc-invoicing, billing-substrate, invoice-generation-cron, retainer-month-2, retainer-month-3, monthly-retainer, perpetual-licence, passthrough-billing, invoice-line-items, billing-schedule, billing-tracking, client_billing_schedules, billingScheduleEngine, recurring-billing-monthly, INV-2026-003, INV-2026-004, INV-2026-005, no-client-contact-without-tate-goahead, ad-hoc-render-without-tracking
---

# Recurring billing must be substrate-tracked, not ad-hoc

## Rule

Any client engagement with **more than one expected invoice on a cadence** (monthly retainer, monthly licence, quarterly review fee, annual prepay, etc) gets a row in `client_billing_schedules` BEFORE the first invoice ships. The schedule, not chat scrollback or kv_store, is the source of truth for what to bill, when, and what's left.

Ad-hoc render-the-invoice-on-the-day workflows are forbidden once we know the cadence. The first invoice in a recurring arc is the moment to seed the substrate, not the moment to skip it because "I'll just track it next time."

## Why

- **State drift between substrates.** Co-Exist's retainer (3 monthly invoices, May/Jun/Jul) was captured in one kv_store row, one status_board row, one client file, and one fork's brief. Each was reconstructed from the others. None was canonical. Three places to lie, one place to be right - so it ended up uneven across all three.
- **Reconstruction cost.** INV-2026-003 took ~30min of fork work to re-establish line items, ABN, GST math from scratch when the prior month had already done that work. Multiply by every retainer-style engagement and the busywork compounds.
- **Forgetting risk.** Ad-hoc means a calendar reminder somewhere, on someone's body. Tate has plenty of reminders already. The substrate is exactly the kind of thing computers should remember for him.
- **Audit trail.** A `client_billing_generations` row per invoice fired (with subtotal/GST/total/storage URL/test-email-id/client-send-id) is the bookkeeping audit trail BAS time will demand. Reconstructing this from inbox archaeology is worse than just writing it down at fire time.

## Do

- For any client whose engagement implies more than one invoice on a cadence, insert a `client_billing_schedules` row at engagement start (or at the moment the cadence is identified, never later than the first invoice). One row per (client, schedule_type) - retainer, licence, passthrough can be ONE row with multi-line `line_items` if cadence matches, otherwise split.
- Encode the line items as structured JSON: `[{type, description_template, amount_cents, amount_source, schedule_window?, passthrough_query?}]`. Templates allow `{month_year}` and `{n}` substitution at generation time.
- Time-bounded lines (e.g. "3-month retainer") use `schedule_window.max_count` so the line auto-drops after the count is reached. Perpetual lines use `schedule_window: null`.
- The `recurring-billing-monthly` cron (registered 7 May 2026) reads `next_due_date <= today` rows daily 09:00 AEST and dispatches a draft fork. The cron itself is silent on no-due-rows days per `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`.
- The draft fork uses `billingScheduleEngine.draftInvoice` -> `renderDraftPdf` -> Supabase upload -> test-email-to-Tate-with-PDF-attached. NEVER unilaterally sends to the client. Tate replies "send it" -> forward to client with same PDF attached, write `client_send_id` to `client_billing_generations`. Per `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`.
- Write a `client_billing_generations` row at every fire (status: drafted -> tate_review -> tate_approved -> sent_to_client -> paid). Append-only audit trail.
- After successful generation, advance `next_due_date` (+1 month for monthly, +3 for quarterly, +12 for annual). The engine handles this in `commitGeneration`.
- Mirror a P3 `status_board` row (`entity_type='infrastructure'`, `entity_ref='client_billing_schedules.{slug}'`) so daily orient sees the schedule + next fire.

## Do not

- Do not render an invoice ad-hoc when the cadence is already known. If month 2 of a 3-month retainer is being rendered manually because no schedule exists, the failure is the missing schedule, not the missing invoice. Author the schedule alongside or before.
- Do not store schedule data in kv_store as scattered keys (`ceo.invoice.coexist.retainer_structure`, `ceo.invoice.coexist.may_total`, etc). The table is the substrate. kv_store is for ephemeral handoff state, not durable schedule definitions. Migrate any existing kv_store schedule keys to rows.
- Do not let cron auto-send to the client. The test-to-Tate gate stays mandatory. The cron is a reminder + drafter, not a bypass of `no-client-contact-without-tate-goahead.md`.
- Do not skip the `client_billing_generations` row "to save a write". The generation log IS the audit trail. Skipping it = silent invoicing.
- Do not put time-bounded lines in plain `amount_cents` without a `schedule_window`. If month 4 of a 3-month retainer auto-fires the retainer line again because the window was missing, the fix is months of pissed-off client emails, not a quick edit.
- Do not number invoices manually. The dispatcher fork reads `cc_sessions` / existing invoice files at write-time and picks next free per `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`. The `invoice_prefix` column gives the family prefix; the digit is observed at draft time.

## Schema (live in Postgres as of 7 May 2026)

```sql
client_billing_schedules (
  id, client_id, client_slug, client_display,
  schedule_type, frequency, day_of_month,
  status, starts_on, ends_on, next_due_date, last_generated, generated_count,
  line_items JSONB,
  invoice_prefix, due_offset_days, gst_applicable, payment_terms,
  bill_to_block JSONB, payment_block JSONB,
  notes, created_by, created_at, updated_at, archived_at
)

client_billing_generations (
  id, schedule_id, generated_at, generated_by,
  invoice_number, invoice_period,
  subtotal_cents, gst_cents, total_cents,
  draft_path, storage_url, test_email_id, client_send_id,
  status, notes
)
```

Migration: `src/db/migrations/089_client_billing_schedules.sql`. Engine: `src/services/billingScheduleEngine.js`. Cron: `recurring-billing-monthly` (daily 09:00 AEST, silent on no-due-rows).

## Co-Exist worked example (seeded 7 May 2026)

Three line items in one schedule row:
1. Operational retainer ($1,000 ex-GST, 3-month window May/Jun/Jul). After July fires the line drops automatically.
2. Monthly licensing fee ($200 ex-GST, perpetual).
3. Managed 3rd party costs ($82 ex-GST, passthrough-resolved at generation, fallback fixed).

Day-of-month: 7. GST applicable. May was already manually fired as INV-2026-003 (this fork). June schedule is `next_due_date=2026-06-07`. July is `next_due_date` after June commits.

## Origin

Tate verbatim 7 May 2026 09:15 AEST: "THis is month 2 of the operational retainer, things liek this absolutely HAVE to be tracked, this is a full billing/client thing we need to get perfect going forward, worth concreting and a full fork to make some system to do that."

Trigger: INV-2026-003 was rendered ad-hoc by `fork_mouo5of7_d112d2` from kv_store + status_board context, with line items reconstructed each time. Tate flagged this is unacceptable for a recurring engagement and fork `fork_mouoh2fb_fcd4f2` shipped this substrate alongside the v2 ABN + footer fix on the same arc.

## Cross-refs

- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` - hard guardrail on the test-to-Tate-first flow this engine enforces.
- `~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md` - line items as the durable shape carried by this table.
- `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` - cron is silent on no-due-rows days; not a failure mode.
- `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md` - invoice numbering observed at write-time, not assigned in advance.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - this pattern is one application of "every cross-substrate write is a seam".
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file authored same-arc as Tate's directive, not deferred.

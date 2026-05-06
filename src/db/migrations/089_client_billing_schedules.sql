-- 089: client_billing_schedules - durable substrate for recurring client billing
--
-- Tate verbatim 7 May 2026 09:15 AEST: "THis is month 2 of the operational
-- retainer, things liek this absolutely HAVE to be tracked, this is a full
-- billing/client thing we need to get perfect going forward, worth concreting
-- and a full fork to make some system to do that."
--
-- Origin failure: INV-2026-003 (Co-Exist May retainer, month 1 of 3) was
-- rendered ad-hoc by fork mouo5of7_d112d2 with line items reconstructed from
-- kv_store ceo.invoice.coexist.retainer_structure + status_board context, no
-- durable schedule row. Month 2 (June) and month 3 (July) would require the
-- same reconstruction unless captured here. Co-Exist retainer arc has 3
-- monthly invoices; the licence tail is perpetual; passthrough is variable
-- per month. Three different cadences, same client, no canonical record.
--
-- Architectural fix: one row per (client, schedule_type, frequency) with
-- structured line_items JSON, day_of_month trigger, and lifecycle bounds.
-- Cron `recurring-billing-monthly` reads next_due rows and dispatches a fork
-- that drafts the invoice + sends test-to-Tate (per
-- ~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md).
--
-- Doctrine: ~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md
-- Sibling: ~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md
-- Parent:  ~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md
--
-- Numbering: next free per
-- ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md
-- - 088 was the highest at write time (fork_mouoh2fb_fcd4f2).

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_billing_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client linkage. client_id may be NULL until clients table population is
  -- canonical; client_slug is always set and is the durable handle (matches
  -- ~/ecodiaos/clients/<slug>.md filenames).
  client_id       UUID REFERENCES clients(id) ON DELETE RESTRICT,
  client_slug     TEXT NOT NULL,                     -- e.g. 'coexist'
  client_display  TEXT NOT NULL,                     -- e.g. 'Co-Exist Australia Ltd'

  -- Schedule shape.
  schedule_type   TEXT NOT NULL,                     -- 'monthly_retainer_invoice', 'monthly_licence', 'monthly_passthrough', 'monthly_combined'
  frequency       TEXT NOT NULL DEFAULT 'monthly',   -- 'monthly' | 'quarterly' | 'annual' | 'one_off'
  day_of_month    SMALLINT NOT NULL DEFAULT 7,       -- which day to fire generation (1-28 to be DST/leap-year safe)

  -- Lifecycle.
  status          TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'paused' | 'completed' | 'archived'
  starts_on       DATE NOT NULL,
  ends_on         DATE,                              -- NULL = perpetual until archived
  next_due_date   DATE NOT NULL,                     -- next generation trigger (cron reads this)
  last_generated  DATE,
  generated_count INT NOT NULL DEFAULT 0,            -- incremented per successful invoice

  -- Line items - JSON array. Schema per item:
  --   {
  --     "type": "retainer" | "licence" | "passthrough" | "consulting_hours" | "fixed",
  --     "description": "Operational retainer (May 2026, month 1 of 3 - May/Jun/Jul)",
  --     "amount_cents": 100000,                     -- integer cents AUD ex-GST
  --     "amount_source": "fixed" | "passthrough_lookup" | "hours_lookup",
  --     "schedule_window": null | {"max_count": 3, "start_date": "2026-05-01"},
  --     "passthrough_query": null | { ... bk_ledger pull spec ... }
  --   }
  -- The engine renders these into invoice rows; passthrough/hours items
  -- resolve their amount at generation time.
  line_items      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Invoice rendering metadata.
  invoice_prefix  TEXT NOT NULL DEFAULT 'INV',       -- e.g. 'INV' -> 'INV-2026-NNN'
  due_offset_days INT NOT NULL DEFAULT 7,            -- "Due: <invoice_date + this>"
  gst_applicable  BOOLEAN NOT NULL DEFAULT true,     -- 10% AU GST line auto-added
  payment_terms   TEXT NOT NULL DEFAULT 'Payment due within 7 days. Thank you for your business.',
  bill_to_block   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {entity, abn, address_lines: []}
  payment_block   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {bank, bsb, account, name, reference_template}

  -- Audit.
  notes           TEXT,
  created_by      TEXT,                              -- fork id or 'main'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cbs_client_slug         ON client_billing_schedules (client_slug);
CREATE INDEX IF NOT EXISTS idx_cbs_status_next_due     ON client_billing_schedules (status, next_due_date) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_active_due          ON client_billing_schedules (next_due_date) WHERE status = 'active' AND archived_at IS NULL;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION client_billing_schedules_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cbs_touch_updated_at ON client_billing_schedules;
CREATE TRIGGER trg_cbs_touch_updated_at
  BEFORE UPDATE ON client_billing_schedules
  FOR EACH ROW EXECUTE FUNCTION client_billing_schedules_touch_updated_at();

-- ─── Generation log (append-only audit) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_billing_generations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id         UUID NOT NULL REFERENCES client_billing_schedules(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by        TEXT,                          -- fork id, cron name, or 'main'
  invoice_number      TEXT,                          -- e.g. 'INV-2026-003'
  invoice_period      TEXT,                          -- e.g. '2026-05', 'May 2026'
  subtotal_cents      INT,
  gst_cents           INT,
  total_cents         INT,
  draft_path          TEXT,                          -- e.g. /home/tate/ecodiaos/public/invoice-coexist-2026-NNN-DRAFT.html
  storage_url         TEXT,                          -- supabase public URL
  test_email_id       TEXT,                          -- gmail message id of the test-to-Tate
  client_send_id      TEXT,                          -- gmail message id of forward to client (after Tate "send it")
  status              TEXT NOT NULL DEFAULT 'drafted', -- 'drafted'|'tate_review'|'tate_approved'|'sent_to_client'|'paid'|'rejected'
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_cbg_schedule           ON client_billing_generations (schedule_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbg_status             ON client_billing_generations (status);

-- ─── Co-Exist seed ────────────────────────────────────────────────────────────
--
-- 3-line monthly invoice: retainer (3-month window May/Jun/Jul), licence
-- (perpetual), passthrough (variable). Cron picks up on day_of_month=7.
-- next_due_date = 2026-06-07 deliberately - May was already invoiced as
-- INV-2026-003 by fork mouo5of7_d112d2 on 2026-05-07; this row catches the
-- June fire (and locks in July as the retainer's last). After July, the
-- retainer line drops itself via schedule_window.max_count=3.
--
-- Tate authorisation guardrail: cron does NOT auto-fire client send. Engine
-- drafts + emails Tate first per
-- ~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md.

INSERT INTO client_billing_schedules (
  client_slug, client_display, schedule_type, frequency, day_of_month,
  status, starts_on, ends_on, next_due_date,
  invoice_prefix, due_offset_days, gst_applicable, payment_terms,
  line_items, bill_to_block, payment_block,
  notes, created_by
) VALUES (
  'coexist',
  'Co-Exist Australia Ltd',
  'monthly_combined',
  'monthly',
  7,
  'active',
  DATE '2026-05-01',
  NULL,                                              -- perpetual; retainer line self-expires
  DATE '2026-06-07',                                 -- May already invoiced manually as INV-2026-003
  'INV',
  7,
  true,
  'Payment due within 7 days. Thank you for your business.',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'retainer',
      'description_template', 'Operational retainer ({month_year}, month {n} of 3 - May/Jun/Jul)',
      'amount_cents', 100000,
      'amount_source', 'fixed',
      'schedule_window', jsonb_build_object('max_count', 3, 'start_date', '2026-05-01'),
      'note', 'Tate verbatim 2026-04-27 SMS: "1k/month do 3 months". Already fired May (INV-2026-003), 2 of 3 remain.'
    ),
    jsonb_build_object(
      'type', 'licence',
      'description_template', 'Monthly licensing fee ({month_year})',
      'amount_cents', 20000,
      'amount_source', 'fixed',
      'schedule_window', NULL,
      'note', 'Perpetual until termination per agreement.'
    ),
    jsonb_build_object(
      'type', 'passthrough',
      'description_template', 'Managed 3rd party costs ({month_year})',
      'amount_cents', 8200,
      'amount_source', 'passthrough_lookup',
      'schedule_window', NULL,
      'passthrough_query', jsonb_build_object(
        'sources', jsonb_build_array('vercel_pro_share', 'supabase_pro_share', 'm365_share'),
        'fallback_amount_cents', 8200,
        'note', 'Engine resolves to bk_ledger May-tagged Co-Exist passthrough sum at generation. Falls back to fixed if lookup unavailable.'
      ),
      'note', 'Variable per month. May was $82 fixed.'
    )
  ),
  jsonb_build_object(
    'entity', 'Co-Exist Australia Ltd',
    'abn', '39 660 776 983',
    'address_lines', jsonb_build_array(
      'ABN: 39 660 776 983',
      'Australian Public Company',
      'QLD 4551'
    )
  ),
  jsonb_build_object(
    'bank', 'Bank Australia',
    'bsb', '313-140',
    'account', '12579148',
    'name', 'Ecodia Pty Ltd',
    'reference_template', '{invoice_number}'
  ),
  'Seeded with INV-2026-003 already manually fired by fork mouo5of7_d112d2 on 2026-05-07. June (INV-2026-004) and July (INV-2026-005) auto-draft via this schedule. After July the retainer line drops to 0; licence + passthrough continue perpetually until archived.',
  'fork_mouoh2fb_fcd4f2'
);

-- ─── status_board hook (idempotent) ──────────────────────────────────────────
--
-- Visibility row so the schedule shows in the conductor's daily orient.

INSERT INTO status_board (
  entity_type, entity_ref, name, status, next_action, next_action_by,
  next_action_due, priority, context
)
SELECT
  'infrastructure',
  'client_billing_schedules.coexist',
  'Co-Exist recurring billing schedule (active)',
  'active - month 2 of 3 retainer pending',
  'Cron recurring-billing-monthly fires 2026-06-07; engine drafts INV-2026-004, emails Tate test-send for approval before forwarding hello@coexistaus.org. No client contact without Tate ack.',
  'ecodiaos',
  DATE '2026-06-07',
  3,
  'Schedule id: see client_billing_schedules WHERE client_slug=coexist. Lines: retainer (2/3 remaining), licence (perpetual), passthrough (variable). Pattern: ~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md'
WHERE NOT EXISTS (
  SELECT 1 FROM status_board WHERE entity_ref = 'client_billing_schedules.coexist' AND archived_at IS NULL
);

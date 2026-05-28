-- 140 bookkeeping tax substrate
--
-- Adds the missing scaffolding for tax-time readiness:
--   1. Fixed assets + depreciation
--   2. Quarterly tax provision (accrued co. tax + PAYG installments)
--   3. Scheduled obligations calendar (ASIC, BAS, Wyoming SoS, personal tax, super)
--   4. FX rate table (USD/EUR/GBP -> AUD daily)
--   5. Supplier ABN cache (ATO ABN Lookup register)
--   6. Africa drawdown tracker
--   7. Extra GL accounts (1500, 1510, 2300, 2310, 6200, 7000)
--   8. staged_transactions extensions for transfer detection, refunds, FX

-- Fixed assets register. Anything capital (laptop, camera, server) goes here
-- and is depreciated rather than expensed. AU SME threshold: assets under
-- $20k can use instant asset write-off when policy in force; above $20k or
-- when policy lapses, depreciate over effective life per ATO TR 2024/4.
CREATE TABLE IF NOT EXISTS fixed_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity              TEXT NOT NULL DEFAULT 'ecodia_pty_ltd'
                        CHECK (entity IN ('ecodia_pty_ltd', 'ecodia_labs', 'dao_llc')),
    name                TEXT NOT NULL,
    asset_class         TEXT NOT NULL
                        CHECK (asset_class IN (
                            'computer_hardware', 'computer_software', 'office_furniture',
                            'office_equipment', 'motor_vehicle', 'photographic_equipment',
                            'audio_visual', 'intangible_ip', 'other')),
    purchase_date       DATE NOT NULL,
    cost_cents          INTEGER NOT NULL,
    salvage_cents       INTEGER DEFAULT 0,
    method              TEXT NOT NULL DEFAULT 'prime_cost'
                        CHECK (method IN ('prime_cost', 'diminishing_value', 'instant_writeoff')),
    effective_life_years REAL,
    purchase_tx_id      TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    source_ref          TEXT,
    notes               TEXT,
    disposed_at         DATE,
    disposal_proceeds_cents INTEGER,
    disposal_tx_id      TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_entity ON fixed_assets(entity);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_disposed ON fixed_assets(disposed_at);

-- One row per monthly depreciation run per asset. Idempotent on (asset_id, period_end).
CREATE TABLE IF NOT EXISTS depreciation_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id            UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    depreciation_cents  INTEGER NOT NULL,
    book_value_cents    INTEGER NOT NULL,
    ledger_tx_id        TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (asset_id, period_end)
);

-- Quarterly company tax provision. AU base rate entities pay 25% on taxable income.
-- We accrue every quarter so the daily digest can surface "Co. tax owed if we
-- stopped today" rather than have it bite at EOFY.
CREATE TABLE IF NOT EXISTS tax_provisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity              TEXT NOT NULL DEFAULT 'ecodia_pty_ltd',
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    taxable_income_cents INTEGER NOT NULL,
    tax_rate_pct        REAL NOT NULL DEFAULT 25.0,
    provision_cents     INTEGER NOT NULL,
    payg_installment_cents INTEGER DEFAULT 0,
    bas_lodged          BOOLEAN DEFAULT FALSE,
    bas_lodged_at       TIMESTAMPTZ,
    bas_payment_ref     TEXT,
    ledger_tx_id        TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity, period_end)
);

-- Calendar of legal/regulatory obligations. The annual-obligations cron reads
-- this, surfaces a P2 status_board row N days before each due date, and the
-- "completed_at" flip happens when we (or Tate) tick the row.
CREATE TABLE IF NOT EXISTS scheduled_obligations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity              TEXT NOT NULL
                        CHECK (entity IN ('ecodia_pty_ltd', 'ecodia_labs', 'dao_llc', 'tate_personal')),
    obligation_type     TEXT NOT NULL
                        CHECK (obligation_type IN (
                            'asic_annual_review', 'asic_company_statement',
                            'wyoming_sos_annual_report', 'wyoming_franchise_tax',
                            'bas_quarterly', 'bas_annual',
                            'company_tax_return', 'personal_tax_return',
                            'payg_installment', 'super_guarantee',
                            'fbt_return', 'taxable_payments_report',
                            'xero_subscription', 'domain_renewal',
                            'insurance_renewal', 'custom')),
    name                TEXT NOT NULL,
    due_date            DATE NOT NULL,
    surface_days_before INTEGER DEFAULT 14,
    recurrence          TEXT
                        CHECK (recurrence IN ('annual', 'quarterly', 'monthly', 'once', 'biannual')),
    cost_estimate_cents INTEGER,
    payable_to          TEXT,
    completed_at        TIMESTAMPTZ,
    completed_by        TEXT,
    completion_ref      TEXT,
    next_occurrence     DATE,
    status_board_row_id UUID,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_obligations_due ON scheduled_obligations(due_date)
    WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_obligations_entity ON scheduled_obligations(entity);

-- Daily FX rate cache, AUD as base. Source: RBA F11 or openexchangerates.
-- Used when staged_transactions.description shows USD/EUR/GBP charges so we
-- convert to AUD at the transaction date before posting.
CREATE TABLE IF NOT EXISTS fx_rates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date           DATE NOT NULL,
    base_currency       TEXT NOT NULL DEFAULT 'AUD',
    foreign_currency    TEXT NOT NULL,
    rate                NUMERIC(14, 6) NOT NULL,
    source              TEXT NOT NULL DEFAULT 'rba',
    fetched_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (rate_date, base_currency, foreign_currency)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates(foreign_currency, rate_date DESC);

-- ABN lookup cache. ATO ABN Lookup API is free but rate-limited; cache results
-- so we know which suppliers are GST-registered (only those can have GST claimed).
CREATE TABLE IF NOT EXISTS supplier_abn_cache (
    abn                 TEXT PRIMARY KEY,
    entity_name         TEXT,
    entity_type         TEXT,
    gst_registered      BOOLEAN,
    gst_registered_from DATE,
    address_state       TEXT,
    address_postcode    TEXT,
    status              TEXT,
    fetched_at          TIMESTAMPTZ DEFAULT NOW(),
    raw_response        JSONB
);

-- Africa drawdown tracker. Per options/side deed signed 2026-05 (approx),
-- drawings above $20k require EcodiaOS consent. Tate needs $20k+ for Oct-Dec
-- 2026 Africa travels. We track required revenue capture vs current trajectory.
CREATE TABLE IF NOT EXISTS drawdown_targets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    target_cents        INTEGER NOT NULL,
    target_date         DATE NOT NULL,
    purpose             TEXT NOT NULL,
    requires_ecodiaos_consent BOOLEAN DEFAULT TRUE,
    consent_granted_at  TIMESTAMPTZ,
    consent_rationale   TEXT,
    drawn_cents         INTEGER DEFAULT 0,
    drawn_at            TIMESTAMPTZ,
    drawn_tx_id         TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'tracking', 'consent_pending', 'consent_granted',
                                         'partially_drawn', 'fully_drawn', 'cancelled')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Extend staged_transactions for transfers + refunds + FX
ALTER TABLE staged_transactions
    ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS transfer_pair_id TEXT REFERENCES staged_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS refund_of_tx_id TEXT REFERENCES ledger_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fx_currency TEXT,
    ADD COLUMN IF NOT EXISTS fx_amount_cents INTEGER,
    ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(14, 6);

CREATE INDEX IF NOT EXISTS idx_staged_transfer ON staged_transactions(is_transfer) WHERE is_transfer = TRUE;

-- New GL accounts for the substrate
INSERT INTO gl_accounts (code, name, type) VALUES
    ('1500', 'Fixed Assets - At Cost', 'asset'),
    ('1510', 'Accumulated Depreciation', 'asset'),
    ('1600', 'Prepaid Expenses', 'asset'),
    ('2300', 'Company Tax Payable', 'liability'),
    ('2310', 'PAYG Installments Payable', 'liability'),
    ('2400', 'Accrued Expenses', 'liability'),
    ('4200', 'Consulting Revenue', 'income'),
    ('4300', 'Grant Income', 'income'),
    ('6200', 'Depreciation Expense', 'expense'),
    ('6300', 'Bank Fees', 'expense'),
    ('6400', 'Foreign Currency Loss', 'expense'),
    ('4400', 'Foreign Currency Gain', 'income'),
    ('7000', 'Company Tax Expense', 'expense'),
    ('7100', 'Bad Debt Written Off', 'expense')
ON CONFLICT (code) DO NOTHING;

-- Seed the obligations calendar for the next 24 months from this migration's run date.
-- Numbers are AU 2025-26 rates; the annual-obligations cron rolls these forward.
INSERT INTO scheduled_obligations (entity, obligation_type, name, due_date, surface_days_before, recurrence, cost_estimate_cents, payable_to, notes)
VALUES
    -- BAS quarterly (Ecodia Pty Ltd)
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q1 FY26 (Jul-Sep 2025)', '2025-10-28', 14, 'quarterly', NULL, 'ATO', 'Lodgement window: from 1 Oct 2025'),
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q2 FY26 (Oct-Dec 2025)', '2026-02-28', 14, 'quarterly', NULL, 'ATO', NULL),
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q3 FY26 (Jan-Mar 2026)', '2026-04-28', 14, 'quarterly', NULL, 'ATO', NULL),
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q4 FY26 (Apr-Jun 2026)', '2026-07-28', 14, 'quarterly', NULL, 'ATO', NULL),
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q1 FY27 (Jul-Sep 2026)', '2026-10-28', 14, 'quarterly', NULL, 'ATO', NULL),
    ('ecodia_pty_ltd', 'bas_quarterly', 'BAS Q2 FY27 (Oct-Dec 2026)', '2027-02-28', 14, 'quarterly', NULL, 'ATO', NULL),
    -- Company tax returns
    ('ecodia_pty_ltd', 'company_tax_return', 'Ecodia Pty Ltd FY26 tax return', '2027-02-28', 60, 'annual', NULL, 'ATO', 'Self-preparer lodgement deadline 28 Feb following EOFY for new lodgers'),
    -- ASIC
    ('ecodia_pty_ltd', 'asic_annual_review', 'Ecodia Pty Ltd ASIC annual review', '2027-04-30', 30, 'annual', 32100, 'ASIC', 'Confirm registration date triggers actual due date'),
    ('ecodia_labs', 'asic_annual_review', 'Ecodia Labs Pty Ltd ASIC annual review', '2027-04-30', 30, 'annual', 32100, 'ASIC', 'Confirm registration date'),
    -- Wyoming DAO LLC
    ('dao_llc', 'wyoming_sos_annual_report', 'DAO LLC Wyoming SoS annual report', '2027-01-31', 30, 'annual', 6000, 'Wyoming Secretary of State', 'Due on anniversary of formation'),
    -- Personal tax (Tate)
    ('tate_personal', 'personal_tax_return', 'Tate FY26 personal tax return (myTax)', '2026-10-31', 60, 'annual', NULL, 'ATO', NULL),
    ('tate_personal', 'personal_tax_return', 'Tate FY27 personal tax return (myTax)', '2027-10-31', 60, 'annual', NULL, 'ATO', NULL)
ON CONFLICT DO NOTHING;

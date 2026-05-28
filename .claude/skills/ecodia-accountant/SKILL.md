---
name: ecodia-accountant
description: EcodiaOS is the end-to-end accountant for Ecodia Pty Ltd (AU GST-registered), Ecodia Labs Pty Ltd (AU), Ecodia DAO LLC (Wyoming, IP-holding), and Tate personal. No external bookkeeper or accountant engaged - EcodiaOS owns the books, BAS, GST, tax returns, Director Loan ledger, monthly close, and EOFY for every entity. Triggers on bookkeep, bookkeeping, BAS, GST, ATO, tax return, P&L, profit and loss, balance sheet, trial balance, director loan, xero, invoice, expense, categorise, EOFY, financial year, FY24, FY25, FY26, FY27, Ecodia Pty Ltd, Ecodia Labs, Ecodia DAO, sole-director, personal income tax, retained earnings, BAS lodgement, GST registration, ABN, ACN, ASIC, Wyoming Secretary of State, RIA, IP licensing, intercompany, transfer pricing, R&D rebate, instant asset write-off, depreciation, super, PAYG, payroll tax, FBT, fringe benefits tax, finances, financial, accountant, bookkeeper, audit, ledger, journal, reconcile, reconciliation, chart of accounts, ATO online services, MyGov, payment terms, INV-2026, INV-2027.
triggers: bookkeeping, bookkeep, BAS, GST, ATO, tax-return, P&L, profit-and-loss, balance-sheet, trial-balance, director-loan, xero, invoice, expense, categorise, categorize, EOFY, financial-year, FY24, FY25, FY26, FY27, Ecodia-Pty-Ltd, Ecodia-Labs, Ecodia-DAO, sole-director, personal-income-tax, retained-earnings, BAS-lodgement, GST-registration, ABN, ACN, ASIC, Wyoming-Secretary-of-State, RIA, IP-licensing, intercompany, transfer-pricing, R&D-rebate, instant-asset-write-off, depreciation, super, PAYG, payroll-tax, FBT, fringe-benefits-tax, finances, financial, accountant, bookkeeper, audit, ledger, journal, reconcile, reconciliation, chart-of-accounts, MyGov, ledger-balance, INV-2026, INV-2027, financial-position, cash-position, cash-flow, profit, loss, owe, owed
---

# EcodiaOS as End-to-End Accountant

**Decision authority:** EcodiaOS is the accountant for every entity in scope. No external bookkeeper or accountant is engaged. Tate's verbatim instruction 2026-05-28: *"We are NOT paying consultants or professional services. You need to do everything end to end."* If a future Claude session feels the urge to suggest engaging an accountant, that's wrong - we are the accountant.

## Entities in scope

### 1. Ecodia Pty Ltd (Australia)
- **ACN:** Confirm via ASIC search before any filing
- **GST:** Registered, quarterly BAS lodgement
- **FY:** 1 July → 30 June
- **Bank accounts (Bank Australia, opened 2026):**
  - BA Ecodia Everyday: BSB 313-140 / Account 12579148 / Xero AccountID `feef3714-1d40-445f-9f65-c7c95c8786cd` / internal GL 1000 / source_account `ba_ecodia`
  - BA Ecodia Savings: Xero AccountID `0f852d85-f337-435f-bef2-109c70671449` / internal GL 1005 / source_account `ba_ecodia_savings`
- **Xero org:** Connected via Custom Connection. Tenant ID `c36da41b-4390-40e4-94a9-d4561634ca3f`. Client ID stored in `~/ecodiaos/.env` as `XERO_CLIENT_ID`, secret as `XERO_CLIENT_SECRET`. Custom Connection $10/mo paid 2026-05-28.
- **Chart of accounts in Xero:** Default Australian SME chart (200 Sales, 400 Advertising, 485 Subscriptions, 880 Drawings, 881 Funds Introduced, 960 Retained Earnings, etc). Not customised. Our internal codes 4100/5000-6150/2100 mapped at `src/services/xeroReconcileService.js::INTERNAL_TO_XERO_CODE`.
- **Director:** Tate Donohoe (sole director)
- **Director Loan account:** Internal 2100 / Xero 881 Funds Introduced (credit side, growing when Tate funds Ecodia) and 880 Drawings (debit side, when Ecodia pays Tate back). As of 2026-05-28T07:35Z: Ecodia owes Tate $23,451.88 net.

### 2. Ecodia Labs Pty Ltd (Australia)
- **Status:** Internal-only entity. Public attribution is the EcodiaAttribution UI element, never plaintext (per pattern `ecodia-labs-internal-attribution-via-element`).
- **Bookkeeping setup:** Pending. Confirm with Tate whether Ecodia Labs has separate bank accounts, GST registration, or is dormant. If dormant, no books needed beyond annual ASIC compliance.
- **Action when active:** Add a new source_account prefix (e.g. `ba_ecodia_labs`), add the bank account ID mapping, add Xero org or shared org with class tracking.

### 3. Ecodia DAO LLC (Wyoming, USA)
- **Purpose:** Holds Ecodia IP. EcodiaOS is the algorithmic manager under W.S. 17-31-104. Tate is the sole member.
- **Tax treatment:** Single-member LLC defaults to disregarded entity for US tax → flows to Tate's US tax return (he's foreign person, treaty considerations). Wyoming has no state income tax.
- **FY:** 1 January → 31 December (US default)
- **Filings:** Annual report to Wyoming Secretary of State + member's Form 1040-NR (if US-source income exists). Currently no US-source income, so likely no 1040-NR needed yet.
- **Bookkeeping:** Minimal. Track IP-licensing income from Ecodia Pty Ltd → DAO LLC (currently $0). Track Wyoming Secretary of State filing fees (we see them on Up Bank: "VISA-I3B*WY SECRETARY OF STA..." entries categorised to 6150 Government Fees).
- **Action:** Confirm if any DAO LLC bank account exists. Likely none yet - all expenses pass through Tate's personal banks and are loaned to DAO LLC.

### 4. Tate personal
- **Tax treatment:** AU resident, lodges via MyGov/ATO online services
- **Income sources:** DEWR salary (categorised as personal, DISCARDED from Ecodia books), Centrelink (DISCARDED), Director Loan repayments from Ecodia (DR 2100 / CR personal bank in Ecodia's books only)
- **Personal banks (not on Ecodia's books):**
  - Up Bank Spending: BSB 633-123 / Account 225816008 / source_account `up_personal` / internal GL 1010 (deprecating in favour of BA Personal)
  - BA Personal: Account 12566110 / source_account `ba_personal` / internal GL 1020
- **Personal bookkeeping:** Track Director Loan position only (how much Ecodia owes Tate). Personal lifestyle spend stays out of all entity books. Personal income tax return is Tate's responsibility via MyGov.

## The bookkeeping pipeline (built 2026-05-28)

```
CSV download (BA + Up Bank web)
       ↓
POST /api/bookkeeping/ingest/csv (or scripts/ingest-bank-csvs-*.js for batch)
       ↓
parseAnyBankCSV → upsertStaged (dedup by source_ref sha256 of date+amount+desc)
       ↓
status='pending' in staged_transactions
       ↓
AI categoriser (scripts/categorise-pending-*.js, direct DeepSeek API, NOT the
broken deepseekService wrapper that hangs on init)
       ↓
status='posted' / 'ignored' / 'categorized' / 'flagged'
       ↓
bookkeeperService.postStagedTransaction → ledger_transactions + ledger_lines
       ↓
xeroReconcileService.syncAllUnsynced (BankTransactions for ba_ecodia accounts)
       + syncAllPersonalUnsynced (Manual Journals for up_personal / ba_personal)
       ↓
Xero auto-matches the BA-feed statement lines for the BankTransactions
ManualJournals book the personal-bank-paid business expenses against
Funds Introduced 881
```

### Internal GL chart of accounts (Ecodia Pty Ltd)
- **1000** Business Bank Account (BA Ecodia Everyday) - asset
- **1005** Bank Australia Savings (Ecodia) - asset
- **1010** Up Bank (Personal, INFORMATIONAL ONLY - never appears on Ecodia ledger)
- **1020** Bank Australia (Personal, INFORMATIONAL ONLY)
- **1100** Accounts Receivable
- **2100** Director Loan - Tate Donohoe (liability, credit balance = company owes Tate)
- **2110** GST Paid (Input Credits) - asset
- **2120** GST Collected (Output) - liability
- **3100** Retained Earnings - equity
- **4100** Licensing & Subscription Revenue - income
- **5000-6150** various expense categories (Hosting, Domain, Marketing, AI/Dev Tools, etc)

### Posting logic that matters (bookkeeperService.postStagedTransaction)

| Scenario | Journal |
|---|---|
| Business expense paid from Ecodia bank | DR Expense / CR 1000 or 1005 |
| Business expense paid from personal bank | DR Expense / CR 2100 (Director Loan grows in Tate's favour) |
| Personal lifestyle expense from Ecodia bank (drawing) | DR 2100 / CR 1000 or 1005 |
| Business income to Ecodia bank | DR 1000 or 1005 / CR Income |
| Personal income to personal bank | Categoriser DISCARDs - never enters books |
| Tate transfers FROM personal TO Ecodia ("Director loan" reference) | DR 1000 / CR 2100 |
| Tate transfers FROM Ecodia TO personal | DR 2100 / CR 1000 |

**Personal banks (1010, 1020) NEVER appear as ledger lines on Ecodia's books.** The 2026-05-28 refactor enforces this in code. Any journal touching 1010 or 1020 is a bug.

### Xero mirror (xeroReconcileService)
- BankTransactions endpoint: for ba_ecodia / ba_ecodia_savings transactions. Xero auto-matches against live BA feed statement lines.
- ManualJournals endpoint: for personal-bank business expenses (up_personal / ba_personal). DR Expense Xero code / CR 881 Funds Introduced.
- Internal GL code → Xero code mapping at `INTERNAL_TO_XERO_CODE` in xeroReconcileService.js. Update when new categories added.
- Tax types: INPUT for GST-inclusive AU domestic expenses, OUTPUT for GST-inclusive income, EXEMPTEXPENSES / EXEMPTOUTPUT for non-GST, BASEXCLUDED for Director Loan movements.

### Recurring crons (already scheduled)
- **bookkeeping-xero-sync** every 4h: pushes any new posted staged_transactions to Xero (both BankTransactions and Manual Journals).
- **bookkeeping-daily-finance-digest** daily 09:00 AEST: writes finance snapshot to status_board, SMS alert if Director Loan moves >$2k overnight or Xero queue >50.

## Operational checklists

### Weekly (or whenever Tate uploads a CSV)
1. Run `bk_staged_counts` - verify pending == 0 (everything categorised).
2. If pending > 0: run scripts/categorise-pending-*.js via direct DeepSeek API.
3. Run `bk_director_loan_balance` - sanity check direction is `company_owes_tate` and balance is positive.
4. Spot-check the 5 most recent ledger entries for direction/amount correctness.

### Monthly close (last day of month)
1. Pull fresh CSVs for all four accounts via email-statement subscription or BA/Up CDP macro (still to build).
2. Ingest, categorise, post.
3. Trigger `bookkeeping-xero-sync` manually so Xero is current.
4. Run `bk_pnl` for the month - eyeball the income/expense buckets.
5. Verify `bk_balance_sheet` reads `balanced: true`. If false, find the broken journal (`SELECT t.id, SUM(l.debit_cents)-SUM(l.credit_cents) FROM ledger_transactions t JOIN ledger_lines l ON l.tx_id=t.id GROUP BY t.id HAVING SUM(l.debit_cents) != SUM(l.credit_cents);`).
6. Write a monthly summary into status_board.

### Quarterly BAS (Jul, Oct, Jan, Apr - lodgement due 28th of the month after each quarter ends)
1. ~7 days before due date: ensure all transactions for the quarter are ingested + categorised + posted + Xero-synced.
2. Run `bk_bas` for the quarter dates (e.g. for Q1 = 2026-07-01 to 2026-09-30).
3. Cross-check against Xero's GST Report (`/Reports/GSTReturn` if scope permits, otherwise UI).
4. Surface the BAS draft via status_board for Tate's review.
5. Once Tate confirms: log into MyGov/ATO Business Portal via CDP (logged-in session, not API key per gui-macro-uses-logged-in-session-not-generated-api-key doctrine), submit BAS.
6. Status_board row updated with lodgement confirmation.

### Annual EOFY (30 June for AU entities)
1. ~14 days before 30 Jun: chase any outstanding receivables (Co-Exist invoices, etc).
2. ~7 days before: pull final CSVs, full close.
3. After 30 Jun: run `performEOFYClose(fyEnd='YYYY-06-30')` in bookkeeperService - this zeros income/expense accounts into Retained Earnings (account 3100).
4. Lock the period via `lockPeriod(fyStart, fyEnd)` - prevents future back-dated postings.
5. Generate FY P&L + Balance Sheet via bk_pnl / bk_balance_sheet.
6. Income tax return: prepare via ATO myTax or Business Portal CDP-driven. Wages, super, PAYG settlements if any.
7. ASIC annual review fee paid (currently $321 for small proprietary - check current rate).
8. Wyoming Secretary of State annual report for DAO LLC ($60/year as of 2026, due on anniversary of formation).

### Annual personal tax (Tate, by 31 October following 30 June EOFY)
1. Tate's personal income sources: DEWR salary (PAYG already withheld), Centrelink, any sole-trader work outside Ecodia.
2. Director Loan position is NOT taxable income to Tate (it's a loan he's owed, an asset on his personal side).
3. Eligible personal deductions: home-office use, work-related super contributions.
4. Lodge via MyGov myTax. EcodiaOS drafts via CDP-driven myTax flow.

## Anomaly playbook

| Anomaly | Diagnosis | Response |
|---|---|---|
| Balance sheet `balanced: false` | Find unbalanced journal via SUM(debit) != SUM(credit) per tx | Reverse + repost the broken one. Could be pre-FY close not run - check `performEOFYClose` was done for prior years. |
| Director Loan direction wrong (showing `tate_owes_company` when Tate just funded) | postStagedTransaction journal direction bug or is_personal flag mis-set | Run `scripts/reverse-and-repost-*.js` to repair. The 2026-05-28 fix already handles the common case (business expense from personal bank routes via 2100). |
| Personal bank account appears on Ecodia's balance sheet (1010 or 1020 with non-zero balance) | Old code-path posted personal-bank lines to Ecodia ledger | Run `scripts/strip-personal-banks-from-ledger-*.js` to clean and repost via fixed logic. |
| Xero sync queue > 50 stuck pending | bookkeeping-xero-sync cron not firing, or scope/credential issue | Check `~/.pm2/dump.pm2`, check cron status via `mcp__ecodia-full__schedule_list`, manually run `node scripts/bookkeeping-xero-sync.js` from VPS. |
| Ingest creates duplicate transactions | Hash format mismatch between old and new ingest scripts | Run `scripts/dedup-staged-transactions-*.js` keyed by (source_account, occurred_at, amount_cents, normalised description). |
| GST collected/paid wildly off | Categoriser tax_type missed for some transactions | Run `mcp__ecodia-full__bk_gst_position` and `bk_bas`; rerun categoriser on the affected period; manually adjust if needed via direct UPDATE on staged_transactions.gst_amount_cents then reverse+repost. |

## Key files (paths from backend repo root)

- `src/services/bookkeeperService.js` - core posting logic, double-entry journal builder
- `src/services/xeroReconcileService.js` - Xero API push (BankTransactions + Manual Journals)
- `src/routes/bookkeeping.js` - HTTP endpoints
- `src/db/migrations/034_bookkeeping.sql` etc - schema
- `src/db/migrations/139_staged_xero_sync_columns.sql` - 2026-05-28 Xero sync tracking
- `scripts/ingest-bank-csvs-2026-05-28.js` - hardcoded format parsers (Up Bank + BA)
- `scripts/categorise-pending-2026-05-28.js` - direct-DeepSeek categoriser (bypasses broken wrapper)
- `scripts/bookkeeping-xero-sync.js` - 4h cron entrypoint
- `scripts/reverse-and-repost-2026-05-28.js` + `*stragglers-*.js` + `strip-personal-banks-from-ledger-*.js` - repair scripts (kept for future re-use)

## What to do if a Tate query lands and this skill loaded

1. Acknowledge the query in terms of which entity it concerns.
2. Run the relevant `bk_*` MCP tool or query staged_transactions/ledger_transactions directly.
3. If a change is needed: edit code → commit → ssh VPS git pull → pm2 restart ecodia-api (with `# pm2-guard-ok` token).
4. After every substantive action: update status_board row for the entity concerned (or create one).
5. Never suggest engaging an external accountant or bookkeeper. EcodiaOS owns this.

## Open follow-ups (iteration 3+)

- Quarterly BAS prep cron firing 7 days before each lodgement due date.
- BA monthly CSV automation via email-statement subscription (subscribe Tate to BA monthly PDF + CSV statement emails → gmail poller → auto-ingest).
- Ecodia Labs Pty Ltd entity status check + setup if active.
- Ecodia DAO LLC Wyoming annual report + minimal book.
- Tate personal income tax myTax CDP-driven flow at FY27 lodgement window (1 Jul - 31 Oct 2027).
- Categoriser prompt refinement: drawings from Ecodia bank (currently DISCARDed by AI) should be detected as case-b drawings (DR 2100 / CR 1000), not ignored.
- Fix the deepseekService wrapper init hang so we don't need direct-axios scripts.

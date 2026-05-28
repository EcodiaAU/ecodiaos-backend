---
name: ecodia-accountant
description: EcodiaOS is the end-to-end accountant for Ecodia Pty Ltd (AU GST-registered), Ecodia Labs Pty Ltd (AU), Ecodia DAO LLC (Wyoming, IP-holding), and Tate personal. No external bookkeeper or accountant engaged - EcodiaOS owns the books, BAS, GST, tax returns, Director Loan ledger, monthly close, and EOFY for every entity. Triggers on bookkeep, bookkeeping, BAS, GST, ATO, tax return, P&L, profit and loss, balance sheet, trial balance, director loan, xero, invoice, expense, categorise, EOFY, financial year, FY24, FY25, FY26, FY27, Ecodia Pty Ltd, Ecodia Labs, Ecodia DAO, sole-director, personal income tax, retained earnings, BAS lodgement, GST registration, ABN, ACN, ASIC, Wyoming Secretary of State, RIA, IP licensing, intercompany, transfer pricing, R&D rebate, instant asset write-off, depreciation, super, PAYG, payroll tax, FBT, fringe benefits tax, finances, financial, accountant, bookkeeper, audit, ledger, journal, reconcile, reconciliation, chart of accounts, ATO online services, MyGov, payment terms, INV-2026, INV-2027.
triggers: bookkeeping, bookkeep, BAS, GST, ATO, tax-return, P&L, profit-and-loss, balance-sheet, trial-balance, director-loan, xero, invoice, expense, categorise, categorize, EOFY, financial-year, FY24, FY25, FY26, FY27, Ecodia-Pty-Ltd, Ecodia-Labs, Ecodia-DAO, sole-director, personal-income-tax, retained-earnings, BAS-lodgement, GST-registration, ABN, ACN, ASIC, Wyoming-Secretary-of-State, RDTI, IP-licensing, intercompany, transfer-pricing, R&D-rebate, instant-asset-write-off, depreciation, super, PAYG, payroll-tax, FBT, fringe-benefits-tax, finances, financial, accountant, bookkeeper, audit, ledger, journal, reconcile, reconciliation, chart-of-accounts, MyGov, ledger-balance, INV-2026, INV-2027, financial-position, cash-position, cash-flow, profit, loss, owe, owed, fixed-assets, capital-purchase, depreciation-schedule, Division-7A, Div-7A, tax-provision, PAYG-installment, foreign-currency, FX, USD, EUR, GBP, refund, chargeback, bad-debt, prepaid-expense, intercompany-transaction, Africa-drawdown, drawdown, consent, options-deed, side-deed, cash-runway, runway, projection, RBA, rate, accounting-period, accounting-periods, scheduled-obligations, obligations-calendar, ATO-online-services, myTax, ASIC-annual-review, Wyoming-annual-report
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

### Categorisation defaults (Tate verbatim 2026-05-28)

Two interacting rules that the categoriser prompt must encode and any human-review pass must respect:

**Rule 1 - DEFAULT TO ECODIA for software/SaaS/cloud/AI/dev-tool spend on ANY account.** Tate uses his phone and laptop ~99% of the time for Ecodia work. Apple subscriptions, Google Workspace, Google Cloud, Vercel, Anthropic, OpenAI, Supabase, MacInCloud, Fly.io, GitHub, Cursor, Replicate, RunPod, Figma, Canva, GoDaddy, Hostinger, AWS, Twilio, Resend, etc are Ecodia business expenses regardless of which account paid (personal-bank versions go via Director Loan path). Only flip to DISCARD when explicitly personal (Audible, Netflix, Spotify family plan, personal iCloud storage when separable from Apple One business use).

**Rule 2 - DEFAULT TO DISCARD for ambiguous NON-software spend on personal accounts.** Conservative ATO posture - undercharging the deduction is safer than overclaiming and getting audited. Event tickets, restaurants, travel, retail purchases on personal accounts default to DISCARD unless there is an explicit business hook (vendor name matches a known client/supplier, description references a meeting/conference, recurring pattern matches a known business workflow). On the Ecodia bank account the default flips back to business unless clearly personal (drawing).

**Worked examples from the 2026-05-28 audit:**
- GMB Scraper $61/month on Up Bank → Ecodia (early Ecodia project subscription, kept business per Tate)
- "Tate Donohoe - Desks" $4.48 on Up Bank → DISCARD (autocorrect spam of personal Osko payment)
- POS TICKETS*QUEENSLAND $92.75 on BA Ecodia → Ecodia 6120 Entertainment (Queensland Environment Day, business event)
- SAFECO TIX-MEET ±$18 on Up Bank → DISCARD (event ticket, ambiguous, safer to personal)

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

## Tax-time runbook - ATO line-item mapping

When EOFY hits (1 July), `bookkeeping-tax-prep-eofy.js` fires daily through 14 July and writes a P1 status_board row with the full FY data dump (call `bk.getTaxReturnPrep('YYYY-06-30')` to regenerate any time). The dump is keyed by ATO Company Tax Return labels so it drops straight into the lodgement flow.

### Company tax return (Ecodia Pty Ltd, lodged via ATO online services or via Tax Agent Portal)

| ATO label | Our source | Notes |
|---|---|---|
| **6S** Total income | `getPnLReport.total_income_cents` | Sum of every account with `type='income'` (4100, 4200, 4300, 4400) |
| **6_breakdown** by code | `getPnLReport.income_items` | Helpful for split between trading/grant/consulting/forex |
| **6Q** Other income | 4300 + 4400 | Grant income + FX gain |
| **7T** Total expenses | `getPnLReport.total_expenses_cents` | Sum of every account with `type='expense'` |
| **7X** Depreciation expense | account 6200 sum | From `runDepreciation` monthly cron |
| **7N** Bad debts written off | account 7100 sum | Manual posting when a Stripe invoice is uncollectable |
| **7B** Foreign currency loss | account 6400 sum | When `convertFx` shows USD/EUR delta worse than book rate |
| **8** Taxable income/loss | `net_profit_cents` | After all above |
| **Tax payable at 25%** | `taxable_income * 0.25` | Base-rate entity rate while turnover < $50M |
| **Closing director loan** | `getDirectorLoanBalance` | Disclosed if movement, Div 7A test below |
| **Asset register** | `fixed_assets` | Capital allowance schedule, opening + additions + depreciation + closing |
| **GST annual** | sum of all 4 BAS quarters | Cross-check against Xero GST Return report |

### Division 7A test (NON-NEGOTIABLE every EOFY)

Division 7A taxes loans **from** the company **to** the director that are not on commercial terms. Our Director Loan account 2100 currently sits credit-balance (company owes Tate), which is the safe direction - Tate funded Ecodia, Ecodia owes him back. This is NOT Division 7A territory.

**Div 7A triggers ONLY if 2100 goes debit-balance at FY end** (Tate owes Ecodia). The signal in our snapshot: `director_loan_direction === 'tate_owes_company'`. If that ever appears at 30 June, three options:
1. **Repay** before lodgement date (typically 28 Feb following EOFY) - drains personal cash, simplest.
2. **Sign Division 7A loan agreement** - 7-year unsecured / 25-year secured maximum term, minimum benchmark interest (ATO publishes annually, ~8.27% for 2024-25), minimum annual repayment formula.
3. **Treat as deemed dividend** - taxed at Tate's marginal rate, no franking credit unless declared from franking account.

The daily digest fires SMS to Tate the moment `director_loan_direction` flips. The annual obligations cron surfaces a Div 7A test row 30 days before 30 June.

### Personal tax return (Tate, lodged via myGov myTax by 31 October)

- **Salary income** (DEWR / Centrelink): pre-filled from PAYG summary - do not enter from our books, Tate's employer/Services Australia file with ATO.
- **Interest income**: BA Personal + Up Bank interest - pre-filled from ATO data-matching.
- **Director Loan repayments received**: NOT taxable income. It's principal repayment on a debt owed to Tate, treated as return of capital. Only the interest component (if any) would be taxable.
- **Deductions**:
  - Home-office occupancy + running expenses (52c/hr fixed-rate method while Tate works from home for Ecodia).
  - Self-education (if any training claimed personally).
  - Cost of managing tax affairs (myGov subscription if paid personally - typically $0).
- **Capital gains**: none currently. If Ecodia ever pays Tate a fully-franked dividend, the franking credit becomes refundable here.

EOFY drill: I draft via `getTaxReturnPrep('YYYY-06-30')` (Ecodia side) and verbally walk Tate through his myTax screens via CDP. We do NOT pre-fill his personal return; that's the ATO's data-matching job. Our job is to make sure his employer-side numbers reconcile against any director-loan repayment cash flow.

## Edge case playbook

Every edge case has a deterministic resolution. The codebase enforces what it can; the human-review pass enforces what code can't.

### 1. Foreign-currency subscriptions (Anthropic, OpenAI, MacInCloud, AWS, etc)

Up Bank and BA show the AUD-debited amount on the statement (Up auto-converts, BA charges a Visa rate). That AUD amount IS the cost basis - we book it as the AUD amount, GST=0 (no AU GST on overseas-supplied digital services unless the supplier is GST-registered for Australia, which most US software companies aren't unless they hit the $75k AU-customer turnover threshold).

If the supplier IS GST-registered (Atlassian, Apple, Google, Microsoft, AWS, Stripe, GitHub - they typically are above the threshold for AU), then the AUD amount is GST-inclusive and we DO claim the input credit. ATO ABN lookup confirms; we cache to `supplier_abn_cache`.

`fx_rates` table holds the AUD reference rate per day per currency (sourced from RBA via `bookkeeping-fx-rates-import.js`). Used when:
- Supplier invoices us in USD and we want a book record of the USD figure separate from the AUD-debited amount (rare; only if we're claiming exchange-rate loss/gain).
- We're preparing the DAO LLC books and the source charge was in USD.

Function: `bk.convertFx(amountCents, 'USD', '2026-05-15')` returns `{base_amount_cents, rate, rate_date, source}`.

### 2. Refunds (credit of a prior expense)

A refund lands as a positive amount on the bank statement after a prior negative. The categoriser will tag it as income, which is wrong. Correct treatment: reverse-direction post against the same expense account. `bk.recordRefund(originalLedgerTxId, refundStagedId)` links them and posts CR Expense / DR Bank.

How to detect manually: positive Up Bank entry from a supplier that previously charged us. Common case: Anthropic credit reversal, Apple refund, Stripe chargeback reversal.

### 3. Inter-account transfers (BA Everyday <-> BA Savings, Up <-> BA Personal)

Two staged_transactions rows on different accounts, same date +/- 1 day, opposite-sign matching amount. The categoriser would post both as income/expense and inflate the books. `bk.detectInterAccountTransfers(periodStart, periodEnd)` scans for pairs and marks both `is_transfer=TRUE, status='ignored'`. Runs nightly inside the daily digest.

### 4. Pre-paid annual subscriptions

A 12-month Xero/Vercel/Google Workspace plan paid upfront. Strict accrual would book to 1600 Prepaid Expenses and amortise monthly. Materiality rule: if the annual prepay is under $5k, we book the whole thing to the expense account in the month paid. Above $5k, post to 1600 then schedule 12 monthly journals via cron.

### 5. Mixed-use software / device (laptop, phone, internet)

The laptop and phone are ~99% Ecodia per Tate's verbatim 2026-05-28 - book at 100%. The home internet bill (Up Bank, Aussie Broadband) is the only one where Tate's personal Netflix-streaming usage warrants apportionment - we book at 80% Ecodia (5025 Telephone & Internet 80%, drawing 20%). Adjust at EOFY if the split changes.

### 6. Capital purchases (laptop, camera, equipment >$1k)

Anything over $1k that has a useful life >1 year goes to `fixed_assets`, NOT expense. Monthly depreciation cron handles the rest. Under $20k threshold and within an active instant-asset-write-off period: book at full cost via `method='instant_writeoff'` in `fixed_assets` and post a one-shot DR 6200 / CR 1500 in the period of acquisition - the depreciation cron skips instant_writeoff method.

The categoriser is told to FLAG anything >$1000 single-line so I can review and decide capital vs revenue. Workflow: review the flagged tx, decide capital, call `bk.recordFixedAsset({...})`, the ledger reclassifies the original DR line to 1500.

### 7. Bank fees + interest

- BA monthly fee (small): account 6300 Bank Fees, GST=0 (financial supplies are input-taxed).
- Up Bank Saver interest received on personal account: not Ecodia income. DISCARDED.
- Stripe fees: separate line on payout, account 5015 Stripe Fees, GST=0 (Stripe Australia issues a tax invoice but its fees are mostly financial-supply input-taxed - check current Stripe GST treatment annually).

### 8. Stripe payouts (gross vs net)

A Stripe payout to BA Ecodia is gross-of-fees minus Stripe-fee. We post the gross to income (DR 1000 / CR 4100) and the fees as a separate line (DR 5015 / CR 1000). The categoriser sees only the net deposit, so the Stripe-reconciliation cron (TODO) pulls gross + fees from Stripe API + posts the difference as 5015. Until that cron exists: manually post the fees journal at month-end after running the Stripe Balance API.

### 9. Bad debt write-off

A Stripe invoice unpaid >120 days = write off. Post DR 7100 Bad Debt / CR 1100 Accounts Receivable. Claim the GST back via the next BAS (only if we accrual-basis BAS - confirm at the time). Test annually at 30 June.

### 10. Stripe chargebacks + disputes

Chargeback reversal lands as a negative payout. Post DR 4100 (reduce income) / CR 1000. If we win the dispute: positive reversal back. If we lose: write off the chargeback as 7100 Bad Debt.

### 11. Personal use of business asset (rare)

If Tate ever uses a business-purchased asset (laptop) for substantial personal use, the Fringe Benefits Tax rules apply IF the asset is provided to him in his capacity as a director. We currently dodge this by booking high-value items as Ecodia assets but treating personal use as de minimis (under 5%, no FBT). At EOFY we test: if personal-use ever exceeded 20% of an asset class, raise FBT calc.

### 12. Intercompany transactions (Pty Ltd <-> Labs <-> DAO LLC)

- **Ecodia Pty Ltd -> Ecodia DAO LLC**: when DAO LLC starts collecting IP-licensing income, Pty Ltd pays a periodic IP-licence fee to DAO LLC. Booked DR 5040 IP Licence Expense / CR 3000 Payable to Ecodia Labs (or new 3001 Payable to DAO LLC). Transfer-pricing arm's-length rule applies - the licence fee must be defensible as market rate. Currently $0 because DAO LLC has no income to require this routing.
- **Pty Ltd -> Ecodia Labs**: when Labs is activated as a separate trading entity, intercompany services priced at cost + 10%. Booked symmetric: Pty Ltd DR 5xxx / CR 3000; Labs DR 1100 / CR 4100. Reconciled monthly.
- **DAO LLC <-> Tate personal**: as long as DAO LLC has no separate bank account, every DAO expense Tate pays personally accrues to a Tate-DAO loan account. We track this in `dao_llc` entity rows on `fixed_assets` and a future `dao_intercompany` table.

### 13. R&D Tax Incentive (Ecodia Labs only, if activated)

Labs is the R&D vehicle by design. If Labs becomes active and incurs >$20k in eligible R&D expenditure in a year, we file a Research and Development Tax Incentive (RDTI) application with AusIndustry. Tag eligible expenses with `tags: ['r&d', 'rdti']` at posting time. The annual RDTI claim runs through Pty Ltd's tax return if Labs is consolidated, or via Labs' own return if separate.

### 14. PAYG installments (when triggered)

When Ecodia Pty Ltd's prior-year tax bill exceeds the threshold (~$1,000 income tax), the ATO auto-enrols us in quarterly PAYG installments. The installment amount appears on the BAS form. Post DR 2310 PAYG Installments Payable / CR 1000. At EOFY, the total of installments paid offsets the company tax payable. The annual-obligations cron surfaces "PAYG installment due" rows once we're enrolled.

### 15. Superannuation guarantee (if/when employees added)

Currently no employees - Tate is sole director, not an employee, no super obligation (unless he chooses to be an employee for super purposes, which is a separate election). Year an employee is added: 12% (FY26 rate) of OTE paid into the employee's chosen super fund by the quarterly due date (28th of month after each quarter). Set up a `bookkeeping-super-quarterly.js` cron at that time.

### 16. FBT (Fringe Benefits Tax) - currently zero

No employees, no fringe benefits provided. Tate is a director but receives no salary or benefits - he only takes director loan repayments (return of capital, not a benefit). If we ever provide him benefits (car, entertainment, accommodation) we'd need to lodge an FBT return by 21 May annually. Annual-obligations cron has the row stubbed for when this turns on.

## Modeling, projection, monitoring

### Cash runway (in daily digest)
`bk.getCashRunway(180)` - rolls 90-day average burn + income, projects forward. Surfaces in daily digest. Alert threshold: <3 months runway.

### Recurring revenue projection
The Stripe API + invoice schedule give us the forward 12-month MRR. Currently NOT wired. TODO: weekly cron that reads Stripe Subscriptions API, sums next 90 days of expected invoices, writes to `kv_store.bookkeeping.projected_revenue.next_90d_cents`.

### Tax accrual visibility
`tax_provisions` table + `accrueQuarterlyTax(qStart, qEnd)` keep the balance sheet honest. Without this, FY26 net profit looks like all-cash and EOFY tax hits as a $X,XXX surprise. The daily digest now shows `accrued_co_tax_at_25pct_cents` alongside `accrued_co_tax_recorded_cents` - drift >30% triggers an anomaly. Wire `accrueQuarterlyTax` into the quarterly BAS prep cron so it accrues at the same time as BAS lodgement.

### Africa drawdown tracker
`drawdown_targets` table holds Tate's planned drawdowns (Africa Oct-Dec 2026 = $20k). `bk.getDrawdownTargets()` returns each target with `cash_shortfall_cents`, `fundable_now`, `days_until_target`. Surfaces in daily digest. Anomaly fires when shortfall > 0 AND days_until_target < 90.

### Director Loan trajectory
`getDirectorLoanBalance` returns current + last 20 movements. The morning briefing cron could project the 30-day trajectory. TODO: add `getDirectorLoanProjection(days=30)`.

## Obligations calendar (seeded in scheduled_obligations)

| Entity | Obligation | Cadence | Cost | Trigger |
|---|---|---|---|---|
| Ecodia Pty Ltd | BAS lodgement | Quarterly (Oct 28, Feb 28, Apr 28, Jul 28) | $0 lodgement fee | bookkeeping-bas-prep + annual-obligations |
| Ecodia Pty Ltd | Company tax return | Annual (28 Feb following EOFY) | $0 if self-lodged | bookkeeping-tax-prep-eofy |
| Ecodia Pty Ltd | ASIC annual review | Annual (anniversary of incorporation) | ~$321 | annual-obligations |
| Ecodia Pty Ltd | Xero Custom Connection sub | Monthly | $10 | (kept current, no surface needed) |
| Ecodia Labs Pty Ltd | ASIC annual review (when active) | Annual | ~$321 | annual-obligations |
| DAO LLC | Wyoming SoS annual report | Annual (anniversary) | $60 | annual-obligations |
| Tate personal | myTax return | Annual (31 Oct) | $0 | annual-obligations |
| Tate personal | Personal super contribution (if chosen) | Annual or quarterly | up to $30k concessional cap FY26 | manual |

`bookkeeping-annual-obligations.js` reads the table daily; surfaces a P2 row N days before each due_date (per `surface_days_before`); roll-forwards the next occurrence when Tate marks one complete via `UPDATE scheduled_obligations SET completed_at = NOW(), completion_ref = 'INV-...' WHERE id = '...'`.

## Recurring crons (full inventory)

| Cron | Frequency | Entrypoint | What it does | Silent-exit window |
|---|---|---|---|---|
| bookkeeping-xero-sync | every 4h | scripts/bookkeeping-xero-sync.js | Push posted staged_transactions to Xero (BankTransactions + ManualJournals) | nothing unsynced |
| bookkeeping-daily-finance-digest | daily 09:00 AEST | scripts/bookkeeping-daily-finance-digest.js | Snapshot + anomalies + Africa drawdown + cash runway -> status_board P4/P2 + SMS | never (always writes a row) |
| bookkeeping-bas-prep | daily 09:00 AEST | scripts/bookkeeping-bas-prep.js | BAS draft into status_board when within 7d of due | outside 7d window |
| bookkeeping-tax-prep-eofy | daily | scripts/bookkeeping-tax-prep-eofy.js | FY tax-return prep dump into status_board P1 | outside 1-14 July window |
| bookkeeping-annual-obligations | daily 09:00 AEST | scripts/bookkeeping-annual-obligations.js | Surface scheduled obligations within their surface window; roll forward recurrence | no obligations in window |
| bookkeeping-depreciation-run | monthly 1st 02:00 AEST | scripts/bookkeeping-depreciation-run.js | Monthly depreciation journals for all active fixed_assets | no active assets |
| bookkeeping-fx-rates-import | daily 17:30 AEST | scripts/bookkeeping-fx-rates-import.js | Fetch RBA F11 reference rates for USD/EUR/GBP/NZD/CAD/JPY -> fx_rates table | RBA feed empty |

## Internal GL chart of accounts (complete, post-2026-05-28)

| Code | Name | Type | Notes |
|---|---|---|---|
| 1000 | BA Ecodia Everyday | asset | Operating bank |
| 1005 | BA Ecodia Savings | asset | Savings bank |
| 1010 | Up Bank (Personal) | asset | INFORMATIONAL ONLY, never on Ecodia ledger |
| 1020 | BA Personal | asset | INFORMATIONAL ONLY |
| 1100 | Accounts Receivable | asset | Open Stripe invoices |
| 1500 | Fixed Assets at Cost | asset | Capital purchases >$1k |
| 1510 | Accumulated Depreciation | asset | Contra-asset, normal credit balance |
| 1600 | Prepaid Expenses | asset | Annual subscriptions >$5k |
| 2100 | Director Loan - Tate | liability | Credit = company owes Tate |
| 2110 | GST Paid (Input Credits) | asset | Reduces by collected on BAS lodgement |
| 2120 | GST Collected | liability | Owed to ATO until BAS lodged |
| 2200 | Unearned Income | liability | Deposits taken before delivery |
| 2300 | Company Tax Payable | liability | Accrued at 25% quarterly |
| 2310 | PAYG Installments Payable | liability | When PAYG-enrolled by ATO |
| 2400 | Accrued Expenses | liability | Month-end accruals not yet invoiced |
| 3000 | Payable to Ecodia Labs (Intercompany) | liability | When Labs active |
| 3100 | Retained Earnings | equity | EOFY close target |
| 4100 | Licensing & Subscription Revenue | income | Main trading income |
| 4200 | Consulting Revenue | income | Hourly + project work |
| 4300 | Grant Income | income | Wedgetail / VFFF / RDTI |
| 4400 | Foreign Currency Gain | income | From `convertFx` deltas |
| 5005 | Advertising & Marketing | expense | Meta, LinkedIn, sponsorship |
| 5010 | Software & SaaS | expense | All cloud/AI/dev tools |
| 5015 | Stripe Fees | expense | Payment processing |
| 5020 | Contractor Services | expense | External devs/designers |
| 5025 | Legal & Compliance | expense | ASIC, IP Australia, lawyers |
| 5030 | Office Supplies | expense | Officeworks etc |
| 5035 | Motor Vehicle | expense | Fuel + Uber for business travel |
| 5040 | IP Licence Expense | expense | Pay-up to Labs / DAO LLC |
| 6120 | Entertainment | expense | Conferences, business events |
| 6150 | Government Fees | expense | Wyoming SoS, IP Australia, etc |
| 6200 | Depreciation Expense | expense | Monthly cron output |
| 6300 | Bank Fees | expense | Monthly BA fee |
| 6400 | Foreign Currency Loss | expense | From `convertFx` deltas |
| 7000 | Company Tax Expense | expense | From `accrueQuarterlyTax` |
| 7100 | Bad Debt Written Off | expense | Stripe write-offs |

## Decision matrix - Tate asks me a finance question

| Question shape | Reach for |
|---|---|
| "How much does Ecodia owe me?" | `mcp__ecodia-full__bk_director_loan_balance` |
| "Are we balanced?" | `mcp__ecodia-full__bk_balance_sheet` -> check `balanced: true` |
| "What's the cash position?" | `mcp__ecodia-full__bk_balance_sheet` -> sum 1000+1005 |
| "How long can we last?" | `bk.getCashRunway(180)` |
| "What did we make this month?" | `mcp__ecodia-full__bk_pnl` with month range |
| "BAS for this quarter?" | `mcp__ecodia-full__bk_bas` with quarter dates |
| "Tax for FY26?" | `bk.getTaxReturnPrep('2026-06-30')` |
| "Can I draw $X?" | `bk.getDrawdownTargets()` + balance sheet, route through consent path if >$20k |
| "Anything overdue?" | `SELECT * FROM scheduled_obligations WHERE completed_at IS NULL AND due_date < NOW()::date` |
| "What's GST owed right now?" | live_gst_liability_cents in the daily digest, or `bk_gst_position` |

## Drawdown consent protocol (Africa / future >$20k)

Per the options/side deed signed 2026-05, drawings above $20k require EcodiaOS consent. The protocol:

1. Tate raises a drawdown target via `INSERT INTO drawdown_targets (name, target_cents, target_date, purpose) VALUES (...)` or asks me to.
2. The daily digest surfaces shortfall + days_until_target.
3. When cash position can fund AND target_date is within 30 days, I write a P2 status_board row tagged `next_action_by='ecodiaos'` with the consent decision.
4. Consent decision factors: (a) cash position post-draw remains > 3 months runway, (b) no pending material obligations would be jeopardised, (c) the purpose aligns with company interest.
5. If approved: `UPDATE drawdown_targets SET status='consent_granted', consent_granted_at=NOW(), consent_rationale='...'`. Then Tate transfers, the bank transaction lands, the categoriser sees it as 2100 debit (Tate paying himself back).
6. If declined: write the rationale, surface alternative paths to Tate (defer, reduce, supplement with revenue).

The consent decision is documented in `consent_rationale` for auditability.

## Open follow-ups (iteration 4+)

- **Stripe payout reconciliation cron**: pulls gross + fees from Stripe Balance API, posts the fee differential to 5015.
- **Receipt OCR + auto-match**: Gmail attachments pipeline matching to staged_transactions by amount+date+supplier.
- **Recurring revenue projection cron**: weekly read Stripe Subscriptions API, write to kv_store.
- **Director Loan trajectory projection**: `getDirectorLoanProjection(days=30)`.
- **BA monthly CSV email-statement subscription**: Tate enables in BA web banking once, gmail poller auto-ingests forever.
- **Ecodia Labs entity activation flow**: when Tate flips Labs to active trading, run a setup script that adds the bank account mapping, new Xero org or class tracking, and an obligations seed.
- **DAO LLC minimal book**: when Pty Ltd starts paying DAO LLC the IP licence fee, set up the intercompany ledger.
- **myTax CDP-driven personal return**: 1 Jul - 31 Oct 2027, drive Tate's personal lodgement via CDP into ATO online services.
- **Supplier ABN auto-lookup at post time**: when posting from a new supplier, hit ATO ABN lookup, cache to `supplier_abn_cache`, set `is_gst_inclusive` based on `gst_registered`.
- **Drawings auto-detect**: categoriser should flag Ecodia-bank outflows that pay Tate's personal as case-b drawings (DR 2100 / CR 1000) not ignore them.
- **Fix deepseekService wrapper init hang**: so we can retire the direct-axios categoriser scripts.

## Anti-patterns that have bitten us (do not repeat)

- Reading `~/.pm2/dump.pm2` and blind-restarting PM2 - reloads the zombie refresh-clobber-watchdog. See `pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27`.
- Treating personal-bank business expenses as if the bank were on Ecodia's ledger. Always route via Director Loan 2100.
- Assuming the AI categoriser will catch refunds, transfers, or capital purchases. It won't reliably - the detection layers (`detectInterAccountTransfers`, `recordRefund`, `recordFixedAsset`) are the safety net.
- Treating the AUD-debited amount of a USD subscription as the "wrong" cost basis. It IS the cost basis; we book it, full stop. FX gain/loss is only relevant if we hold USD or invoice in USD.
- Booking SafeCo / event tickets / restaurants on personal accounts as Ecodia expenses. Default-DISCARD for ambiguous non-software on personal banks (per Tate verbatim 2026-05-28).
- Suggesting external accountant engagement. EcodiaOS is the accountant.

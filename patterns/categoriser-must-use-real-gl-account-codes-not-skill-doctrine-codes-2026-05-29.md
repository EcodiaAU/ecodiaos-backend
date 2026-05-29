---
triggers: bk_categorize, gl_accounts, categoriser, chart-of-accounts, 5015, 5025, 5045, 5020, phantom-code, account-code-validation, postStagedTransaction-validation, code-mapping
status: active
---

# Categoriser must use real `gl_accounts` codes, not skill-doctrine codes

`bookkeeperService.postStagedTransaction` validates `tx.category` against the live `gl_accounts` table at post time (line ~572):

```javascript
const [acctCheck] = await db`SELECT code FROM gl_accounts WHERE code = ${tx.category}`
if (!acctCheck) throw new Error(`GL account ${tx.category} does not exist. Create it first.`)
```

The `ecodia-accountant` SKILL.md references codes that DO NOT exist in the live table:
- `5015` Stripe Fees → not in `gl_accounts`
- `5025` Legal & Compliance → not in `gl_accounts`
- `5045` Bank Fees → not in `gl_accounts`

The categoriser (`scripts/categorise-pending-*.js` + `bk_categorize` MCP) takes the AI's `account_code` field and writes it verbatim to `staged_transactions.category`. If the AI follows skill doctrine, the row gets stuck with a phantom code that fails validation at post time. Silent failure: the row sits in `status='categorized'` forever, never reaches the ledger, doesn't appear in the daily digest.

## Real mapping (use these, not the skill doctrine)

Verified against `SELECT code, name FROM gl_accounts` on 2026-05-29:

| Use case | Real code | Real name |
|---|---|---|
| Stripe / payment fees | `6090` | Bank Fees (better than 6300 which is also "Bank Fees"; pick the lower-numbered for consistency) |
| ASIC, IP Australia, AU govt fees | `6150` | Government Fees & Registrations |
| Wyoming registered agent (Corporate Filings LLC) | `6140` | Registered Agent Fees |
| Business insurance (EZI BIZ COVER, QBE) | `6050` | Business Insurance |
| Visa international transaction fees | `6090` | Bank Fees |
| BA monthly account fee | `6090` | Bank Fees |
| Contractor services / Osko to humans | `5020` | Third-Party Software & APIs (existing convention, not ideal) |
| Hosting (Vercel, Fly.io) | `5000` | Hosting & Infrastructure |
| Domain registrations (GoDaddy) | `5010` | Domain Registrations |
| Cloud services (Supabase, AWS) | `6010` | Cloud Services |
| Marketing (Meta, LinkedIn) | `6020` | Marketing & Advertising |
| Design tools (Canva, Figma) | `6030` | Design Tools |
| AI/dev tools (Anthropic, OpenAI, Cursor) | `6040` | AI & Development Tools |
| Subscriptions (M365, Workspace) | `6000` | Software Subscriptions |

Special category strings (not gl_accounts codes, handled by the AI categoriser before postStagedTransaction sees them, see autoCategorise line ~508):
- `CAPITAL_CONTRIBUTION` (Tate funds Ecodia, inflow)
- `REIMBURSEMENT` (Ecodia pays Tate back, outflow)
- `DISCARD` (rejected at post time, see [[ecodia-bank-personal-defaults-to-drawing-not-discard-2026-05-29]])

For CAPITAL_CONTRIBUTION / REIMBURSEMENT bypass into a direct ledger journal, set `category='2100'` on the row before posting (the postStagedTransaction branches for ECODIA-bank income/expense with category=2100 correctly produce DR 1000/CR 2100 or DR 2100/CR 1000 by sign).

## The fix that needs to ship

1. **Update `ecodia-accountant` SKILL.md** to remove references to non-existent codes (replace 5015→6090, 5025→6090/6140/6150/6050 per supplier, 5045→6090).
2. **Add a validate-at-categorise-time step** to `scripts/categorise-pending-*.js`: after the AI returns a category, hit `gl_accounts` to confirm it exists. If not, flag the row instead of marking it categorized.
3. **Add unit/integration test** that asserts every code referenced in the categoriser prompt exists in `gl_accounts`.

## Origin

2026-05-29: 14 staged_transactions were stuck `status='categorized'` for weeks because their categoriser-assigned codes (5025/5045/CAPITAL_CONTRIBUTION/REIMBURSEMENT) failed `gl_accounts` validation at post time. They didn't appear in daily finance digests because they never reached the ledger. Surfaced when total `ba_ecodia` balance overstatement hit $513.92.

See also: [[pgbouncer-transaction-pool-requires-prepare-false-on-postgres-js-2026-05-29]], [[ecodia-bank-personal-defaults-to-drawing-not-discard-2026-05-29]], [[silent-post-failure-detector-staged-posted-with-zero-ledger-lines-2026-05-29]].

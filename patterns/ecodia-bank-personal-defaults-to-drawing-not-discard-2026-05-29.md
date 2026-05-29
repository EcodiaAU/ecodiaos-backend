---
triggers: DISCARD, drawing, drawings, is_personal, ba_ecodia, ecodia-bank-personal, categoriser-default, director-loan, 2100, Ecodia-bank-personal-spend, bk_categorize, autoCategorise
status: active
---

# Ecodia-bank personal spend defaults to **drawing**, never **DISCARD**

The AI categoriser doctrine (`ecodia-accountant` skill) says:

> Rule 2 - DEFAULT TO DISCARD for ambiguous NON-software spend on personal accounts.

This is correct for `up_personal` / `ba_personal` source accounts only. On `ba_ecodia` (the operating account), DISCARD is **wrong**:

- The debit happened on a real Ecodia bank account
- The bank balance went down by that amount in real life
- If the staged_transaction is DISCARD'd, it never enters the ledger
- Ledger 1000 stays HIGHER than the real bank balance by the discarded amount

The doctrine table in `bookkeeperService.postStagedTransaction` already handles this case correctly (line ~629):

```javascript
} else if (tx.is_personal && !isIncome) {
    // ECODIA BANK, PERSONAL-LIFESTYLE EXPENSE (DRAWING)
    // Tate using Ecodia bank for personal stuff. Reduces loan position.
    lines.push({ account_code: '2100', debit_cents: amountAbs, credit_cents: 0 })
    lines.push({ account_code: bankAccount, debit_cents: 0, credit_cents: amountAbs })
}
```

Journal: `DR 2100 / CR 1000`. Director Loan reduces (Ecodia effectively repaid Tate by paying for his personal expense). Bank goes down by the real amount. Books stay reconciled.

The bug is in the **categoriser**: it sets `category='DISCARD'` instead of `category='<valid expense code>'` + `is_personal=true`. The post-time branch never fires because the validation rejects DISCARD outright.

## The right defaults

| Source bank | Spend tagged personal | Correct action |
|---|---|---|
| `up_personal` / `ba_personal` | personal lifestyle | `DISCARD` (info-only banks, never on Ecodia ledger) |
| `up_personal` / `ba_personal` | business expense | post with category=<code>, is_personal=false → branch DRs expense, CRs Director Loan |
| `ba_ecodia` / `ba_ecodia_savings` | business expense | post with category=<code>, is_personal=false → branch DRs expense, CRs bank |
| `ba_ecodia` / `ba_ecodia_savings` | **personal lifestyle** | **post with category=<any-valid-expense-code>, is_personal=true → drawings branch fires: DR 2100 / CR 1000. The category code is unused in the journal but must pass validation.** |

For the drawings case, recommended placeholder category is `6130 Miscellaneous Expenses` (semantic-neutral and not used in the journal anyway).

## The fix that needs to ship

1. **Categoriser prompt update**: add an explicit rule "if source_account is `ba_ecodia` or `ba_ecodia_savings` AND the spend is personal, output `is_personal=true` and a valid expense code (default `6130`), NEVER `DISCARD`."
2. **bk_categorize MCP guard**: reject `category='DISCARD'` when source_account starts with `ba_ecodia`; must use is_personal=true instead.
3. **bookkeeperService validation**: add an assertion at post time that `category != 'DISCARD'` for Ecodia bank rows (the function already rejects DISCARD universally at line 569, but better error message: "Ecodia-bank-personal spend must use drawings path - set category=6130 + is_personal=true").

## Cleanup recipe for past DISCARDs on Ecodia bank

```sql
UPDATE staged_transactions
SET category = CASE
    WHEN description ILIKE '%<business-pattern>%' THEN '<business-code>'
    ELSE '6130'  -- default to misc, will be drawing
  END,
  is_personal = CASE
    WHEN description ILIKE '%<business-pattern>%' THEN false
    ELSE true
  END,
  status = 'categorized',
  reviewed_by = 'manual-discards-cleanup'
WHERE source_account IN ('ba_ecodia','ba_ecodia_savings')
  AND status = 'ignored' AND category = 'DISCARD';
```

Then `bk_post_transaction` for each. Drawings journal fires automatically.

## Origin

2026-05-29: 16 staged_transactions on `ba_ecodia` were marked `status='ignored' category='DISCARD'` (Jericho restaurant, Kings Beach Bar, AMRITYU sushi, 9× ECODIA PTY LTD POS debit-card test charges). Total -$279.97 of real bank outflows erased from the ledger. Surfaced when reconciliation against Tate's real BA balance showed $513.92 overstatement on account 1000. Reclassified per Tate's case-by-case mapping (Jericho = business meetings with Angelica → 6120 Entertainment, Kings Beach + AMRITYU → drawings, ECODIA POS → 6090 Bank Fees as Stripe test pings).

See also: [[categoriser-must-use-real-gl-account-codes-not-skill-doctrine-codes-2026-05-29]], [[pgbouncer-transaction-pool-requires-prepare-false-on-postgres-js-2026-05-29]].

---
triggers: silent-post-failure, staged-posted-zero-lines, ledger-integrity, bookkeeping-anomaly, postStagedTransaction-rollback, zombie-ledger-transactions, finance-digest-anomaly, markPosted-failure
status: active
---

# Silent post-failure detector: staged.posted with zero ledger_lines

`bookkeeperService.postStagedTransaction` can fail in three places: at the GL validation, inside `db.begin` (ledger write), or at `markPosted` (UPDATE staged). When the failure is between `db.begin` returning and `markPosted` completing (e.g. pgbouncer prepared-statement collision), one of two corrupted states results:

**A. Half-commit**: ledger header + lines committed, `markPosted` failed → `staged_transactions.ledger_tx_id` NOT set, `status='categorized'`, but a zombie `ledger_transactions` row exists with full DR+CR. On retry, the row posts AGAIN to a new ledger_tx_id, leaving the zombie behind.

**B. Mark-without-lines**: `markPosted` somehow ran first, then the wrapping `db.begin` rolled back → `staged.ledger_tx_id` set, `status='posted'`, but the pointed-at `ledger_transactions` and `ledger_lines` don't exist (orphan id). Ledger 1000 is HIGHER than `posted_sum` should suggest, because the bank-side CR line never landed.

Both forms break the invariant **`SUM(ledger_lines)` per bank account = `SUM(amount_cents)` of posted staged_transactions for that source**.

## Detection (run as part of bookkeeping-daily-finance-digest)

Add these probes to `scripts/bookkeeping-daily-finance-digest.js` and surface as anomalies:

```sql
-- Form B detector: staged.posted with no lines linked
SELECT s.id, s.description, s.amount_cents, s.source_account, s.ledger_tx_id
FROM staged_transactions s
WHERE s.status='posted' AND s.ledger_tx_id IS NOT NULL
  AND (SELECT COUNT(*) FROM ledger_lines WHERE tx_id = s.ledger_tx_id) = 0

-- Form A detector: zombie ledger_transactions with no staged link
SELECT t.id, t.description, t.source_ref, SUM(l.debit_cents - l.credit_cents) AS net_dr
FROM ledger_transactions t
JOIN ledger_lines l ON l.tx_id = t.id
WHERE t.source_system = 'csv_import'
  AND NOT EXISTS (SELECT 1 FROM staged_transactions WHERE ledger_tx_id = t.id)
GROUP BY t.id

-- Reconciliation invariant for each bank source
SELECT
  source_account,
  (SELECT SUM(amount_cents) FROM staged_transactions
   WHERE source_account=s.source_account AND status='posted') AS posted_sum,
  (SELECT SUM(l.debit_cents - l.credit_cents) FROM ledger_lines l
   JOIN staged_transactions s2 ON s2.ledger_tx_id = l.tx_id
   WHERE s2.source_account=s.source_account AND l.account_code IN
     (SELECT CASE
       WHEN s.source_account='ba_ecodia' THEN '1000'
       WHEN s.source_account='ba_ecodia_savings' THEN '1005'
     END)) AS ledger_via_staged
FROM (SELECT DISTINCT source_account FROM staged_transactions) s
WHERE source_account IN ('ba_ecodia','ba_ecodia_savings')
```

Anomaly threshold: any non-zero result on the Form A/B detectors, OR `posted_sum != ledger_via_staged` for any Ecodia bank source.

## Daily digest enhancement

Add to `bookkeeping-daily-finance-digest.js::detectAnomalies`:

```javascript
const [silentFailures] = await db`
  SELECT COUNT(*)::int AS cnt FROM staged_transactions s
  WHERE s.status='posted' AND s.ledger_tx_id IS NOT NULL
    AND (SELECT COUNT(*) FROM ledger_lines WHERE tx_id = s.ledger_tx_id) = 0
`
if (silentFailures.cnt > 0) {
  anomalies.push(`${silentFailures.cnt} staged_transactions marked 'posted' have NO ledger_lines (silent post failure). Run repair script.`)
}
```

Also add the bank-source reconciliation invariant: fail loud if the staged-vs-ledger gap exceeds $5 on any Ecodia source.

## Cleanup recipe

Both forms can be cleaned in one pass:

1. List affected staged_ids via Form B detector.
2. Identify their zombie counterparts via Form A detector (often a 1:1 relationship between the first failed attempt and the staged row).
3. Reset: `UPDATE staged_transactions SET status='categorized', ledger_tx_id=NULL WHERE id IN (...)`.
4. Delete zombies via CTE (delete lines, then header).
5. Repost each affected row via `bk_post_transaction` (single MCP call per row).
6. Verify invariant: `SUM(ledger via staged) = posted_sum` per bank source.

## Origin

2026-05-29: 11 staged_transactions on `ba_ecodia` exhibited Form B (3 from a same-day fix run, 8 from prior cron runs spanning 2026-05-28). 8 zombies (Form A) were also found and deleted. Root cause was [[pgbouncer-transaction-pool-requires-prepare-false-on-postgres-js-2026-05-29]] (fixed at commit `4f1a793c` by setting `prepare: false`). Without the matching detector, the corruption silently accumulated for over 24 hours before showing up only when a human cross-checked the digest against a real bank balance.

See also: [[pgbouncer-transaction-pool-requires-prepare-false-on-postgres-js-2026-05-29]], [[verify-deployed-state-against-narrated-state]], [[categoriser-must-use-real-gl-account-codes-not-skill-doctrine-codes-2026-05-29]].

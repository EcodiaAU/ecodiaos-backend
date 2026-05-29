---
triggers: pgbouncer, prepared-statement, supabase-pooler, postgres-js, db.begin, transaction-pool, prepare-false, supabase-connection, silent-rollback, ledger-corruption
status: active
---

# pgbouncer transaction-pool mode requires `prepare: false` on postgres.js

Supabase's pgbouncer pooler runs in **transaction-pool mode** by default. Every query in a `db.begin(...)` block may route to a different backend connection. The postgres.js driver caches **prepared statements** per connection by default, and the statement-cache key is local to the original backend.

When the second query inside `db.begin` lands on a NEW backend, postgres errors with:

```
prepared statement "abc123" does not exist
```

The whole `db.begin` transaction rolls back. But **if `markPosted` (or any post-transaction UPDATE) was already awaiting**, the rollback may not propagate cleanly. The staged row gets marked posted while the ledger rows are gone. Silent corruption.

## The fix

`d:/.code/EcodiaOS/backend/src/config/db.js`:

```javascript
const db = postgres(env.DATABASE_URL, {
  max: parseInt(env.DB_POOL_MAX || '10'),
  idle_timeout: parseInt(env.DB_IDLE_TIMEOUT || '20'),
  connect_timeout: parseInt(env.DB_CONNECT_TIMEOUT || '10'),
  max_lifetime: parseInt(env.DB_MAX_LIFETIME || '600'),
  prepare: false,      // ← non-negotiable for pgbouncer transaction-pool mode
  onnotice: () => {},
})
```

## Symptoms before fix

- Sporadic `prepared statement "xyz" does not exist` errors under any concurrency
- Some tool calls return `Error: Post failed` but a follow-up read says the row is already in the target state ("Already posted")
- Other tool calls return success but the underlying lines are missing on the next probe

## Detection query

To find silent post failures (staged.posted with zero ledger_lines):

```sql
SELECT s.id, s.description, s.amount_cents, s.ledger_tx_id
FROM staged_transactions s
WHERE s.source_account='ba_ecodia' AND s.status='posted'
  AND (SELECT COUNT(*) FROM ledger_lines WHERE tx_id = s.ledger_tx_id) = 0
```

Run as part of `bookkeeping-daily-finance-digest` to fail loud if any appear.

## Cleanup recipe after a regression

1. Detection query above → list of affected staged_transaction ids
2. `UPDATE staged_transactions SET status='categorized', ledger_tx_id=NULL WHERE id IN (...)`
3. Identify zombie ledger_transactions (header + lines committed but no staged_transactions points to them):
   ```sql
   SELECT t.id FROM ledger_transactions t
   JOIN ledger_lines l ON l.tx_id = t.id
   WHERE l.account_code = '<bank_code>'
     AND NOT EXISTS (SELECT 1 FROM staged_transactions WHERE ledger_tx_id = t.id)
   ```
4. Delete zombies via CTE (delete lines, then header), both in one statement.
5. Repost each affected staged_transaction via `bk_post_transaction`.
6. Verify `SUM(debit-credit)` on the bank account matches `SUM(amount_cents)` of all posted rows for that source.

## Origin

2026-05-28 → 2026-05-29: bookkeepingService.postStagedTransaction lost 11 `ba_ecodia` posts (total -$426.33 of bank impact) to this exact bug across the previous-day cron run + my fix-up batch. Symptoms surfaced when a finance-digest check showed BA Ecodia Everyday balance at $730.80 vs Tate's real bank at $216.88, a $513.92 overstatement. Driver fix shipped at commit `4f1a793c`.

See also: [[verify-deployed-state-against-narrated-state]] (post-status alone is not proof of journal landing) + [[silent-post-failure-detector-staged-posted-with-zero-ledger-lines-2026-05-29]] (the matching detector cron).

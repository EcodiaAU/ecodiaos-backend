#!/usr/bin/env node
/* Dedup staged_transactions that share the same (source_account,
 * occurred_at, amount_cents, normalised_description) but have different
 * source_ref values because the hash format changed between ingest
 * sessions (old format: 32-hex no prefix, new format: csv:16-hex).
 *
 * Strategy: group by content fingerprint, keep the row with the smallest
 * created_at (oldest, authoritative), delete the rest along with their
 * ledger entries.
 */
require('dotenv').config()
const db = require('../src/config/db')

;(async () => {
  console.log('START', new Date().toISOString())

  const dups = await db`
    SELECT
      source_account,
      occurred_at,
      amount_cents,
      regexp_replace(description, '\\s+', ' ', 'g') AS norm_desc,
      ARRAY_AGG(id ORDER BY created_at ASC, id ASC) AS ids,
      ARRAY_AGG(ledger_tx_id ORDER BY created_at ASC, id ASC) AS ledger_ids,
      COUNT(*) AS cnt
    FROM staged_transactions
    GROUP BY source_account, occurred_at, amount_cents, regexp_replace(description, '\\s+', ' ', 'g')
    HAVING COUNT(*) > 1
  `
  console.log(`Found ${dups.length} duplicate groups`)

  let stagedToDelete = []
  let ledgerToDelete = []

  for (const g of dups) {
    for (let i = 1; i < g.ids.length; i++) {
      stagedToDelete.push(g.ids[i])
      if (g.ledger_ids[i]) ledgerToDelete.push(g.ledger_ids[i])
    }
  }
  console.log(`Plan: delete ${stagedToDelete.length} duplicate staged_transactions and ${ledgerToDelete.length} ledger_transactions`)

  if (ledgerToDelete.length > 0) {
    await db.begin(async sql => {
      await sql`DELETE FROM ledger_lines WHERE tx_id = ANY(${ledgerToDelete})`
      await sql`DELETE FROM ledger_transactions WHERE id = ANY(${ledgerToDelete})`
    })
    console.log(`Deleted ${ledgerToDelete.length} ledger_transactions + lines`)
  }

  if (stagedToDelete.length > 0) {
    await db`DELETE FROM staged_transactions WHERE id = ANY(${stagedToDelete})`
    console.log(`Deleted ${stagedToDelete.length} staged_transactions`)
  }

  const [{ remaining_dup_groups }] = await db`
    SELECT COUNT(*)::int AS remaining_dup_groups FROM (
      SELECT 1 FROM staged_transactions
      GROUP BY source_account, occurred_at, amount_cents, regexp_replace(description, '\\s+', ' ', 'g')
      HAVING COUNT(*) > 1
    ) t
  `
  console.log(`Remaining duplicate groups: ${remaining_dup_groups}`)

  console.log('DONE', new Date().toISOString())
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })

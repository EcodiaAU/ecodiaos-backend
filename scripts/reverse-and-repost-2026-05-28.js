#!/usr/bin/env node
/* Reverse + re-post correction for the 2026-05-28 backfill.
 *
 * The original postStagedTransaction for `is_personal && !isIncome` always
 * journaled as DR 2100 / CR Bank - correct for case (b) "personal-lifestyle
 * expense paid from Ecodia bank" but WRONG for case (a) "business expense
 * paid from Tate's personal bank" which should DR Expense / CR 2100.
 *
 * Today's bulk ingest hit thousands of case (a) txs, posting all of them
 * the wrong way, which made the Director Loan balance look like Tate owes
 * Ecodia instead of the other way around.
 *
 * This script:
 *   1. Resets all staged_transactions posted today via 'csv_import' back to
 *      status='categorized' and clears ledger_tx_id (only the case-(a) ones,
 *      detectable by source_account in {up_personal, ba_personal} + is_personal=true).
 *   2. Deletes the corresponding ledger_transactions + ledger_lines rows.
 *   3. Re-posts via the fixed postStagedTransaction.
 *
 * Safe to re-run (idempotent: only touches today's csv_import entries).
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

;(async () => {
  console.log('START', new Date().toISOString())

  // Find all staged_transactions that were posted today AND match case (a)
  // (is_personal=true + source_account is personal bank + amount < 0 = expense)
  const targets = await db`
    SELECT id, ledger_tx_id, source_account, amount_cents, is_personal
    FROM staged_transactions
    WHERE status='posted'
      AND ledger_tx_id IS NOT NULL
      AND is_personal = true
      AND source_account IN ('up_personal', 'ba_personal')
      AND amount_cents < 0
      AND reviewed_at > NOW() - INTERVAL '12 hours'
  `
  console.log(`Found ${targets.length} mis-posted case-(a) transactions to repair`)

  let resetCount = 0, reposted = 0, repostFailed = 0
  const ledgerTxIdsToDelete = []

  for (const t of targets) {
    if (t.ledger_tx_id) ledgerTxIdsToDelete.push(t.ledger_tx_id)
  }

  // Delete ledger lines + headers in batches inside a transaction
  console.log(`Deleting ${ledgerTxIdsToDelete.length} ledger_transactions + their lines...`)
  await db.begin(async sql => {
    if (ledgerTxIdsToDelete.length > 0) {
      await sql`DELETE FROM ledger_lines WHERE tx_id = ANY(${ledgerTxIdsToDelete})`
      await sql`DELETE FROM ledger_transactions WHERE id = ANY(${ledgerTxIdsToDelete})`
    }
  })
  console.log('Ledger entries deleted')

  // Reset status back to categorized
  for (const t of targets) {
    await db`UPDATE staged_transactions SET status='categorized', ledger_tx_id=NULL WHERE id=${t.id}`
    resetCount++
  }
  console.log(`Reset ${resetCount} staged_transactions to 'categorized'`)

  // Re-post via the FIXED logic
  console.log('Re-posting under corrected journal logic...')
  for (const t of targets) {
    try {
      await bk.postStagedTransaction(t.id)
      reposted++
    } catch (e) {
      repostFailed++
      if (repostFailed <= 5) console.log(`  repost fail (id=${t.id}): ${e.message.slice(0, 120)}`)
    }
  }

  console.log(`DONE: reset=${resetCount} reposted=${reposted} repost_failed=${repostFailed}`)
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })

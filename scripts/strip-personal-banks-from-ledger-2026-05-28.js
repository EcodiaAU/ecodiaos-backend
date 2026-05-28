#!/usr/bin/env node
/* Strip personal bank accounts (1010 Up Bank, 1020 BA Personal) out of
 * Ecodia's general ledger entirely. These accounts shouldn't be on
 * Ecodia's books at all - they're Tate's personal accounts.
 *
 * The historical posts (pre-today + a few today that slipped past the
 * earlier repair scripts) credited/debited these personal banks as if
 * they were Ecodia assets, breaking the balance sheet and creating
 * nonsense balances like Up Bank = -$11,329.
 *
 * Strategy:
 *   1. Find every ledger_transaction with at least one line touching
 *      1010 or 1020.
 *   2. Look up the source staged_transaction.
 *   3. Reset that staged_transaction to 'categorized' status.
 *   4. Delete the old ledger_transaction + its lines.
 *   5. Re-post via the FIXED postStagedTransaction logic. For business
 *      expenses paid from personal banks that branch DR Expense / CR
 *      2100 - no personal-bank entry at all.
 *
 * Safe to re-run.
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

;(async () => {
  console.log('START', new Date().toISOString())

  // Find every ledger_transaction touching 1010 or 1020
  const targets = await db`
    SELECT DISTINCT t.id AS ledger_tx_id, t.source_ref
    FROM ledger_transactions t
    JOIN ledger_lines l ON l.tx_id = t.id
    WHERE l.account_code IN ('1010', '1020')
  `
  console.log(`Found ${targets.length} ledger_transactions touching personal banks`)

  // Match back to staged_transactions and reset
  const ledgerTxIds = []
  const stagedToRepost = []
  const stagedToIgnore = []
  let unmatched = 0

  for (const t of targets) {
    const [s] = await db`SELECT id, status, category FROM staged_transactions WHERE source_ref = ${t.source_ref}`
    if (!s) {
      unmatched++
      ledgerTxIds.push(t.ledger_tx_id)  // delete the orphan ledger entry
      continue
    }
    ledgerTxIds.push(t.ledger_tx_id)
    if (!s.category || s.category === 'DISCARD') {
      stagedToIgnore.push(s.id)
    } else {
      stagedToRepost.push(s.id)
    }
  }
  console.log(`Plan: delete ${ledgerTxIds.length} ledger_transactions, repost ${stagedToRepost.length}, mark ignored ${stagedToIgnore.length}, unmatched ${unmatched}`)

  // Delete ledger lines + headers
  if (ledgerTxIds.length > 0) {
    await db.begin(async sql => {
      await sql`DELETE FROM ledger_lines WHERE tx_id = ANY(${ledgerTxIds})`
      await sql`DELETE FROM ledger_transactions WHERE id = ANY(${ledgerTxIds})`
    })
    console.log('Deleted ledger entries')
  }

  // Reset staged statuses
  for (const id of stagedToRepost) {
    await db`UPDATE staged_transactions SET status='categorized', ledger_tx_id=NULL WHERE id=${id}`
  }
  for (const id of stagedToIgnore) {
    await db`UPDATE staged_transactions SET status='ignored', ledger_tx_id=NULL WHERE id=${id}`
  }
  console.log(`Reset ${stagedToRepost.length} to categorized, ${stagedToIgnore.length} to ignored`)

  // Re-post via fixed logic
  let reposted = 0, repostFailed = 0
  for (const id of stagedToRepost) {
    try {
      await bk.postStagedTransaction(id)
      reposted++
    } catch (e) {
      repostFailed++
      if (repostFailed <= 5) console.log(`  repost fail id=${id}: ${e.message.slice(0, 140)}`)
    }
  }
  console.log(`Reposted ${reposted}, failed ${repostFailed}`)

  // Verify no more lines touching 1010/1020
  const [{ remaining }] = await db`
    SELECT COUNT(*)::int AS remaining FROM ledger_lines WHERE account_code IN ('1010', '1020')
  `
  console.log(`Remaining personal-bank ledger lines: ${remaining}`)

  console.log('DONE', new Date().toISOString())
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })

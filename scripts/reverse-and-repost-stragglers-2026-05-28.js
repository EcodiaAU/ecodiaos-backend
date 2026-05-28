#!/usr/bin/env node
/* Repair pass #2 for the 2026-05-28 backfill.
 *
 * The AI categoriser inconsistently set is_personal=false for some business
 * expenses paid from personal accounts (Up Bank, BA Personal). Those rows
 * went through the normal "business expense" branch which does
 * DR Expense / CR Bank - posting Tate's personal bank as if it were
 * Ecodia's bank account.
 *
 * Correct treatment: any negative-amount tx posted today from a personal
 * account that isn't DISCARDed is by definition a business expense paid
 * from personal funds = Director Loan grows in Tate's favour.
 *
 * Fix: set is_personal=true on those stragglers, reverse the bad ledger
 * entries, re-post via the corrected branch.
 *
 * Safe to re-run.
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

;(async () => {
  console.log('START', new Date().toISOString())

  // Find today's posts from personal accounts with negative amount where
  // is_personal was set false (which would have routed through the wrong branch)
  const targets = await db`
    SELECT id, ledger_tx_id, source_account, amount_cents, is_personal, category
    FROM staged_transactions
    WHERE status='posted'
      AND ledger_tx_id IS NOT NULL
      AND source_account IN ('up_personal', 'ba_personal')
      AND amount_cents < 0
      AND is_personal = false
      AND reviewed_at > NOW() - INTERVAL '12 hours'
      AND category NOT IN ('DISCARD','CAPITAL_CONTRIBUTION','REIMBURSEMENT')
  `
  console.log(`Found ${targets.length} stragglers (is_personal=false in personal account)`)

  if (targets.length === 0) { console.log('Nothing to repair'); process.exit(0) }

  const ledgerTxIds = targets.map(t => t.ledger_tx_id).filter(Boolean)
  await db.begin(async sql => {
    await sql`DELETE FROM ledger_lines WHERE tx_id = ANY(${ledgerTxIds})`
    await sql`DELETE FROM ledger_transactions WHERE id = ANY(${ledgerTxIds})`
  })
  console.log(`Deleted ${ledgerTxIds.length} ledger_transactions`)

  for (const t of targets) {
    await db`UPDATE staged_transactions SET status='categorized', is_personal=true, ledger_tx_id=NULL WHERE id=${t.id}`
  }
  console.log(`Reset ${targets.length} staged_transactions (set is_personal=true, status=categorized)`)

  let reposted = 0, repostFailed = 0
  for (const t of targets) {
    try {
      await bk.postStagedTransaction(t.id)
      reposted++
    } catch (e) {
      repostFailed++
      if (repostFailed <= 5) console.log(`  fail (id=${t.id} cat=${t.category}): ${e.message.slice(0, 120)}`)
    }
  }
  console.log(`DONE reposted=${reposted} failed=${repostFailed}`)
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })

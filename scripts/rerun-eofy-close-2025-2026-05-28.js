#!/usr/bin/env node
/* One-shot: re-run FY24-25 EOFY close. Original close ran before the
 * 2026-05-28 SAFECO reversal which deleted -$3 net of pre-FY26 activity.
 * Retained Earnings is now stale by $3.00, balance sheet shows
 * net_position_cents=300 instead of 0. Delete the old close + re-run.
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

;(async () => {
  const oldClose = await db`SELECT id FROM ledger_transactions WHERE source_ref = 'eofy_close:2025-06-30'`
  if (oldClose.length) {
    await db`DELETE FROM ledger_lines WHERE tx_id = ${oldClose[0].id}`
    await db`DELETE FROM ledger_transactions WHERE id = ${oldClose[0].id}`
    console.log('Deleted old EOFY close journal:', oldClose[0].id)
  }
  const r = await bk.performEOFYClose('2025-06-30')
  console.log('NEW EOFY close:', JSON.stringify(r))
  const bs = await bk.getBalanceSheet('2026-05-28')
  console.log('Balance sheet now: balanced=' + bs.balanced + ' net_position_cents=' + bs.net_position_cents)
  process.exit(0)
})().catch(e => { console.log('FAIL:', e.message); process.exit(1) })

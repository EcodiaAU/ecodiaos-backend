#!/usr/bin/env node
/**
 * bookkeeping-xero-sync - 4-hourly recurring sync of staged_transactions
 * to Xero as BankTransactions, so Xero stays the formal books and
 * reconciliation queue stays empty without Tate touching it.
 *
 * Scope (iteration 1): ba_ecodia + ba_ecodia_savings only. Personal-bank
 * Director-Loan journals will follow as Manual Journals in iteration 2.
 *
 * Exit codes:
 *   0 = success (even if 0 new tx synced)
 *   1 = fatal error
 */
require('dotenv').config()
const xr = require('../src/services/xeroReconcileService')

;(async () => {
  const t0 = Date.now()
  const counts = await xr.syncAllUnsynced({ limit: 200, sleepMs: 1200 })
  const ms = Date.now() - t0
  console.log(JSON.stringify({ ts: new Date().toISOString(), ms, ...counts }))
  process.exit(0)
})().catch(e => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), error: e.message, stack: e.stack?.split('\n').slice(0, 3) }))
  process.exit(1)
})

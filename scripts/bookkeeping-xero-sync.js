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

// Pre-flight env guard. A placeholder/missing XERO_TENANT_ID (or client
// creds) makes every Xero POST 403 with no useful diagnostic - the failure
// that silently stalled this sync on the Mac after the 2026-06-08 host swap
// (the real values live in the VPS process env and were never mirrored into
// the Mac .env, which still carries the scaffold placeholders). Fail loudly
// here with the exact remediation instead of burning a run on doomed POSTs.
function _assertXeroEnv() {
  const PLACEHOLDERS = new Set([
    'your_xero_tenant_id', 'your_xero_client_id', 'your_xero_client_secret', '', undefined, null,
  ])
  const missing = ['XERO_TENANT_ID', 'XERO_CLIENT_ID', 'XERO_CLIENT_SECRET']
    .filter(k => PLACEHOLDERS.has(process.env[k]))
  if (missing.length) {
    throw new Error(
      `Xero env not configured (placeholder/missing): ${missing.join(', ')}. ` +
      `Populate the real values in this host's .env from the VPS process env ` +
      `(grep XERO_ ~/ecodiaos/.env on the VPS) before the sync can push. ` +
      `Custom Connection tenant id is NOT recoverable from the token (no tenant ` +
      `claim, /connections 400s for client_credentials).`
    )
  }
}

;(async () => {
  _assertXeroEnv()
  const t0 = Date.now()
  const bank = await xr.syncAllUnsynced({ limit: 200, sleepMs: 1200 })
  const mj = await xr.syncAllPersonalUnsynced({ limit: 200, sleepMs: 1200 })
  const ms = Date.now() - t0
  console.log(JSON.stringify({ ts: new Date().toISOString(), ms, bankTx: bank, manualJournal: mj }))
  process.exit(0)
})().catch(e => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), error: e.message, stack: e.stack?.split('\n').slice(0, 3) }))
  process.exit(1)
})

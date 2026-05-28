/**
 * XeroReconcileService - syncs categorised staged_transactions to Xero
 * as BankTransactions. For Ecodia bank accounts (1000, 1005) Xero will
 * auto-match the new BankTransaction against the live BA-feed statement
 * line, removing the need for Tate to manually reconcile.
 *
 * Personal-account journals (1010, 1020) are out of scope for this
 * service - those are Director Loan movements on Ecodia's internal
 * ledger and would need ManualJournal API calls (future iteration).
 */
const axios = require('axios')
const env = require('../config/env')
const db = require('../config/db')
const logger = require('../config/logger')
const xeroService = require('./xeroService')

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// Maps our source_account values to Xero's bank account UUIDs (probed earlier
// from /Accounts?where=Type=="BANK").
const XERO_BANK_ACCOUNT_IDS = {
  ba_ecodia:         'feef3714-1d40-445f-9f65-c7c95c8786cd', // Ecodia Everyday
  ba_ecodia_savings: '0f852d85-f337-435f-bef2-109c70671449', // Ecodia Savings
}

function _taxTypeFor({ isIncome, gstCents }) {
  if (gstCents > 0) return isIncome ? 'OUTPUT' : 'INPUT'
  return isIncome ? 'EXEMPTOUTPUT' : 'EXEMPTEXPENSES'
}

function _supplierNameFor(tx) {
  // Categoriser stored supplier in subcategory or categorizer_reasoning.
  // Fall back to a normalised description prefix if unset.
  if (tx.subcategory && !tx.subcategory.startsWith('supplier:')) return tx.subcategory.slice(0, 100)
  if (tx.subcategory?.startsWith('supplier:')) return tx.subcategory.replace('supplier:', '').slice(0, 100)
  const head = (tx.description || 'Unknown').split(/[-#\\\\]/)[0].trim().slice(0, 60)
  return head || 'Unknown'
}

/**
 * Build the Xero BankTransaction payload for a single staged tx.
 * Throws if the staged tx isn't syncable (missing fields, not Ecodia bank, etc).
 */
function buildPayload(tx) {
  if (!tx.category || tx.category === 'DISCARD') {
    throw new Error(`Not syncable: tx ${tx.id} has no business category (status=${tx.status}, category=${tx.category})`)
  }
  const xeroBankAcctId = XERO_BANK_ACCOUNT_IDS[tx.source_account]
  if (!xeroBankAcctId) {
    throw new Error(`source_account ${tx.source_account} is not a tracked Ecodia bank in Xero (skipping)`)
  }

  const isIncome = tx.amount_cents > 0
  const amount = (Math.abs(tx.amount_cents) / 100).toFixed(2)
  const occurredISO = tx.occurred_at instanceof Date
    ? tx.occurred_at.toISOString().slice(0, 10)
    : String(tx.occurred_at).slice(0, 10)
  const taxType = _taxTypeFor({ isIncome, gstCents: tx.gst_amount_cents || 0 })

  return {
    Type: isIncome ? 'RECEIVE' : 'SPEND',
    Contact: { Name: _supplierNameFor(tx) },
    BankAccount: { AccountID: xeroBankAcctId },
    Date: occurredISO,
    Reference: (tx.source_ref || '').slice(0, 255),
    Status: 'AUTHORISED',
    LineAmountTypes: 'Inclusive',
    LineItems: [{
      Description: (tx.description || 'Imported by EcodiaOS').slice(0, 1000),
      Quantity: '1',
      UnitAmount: amount,
      AccountCode: tx.category,
      TaxType: taxType,
    }],
  }
}

/**
 * Push a single staged_transaction to Xero. Idempotent: returns early
 * if already synced.
 */
async function pushBankTransaction(stagedId) {
  const [tx] = await db`
    SELECT id, source, source_ref, source_account, occurred_at, amount_cents,
           description, category, subcategory, is_personal, gst_amount_cents,
           status, xero_bank_transaction_id, xero_synced_at
    FROM staged_transactions WHERE id = ${stagedId}
  `
  if (!tx) throw new Error(`staged_transaction ${stagedId} not found`)
  if (tx.xero_synced_at && tx.xero_bank_transaction_id) {
    return { stagedId, status: 'already_synced', xeroId: tx.xero_bank_transaction_id }
  }

  let payload
  try {
    payload = buildPayload(tx)
  } catch (e) {
    await db`UPDATE staged_transactions SET xero_sync_error=${e.message.slice(0, 500)} WHERE id=${stagedId}`
    return { stagedId, status: 'not_syncable', reason: e.message }
  }

  const token = await xeroService.getValidAccessToken()
  let resp
  try {
    resp = await axios.post(
      `${XERO_API_BASE}/BankTransactions`,
      { BankTransactions: [payload] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'xero-tenant-id': env.XERO_TENANT_ID,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    )
  } catch (e) {
    const errMsg = (e.response?.data?.Detail || e.response?.data?.Message || e.message).slice(0, 500)
    await db`UPDATE staged_transactions SET xero_sync_error=${errMsg} WHERE id=${stagedId}`
    logger.warn('XeroReconcile: push failed', { stagedId, status: e.response?.status, errMsg })
    throw new Error(`Xero rejected: ${errMsg}`)
  }

  const created = resp.data?.BankTransactions?.[0]
  if (!created?.BankTransactionID) {
    const errMsg = 'No BankTransactionID in Xero response'
    await db`UPDATE staged_transactions SET xero_sync_error=${errMsg} WHERE id=${stagedId}`
    throw new Error(errMsg)
  }

  await db`
    UPDATE staged_transactions
    SET xero_bank_transaction_id=${created.BankTransactionID},
        xero_synced_at=NOW(),
        xero_sync_error=NULL
    WHERE id=${stagedId}
  `
  logger.info('XeroReconcile: pushed BankTransaction', { stagedId, xeroId: created.BankTransactionID })
  return { stagedId, status: 'synced', xeroId: created.BankTransactionID }
}

/**
 * Batch push all unsynced posted staged_transactions for Ecodia bank accounts.
 * Returns summary counts.
 */
async function syncAllUnsynced({ limit = 100 } = {}) {
  const candidates = await db`
    SELECT id FROM staged_transactions
    WHERE status = 'posted'
      AND source_account IN ('ba_ecodia', 'ba_ecodia_savings')
      AND xero_synced_at IS NULL
      AND category IS NOT NULL
      AND category != 'DISCARD'
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `
  const counts = { processed: 0, synced: 0, not_syncable: 0, failed: 0 }
  for (const c of candidates) {
    counts.processed++
    try {
      const r = await pushBankTransaction(c.id)
      if (r.status === 'synced') counts.synced++
      else if (r.status === 'not_syncable') counts.not_syncable++
    } catch (e) {
      counts.failed++
    }
  }
  return counts
}

module.exports = { pushBankTransaction, syncAllUnsynced, buildPayload }

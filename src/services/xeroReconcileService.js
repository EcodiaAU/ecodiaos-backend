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

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const CUSTOM_CONNECTION_SCOPE = [
  'accounting.banktransactions',
  'accounting.banktransactions.read',
  'accounting.manualjournals',
  'accounting.manualjournals.read',
  'accounting.contacts',
  'accounting.contacts.read',
  'accounting.settings.read',
].join(' ')

// In-memory cached Custom Connection access token. Tokens last 30 min;
// we refresh at 25 min to leave a safety margin.
let _cachedToken = null
let _cachedExpiry = 0

async function _getCustomConnectionToken() {
  const now = Date.now()
  if (_cachedToken && now < _cachedExpiry) return _cachedToken
  const resp = await axios.post(
    XERO_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.XERO_CLIENT_ID,
      client_secret: env.XERO_CLIENT_SECRET,
      scope: CUSTOM_CONNECTION_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  )
  _cachedToken = resp.data.access_token
  _cachedExpiry = now + Math.max(60_000, (resp.data.expires_in - 300) * 1000)
  return _cachedToken
}

// Maps our source_account values to Xero's bank account UUIDs (probed earlier
// from /Accounts?where=Type=="BANK").
const XERO_BANK_ACCOUNT_IDS = {
  ba_ecodia:         'feef3714-1d40-445f-9f65-c7c95c8786cd', // Ecodia Everyday
  ba_ecodia_savings: '0f852d85-f337-435f-bef2-109c70671449', // Ecodia Savings
}

// Maps our internal GL codes (defined in db gl_accounts) to Xero's
// default AU SME chart of accounts codes. Ecodia's Xero hasn't been
// customised by an accountant yet, so we use the standard codes. An
// accountant can later split 485 Subscriptions into finer buckets.
const INTERNAL_TO_XERO_CODE = {
  // Income
  '4100': '200', // Licensing & Subscription Revenue -> Sales
  '4000': '200', // ECO Local -> Sales
  // Direct/operating expenses
  '5000': '485', // Hosting & Infrastructure -> Subscriptions
  '5010': '485', // Domain Registrations -> Subscriptions
  '5020': '485', // Third-Party Software & APIs -> Subscriptions
  '5030': '485', // App Store Fees -> Subscriptions
  '5015': '404', // Stripe Fees -> Bank Fees
  '6000': '485', // Software Subscriptions -> Subscriptions
  '6010': '485', // Cloud Services -> Subscriptions
  '6020': '400', // Marketing & Advertising -> Advertising
  '6030': '485', // Design Tools -> Subscriptions
  '6040': '485', // AI & Development Tools -> Subscriptions
  '6050': '433', // Business Insurance -> Insurance
  '6060': '441', // Legal & Compliance -> Legal expenses
  '6070': '453', // Office Supplies & Equipment -> Office Expenses
  '6080': '449', // Motor Vehicle -> Motor Vehicle Expenses
  '6090': '404', // Bank Fees -> Bank Fees
  '6100': '477', // Wages -> Wages and Salaries
  '6110': '412', // Contractor -> Consulting & Accounting
  '6120': '420', // Meals & Entertainment -> Entertainment
  '6130': '429', // Miscellaneous -> General Expenses
  '6140': '494', // International Travel -> Travel - International
  '6150': '441', // Government Fees -> Legal expenses
  // Equity / Director Loan
  '2100': '881', // Director Loan -> Owner A Funds Introduced (positive direction)
  // Already-Xero codes pass through unchanged
}

function _xeroAccountCode(internalCode) {
  if (!internalCode) return null
  if (/^\d{3}$/.test(internalCode)) return internalCode // already a 3-digit Xero code
  const mapped = INTERNAL_TO_XERO_CODE[internalCode]
  if (mapped) return mapped
  // Unknown internal code: fall back to General Expenses to avoid hard failure
  return '429'
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

  const xeroCode = _xeroAccountCode(tx.category)
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
      AccountCode: xeroCode,
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

  const token = await _getCustomConnectionToken()
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

// Xero AU SME chart: Director Loan creditor side. When Tate pays for
// Ecodia stuff from his personal account, the loan grows in his favour -
// we credit Funds Introduced. When he draws money out of Ecodia for
// personal stuff, we debit Drawings.
const FUNDS_INTRODUCED_CODE = '881'
const DRAWINGS_CODE = '880'

/**
 * Build a Xero ManualJournal payload for a personal-bank-paid business
 * expense (or rare personal-bank business income). The journal moves
 * the expense to the right Xero account and offsets via Director Loan
 * (Funds Introduced 881 / Drawings 880).
 *
 * For SPEND (negative amount, paid from personal):
 *   DR <expense> / CR 881 (Ecodia owes Tate more for funding this)
 * For RECEIVE (positive, income landed in personal):
 *   DR 881 / CR <income> (rare; treat as Director Loan reduction)
 */
function buildManualJournalPayload(tx) {
  if (!tx.category || tx.category === 'DISCARD') {
    throw new Error(`Not syncable: tx ${tx.id} has no business category`)
  }
  const PERSONAL_BANK_SOURCES = new Set(['up_personal', 'ba_personal'])
  if (!PERSONAL_BANK_SOURCES.has(tx.source_account)) {
    throw new Error(`source_account ${tx.source_account} is not a personal bank (Manual Journal path only)`)
  }
  const isIncome = tx.amount_cents > 0
  const amount = (Math.abs(tx.amount_cents) / 100).toFixed(2)
  const occurredISO = tx.occurred_at instanceof Date
    ? tx.occurred_at.toISOString().slice(0, 10)
    : String(tx.occurred_at).slice(0, 10)
  const expenseOrIncomeCode = _xeroAccountCode(tx.category)
  const taxType = _taxTypeFor({ isIncome, gstCents: tx.gst_amount_cents || 0 })

  const journalLines = isIncome
    ? [
        // Income from personal acct: DR Director Loan / CR Income
        { LineAmount: amount, AccountCode: FUNDS_INTRODUCED_CODE, TaxType: 'BASEXCLUDED', Description: (tx.description || '').slice(0, 1000) },
        { LineAmount: `-${amount}`, AccountCode: expenseOrIncomeCode, TaxType: taxType, Description: (tx.description || '').slice(0, 1000) },
      ]
    : [
        // Expense paid from personal: DR Expense / CR Director Loan (Funds Introduced)
        { LineAmount: amount, AccountCode: expenseOrIncomeCode, TaxType: taxType, Description: (tx.description || '').slice(0, 1000) },
        { LineAmount: `-${amount}`, AccountCode: FUNDS_INTRODUCED_CODE, TaxType: 'BASEXCLUDED', Description: `Funded via ${tx.source_account}` },
      ]

  return {
    Narration: `${_supplierNameFor(tx)} - ${tx.source_account} (${occurredISO})`.slice(0, 100),
    Date: occurredISO,
    Status: 'POSTED',
    LineAmountTypes: 'Inclusive',
    JournalLines: journalLines,
  }
}

/**
 * Push a single personal-bank staged_transaction to Xero as ManualJournal.
 */
async function pushManualJournal(stagedId) {
  const [tx] = await db`
    SELECT id, source, source_ref, source_account, occurred_at, amount_cents,
           description, category, subcategory, is_personal, gst_amount_cents,
           status, xero_manual_journal_id
    FROM staged_transactions WHERE id = ${stagedId}
  `
  if (!tx) throw new Error(`staged_transaction ${stagedId} not found`)
  if (tx.xero_manual_journal_id) {
    return { stagedId, status: 'already_synced', xeroId: tx.xero_manual_journal_id }
  }

  let payload
  try { payload = buildManualJournalPayload(tx) }
  catch (e) {
    await db`UPDATE staged_transactions SET xero_sync_error=${e.message.slice(0, 500)} WHERE id=${stagedId}`
    return { stagedId, status: 'not_syncable', reason: e.message }
  }

  const token = await _getCustomConnectionToken()
  let resp
  try {
    resp = await axios.post(
      `${XERO_API_BASE}/ManualJournals`,
      { ManualJournals: [payload] },
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
    const errMsg = (e.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message
      || e.response?.data?.Detail
      || e.response?.data?.Message
      || e.message).slice(0, 500)
    await db`UPDATE staged_transactions SET xero_sync_error=${errMsg} WHERE id=${stagedId}`
    logger.warn('XeroReconcile: ManualJournal push failed', { stagedId, status: e.response?.status, errMsg })
    throw new Error(`Xero rejected MJ: ${errMsg}`)
  }

  const created = resp.data?.ManualJournals?.[0]
  if (!created?.ManualJournalID) {
    const errMsg = 'No ManualJournalID in Xero response'
    await db`UPDATE staged_transactions SET xero_sync_error=${errMsg} WHERE id=${stagedId}`
    throw new Error(errMsg)
  }

  await db`
    UPDATE staged_transactions
    SET xero_manual_journal_id=${created.ManualJournalID},
        xero_synced_at=COALESCE(xero_synced_at, NOW()),
        xero_sync_error=NULL
    WHERE id=${stagedId}
  `
  logger.info('XeroReconcile: pushed ManualJournal', { stagedId, xeroId: created.ManualJournalID })
  return { stagedId, status: 'synced', xeroId: created.ManualJournalID }
}

/**
 * Batch push all unsynced personal-bank business expenses as ManualJournals.
 */
async function syncAllPersonalUnsynced({ limit = 500, sleepMs = 1200 } = {}) {
  const candidates = await db`
    SELECT id FROM staged_transactions
    WHERE status = 'posted'
      AND source_account IN ('up_personal', 'ba_personal')
      AND xero_manual_journal_id IS NULL
      AND category IS NOT NULL
      AND category NOT IN ('DISCARD', 'CAPITAL_CONTRIBUTION', 'REIMBURSEMENT')
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `
  const counts = { processed: 0, synced: 0, not_syncable: 0, failed: 0, retried: 0 }
  for (const c of candidates) {
    counts.processed++
    try {
      const r = await pushManualJournal(c.id)
      if (r.status === 'synced') counts.synced++
      else if (r.status === 'not_syncable') counts.not_syncable++
    } catch (e) {
      if (e.message.includes('429')) {
        counts.retried++
        await new Promise(r => setTimeout(r, 60_000))
        try {
          const r2 = await pushManualJournal(c.id)
          if (r2.status === 'synced') counts.synced++
          else counts.failed++
        } catch { counts.failed++ }
      } else {
        counts.failed++
      }
    }
    if (sleepMs > 0) await new Promise(r => setTimeout(r, sleepMs))
  }
  return counts
}

/**
 * Batch push all unsynced posted staged_transactions for Ecodia bank accounts.
 * Returns summary counts.
 */
async function syncAllUnsynced({ limit = 100, sleepMs = 1100 } = {}) {
  // Xero's API rate limit is ~60 calls/minute (1/sec). sleepMs=1100 keeps
  // us comfortably under. On 429 we back off and retry once before giving up.
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
  const counts = { processed: 0, synced: 0, not_syncable: 0, failed: 0, retried: 0 }
  for (const c of candidates) {
    counts.processed++
    try {
      const r = await pushBankTransaction(c.id)
      if (r.status === 'synced') counts.synced++
      else if (r.status === 'not_syncable') counts.not_syncable++
    } catch (e) {
      // Retry once after a 60s pause on 429-style errors
      if (e.message.includes('429')) {
        counts.retried++
        await new Promise(r => setTimeout(r, 60_000))
        try {
          const r2 = await pushBankTransaction(c.id)
          if (r2.status === 'synced') counts.synced++
          else counts.failed++
        } catch { counts.failed++ }
      } else {
        counts.failed++
      }
    }
    if (sleepMs > 0) await new Promise(r => setTimeout(r, sleepMs))
  }
  return counts
}

module.exports = {
  pushBankTransaction, syncAllUnsynced, buildPayload,
  pushManualJournal, syncAllPersonalUnsynced, buildManualJournalPayload,
}

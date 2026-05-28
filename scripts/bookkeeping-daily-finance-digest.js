#!/usr/bin/env node
/* Daily 09:00 AEST finance digest. Runs deterministically (no agent loop).
 * Pulls cash position, Director Loan balance, FY P&L, anomaly checks.
 * Writes a status_board row with the snapshot. Fires SMS to Tate on
 * any anomaly thresholds crossed.
 *
 * Scheduled via mcp__ecodia-full__schedule_cron "daily 09:00 AEST"
 * (= 23:00 UTC). Idempotent within a calendar day - re-runs UPDATE the
 * same row keyed by today's date.
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')
const axios = require('axios')

const ROW_NAME_PREFIX = 'Daily Finance Digest'
const ANOMALY_THRESHOLDS = {
  director_loan_delta_cents: 200_000,        // $2,000 overnight swing
  xero_unsynced_max: 50,                     // unsynced staged_transactions queue
  ecodia_bank_min_cents: 0,                  // BA Ecodia goes negative
  flagged_review_max: 20,                    // accumulated <0.7 confidence backlog
}

function fmt(cents) {
  const dollars = (cents / 100).toFixed(2)
  return dollars.startsWith('-') ? `-$${dollars.slice(1)}` : `$${dollars}`
}

async function pullSnapshot() {
  const today = new Date().toISOString().slice(0, 10)
  const fyStart = new Date(today).getMonth() >= 6
    ? `${new Date(today).getFullYear()}-07-01`
    : `${new Date(today).getFullYear() - 1}-07-01`
  const bs = await bk.getBalanceSheet(today)
  const dl = await bk.getDirectorLoanBalance()
  const pnl = await bk.getPnLReport(fyStart, today)

  const ecodiaBank = bs.assets?.find(a => a.account_code === '1000')?.balance_cents ?? 0
  const ecodiaSavings = bs.assets?.find(a => a.account_code === '1005')?.balance_cents ?? 0

  const [unsyncedRow] = await db`
    SELECT COUNT(*)::int AS cnt FROM staged_transactions
    WHERE status='posted' AND category != 'DISCARD'
    AND ((source_account IN ('ba_ecodia','ba_ecodia_savings') AND xero_bank_transaction_id IS NULL)
      OR (source_account IN ('up_personal','ba_personal') AND xero_manual_journal_id IS NULL))
  `
  const [flaggedRow] = await db`SELECT COUNT(*)::int AS cnt FROM staged_transactions WHERE status IN ('flagged','categorized') AND confidence < 0.9`

  return {
    date: today,
    fy_start: fyStart,
    ecodia_bank_cents: ecodiaBank ?? 0,
    ecodia_savings_cents: ecodiaSavings ?? 0,
    director_loan_cents: dl?.balance_cents ?? 0,
    director_loan_direction: dl?.direction ?? 'unknown',
    fy_income_cents: pnl?.total_income_cents ?? 0,
    fy_expenses_cents: pnl?.total_expenses_cents ?? 0,
    fy_net_cents: pnl?.net_profit_cents ?? 0,
    balance_sheet_balanced: bs?.balanced ?? false,
    unsynced_xero: unsyncedRow?.cnt ?? 0,
    flagged_review: flaggedRow?.cnt ?? 0,
  }
}

async function getPriorSnapshot(today) {
  const [row] = await db`
    SELECT context FROM status_board
    WHERE name LIKE ${ROW_NAME_PREFIX + '%'}
    ORDER BY last_touched DESC LIMIT 1
  `
  if (!row) return null
  try { return typeof row.context === 'string' ? JSON.parse(row.context) : row.context }
  catch { return null }
}

function detectAnomalies(snap, prior) {
  const anomalies = []
  if (prior && Math.abs(snap.director_loan_cents - prior.director_loan_cents) >= ANOMALY_THRESHOLDS.director_loan_delta_cents) {
    const delta = snap.director_loan_cents - prior.director_loan_cents
    anomalies.push(`Director Loan moved ${fmt(delta)} since last digest (now ${fmt(snap.director_loan_cents)} ${snap.director_loan_direction})`)
  }
  if (snap.unsynced_xero > ANOMALY_THRESHOLDS.xero_unsynced_max) {
    anomalies.push(`Xero sync queue at ${snap.unsynced_xero} (threshold ${ANOMALY_THRESHOLDS.xero_unsynced_max}). Check bookkeeping-xero-sync cron.`)
  }
  if (snap.ecodia_bank_cents < ANOMALY_THRESHOLDS.ecodia_bank_min_cents) {
    anomalies.push(`BA Ecodia Everyday went NEGATIVE: ${fmt(snap.ecodia_bank_cents)}`)
  }
  if (!snap.balance_sheet_balanced) {
    anomalies.push(`Balance sheet UNBALANCED. Run scripts/strip-personal-banks-from-ledger or check for unclosed FY.`)
  }
  if (snap.flagged_review > ANOMALY_THRESHOLDS.flagged_review_max) {
    anomalies.push(`${snap.flagged_review} categorised txs awaiting review (<0.9 confidence)`)
  }
  return anomalies
}

async function fireSMS(message) {
  const bearer = process.env.ECODIA_FULL_MCP_BEARER || process.env.MCP_INTERNAL_TOKEN
  if (!bearer) {
    console.log('SMS skipped - no bearer in env')
    return
  }
  try {
    await axios.post('https://api.admin.ecodia.au/api/mcp/ecodia-full/tools/sms_tate', {
      message: `[Finance digest] ${message.slice(0, 1400)}`,
    }, { headers: { Authorization: `Bearer ${bearer}` }, timeout: 15_000 })
  } catch (e) {
    console.log(`SMS fire failed: ${e.message}`)
  }
}

async function upsertStatusBoardRow(snap, anomalies) {
  const headline = anomalies.length > 0
    ? `ANOMALIES (${anomalies.length}) | DL ${fmt(snap.director_loan_cents)} ${snap.director_loan_direction}`
    : `clean | DL ${fmt(snap.director_loan_cents)} ${snap.director_loan_direction} | Ecodia bank ${fmt(snap.ecodia_bank_cents)}`
  const name = `${ROW_NAME_PREFIX} ${snap.date}`
  const next_action = anomalies.length > 0
    ? `Anomalies surfaced: ${anomalies.join(' | ')}`
    : `FY${snap.fy_start.slice(2, 4)}->${snap.date.slice(2, 4)} net ${fmt(snap.fy_net_cents)} (income ${fmt(snap.fy_income_cents)}, expenses ${fmt(snap.fy_expenses_cents)}). Director Loan ${fmt(snap.director_loan_cents)} ${snap.director_loan_direction}. Ecodia bank ${fmt(snap.ecodia_bank_cents)} + savings ${fmt(snap.ecodia_savings_cents)}. ${snap.unsynced_xero} unsynced Xero, ${snap.flagged_review} flagged for review.`
  const priority = anomalies.length > 0 ? 2 : 4
  const next_action_by = anomalies.length > 0 ? 'ecodiaos' : 'ecodiaos'

  // Upsert by (name): if a row with the same date-name exists, UPDATE; else INSERT
  const [existing] = await db`SELECT id FROM status_board WHERE name = ${name} LIMIT 1`
  if (existing) {
    await db`
      UPDATE status_board SET status = ${headline}, next_action = ${next_action},
        next_action_by = ${next_action_by}, priority = ${priority},
        context = ${JSON.stringify(snap)}, last_touched = NOW()
      WHERE id = ${existing.id}
    `
  } else {
    await db`
      INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context, source, last_touched)
      VALUES ('infrastructure', ${name}, ${headline}, ${next_action}, ${next_action_by}, ${priority}, ${JSON.stringify(snap)}, 'bookkeeping-daily-finance-digest', NOW())
    `
  }
}

;(async () => {
  const t0 = Date.now()
  console.log('START', new Date().toISOString())
  const snap = await pullSnapshot()
  const prior = await getPriorSnapshot(snap.date)
  const anomalies = detectAnomalies(snap, prior)
  await upsertStatusBoardRow(snap, anomalies)
  if (anomalies.length > 0) {
    await fireSMS(anomalies.join('. '))
  }
  console.log('DONE', JSON.stringify({ ms: Date.now() - t0, snap, anomaly_count: anomalies.length }))
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack?.split('\n').slice(0, 5).join('\n')); process.exit(1) })

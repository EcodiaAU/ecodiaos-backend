#!/usr/bin/env node
/* Annual EOFY tax-prep cron. Fires daily but only does work in the 14-day
 * window AFTER each EOFY (1-14 July). Outside the window: silent exit.
 * Inside the window: generates the comprehensive tax-return prep dump and
 * writes a P1 status_board row with the full report attached. Tate then uses
 * the dump to ATO-online-services CDP-fill the company tax return.
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

function activeFy(today) {
  // Active = EOFY date that just passed (today is in July of the new FY)
  if (today.getUTCMonth() !== 6) return null // July is month 6 (0-indexed)
  const daysIntoJuly = today.getUTCDate()
  if (daysIntoJuly > 14) return null
  const fyEndYear = today.getUTCFullYear()
  return `${fyEndYear}-06-30`
}

function fmt(cents) {
  const d = (cents / 100).toFixed(2)
  return d.startsWith('-') ? `-$${d.slice(1)}` : `$${d}`
}

;(async () => {
  const fyEnd = activeFy(new Date())
  if (!fyEnd) {
    console.log('Outside EOFY tax-prep window (1-14 July). Silent exit.')
    process.exit(0)
  }
  console.log('Generating tax-prep dump for FY ending', fyEnd)
  const prep = await bk.getTaxReturnPrep(fyEnd)
  const labels = prep.company_tax_return_labels
  const name = `Tax return prep ${prep.fy_label}`
  const status = `Net profit ${fmt(labels['8_taxable_income_or_loss'])}, est tax ${fmt(labels['tax_payable_at_25pct'])}, ${prep.ato_warnings.length} warnings`
  const next_action = `Drive ATO online services CDP-fill. Total income (6S) ${fmt(labels['6S_total_income'])}, total expenses (7T) ${fmt(labels['7T_total_expenses'])}, depreciation (7X) ${fmt(labels['7X_depreciation_expense'])}, taxable income (8) ${fmt(labels['8_taxable_income_or_loss'])}. Annual GST collected ${fmt(prep.bas_annual_summary.total_gst_collected_cents)}, paid ${fmt(prep.bas_annual_summary.total_gst_paid_cents)}. Director Loan position ${prep.director_loan_position?.direction} ${fmt(Math.abs(prep.director_loan_position?.balance_cents || 0))}. Warnings: ${prep.ato_warnings.join(' | ') || 'none'}.`
  const [existing] = await db`SELECT id FROM status_board WHERE name = ${name} LIMIT 1`
  if (existing) {
    await db`UPDATE status_board SET status=${status}, next_action=${next_action}, priority=1, next_action_by='tate', context=${JSON.stringify(prep)}, last_touched=NOW() WHERE id=${existing.id}`
  } else {
    await db`INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context, source, last_touched) VALUES ('task', ${name}, ${status}, ${next_action}, 'tate', 1, ${JSON.stringify(prep)}, 'bookkeeping-tax-prep-eofy', NOW())`
  }
  console.log('Tax prep row upserted:', name)
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack?.split('\n').slice(0, 5).join('\n')); process.exit(1) })

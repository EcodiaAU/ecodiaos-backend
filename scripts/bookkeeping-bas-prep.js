#!/usr/bin/env node
/* Daily-fired BAS prep guard. Runs every day at 09:00 AEST but only does
 * meaningful work in the 7-day window before each quarterly BAS due date.
 * Outside the window: silent exit (per cron-deliverables-can-be-conditional
 * doctrine). Inside the window: pulls bk_bas for the quarter, writes a
 * status_board P2 row with the draft for Tate review + lodgement.
 *
 * AU small-business BAS due dates:
 *   Q1 (Jul-Sep): 28 Oct  -> fire 21-27 Oct
 *   Q2 (Oct-Dec): 28 Feb  -> fire 21-27 Feb
 *   Q3 (Jan-Mar): 28 Apr  -> fire 21-27 Apr
 *   Q4 (Apr-Jun): 28 Jul  -> fire 21-27 Jul
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

const BAS_QUARTERS = [
  { q: 'Q1', startMonth: 7,  startDay: 1,  endMonth: 9,  endDay: 30, dueMonth: 10, dueDay: 28 },
  { q: 'Q2', startMonth: 10, startDay: 1,  endMonth: 12, endDay: 31, dueMonth: 2,  dueDay: 28 },
  { q: 'Q3', startMonth: 1,  startDay: 1,  endMonth: 3,  endDay: 31, dueMonth: 4,  dueDay: 28 },
  { q: 'Q4', startMonth: 4,  startDay: 1,  endMonth: 6,  endDay: 30, dueMonth: 7,  dueDay: 28 },
]

function fmt(cents) {
  const d = (cents / 100).toFixed(2)
  return d.startsWith('-') ? `-$${d.slice(1)}` : `$${d}`
}

function dueDateFor(year, q) {
  // Q2 due date wraps into next calendar year
  const dueYear = q.q === 'Q2' ? year + 1 : year
  return new Date(Date.UTC(dueYear, q.dueMonth - 1, q.dueDay))
}

function findActiveBAS(today) {
  // For each calendar year covering today and last year, check each quarter
  const years = [today.getUTCFullYear() - 1, today.getUTCFullYear()]
  for (const year of years) {
    for (const q of BAS_QUARTERS) {
      const due = dueDateFor(year, q)
      const daysUntil = Math.floor((due - today) / (1000 * 60 * 60 * 24))
      if (daysUntil <= 7 && daysUntil >= -1) {
        const startDate = new Date(Date.UTC(year, q.startMonth - 1, q.startDay))
        const endDate = new Date(Date.UTC(q.q === 'Q2' ? year : year, q.endMonth - 1, q.endDay))
        return {
          quarter: q.q,
          period_start: startDate.toISOString().slice(0, 10),
          period_end: endDate.toISOString().slice(0, 10),
          due_date: due.toISOString().slice(0, 10),
          days_until_due: daysUntil,
        }
      }
    }
  }
  return null
}

async function upsertBASRow(bas, period) {
  const name = `BAS draft ${period.quarter} ${period.period_start.slice(0, 4)}`
  const headline = `BAS ${period.quarter} due ${period.due_date} (${period.days_until_due}d): net payable ${fmt(bas.net_payable_cents || 0)}`
  const next_action = `BAS draft for ${period.period_start} -> ${period.period_end}. GST collected ${fmt(bas.gst_collected_cents || 0)}, GST paid ${fmt(bas.gst_paid_cents || 0)}, net ${fmt(bas.net_payable_cents || 0)}. PAYG withheld ${fmt(bas.payg_withheld_cents || 0)} (likely 0 - no employees). Total sales ${fmt(bas.total_sales_cents || 0)}, total purchases ${fmt(bas.total_purchases_cents || 0)}. Lodgement portal: https://bp.business.gov.au or via Xero (Reports -> GST). Tate to confirm + lodge before ${period.due_date}.`
  const [existing] = await db`SELECT id FROM status_board WHERE name = ${name} LIMIT 1`
  if (existing) {
    await db`UPDATE status_board SET status=${headline}, next_action=${next_action}, priority=2, next_action_by='tate', context=${JSON.stringify({ bas, period })}, last_touched=NOW() WHERE id=${existing.id}`
  } else {
    await db`INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context, source, last_touched) VALUES ('task', ${name}, ${headline}, ${next_action}, 'tate', 2, ${JSON.stringify({ bas, period })}, 'bookkeeping-bas-prep', NOW())`
  }
  return name
}

;(async () => {
  const today = new Date()
  const period = findActiveBAS(today)
  if (!period) {
    console.log('No active BAS window today (' + today.toISOString().slice(0, 10) + '). Silent exit.')
    process.exit(0)
  }
  console.log('Active BAS window:', JSON.stringify(period))
  const bas = await bk.getBASReport(period.period_start, period.period_end)
  const rowName = await upsertBASRow(bas, period)
  console.log('BAS row upserted:', rowName)
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack?.split('\n').slice(0, 5).join('\n')); process.exit(1) })

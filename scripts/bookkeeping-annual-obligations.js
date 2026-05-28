#!/usr/bin/env node
/* Daily obligations watcher. Reads scheduled_obligations, surfaces any row
 * whose due_date is within surface_days_before window AND not yet completed.
 * Each surfaced obligation becomes (or refreshes) a status_board P2 row.
 * When the cron sees a recurring obligation completed, it rolls forward the
 * next_occurrence for the next cycle.
 */
require('dotenv').config()
const db = require('../src/config/db')

function fmt(cents) {
  const d = (cents / 100).toFixed(2)
  return d.startsWith('-') ? `-$${d.slice(1)}` : `$${d}`
}

function nextOccurrenceFor(due, recurrence) {
  const d = new Date(due)
  if (recurrence === 'annual') d.setUTCFullYear(d.getUTCFullYear() + 1)
  else if (recurrence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3)
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (recurrence === 'biannual') d.setUTCMonth(d.getUTCMonth() + 6)
  else return null
  return d.toISOString().slice(0, 10)
}

;(async () => {
  const today = new Date().toISOString().slice(0, 10)
  const due = await db`
    SELECT id, entity, obligation_type, name, due_date, surface_days_before, recurrence, cost_estimate_cents, payable_to, notes
    FROM scheduled_obligations
    WHERE completed_at IS NULL
      AND due_date >= ${today}::date - INTERVAL '7 days'
      AND due_date <= ${today}::date + (surface_days_before || ' days')::INTERVAL
    ORDER BY due_date`
  console.log('Active obligations in surface window:', due.length)
  for (const o of due) {
    const daysUntil = Math.floor((new Date(o.due_date) - new Date(today)) / (1000 * 60 * 60 * 24))
    const name = `${o.entity.replace(/_/g, ' ')}: ${o.name}`
    const headline = `${o.due_date} (${daysUntil}d) - ${o.payable_to || 'self'}${o.cost_estimate_cents ? ' ' + fmt(o.cost_estimate_cents) : ''}`
    const priority = daysUntil < 7 ? 1 : 2
    const next_action = `${o.notes || 'Lodge / pay / file via the appropriate channel.'} Mark completed via UPDATE scheduled_obligations SET completed_at = NOW(), completion_ref = '...' WHERE id = '${o.id}'.`
    const [existing] = await db`SELECT id FROM status_board WHERE name = ${name} LIMIT 1`
    if (existing) {
      await db`UPDATE status_board SET status=${headline}, next_action=${next_action}, priority=${priority}, next_action_by='tate', last_touched=NOW() WHERE id=${existing.id}`
      await db`UPDATE scheduled_obligations SET status_board_row_id=${existing.id} WHERE id=${o.id}`
    } else {
      const [row] = await db`INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, source, last_touched) VALUES ('task', ${name}, ${headline}, ${next_action}, 'tate', ${priority}, 'bookkeeping-annual-obligations', NOW()) RETURNING id`
      await db`UPDATE scheduled_obligations SET status_board_row_id=${row.id} WHERE id=${o.id}`
    }
  }
  // Roll-forward: anything completed in the last 24h with recurrence -> seed next occurrence
  const completed = await db`
    SELECT id, entity, obligation_type, name, due_date, surface_days_before, recurrence, cost_estimate_cents, payable_to, notes, next_occurrence
    FROM scheduled_obligations
    WHERE completed_at IS NOT NULL AND completed_at > NOW() - INTERVAL '24 hours'
      AND recurrence IS NOT NULL AND recurrence != 'once'
      AND next_occurrence IS NULL`
  for (const c of completed) {
    const next = nextOccurrenceFor(c.due_date, c.recurrence)
    if (!next) continue
    await db`UPDATE scheduled_obligations SET next_occurrence = ${next} WHERE id = ${c.id}`
    await db`
      INSERT INTO scheduled_obligations (entity, obligation_type, name, due_date, surface_days_before, recurrence, cost_estimate_cents, payable_to, notes)
      VALUES (${c.entity}, ${c.obligation_type}, ${c.name.replace(/FY\d{2}/, fy => `FY${parseInt(fy.slice(2)) + 1}`)}, ${next}, ${c.surface_days_before}, ${c.recurrence}, ${c.cost_estimate_cents}, ${c.payable_to}, ${c.notes})`
    console.log('Rolled forward', c.name, '->', next)
  }
  console.log('DONE')
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack?.split('\n').slice(0, 5).join('\n')); process.exit(1) })

#!/usr/bin/env node
/* Monthly depreciation cron. Runs on the 1st of each month at 02:00 AEST.
 * Computes depreciation for all active fixed_assets and journals into
 * DR 6200 Depreciation Expense / CR 1510 Accumulated Depreciation.
 * Idempotent on (asset_id, period_end). Silent exit if no assets registered
 * (per cron-deliverables-can-be-conditional doctrine).
 */
require('dotenv').config()
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

function priorMonthRange(today) {
  const d = new Date(today)
  d.setUTCDate(0) // last day of previous month
  const periodEnd = d.toISOString().slice(0, 10)
  d.setUTCDate(1)
  const periodStart = d.toISOString().slice(0, 10)
  return { periodStart, periodEnd }
}

;(async () => {
  const [{ cnt }] = await db`SELECT COUNT(*)::int AS cnt FROM fixed_assets WHERE disposed_at IS NULL`
  if (cnt === 0) {
    console.log('No active fixed assets. Silent exit.')
    process.exit(0)
  }
  const { periodStart, periodEnd } = priorMonthRange(new Date())
  console.log('Running depreciation for', periodStart, '->', periodEnd, 'across', cnt, 'assets')
  const r = await bk.runDepreciation(periodStart, periodEnd)
  console.log('DEPRECIATION RUN:', JSON.stringify(r, null, 2))
  if (r.assets_depreciated > 0) {
    const totalCents = r.lines.reduce((s, l) => s + l.depreciation_cents, 0)
    const name = `Depreciation run ${periodEnd}`
    const status = `Depreciated ${r.assets_depreciated} assets, total $${(totalCents / 100).toFixed(2)}`
    const next_action = `Auto-posted DR 6200 / CR 1510 for each asset. Verify via mcp__ecodia-full__bk_balance_sheet that 1510 grew by $${(totalCents / 100).toFixed(2)}.`
    const [existing] = await db`SELECT id FROM status_board WHERE name = ${name} LIMIT 1`
    if (!existing) {
      await db`INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, source, last_touched) VALUES ('infrastructure', ${name}, ${status}, ${next_action}, 'ecodiaos', 4, 'bookkeeping-depreciation-run', NOW())`
    }
  }
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message); process.exit(1) })

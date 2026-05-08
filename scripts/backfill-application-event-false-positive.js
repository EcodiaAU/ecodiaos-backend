#!/usr/bin/env node
/**
 * Backfill application_event.was_false_positive over historical rows.
 *
 * Reads existing application_event rows in the last 30 days, runs the
 * classifyApplicationEventFalsePositive() classifier against each row's
 * `reason` text, UPDATEs was_false_positive in a single transaction.
 *
 * Conservative: only sets TRUE on explicit FP signal. NULL preserved when
 * no signal. Existing TRUE rows untouched (idempotent).
 *
 * Usage:
 *   node scripts/backfill-application-event-false-positive.js [--days=30] [--dry-run]
 *
 * Origin: fork_mowv43mg_2a9414 (Phase C tag-feedback Gap 2, 8 May 2026).
 */

'use strict'

const { Client } = require('pg')
const path = require('path')

// Reuse the live classifier so backfill semantics match write-time semantics.
const {
  classifyApplicationEventFalsePositive,
} = require('../src/services/telemetry/dispatchEventConsumer')

function parseArgs() {
  const argv = process.argv.slice(2)
  const args = { days: 30, dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true
    else if (a.startsWith('--days=')) args.days = parseInt(a.split('=')[1], 10) || 30
  }
  return args
}

async function main() {
  const { days, dryRun } = parseArgs()
  const env = require('../src/config/env')
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()

  try {
    const sel = await client.query(
      `SELECT id, reason, applied, was_false_positive
       FROM application_event
       WHERE ts > NOW() - ($1 || ' days')::interval
         AND was_false_positive IS NOT TRUE`,
      [String(days)],
    )

    let scanned = 0
    let toSetTrue = 0
    const updates = []
    for (const row of sel.rows) {
      scanned += 1
      const fp = classifyApplicationEventFalsePositive({
        reason: row.reason,
        applied: row.applied,
      })
      if (fp === true) {
        toSetTrue += 1
        updates.push(row.id)
      }
    }

    console.log(`[backfill] scanned ${scanned} rows over last ${days} days`)
    console.log(`[backfill] classifier flagged ${toSetTrue} as was_false_positive=true`)

    if (dryRun) {
      console.log('[backfill] --dry-run - no UPDATEs applied')
      return { scanned, toSetTrue, updated: 0 }
    }

    if (updates.length === 0) {
      console.log('[backfill] no rows to update')
      return { scanned, toSetTrue, updated: 0 }
    }

    await client.query('BEGIN')
    let updated = 0
    try {
      // Single UPDATE with ANY array - faster than N round-trips.
      const r = await client.query(
        `UPDATE application_event SET was_false_positive = true
         WHERE id = ANY($1::uuid[])`,
        [updates],
      )
      updated = r.rowCount
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }

    console.log(`[backfill] UPDATE complete: ${updated} rows set was_false_positive=true`)
    return { scanned, toSetTrue, updated }
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main()
    .then(r => {
      console.log('[backfill] done:', JSON.stringify(r))
      process.exit(0)
    })
    .catch(err => {
      console.error('[backfill] fatal:', err)
      process.exit(1)
    })
}

module.exports = { main }

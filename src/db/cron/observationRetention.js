/**
 * observationRetention.js
 *
 * Daily purge of observation tables. Invoked by schedulerPollerService as a
 * DIRECT_EXEC cron (no fork, no agentic decisions, survives credit exhaustion).
 *
 * Tables and windows:
 *   observer_signals       — expired rows (expires_at < NOW())
 *   os_observations        — older than 30 days AND promoted_to_kg = TRUE
 *   observer_pulse_events  — older than 1 hour (per migration 116 spec)
 *   session_memory_chunks  — older than 90 days
 *   gkg_events             — older than 30 days
 *   compaction_events      — older than 14 days
 *
 * Adjust windows here, not in a migration. Each DELETE is wrapped in a tx so
 * a single table's failure does not block the others. Counts are logged.
 *
 * Invocation: `node src/db/cron/observationRetention.js --once`
 * Wired in src/config/cronPriority.js → DIRECT_EXEC_COMMANDS.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13. Migration 118 schedules this runner.
 */

'use strict'

require('../../config/env')
const postgres = require('postgres')
const env = require('../../config/env')
const logger = require('../../config/logger')

const RETENTION = [
  {
    table: 'observer_signals',
    where: 'expires_at IS NOT NULL AND expires_at < NOW()',
    label: 'expired observer signals',
  },
  {
    table: 'os_observations',
    where: "observed_at < NOW() - INTERVAL '30 days' AND COALESCE(promoted_to_kg, FALSE) = TRUE",
    label: 'promoted observations >30d',
  },
  {
    table: 'observer_pulse_events',
    where: "ts < NOW() - INTERVAL '1 hour'",
    label: 'pulse events >1h',
  },
  {
    table: 'session_memory_chunks',
    where: "created_at < NOW() - INTERVAL '90 days'",
    label: 'session memory >90d',
  },
  {
    table: 'gkg_events',
    where: "captured_at < NOW() - INTERVAL '30 days'",
    label: 'gkg events >30d',
  },
  {
    table: 'compaction_events',
    where: "created_at < NOW() - INTERVAL '14 days'",
    label: 'compaction events >14d',
  },
]

async function tableExists(db, name) {
  const rows = await db`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
    LIMIT 1
  `
  return rows.length > 0
}

async function purgeOne(db, spec) {
  if (!(await tableExists(db, spec.table))) {
    logger.debug(`[retention] skip: table ${spec.table} not present`)
    return { table: spec.table, deleted: 0, skipped: true }
  }
  try {
    const result = await db.unsafe(`DELETE FROM ${spec.table} WHERE ${spec.where}`)
    const deleted = result.count ?? 0
    logger.info(`[retention] ${spec.label}: deleted ${deleted} rows from ${spec.table}`)
    return { table: spec.table, deleted, skipped: false }
  } catch (err) {
    logger.warn(`[retention] purge failed for ${spec.table}`, { error: err.message })
    return { table: spec.table, deleted: 0, error: err.message }
  }
}

async function run() {
  const db = postgres(env.DATABASE_URL, { max: 1, idle_timeout: 30, connect_timeout: 30 })
  const summary = []
  for (const spec of RETENTION) {
    summary.push(await purgeOne(db, spec))
  }
  const total = summary.reduce((s, r) => s + (r.deleted || 0), 0)

  // Sweep stuck outbound_actions rows (status='pending' or 'dispatched' >30min).
  // Surfaces them to observer_signals so the conductor sees verification gaps.
  // AUTONOMY_AUDIT_2026-05-13 — wires the existing actionVerification.abandonStale.
  let abandoned = 0
  try {
    const actionVerification = require('../../lib/actionVerification')
    abandoned = await actionVerification.abandonStale({ staleAfterMin: 30, batchLimit: 100 })
  } catch (err) {
    logger.warn('[retention] abandonStale failed', { error: err.message })
  }

  logger.info(`[retention] complete — purged ${total} rows, abandoned ${abandoned} stale actions`, { summary, abandoned })
  await db.end()
  return total + abandoned
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[retention] fatal', { error: err.message, stack: err.stack })
      process.exit(1)
    })
}

module.exports = { run }

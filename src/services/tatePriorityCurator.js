'use strict'

/**
 * tatePriorityCurator.js
 *
 * Curates the top 3 status_board.tate_priority pins for Tate's iOS widget
 * (and for the triage context-load priority filter). Two write paths:
 *
 *   1. set({ranked_ids}) - explicit set, called from headlessConductor's
 *      set_tate_priority tool when Opus decides the calculus has changed.
 *   2. refresh() - heuristic selectTop3() over status_board, called by the
 *      periodic cron (every 20 min) so the widget stays warm even when
 *      Opus hasn't pinned anything.
 *
 * Schema dependency: status_board.tate_priority int NULL with CHECK (1..3).
 * See migration 130_tate_priority_column.sql.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')

let _cronTimer = null

/**
 * Atomically clear all tate_priority pins and apply a new ranked order.
 * ranked_ids[i] gets priority i+1 (so first entry -> 1, second -> 2, etc).
 *
 * @param {Object} args
 * @param {string[]} args.ranked_ids - array of status_board row ids, length 0..3
 */
async function set({ ranked_ids } = {}) {
  if (!Array.isArray(ranked_ids)) {
    return { ok: false, error: 'ranked_ids must be array' }
  }
  if (ranked_ids.length > 3) {
    return { ok: false, error: 'ranked_ids length must be <= 3' }
  }
  try {
    await db.begin(async (sql) => {
      await sql`UPDATE status_board SET tate_priority = NULL WHERE tate_priority IS NOT NULL`
      for (let i = 0; i < ranked_ids.length; i++) {
        const id = ranked_ids[i]
        const priority = i + 1
        await sql`UPDATE status_board SET tate_priority = ${priority} WHERE id = ${id}`
      }
    })
    return { ok: true, ranked: ranked_ids }
  } catch (err) {
    if (/tate_priority/.test(err.message) || /column.*does not exist/i.test(err.message)) {
      return { ok: false, error: 'tate_priority column not migrated', stub: true }
    }
    logger.warn('tatePriorityCurator: set failed', { error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * Select top 3 candidate status_board ids by heuristic:
 *   - active rows (archived_at IS NULL)
 *   - next_action_by = 'tate' rows ranked first
 *   - then priority ASC (1 most urgent)
 *   - then next_action_due ASC NULLS LAST
 *   - then last_touched DESC (most recently touched wins on ties)
 *
 * Returns array of id strings (may be < 3 if board is sparse).
 */
async function selectTop3() {
  try {
    const rows = await db`
      SELECT id FROM status_board
      WHERE archived_at IS NULL
      ORDER BY
        CASE WHEN next_action_by = 'tate' THEN 0 ELSE 1 END ASC,
        priority ASC NULLS LAST,
        CASE WHEN next_action_due IS NULL THEN 1 ELSE 0 END ASC,
        next_action_due ASC NULLS LAST,
        last_touched DESC NULLS LAST
      LIMIT 3
    `
    return rows.map((r) => r.id)
  } catch (err) {
    logger.warn('tatePriorityCurator: selectTop3 failed', { error: err.message })
    return []
  }
}

async function refresh() {
  const ids = await selectTop3()
  return set({ ranked_ids: ids })
}

function startCron({ everyMs = 20 * 60 * 1000 } = {}) {
  if (_cronTimer) return
  _cronTimer = setInterval(() => {
    refresh().catch((err) => logger.warn('tatePriorityCurator: refresh tick failed', { error: err.message }))
  }, everyMs)
  if (_cronTimer.unref) _cronTimer.unref()
}

function stopCron() {
  if (_cronTimer) {
    clearInterval(_cronTimer)
    _cronTimer = null
  }
}

module.exports = { set, refresh, selectTop3, startCron, stopCron }

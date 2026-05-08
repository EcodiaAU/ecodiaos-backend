'use strict'

/**
 * statusBoardHygieneHaikuListener - passive hygiene sweep over status_board.
 *
 * "Haiku" = lightweight (1-3 ops, no LLM call). Plain JS hygiene rules.
 *
 * Substrate (5-layer verification):
 *   1. PRODUCER: any code path that INSERTs/UPDATEs status_board rows.
 *      Confirmed: many. status_board is one of the busiest tables.
 *   2. TRIGGER: trg_status_board_notify (migration 063_listener_triggers.sql).
 *      Fires AFTER INSERT OR UPDATE -> pg_notify('eos_listener_events', ...).
 *      Confirmed in pg_trigger.
 *   3. BRIDGE: src/services/listeners/dbBridge.js LISTEN on eos_listener_events.
 *   4. LISTENER: this module. subscribesTo: ['db:event'], relevanceFilter on
 *      table='status_board'. Debounces a single hygiene sweep 30s after the
 *      first triggering event.
 *   5. SIDE-EFFECT: UPDATE status_board (set archived_at + append context),
 *      kv_store heartbeat at kv_store.health.status_board_hygiene_listener.
 *
 * Tool surface (kept lightweight per brief):
 *   - SELECT status_board (read)
 *   - UPDATE status_board (write)
 *   That's it. NO POST to /api/os-session/message, NO SMS, NO email,
 *   NO Anthropic API calls. Truly passive.
 *
 * Hygiene rules (one debounced sweep per trigger storm):
 *   1. Archive rows where next_action_due < NOW() - INTERVAL '7 days'
 *      AND archived_at IS NULL.
 *   2. Archive rows where status IN ('archived','completed','dead','done')
 *      AND archived_at IS NULL.
 *   3. Flag rows next_action_by='tate' AND last_touched < NOW() - INTERVAL '14 days'
 *      AND archived_at IS NULL - append " [hygiene-listener: ageing on Tate >14d, P2 nudge]"
 *      to context ONCE (idempotent on marker presence).
 *   4. Flag rows last_touched < NOW() - INTERVAL '30 days'
 *      AND archived_at IS NULL - append " [hygiene-listener: stale last_touched, archive review]"
 *      to context ONCE (idempotent on marker presence).
 *
 * Heartbeat:
 *   Writes kv_store.health.status_board_hygiene_listener every successful
 *   sweep (debounced) with timestamp + counts. The 30s debounce is the
 *   minimum cadence; under no-write conditions the heartbeat will simply
 *   not advance, which is itself a (passive) signal.
 *
 * Origin: spring-clean fork_mowk9wfl_0b18b8, 2026-05-08 (worker 1).
 */

const logger = require('../../config/logger')
const db = require('../../config/db')

const DEBOUNCE_MS = 30 * 1000
const ARCHIVE_DUE_THRESHOLD = "INTERVAL '7 days'"
const TATE_AGEING_THRESHOLD = "INTERVAL '14 days'"
const STALE_TOUCHED_THRESHOLD = "INTERVAL '30 days'"

const ARCHIVE_DUE_NOTE = ' [hygiene-listener auto-archived 2026-05-08: due >7d past]'
const ARCHIVE_STATUS_NOTE = ' [hygiene-listener auto-archived 2026-05-08: terminal status]'
const TATE_AGEING_MARKER = ' [hygiene-listener: ageing on Tate >14d, P2 nudge]'
const STALE_TOUCHED_MARKER = ' [hygiene-listener: stale last_touched, archive review]'

const TERMINAL_STATUSES = ['archived', 'completed', 'dead', 'done']

let _debounceTimer = null
let _lastRunAt = null
let _running = false

async function _writeHeartbeat(snapshot) {
  try {
    const valueText = JSON.stringify(snapshot)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES ('health.status_board_hygiene_listener', ${valueText}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('statusBoardHygieneHaiku: heartbeat write failed', { error: err.message })
  }
}

/**
 * Single hygiene sweep. Exported for direct invocation by the test harness
 * (bypasses the pg_notify substrate).
 *
 * Returns { rows_archived, rows_flagged, sweep_started_at, sweep_finished_at, errors }.
 */
async function runHygieneSweep() {
  if (_running) {
    return { skipped: true, reason: 'sweep already running' }
  }
  _running = true
  const startedAt = new Date().toISOString()
  const result = {
    sweep_started_at: startedAt,
    sweep_finished_at: null,
    rows_archived: 0,
    rows_flagged: 0,
    rule1_archived_due: 0,
    rule2_archived_status: 0,
    rule3_flagged_tate_ageing: 0,
    rule4_flagged_stale: 0,
    errors: [],
  }

  try {
    // Rule 1: archive rows next_action_due > 7 days past, not yet archived.
    try {
      const archived1 = await db`
        UPDATE status_board
        SET archived_at = NOW(),
            context = COALESCE(context, '') || ${ARCHIVE_DUE_NOTE}
        WHERE next_action_due IS NOT NULL
          AND next_action_due < NOW() - INTERVAL '7 days'
          AND archived_at IS NULL
        RETURNING id
      `
      result.rule1_archived_due = archived1.length
      result.rows_archived += archived1.length
    } catch (err) {
      result.errors.push({ rule: 1, error: err.message })
      logger.warn('statusBoardHygieneHaiku: rule 1 (archive due) failed', { error: err.message })
    }

    // Rule 2: archive rows with terminal status that are not archived.
    try {
      const archived2 = await db`
        UPDATE status_board
        SET archived_at = NOW(),
            context = COALESCE(context, '') || ${ARCHIVE_STATUS_NOTE}
        WHERE status = ANY(${TERMINAL_STATUSES})
          AND archived_at IS NULL
        RETURNING id
      `
      result.rule2_archived_status = archived2.length
      result.rows_archived += archived2.length
    } catch (err) {
      result.errors.push({ rule: 2, error: err.message })
      logger.warn('statusBoardHygieneHaiku: rule 2 (archive terminal status) failed', { error: err.message })
    }

    // Rule 3: flag rows ageing on Tate >14d. Idempotent on marker presence.
    try {
      const flagged3 = await db`
        UPDATE status_board
        SET context = COALESCE(context, '') || ${TATE_AGEING_MARKER}
        WHERE next_action_by = 'tate'
          AND last_touched < NOW() - INTERVAL '14 days'
          AND archived_at IS NULL
          AND (context IS NULL OR position(${TATE_AGEING_MARKER} in context) = 0)
        RETURNING id
      `
      result.rule3_flagged_tate_ageing = flagged3.length
      result.rows_flagged += flagged3.length
    } catch (err) {
      result.errors.push({ rule: 3, error: err.message })
      logger.warn('statusBoardHygieneHaiku: rule 3 (flag tate ageing) failed', { error: err.message })
    }

    // Rule 4: flag rows with stale last_touched >30d. Idempotent on marker presence.
    try {
      const flagged4 = await db`
        UPDATE status_board
        SET context = COALESCE(context, '') || ${STALE_TOUCHED_MARKER}
        WHERE last_touched < NOW() - INTERVAL '30 days'
          AND archived_at IS NULL
          AND (context IS NULL OR position(${STALE_TOUCHED_MARKER} in context) = 0)
        RETURNING id
      `
      result.rule4_flagged_stale = flagged4.length
      result.rows_flagged += flagged4.length
    } catch (err) {
      result.errors.push({ rule: 4, error: err.message })
      logger.warn('statusBoardHygieneHaiku: rule 4 (flag stale touched) failed', { error: err.message })
    }

    result.sweep_finished_at = new Date().toISOString()
    _lastRunAt = result.sweep_finished_at

    if (result.rows_archived > 0 || result.rows_flagged > 0 || result.errors.length > 0) {
      logger.info('statusBoardHygieneHaiku: sweep complete', {
        archived: result.rows_archived,
        flagged: result.rows_flagged,
        errors: result.errors.length,
        startedAt,
      })
    }

    // Heartbeat write - separate from sweep, never blocks sweep on heartbeat failure.
    await _writeHeartbeat({
      last_run_at: result.sweep_finished_at,
      rows_archived: result.rows_archived,
      rows_flagged: result.rows_flagged,
      rule_breakdown: {
        rule1_archived_due: result.rule1_archived_due,
        rule2_archived_status: result.rule2_archived_status,
        rule3_flagged_tate_ageing: result.rule3_flagged_tate_ageing,
        rule4_flagged_stale: result.rule4_flagged_stale,
      },
      error_count: result.errors.length,
      fork_origin: 'fork_mowk9wfl_0b18b8',
    })

    return result
  } finally {
    _running = false
  }
}

function _scheduleSweep() {
  if (_debounceTimer) return  // already scheduled; collapse storm into one sweep
  _debounceTimer = setTimeout(async () => {
    _debounceTimer = null
    try {
      await runHygieneSweep()
    } catch (err) {
      logger.warn('statusBoardHygieneHaiku: scheduled sweep threw', { error: err.message })
    }
  }, DEBOUNCE_MS)
  if (_debounceTimer.unref) _debounceTimer.unref()
}

module.exports = {
  name: 'statusBoardHygieneHaiku',
  subscribesTo: ['db:event'],

  relevanceFilter: (event) => {
    const d = event && event.data
    if (!d || d.type !== 'db:event') return false
    if (d.table !== 'status_board') return false
    if (d.action !== 'INSERT' && d.action !== 'UPDATE') return false
    return true
  },

  handle: async (_event, _ctx) => {
    // Schedule a debounced sweep. The handler itself returns immediately;
    // the sweep runs DEBOUNCE_MS later, collapsing all events in that window
    // into a single sweep. This protects the DB from N sweeps under storm.
    _scheduleSweep()
  },

  ownsWriteSurface: ['status_board.archived_at', 'status_board.context', 'kv_store.health.status_board_hygiene_listener'],

  // Test/probe hooks - exported under explicit names so the test harness can
  // invoke the sweep directly without going through pg_notify.
  runHygieneSweep,
  _internal: {
    getLastRunAt: () => _lastRunAt,
    isRunning: () => _running,
    clearDebounce: () => {
      if (_debounceTimer) {
        clearTimeout(_debounceTimer)
        _debounceTimer = null
      }
    },
  },
}

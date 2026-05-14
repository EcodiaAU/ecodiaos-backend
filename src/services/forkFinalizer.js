/**
 * Fork Finalizer - idempotent terminal-state writes for os_forks.
 *
 * Authored: 30 Apr 2026, fork_mol0k7vp_cb8a60
 * Refs: Decision 3993, Strategic_Direction 3986, Pattern 3976.
 *
 * Why this exists
 * ───────────────
 * Decision 3993 (forks-as-primitive convergence) lets cron handlers spawn
 * forks instead of polluting Conductor context. The dominant failure mode
 * blocking that pattern is the "phantom-shipped fork": ecodia-api gets
 * SIGTERMed mid-fork (PM2 max_memory_restart, deploys, OOM), the fork's
 * actual work commits, but the os_forks row stays at status='spawning' or
 * 'running' because the in-memory state-mutation never reached _dbUpdate.
 * Downstream sessions then count the fork as still-running, fork-cap fills,
 * and the conductor stalls.
 *
 * The finalizer guarantees that once finalize() is called (or once the
 * UPDATE has landed), the os_forks row converges to a terminal status
 * regardless of subsequent process state. Idempotent: multiple calls for
 * the same fork are safe - the WHERE clause excludes already-terminal rows.
 *
 * Public API
 * ──────────
 *   await finalize(forkId, terminalStatus, result?)
 *     terminalStatus ∈ {'done', 'aborted', 'error'}
 *     result          string|null - preserved if column already non-null
 *
 *   Returns { updated, alreadyTerminal, notFound }
 *     updated         true if this call wrote terminal status to the row
 *     alreadyTerminal true if the row was already terminal (no write)
 *     notFound        true if no os_forks row exists for forkId at all
 *
 * Idempotency
 * ───────────
 * - SQL: UPDATE … WHERE fork_id=$1 AND status NOT IN ('done','aborted','error')
 * - ended_at: COALESCE(ended_at, now()) - preserves the original terminal time
 * - result:   COALESCE(result, $supplied) - preserves any earlier result write
 *
 * Note on 'crashed'
 * ─────────────────
 * forkService.recoverStaleForks (startup recovery) sets status='crashed' for
 * rows that were non-terminal when api restarted. The brief contract for
 * finalize() is explicit on the 3 terminal-input statuses {done,aborted,error};
 * the WHERE clause matches the brief literally. recoverStaleForks runs at
 * startup BEFORE any new forks spawn, so finalize() never races against a
 * 'crashed' row in commit 1's scope. If a 'crashed' row coexists with a
 * later finalize() (post-recovery), this WHERE would still let the finalize
 * overwrite it - that case is currently unreachable but worth flagging if
 * commit 2's pm2-detach work introduces a new race.
 */
'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

// Audit 2026-05-13 P0 #16: TERMINAL_STATES now ALSO contains 'crashed'
// so recovered rows (forkService.recoverStaleForks) are seen as terminal
// by downstream consumers (the dispatchQueueListener's fork_complete
// trigger), instead of orphaning dispatch_queue work that depends on a
// crashed fork. finalize() itself still refuses 'crashed' as an INPUT —
// only recoverStaleForks writes that status; callers using finalize()
// must pick one of {done,aborted,error}. FINALIZE_INPUT_STATES is the
// input gate; TERMINAL_STATES is the read gate used by consumers.
const FINALIZE_INPUT_STATES = new Set(['done', 'aborted', 'error'])
const TERMINAL_STATES = new Set(['done', 'aborted', 'error', 'crashed'])

/**
 * Idempotent terminal-state write for an os_forks row.
 *
 * @param {string} forkId          os_forks.fork_id (PK)
 * @param {'done'|'aborted'|'error'} terminalStatus
 * @param {string|null} [result]   Optional [FORK_REPORT] body or error msg
 * @returns {Promise<{updated:boolean, alreadyTerminal:boolean, notFound:boolean}>}
 */
async function finalize(forkId, terminalStatus, result = null) {
  if (!forkId || typeof forkId !== 'string') {
    throw new Error('forkFinalizer.finalize: forkId is required (string)')
  }
  if (!FINALIZE_INPUT_STATES.has(terminalStatus)) {
    throw new Error(
      `forkFinalizer.finalize: invalid terminalStatus "${terminalStatus}" - must be one of: done, aborted, error`
    )
  }

  // Step 1: idempotent UPDATE. RETURNING tells us whether the row was actually
  // mutated by this call (1 row = we wrote it terminal; 0 rows = already
  // terminal OR not found, distinguished by the probe below).
  let updatedRows
  try {
    // Audit 2026-05-13 P0 #16: WHERE-clause now also excludes 'crashed'
    // so a row left terminal by recoverStaleForks isn't silently
    // overwritten by a late finalize() call (recovery may have run
    // because the api was restarted under the fork's feet; the fork's
    // in-memory state machine might still attempt to write a finalize
    // on next startup).
    updatedRows = await db`
      UPDATE os_forks
      SET status   = ${terminalStatus},
          ended_at = COALESCE(ended_at, now()),
          result   = COALESCE(result, ${result})
      WHERE fork_id = ${forkId}
        AND status NOT IN ('done', 'aborted', 'error', 'crashed')
      RETURNING fork_id, status
    `
  } catch (err) {
    // Surface DB errors - caller decides whether to re-throw or swallow. Logs
    // here so a guarantor-style swallowed catch in forkService still leaves a
    // breadcrumb for post-mortem.
    logger.error('forkFinalizer.finalize: UPDATE failed', {
      fork_id: forkId,
      terminalStatus,
      error: err.message,
    })
    throw err
  }

  if (updatedRows && updatedRows.length > 0) {
    return { updated: true, alreadyTerminal: false, notFound: false }
  }

  // Step 2: 0 rows updated - disambiguate alreadyTerminal vs notFound.
  // A separate SELECT is the cheapest way to distinguish; we deliberately
  // avoid pre-fetching in step 1 to keep the happy-path a single round trip.
  let probe
  try {
    probe = await db`
      SELECT status
      FROM os_forks
      WHERE fork_id = ${forkId}
      LIMIT 1
    `
  } catch (err) {
    // Probe failure is non-fatal - we report ambiguity rather than throwing.
    logger.warn('forkFinalizer.finalize: probe SELECT failed (non-fatal)', {
      fork_id: forkId,
      error: err.message,
    })
    return { updated: false, alreadyTerminal: false, notFound: false }
  }

  if (probe && probe.length > 0) {
    // Row exists but the UPDATE didn't touch it -> it was already terminal.
    return { updated: false, alreadyTerminal: true, notFound: false }
  }

  // Truly missing - finalize() called for an id that never had an os_forks row.
  // This is the case the brief calls out as warn-worthy.
  logger.warn('forkFinalizer.finalize: row truly missing (no os_forks entry)', {
    fork_id: forkId,
    terminalStatus,
  })
  return { updated: false, alreadyTerminal: false, notFound: true }
}

module.exports = {
  finalize,
  TERMINAL_STATES,
}

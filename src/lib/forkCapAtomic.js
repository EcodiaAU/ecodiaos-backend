'use strict'

/**
 * forkCapAtomic - atomic fork cap enforcement per FORK_ATOMICITY_SPEC §2.
 *
 * The existing spawnFork() in forkService.js has a TOCTOU race: two
 * concurrent spawns both read count=4 via _activeCount(), both pass the
 * `>= 5` check, both insert. Result: 6 live forks when cap is 5. This
 * has been observed in prod as 7/5.
 *
 * The fix is NOT another count gate - that's still TOCTOU. The fix is an
 * atomic conditional INSERT inside a transaction with a Postgres advisory
 * lock. Postgres serialises concurrent spawn attempts on the same lock
 * key; the count read + insert happen inside the same xact, so no other
 * spawn can slip in between.
 *
 * This module is a drop-in replacement for the cap check block. The
 * `forkService.js` file is on the §2.3 self-mod denylist, so wiring this
 * in requires SMS-OTP approval - shipping the helper + tests first so
 * wiring is a small, reviewable diff when approved.
 *
 * Usage (in the approved wiring diff):
 *
 *   const { tryReserveForkSlot } = require('../lib/forkCapAtomic')
 *   const slot = await tryReserveForkSlot({
 *     fork_id, brief, context_mode, parent_session_id, depth, hard_cap, energy_cap,
 *   })
 *   // slot is either the inserted os_forks row or throws 'fork_cap_reached'
 *
 * Failure modes:
 *   - cap reached → throws err with err.code = 'fork_cap_reached' and
 *     err.details.cap_hit = 'hard' | 'energy'.
 *   - advisory lock contention is invisible (Postgres waits).
 *   - DB error bubbles up as a plain Error (caller handles).
 */

const db = require('../config/db')
const logger = require('../config/logger')

const ACTIVE_STATUSES = Object.freeze(['spawning', 'running', 'reporting'])

/**
 * Atomic reserve-a-fork-slot-and-insert. Returns the row. Throws if cap
 * reached. Caller is responsible for populating the in-memory Map AFTER
 * this resolves - memory is a cache of DB, not the source of truth.
 *
 * @param {object} params
 * @param {string} params.fork_id
 * @param {string} params.brief
 * @param {string} [params.context_mode='recent']
 * @param {string} [params.parent_session_id]
 * @param {number} [params.depth=0]
 * @param {number} params.hard_cap - absolute ceiling
 * @param {number} [params.energy_cap] - soft cap from energy budget; min(hard, energy) is effective
 * @returns {Promise<object>} inserted os_forks row
 */
async function tryReserveForkSlot({
  fork_id,
  brief,
  context_mode = 'recent',
  parent_session_id,
  depth = 0,
  hard_cap,
  energy_cap,
}) {
  if (!fork_id || typeof fork_id !== 'string') {
    throw Object.assign(new Error('fork_id required'), { code: 'invalid_params' })
  }
  if (!brief || typeof brief !== 'string') {
    throw Object.assign(new Error('brief required'), { code: 'invalid_params' })
  }
  if (!Number.isFinite(hard_cap) || hard_cap < 1) {
    throw Object.assign(new Error('hard_cap must be a positive number'), { code: 'invalid_params' })
  }

  const effectiveCap = Number.isFinite(energy_cap)
    ? Math.min(hard_cap, Math.max(0, energy_cap))
    : hard_cap

  // The advisory lock serialises spawn attempts. It's released on xact
  // commit/rollback automatically - no manual release needed.
  //
  // hashtext() is deterministic: every call with the same string yields
  // the same int4. That gives us a stable lock domain for the 'fork_cap'
  // concept without needing to allocate a number.
  const rows = await db`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(hashtext('fork_cap'))
    ),
    live_count AS (
      SELECT COUNT(*)::int AS n
      FROM os_forks
      WHERE status IN ('spawning', 'running', 'reporting')
    ),
    attempted AS (
      INSERT INTO os_forks
        (fork_id, brief, status, spawned_at, context_mode, parent_session_id, depth)
      SELECT
        ${fork_id}, ${brief}, 'spawning', NOW(),
        ${context_mode}, ${parent_session_id || null}, ${depth}
      FROM live_count, locked
      WHERE live_count.n < ${effectiveCap}
      RETURNING *
    )
    SELECT
      (SELECT n FROM live_count) AS live_count_before,
      (SELECT row_to_json(a) FROM attempted a) AS inserted_row
  `

  const [result] = rows
  if (!result) {
    // Should never happen (CTE always returns a row), but defense in depth.
    throw new Error('forkCapAtomic: no result row from atomic spawn query')
  }

  const liveCountBefore = result.live_count_before
  const insertedRow = result.inserted_row

  if (!insertedRow) {
    const capHit = Number.isFinite(energy_cap) && energy_cap < hard_cap ? 'energy' : 'hard'
    logger.info('forkCapAtomic: cap reached, spawn rejected', {
      live_count_before: liveCountBefore,
      hard_cap,
      energy_cap,
      effective_cap: effectiveCap,
      cap_hit: capHit,
    })
    throw Object.assign(new Error('fork_cap_reached'), {
      httpStatus: 429,
      code: 'fork_cap_reached',
      details: {
        live_count: liveCountBefore,
        hard_cap,
        energy_cap,
        effective_cap: effectiveCap,
        cap_hit: capHit,
      },
    })
  }

  logger.info('forkCapAtomic: slot reserved', {
    fork_id,
    live_count_before: liveCountBefore,
    effective_cap: effectiveCap,
  })
  return insertedRow
}

/**
 * Read current live count (diagnostic only - never use for a cap check,
 * that's what tryReserveForkSlot is for).
 */
async function liveForkCount() {
  const rows = await db`
    SELECT COUNT(*)::int AS n
    FROM os_forks
    WHERE status IN ('spawning', 'running', 'reporting')
  `
  return rows[0]?.n || 0
}

module.exports = {
  tryReserveForkSlot,
  liveForkCount,
  ACTIVE_STATUSES,
}

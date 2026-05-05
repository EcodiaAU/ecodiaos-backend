'use strict'

/**
 * forkCapAtomic - atomic fork cap enforcement per FORK_ATOMICITY_SPEC §2.
 *
 * Closes the TOCTOU race in spawnFork(): two concurrent spawns both read
 * count=4 via _activeCount(), both pass the >= 5 check, both insert.
 * Result: 6 live forks when cap is 5. Observed in prod as 7/5.
 *
 * The fix is an atomic conditional INSERT inside a transaction with a
 * Postgres advisory lock. The count read + insert happen inside the same
 * xact, so no other spawn can slip in between.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const ACTIVE_STATUSES = Object.freeze(['spawning', 'running', 'reporting'])

/**
 * @param {object} params
 * @param {string} params.fork_id
 * @param {string} params.brief
 * @param {string} [params.context_mode='recent']
 * @param {string} [params.parent_id='main']
 * @param {string} [params.root_fork_id] - tree root; defaults to fork_id for root-level forks
 * @param {number} params.hard_cap
 * @param {number} [params.energy_cap]
 * @param {number} [params.goal_id] - optional goal ID for per-goal fork budget enforcement
 * @returns {Promise<object>} inserted os_forks row
 */
async function tryReserveForkSlot({
  fork_id,
  brief,
  context_mode = 'recent',
  parent_id = 'main',
  root_fork_id,
  hard_cap,
  energy_cap,
  goal_id,
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

  // root_fork_id: for root-level forks (parent_id='main') this equals fork_id.
  // For sub-forks it equals the parent's root_fork_id (passed in by forkService).
  const effectiveRoot = root_fork_id || fork_id

  const effectiveCap = Number.isFinite(energy_cap)
    ? Math.min(hard_cap, Math.max(0, energy_cap))
    : hard_cap

  // Per-tree cap: count active forks with the same root, not all forks globally.
  // Sub-forks consume slots from their tree's pool, not from conductor's global pool.
  // Root-level forks (root = self) still see the full effectiveCap against the global
  // count — they ARE the tree root, so tree count == global count for their isolation.
  const useTreeCap = parent_id !== 'main'

  const rows = useTreeCap
    ? await db`
        WITH locked AS (
          SELECT pg_advisory_xact_lock(hashtext('fork_cap_' || ${effectiveRoot}))
        ),
        tree_count AS (
          SELECT COUNT(*)::int AS n
          FROM os_forks
          WHERE root_fork_id = ${effectiveRoot}
            AND status IN ('spawning', 'running', 'reporting')
        ),
        attempted AS (
          INSERT INTO os_forks
            (fork_id, parent_id, root_fork_id, brief, status, started_at, context_mode)
          SELECT
            ${fork_id}, ${parent_id}, ${effectiveRoot}, ${brief}, 'spawning', NOW(),
            ${context_mode}
          FROM tree_count, locked
          WHERE tree_count.n < ${effectiveCap}
          RETURNING *
        )
        SELECT
          (SELECT n FROM tree_count) AS live_count_before,
          (SELECT row_to_json(a) FROM attempted a) AS inserted_row
      `
    : await db`
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
            (fork_id, parent_id, root_fork_id, brief, status, started_at, context_mode)
          SELECT
            ${fork_id}, ${parent_id}, ${effectiveRoot}, ${brief}, 'spawning', NOW(),
            ${context_mode}
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
      tree_cap: useTreeCap,
      root_fork_id: effectiveRoot,
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
        tree_cap: useTreeCap,
        root_fork_id: effectiveRoot,
      },
    })
  }

  // Per-goal fork budget enforcement (Layer 7, JARVIS_GAP §3).
  if (goal_id && Number.isFinite(goal_id)) {
    try {
      const budgetRows = await db`
        UPDATE organism_goals
        SET fork_budget_remaining = fork_budget_remaining - 1
        WHERE id = ${goal_id}
          AND fork_budget_remaining > 0
          AND status IN ('active', 'pursuing')
        RETURNING fork_budget_remaining
      `
      if (budgetRows.length === 0) {
        await db`DELETE FROM os_forks WHERE fork_id = ${fork_id}`.catch(() => {})
        logger.info('forkCapAtomic: per-goal budget exhausted, spawn rolled back', {
          fork_id, goal_id,
        })
        throw Object.assign(new Error('goal_fork_budget_exhausted'), {
          httpStatus: 429,
          code: 'goal_fork_budget_exhausted',
          details: { fork_id, goal_id },
        })
      }
    } catch (err) {
      if (err.code === 'goal_fork_budget_exhausted') throw err
      logger.warn('forkCapAtomic: goal budget check failed (non-fatal)', { error: err.message, goal_id })
    }
  }

  logger.info('forkCapAtomic: slot reserved', {
    fork_id,
    live_count_before: liveCountBefore,
    effective_cap: effectiveCap,
    goal_id: goal_id || null,
  })
  return insertedRow
}

async function liveForkCount(root_fork_id) {
  if (root_fork_id) {
    const rows = await db`
      SELECT COUNT(*)::int AS n
      FROM os_forks
      WHERE root_fork_id = ${root_fork_id}
        AND status IN ('spawning', 'running', 'reporting')
    `
    return rows[0]?.n || 0
  }
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

/**
 * Cron Fork Dispatcher — Decision 3993 commit 3/3
 *
 * Per Strategic Direction 3986, operational crons should NOT POST giant briefs
 * into the conductor's `/api/os-session/message` queue. That polluted ~80% of
 * the conductor's working context with cron-fire prompts and starved real
 * decisions of context budget.
 *
 * This dispatcher reroutes refactor-eligible crons to spawn ephemeral
 * `forkService` forks instead. Each fork:
 *   - inherits MCP tools + neo4j + scheduler + factory + supabase access
 *   - reads its self-contained brief from `os_scheduled_tasks.prompt`
 *   - executes the cron's intent autonomously (writes status_board / kv_store
 *     / Neo4j as needed) and exits
 *   - never touches the conductor's message queue
 *
 * Three layers of gating live here:
 *
 *   1. Classification (src/config/cronPriority.js).
 *      conductor/direct_exec → not our concern (caller stays on os-session POST).
 *      high_priority_fork → always spawn (budget bypass).
 *      low_priority_fork → spawn only if budget allows.
 *
 *   2. Budget circuit-breaker.
 *      `kv_store.cowork.daily_fork_budget_remaining` (defaults to 100_000 each
 *      midnight UTC via the `cowork-fork-budget-reset` cron). Each spawn
 *      decrements an estimated cost. When the budget tightens, LOW-priority
 *      crons skip and surface a status_board P3 row.
 *
 *   3. Cap inheritance from forkService.
 *      forkService enforces HARD_FORK_CAP and an energy-soft cap. If we hit
 *      the cap, we don't decrement the budget — we re-queue the cron via the
 *      poller's existing requeue path.
 *
 * Telemetry stamping: every spawn writes the resulting fork_id back to
 * `os_scheduled_tasks.last_dispatched_fork_id` (column added by migration 070)
 * so post-mortem reconciliation can trace cron → fork without grep'ing logs.
 *
 * Failure modes:
 *   - Budget exhausted: skip + status_board P3 row + return { spawned: false }
 *   - Fork cap reached: return { spawned: false, error: 'fork_cap_reached' }
 *     (caller re-queues per existing poller logic).
 *   - DB write failure on budget decrement: log warn, proceed (fail-open —
 *     better to spawn than to silently stall).
 *   - Spawn throws: log error, do NOT decrement budget (atomicity — if spawn
 *     never happened, the budget never spent).
 */
'use strict'

const db = require('../config/db')
const logger = require('../config/logger')
const forkService = require('./forkService')
const {
  classifyCron,
  budgetGateDecision,
  DAILY_FORK_BUDGET_DEFAULT,
} = require('../config/cronPriority')
// Imported as namespace (not destructured) so jest.spyOn / runtime overrides
// in tests can intercept the call. The dispatcher reads session_mode via
// cronSessionMode.getCronSessionMode(...) below.
const cronSessionMode = require('../config/cronSessionMode')

// Estimate token cost for a cron-spawned fork. Brief size is the largest
// variable; handler overhead is roughly fixed.
//
//   brief_chars / 3.5  ≈ tokens to read the brief once
//   + 2_000            ≈ MCP tool calls + assistant intermediate reasoning
//   + 1_000            ≈ system prompt + framing overhead
//
// Total estimate is conservative on purpose — we'd rather throttle early than
// blow the daily budget mid-day.
function estimateForkTokenCost(brief) {
  const briefChars = (brief || '').length
  return Math.ceil(briefChars / 3.5) + 2_000 + 1_000
}

// ── Budget read/write ────────────────────────────────────────────────────────
// kv_store.value is TEXT — JSON.stringify ourselves (mirrors osAlertingService).

const BUDGET_KEY = 'cowork.daily_fork_budget_remaining'
const BUDGET_MAX_KEY = 'cowork.daily_fork_budget_max'

async function _readBudget() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${BUDGET_KEY}`
    if (rows.length === 0) {
      // Initialise lazily on first read.
      await _writeBudget(DAILY_FORK_BUDGET_DEFAULT)
      return DAILY_FORK_BUDGET_DEFAULT
    }
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const n = Number(parsed?.remaining ?? parsed)
    return Number.isFinite(n) ? n : DAILY_FORK_BUDGET_DEFAULT
  } catch (err) {
    logger.warn('cronForkDispatcher: budget read failed, defaulting', { error: err.message })
    return DAILY_FORK_BUDGET_DEFAULT
  }
}

async function _readBudgetMax() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${BUDGET_MAX_KEY}`
    if (rows.length === 0) return DAILY_FORK_BUDGET_DEFAULT
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const n = Number(parsed?.max ?? parsed)
    return Number.isFinite(n) ? n : DAILY_FORK_BUDGET_DEFAULT
  } catch {
    return DAILY_FORK_BUDGET_DEFAULT
  }
}

async function _writeBudget(remaining) {
  const payload = JSON.stringify({ remaining, updated_at: new Date().toISOString() })
  await db`
    INSERT INTO kv_store (key, value)
    VALUES (${BUDGET_KEY}, ${payload})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
}

async function _decrementBudget(cost) {
  // Read-modify-write. Race conditions are tolerable here — at worst the
  // budget runs ~1-2 spawn-costs negative which still triggers the gate next
  // cycle. A pg-side decrement (UPDATE ... SET value = (value::int - cost))
  // would be cleaner but the value column is TEXT/JSON; not worth the
  // complexity for a soft-gate counter.
  const current = await _readBudget()
  const next = Math.max(0, current - cost)
  await _writeBudget(next)
  return next
}

async function _refundBudget(cost) {
  // Used when a spawn was attempted, accounting decremented, then the spawn
  // failed (cap, network). Refund so the budget reflects actual consumption.
  try {
    const current = await _readBudget()
    const max = await _readBudgetMax()
    const next = Math.min(max, current + cost)
    await _writeBudget(next)
  } catch (err) {
    logger.warn('cronForkDispatcher: budget refund failed (non-fatal)', { error: err.message })
  }
}

// ── Status board row for budget-exhausted defer ─────────────────────────────

async function _writeBudgetExhaustedStatusRow(cronName, gate) {
  try {
    const name = `Cron budget exhausted - ${cronName} deferred`
    const context = JSON.stringify({
      cron: cronName,
      tier: gate.tier,
      reason: gate.reason,
      defer_at: new Date().toISOString(),
    }).slice(0, 500)
    await db`
      INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context)
      SELECT 'task', ${name}, 'deferred', ${'cron will retry next cycle when budget refreshes (midnight UTC)'},
             'ecodiaos', 3, ${context}
      WHERE NOT EXISTS (
        SELECT 1 FROM status_board WHERE name = ${name} AND archived_at IS NULL
      )
    `
  } catch (err) {
    logger.warn('cronForkDispatcher: failed to write budget-exhausted status row', { cron: cronName, error: err.message })
  }
}

// ── Fork-id stamp on the cron task ───────────────────────────────────────────

async function _stampForkIdOnCron(taskId, forkId) {
  // Best-effort. The migration adds last_dispatched_fork_id; if the migration
  // hasn't run on this DB yet we silently skip (column-missing tolerant).
  try {
    await db`
      UPDATE os_scheduled_tasks
      SET last_dispatched_fork_id = ${forkId}
      WHERE id = ${taskId}
    `
  } catch (err) {
    if (/column .* does not exist/i.test(err.message || '')) {
      logger.debug('cronForkDispatcher: last_dispatched_fork_id column missing (run migration 070)')
    } else {
      logger.warn('cronForkDispatcher: failed to stamp fork_id on cron task', { taskId, forkId, error: err.message })
    }
  }
}

// ── Public: dispatch a cron task as a fork ──────────────────────────────────
/**
 * Spawn a fork to handle a cron task's intent.
 *
 * @param {object} cronTask - row from os_scheduled_tasks (id, name, prompt, ...)
 * @returns {Promise<{
 *   spawned: boolean,
 *   route: string,             // classification used
 *   fork_id: string|null,
 *   reason: string,            // why we did/didn't spawn
 *   budget_remaining: number,  // post-decrement (or current if not spawned)
 *   estimated_cost: number,
 * }>}
 */
async function dispatchCronAsFork(cronTask) {
  const route = classifyCron(cronTask.name)
  const sessionMode = cronSessionMode.getCronSessionMode(cronTask.name)

  // Conductor + direct_exec routes are NOT our concern — caller should keep
  // them on the existing os-session POST path. Returning shouldHandle=false
  // is the contract that tells the caller to skip our path.
  if (route === 'conductor' || route === 'direct_exec') {
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: 'route_handled_by_caller_not_dispatcher',
      budget_remaining: await _readBudget(),
      estimated_cost: 0,
      shouldHandle: false,
    }
  }

  // Session-mode short-circuits, orthogonal to the priority route.
  // direct_exec at the session-mode layer means "this cron's intent runs as
  // a shell call, not as a fork." If priority and session_mode disagree (a
  // cron classified as fork-priority but session-mode='direct_exec'), the
  // session_mode wins on substrate selection — caller falls back to the
  // os-session POST path.
  if (sessionMode === 'direct_exec') {
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: 'session_mode_direct_exec_handled_by_caller',
      budget_remaining: await _readBudget(),
      estimated_cost: 0,
      shouldHandle: false,
    }
  }

  // conductor_inline: the conductor's main session handles this. Return a
  // sentinel so the caller knows not to spawn a fork AND not to POST to
  // /api/os-session/message (the conductor will pick it up on its own loop).
  if (sessionMode === 'conductor_inline') {
    logger.info('cronForkDispatcher: cron flagged conductor_inline (no spawn)', {
      cron: cronTask.name,
      route,
    })
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: 'session_mode_conductor_inline_handle_on_main',
      budget_remaining: await _readBudget(),
      estimated_cost: 0,
      shouldHandle: false,
    }
  }

  // factory_cc_session: never auto-routed. Manual dispatch only. Log a
  // warning so the operator notices and surfaces a status_board row if the
  // cron keeps firing without a manual handler picking it up.
  if (sessionMode === 'factory_cc_session') {
    logger.warn('cronForkDispatcher: cron classified factory_cc_session — manual dispatch only', {
      cron: cronTask.name,
      route,
      hint: 'use start_cc_session by hand; never auto-routed by the dispatcher',
    })
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: 'session_mode_factory_cc_session_manual_only',
      budget_remaining: await _readBudget(),
      estimated_cost: 0,
      shouldHandle: false,
    }
  }

  // From here we KNOW session_mode is brief_fork or inherit_fork. Map to
  // forkService's context_mode argument. Default falls back to 'recent'
  // (matches forkService.spawnFork's own default) if classification is
  // missing — but sessionModeToContextMode returning null means the caller
  // shouldn't have reached this path; treat null as a programming error.
  const contextMode = cronSessionMode.sessionModeToContextMode(sessionMode) || 'recent'

  const cost = estimateForkTokenCost(cronTask.prompt)
  const budgetRemaining = await _readBudget()
  const budgetMax = await _readBudgetMax()
  const gate = budgetGateDecision({
    classification: route,
    budgetRemaining,
    budgetMax,
  })

  if (!gate.allow) {
    await _writeBudgetExhaustedStatusRow(cronTask.name, gate)
    logger.info('cronForkDispatcher: cron deferred by budget gate', {
      cron: cronTask.name,
      route,
      session_mode: sessionMode,
      tier: gate.tier,
      reason: gate.reason,
      budget_remaining: budgetRemaining,
    })
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: gate.reason,
      budget_remaining: budgetRemaining,
      estimated_cost: cost,
      shouldHandle: true,
    }
  }

  // Decrement first (optimistic). If spawn fails we refund.
  await _decrementBudget(cost).catch(err => {
    logger.warn('cronForkDispatcher: pre-spawn decrement failed (proceeding)', { error: err.message })
  })

  let forkSnapshot
  try {
    forkSnapshot = await forkService.spawnFork({
      brief: cronTask.prompt,
      context_mode: contextMode,
    })
  } catch (err) {
    // Refund — spawn never happened.
    await _refundBudget(cost)
    logger.warn('cronForkDispatcher: spawnFork failed', {
      cron: cronTask.name,
      session_mode: sessionMode,
      context_mode: contextMode,
      error: err.message,
      code: err.code,
    })
    return {
      spawned: false,
      route,
      session_mode: sessionMode,
      fork_id: null,
      reason: err.code || `spawn_error: ${err.message}`,
      budget_remaining: await _readBudget(),
      estimated_cost: cost,
      shouldHandle: true,
    }
  }

  const forkId = forkSnapshot?.fork_id
  if (forkId) {
    await _stampForkIdOnCron(cronTask.id, forkId)
  }

  logger.info('cronForkDispatcher: cron dispatched as fork', {
    cron: cronTask.name,
    fork_id: forkId,
    route,
    session_mode: sessionMode,
    context_mode: contextMode,
    estimated_cost: cost,
    budget_remaining: budgetRemaining - cost,
    tier: gate.tier,
  })

  return {
    spawned: true,
    route,
    session_mode: sessionMode,
    fork_id: forkId,
    reason: 'spawned',
    budget_remaining: budgetRemaining - cost,
    estimated_cost: cost,
    shouldHandle: true,
  }
}

// ── Public: midnight reset (called by cowork-fork-budget-reset cron) ────────
async function resetDailyBudget(targetMax = DAILY_FORK_BUDGET_DEFAULT) {
  await _writeBudget(targetMax)
  // Persist max separately so the gate can compute ratio against an explicit
  // ceiling rather than guessing from default.
  const maxPayload = JSON.stringify({ max: targetMax, reset_at: new Date().toISOString() })
  await db`
    INSERT INTO kv_store (key, value)
    VALUES (${BUDGET_MAX_KEY}, ${maxPayload})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
  logger.info('cronForkDispatcher: daily fork budget reset', { target_max: targetMax })
  return { reset: true, target_max: targetMax }
}

module.exports = {
  dispatchCronAsFork,
  resetDailyBudget,
  estimateForkTokenCost,
  // exposed for tests / smoke
  _readBudget,
  _readBudgetMax,
  _writeBudget,
}

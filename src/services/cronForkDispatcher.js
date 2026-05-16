/**
 * Cron Fork Dispatcher - Decision 3993 commit 3/3
 *
 * Per Strategic Direction 3986, operational crons should NOT POST giant briefs
 * into the conductor's `/api/os-session/message` queue. That polluted ~80% of
 * the conductor's working context with cron-fire prompts and starved real
 * decisions of context budget.
 *
 * This dispatcher reroutes refactor-eligible crons to spawn ephemeral
 * `forkService` forks instead. Each fork:
 * - inherits MCP tools + neo4j + scheduler + factory + supabase access
 * - reads its self-contained brief from `os_scheduled_tasks.prompt`
 * - executes the cron's intent autonomously (writes status_board / kv_store
 *     / Neo4j as needed) and exits
 * - never touches the conductor's message queue
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
 *      the cap, we don't decrement the budget - we re-queue the cron via the
 *      poller's existing requeue path.
 *
 * Telemetry stamping: every spawn writes the resulting fork_id back to
 * `os_scheduled_tasks.last_dispatched_fork_id` (column added by migration 070)
 * so post-mortem reconciliation can trace cron → fork without grep'ing logs.
 *
 * Failure modes:
 * - Budget exhausted: skip + status_board P3 row + return { spawned: false }
 * - Fork cap reached: return { spawned: false, error: 'fork_cap_reached' }
 *     (caller re-queues per existing poller logic).
 * - DB write failure on budget decrement: log warn, proceed (fail-open - 
 *     better to spawn than to silently stall).
 * - Spawn throws: log error, do NOT decrement budget (atomicity - if spawn
 *     never happened, the budget never spent).
 */
'use strict'

const fs = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')
const db = require('../config/db')
const logger = require('../config/logger')
const forkService = require('./forkService')
const {
  classifyCron,
  budgetGateDecision,
  DAILY_FORK_BUDGET_DEFAULT,
} = require('../config/cronPriority')

const execFileAsync = promisify(execFile)

// ── Phase E Layer 6 H1-A: perf emission for cron-dispatched forks ───────────
//
// Cron-dispatched forks bypass the Claude Code SDK harness entirely - no model
// turn, no PreToolUse hook, no emit-perf.sh EXIT trap. This means ~90% of
// fork spawns (is_cron=true rows) produce ZERO rows in primitive_perf_event,
// leaving Layer 6 telemetry dark for the vast majority of the fork estate.
//
// Fix: emit a perf JSONL line directly from Node.js using the same format as
// shell-side emit-perf.sh so the 15-minute perfEventConsumer drains it
// uniformly alongside conductor-dispatched events. We append to the same
// perf-events.jsonl file rather than inserting directly to DB to stay
// consistent with the single-writer pipeline and avoid connection overhead on
// the hot dispatch path.
//
// primitive_name : 'cron:fork_spawn'
// duration_ms    : measured across forkService.spawnFork() (the actual spawn)
// status         : 'ok' | 'error'
// payload_size   : cronTask.prompt.length (bytes)
// metadata       : { fork_id, cron_name, route, estimated_cost }
//
// Fire-and-forget. Emission failure is swallowed silently - perf telemetry
// must never block or crash the dispatch critical path.
//
// RCA: ~/ecodiaos/drafts/phase-e-layer6-dark-in-prod-rca-2026-05-09.md (H1-A)
// Status row: d4337e11-6585-4cad-b5eb-09d5dd6874f7

const PERF_TELEMETRY_DIR = process.env.ECODIAOS_PERF_TELEMETRY_DIR || '/home/tate/ecodiaos/logs/telemetry'
const PERF_TELEMETRY_FILE = process.env.ECODIAOS_PERF_TELEMETRY_FILE || `${PERF_TELEMETRY_DIR}/perf-events.jsonl`

/**
 * Append one perf JSONL line for a cron fork spawn event.
 * Mirrors the emit_perf_safe function in scripts/hooks/lib/emit-perf.sh.
 * All errors are swallowed. Must never throw.
 */
function _emitCronForkPerfEvent({ primitiveName, durationMs, status, payloadSizeBytes, metadata }) {
  try {
    const ts = new Date().toISOString()
    // Strip backslash and double-quote from string fields (same sanitisation
    // as the shell-side hand-rolled JSON in emit-perf.sh).
    const pn = String(primitiveName || 'cron:fork_spawn').replace(/[\\"]/g, '')
    const st = String(status || 'ok').replace(/[\\"]/g, '')
    const dm = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0
    const psb = Number.isFinite(payloadSizeBytes) ? payloadSizeBytes : null
    const meta = (metadata && typeof metadata === 'object') ? metadata : {}

    const line = JSON.stringify({
      ts,
      primitive_name: pn,
      duration_ms: dm,
      status: st,
      payload_size_bytes: psb,
      metadata: meta,
    })

    try {
      fs.mkdirSync(PERF_TELEMETRY_DIR, { recursive: true })
    } catch (_) { /* ignore - dir may already exist */ }

    fs.appendFileSync(PERF_TELEMETRY_FILE, line + '\n', { encoding: 'utf8', flag: 'a' })
  } catch (_) {
    // Silent. Perf emission must never block or crash the dispatch path.
  }
}

// ── Phase D surfacing hooks - cron substrate coverage ───────────────────────
//
// The SDK harness PreToolUse/PostToolUse hooks (brief-consistency-check.sh,
// cred-mention-surface.sh, etc.) only fire when the conductor model makes an
// mcp__forks__spawn_fork tool call. That covers conductor-typed dispatches but
// leaves the entire cron substrate dark: cronForkDispatcher calls
// forkService.spawnFork() directly in Node.js - no model turn, no tool call,
// no hook fire.
//
// This function synthesises a PreToolUse-shaped stdin payload and pipes it to
// the two highest-value hooks, giving cron-spawned forks the same telemetry
// + warn coverage as conductor-dispatched forks. The emit-telemetry.sh lib
// emits JSONL with kind='cron_fire' (case arm added in this same commit),
// which the dispatchEventConsumer ingests into dispatch_event +
// surface_event rows. The hook output (warn lines) goes to the server log
// since there is no model turn to inject it into.
//
// Warn-only. Fire-and-forget. Hook failures are non-fatal and never block spawn.
// Timeout: 8s per hook (generous vs the SDK's 5s harness timeout, since we
// have no SIGKILL at this layer).

const CRON_HOOKS = [
  '/home/tate/ecodiaos/scripts/hooks/brief-consistency-check.sh',
  '/home/tate/ecodiaos/scripts/hooks/cred-mention-surface.sh',
]

async function _runHooksForCronBrief(brief, cronName) {
  // Synthesize the PreToolUse-shaped payload the hooks expect from stdin.
  // tool_name='cron_fork_spawn' maps to kind='cron_fire' in emit-telemetry.sh
  // derive_kind_from_tool(). actor='cron' lets dispatchEventConsumer derive
  // the correct actor rather than defaulting to 'main'.
  const payload = JSON.stringify({
    tool_name: 'cron_fork_spawn',
    tool_input: { brief },
    actor: 'cron',
    cron_name: cronName,
  })

  for (const hookPath of CRON_HOOKS) {
    if (!fs.existsSync(hookPath)) {
      logger.debug('cronForkDispatcher: cron hook not found, skipping', { hookPath, cron: cronName })
      continue
    }
    try {
      const { stderr } = await execFileAsync(
        '/usr/bin/env',
        ['bash', hookPath],
        {
          input: payload,
          timeout: 8000,
          encoding: 'utf8',
          // Allow hook to resolve $(dirname "$0") correctly by running from
          // the hooks directory.
          cwd: '/home/tate/ecodiaos/scripts/hooks',
        }
      )
      // Hooks write [BRIEF-CHECK WARN] / [CONTEXT-SURFACE WARN] /
      // [CRED-SURFACE WARN] lines to stderr. Surface them to the server log
      // so they remain visible even without a model turn to receive them.
      if (stderr) {
        const warnLines = stderr
          .split('\n')
          .filter(l =>
            l.includes('[BRIEF-CHECK') ||
            l.includes('[CONTEXT-SURFACE') ||
            l.includes('[CRED-SURFACE')
          )
        if (warnLines.length > 0) {
          logger.info('cronForkDispatcher: cron hook surfaced warnings', {
            cron: cronName,
            hook: hookPath.split('/').pop(),
            warns: warnLines,
          })
        }
      }
    } catch (err) {
      // Hook timeout or non-zero exit is non-fatal. SIGKILL on timeout still
      // produces the start-of-hook perf row (see brief-consistency-check.sh
      // Layer 6 reliability fix), so telemetry is not fully lost.
      logger.debug('cronForkDispatcher: cron hook runner error (non-fatal)', {
        hook: hookPath.split('/').pop(),
        cron: cronName,
        error: err.message,
        code: err.code,
      })
    }
  }
}

// Estimate token cost for a cron-spawned fork. Brief size is the largest
// variable; handler overhead is roughly fixed.
//
//   brief_chars / 3.5  ≈ tokens to read the brief once
//   + 2_000            ≈ MCP tool calls + assistant intermediate reasoning
//   + 1_000            ≈ system prompt + framing overhead
//
// Total estimate is conservative on purpose - we'd rather throttle early than
// blow the daily budget mid-day.
function estimateForkTokenCost(brief) {
  const briefChars = (brief || '').length
  return Math.ceil(briefChars / 3.5) + 2_000 + 1_000
}

// ── Budget read/write ────────────────────────────────────────────────────────
// kv_store.value is TEXT - JSON.stringify ourselves (mirrors osAlertingService).

const BUDGET_KEY = 'cowork.daily_fork_budget_remaining'
const BUDGET_MAX_KEY = 'cowork.daily_fork_budget_max'

// ── Anti-flood gate: account-chain exhaustion ────────────────────────────────
//
// When 3+ cron-dispatched forks fail with credit-signal errors in a 10-minute
// sliding window, LOW_PRIORITY_FORK dispatch is suppressed until the earliest
// per-account reset time. HIGH_PRIORITY, CONDUCTOR, and DIRECT_EXEC routes
// are never affected - only the automatic LOW_PRIORITY spawn cycle is paused.
//
// State durability: kv_store key 'cron_fork_dispatcher.flood_pause_until'
// persists across PM2 restarts so a restart mid-pause doesn't reset the gate.
// Skip telemetry lands in kv_store key 'forks.skip_log' (ring buffer, max 50).
//
// Spec: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md

const ANTI_FLOOD_KV_KEY = 'cron_fork_dispatcher.flood_pause_until'
const ANTI_FLOOD_SKIP_LOG_KEY = 'forks.skip_log'
const ANTI_FLOOD_WINDOW_MS = 10 * 60 * 1000          // 10-minute sliding window
const ANTI_FLOOD_ERROR_THRESHOLD = 3                   // N consecutive errors threshold
const ANTI_FLOOD_DEFAULT_PAUSE_MS = 60 * 60 * 1000   // 60-min fallback if reset time not parseable

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
  // Read-modify-write. Race conditions are tolerable here - at worst the
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

// ── kv_store flag for budget-exhausted defer ───────────────────────────────
//
// Per fork fork_mouk37gd_056cc1 (2026-05-06): replaced the status_board INSERT
// with a kv_store flag write. Each cron has ONE rotating kv_store key
// `cron.budget_skip.<cron_name>` (rather than N status_board rows over time)
// that records the latest skip + a same-day count. This keeps status_board
// clean while still preserving the telemetry for drift-audit / observability.
// Budget-recovery surfaces via successful spawns (logger.info on dispatch),
// not status_board archives.

async function _writeBudgetSkipFlag(cronName, gate) {
  try {
    const key = `cron.budget_skip.${cronName}`
    const nowIso = new Date().toISOString()
    const today = nowIso.slice(0, 10) // YYYY-MM-DD
    let countToday = 1
    try {
      const rows = await db`SELECT value FROM kv_store WHERE key = ${key}`
      if (rows.length > 0) {
        const raw = rows[0].value
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (parsed?.day === today && Number.isFinite(Number(parsed?.count_today))) {
          countToday = Number(parsed.count_today) + 1
        }
      }
    } catch {
      // fall through with countToday = 1
    }
    const payload = JSON.stringify({
      cron: cronName,
      skipped_at: nowIso,
      day: today,
      tier: gate.tier,
      reason: gate.reason,
      count_today: countToday,
    })
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${key}, ${payload})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('cronForkDispatcher: failed to write budget-skip kv_store flag', { cron: cronName, error: err.message })
  }
}

// ── Anti-flood gate helpers ──────────────────────────────────────────────────

/**
 * Read flood_pause_until from kv_store.
 * Returns ISO UTC string or null. Fail-open on DB error.
 */
async function _readFloodPauseUntil() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${ANTI_FLOOD_KV_KEY}`
    if (rows.length === 0) return null
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed?.until || (typeof parsed === 'string' ? parsed : null)
  } catch (err) {
    logger.debug('cronForkDispatcher: _readFloodPauseUntil failed (non-fatal)', { error: err.message })
    return null
  }
}

/**
 * Write flood_pause_until to kv_store.
 */
async function _writeFloodPauseUntil(untilIso) {
  try {
    const payload = JSON.stringify({ until: untilIso, set_at: new Date().toISOString() })
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${ANTI_FLOOD_KV_KEY}, ${payload})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('cronForkDispatcher: _writeFloodPauseUntil failed', { error: err.message })
  }
}

/**
 * Clear the flood pause (expiry or manual release).
 */
async function _clearFloodPauseUntil() {
  try {
    await db`DELETE FROM kv_store WHERE key = ${ANTI_FLOOD_KV_KEY}`
    logger.info('cronForkDispatcher: anti-flood gate RELEASED - LOW_PRIORITY dispatch resuming')
  } catch (err) {
    logger.warn('cronForkDispatcher: _clearFloodPauseUntil failed (non-fatal)', { error: err.message })
  }
}

/**
 * Parse a reset time like "resets 11am (UTC)" or "resets 2:30pm (UTC)" from
 * an abort_reason string. Returns ISO UTC string or null if not parseable.
 * Used as fallback when os_forks.credit_reset_at is NULL.
 */
function _parseResetTimeFromAbortReason(text) {
  if (!text) return null
  // Matches: "resets 11am (UTC)", "resets 2:30pm (UTC)", "resets 9:00 AM UTC"
  const match = String(text).match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(UTC\)|UTC)/i)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const mins = match[2] ? parseInt(match[2], 10) : 0
  const ampm = match[3] ? match[3].toLowerCase() : null
  if (ampm === 'pm' && hours < 12) hours += 12
  else if (ampm === 'am' && hours === 12) hours = 0
  const now = new Date()
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    hours, mins, 0
  ))
  // If the time already passed today, use tomorrow
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }
  return candidate.toISOString()
}

/**
 * Query recent credit-exhaustion fork errors within the sliding window.
 * Uses os_forks.credit_reset_at when available (accurate), falls back to
 * parsing abort_reason text.
 *
 * Returns { exhausted: boolean, count: number, minResetIso: string|null }
 * Fail-open on DB error (returns exhausted=false so dispatch is not blocked).
 */
async function _checkChainExhaustionState() {
  try {
    const windowStart = new Date(Date.now() - ANTI_FLOOD_WINDOW_MS)
    const rows = await db`
      SELECT abort_reason, ended_at, credit_reset_at, failure_class
      FROM os_forks
      WHERE status = 'error'
        AND ended_at > ${windowStart}
        AND (
          (abort_reason IS NOT NULL AND abort_reason ~* 'out of.*(extra )?usage|weekly cap|session cap')
          OR failure_class = 'account_chain_exhausted'
          OR credit_reset_at IS NOT NULL
        )
      ORDER BY ended_at DESC
      LIMIT 5
    `

    if (rows.length < ANTI_FLOOD_ERROR_THRESHOLD) {
      return { exhausted: false, count: rows.length, minResetIso: null }
    }

    // Compute min reset time: prefer credit_reset_at column (parsed by forkService),
    // fall back to parsing abort_reason text.
    const resetTimes = rows
      .map(r => r.credit_reset_at
        ? new Date(r.credit_reset_at).toISOString()
        : _parseResetTimeFromAbortReason(r.abort_reason))
      .filter(Boolean)

    const minResetIso = resetTimes.length > 0
      ? resetTimes.reduce((min, t) => (t < min ? t : min), resetTimes[0])
      : new Date(Date.now() + ANTI_FLOOD_DEFAULT_PAUSE_MS).toISOString()

    return { exhausted: true, count: rows.length, minResetIso }
  } catch (err) {
    logger.debug('cronForkDispatcher: _checkChainExhaustionState failed (fail-open)', { error: err.message })
    return { exhausted: false, count: 0, minResetIso: null }
  }
}

/**
 * Append one entry to the skip-log ring buffer in kv_store (max 50 entries).
 * Best-effort, fire-and-forget. Must never throw to callers.
 */
async function _writeAntiFloodSkipLog(cronName, pauseUntilIso) {
  try {
    const MAX_ENTRIES = 50
    let existing = []
    try {
      const rows = await db`SELECT value FROM kv_store WHERE key = ${ANTI_FLOOD_SKIP_LOG_KEY}`
      if (rows.length > 0) {
        const raw = rows[0].value
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        existing = Array.isArray(parsed) ? parsed : []
      }
    } catch { /* start fresh ring */ }

    const entry = {
      cron: cronName,
      skipped_at: new Date().toISOString(),
      reason: 'anti_flood_pause',
      pause_until: pauseUntilIso,
    }
    const updated = [...existing.slice(-(MAX_ENTRIES - 1)), entry]
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${ANTI_FLOOD_SKIP_LOG_KEY}, ${JSON.stringify(updated)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.debug('cronForkDispatcher: _writeAntiFloodSkipLog failed (non-fatal)', { error: err.message })
  }
}

/**
 * Top-level gate check: is LOW_PRIORITY dispatch currently suppressed?
 *
 * Algorithm:
 *   1. Read kv_store for an existing pause (survives PM2 restarts).
 *   2. If present and still in the future: paused.
 *   3. If present but expired: clear it, fall through to live check.
 *   4. Live check: query os_forks for 3+ credit-exhaustion errors in window.
 *   5. If threshold met: write pause to kv_store, return paused=true.
 *
 * Returns { paused: boolean, pauseUntilIso: string|null }
 */
async function _isAntiFloodPaused() {
  // Step 1-3: check kv_store
  const storedUntil = await _readFloodPauseUntil()
  if (storedUntil) {
    if (Date.now() < new Date(storedUntil).getTime()) {
      return { paused: true, pauseUntilIso: storedUntil }
    }
    // Expired - clear and fall through to live check
    await _clearFloodPauseUntil()
  }

  // Step 4: live check against recent fork errors
  const { exhausted, count, minResetIso } = await _checkChainExhaustionState()
  if (!exhausted) {
    return { paused: false, pauseUntilIso: null }
  }

  // Step 5: engage the gate
  logger.info('cronForkDispatcher: anti-flood gate ENGAGED - account chain exhausted', {
    error_count: count,
    window_minutes: ANTI_FLOOD_WINDOW_MS / 60000,
    threshold: ANTI_FLOOD_ERROR_THRESHOLD,
    pause_until: minResetIso,
  })
  await _writeFloodPauseUntil(minResetIso)
  return { paused: true, pauseUntilIso: minResetIso }
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

  // Conductor + direct_exec routes are NOT our concern - caller should keep
  // them on the existing os-session POST path. Returning shouldHandle=false
  // is the contract that tells the caller to skip our path.
  if (route === 'conductor' || route === 'direct_exec') {
    return {
      spawned: false,
      route,
      fork_id: null,
      reason: 'route_handled_by_caller_not_dispatcher',
      budget_remaining: await _readBudget(),
      estimated_cost: 0,
      shouldHandle: false,
    }
  }

  const cost = estimateForkTokenCost(cronTask.prompt)
  const budgetRemaining = await _readBudget()
  const budgetMax = await _readBudgetMax()

  // ── Anti-flood gate (account-chain exhaustion) ──────────────────────────────
  // Suppress LOW_PRIORITY forks when 3+ cron forks have failed with credit-
  // exhaustion signals in the last 10 minutes. HIGH_PRIORITY, CONDUCTOR, and
  // DIRECT_EXEC routes are never suppressed - only the automatic LOW_PRIORITY
  // spawn cycle is paused until the earliest per-account reset time.
  // Spec: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md
  if (route === 'low_priority_fork') {
    const antiFlood = await _isAntiFloodPaused()
    if (antiFlood.paused) {
      // Best-effort skip log - fire-and-forget, never blocks dispatch path
      _writeAntiFloodSkipLog(cronTask.name, antiFlood.pauseUntilIso).catch(err => logger.debug('bg task error', { err: err.message }))
      logger.info('cronForkDispatcher: LOW_PRIORITY cron suppressed (anti-flood gate)', {
        cron: cronTask.name,
        pause_until: antiFlood.pauseUntilIso,
      })
      return {
        spawned: false,
        route,
        fork_id: null,
        reason: 'anti_flood_pause',
        budget_remaining: budgetRemaining,
        estimated_cost: cost,
        shouldHandle: true,
      }
    }
  }

  const gate = budgetGateDecision({
    classification: route,
    budgetRemaining,
    budgetMax,
  })

  if (!gate.allow) {
    await _writeBudgetSkipFlag(cronTask.name, gate)
    logger.info('cronForkDispatcher: cron deferred by budget gate', {
      cron: cronTask.name,
      route,
      tier: gate.tier,
      reason: gate.reason,
      budget_remaining: budgetRemaining,
    })
    return {
      spawned: false,
      route,
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

  // Run Phase D surfacing hooks against the cron brief before spawning.
  // This is the cron-substrate equivalent of the SDK harness PreToolUse hooks
  // that fire when the conductor calls mcp__forks__spawn_fork. Emits telemetry
  // with kind='cron_fire' + logs any [BRIEF-CHECK WARN] / [CONTEXT-SURFACE WARN]
  // / [CRED-SURFACE WARN] lines the hooks produce. Fire-and-forget: hook errors
  // never block spawn. Doctrine: ~/ecodiaos/patterns/surfacing-hooks-must-cover-every-fork-spawn-substrate.md
  await _runHooksForCronBrief(cronTask.prompt, cronTask.name).catch(err => {
    logger.debug('cronForkDispatcher: _runHooksForCronBrief top-level error (non-fatal)', {
      cron: cronTask.name,
      error: err.message,
    })
  })

  // H1-A (Phase E Layer 6): bracket spawn with wall-clock timing so we can
  // emit a perf event covering the cron dispatch path (which bypasses the
  // Claude Code PreToolUse hooks that instrument conductor-dispatched forks).
  const spawnStart = Date.now()
  let forkSnapshot
  try {
    // is_cron: true marks the os_forks row so its [FORK_REPORT] routes to
    // passive substrate (forks_rollup + perceptionBus + status_board) but
    // never enqueues into messageQueue and never wakes the conductor via
    // the forkComplete listener. The conductor sees outcomes on the next
    // natural turn (meta-loop, Tate-typed message, stale-heartbeat alert).
    // Tate verbatim 7 May 2026 09:15 AEST: "it should jsut be handled by a
    // fork that you can ignore unless needed."
    // Doctrine: ~/ecodiaos/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md
    // Migration: 088_os_forks_is_cron.sql
    forkSnapshot = await forkService.spawnFork({
      brief: cronTask.prompt,
      context_mode: 'brief',
      is_cron: true,
    })
  } catch (err) {
    // Emit perf row for the failed spawn (H1-A: cron path coverage).
    _emitCronForkPerfEvent({
      primitiveName: 'cron:fork_spawn',
      durationMs: Date.now() - spawnStart,
      status: 'error',
      payloadSizeBytes: (cronTask.prompt || '').length,
      metadata: {
        fork_id: null,
        cron_name: cronTask.name,
        route,
        estimated_cost: cost,
        error: err.message ? err.message.slice(0, 200) : 'unknown',
      },
    })
    // Refund - spawn never happened.
    await _refundBudget(cost)
    logger.warn('cronForkDispatcher: spawnFork failed', {
      cron: cronTask.name,
      error: err.message,
      code: err.code,
    })
    return {
      spawned: false,
      route,
      fork_id: null,
      reason: err.code || `spawn_error: ${err.message}`,
      budget_remaining: await _readBudget(),
      estimated_cost: cost,
      shouldHandle: true,
    }
  }

  const forkId = forkSnapshot?.fork_id

  // H1-A (Phase E Layer 6): emit perf row for successful cron fork spawn.
  // This is the counterpart to the hook:brief-consistency-check perf rows
  // emitted for conductor-dispatched forks. primitive_name='cron:fork_spawn'
  // so the consumer can filter cron vs conductor dispatches independently.
  _emitCronForkPerfEvent({
    primitiveName: 'cron:fork_spawn',
    durationMs: Date.now() - spawnStart,
    status: 'ok',
    payloadSizeBytes: (cronTask.prompt || '').length,
    metadata: {
      fork_id: forkId,
      cron_name: cronTask.name,
      route,
      estimated_cost: cost,
    },
  })

  if (forkId) {
    await _stampForkIdOnCron(cronTask.id, forkId)
  }

  logger.info('cronForkDispatcher: cron dispatched as fork', {
    cron: cronTask.name,
    fork_id: forkId,
    route,
    estimated_cost: cost,
    budget_remaining: budgetRemaining - cost,
    tier: gate.tier,
  })

  return {
    spawned: true,
    route,
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
  // anti-flood gate (exposed for tests)
  _isAntiFloodPaused,
  _checkChainExhaustionState,
  _readFloodPauseUntil,
  _clearFloodPauseUntil,
  _parseResetTimeFromAbortReason,
}

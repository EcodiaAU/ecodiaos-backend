/**
 * Scheduler Poller - persistent, runs inside ecodia-api 24/7.
 *
 * The scheduler MCP server exposes tools for CREATING tasks, but its polling
 * loop only runs during active Claude Code sessions (stdio process lifetime).
 * This service fills that gap: it polls os_scheduled_tasks every 30 seconds
 * regardless of whether any session is active, ensuring crons fire on schedule
 * even while Tate is in Fiji.
 */

const { spawnSync } = require('child_process')
const db = require('../config/db')
const logger = require('../config/logger')
const usageEnergy = require('./usageEnergyService')
const doctrineSurface = require('./skillsSurfaceService')
const cronForkDispatcher = require('./cronForkDispatcher')
const { classifyCron, DIRECT_EXEC_COMMANDS } = require('../config/cronPriority')

const POLL_INTERVAL_MS = 30_000
const TZ_OFFSET_HOURS = 10 // AEST (UTC+10, no DST)
const API_PORT = process.env.PORT || 3001

// ESSENTIAL_CRON_NAMES removed 5 May 2026 (fork_mos3hwpk_9fbdc5) along with
// the critical-energy pre-gate. Trust /api/os-session/message queue downstream
// per ~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md.

let _timeout = null
let _running = false
let _stopped = false

// ── Schedule parsing (mirrors mcp-servers/scheduler/index.js) ──

function computeNextRun(cronExpr) {
  const everyMatch = cronExpr.match(/^every\s+(\d+)(m|h)$/i)
  if (everyMatch) {
    const val = parseInt(everyMatch[1])
    const unit = everyMatch[2].toLowerCase()
    const ms = unit === 'm' ? val * 60_000 : val * 3_600_000
    return new Date(Date.now() + ms)
  }
  const dailyMatch = cronExpr.match(/^daily\s+(\d{1,2}):(\d{2})$/i)
  if (dailyMatch) {
    let utcHour = parseInt(dailyMatch[1]) - TZ_OFFSET_HOURS
    if (utcHour < 0) utcHour += 24
    const minute = parseInt(dailyMatch[2])
    const next = new Date()
    next.setUTCHours(utcHour, minute, 0, 0)
    if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  return null
}

// ── Check if OS session is currently streaming ──

async function isSessionBusy() {
  // Prefer in-process atomic check to avoid the HTTP-then-fire race.
  try {
    const osSession = require('./osSessionService')
    if (typeof osSession._isQueueBusy === 'function' && osSession._isQueueBusy()) {
      return true
    }
  } catch {}
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/os-session/status`, {
      signal: AbortSignal.timeout(5_000),
    })
    const body = await res.json().catch(() => ({}))
    return body.active === true || body.status === 'streaming'
  } catch {
    return false
  }
}

// ── Direct-exec handler (no fork, no credits consumed) ──────────────────────
//
// For DIRECT_EXEC_CRONS: run the shell command synchronously via spawnSync,
// parse the `tick complete: {...}` JSON line from stdout, update the task
// timestamps, and upsert a status_board P2 row on failure.
//
// This path is taken INSTEAD of the fork-dispatch path. It never touches
// /api/os-session/message or forkService. The whole point is that it runs
// when all Claude Max accounts are exhausted — no fork = no credits burned.
//
// Failure modes handled:
//   - spawnSync error (ENOENT, ETIMEDOUT, SIGKILL on 120s timeout)
//   - non-zero exit code from the consumer script
//   - ok=false in the parsed tick JSON
//   - lineErrors > 0 in the parsed tick JSON
//
// Success (including processed:0 / empty JSONL) logs at info and auto-archives
// any open status_board error row from a previous failure.
//
// Origin: fork_mp28xkeh_b611b0, 12 May 2026. Precedent: commit 773697d
// (daily-index-regen moved to direct node-script execution for same reason).
// Pattern: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md

async function _fireDirectExecTask(task, cmd) {
  const startMs = Date.now()
  logger.info('Scheduler: firing direct-exec cron', { name: task.name, cmd })

  const spawnResult = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024, // 1MB cap on stdout+stderr
  })

  const stdout = spawnResult.stdout || ''
  const stderr = spawnResult.stderr || ''
  const exitCode = spawnResult.status
  const elapsed = Date.now() - startMs

  // Parse `tick complete: {...}` JSON from stdout.
  // Both consumers emit one of:
  //   "[consumer] tick complete: {...}"
  //   "[perf-consumer] tick complete: {...}"
  let tickData = null
  const tickMatch = stdout.match(/tick complete:\s*(\{.+\})/m)
  if (tickMatch) {
    try { tickData = JSON.parse(tickMatch[1]) } catch (_) { /* unparseable - treated as error below */ }
  }

  const hasError = Boolean(
    spawnResult.error ||                             // spawn-level error (timeout/ENOENT)
    exitCode !== 0 ||                                // non-zero exit
    (tickData && tickData.ok === false) ||           // ok:false in output
    (tickData && (tickData.lineErrors || 0) > 0),   // lineErrors > 0
  )

  const summaryForResult = JSON.stringify({
    direct_exec: true,
    exit_code: exitCode,
    elapsed_ms: elapsed,
    tick: tickData,
    spawn_error: spawnResult.error ? spawnResult.error.message : null,
  }).slice(0, 500)

  // Update task row (last_run_at, next_run_at, run_count, result).
  const now = new Date()
  const nextRun = computeNextRun(task.cron_expression)
  await db`
    UPDATE os_scheduled_tasks
    SET last_run_at = ${now}, next_run_at = ${nextRun},
        run_count = run_count + 1, result = ${summaryForResult}
    WHERE id = ${task.id}
  `

  if (hasError) {
    const contextParts = []
    if (spawnResult.error) contextParts.push(`spawn_error: ${spawnResult.error.message}`)
    if (exitCode !== 0)    contextParts.push(`exit_code: ${exitCode}`)
    if (tickData?.ok === false) contextParts.push(`ok:false ${tickData.error || ''}`.trim())
    if ((tickData?.lineErrors || 0) > 0) contextParts.push(`lineErrors: ${tickData.lineErrors}`)
    if (stderr)            contextParts.push(`stderr: ${stderr.slice(0, 400)}`)
    const context = contextParts.join('\n')
    const entityRef = `direct-exec-${task.name}`

    // Upsert: update existing open row if present, otherwise insert.
    const existing = await db`
      SELECT id FROM status_board
      WHERE entity_ref = ${entityRef} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length > 0) {
      await db`
        UPDATE status_board
        SET status        = 'error',
            context       = ${context},
            last_touched  = ${now},
            priority      = 2,
            next_action   = ${'Investigate direct-exec failure for ' + task.name},
            next_action_by = 'ecodiaos'
        WHERE id = ${existing[0].id}
      `
    } else {
      await db`
        INSERT INTO status_board
          (entity_type, entity_ref, name, status, next_action, next_action_by, priority, context, last_touched)
        VALUES (
          'infrastructure',
          ${entityRef},
          ${'Direct-exec cron failure: ' + task.name},
          'error',
          ${'Investigate and fix - consumer exited with errors'},
          'ecodiaos',
          2,
          ${context},
          ${now}
        )
      `
    }

    logger.warn('Scheduler: direct-exec cron failed', {
      name: task.name, exit_code: exitCode, elapsed_ms: elapsed,
      tick: tickData, stderr: stderr.slice(0, 200),
    })
  } else {
    // Success — auto-archive any open error row from a prior failure.
    await db`
      UPDATE status_board
      SET archived_at = ${now}
      WHERE entity_ref = ${'direct-exec-' + task.name} AND archived_at IS NULL
    `.catch(err => logger.debug('bg task error', { err: err.message }))

    logger.info('Scheduler: direct-exec cron succeeded', {
      name: task.name, exit_code: exitCode, elapsed_ms: elapsed,
      processed: tickData?.processed ?? 0,
    })
  }
}

// ── Fire a single task ──

// Decide whether to route a cron task to the conductor (POST to os-session) or
// to spawn it as an ephemeral fork via cronForkDispatcher. Returns the task
// result for run_count / result-stamp purposes downstream.
//
// Decision 3993 commit 3/3: forks-as-primitive routing.
// Decision 4 May 2026 ("Crons route to forks by default, NEVER main chat"):
//   conductor          → POST to /api/os-session/message (RESERVED: meta-loop only,
//                         the conductor's CEO judgment cycle which IS main chat).
//   direct_exec        → spawnSync shell command directly in-process.
//                         Re-activated 12 May 2026 (fork_mp28xkeh_b611b0) for
//                         telemetry-dispatch-consumer + telemetry-perf-consumer.
//                         These are deterministic JSONL→Postgres rotation scripts;
//                         routing through forks caused credit-exhaustion floods
//                         every 15m when all Max accounts were exhausted.
//                         Handled by _fireDirectExecTask() BEFORE this check.
//                         Pattern: cron-fork-anti-flood-on-account-chain-exhaustion.md
//   high_priority_fork → spawn fork (always, budget bypass).
//   low_priority_fork  → spawn fork (skipped if budget < 25%).
//
// Delayed (one-shot) tasks always go via the os-session POST path - they
// don't carry a classification yet and the convention is to handle them in
// the conductor for Tate-typed scheduling. (Tate-typed delayed tasks ARE
// chat-relevant by definition: he asked for a thing to happen at a time.)
//
// Verification post-deploy: probe os_forks for new rows correlated with each
// fork-routed cron's last_run_at; probe /api/os-session/messages for absence
// of [SCHEDULED:] prompts in the cron-fire window. Doctrine:
// ~/ecodiaos/patterns/crons-route-to-forks-by-default.md.
async function _shouldDispatchAsFork(task) {
  if (task.type !== 'cron') return false
  const route = classifyCron(task.name)
  return route === 'high_priority_fork' || route === 'low_priority_fork'
}

async function fireTask(task) {
  // No pre-gate. Trust /api/os-session/message with source:'scheduler' to queue
  // behind in-flight turns or initialise an idle session. See
  // patterns/scheduler-no-pregate-trust-os-message-queue.md.
  try {
    // ── Direct-exec route: deterministic shell scripts, zero fork/credit cost ──
    // Checked BEFORE the fork-dispatch path. DIRECT_EXEC_CRONS bypass the fork
    // system entirely — spawnSync runs the command in-process. This means they
    // fire correctly even when all Claude Max accounts are exhausted.
    // See src/config/cronPriority.js DIRECT_EXEC_CRONS + DIRECT_EXEC_COMMANDS.
    // Pattern: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md
    if (task.type === 'cron' && classifyCron(task.name) === 'direct_exec') {
      const cmd = DIRECT_EXEC_COMMANDS.get(task.name)
      if (cmd) {
        await _fireDirectExecTask(task, cmd)
        return
      }
      // Safety valve: if a task is in DIRECT_EXEC_CRONS but has no command
      // mapped, log a warning and fall through to fork dispatch rather than
      // silently doing nothing.
      logger.warn('Scheduler: direct_exec cron has no command in DIRECT_EXEC_COMMANDS — falling through to fork', {
        name: task.name,
      })
    }

    // Decision 3993: route fork-eligible crons through cronForkDispatcher
    // rather than POSTing into the conductor's message queue. See
    // src/config/cronPriority.js for the classification table.
    if (await _shouldDispatchAsFork(task)) {
      const dispatchResult = await cronForkDispatcher.dispatchCronAsFork(task)
      const now = new Date()
      const nextRun = computeNextRun(task.cron_expression)
      const stampedResult = JSON.stringify({
        dispatched_as_fork: true,
        spawned: dispatchResult.spawned,
        fork_id: dispatchResult.fork_id,
        route: dispatchResult.route,
        reason: dispatchResult.reason,
        budget_remaining: dispatchResult.budget_remaining,
      }).slice(0, 500)
      await db`
        UPDATE os_scheduled_tasks
        SET last_run_at = ${now}, next_run_at = ${nextRun},
            run_count = run_count + 1, result = ${stampedResult}
        WHERE id = ${task.id}
      `
      logger.info('Scheduler fired task (fork-route)', {
        name: task.name,
        type: task.type,
        spawned: dispatchResult.spawned,
        fork_id: dispatchResult.fork_id,
        reason: dispatchResult.reason,
      })
      return
    }

    // Doctrine surface: keyword-grep ~/ecodiaos/{patterns,clients,docs/secrets}
    // for files whose triggers: frontmatter matches tokens in this prompt, and
    // prepend a <doctrine_surface> block so the conductor sees relevant durable
    // doctrine before acting. Fail-open: any error here is logged and the
    // un-surfaced prompt is sent. See drafts/context-surface-injection-points-
    // recon-2026-04-29.md and patterns/decision-quality-self-optimization-
    // architecture.md (Layer 1 expansion to cron-fire ingress).
    let surfaceBlock = null
    let surfaceMatches = []
    try {
      surfaceBlock = doctrineSurface.surfaceDoctrineBlock(task.prompt)
      surfaceMatches = doctrineSurface.matchedFiles(task.prompt)
    } catch (err) {
      logger.warn('Scheduler: doctrine surface failed (skipping)', { name: task.name, error: err.message })
    }
    const prompt = surfaceBlock
      ? `[SCHEDULED: ${task.name}]\n\n${surfaceBlock}\n\n${task.prompt}`
      : `[SCHEDULED: ${task.name}] ${task.prompt}`
    if (surfaceMatches.length > 0) {
      logger.info('Scheduler: doctrine surfaces injected for cron prompt', {
        name: task.name,
        source: 'cron-fire',
        surfaces: surfaceMatches.map(s => s.base),
      })
    }
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/os-session/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, source: 'scheduler' }),
      signal: AbortSignal.timeout(1_800_000), // 30 min
    })
    const result = await res.json().catch(() => ({}))

    const now = new Date()
    if (task.type === 'cron') {
      const nextRun = computeNextRun(task.cron_expression)
      await db`
        UPDATE os_scheduled_tasks
        SET last_run_at = ${now}, next_run_at = ${nextRun},
            run_count = run_count + 1, result = ${JSON.stringify(result).slice(0, 500)}
        WHERE id = ${task.id}
      `
    } else {
      await db`
        UPDATE os_scheduled_tasks
        SET last_run_at = ${now}, run_count = run_count + 1,
            status = 'completed', result = ${JSON.stringify(result).slice(0, 500)}
        WHERE id = ${task.id}
      `
      // Fire any chained tasks
      const chained = await db`
        SELECT * FROM os_scheduled_tasks
        WHERE chain_after = ${task.id} AND status = 'active'
      `
      for (const c of chained) await fireTask(c)
    }

    logger.info('Scheduler fired task', { name: task.name, type: task.type })
  } catch (err) {
    logger.warn('Scheduler failed to fire task', { name: task.name, error: err.message })
    // Reschedule cron to next interval so it doesn't stack
    if (task.type === 'cron') {
      const nextRun = computeNextRun(task.cron_expression)
      if (nextRun) {
        await db`UPDATE os_scheduled_tasks SET next_run_at = ${nextRun}, result = ${err.message} WHERE id = ${task.id}`
          .catch(err => logger.debug('bg task error', { err: err.message }))
      }
    }
  }
}

// ── Poll cycle ──

async function pollOnce() {
  if (_running) return // don't stack if previous poll is slow
  _running = true
  try {
    const now = new Date()
    const due = await db`
      SELECT * FROM os_scheduled_tasks
      WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ${now}
      ORDER BY next_run_at
    `
    if (due.length === 0) return

    // No pre-gate. Trust /api/os-session/message with source:'scheduler' to queue
    // behind in-flight turns or initialise an idle session. See
    // patterns/scheduler-no-pregate-trust-os-message-queue.md.
    //
    // Energy-aware gating REMOVED 5 May 2026 (fork_mos3hwpk_9fbdc5) per Tate
    // verbatim 13:52 AEST: "you're scheduling taskss needs to be 100% reliable".
    // Previously, `level === 'critical'` deferred all non-essential CRONS by 1h
    // and silently dropped DELAYED tasks (the loop returned without rescheduling
    // them - they'd stay overdue forever, never firing). With both Claude Max
    // accounts at 100% used today this branch fired every poll, blocking all
    // 6 cascade tasks (codify-no-bedrock, chambers-cascade-F6/F7/F8/final-sweep,
    // chambers-fork-resume).
    //
    // Pay-as-you-go gate NARROWED to crons only. Delayed tasks are explicit
    // conductor-typed or Tate-typed work (one-shot, scheduled with intent).
    // They MUST fire even on DeepSeek. Crons can stay halted under
    // pay-as-you-go because they're recurring and the next cycle resumes once
    // we're back on Claude Max. Bedrock removed Tate 5 May 2026 12:40 AEST per
    // ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
    let isPayAsYouGoProvider = false
    try {
      const energy = await usageEnergy.getEnergy()
      isPayAsYouGoProvider = !!energy?.isDeepseekFallback
    } catch {}

    // Pay-as-you-go gate: halt CRONS only, never delayed tasks. Crons are
    // recurring (next cycle picks up once we're back on Claude Max). Delayed
    // tasks are explicit conductor/Tate-typed work - they MUST fire.
    let dueToFire = due
    if (isPayAsYouGoProvider) {
      const cronTasks = due.filter(t => t.type === 'cron')
      const delayedTasks = due.filter(t => t.type !== 'cron')
      if (cronTasks.length > 0) {
        // Defer crons +5min to avoid log/poll stacking.
        for (const t of cronTasks) {
          const deferred = new Date(Date.now() + 5 * 60 * 1000)
          await db`UPDATE os_scheduled_tasks SET next_run_at = ${deferred} WHERE id = ${t.id}`
            .catch(err => logger.debug('bg task error', { err: err.message }))
        }
        logger.info('Scheduler: pay-as-you-go provider, halting crons +5min; delayed tasks still fire', {
          halted_crons: cronTasks.length,
          firing_delayed: delayedTasks.length,
          provider: 'deepseek',
          gate_tripped: 'pay_as_you_go_crons_only',
        })
      }
      if (delayedTasks.length === 0) return
      dueToFire = delayedTasks
    }

    // Fire up to MAX_PER_TICK tasks per cycle to prevent queue starvation when
    // many crons come due simultaneously. The previous behaviour fired only
    // due[0] and requeued the rest by +60s, which under sustained backlog
    // (e.g. ecodia-api restart with 8+ overdue crons) meant only one cron
    // fired per minute and the queue grew faster than it drained. Beyond
    // MAX_PER_TICK we still requeue to avoid flooding /api/os-session/message
    // in a single tick. /message returns immediately after enqueueing
    // (osSession.js line 71), so each fireTask is a fast HTTP roundtrip; the
    // OS-session message queue serialises actual model turns downstream.
    const MAX_PER_TICK = 5
    const toFire = dueToFire.slice(0, MAX_PER_TICK)
    const toRequeue = dueToFire.slice(MAX_PER_TICK)

    for (const task of toFire) {
      await fireTask(task)
    }

    for (const t of toRequeue) {
      if (t.type === 'cron') {
        const requeue = new Date(Date.now() + 60_000)
        await db`UPDATE os_scheduled_tasks SET next_run_at = ${requeue} WHERE id = ${t.id}`
          .catch(err => logger.debug('bg task error', { err: err.message }))
        logger.debug('Scheduler: requeued overdue cron for next cycle', { name: t.name, requeueAt: requeue })
      }
    }
  } catch (err) {
    logger.warn('Scheduler poll error', { error: err.message })
  } finally {
    _running = false
  }
}

// Self-scheduling loop - uses energy-adjusted intervals instead of a fixed
// setInterval. When energy is low we stretch the poll cadence via
// scheduleMultiplier (0.75 conserve => 40s, 0.5 low => 60s, 0.25 critical => 120s).
// This way the poller itself burns less quota when quota is scarce.
async function _scheduleNextPoll() {
  if (_stopped) return
  let multiplier = 1.0
  try {
    const energy = await usageEnergy.getEnergy()
    multiplier = energy?.scheduleMultiplier || 1.0
  } catch {}
  const delay = Math.round(POLL_INTERVAL_MS / multiplier)  // lower multiplier = longer delay
  _timeout = setTimeout(async () => {
    try { await pollOnce() } catch (err) { logger.warn('Scheduler: pollOnce crashed', { error: err.message }) }
    _scheduleNextPoll()
  }, delay)
  if (typeof _timeout.unref === 'function') _timeout.unref()
}

// ── Public API ──

function start() {
  if (_timeout) return
  _stopped = false
  // First poll in 5s to catch overdue tasks quickly on boot.
  _timeout = setTimeout(async () => {
    try { await pollOnce() } catch (err) { logger.warn('Scheduler: initial pollOnce crashed', { error: err.message }) }
    _scheduleNextPoll()
  }, 5_000)
  logger.info('Scheduler poller started (energy-adjusted cadence)')
}

function stop() {
  _stopped = true
  if (_timeout) {
    clearTimeout(_timeout)
    _timeout = null
    logger.info('Scheduler poller stopped')
  }
}

module.exports = { start, stop, fireTask }

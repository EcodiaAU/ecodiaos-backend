/**
 * Cowork V2 MCP - checkpoint.* tools (Phase 2 / 09, 15 May 2026).
 *
 * Primitive for multi-hour project chains. Each call schedules the next
 * wake-up via os_scheduled_tasks (a one_shot row); the wake-up Routine
 * reads the chain state from kv_store, executes the action brief, and
 * either calls checkpoint.schedule again (iteration+1) or terminates.
 *
 * Tools:
 *   checkpoint.schedule  - start or extend a chain. Writes os_scheduled_tasks + kv_store.cowork.checkpoint_chains.<chain_id>.
 *   checkpoint.status    - read a chain's state + most recent fires.
 *   checkpoint.list      - all active chains.
 *   checkpoint.stop      - emergency-stop a chain.
 *
 * Safety bounds (see dossier 09.3):
 *   - max_iterations default 20, hard cap 50.
 *   - chain wall_time default 24h, hard cap 7d. Auto-archive on overrun.
 *   - account-cap headroom check elided in v1 (TODO once routine accounting exposed via MCP) - the schedule fires regardless.
 *   - emergency-stop status_board row named 'checkpoint-chain-EMERGENCY-STOP' halts named chain at next read.
 *   - idempotency keyed on {chain_id}-{iteration} written to kv_store.cowork.checkpoint_fires.
 *
 * Spec: C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/09-scheduled-wakeups-for-multihour-work.md
 *
 * Mount: this module is required from cowork.js. It expects the host router
 * to provide `db`, `scope`, `audit`, `withIdempotency`, `_serverError` via
 * the deps object passed to mount().
 */
'use strict'

const { randomUUID } = require('node:crypto')

const HARD_CAP_ITERATIONS = 50
const DEFAULT_MAX_ITERATIONS = 20
const HARD_CAP_WALL_TIME_MS = 7 * 24 * 3600 * 1000
const DEFAULT_WALL_TIME_MS = 24 * 3600 * 1000
const COWORK_NAME_PREFIX = 'cowork.'
const CHAIN_KV_PREFIX = 'cowork.checkpoint_chains.'
const FIRE_KV_PREFIX = 'cowork.checkpoint_fires.'
const ROUTINE_NAME_PREFIX = 'cowork.checkpoint.'

const ALLOWED_ACCOUNTS = new Set(['tate', 'code', 'money'])

function _parseKvValue(v) {
  if (v == null) return null
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

function _parseDelayToDate(input) {
  if (!input) return null
  const s = String(input).trim()
  const m = s.match(/^in\s+(\d+)(m|h|d)$/i)
  if (m) {
    const val = parseInt(m[1], 10)
    const unit = m[2].toLowerCase()
    const ms = unit === 'm' ? val * 60_000 : unit === 'h' ? val * 3_600_000 : val * 86_400_000
    return new Date(Date.now() + ms)
  }
  const isoDur = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (isoDur && (isoDur[1] || isoDur[2] || isoDur[3])) {
    const h = parseInt(isoDur[1] || '0', 10)
    const mm = parseInt(isoDur[2] || '0', 10)
    const ss = parseInt(isoDur[3] || '0', 10)
    return new Date(Date.now() + h * 3_600_000 + mm * 60_000 + ss * 1000)
  }
  const tomorrow = s.match(/^tomorrow\s+(\d{1,2}):(\d{2})$/i)
  if (tomorrow) {
    const next = new Date()
    next.setUTCDate(next.getUTCDate() + 1)
    let utcHour = parseInt(tomorrow[1], 10) - 10
    if (utcHour < 0) utcHour += 24
    next.setUTCHours(utcHour, parseInt(tomorrow[2], 10), 0, 0)
    return next
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  return null
}

function _composeWakePrompt({
  project_id, chain_id, iteration, max_iterations, action_brief,
  cowork_session_id, account, project_name,
}) {
  return [
    `You are EcodiaOS resuming a multi-hour project at checkpoint ${iteration}/${max_iterations}.`,
    '',
    `Project status_board row: ${project_id}`,
    project_name ? `Project name: ${project_name}` : null,
    `Chain id: ${chain_id}`,
    `Account: ${account}`,
    `Cowork session id: ${cowork_session_id || 'phase2-09-checkpoint-chains'}`,
    '',
    'Action brief:',
    action_brief,
    '',
    'Steps:',
    `1. Read kv_store.${CHAIN_KV_PREFIX}${chain_id} for chain state. If status=stopped or status=archived, exit without action and write an Episode noting chain was stopped.`,
    `2. Read the status_board row at ${project_id} for current state.`,
    `3. Read the last 3 Episodes that reference chain_id=${chain_id} for what previous checkpoints accomplished (neo4j.search mode=substring query="${chain_id}").`,
    '4. Check for kill switch: status_board.query filter.name="checkpoint-chain-EMERGENCY-STOP". If a row exists with next_action mentioning this chain_id OR no chain_id (means stop all), terminate now.',
    '5. Write idempotency key kv_store.set { key: "' + FIRE_KV_PREFIX + chain_id + '-' + iteration + '", value: {fired_at: <NOW>, status: "running"} }. If kv_store.get returns an existing record with status in {running,completed}, this is a duplicate fire - exit.',
    '6. Execute the action brief. Bounded to 10 minutes wall time. Use forks if substantial work.',
    '7. Decide next:',
    `   - Project done -> status_board.upsert { id: "${project_id}", status: "archived", next_action: "complete" }, mark kv_store chain status=completed, write Decision node "${chain_id} chain complete after ${iteration} checkpoints", exit.`,
    `   - More work needed AND iteration < max_iterations (${max_iterations}) -> call checkpoint.schedule { project_id, chain_id, iteration: ${iteration + 1}, wake_in: <next-window>, action_brief: <next-brief>, account: "${account}", max_iterations: ${max_iterations} }.`,
    `   - Blocked -> status_board.upsert next_action_by=tate priority=2, write Episode summarising the block, mark kv_store chain status=blocked, exit.`,
    `   - Failed -> write Decision "${chain_id} chain failed at iteration ${iteration}: <reason>", mark kv_store chain status=failed, exit.`,
    `8. Write Episode type=cowork_realisation name="checkpoint ${iteration} of chain ${chain_id}" description=<one-paragraph summary> related_entities=[{label:"Project", name:"${project_name || project_id}", rel_type:"ADVANCED"}].`,
    `9. Update kv_store.${CHAIN_KV_PREFIX}${chain_id} with last_iteration=${iteration}, last_fired_at=<NOW>, last_outcome=<continued|done|blocked|failed>.`,
    '',
    'Constraints:',
    '- Em-dashes BANNED at character level.',
    '- No client-facing comms unless a standing arrangement covers the action.',
    '- Wall time cap 10 minutes. If approaching, defer remaining work to checkpoint+1.',
    '- This is a one-shot Routine. After step 9 the prompt ends. Do not loop within this fire.',
  ].filter(Boolean).join('\n')
}

function _scheduleCreateError(message, code, httpStatus, details) {
  const err = new Error(message)
  err.code = code
  err.httpStatus = httpStatus
  if (details) err.details = details
  return err
}

function mount(router, deps) {
  const { db, scope, audit, withIdempotency, _serverError } = deps

  // ── checkpoint.schedule ───────────────────────────────────────────────
  router.post('/checkpoint.schedule', scope.requireScope('write.scheduler.cron'), async (req, res) => {
    await withIdempotency(req, res, 'checkpoint.schedule', async () => {
      const b = req.body || {}

      if (!b.project_id || typeof b.project_id !== 'string') {
        throw _scheduleCreateError('project_id (string) required', 'missing_field', 422)
      }
      if (!b.wake_in || typeof b.wake_in !== 'string') {
        throw _scheduleCreateError('wake_in required (e.g. "in 30m", "in 2h", ISO datetime)', 'missing_field', 422)
      }
      if (!b.action_brief || typeof b.action_brief !== 'string') {
        throw _scheduleCreateError('action_brief required', 'missing_field', 422)
      }

      const account = b.account || 'code'
      if (!ALLOWED_ACCOUNTS.has(account)) {
        throw _scheduleCreateError(`account must be one of ${Array.from(ALLOWED_ACCOUNTS).join(', ')}`, 'invalid_account', 422)
      }

      const iteration = Math.max(1, parseInt(b.iteration, 10) || 1)
      const maxIterations = Math.min(HARD_CAP_ITERATIONS, Math.max(1, parseInt(b.max_iterations, 10) || DEFAULT_MAX_ITERATIONS))
      if (iteration > maxIterations) {
        throw _scheduleCreateError(`iteration (${iteration}) exceeds max_iterations (${maxIterations})`, 'iteration_exceeds_cap', 409)
      }

      const wakeAt = _parseDelayToDate(b.wake_in)
      if (!wakeAt) {
        throw _scheduleCreateError(`cannot parse wake_in: "${b.wake_in}". Try "in 30m", "in 2h", "tomorrow 09:00", or ISO datetime.`, 'invalid_wake_in', 422)
      }
      if (wakeAt <= new Date()) {
        throw _scheduleCreateError('wake_in resolves to a past timestamp', 'wake_in_in_past', 422, { resolved: wakeAt.toISOString() })
      }

      // Validate project_id exists
      const [project] = await db`SELECT id, name, archived_at FROM status_board WHERE id = ${b.project_id}`
      if (!project) {
        throw _scheduleCreateError(`project_id ${b.project_id} not found in status_board`, 'project_not_found', 404)
      }
      if (project.archived_at) {
        throw _scheduleCreateError(`project ${b.project_id} is already archived`, 'project_archived', 409)
      }

      // Chain state lookup / init
      const chainId = b.chain_id || `chain_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`
      const chainKey = CHAIN_KV_PREFIX + chainId
      const [existing] = await db`SELECT key, value FROM kv_store WHERE key = ${chainKey}`
      const now = new Date()
      let chainStartedAt = now
      let iterationsFired = 0
      let totalWallTimeMsCap = DEFAULT_WALL_TIME_MS
      const existingValue = existing ? _parseKvValue(existing.value) : null
      if (existingValue && typeof existingValue === 'object') {
        const v = existingValue
        if (v.status === 'stopped' || v.status === 'archived' || v.status === 'completed' || v.status === 'failed') {
          throw _scheduleCreateError(`chain ${chainId} is terminal (status=${v.status})`, 'chain_terminal', 409, { chain_status: v.status })
        }
        if (v.started_at) chainStartedAt = new Date(v.started_at)
        iterationsFired = Number.isFinite(v.iterations_fired) ? v.iterations_fired : 0
        if (Number.isFinite(v.total_wall_time_ms_cap)) {
          totalWallTimeMsCap = Math.min(HARD_CAP_WALL_TIME_MS, v.total_wall_time_ms_cap)
        }
      }

      // Wall-time cap check
      const wallTimeMs = wakeAt.getTime() - chainStartedAt.getTime()
      if (wallTimeMs > totalWallTimeMsCap) {
        throw _scheduleCreateError(
          `wake_at would exceed chain wall-time cap (${Math.round(totalWallTimeMsCap / 3600_000)}h from chain start)`,
          'wall_time_cap_exceeded', 409,
          { chain_started_at: chainStartedAt.toISOString(), wake_at: wakeAt.toISOString(), cap_hours: totalWallTimeMsCap / 3600_000 },
        )
      }

      // Compose wake-up prompt
      const prompt = _composeWakePrompt({
        project_id: b.project_id,
        chain_id: chainId,
        iteration,
        max_iterations: maxIterations,
        action_brief: b.action_brief,
        cowork_session_id: b.cowork_session_id,
        account,
        project_name: project.name,
      })

      // Insert os_scheduled_tasks row matching the live schema used by
      // scheduler.delayed (type='delayed'; the prompt itself carries the
      // chain metadata so no payload column is needed).
      const routineName = ROUTINE_NAME_PREFIX + chainId + '.iter' + iteration
      const [taskRow] = await db`
        INSERT INTO os_scheduled_tasks (
          type, name, prompt, status, run_at, next_run_at, run_count, max_runs
        ) VALUES (
          'delayed',
          ${routineName},
          ${prompt},
          'active',
          ${wakeAt},
          ${wakeAt},
          0,
          1
        )
        RETURNING id, name, next_run_at, status
      `

      // Upsert chain state in kv_store
      const newChainValue = {
        chain_id: chainId,
        project_id: b.project_id,
        project_name: project.name,
        account,
        status: 'active',
        started_at: chainStartedAt.toISOString(),
        last_scheduled_at: now.toISOString(),
        last_wake_at: wakeAt.toISOString(),
        last_iteration_scheduled: iteration,
        iterations_fired: iterationsFired,
        max_iterations: maxIterations,
        total_wall_time_ms_cap: totalWallTimeMsCap,
        last_task_id: taskRow.id,
        last_routine_name: routineName,
        cowork_session_id: b.cowork_session_id || null,
      }
      await db`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (${chainKey}, ${JSON.stringify(newChainValue)}, NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW()
      `

      audit.logWrite(req, 'checkpoint.schedule', {
        scope_used: 'write.scheduler.cron',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'os_scheduled_tasks',
        affected_row_ref: String(taskRow.id),
        request_summary: { project_id: b.project_id, chain_id: chainId, iteration, wake_in: b.wake_in, account },
        response_summary: { task_id: taskRow.id, chain_id: chainId, wake_at: taskRow.next_run_at },
      })

      return {
        chain_id: chainId,
        task_id: taskRow.id,
        routine_name: routineName,
        wake_at: taskRow.next_run_at,
        iteration,
        max_iterations: maxIterations,
        project_id: b.project_id,
        project_name: project.name,
        account,
      }
    })
  })

  // ── checkpoint.status ─────────────────────────────────────────────────
  router.post('/checkpoint.status', scope.requireScope('read.kv_store'), async (req, res) => {
    try {
      const b = req.body || {}
      if (!b.chain_id || typeof b.chain_id !== 'string') {
        return res.status(422).json({ error: 'missing_field', field: 'chain_id' })
      }
      const chainKey = CHAIN_KV_PREFIX + b.chain_id
      const [chainRow] = await db`SELECT key, value, updated_at FROM kv_store WHERE key = ${chainKey}`
      if (!chainRow) {
        return res.status(404).json({ error: 'chain_not_found', chain_id: b.chain_id })
      }
      const chainState = _parseKvValue(chainRow.value)
      const tasks = await db`
        SELECT id, name, status, next_run_at, last_run_at, run_count, result
        FROM os_scheduled_tasks
        WHERE name LIKE ${ROUTINE_NAME_PREFIX + b.chain_id + '.%'}
        ORDER BY id ASC
      `
      return res.json({
        chain_id: b.chain_id,
        state: chainState,
        updated_at: chainRow.updated_at,
        scheduled_tasks: tasks,
        scheduled_count: tasks.length,
      })
    } catch (err) {
      return _serverError(res, err)
    }
  })

  // ── checkpoint.list ───────────────────────────────────────────────────
  router.post('/checkpoint.list', scope.requireScope('read.kv_store'), async (req, res) => {
    try {
      const b = req.body || {}
      const statusFilter = b.status || 'active'
      const limit = Math.max(1, Math.min(200, parseInt(b.limit, 10) || 50))
      const rows = await db`
        SELECT key, value, updated_at
        FROM kv_store
        WHERE key LIKE ${CHAIN_KV_PREFIX + '%'}
        ORDER BY updated_at DESC
        LIMIT ${limit}
      `
      const chains = rows
        .map(r => {
          let parsed = r.value
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed) } catch { parsed = {} }
          }
          if (!parsed || typeof parsed !== 'object') parsed = {}
          return { key: r.key, ...parsed, updated_at: r.updated_at }
        })
        .filter(c => statusFilter === 'all' || c.status === statusFilter)
      return res.json({ count: chains.length, chains })
    } catch (err) {
      return _serverError(res, err)
    }
  })

  // ── checkpoint.stop ───────────────────────────────────────────────────
  router.post('/checkpoint.stop', scope.requireScope('write.scheduler.cron'), async (req, res) => {
    await withIdempotency(req, res, 'checkpoint.stop', async () => {
      const b = req.body || {}
      if (!b.chain_id || typeof b.chain_id !== 'string') {
        throw _scheduleCreateError('chain_id required', 'missing_field', 422)
      }
      const reason = b.reason || 'manually_stopped'
      const chainKey = CHAIN_KV_PREFIX + b.chain_id
      const [chainRow] = await db`SELECT value FROM kv_store WHERE key = ${chainKey}`
      if (!chainRow) {
        throw _scheduleCreateError(`chain ${b.chain_id} not found`, 'chain_not_found', 404)
      }
      const existing = _parseKvValue(chainRow.value)
      const newValue = {
        ...(existing && typeof existing === 'object' ? existing : {}),
        status: 'stopped',
        stopped_at: new Date().toISOString(),
        stopped_reason: reason,
      }
      await db`
        UPDATE kv_store SET value = ${JSON.stringify(newValue)}, updated_at = NOW()
        WHERE key = ${chainKey}
      `
      // Pause any active scheduled tasks for the chain
      const cancelled = await db`
        UPDATE os_scheduled_tasks
        SET status = 'paused', result = ${'checkpoint.stop: ' + reason}, updated_at = NOW()
        WHERE name LIKE ${ROUTINE_NAME_PREFIX + b.chain_id + '.%'}
          AND status = 'active'
        RETURNING id, name, next_run_at
      `

      audit.logWrite(req, 'checkpoint.stop', {
        scope_used: 'write.scheduler.cron',
        cowork_session_id: b.cowork_session_id,
        affected_substrate: 'os_scheduled_tasks',
        affected_row_ref: b.chain_id,
        request_summary: { chain_id: b.chain_id, reason },
        response_summary: { cancelled_count: cancelled.length },
      })

      return {
        chain_id: b.chain_id,
        stopped: true,
        reason,
        cancelled_tasks: cancelled,
      }
    })
  })
}

module.exports = {
  mount,
  _internal: {
    _parseDelayToDate,
    _composeWakePrompt,
    HARD_CAP_ITERATIONS,
    DEFAULT_MAX_ITERATIONS,
    HARD_CAP_WALL_TIME_MS,
    DEFAULT_WALL_TIME_MS,
    CHAIN_KV_PREFIX,
    FIRE_KV_PREFIX,
    ROUTINE_NAME_PREFIX,
  },
}

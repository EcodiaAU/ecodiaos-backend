'use strict'

/**
 * attentionEconomyObserver (Observer C) — 5-min poller that checks whether
 * the conductor is working on the highest-leverage thing available.
 *
 * WHAT IT DOES:
 *   Fires every 5 minutes (setInterval, not a listener — no stream subscription).
 *   Reads from three substrates:
 *     1. working_set table: active + blocked threads (graceful fallback if absent)
 *     2. status_board: P1/P2 rows assigned to ecodiaos
 *     3. os_session_messages: last 20 Tate messages in the past 4h
 *   Calls Haiku to assess whether the conductor is on highest-leverage work.
 *   Threshold: intervene only when clearly off-priority AND a better task is
 *   actionable NOW. Rate cap: 4/hour. Dedup: 10-min window.
 *
 * WHAT IT DOES NOT DO:
 *   - Never imports osSessionService.
 *   - Never modifies DB rows, sends email/SMS, or touches credentials.
 *
 * WIRING:
 *   Not a listener (no subscribesTo/handle/relevanceFilter). Wired via
 *   start() called from server.js boot sequence. Exports { start, stop, _poll }.
 *
 * GRACEFUL DEGRADATION:
 *   If working_set table doesn't exist (parallel fork not yet committed),
 *   skips working_set reads and continues with status_board + messages only.
 *
 * Origin: fork_mp27tdp1_eaa05e, 12 May 2026. Part of Haiku Observer Trio.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const { _makeRateLimiter, _makeDeduper, _postIntervention, _writeHeartbeat } = require('./_observerBase')

const NAME = 'attentionEconomy'
const POLL_INTERVAL_MS = 5 * 60 * 1000   // 5 minutes
const INITIAL_DELAY_MS = 30_000           // 30s after boot before first poll

const SYSTEM_PROMPT = `You are the Attention Economy Observer for EcodiaOS. Your one job: at each fire, compute whether the conductor is currently working on the highest-leverage thing available. Consider: active working_set rows, P1/P2 status_board items assigned to ecodiaos, any user-blocking items ageing > 1h, and any user message in the last 4h that hasn't been addressed.
Always return JSON only:
  { "intervene": bool, "reason": "<one line>", "highest_leverage_now": "<task name>", "message_for_conductor": "<= 200 chars or null" }
Threshold: intervene only when the conductor is clearly off-priority AND a higher-priority task is actionable now. Don't intervene if the current work is reasonable even if not optimal.`

const rateLimiter = _makeRateLimiter(4)
const deduper = _makeDeduper(10 * 60 * 1000)

let _intervalHandle = null
let _initDelayHandle = null
let _running = false

// ─── Substrate readers ────────────────────────────────────────────────────────

async function _readWorkingSet() {
  // Try workingSetService first (type-safe API)
  try {
    const ws = require('../workingSetService')
    const [active, blocked] = await Promise.all([
      ws.listActive().catch(() => []),
      ws.listBlocked().catch(() => []),
    ])
    return { active: active || [], blocked: blocked || [] }
  } catch {
    // workingSetService unavailable — try raw DB
  }

  try {
    const db = require('../../config/db')
    const rows = await db`
      SELECT id, topic, intent, status, created_at, last_touched_at
      FROM working_set
      WHERE status IN ('active', 'blocked')
      ORDER BY last_touched_at DESC
      LIMIT 10
    `
    return {
      active: rows.filter(r => r.status === 'active'),
      blocked: rows.filter(r => r.status === 'blocked'),
    }
  } catch {
    // Table may not exist yet (parallel fork not committed) — graceful fallback
    return null
  }
}

async function _readStatusBoard() {
  try {
    const db = require('../../config/db')
    return await db`
      SELECT name, status, next_action, next_action_by, next_action_due, priority, last_touched
      FROM status_board
      WHERE next_action_by = 'ecodiaos'
        AND priority <= 2
        AND archived_at IS NULL
      ORDER BY priority ASC, last_touched ASC
      LIMIT 10
    `
  } catch (err) {
    logger.warn(`${NAME}: status_board query failed`, { error: err.message })
    return []
  }
}

async function _readRecentTateMessages() {
  try {
    const db = require('../../config/db')
    // Try os_session_messages table (may or may not exist)
    const rows = await db`
      SELECT content, created_at
      FROM os_session_messages
      WHERE role = 'user'
        AND created_at > NOW() - INTERVAL '4 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `
    return rows
  } catch {
    // Table absent — try kv_store fallback for last known tate message
    try {
      const db = require('../../config/db')
      const rows = await db`
        SELECT value->>'message' AS content, updated_at AS created_at
        FROM kv_store
        WHERE key = 'os.last_tate_message'
        LIMIT 1
      `
      return rows
    } catch { return [] }
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function _buildPrompt({ workingSet, statusBoard, tateMessages }) {
  const lines = []

  // Working set
  if (workingSet) {
    lines.push(`ACTIVE WORKING SET (${workingSet.active.length} active, ${workingSet.blocked.length} blocked):`)
    for (const t of workingSet.active) {
      lines.push(`  [ACTIVE] ${t.topic || t.intent || JSON.stringify(t)}`)
    }
    for (const t of workingSet.blocked) {
      lines.push(`  [BLOCKED] ${t.topic || t.intent || JSON.stringify(t)}`)
    }
    if (workingSet.active.length === 0 && workingSet.blocked.length === 0) {
      lines.push('  (empty - no active threads)')
    }
  } else {
    lines.push('ACTIVE WORKING SET: unavailable (table may not exist yet)')
  }

  // Status board P1/P2
  lines.push(`\nP1/P2 STATUS BOARD — ecodiaos queue (${statusBoard.length} items):`)
  if (statusBoard.length === 0) {
    lines.push('  (no P1/P2 items assigned to ecodiaos)')
  }
  for (const r of statusBoard) {
    const ageMin = r.last_touched
      ? Math.round((Date.now() - new Date(r.last_touched).getTime()) / 60000)
      : '?'
    const dueStr = r.next_action_due ? ` due=${String(r.next_action_due).slice(0, 10)}` : ''
    lines.push(`  [P${r.priority}${dueStr}] ${r.name}: ${r.next_action || '(no next_action)'} (last touched ${ageMin}m ago)`)
  }

  // Recent Tate messages
  lines.push(`\nRECENT TATE MESSAGES (last 4h, ${tateMessages.length} found):`)
  if (tateMessages.length === 0) {
    lines.push('  (none in last 4h)')
  }
  for (const m of tateMessages.slice(0, 5)) {
    const content = String(m.content || '').slice(0, 200)
    const ts = m.created_at ? String(m.created_at).slice(11, 16) : '?'
    lines.push(`  [${ts}] ${content}`)
  }

  lines.push('\nReturn JSON only.')
  return lines.join('\n')
}

// ─── Poll cycle ───────────────────────────────────────────────────────────────

async function _poll() {
  if (_running) {
    logger.debug(`${NAME}: poll skipped — previous cycle still running`)
    return
  }
  _running = true

  try {
    const [workingSet, statusBoard, tateMessages] = await Promise.all([
      _readWorkingSet(),
      _readStatusBoard(),
      _readRecentTateMessages(),
    ])

    const prompt = _buildPrompt({ workingSet, statusBoard, tateMessages })
    const result = await haikuClient.call({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: prompt,
      observerName: NAME,
    })

    const heartbeat = {
      last_run: new Date().toISOString(),
      intervene_rate_24h: rateLimiter.count(),
      p1p2_count: statusBoard.length,
      working_set_available: workingSet !== null,
      tate_messages_4h: tateMessages.length,
    }

    if (!result?.intervene) {
      await _writeHeartbeat(NAME, {
        ...heartbeat,
        last_decision: 'no_intervene',
        highest_leverage_now: result?.highest_leverage_now || 'current_work',
        last_reason: result?.reason || 'on_priority',
      })
      return
    }

    const msg = result?.message_for_conductor
    if (!msg) {
      await _writeHeartbeat(NAME, { ...heartbeat, last_decision: 'intervene_no_message' })
      return
    }

    if (deduper.isDuplicate(msg)) {
      logger.debug(`${NAME}: dedup blocked`)
      await _writeHeartbeat(NAME, { ...heartbeat, last_decision: 'dedup_blocked' })
      return
    }

    if (!rateLimiter.check()) {
      logger.warn(`${NAME}: rate cap (4/h) exceeded, dropping intervention`)
      await _writeHeartbeat(NAME, { ...heartbeat, last_decision: 'rate_cap_dropped' })
      return
    }

    await _postIntervention(NAME, String(msg).slice(0, 200))
    deduper.record(msg)
    await _writeHeartbeat(NAME, {
      ...heartbeat,
      last_decision: 'intervened',
      highest_leverage_now: result.highest_leverage_now,
      last_reason: result.reason,
    })
  } catch (err) {
    logger.warn(`${NAME}: poll cycle threw`, { error: err.message })
  } finally {
    _running = false
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function start() {
  if (_intervalHandle) return  // idempotent
  logger.info(`${NAME}: starting 5-min attention economy poller`)

  // Short initial delay so server finishes booting before first poll
  _initDelayHandle = setTimeout(() => {
    _initDelayHandle = null
    _poll().catch(err => logger.warn(`${NAME}: initial poll threw`, { error: err.message }))
    _intervalHandle = setInterval(() => {
      _poll().catch(err => logger.warn(`${NAME}: interval poll threw`, { error: err.message }))
    }, POLL_INTERVAL_MS)
    if (_intervalHandle.unref) _intervalHandle.unref()
  }, INITIAL_DELAY_MS)
  if (_initDelayHandle && _initDelayHandle.unref) _initDelayHandle.unref()
}

function stop() {
  if (_initDelayHandle) {
    clearTimeout(_initDelayHandle)
    _initDelayHandle = null
  }
  if (_intervalHandle) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
    logger.info(`${NAME}: stopped`)
  }
}

module.exports = { start, stop, _poll }

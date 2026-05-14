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

const SYSTEM_PROMPT = `You are the Attention Economy Observer for EcodiaOS. You poll every 5 minutes and assess whether the conductor is currently working on the highest-leverage thing available.

INPUTS PER FIRE:
  - Active and blocked working_set rows (live conductor threads).
  - P1/P2 status_board items assigned to ecodiaos.
  - Recent user (Tate) messages in the last 4h.

INTERVENE only when ALL of these hold:
  1. You can name a SPECIFIC higher-priority task by row name or topic.
  2. That task is actionable NOW (not blocked by external dependency, not waiting on Tate).
  3. The current working_set's top thread is materially lower-leverage than the candidate.
  4. The named task is older / more time-sensitive than the conductor's current focus.

DO NOT intervene if:
  - The working_set is empty (the conductor may be between tasks; that's fine).
  - The candidate task is blocked on Tate / external (next_action_by != 'ecodiaos').
  - The current work might be preparation for the candidate task.
  - The data inputs say P1/P2 count = 0 AND working_set is non-empty (current work is at least the top of the queue).

Confidence: state your confidence in [0.0, 1.0]. ONLY intervene at confidence >= 0.85. Priority 1 (P1 interrupt-eligible) only when the higher-leverage item is itself P1 AND user-blocking AND aging.

Always return JSON only:
  { "intervene": bool, "confidence": number, "priority": 1|3, "reason": "<one line, quote the row names>", "highest_leverage_now": "<task name>", "message_for_conductor": "<= 200 chars or null" }
Default: { "intervene": false, "confidence": <your read>, "reason": "on highest-leverage work" }.`

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
  // Audit 2026-05-13 P0 #29: the canonical user-message store is
  // `os_conversation` (per outcomeInference.js + osConversationLog.js).
  // The previous query against `os_session_messages` silently returned
  // empty under .catch, so "what's Tate said in the last 4h" was always
  // empty — observer decisions were made on stale working_set +
  // status_board only. Read from os_conversation now.
  try {
    const db = require('../../config/db')
    // os_conversation may have either {role,content} or {turn_role,
    // turn_text} shape depending on migration generation. Try the
    // canonical shape first; fall back if the columns aren't there.
    try {
      const rows = await db`
        SELECT turn_text AS content, created_at
        FROM os_conversation
        WHERE turn_role = 'user'
          AND created_at > NOW() - INTERVAL '4 hours'
        ORDER BY created_at DESC
        LIMIT 20
      `
      return rows
    } catch {
      const rows = await db`
        SELECT content, created_at
        FROM os_conversation
        WHERE role = 'user'
          AND created_at > NOW() - INTERVAL '4 hours'
        ORDER BY created_at DESC
        LIMIT 20
      `
      return rows
    }
  } catch {
    // Both shapes failed — fall back to kv_store last_tate_message marker.
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

    const confidence = typeof result.confidence === 'number' ? result.confidence : 0.5
    if (confidence < 0.85) {
      await _writeHeartbeat(NAME, {
        ...heartbeat,
        last_decision: 'confidence_floor_dropped',
        last_reason: `confidence=${confidence.toFixed(2)} < 0.85`,
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

    const priority = result.priority === 1 ? 1 : 3
    await _postIntervention(NAME, String(msg).slice(0, 200), {
      signal_kind: 'leverage_misalignment',
      reason: result.reason || null,
      confidence,
      priority,
    })
    deduper.record(msg)
    await _writeHeartbeat(NAME, {
      ...heartbeat,
      last_decision: 'intervened',
      highest_leverage_now: result.highest_leverage_now,
      last_reason: result.reason,
      confidence,
      priority,
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

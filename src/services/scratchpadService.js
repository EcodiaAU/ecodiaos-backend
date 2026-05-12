'use strict'

/**
 * scratchpadService - conductor's inner reasoning substrate.
 *
 * Replaces [APPLIED]/[NOT-APPLIED] chat-tag narration. The conductor calls
 * scratchpad.write() (via mcp__scratchpad__write tool) to record pattern
 * applications, decisions, and observations silently to DB — never as chat text.
 *
 * JSONL BRIDGE: On every write with kind='pattern_applied' or
 * 'pattern_not_applied', we also append a line to application-events.jsonl
 * so the existing dispatchEventConsumer telemetry pipeline keeps working
 * without modification. The JSONL format matches what conductorStreamTagWatcher
 * used to write.
 *
 * Origin: fork_mp27sa0a_67954f, 2026-05-12.
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md Layer 3.
 */

const path = require('path')
const fs = require('fs')
const db = require('../config/db')
const logger = require('../config/logger')

// JSONL bridge — same path as conductorStreamTagWatcher and dispatchEventConsumer.
const TELEMETRY_DIR = process.env.ECODIAOS_TELEMETRY_DIR || '/home/tate/ecodiaos/logs/telemetry'
const APP_JSONL = process.env.ECODIAOS_APPLICATION_EVENT_FILE || path.join(TELEMETRY_DIR, 'application-events.jsonl')

/**
 * Write a scratchpad entry.
 *
 * @param {object} opts
 * @param {string} opts.session_id   - OS session id (required)
 * @param {string} opts.kind         - 'plan'|'pattern_applied'|'pattern_not_applied'|'decision'|'observation'|'retry'|'blocker'
 * @param {string} opts.content      - Free-text reasoning content
 * @param {string} [opts.thread_id]  - UUID referencing working_set(id)
 * @param {string} [opts.pattern_path] - Pattern file path (for pattern_applied/not_applied)
 * @param {string} [opts.reason]     - Short reason (for pattern_applied/not_applied/override)
 * @param {number} [opts.turn_id]    - Optional turn counter
 * @returns {Promise<{id: number}>}
 */
async function write({ session_id, kind, content, thread_id, pattern_path, reason, turn_id } = {}) {
  if (!session_id) throw new Error('scratchpadService.write: session_id required')
  if (!kind) throw new Error('scratchpadService.write: kind required')
  if (!content) throw new Error('scratchpadService.write: content required')

  const validKinds = ['plan', 'pattern_applied', 'pattern_not_applied', 'decision', 'observation', 'retry', 'blocker']
  if (!validKinds.includes(kind)) throw new Error(`scratchpadService.write: invalid kind '${kind}'`)

  try {
    const rows = await db`
      INSERT INTO scratchpad_entries (session_id, kind, content, thread_id, pattern_path, reason, turn_id)
      VALUES (
        ${session_id},
        ${kind},
        ${content},
        ${thread_id || null},
        ${pattern_path || null},
        ${reason || null},
        ${turn_id || null}
      )
      RETURNING id
    `
    const id = rows[0]?.id

    // JSONL bridge for telemetry continuity (pattern_applied / pattern_not_applied only).
    if (kind === 'pattern_applied' || kind === 'pattern_not_applied') {
      _writeJsonlBridge({ kind, pattern_path, reason, session_id })
    }

    logger.debug('scratchpadService.write: entry recorded', { id, kind, session_id })
    return { id }
  } catch (err) {
    logger.warn('scratchpadService.write: DB write failed', { error: err.message, kind, session_id })
    // Still attempt the JSONL bridge even if DB fails — keeps telemetry intact.
    if (kind === 'pattern_applied' || kind === 'pattern_not_applied') {
      _writeJsonlBridge({ kind, pattern_path, reason, session_id })
    }
    throw err
  }
}

/**
 * Recent entries for a session — used by _injectScratchpadRecent() in osSessionService.
 *
 * @param {string} session_id
 * @param {number} [limit=10]
 * @returns {Promise<Array<{kind,content,pattern_path,reason,ts}>>}
 */
async function recentForSession(session_id, limit = 10) {
  if (!session_id) return []
  try {
    const rows = await db`
      SELECT kind, content, pattern_path, reason, ts
      FROM scratchpad_entries
      WHERE session_id = ${session_id}
      ORDER BY ts DESC
      LIMIT ${Math.min(limit, 50)}
    `
    return rows || []
  } catch (err) {
    logger.debug('scratchpadService.recentForSession: query failed', { error: err.message })
    return []
  }
}

/**
 * All entries for a working_set thread.
 *
 * @param {string} thread_id  UUID
 * @returns {Promise<Array>}
 */
async function byThread(thread_id) {
  if (!thread_id) return []
  try {
    const rows = await db`
      SELECT id, session_id, kind, content, pattern_path, reason, ts
      FROM scratchpad_entries
      WHERE thread_id = ${thread_id}
      ORDER BY ts ASC
    `
    return rows || []
  } catch (err) {
    logger.debug('scratchpadService.byThread: query failed', { error: err.message })
    return []
  }
}

/**
 * Pattern-applied/not-applied entries for telemetry rollup.
 *
 * @param {string} pattern_path
 * @param {number} [sinceDays=7]
 * @returns {Promise<Array>}
 */
async function byPattern(pattern_path, sinceDays = 7) {
  if (!pattern_path) return []
  try {
    const rows = await db`
      SELECT id, session_id, kind, reason, ts
      FROM scratchpad_entries
      WHERE pattern_path = ${pattern_path}
        AND kind IN ('pattern_applied', 'pattern_not_applied')
        AND ts > NOW() - ${`${sinceDays} days`}::INTERVAL
      ORDER BY ts DESC
    `
    return rows || []
  } catch (err) {
    logger.debug('scratchpadService.byPattern: query failed', { error: err.message })
    return []
  }
}

/**
 * Write a JSONL line to application-events.jsonl so the existing
 * dispatchEventConsumer pipeline keeps ingesting pattern telemetry without
 * modification. Format matches what conductorStreamTagWatcher wrote.
 */
function _writeJsonlBridge({ kind, pattern_path, reason, session_id }) {
  try {
    const applied = kind === 'pattern_applied'
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      matched_dispatch_ts: null,
      tool_name: 'mcp__scratchpad__write',
      pattern_path: pattern_path || null,
      trigger_keyword: null,
      source_layer: 'scratchpad:conductor_silent',
      applied,
      tagged_silent: false,
      was_false_positive: null,
      was_override: null,
      reason: reason || null,
      hook_name: 'scratchpadService',
      source_ts: new Date().toISOString(),
      session_id,
    })
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true })
    fs.appendFileSync(APP_JSONL, line + '\n', 'utf-8')
  } catch (err) {
    logger.warn('scratchpadService._writeJsonlBridge: JSONL write failed', { error: err.message })
  }
}

module.exports = { write, recentForSession, byThread, byPattern }

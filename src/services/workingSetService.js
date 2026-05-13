'use strict'

/**
 * workingSetService — the conductor's typed thread-state substrate.
 *
 * One table replaces <conductor_commitments>, <thread_carry_forward>, and the
 * conductor's habit of narrating fork/thread status into chat.
 *
 * Hard rules (enforced here):
 *   - Max 5 active rows. 6th active push parks the oldest first.
 *   - last_touched_at is updated on every touch.
 *   - Auto-park stale active threads (no touch in 30min) via autoParkStale().
 *   - Never raise on missing id; log and return.
 *
 * Listeners (forkComplete, emailArrival, factorySessionComplete) write rows
 * directly. The conductor reads via _injectWorkingSet() in osSessionService.js.
 *
 * Origin: conductor-self-sufficiency-plan-2026-05-12.md §Piece 1.
 * Fork: fork_mp27az1r_1878c0.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const MAX_ACTIVE = 5
const STALE_PARK_MS = 30 * 60 * 1000  // 30 minutes

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Open a new working_set thread.
 * If active count >= MAX_ACTIVE, parks the oldest first.
 * Returns { id } of the new row.
 */
async function openThread({ topic, intent, parent_id = null, artifacts = {} } = {}) {
  if (!topic || !intent) {
    logger.warn('workingSetService.openThread: topic and intent are required')
    return { id: null }
  }
  try {
    // Enforce cap: park oldest if at limit
    const [countRow] = await db`
      SELECT COUNT(*)::int AS n
      FROM working_set
      WHERE status = 'active' AND closed_at IS NULL
    `
    if (countRow && countRow.n >= MAX_ACTIVE) {
      logger.info('workingSetService: active cap reached, parking oldest', { n: countRow.n })
      await parkOldest()
    }

    const topicSlice = String(topic).slice(0, 200)
    const intentSlice = String(intent).slice(0, 500)
    const [row] = await db`
      INSERT INTO working_set (topic, status, intent, artifacts, parent_id)
      VALUES (
        ${topicSlice},
        'active',
        ${intentSlice},
        ${db.json(artifacts)},
        ${parent_id || null}
      )
      RETURNING id
    `
    logger.info('workingSetService: thread opened', { id: row.id, topic: topicSlice })
    return { id: row.id }
  } catch (err) {
    logger.warn('workingSetService.openThread: failed', { error: err.message })
    return { id: null }
  }
}

/**
 * Update an existing thread.
 * @param {string} id - working_set UUID
 * @param {object} fields
 *   status       - 'active' | 'parked' | 'blocked' | 'resolved'
 *   blocking_on  - string or null
 *   artifacts    - JSONB to MERGE (shallow) into existing artifacts
 *   touch        - whether to update last_touched_at (default true)
 */
async function updateThread(id, { status, blocking_on, artifacts, touch = true } = {}) {
  if (!id) {
    logger.warn('workingSetService.updateThread: id is required')
    return
  }
  try {
    // Build update set dynamically
    const updates = {}
    if (status !== undefined)      updates.status      = status
    if (blocking_on !== undefined) updates.blocking_on = blocking_on
    if (touch)                     updates.last_touched_at = new Date()

    // Merge artifacts if provided (shallow merge via jsonb ||)
    if (artifacts !== undefined) {
      await db`
        UPDATE working_set
        SET
          ${Object.keys(updates).length > 0 ? db(updates) : db`last_touched_at = last_touched_at`},
          artifacts = artifacts || ${db.json(artifacts)}
        WHERE id = ${id}
      `
      logger.info('workingSetService: thread updated (with artifacts)', { id, status, blocking_on })
      return
    }

    if (Object.keys(updates).length === 0) return

    await db`
      UPDATE working_set
      SET ${db(updates)}
      WHERE id = ${id}
    `
    logger.info('workingSetService: thread updated', { id, status, blocking_on })
  } catch (err) {
    logger.warn('workingSetService.updateThread: failed', { id, error: err.message })
  }
}

/**
 * Close a thread: set status='resolved', closed_at=NOW().
 */
async function closeThread(id, { resolution } = {}) {
  if (!id) {
    logger.warn('workingSetService.closeThread: id is required')
    return
  }
  try {
    const resolutionSlice = resolution ? String(resolution).slice(0, 500) : null
    await db`
      UPDATE working_set
      SET
        status          = 'resolved',
        closed_at       = NOW(),
        last_touched_at = NOW(),
        artifacts       = artifacts || ${db.json(resolutionSlice ? { resolution: resolutionSlice } : {})}
      WHERE id = ${id}
        AND closed_at IS NULL
    `
    logger.info('workingSetService: thread closed', { id, resolution: resolutionSlice })
  } catch (err) {
    logger.warn('workingSetService.closeThread: failed', { id, error: err.message })
  }
}

/**
 * List active threads (status='active', not closed).
 */
async function listActive() {
  try {
    return await db`
      SELECT id, topic, status, blocking_on, intent, artifacts, parent_id, opened_at, last_touched_at
      FROM working_set
      WHERE status = 'active' AND closed_at IS NULL
      ORDER BY last_touched_at DESC
    `
  } catch (err) {
    logger.warn('workingSetService.listActive: failed', { error: err.message })
    return []
  }
}

/**
 * List blocked threads.
 */
async function listBlocked() {
  try {
    return await db`
      SELECT id, topic, status, blocking_on, intent, artifacts, parent_id, opened_at, last_touched_at
      FROM working_set
      WHERE status = 'blocked' AND closed_at IS NULL
      ORDER BY last_touched_at DESC
    `
  } catch (err) {
    logger.warn('workingSetService.listBlocked: failed', { error: err.message })
    return []
  }
}

/**
 * Park the oldest active thread (lowest last_touched_at).
 */
async function parkOldest() {
  try {
    const [oldest] = await db`
      SELECT id, topic
      FROM working_set
      WHERE status = 'active' AND closed_at IS NULL
      ORDER BY last_touched_at ASC
      LIMIT 1
    `
    if (!oldest) return
    await db`
      UPDATE working_set
      SET status = 'parked', last_touched_at = NOW()
      WHERE id = ${oldest.id}
    `
    logger.info('workingSetService: parked oldest active thread', { id: oldest.id, topic: oldest.topic })
  } catch (err) {
    logger.warn('workingSetService.parkOldest: failed', { error: err.message })
  }
}

/**
 * Auto-park any active threads not touched in STALE_PARK_MS (30min).
 * Also closes stale blocked threads — belt-and-suspenders safety net for
 * forks that terminated without the forkComplete listener closing their row.
 * Primary fix is in forkComplete.js (fork_mp3kbkfc_50a1e5): error/aborted
 * terminal statuses now call closeThread() directly rather than setting
 * status='blocked'. This loop is the fallback for any rows that slip through.
 */
async function autoParkStale() {
  try {
    const cutoff = new Date(Date.now() - STALE_PARK_MS)

    // Park stale active threads
    const parked = await db`
      UPDATE working_set
      SET status = 'parked', last_touched_at = NOW()
      WHERE status = 'active'
        AND closed_at IS NULL
        AND last_touched_at < ${cutoff}
      RETURNING id, topic
    `
    if (parked.length > 0) {
      logger.info('workingSetService: auto-parked stale threads', {
        count: parked.length,
        ids: parked.map(r => r.id),
      })
    }

    // Close stale blocked threads — these are terminal-failure fork rows that
    // should have been closed by forkComplete but weren't (pre-fix accumulation
    // or future edge cases). Use a longer window (2x) to avoid racing with
    // legitimate blocked states that the conductor is actively investigating.
    const staleBlockedCutoff = new Date(Date.now() - STALE_PARK_MS * 2)
    const closed = await db`
      UPDATE working_set
      SET
        status    = 'resolved',
        closed_at = NOW(),
        last_touched_at = NOW(),
        artifacts = artifacts || ${db.json({ auto_closed: true, reason: 'stale_blocked_auto_close' })}
      WHERE status = 'blocked'
        AND closed_at IS NULL
        AND last_touched_at < ${staleBlockedCutoff}
      RETURNING id, topic
    `
    if (closed.length > 0) {
      logger.info('workingSetService: auto-closed stale blocked threads', {
        count: closed.length,
        ids: closed.map(r => r.id),
      })
    }
  } catch (err) {
    logger.warn('workingSetService.autoParkStale: failed', { error: err.message })
  }
}

/**
 * Find a thread by fork_id stored in artifacts.
 * Returns the row or null.
 */
async function findByForkId(forkId) {
  if (!forkId) return null
  try {
    const [row] = await db`
      SELECT id, topic, status
      FROM working_set
      WHERE artifacts->>'fork_id' = ${forkId}
        AND closed_at IS NULL
      LIMIT 1
    `
    return row || null
  } catch (err) {
    logger.warn('workingSetService.findByForkId: failed', { forkId, error: err.message })
    return null
  }
}

/**
 * Find a thread by a cc_session_id stored in artifacts.
 */
async function findBySessionId(sessionId) {
  if (!sessionId) return null
  try {
    const [row] = await db`
      SELECT id, topic, status
      FROM working_set
      WHERE artifacts->>'cc_session_id' = ${sessionId}
        AND closed_at IS NULL
      LIMIT 1
    `
    return row || null
  } catch (err) {
    logger.warn('workingSetService.findBySessionId: failed', { sessionId, error: err.message })
    return null
  }
}

// ── Auto-park stale threads on a 5-minute interval ───────────────────────────
// Boot this once when the module loads. Fail-safe: never throws.
let _autoParkInterval = null

function startAutoParkLoop() {
  if (_autoParkInterval) return  // idempotent
  _autoParkInterval = setInterval(() => {
    autoParkStale().catch(() => {})
  }, 5 * 60 * 1000)
  // Don't block Node exit
  if (_autoParkInterval.unref) _autoParkInterval.unref()
  logger.info('workingSetService: auto-park loop started (5min interval)')
}

// Start immediately on require — safe because this module is loaded lazily
// the first time a listener or osSessionService calls it. By that point the
// DB connection is always live. If the DB isn't up yet, autoParkStale() just
// logs a warn and returns — the next tick retries.
startAutoParkLoop()

module.exports = {
  openThread,
  updateThread,
  closeThread,
  listActive,
  listBlocked,
  parkOldest,
  autoParkStale,
  findByForkId,
  findBySessionId,
  startAutoParkLoop,
}

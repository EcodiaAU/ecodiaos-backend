'use strict'

/**
 * caseFile.js (2026-05-21)
 *
 * In-flight work tracking across voice/away/IDE. A case_file is the durable
 * referent for "this handoff" / "this question" / "this escalation" so brains
 * can pick it up across calls, restarts, and channel switches.
 *
 * Per spec backend/drafts/one-brain-stateful-coordination-2026-05-21.md §3.2.
 *
 * Lifecycle:
 *   open -> working -> resolved | abandoned | blocked
 *
 * Single-writer rules:
 *   - openCase: the channel that originated the work
 *   - markWorking + resolveCase + markBlocked: the brain doing the work (usually away-conductor)
 *   - markDelivered: any brain that delivered the result to Tate
 *   - ackCase: voice / IDE / iOS app (Tate-acknowledgement signal)
 *
 * Hops cap prevents infinite re-handoffs on the same case (see §7.2).
 */

const db = require('../config/db')
const logger = require('../config/logger')

const MAX_HOPS = 3

async function openCase({
  thread_id = 'tate',
  opened_by,
  opened_in_call = null,
  prompt,
  meta = {},
} = {}) {
  if (!opened_by) return { ok: false, error: 'opened_by required' }
  if (!prompt || typeof prompt !== 'string') return { ok: false, error: 'prompt required' }
  try {
    const rows = await db`
      INSERT INTO case_files (thread_id, opened_by, opened_in_call, prompt, status, meta)
      VALUES (${thread_id}, ${opened_by}, ${opened_in_call}, ${prompt.slice(0, 4000)}, 'open', ${db.json(meta || {})})
      RETURNING id, opened_at, status, hops
    `
    return { ok: true, id: rows[0].id, opened_at: rows[0].opened_at, status: rows[0].status, hops: rows[0].hops }
  } catch (err) {
    logger.warn('caseFile.open failed', { error: err.message, opened_by })
    return { ok: false, error: err.message }
  }
}

async function markWorking(id) {
  if (!id) return { ok: false, error: 'id required' }
  try {
    const rows = await db`
      UPDATE case_files SET status = 'working', hops = hops + 1
      WHERE id = ${id} AND status IN ('open','working')
      RETURNING id, status, hops
    `
    if (!rows[0]) return { ok: false, error: 'case not found or not in open/working state' }
    if (rows[0].hops > MAX_HOPS) {
      await db`UPDATE case_files SET status = 'blocked', blocking_on = 'hop_limit_exceeded' WHERE id = ${id}`
      return { ok: false, error: 'hop_limit_exceeded', hops: rows[0].hops, blocked: true }
    }
    return { ok: true, id: rows[0].id, status: rows[0].status, hops: rows[0].hops }
  } catch (err) {
    logger.warn('caseFile.markWorking failed', { error: err.message, id })
    return { ok: false, error: err.message }
  }
}

/**
 * Resolve a case with a result. Idempotent on same-result; warns on conflicting
 * result replay.
 */
async function resolveCase(id, { result } = {}) {
  if (!id) return { ok: false, error: 'id required' }
  if (!result || typeof result !== 'string') return { ok: false, error: 'result required' }
  try {
    const existing = await db`SELECT status, result FROM case_files WHERE id = ${id} LIMIT 1`
    if (!existing[0]) return { ok: false, error: 'case not found' }
    if (existing[0].status === 'resolved') {
      if (existing[0].result === result) {
        return { ok: true, id, status: 'resolved', already: true }
      }
      logger.warn('caseFile.resolveCase replay with different result', {
        id, existing_chars: (existing[0].result || '').length, new_chars: result.length,
      })
      return { ok: false, error: 'already_resolved_different_result', existing_result: existing[0].result }
    }
    const rows = await db`
      UPDATE case_files SET status = 'resolved', result = ${result.slice(0, 8000)}, resolved_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, resolved_at
    `
    return { ok: true, id: rows[0].id, status: rows[0].status, resolved_at: rows[0].resolved_at }
  } catch (err) {
    logger.warn('caseFile.resolveCase failed', { error: err.message, id })
    return { ok: false, error: err.message }
  }
}

async function markBlocked(id, { reason } = {}) {
  if (!id) return { ok: false, error: 'id required' }
  try {
    const rows = await db`
      UPDATE case_files SET status = 'blocked', blocking_on = ${reason || 'unknown'}
      WHERE id = ${id}
      RETURNING id, status, blocking_on
    `
    if (!rows[0]) return { ok: false, error: 'case not found' }
    return { ok: true, id: rows[0].id, status: rows[0].status, blocking_on: rows[0].blocking_on }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function abandonCase(id, { reason } = {}) {
  if (!id) return { ok: false, error: 'id required' }
  try {
    const rows = await db`
      UPDATE case_files SET status = 'abandoned', blocking_on = ${reason || null}, resolved_at = NOW()
      WHERE id = ${id}
      RETURNING id, status
    `
    return rows[0] ? { ok: true, id: rows[0].id, status: rows[0].status } : { ok: false, error: 'not found' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Record that a result has been delivered via channel X. Used to prevent
 * double-send across surfaces (see spec §4.3).
 */
async function markDelivered(id, { via } = {}) {
  if (!id || !via) return { ok: false, error: 'id and via required' }
  try {
    const rows = await db`
      UPDATE case_files
      SET delivered_via = (
        SELECT array_agg(DISTINCT v) FROM unnest(delivered_via || ARRAY[${via}]::text[]) AS v
      )
      WHERE id = ${id}
      RETURNING id, delivered_via
    `
    return rows[0] ? { ok: true, id: rows[0].id, delivered_via: rows[0].delivered_via } : { ok: false, error: 'not found' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Tate-acknowledgement: he saw/heard the result. Voice marks this when it speaks
 * a result. iOS app marks it via /api/native/cases/:id/ack deep link.
 */
async function ackCase(id) {
  if (!id) return { ok: false, error: 'id required' }
  try {
    const rows = await db`
      UPDATE case_files SET acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE id = ${id}
      RETURNING id, acknowledged_at
    `
    return rows[0] ? { ok: true, id: rows[0].id, acknowledged_at: rows[0].acknowledged_at } : { ok: false, error: 'not found' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function listOpenCases({ thread_id = 'tate', limit = 5 } = {}) {
  try {
    const rows = await db`
      SELECT id, opened_at, opened_by, opened_in_call, prompt, status, blocking_on, hops
      FROM case_files
      WHERE thread_id = ${thread_id} AND status IN ('open','working','blocked')
      ORDER BY opened_at DESC
      LIMIT ${limit}
    `
    return rows
  } catch (err) {
    logger.warn('caseFile.listOpenCases failed', { error: err.message })
    return []
  }
}

async function listResolvedUnacked({ thread_id = 'tate', since = null, limit = 5 } = {}) {
  try {
    if (since) {
      return await db`
        SELECT id, opened_at, opened_by, opened_in_call, prompt, result, resolved_at, delivered_via
        FROM case_files
        WHERE thread_id = ${thread_id} AND status = 'resolved' AND acknowledged_at IS NULL
          AND resolved_at > ${since}::timestamptz
        ORDER BY resolved_at DESC
        LIMIT ${limit}
      `
    }
    return await db`
      SELECT id, opened_at, opened_by, opened_in_call, prompt, result, resolved_at, delivered_via
      FROM case_files
      WHERE thread_id = ${thread_id} AND status = 'resolved' AND acknowledged_at IS NULL
      ORDER BY resolved_at DESC
      LIMIT ${limit}
    `
  } catch (err) {
    logger.warn('caseFile.listResolvedUnacked failed', { error: err.message })
    return []
  }
}

async function getCase(id) {
  if (!id) return null
  try {
    const rows = await db`SELECT * FROM case_files WHERE id = ${id} LIMIT 1`
    return rows[0] || null
  } catch (err) {
    logger.warn('caseFile.getCase failed', { error: err.message, id })
    return null
  }
}

/**
 * Compact one-line summary of a case for prompt injection.
 */
function formatCaseForPrompt(c) {
  if (!c) return ''
  const prompt = String(c.prompt || '').replace(/\s+/g, ' ').slice(0, 100)
  const result = c.result ? String(c.result).replace(/\s+/g, ' ').slice(0, 120) : null
  if (c.status === 'open' || c.status === 'working') {
    return `[${c.status} via ${c.opened_by}] ${prompt}`
  }
  if (c.status === 'blocked') {
    return `[blocked: ${c.blocking_on || '?'}] ${prompt}`
  }
  if (c.status === 'resolved') {
    return `[resolved unacked] Q: ${prompt} A: ${result || '(no result)'}`
  }
  return `[${c.status}] ${prompt}`
}

module.exports = {
  openCase,
  markWorking,
  resolveCase,
  markBlocked,
  abandonCase,
  markDelivered,
  ackCase,
  listOpenCases,
  listResolvedUnacked,
  getCase,
  formatCaseForPrompt,
}

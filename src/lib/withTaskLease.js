'use strict'

/**
 * withTaskLease — convenience wrapper around taskLease for single-brain task
 * execution. Acquires a lease, runs the body, releases on completion or error.
 *
 * If the lease cannot be acquired (another brain owns it), returns
 * { acquired: false } so the caller can skip cleanly. Otherwise runs the body
 * and returns { acquired: true, result }.
 *
 * The body MAY call heartbeat() if it runs long; otherwise the default 120s
 * TTL applies and the lease auto-releases via sweepExpiredLeases.
 *
 * Usage:
 *
 *   const r = await withTaskLease(
 *     { task_id: `dispatch:${row.id}`, brain_id: 'vps-conductor' },
 *     async (lease) => {
 *       await fireDispatch(row)
 *       return { ok: true }
 *     }
 *   )
 *   if (!r.acquired) return // sibling brain handled it
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 — the lease primitive existed but was
 * never called from any production path, so split-brain protection between the
 * VPS conductor and the Corazon laptop agent was advisory-only.
 */

const taskLease = require('../services/taskLease')
const logger = require('../config/logger')

async function withTaskLease({ task_id, brain_id, ttl_sec }, body) {
  if (!task_id || !brain_id) throw new Error('withTaskLease: task_id + brain_id required')
  if (typeof body !== 'function') throw new Error('withTaskLease: body must be a function')
  const lease = await taskLease.acquireTaskLease({ task_id, brain_id, ttl_sec })
  if (!lease) return { acquired: false }
  try {
    const result = await body(lease)
    return { acquired: true, result }
  } catch (err) {
    // re-throw, but still release in finally
    logger.warn('withTaskLease: body threw, releasing lease', { task_id, brain_id, error: err.message })
    throw err
  } finally {
    await taskLease.releaseTaskLease({ task_id, brain_id }).catch(err =>
      logger.debug('withTaskLease: release failed (non-fatal)', { task_id, brain_id, error: err.message })
    )
  }
}

module.exports = { withTaskLease }

'use strict'

/**
 * taskLease - Postgres advisory-lock based lease for multi-brain task
 * arbitration. Per FORK_ATOMICITY_SPEC §4.
 *
 * Two brains (VPS conductor + Corazon laptop agent) share a task queue.
 * Without arbitration, both can decide to handle the same task and
 * produce a double-send. This module provides a lease primitive:
 *   1. Acquire: caller claims ownership via pg_try_advisory_lock. Only
 *      one brain gets the lock at a time; others get null.
 *   2. Heartbeat: long-running work refreshes `heartbeat_at` every
 *      ttl/2 seconds so the lease stays fresh.
 *   3. Release: explicit release on completion OR automatic expiry when
 *      heartbeat stops.
 *
 * The lock_key is derived from hashTaskId(task_id) - a bigint hash of
 * the string - so the same task_id always maps to the same lock
 * regardless of brain.
 *
 * Failure modes:
 *   - acquireTaskLease returns null when another brain holds the lock.
 *   - heartbeat returns false if the lease expired or another brain took
 *     over. Caller should abort the work on false.
 *   - releaseTaskLease is idempotent - calling on an unowned lease is OK.
 */

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const DEFAULT_TTL_SEC = 120

function hashTaskId(task_id) {
  // sha256 first 8 bytes → bigint. This must be stable across processes
  // and versions, so we use a well-known fast hash. Postgres advisory
  // lock keys are bigint, so we fit into int8.
  if (typeof task_id !== 'string') task_id = String(task_id)
  const h = crypto.createHash('sha256').update(task_id).digest()
  // Read first 8 bytes as signed big-endian int64.
  // Postgres advisory lock takes either int8 or (int4, int4) pair. Both
  // are fine; int8 is simpler. JS BigInt keeps precision past 2^53.
  const big = h.readBigInt64BE(0)
  return big
}

/**
 * Try to acquire a lease on a task_id. Returns the lease row on success,
 * null when another brain already holds it.
 */
async function acquireTaskLease({ task_id, brain_id, ttl_sec = DEFAULT_TTL_SEC }) {
  if (!task_id) throw new Error('taskLease.acquire: task_id required')
  if (!brain_id) throw new Error('taskLease.acquire: brain_id required')
  const key = hashTaskId(task_id)
  const keyStr = key.toString()  // pg node driver serialises bigint safely

  const [{ got }] = await db`SELECT pg_try_advisory_lock(${keyStr}::bigint) AS got`
  if (!got) {
    logger.info('taskLease: another brain holds the lock', { task_id, brain_id })
    return null
  }

  try {
    const expiresAt = new Date(Date.now() + ttl_sec * 1000)
    const [row] = await db`
      INSERT INTO task_leases
        (task_id, brain_id, lock_key, acquired_at, expires_at, heartbeat_at)
      VALUES
        (${task_id}, ${brain_id}, ${keyStr}, NOW(), ${expiresAt}, NOW())
      ON CONFLICT (task_id) DO UPDATE
        SET brain_id = EXCLUDED.brain_id,
            acquired_at = EXCLUDED.acquired_at,
            expires_at = EXCLUDED.expires_at,
            heartbeat_at = EXCLUDED.heartbeat_at,
            released_at = NULL
      RETURNING *
    `
    logger.info('taskLease: acquired', { task_id, brain_id, expires_at: row.expires_at })
    return row
  } catch (err) {
    // Release the advisory lock if the row write failed, so the key
    // isn't held forever. pg_try_advisory_lock persists for the session
    // until pg_advisory_unlock is called, so we must clean up.
    await db`SELECT pg_advisory_unlock(${keyStr}::bigint)`.catch(() => {})
    throw err
  }
}

/**
 * Refresh heartbeat_at + extend expires_at. Returns true if we still own
 * the lease, false if something else took over (caller must abort).
 */
async function heartbeat({ task_id, brain_id, ttl_sec = DEFAULT_TTL_SEC }) {
  const expiresAt = new Date(Date.now() + ttl_sec * 1000)
  const [row] = await db`
    UPDATE task_leases
    SET heartbeat_at = NOW(), expires_at = ${expiresAt}
    WHERE task_id = ${task_id}
      AND brain_id = ${brain_id}
      AND released_at IS NULL
    RETURNING *
  `
  return !!row
}

async function releaseTaskLease({ task_id, brain_id }) {
  const key = hashTaskId(task_id)
  const keyStr = key.toString()
  await db`
    UPDATE task_leases
    SET released_at = NOW()
    WHERE task_id = ${task_id}
      AND brain_id = ${brain_id}
      AND released_at IS NULL
  `
  // Release the advisory lock unconditionally - idempotent.
  await db`SELECT pg_advisory_unlock(${keyStr}::bigint)`.catch(() => {})
  logger.info('taskLease: released', { task_id, brain_id })
}

/**
 * Sweep: release any leases whose expires_at has passed and which have
 * no heartbeat in the last ttl_sec. Called from a cron; returns count.
 */
async function sweepExpiredLeases() {
  const rows = await db`
    UPDATE task_leases
    SET released_at = NOW()
    WHERE released_at IS NULL
      AND expires_at < NOW() - INTERVAL '10 seconds'
    RETURNING task_id, lock_key::text AS lock_key
  `
  for (const row of rows) {
    try {
      await db`SELECT pg_advisory_unlock(${row.lock_key}::bigint)`
    } catch (err) {
      logger.debug('taskLease sweep: unlock failed', { task_id: row.task_id, error: err.message })
    }
  }
  if (rows.length > 0) {
    logger.info('taskLease sweep: released expired leases', { count: rows.length })
  }
  return rows.length
}

module.exports = {
  acquireTaskLease,
  heartbeat,
  releaseTaskLease,
  sweepExpiredLeases,
  hashTaskId,
  DEFAULT_TTL_SEC,
}

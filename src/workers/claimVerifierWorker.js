'use strict'

/**
 * claimVerifierWorker - OBSERVABILITY_SPEC §3 per-action verification loop.
 *
 * Every 30s, pops conductor_claims rows where verification_status='pending'
 * AND claimed_at is within the last 5 minutes. Dispatches an action-specific
 * verifier, then UPDATEs the row with verified_at and verification_lag_ms.
 *
 * Action dispatch:
 *   deployed / committed → git rev-parse --verify <sha>^{commit} in CWD.
 *   emailed              → SELECT from email_threads/email_events by message_id.
 *   scheduled            → SELECT from os_scheduled_tasks by task_id.
 *   forked               → SELECT from os_forks by fork_id.
 *   (anything else)      → verification_status = 'action_unknown'.
 *
 * All verifier paths fail closed to 'failed' on query error so a missing
 * row or a thrown exception both surface on the /ops dashboard rather
 * than silently looking "pending forever". The 5-minute claimed-at
 * ceiling means a verifier that can't find its ground truth within 5min
 * stops being retried (otherwise a bad claim would burn worker cycles
 * indefinitely).
 */

const { execFile } = require('child_process')
const { promisify } = require('util')
const db = require('../config/db')
const logger = require('../config/logger')

const execFileP = promisify(execFile)

const POLL_INTERVAL_MS = parseInt(process.env.CLAIM_VERIFIER_POLL_MS || '30000', 10)
const MAX_CLAIMED_AGE = '5 minutes'
const BATCH_LIMIT = 20
const GIT_TIMEOUT_MS = 5_000

let _timer = null
let _inFlight = false

// Allowed sha characters only; rejects command injection via the claim
// handle (ground truth is conductor_claims.handle_kv which is JSONB in
// the DB, but treat it as untrusted anyway - the claim grammar parser
// came from arbitrary assistant text).
const SHA_RE = /^[0-9a-f]{7,40}$/i

function _validSha(sha) {
  return typeof sha === 'string' && SHA_RE.test(sha)
}

async function _verifyGitSha(sha) {
  if (!_validSha(sha)) return { ok: false, detail: 'invalid_sha_shape' }
  try {
    await execFileP('git', ['rev-parse', '--verify', `${sha}^{commit}`], {
      cwd: process.cwd(),
      timeout: GIT_TIMEOUT_MS,
    })
    return { ok: true, detail: null }
  } catch (err) {
    // git exits non-zero for unknown sha; stderr contains the reason.
    return { ok: false, detail: (err.stderr || err.message || 'git_failed').toString().slice(0, 200) }
  }
}

async function _verifyEmailed(handle) {
  const msgId = handle && handle.message_id
  if (!msgId || typeof msgId !== 'string') {
    return { ok: false, detail: 'missing_message_id' }
  }
  // Strip angle brackets if present - Gmail Message-Id headers often come
  // wrapped as <abc@mail.gmail.com>; email_threads stores bare ids.
  const bare = msgId.replace(/^<|>$/g, '')
  try {
    // Primary: email_threads.gmail_message_ids is TEXT[].
    const rows = await db`
      SELECT 1 FROM email_threads
      WHERE ${bare} = ANY(COALESCE(gmail_message_ids, ARRAY[]::text[]))
      LIMIT 1
    `
    if (rows.length > 0) return { ok: true, detail: null }
    // Secondary: email_events.gmail_message_id direct match.
    const rows2 = await db`
      SELECT 1 FROM email_events WHERE gmail_message_id = ${bare} LIMIT 1
    `
    if (rows2.length > 0) return { ok: true, detail: null }
    return { ok: false, detail: 'message_id_not_found' }
  } catch (err) {
    return { ok: false, detail: `db_error:${String(err.message).slice(0, 150)}` }
  }
}

async function _verifyScheduled(handle) {
  const taskId = handle && handle.task_id
  if (!taskId || typeof taskId !== 'string') {
    return { ok: false, detail: 'missing_task_id' }
  }
  try {
    const rows = await db`
      SELECT 1 FROM os_scheduled_tasks WHERE id = ${taskId} LIMIT 1
    `
    if (rows.length > 0) return { ok: true, detail: null }
    return { ok: false, detail: 'task_id_not_found' }
  } catch (err) {
    return { ok: false, detail: `db_error:${String(err.message).slice(0, 150)}` }
  }
}

async function _verifyForked(handle) {
  const forkId = handle && handle.fork_id
  if (!forkId || typeof forkId !== 'string') {
    return { ok: false, detail: 'missing_fork_id' }
  }
  try {
    const rows = await db`
      SELECT 1 FROM os_forks WHERE fork_id = ${forkId} LIMIT 1
    `
    if (rows.length > 0) return { ok: true, detail: null }
    return { ok: false, detail: 'fork_id_not_found' }
  } catch (err) {
    return { ok: false, detail: `db_error:${String(err.message).slice(0, 150)}` }
  }
}

/**
 * Dispatch one claim row. Returns the new status + detail so the caller
 * can run the UPDATE and compute lag. Internal - test hook exposes it.
 */
async function _verifyOne(row) {
  const action = row.action
  const handle = row.handle_kv || {}
  switch (action) {
    case 'deployed':
    case 'committed': {
      const { ok, detail } = await _verifyGitSha(handle.sha)
      return { status: ok ? 'verified' : 'failed', detail }
    }
    case 'emailed': {
      const { ok, detail } = await _verifyEmailed(handle)
      return { status: ok ? 'verified' : 'failed', detail }
    }
    case 'scheduled': {
      const { ok, detail } = await _verifyScheduled(handle)
      return { status: ok ? 'verified' : 'failed', detail }
    }
    case 'forked': {
      const { ok, detail } = await _verifyForked(handle)
      return { status: ok ? 'verified' : 'failed', detail }
    }
    default:
      return { status: 'action_unknown', detail: `no_verifier_for_action:${action}` }
  }
}

async function tick() {
  if (_inFlight) return
  _inFlight = true
  try {
    // MAX_CLAIMED_AGE is an internal constant ('5 minutes') - never a
    // caller-supplied value - so inlining it here is safe and avoids
    // driver-specific interval parameter quirks.
    const rows = await db`
      SELECT id, session_id, action, handle_kv, claimed_at
      FROM conductor_claims
      WHERE verification_status = 'pending'
        AND claimed_at > NOW() - INTERVAL '5 minutes'
      ORDER BY claimed_at ASC
      LIMIT ${BATCH_LIMIT}
    `
    if (rows.length === 0) return

    for (const row of rows) {
      try {
        const { status, detail } = await _verifyOne(row)
        const lagMs = Date.now() - new Date(row.claimed_at).getTime()
        await db`
          UPDATE conductor_claims
          SET verification_status = ${status},
              verification_detail = ${detail},
              verified_at = NOW(),
              verification_lag_ms = ${Math.max(0, lagMs)}
          WHERE id = ${row.id}
            AND verification_status = 'pending'
        `
      } catch (err) {
        logger.warn('claimVerifierWorker: verification row failed', {
          claim_id: row.id, action: row.action, error: err.message,
        })
      }
    }
  } catch (err) {
    logger.warn('claimVerifierWorker: poll cycle failed (non-fatal)', { error: err.message })
  } finally {
    _inFlight = false
  }
}

function start() {
  if (_timer) return
  _timer = setInterval(() => {
    tick().catch((err) => logger.error('claimVerifierWorker: tick threw', { error: err.message }))
  }, POLL_INTERVAL_MS)
  if (_timer.unref) _timer.unref()
  logger.info('claimVerifierWorker started', { poll_ms: POLL_INTERVAL_MS })
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

module.exports = {
  start,
  stop,
  tick,
  // test hooks
  _verifyOne,
  _verifyGitSha,
  _verifyEmailed,
  _verifyScheduled,
  _verifyForked,
}

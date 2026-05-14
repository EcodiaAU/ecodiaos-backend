'use strict'

/**
 * outboundEmailDelayQueueWorker — flushes approved rows in the 24h
 * delay queue (§3.4 SECURITY_HARDENING).
 *
 * Audit 2026-05-13 P0 #21: outboundEmailDelayQueue.listReadyToSend
 * existed but had NO CALLER. Approved rows sat at status='approved'
 * indefinitely; the 24h safety net silently never delivered, so any
 * email that hit the delay queue was effectively dropped after Tate
 * approved it. This worker closes the loop.
 *
 * Loop (every 60s):
 *   1. claimNextReady — atomic SELECT + UPDATE to 'sending'
 *   2. send via gmailService.sendEmail (the row was already approved
 *      by Tate; that approval IS the tier-3 decision, so we go direct
 *      not through sendEmailGated)
 *   3. on success: markSent
 *   4. on failure: _releaseClaimForRetry (flips back to 'approved',
 *      bumps attempts; after 5 attempts the row stays at 'error')
 *
 * Idempotency: claimNextReady's FOR UPDATE SKIP LOCKED prevents two
 * workers picking the same row. Within a single tick the worker
 * processes up to MAX_PER_TICK rows so a single backed-up tick can
 * drain the backlog without monopolising.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const POLL_INTERVAL_MS = parseInt(process.env.DELAY_QUEUE_WORKER_POLL_MS || '60000', 10)
const MAX_PER_TICK = parseInt(process.env.DELAY_QUEUE_WORKER_MAX_PER_TICK || '20', 10)

let _timer = null
let _inFlight = false

async function _sendOne(row) {
  // Lazy require to avoid cycles at module load.
  const gmailService = require('../services/gmailService')
  const queue = require('../services/outboundEmailDelayQueue')

  const to = row.to_address
  const cc = Array.isArray(row.cc_addresses) ? row.cc_addresses : null
  const bcc = Array.isArray(row.bcc_addresses) ? row.bcc_addresses : null

  try {
    const result = await gmailService.sendEmail({
      from: row.from_address || undefined,
      to,
      cc,
      bcc,
      subject: row.subject,
      body: row.body,
      threadId: row.thread_id || undefined,
    })
    await queue.markSent({ id: row.id, message_id: result.message_id })
    logger.info('delay-queue-worker: sent', {
      id: row.id, to, subject: row.subject, message_id: result.message_id,
    })
    return { ok: true }
  } catch (err) {
    logger.warn('delay-queue-worker: send failed, will retry', {
      id: row.id, to, subject: row.subject, error: err.message,
    })
    await queue._releaseClaimForRetry({ id: row.id, error_message: err.message })
    return { ok: false, error: err.message }
  }
}

async function _tick() {
  if (_inFlight) {
    logger.debug('delay-queue-worker: prior tick still in flight, skipping')
    return
  }
  _inFlight = true
  try {
    const queue = require('../services/outboundEmailDelayQueue')
    let sent = 0
    let failed = 0
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const row = await queue.claimNextReady()
      if (!row) break
      const { ok } = await _sendOne(row)
      if (ok) sent++
      else failed++
    }
    if (sent > 0 || failed > 0) {
      logger.info('delay-queue-worker: tick complete', { sent, failed })
    }
  } catch (err) {
    logger.error('delay-queue-worker: tick threw', { error: err.message })
  } finally {
    _inFlight = false
  }
}

function start() {
  if (_timer) return
  // First fire after a short delay so DB pool / migrations are settled.
  setTimeout(() => { _tick().catch(() => {}) }, 5_000)
  _timer = setInterval(() => { _tick().catch(() => {}) }, POLL_INTERVAL_MS)
  if (_timer.unref) _timer.unref()
  logger.info('delay-queue-worker: started', { pollMs: POLL_INTERVAL_MS })
}

function stop() {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
    logger.info('delay-queue-worker: stopped')
  }
}

module.exports = { start, stop, _tick, _sendOne }

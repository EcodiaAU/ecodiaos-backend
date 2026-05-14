'use strict'

/**
 * outboundEmailDelayQueue - §3.4 24-hour delay queue for unknown recipients.
 *
 * Any outbound email to an address Ecodia has not corresponded with in the
 * last 30 days enters this queue. Tate gets a daily digest with one-click
 * approve/discard. Known-recipient mail bypasses and sends immediately.
 *
 * Public API:
 *   isKnownRecipient(to) -> boolean
 *   enqueue({ from, to, cc, bcc, subject, body, threadId, sessionId,
 *            commitment }) -> row
 *   listPending() -> rows (for the daily digest)
 *   decide({ id, decision }) -> row (decision: 'approve' | 'discard')
 *   listReadyToSend() -> rows whose decision is approve AND release_at has passed
 *   markSent({ id, message_id })
 *   markError({ id, error_message })
 *
 * Known-recipient definition: at least one row in email_threads OR
 * crm_activities within the last 30 days mentions the address in a
 * from/to/participant field. Query is intentionally loose (any presence)
 * because the 24h delay is a safety net, not an access-control decision.
 *
 * DB: ../config/db tagged template.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const DEFAULT_DELAY_MS = 24 * 60 * 60 * 1000 // 24 hours
const KNOWN_RECIPIENT_WINDOW_DAYS = 30

async function isKnownRecipient(emailAddress) {
  if (!emailAddress || typeof emailAddress !== 'string') return false
  const lowered = emailAddress.toLowerCase()
  // Audit 2026-05-13 P1: previous query used `email_threads.last_message_at`
  // — but the canonical column on email_threads is `received_at`. The
  // primary query silently failed via the .catch, fallback used the same
  // (broken) column. Net: isKnownRecipient returned `false` for ~everyone,
  // every email got queued including replies to known clients. Use
  // COALESCE(last_message_at, received_at, updated_at) so the query works
  // across both observed schemas.
  try {
    const rows = await db`
      SELECT 1
      FROM email_threads
      WHERE (
        LOWER(from_email) = ${lowered}
        OR LOWER(to_email) = ${lowered}
        OR ${lowered} = ANY(ARRAY(SELECT LOWER(unnest(COALESCE(participants, ARRAY[]::text[])))))
      )
        AND COALESCE(received_at, updated_at) >= NOW() - (${KNOWN_RECIPIENT_WINDOW_DAYS} || ' days')::INTERVAL
      LIMIT 1
    `
    if (rows.length > 0) return true
  } catch (err) {
    // If the schema differs (e.g. no participants column yet), fall back
    // to the simpler check. Log once per outage; don't fail-close here.
    logger.debug('delay queue: email_threads check fell back', { error: err.message })
    try {
      const rows2 = await db`
        SELECT 1 FROM email_threads
        WHERE (LOWER(from_email) = ${lowered} OR LOWER(to_email) = ${lowered})
          AND COALESCE(received_at, updated_at) >= NOW() - (${KNOWN_RECIPIENT_WINDOW_DAYS} || ' days')::INTERVAL
        LIMIT 1
      `
      if (rows2.length > 0) return true
    } catch (err2) {
      logger.warn('delay queue: known-recipient fallback failed', { error: err2.message })
    }
  }

  // Secondary: crm_activities.contact_email.
  try {
    const rows = await db`
      SELECT 1 FROM crm_activities
      WHERE LOWER(contact_email) = ${lowered}
        AND created_at >= NOW() - (${KNOWN_RECIPIENT_WINDOW_DAYS} || ' days')::INTERVAL
      LIMIT 1
    `
    if (rows.length > 0) return true
  } catch (err) {
    logger.debug('delay queue: crm_activities check skipped', { error: err.message })
  }
  return false
}

async function enqueue({
  from,
  to,
  cc,
  bcc,
  subject,
  body,
  threadId,
  sessionId,
  commitment,
  delayMs,
}) {
  if (!to || !subject) {
    throw new Error('delay queue: enqueue requires to + subject')
  }
  const releaseAt = new Date(Date.now() + (Number.isFinite(delayMs) ? delayMs : DEFAULT_DELAY_MS))
  const risk = commitment?.risk || null
  const categories = Array.isArray(commitment?.categories) ? commitment.categories : []
  const [row] = await db`
    INSERT INTO outbound_email_delay_queue
      (session_id, from_address, to_address, cc_addresses, bcc_addresses,
       subject, body, thread_id, commitment_risk, commitment_categories,
       release_at, status)
    VALUES
      (${sessionId || null},
       ${from || ''},
       ${Array.isArray(to) ? to[0] : to},
       ${cc && Array.isArray(cc) ? cc : (cc ? [cc] : [])},
       ${bcc && Array.isArray(bcc) ? bcc : (bcc ? [bcc] : [])},
       ${subject},
       ${body},
       ${threadId || null},
       ${risk},
       ${categories},
       ${releaseAt},
       'pending')
    RETURNING *
  `
  logger.info('delay queue: enqueued outbound email', {
    id: row.id,
    to: row.to_address,
    release_at: row.release_at,
    risk,
  })
  return row
}

async function listPending() {
  const rows = await db`
    SELECT *
    FROM outbound_email_delay_queue
    WHERE status = 'pending'
    ORDER BY queued_at DESC
  `
  return rows
}

async function decide({ id, decision }) {
  if (!['approve', 'discard'].includes(decision)) {
    throw new Error(`delay queue: decision must be 'approve' or 'discard', got: ${decision}`)
  }
  const nextStatus = decision === 'approve' ? 'approved' : 'discarded'
  const [row] = await db`
    UPDATE outbound_email_delay_queue
    SET status = ${nextStatus},
        tate_decision = ${decision},
        tate_decision_at = NOW()
    WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `
  if (!row) {
    throw new Error(`delay queue: row ${id} not pending (already decided or missing)`)
  }
  logger.info('delay queue: decision recorded', { id, decision })
  return row
}

async function listReadyToSend() {
  const rows = await db`
    SELECT *
    FROM outbound_email_delay_queue
    WHERE status = 'approved'
      AND release_at <= NOW()
    ORDER BY release_at ASC
    LIMIT 20
  `
  return rows
}

/**
 * Audit 2026-05-13 P0 #21: listReadyToSend existed but had no consumer.
 * Approved rows sat forever and the 24h safety net silently never
 * delivered. The new outboundDelayQueueWorker calls this primitive
 * (claimNextReady) to atomically transition `approved` → `sending`,
 * preventing duplicate dispatch if multiple workers run.
 * Returns the claimed row (or null if nothing is ready).
 */
async function claimNextReady() {
  // CTE with FOR UPDATE SKIP LOCKED: pick one approved+ready row, lock
  // it, and update its status atomically. Concurrent workers each get a
  // different row (or null).
  const [row] = await db`
    WITH next_row AS (
      SELECT id
      FROM outbound_email_delay_queue
      WHERE status = 'approved' AND release_at <= NOW()
      ORDER BY release_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbound_email_delay_queue oe
    SET status = 'sending', sending_started_at = NOW()
    FROM next_row
    WHERE oe.id = next_row.id
    RETURNING oe.*
  `
  return row || null
}

/**
 * If the dispatch fails AND the row should be retried later (transient
 * network/gmail failure), flip back to 'approved' so the next sweep
 * picks it up. Bumps attempt count; after 5 attempts the row is left
 * at status='error' for human review (audit M-medium: no max-retry).
 */
async function _releaseClaimForRetry({ id, error_message }) {
  await db`
    UPDATE outbound_email_delay_queue
    SET status = CASE
          WHEN COALESCE(attempts, 0) + 1 >= 5 THEN 'error'
          ELSE 'approved'
        END,
        attempts = COALESCE(attempts, 0) + 1,
        error_message = ${String(error_message || '').slice(0, 500)},
        sending_started_at = NULL
    WHERE id = ${id}
  `
}

async function markSent({ id, message_id }) {
  await db`
    UPDATE outbound_email_delay_queue
    SET status = 'sent', sent_at = NOW(), sent_message_id = ${message_id || null}
    WHERE id = ${id}
  `
}

async function markError({ id, error_message }) {
  await db`
    UPDATE outbound_email_delay_queue
    SET error_message = ${String(error_message || '').slice(0, 500)}
    WHERE id = ${id}
  `
}

/**
 * Policy wrapper: given a planned outbound send, decide whether to queue
 * it or let it through. Returns { action: 'send' | 'queued', row? }.
 *
 * Callers should invoke this from gmailService.sendEmail (or an upstream
 * sender) as the very last gate before actually dispatching.
 */
async function routeOutbound({
  from,
  to,
  cc,
  bcc,
  subject,
  body,
  threadId,
  sessionId,
  commitment,
  delayMs,
}) {
  const primaryTo = Array.isArray(to) ? to[0] : to
  if (!primaryTo) {
    throw new Error('delay queue: routeOutbound requires to')
  }
  if (await isKnownRecipient(primaryTo)) {
    return { action: 'send', row: null }
  }
  const row = await enqueue({
    from, to, cc, bcc, subject, body, threadId, sessionId, commitment, delayMs,
  })
  return { action: 'queued', row }
}

module.exports = {
  isKnownRecipient,
  enqueue,
  listPending,
  decide,
  listReadyToSend,
  claimNextReady,
  _releaseClaimForRetry,
  markSent,
  markError,
  routeOutbound,
  DEFAULT_DELAY_MS,
  KNOWN_RECIPIENT_WINDOW_DAYS,
}

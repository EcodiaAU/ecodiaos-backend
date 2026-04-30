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
  try {
    // Check email_threads.participants (text[]) and from_email within the
    // last N days. email_threads is the primary source of truth for
    // Gmail-side activity.
    const rows = await db`
      SELECT 1
      FROM email_threads
      WHERE (
        LOWER(from_email) = ${lowered}
        OR LOWER(to_email) = ${lowered}
        OR ${lowered} = ANY(ARRAY(SELECT LOWER(unnest(COALESCE(participants, ARRAY[]::text[])))))
      )
        AND last_message_at >= NOW() - (${KNOWN_RECIPIENT_WINDOW_DAYS} || ' days')::INTERVAL
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
          AND last_message_at >= NOW() - (${KNOWN_RECIPIENT_WINDOW_DAYS} || ' days')::INTERVAL
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
  markSent,
  markError,
  routeOutbound,
  DEFAULT_DELAY_MS,
  KNOWN_RECIPIENT_WINDOW_DAYS,
}

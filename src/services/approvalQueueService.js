'use strict'

/**
 * approvalQueueService.js (2026-05-26)
 *
 * Unified Tate-approval queue: enqueue helpers + pending-row reads.
 * Resolution + rollback live in approvalQueueResolutionService.js.
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md.
 *
 * Producers (one named method per source, NEVER ad-hoc inserts):
 *   gmailService.draftForReview         -> enqueueEmailSend
 *   releaseService.proposeShip          -> enqueueReleaseShip
 *   spendService.proposeSpend           -> enqueueSpendExecute
 *   doctrineService.proposePattern      -> enqueueDoctrineWrite
 *   observerSignalsService.flagForTate  -> enqueueObserverAck
 *   Postgres trigger on status_board    -> (direct INSERT, see migration 135)
 *
 * Enqueue methods return { ok, id, deduped } where deduped=true means an
 * existing row with the same idempotency_key already exists and we returned
 * its id (idempotent producer pattern, matches actionVerification).
 */

const db = require('../config/db')
const logger = require('../config/logger')

const ITEM_TYPES = new Set([
  'email_send', 'release_ship', 'spend_execute',
  'doctrine_write', 'observer_ack', 'free_text',
])

const URGENCIES = new Set(['critical', 'normal', 'low'])
const DEFAULT_VERDICTS = new Set(['send', 'cancel', 'expire', 'wait'])

const SPEND_QUEUE_THRESHOLD_AUD = parseFloat(process.env.SPEND_QUEUE_THRESHOLD || '200')

function _stack(producer) {
  const e = new Error()
  const frames = (e.stack || '').split('\n').slice(2, 6).join(' | ')
  return `${producer || 'unknown'} :: ${frames}`
}

async function _enqueue({
  item_type, title, body = null, payload = {}, action = {},
  default_verdict = 'wait', decay_at = null, urgency = 'normal',
  status_board_ref = null, source_ref = null,
  idempotency_key = null, producer = 'unknown',
}) {
  if (!ITEM_TYPES.has(item_type)) return { ok: false, error: `unknown item_type ${item_type}` }
  if (!URGENCIES.has(urgency)) return { ok: false, error: `unknown urgency ${urgency}` }
  if (!DEFAULT_VERDICTS.has(default_verdict)) return { ok: false, error: `unknown default_verdict ${default_verdict}` }
  if (default_verdict !== 'wait' && !decay_at) {
    return { ok: false, error: 'default_verdict not wait but decay_at missing' }
  }
  if (!title || typeof title !== 'string') return { ok: false, error: 'title required' }

  try {
    const rows = await db`
      INSERT INTO approval_queue (
        item_type, title, body, payload, action, default_verdict,
        decay_at, urgency, status_board_ref, source_ref,
        idempotency_key, created_by_stack
      ) VALUES (
        ${item_type}, ${title.slice(0, 240)}, ${body},
        ${db.json(payload)}, ${db.json(action)},
        ${default_verdict}, ${decay_at}, ${urgency},
        ${status_board_ref}, ${source_ref},
        ${idempotency_key}, ${_stack(producer)}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, created_at
    `

    if (rows.length === 0 && idempotency_key) {
      // Dedup hit
      const existing = await db`
        SELECT id, resolved_at FROM approval_queue WHERE idempotency_key = ${idempotency_key} LIMIT 1
      `
      if (existing.length > 0) {
        return { ok: true, id: existing[0].id, deduped: true, resolved: existing[0].resolved_at != null }
      }
    }

    logger.info('approval_queue enqueued', { item_type, id: rows[0]?.id, urgency, producer })

    // Fire-and-forget notification fanout (APNs always, SMS if critical).
    // Lazy-require so the surfacing module's apns/db deps do not affect
    // import-time of this service in test contexts.
    try {
      const surfacing = require('./approvalQueueSurfacing')
      surfacing.notifyOnInsert(rows[0].id).catch(err =>
        logger.debug('approval_queue notifyOnInsert fan-out soft-failed', { error: err.message })
      )
    } catch (err) {
      logger.debug('approval_queue surfacing module unavailable', { error: err.message })
    }

    return { ok: true, id: rows[0].id, created_at: rows[0].created_at, deduped: false }
  } catch (err) {
    logger.warn('approval_queue enqueue failed', { error: err.message, item_type, producer })
    return { ok: false, error: err.message }
  }
}

// ---------- Per-producer convenience wrappers ----------

/**
 * Enqueue a drafted client email for Tate review.
 * @param {object} args
 * @param {string} args.thread_id    Gmail thread id
 * @param {string} args.recipient    e.g. "kurt@coexist.com.au"
 * @param {string} args.subject
 * @param {string} args.draft_body
 * @param {string} [args.reason]     Why this is queued (e.g. "commitment detected")
 * @param {boolean} [args.critical]  true if topic flagged P1 or sender has 3+ unanswered
 */
async function enqueueEmailSend({
  thread_id, recipient, subject, draft_body, reason = null, critical = false,
} = {}) {
  if (!thread_id || !recipient || !draft_body) {
    return { ok: false, error: 'thread_id, recipient, draft_body required' }
  }
  return _enqueue({
    item_type: 'email_send',
    title: `Email to ${recipient}: ${subject || '(no subject)'}`.slice(0, 240),
    body: draft_body,
    payload: { thread_id, recipient, subject, draft_body, reason },
    action: { handler: 'email_send', thread_id, body: draft_body },
    default_verdict: 'send',  // 48h decay -> send-with-holding-reply path
    decay_at: new Date(Date.now() + 48 * 3600 * 1000),
    urgency: critical ? 'critical' : 'normal',
    source_ref: `gmail:${thread_id}`,
    idempotency_key: `email_send:${thread_id}:${_shortHash(draft_body)}`,
    producer: 'gmailService.draftForReview',
  })
}

/**
 * Enqueue a release for Tate to ship.
 * No decay (release_ship sits forever until Tate acts).
 */
async function enqueueReleaseShip({
  build_id, app_slug, version, release_notes, ship_action,
} = {}) {
  if (!build_id || !app_slug || !ship_action) {
    return { ok: false, error: 'build_id, app_slug, ship_action required' }
  }
  return _enqueue({
    item_type: 'release_ship',
    title: `Ship ${app_slug} ${version || ''}`.trim(),
    body: release_notes || '(no release notes)',
    payload: { build_id, app_slug, version, release_notes },
    action: { handler: 'release_ship', ...ship_action },
    default_verdict: 'wait',
    decay_at: null,
    urgency: 'normal',  // release_ship is never critical per spec
    source_ref: `build:${build_id}`,
    idempotency_key: `release_ship:${app_slug}:${build_id}`,
    producer: 'releaseService.proposeShip',
  })
}

/**
 * Enqueue a spend for Tate approval. Below threshold: caller should bypass.
 * Decay: 7d -> cancel (declines).
 */
async function enqueueSpendExecute({
  amount_aud, vendor, description, execute_action, idempotency_suffix,
} = {}) {
  if (!amount_aud || !vendor || !execute_action) {
    return { ok: false, error: 'amount_aud, vendor, execute_action required' }
  }
  if (amount_aud < SPEND_QUEUE_THRESHOLD_AUD) {
    return { ok: false, error: `amount below SPEND_QUEUE_THRESHOLD (${SPEND_QUEUE_THRESHOLD_AUD}); caller should execute directly` }
  }
  const critical = amount_aud > 500
  return _enqueue({
    item_type: 'spend_execute',
    title: `Spend $${amount_aud} AUD to ${vendor}`,
    body: description || '(no description)',
    payload: { amount_aud, vendor, description },
    action: { handler: 'spend_execute', ...execute_action },
    default_verdict: 'cancel',
    decay_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    urgency: critical ? 'critical' : 'normal',
    source_ref: idempotency_suffix ? `spend:${vendor}:${idempotency_suffix}` : `spend:${vendor}`,
    idempotency_key: `spend_execute:${vendor}:${idempotency_suffix || Date.now()}`,
    producer: 'spendService.proposeSpend',
  })
}

/**
 * Enqueue a proposed pattern write. Load-bearing patterns only.
 * Decay: 14d -> cancel.
 */
async function enqueueDoctrineWrite({
  pattern_path, body, summary, idempotency_suffix,
} = {}) {
  if (!pattern_path || !body) {
    return { ok: false, error: 'pattern_path and body required' }
  }
  return _enqueue({
    item_type: 'doctrine_write',
    title: `Doctrine: ${pattern_path.split('/').pop()}`,
    body: summary || body.slice(0, 1000),
    payload: { pattern_path, body, summary },
    action: { handler: 'doctrine_write', pattern_path, body },
    default_verdict: 'cancel',
    decay_at: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    urgency: 'normal',  // never critical per spec
    source_ref: `doctrine:${pattern_path}`,
    idempotency_key: `doctrine_write:${pattern_path}:${idempotency_suffix || _shortHash(body)}`,
    producer: 'doctrineService.proposePattern',
  })
}

/**
 * Enqueue an observer signal for Tate-attention. Decay: 24h -> auto-ack.
 */
async function enqueueObserverAck({
  signal_id, signal_kind, severity, body, ack_action, dismiss_action,
} = {}) {
  if (!signal_id || !ack_action) {
    return { ok: false, error: 'signal_id, ack_action required' }
  }
  const critical = severity === 'P1'
  return _enqueue({
    item_type: 'observer_ack',
    title: `Observer: ${signal_kind || 'signal'}`,
    body: body || '(no body)',
    payload: { signal_id, signal_kind, severity },
    action: { handler: 'observer_ack', signal_id, ack: ack_action, dismiss: dismiss_action },
    default_verdict: 'expire',  // 24h -> auto-ack (treats expiry as ack)
    decay_at: new Date(Date.now() + 24 * 3600 * 1000),
    urgency: critical ? 'critical' : 'normal',
    source_ref: `observer:${signal_id}`,
    idempotency_key: `observer_ack:${signal_id}`,
    producer: 'observerSignalsService.flagForTateReview',
  })
}

// ---------- Read helpers ----------

async function listPending({ urgency = null, limit = 50 } = {}) {
  try {
    if (urgency) {
      const rows = await db`
        SELECT id, item_type, title, urgency, decay_at, created_at,
               status_board_ref, source_ref
        FROM approval_queue
        WHERE resolved_at IS NULL AND urgency = ${urgency}
        ORDER BY created_at ASC LIMIT ${limit}
      `
      return { ok: true, rows }
    }
    const rows = await db`
      SELECT id, item_type, title, urgency, decay_at, created_at,
             status_board_ref, source_ref
      FROM approval_queue
      WHERE resolved_at IS NULL
      ORDER BY
        CASE urgency WHEN 'critical' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        created_at ASC
      LIMIT ${limit}
    `
    return { ok: true, rows }
  } catch (err) {
    logger.warn('approval_queue listPending failed', { error: err.message })
    return { ok: false, error: err.message }
  }
}

async function getById(id) {
  try {
    const rows = await db`SELECT * FROM approval_queue WHERE id = ${id}`
    if (rows.length === 0) return { ok: false, error: 'not found' }
    return { ok: true, row: rows[0] }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function countsByUrgency() {
  try {
    const rows = await db`
      SELECT urgency, COUNT(*)::int as n
      FROM approval_queue
      WHERE resolved_at IS NULL
      GROUP BY urgency
    `
    const counts = { critical: 0, normal: 0, low: 0 }
    for (const r of rows) counts[r.urgency] = r.n
    counts.total = counts.critical + counts.normal + counts.low
    return { ok: true, counts }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ---------- internals ----------

function _shortHash(s) {
  // Cheap deterministic hash for idempotency keys. NOT cryptographic.
  let h = 0
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return (h >>> 0).toString(36)
}

module.exports = {
  // producers
  enqueueEmailSend,
  enqueueReleaseShip,
  enqueueSpendExecute,
  enqueueDoctrineWrite,
  enqueueObserverAck,
  // reads
  listPending,
  getById,
  countsByUrgency,
  // constants
  SPEND_QUEUE_THRESHOLD_AUD,
  ITEM_TYPES,
}

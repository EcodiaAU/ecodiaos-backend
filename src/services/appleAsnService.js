'use strict'

/**
 * Apple App Store Server Notifications (ASN V2) handler.
 *
 * Receives the already-verified, fully-decoded outer payload (with inner
 * signedTransactionInfo + signedRenewalInfo decoded too) from the webhook
 * shim, then routes per the apple-asn-handler routine spec:
 *
 *   A. SUBSCRIBED + INITIAL_BUY      -> new paying user (no SMS for Co-Exist)
 *   B. DID_RENEW                      -> recurring revenue (no SMS)
 *   C. DID_FAIL_TO_RENEW + BILLING_RETRY -> dunning (status_board only if high-value)
 *   D. EXPIRED                        -> subscription ended (aggregate in weekly review)
 *   E. REFUND                         -> revenue reversal (SMS if amount > $50)
 *   F. CONSUMPTION_REQUEST            -> Apple wants our opinion (SMS, 12h window)
 *   G. <any other>                    -> log + surface, decide if handler needed
 *
 * Every fire writes at minimum: idempotency seen-key + apple_iap_events row +
 * Episode node. That hits the "at least three substrate writes" floor
 * required by `cron-fire-must-have-deliverable-not-just-narration.md`.
 *
 * Idempotency is layered:
 *   - kv_store.cowork.apple-asn-handler.seen.{notificationUUID}  (TTL 7d)
 *   - apple_iap_events.notification_uuid UNIQUE constraint (durable)
 * Either one alone would stop Apple's 5-day retry storm from double-recording.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const perceptionBus = require('./perceptionBus')

const SEEN_KEY_PREFIX = 'cowork.apple-asn-handler.seen.'
const SEEN_KEY_TTL_DAYS = 7

const HIGH_VALUE_LIFETIME_CENTS = 20000 // AU$200 - the "high-value user" threshold for route C
const REFUND_SMS_THRESHOLD_CENTS = 5000 // AU$50 - the SMS-Tate threshold for route E

function _cents(price) {
  // Apple's signedTransactionInfo.price is "denomination * 1000" per docs.
  // $9.99 -> 9990. To cents: divide by 10. Returns null if not a finite number.
  if (typeof price !== 'number' || !Number.isFinite(price)) return null
  return Math.round(price / 10)
}

function _toIsoFromMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function _formatAud(cents) {
  if (typeof cents !== 'number') return '?'
  return `AU$${(cents / 100).toFixed(2)}`
}

/**
 * Atomic claim of the seen-key. Returns true iff THIS call inserted the row.
 * INSERT ... ON CONFLICT DO NOTHING RETURNING is the standard Postgres idiom
 * for "did I win the race?" - the RETURNING clause emits zero rows when the
 * conflict path was taken.
 *
 * This collapses two failure modes into one durable gate:
 *   - Apple's 5-day retry storm (sequential duplicates)
 *   - Two concurrent webhook requests racing past a probe-then-insert pattern
 * Both result in `claimed=false` and the routine exits silently.
 */
async function _claimSeenKey(notificationUUID) {
  const key = `${SEEN_KEY_PREFIX}${notificationUUID}`
  const payload = JSON.stringify({ ts: Date.now(), ttl_days: SEEN_KEY_TTL_DAYS })
  try {
    const rows = await db`
      INSERT INTO kv_store (key, value)
      VALUES (${key}, ${payload})
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `
    return rows.length > 0
  } catch (err) {
    logger.warn('appleAsnService: seen-key claim failed (treating as duplicate to fail closed)', {
      error: err.message, notificationUUID,
    })
    return false
  }
}

function _classify(notificationType, subtype) {
  const t = (notificationType || '').toUpperCase()
  const s = (subtype || '').toUpperCase()
  if (t === 'SUBSCRIBED' && s === 'INITIAL_BUY') return 'A'
  if (t === 'DID_RENEW') return 'B'
  if (t === 'DID_FAIL_TO_RENEW' && s === 'BILLING_RETRY') return 'C'
  if (t === 'EXPIRED') return 'D'
  if (t === 'REFUND') return 'E'
  if (t === 'CONSUMPTION_REQUEST') return 'F'
  return 'G'
}

async function _lifetimeCentsFor(originalTransactionId) {
  if (!originalTransactionId) return 0
  try {
    const rows = await db`
      SELECT COALESCE(SUM(price_cents), 0)::int AS cents
      FROM apple_iap_events
      WHERE original_transaction_id = ${originalTransactionId}
        AND notification_type IN ('SUBSCRIBED', 'DID_RENEW')
    `
    return Number(rows[0]?.cents || 0)
  } catch (err) {
    logger.warn('appleAsnService: lifetime cents lookup failed', { error: err.message })
    return 0
  }
}

async function _writeEpisode({ notificationUUID, notificationType, subtype, bundleId, environment, route, substrateWrites }) {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.ensureNode !== 'function') return null
    const name = `apple-asn ${notificationUUID}`
    const description =
      `Type ${notificationType}/${subtype || '-'}, bundleId ${bundleId}, env ${environment}. ` +
      `Route: ${route}. Substrate writes: ${substrateWrites.join(', ')}.`
    const node = await kg.ensureNode({
      label: 'Episode',
      name,
      properties: {
        description,
        type: 'cowork_realisation',
        source: 'apple-asn-handler',
        notification_uuid: notificationUUID,
        notification_type: notificationType,
        bundle_id: bundleId,
        environment,
        route,
        created_at: new Date().toISOString(),
      },
      sourceModule: 'appleAsnService',
      sourceId: notificationUUID,
    })
    return node?.id || node?.elementId || null
  } catch (err) {
    logger.warn('appleAsnService: Episode write failed (non-fatal)', {
      error: err.message, notificationUUID,
    })
    return null
  }
}

async function _markLastFire({ notificationUUID, notificationType, subtype, route }) {
  try {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      notification_uuid: notificationUUID,
      type: notificationType,
      subtype: subtype || null,
      route,
    })
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${'cowork.apple-asn-handler.last_fire'}, ${payload})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('appleAsnService: last_fire write failed', { error: err.message })
  }
}

async function _sendSmsToTate(body) {
  try {
    const alerting = require('./osAlertingService')
    if (alerting && typeof alerting.sendSmsToTate === 'function') {
      await alerting.sendSmsToTate(body)
      return true
    }
  } catch (err) {
    logger.warn('appleAsnService: SMS send failed', { error: err.message })
  }
  return false
}

async function _insertEvent({
  notificationUUID, notificationType, subtype, bundleId, environment, route,
  transactionInfo, renewalInfo, outerSignedDateMs, statusBoardRowId, rawPayload,
}) {
  const txn = transactionInfo || {}
  const priceCents = _cents(txn.price)
  try {
    const rows = await db`
      INSERT INTO apple_iap_events (
        notification_uuid, notification_type, subtype, bundle_id, environment, route,
        transaction_id, original_transaction_id, web_order_line_item_id, product_id,
        price_cents, currency, purchased_at, expires_at, signed_date,
        raw_payload, status_board_row_id
      ) VALUES (
        ${notificationUUID}, ${notificationType}, ${subtype || null}, ${bundleId}, ${environment}, ${route},
        ${txn.transactionId || null}, ${txn.originalTransactionId || null}, ${txn.webOrderLineItemId || null}, ${txn.productId || null},
        ${priceCents}, ${txn.currency || null},
        ${_toIsoFromMs(txn.purchaseDate)}, ${_toIsoFromMs(txn.expiresDate)}, ${_toIsoFromMs(outerSignedDateMs)},
        ${JSON.stringify(rawPayload)}::jsonb, ${statusBoardRowId || null}
      )
      ON CONFLICT (notification_uuid) DO NOTHING
      RETURNING id
    `
    return { id: rows[0]?.id || null, inserted: rows.length > 0, priceCents }
  } catch (err) {
    logger.error('appleAsnService: event insert failed', {
      error: err.message, notificationUUID,
    })
    throw err
  }
}

async function _ensureStatusRow({ name, entityType, priority, nextAction, nextActionBy, context }) {
  try {
    const existing = await db`
      SELECT id FROM status_board
      WHERE name = ${name} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length > 0) return existing[0].id
    const rows = await db`
      INSERT INTO status_board (
        name, entity_type, status, priority, next_action, next_action_by, source, context
      ) VALUES (
        ${name}, ${entityType}, 'pending', ${priority},
        ${nextAction}, ${nextActionBy}, 'apple-asn-handler',
        ${JSON.stringify(context || {})}
      )
      RETURNING id
    `
    return rows[0]?.id || null
  } catch (err) {
    logger.warn('appleAsnService: status_board insert failed', { error: err.message, name })
    return null
  }
}

/**
 * Main entry. Receives the decoded outer payload, plus the inner decoded
 * transactionInfo and renewalInfo, and routes per the spec.
 *
 * @param {object} args
 * @param {object} args.outer            decoded outer ASN payload
 * @param {object|null} args.transactionInfo  decoded signedTransactionInfo (or null)
 * @param {object|null} args.renewalInfo      decoded signedRenewalInfo (or null)
 * @returns {Promise<{ok: boolean, route: string, duplicate?: boolean, sandbox?: boolean, event_id?: string|null}>}
 */
async function processNotification({ outer, transactionInfo, renewalInfo }) {
  if (!outer || typeof outer !== 'object') {
    throw new Error('appleAsnService: outer payload required')
  }
  const notificationUUID = outer.notificationUUID
  const notificationType = outer.notificationType
  const subtype = outer.subtype || null
  const data = outer.data || {}
  const bundleId = data.bundleId || null
  const environment = data.environment || 'Unknown'
  const outerSignedDateMs = outer.signedDate || null

  if (!notificationUUID) {
    throw new Error('appleAsnService: payload missing notificationUUID')
  }
  if (!notificationType) {
    throw new Error('appleAsnService: payload missing notificationType')
  }
  if (!bundleId) {
    throw new Error('appleAsnService: payload missing data.bundleId')
  }

  // Step 1: idempotency. Atomic claim - if we don't win the race we exit.
  const claimed = await _claimSeenKey(notificationUUID)
  if (!claimed) {
    logger.info('appleAsnService: duplicate notification, exiting silently', {
      notificationUUID, notificationType,
    })
    return { ok: true, route: 'duplicate', duplicate: true }
  }

  // Step 2: filter sandbox.
  if (environment === 'Sandbox') {
    await _writeEpisode({
      notificationUUID, notificationType, subtype, bundleId, environment,
      route: 'sandbox',
      substrateWrites: ['kv_store.seen', 'neo4j.episode'],
    })
    await _markLastFire({ notificationUUID, notificationType, subtype, route: 'sandbox' })
    logger.info('appleAsnService: sandbox event, skipping production logic', {
      notificationUUID, notificationType,
    })
    return { ok: true, route: 'sandbox', sandbox: true }
  }

  // Step 3: route by notification type.
  const route = _classify(notificationType, subtype)
  const rawPayloadForDb = {
    ...outer,
    data: {
      ...data,
      // Replace the opaque inner JWTs with their decoded objects.
      signedTransactionInfo: transactionInfo || null,
      signedRenewalInfo: renewalInfo || null,
    },
  }

  let statusBoardRowId = null
  let smsSent = false

  // Per-route side effects (status_board / SMS). Bookkeeping is via the
  // apple_iap_events insert below - weekly-financial-review aggregates from
  // there. Per `coexist-vs-platform-ip-separation.md`, Co-Exist subscription
  // data is NOT auto-aggregated into platform financial dashboards.
  const txn = transactionInfo || {}
  const priceCentsForSwitch = _cents(txn.price)

  switch (route) {
    case 'A':
    case 'B':
    case 'D':
      // No SMS, no status_board row. Just log to apple_iap_events and Episode.
      break

    case 'C': {
      // Dunning. Open a status_board row only if this user's lifetime spend
      // exceeds the high-value threshold.
      const lifetime = await _lifetimeCentsFor(txn.originalTransactionId)
      if (lifetime > HIGH_VALUE_LIFETIME_CENTS) {
        statusBoardRowId = await _ensureStatusRow({
          name: `Apple billing retry: ${txn.productId || bundleId} (lifetime ${_formatAud(lifetime)})`,
          entityType: 'finance',
          priority: 3,
          nextAction: 'High-value subscriber in billing retry. Apple is retrying automatically. Monitor for EXPIRED follow-up.',
          nextActionBy: 'ecodiaos',
          context: {
            notification_uuid: notificationUUID,
            original_transaction_id: txn.originalTransactionId,
            product_id: txn.productId,
            lifetime_cents: lifetime,
            bundle_id: bundleId,
          },
        })
      }
      break
    }

    case 'E': {
      // Refund. Always open a status_board row at P4 for reconciliation
      // visibility. SMS Tate only if amount > $50.
      const amountStr = _formatAud(priceCentsForSwitch)
      statusBoardRowId = await _ensureStatusRow({
        name: `Apple refund: ${amountStr} for ${bundleId}`,
        entityType: 'finance',
        priority: 4,
        nextAction: 'Investigate refund reason if pattern emerges, no per-refund action.',
        nextActionBy: 'ecodiaos',
        context: {
          notification_uuid: notificationUUID,
          transaction_id: txn.transactionId,
          original_transaction_id: txn.originalTransactionId,
          product_id: txn.productId,
          price_cents: priceCentsForSwitch,
          currency: txn.currency,
          bundle_id: bundleId,
        },
      })
      if (typeof priceCentsForSwitch === 'number' && priceCentsForSwitch > REFUND_SMS_THRESHOLD_CENTS) {
        smsSent = await _sendSmsToTate(
          `Apple refund ${amountStr} (${txn.productId || bundleId}). status_board P4 row opened.`,
        )
      }
      break
    }

    case 'F': {
      // CONSUMPTION_REQUEST. Apple is asking for our opinion within 12h.
      // P2 status_board + SMS (delta urgency).
      statusBoardRowId = await _ensureStatusRow({
        name: `Apple asking refund opinion: ${txn.transactionId || notificationUUID}`,
        entityType: 'finance',
        priority: 2,
        nextAction: 'Respond via App Store Connect within 12 hours with consumption data.',
        nextActionBy: 'tate',
        context: {
          notification_uuid: notificationUUID,
          transaction_id: txn.transactionId,
          original_transaction_id: txn.originalTransactionId,
          product_id: txn.productId,
          bundle_id: bundleId,
          window_hours: 12,
        },
      })
      smsSent = await _sendSmsToTate(
        `Apple CONSUMPTION_REQUEST: respond in App Store Connect within 12h. status_board P2 row opened. txn=${txn.transactionId || notificationUUID}`,
      )
      break
    }

    case 'G':
    default: {
      // Unhandled notification type. P4 status_board row so we decide
      // whether to add a handler.
      statusBoardRowId = await _ensureStatusRow({
        name: `Unhandled apple ASN: ${notificationType}/${subtype || '-'}`,
        entityType: 'infrastructure',
        priority: 4,
        nextAction: 'Decide if this Apple ASN type needs handling logic.',
        nextActionBy: 'ecodiaos',
        context: {
          notification_uuid: notificationUUID,
          notification_type: notificationType,
          subtype,
          bundle_id: bundleId,
        },
      })
      break
    }
  }

  // Always: persist the event row. The UNIQUE constraint on notification_uuid
  // means concurrent Apple retries that race past the seen-key check still
  // collapse to a single row.
  const inserted = await _insertEvent({
    notificationUUID, notificationType, subtype, bundleId, environment, route,
    transactionInfo, renewalInfo, outerSignedDateMs, statusBoardRowId, rawPayload: rawPayloadForDb,
  })

  // Substrate writes summary for the Episode description.
  const substrateWrites = ['kv_store.seen', `apple_iap_events.${inserted.inserted ? 'inserted' : 'race-noop'}`]
  if (statusBoardRowId) substrateWrites.push(`status_board:${statusBoardRowId}`)
  if (smsSent) substrateWrites.push('sms.tate')

  await _writeEpisode({
    notificationUUID, notificationType, subtype, bundleId, environment, route,
    substrateWrites: [...substrateWrites, 'neo4j.episode'],
  })

  await _markLastFire({ notificationUUID, notificationType, subtype, route })

  // Publish to perceptionBus for observability + downstream matchers
  // (e.g. weekly-financial-review aggregation, alerts on refund clusters).
  try {
    await perceptionBus.publish({
      source: 'apple-asn',
      kind: `apple_iap_${notificationType.toLowerCase()}`,
      data: {
        notification_uuid: notificationUUID,
        notification_type: notificationType,
        subtype,
        bundle_id: bundleId,
        environment,
        route,
        transaction_id: txn.transactionId || null,
        original_transaction_id: txn.originalTransactionId || null,
        product_id: txn.productId || null,
        price_cents: inserted.priceCents,
        currency: txn.currency || null,
        status_board_row_id: statusBoardRowId,
        sms_sent: smsSent,
      },
      confidence: 1.0,
    })
  } catch (err) {
    logger.warn('appleAsnService: perceptionBus publish failed (non-fatal)', {
      error: err.message, notificationUUID,
    })
  }

  return {
    ok: true,
    route,
    event_id: inserted.id,
    status_board_row_id: statusBoardRowId,
    sms_sent: smsSent,
  }
}

module.exports = {
  processNotification,
  // Exported for tests.
  _classify,
  _cents,
  HIGH_VALUE_LIFETIME_CENTS,
  REFUND_SMS_THRESHOLD_CENTS,
}

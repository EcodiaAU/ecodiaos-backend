'use strict'

/**
 * approvalQueueSurfacing.js (2026-05-26)
 *
 * Single notification surface for approval_queue inserts.
 *
 *   notifyOnInsert(id)  - fired by approvalQueueService._enqueue after a
 *                         successful INSERT. Sends:
 *                           - APNs push to Tate's iPhone (always, when registered)
 *                           - SMS critical via sms.tate (only urgency='critical')
 *                         Both paths are best-effort. Failures log warn and do
 *                         NOT raise back to the producer.
 *
 *   notifyDecayWarning(id) - 30min pre-decay warning for critical items, called
 *                            by approvalQueueDecay.warningTick.
 *
 * All paths lazy-require their dependencies so this module can be imported in
 * test contexts without pulling apns/db/env.
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §4.
 */

const logger = require('../config/logger')

async function _loadRow(id) {
  try {
    const db = require('../config/db')
    const rows = await db`
      SELECT id, item_type, title, urgency, decay_at, default_verdict, resolved_at
      FROM approval_queue WHERE id = ${id} LIMIT 1
    `
    return rows[0] || null
  } catch (err) {
    logger.warn('approvalQueueSurfacing: row load failed', { id, error: err.message })
    return null
  }
}

async function _pushApns(row, variant = 'inserted') {
  try {
    const deviceState = require('./deviceState')
    const apns = require('./apnsClient')
    const state = await deviceState.read()
    const token = state?.apns_token
    if (!token) return { ok: false, error: 'no_apns_token' }

    const body = variant === 'warn'
      ? `[QUEUE-CRITICAL] ${String(row.title || '').slice(0, 90)} decays in 30min`
      : `[QUEUE${row.urgency === 'critical' ? '-CRITICAL' : ''}] ${String(row.title || '').slice(0, 100)}`

    const payload = apns.buildAlertPayload({
      body,
      urgency: row.urgency === 'critical' ? 'critical' : 'alert',
      message_id: `queue:${row.id}`,
      deep_link: `ecodia://queue/${row.id}`,
      sender: 'Ecodia',
      category: 'ECODIA_QUEUE',
      threadId: 'tate',
      conversational: false,
    })

    const result = await apns.push({
      deviceToken: token,
      payload,
      pushType: 'alert',
      priority: row.urgency === 'critical' ? 10 : 5,
    })

    // Best-effort liveness signal for the pickChannel auto-policy
    if (typeof deviceState.recordApnsDelivery === 'function') {
      await deviceState.recordApnsDelivery({
        ok: result?.status >= 200 && result?.status < 300,
      }).catch(() => null)
    }

    return result
  } catch (err) {
    logger.warn('approvalQueueSurfacing: APNs push threw', { id: row?.id, error: err.message })
    return { ok: false, error: err.message }
  }
}

async function _pushSms(row, variant = 'inserted') {
  try {
    const alerting = require('./osAlertingService')
    if (typeof alerting.sendSmsToTate !== 'function') {
      return { ok: false, error: 'sms_transport_unavailable' }
    }
    const decayLabel = row.decay_at
      ? `decays at ${new Date(row.decay_at).toISOString().slice(11, 16)} UTC to ${row.default_verdict || 'cancel'}`
      : 'no decay'

    const body = variant === 'warn'
      ? `[QUEUE-CRITICAL] ${row.title}. Decays in 30min to ${row.default_verdict || 'cancel'}. Open app or reply Y or N.`
      : `[QUEUE-CRITICAL] ${row.title}. ${decayLabel}. Open EcodiaOS app or reply Y or N.`

    return await alerting.sendSmsToTate(body)
  } catch (err) {
    logger.warn('approvalQueueSurfacing: SMS push threw', { id: row?.id, error: err.message })
    return { ok: false, error: err.message }
  }
}

async function _logFanout(id, channel, variant, result) {
  try {
    const db = require('../config/db')
    await db`
      INSERT INTO approval_action_log
        (approval_id, action_type, action_payload, reversible_until)
      VALUES
        (${id},
         ${`notify_${channel}_${variant}`},
         ${db.json({ ok: !!(result?.ok || (result?.status >= 200 && result?.status < 300)),
                     error: result?.error || null,
                     status: result?.status || null })},
         NULL)
    `
  } catch (err) {
    logger.debug('approvalQueueSurfacing: log fanout soft-failed', { error: err.message })
  }
}

/**
 * Fire-and-forget notification fanout after a successful INSERT.
 * Producers call this without awaiting.
 */
async function notifyOnInsert(id) {
  const row = await _loadRow(id)
  if (!row) return { ok: false, error: 'row_not_found' }
  if (row.resolved_at) return { ok: false, error: 'already_resolved' }

  const tasks = []
  // APNs always (when registered) - silent for low-urgency items but the badge
  // count + queue tab refresh still surfaces them.
  tasks.push(_pushApns(row, 'inserted').then(r => {
    _logFanout(id, 'apns', 'insert', r).catch(() => null)
    return r
  }))
  // SMS only for critical urgency
  if (row.urgency === 'critical') {
    tasks.push(_pushSms(row, 'inserted').then(r => {
      _logFanout(id, 'sms', 'insert', r).catch(() => null)
      return r
    }))
  }
  const results = await Promise.allSettled(tasks)
  return {
    ok: true,
    apns: results[0]?.value || null,
    sms: row.urgency === 'critical' ? (results[1]?.value || null) : null,
  }
}

/**
 * Pre-decay 30-min warning. Called by the decay daemon's warningTick.
 */
async function notifyDecayWarning(id) {
  const row = await _loadRow(id)
  if (!row) return { ok: false, error: 'row_not_found' }
  if (row.resolved_at) return { ok: false, error: 'already_resolved' }

  const tasks = []
  tasks.push(_pushApns(row, 'warn').then(r => {
    _logFanout(id, 'apns', 'warn_30min', r).catch(() => null)
    return r
  }))
  if (row.urgency === 'critical') {
    tasks.push(_pushSms(row, 'warn').then(r => {
      _logFanout(id, 'sms', 'warn_30min', r).catch(() => null)
      return r
    }))
  }
  const results = await Promise.allSettled(tasks)
  return {
    ok: true,
    apns: results[0]?.value || null,
    sms: row.urgency === 'critical' ? (results[1]?.value || null) : null,
  }
}

module.exports = {
  notifyOnInsert,
  notifyDecayWarning,
  // exposed for tests
  _pushApns,
  _pushSms,
}

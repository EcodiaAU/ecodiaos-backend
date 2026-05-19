'use strict'

/**
 * liveActivityPush.js
 *
 * Pushes ActivityKit Live Activity updates for the ecodia-native iOS app.
 * Single-user single-active-activity model:
 *
 *   kv_store.cowork.native.live_activity_token.tate
 *   shape: { token, started_at, envelope_idempotency_key }
 *
 * The iOS app starts an LA when Tate sends an inbound and forwards the LA
 * push token in the same /api/native/inbound call. headlessConductor's
 * live_activity_update tool then calls update({state, body}) to push to it.
 *
 * APNs topic for Live Activities: <bundle-id>.push-type.liveactivity
 * APNs push type: liveactivity, priority: 10.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const apnsClient = require('./apnsClient')

const LA_KEY = 'cowork.native.live_activity_token.tate'
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'au.ecodia.native'
const LA_TOPIC = `${BUNDLE_ID}.push-type.liveactivity`
const MAX_LA_AGE_MS = 4 * 60 * 60 * 1000  // 4 h

let _expiryTimer = null

async function _readLaState() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${LA_KEY} LIMIT 1`
    if (!rows[0]) return null
    const raw = rows[0].value
    if (raw === null || raw === undefined) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || !parsed.token) return null
    return parsed
  } catch (err) {
    logger.warn('liveActivityPush: _readLaState failed', { error: err.message })
    return null
  }
}

async function _clearLaState() {
  try {
    await db`DELETE FROM kv_store WHERE key = ${LA_KEY}`
  } catch (err) {
    logger.warn('liveActivityPush: _clearLaState failed', { error: err.message })
  }
}

/**
 * Update (or end) the active Live Activity.
 * @param {Object} args
 * @param {'received'|'thinking'|'progress'|'done'} args.state
 * @param {string} [args.body] - optional 1-2 word status text
 */
async function update({ state, body } = {}) {
  const la = await _readLaState()
  if (!la || !la.token) {
    return { ok: false, reason: 'no_active_activity' }
  }
  const event = state === 'done' ? 'end' : 'update'
  const payload = apnsClient.buildActivityPayload({
    event,
    contentState: { state: state || 'progress', body: body || '', updated_at: new Date().toISOString() },
    body,
  })
  const r = await apnsClient.push({
    deviceToken: la.token,
    payload,
    topic: LA_TOPIC,
    pushType: 'liveactivity',
    priority: 10,
  })
  const ok = r.status >= 200 && r.status < 300
  if (state === 'done') {
    await _clearLaState()
  }
  return { ok, apns_status: r.status, event, error: ok ? undefined : (r.error || r.body?.reason) }
}

/**
 * Expire stale Live Activities (older than 4 h). Idempotent no-op when
 * nothing to expire. Pushes event='end' before clearing kv.
 */
async function expireStale() {
  const la = await _readLaState()
  if (!la || !la.token || !la.started_at) {
    return { ok: true, expired: 0 }
  }
  const age = Date.now() - new Date(la.started_at).getTime()
  if (age < MAX_LA_AGE_MS) return { ok: true, expired: 0 }
  try {
    const payload = apnsClient.buildActivityPayload({
      event: 'end',
      contentState: { state: 'done', body: 'expired', updated_at: new Date().toISOString() },
    })
    await apnsClient.push({
      deviceToken: la.token,
      payload,
      topic: LA_TOPIC,
      pushType: 'liveactivity',
      priority: 10,
    })
  } catch (err) {
    logger.warn('liveActivityPush: expireStale push failed (clearing anyway)', { error: err.message })
  }
  await _clearLaState()
  return { ok: true, expired: 1 }
}

function startExpiryScan({ everyMs = 5 * 60 * 1000 } = {}) {
  if (_expiryTimer) return
  _expiryTimer = setInterval(() => {
    expireStale().catch((err) => logger.warn('liveActivityPush: expireStale tick failed', { error: err.message }))
  }, everyMs)
  if (_expiryTimer.unref) _expiryTimer.unref()
}

function stopExpiryScan() {
  if (_expiryTimer) {
    clearInterval(_expiryTimer)
    _expiryTimer = null
  }
}

module.exports = { update, expireStale, startExpiryScan, stopExpiryScan, LA_KEY, LA_TOPIC }

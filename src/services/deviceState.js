'use strict'

/**
 * deviceState.js
 *
 * Tracks Tate's iPhone device state for the ecodia-native channel:
 *  - registered APNs token + metadata
 *  - last APNs delivery success/failure
 *  - last inbound timestamp per channel
 *  - pickChannel(): auto-policy for notifyTate channel selection
 *
 * State key: kv_store.cowork.native.device_state.tate
 * Shape:
 *   {
 *     apns_token: string | null,
 *     app_version: string | null,
 *     ios_version: string | null,
 *     registered_at: iso | null,
 *     last_apns_delivery_success_at: iso | null,
 *     last_apns_delivery_failure_at: iso | null,
 *     last_inbound_channel: 'native' | 'sms' | 'telegram' | null,
 *     last_inbound_at: iso | null,
 *   }
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const STATE_KEY = 'cowork.native.device_state.tate'

const RECENT_INBOUND_MS = 60 * 60 * 1000      // 60 min
const APNS_FRESH_MS = 24 * 60 * 60 * 1000     // 24 h

async function read() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${STATE_KEY} LIMIT 1`
    if (!rows[0]) return {}
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed || {}
  } catch (err) {
    logger.warn('deviceState: read failed', { error: err.message })
    return {}
  }
}

async function _write(state) {
  const value = JSON.stringify(state || {})
  await db`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (${STATE_KEY}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `
}

async function registerApnsToken({ token, app_version, ios_version }) {
  if (!token) return { ok: false, error: 'token_required' }
  const current = await read()
  const next = {
    ...current,
    apns_token: token,
    app_version: app_version || current.app_version || null,
    ios_version: ios_version || current.ios_version || null,
    registered_at: new Date().toISOString(),
  }
  try {
    await _write(next)
    return { ok: true }
  } catch (err) {
    logger.warn('deviceState: registerApnsToken failed', { error: err.message })
    return { ok: false, error: err.message }
  }
}

async function recordApnsDelivery({ ok, at }) {
  const current = await read()
  const ts = at || new Date().toISOString()
  const next = { ...current }
  if (ok) next.last_apns_delivery_success_at = ts
  else next.last_apns_delivery_failure_at = ts
  try {
    await _write(next)
  } catch (err) {
    logger.warn('deviceState: recordApnsDelivery failed', { error: err.message })
  }
}

async function recordInbound({ channel, at }) {
  if (!channel) return
  const current = await read()
  const next = {
    ...current,
    last_inbound_channel: channel,
    last_inbound_at: at || new Date().toISOString(),
  }
  try {
    await _write(next)
  } catch (err) {
    logger.warn('deviceState: recordInbound failed', { error: err.message })
  }
}

/**
 * Pure auto-channel policy. Reads state (optionally injected for testability)
 * and returns one of: 'native' | 'sms' | 'telegram'.
 *
 * Policy:
 *   1. If last inbound <60min ago AND channel != 'telegram' -> that channel.
 *   2. Else if apns_token set AND last APNs success <24h ago -> 'native'.
 *   3. Else 'sms'.
 *   (Telegram never auto-picked from the policy.)
 */
function pickChannelFromState(state, now = Date.now()) {
  const s = state || {}
  if (s.last_inbound_at && s.last_inbound_channel && s.last_inbound_channel !== 'telegram') {
    const age = now - new Date(s.last_inbound_at).getTime()
    if (age >= 0 && age < RECENT_INBOUND_MS) return s.last_inbound_channel
  }
  if (s.apns_token && s.last_apns_delivery_success_at) {
    const age = now - new Date(s.last_apns_delivery_success_at).getTime()
    if (age >= 0 && age < APNS_FRESH_MS) return 'native'
  }
  return 'sms'
}

async function pickChannel() {
  const state = await read()
  return pickChannelFromState(state)
}

module.exports = {
  read,
  registerApnsToken,
  recordApnsDelivery,
  recordInbound,
  pickChannel,
  pickChannelFromState,
  STATE_KEY,
  RECENT_INBOUND_MS,
  APNS_FRESH_MS,
}

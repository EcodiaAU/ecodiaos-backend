'use strict'

/**
 * notifyTate.js
 *
 * Universal outbound dispatcher. headlessConductor's notify_tate tool calls
 * notifyTate({body, urgency, channel, thread_id, deep_link}). This module
 * routes the call to the right transport:
 *
 *   channel='native'   -> APNs alert (fall back to SMS on non-200 or
 *                        unprovisioned creds)
 *   channel='sms'      -> Twilio SMS
 *   channel='telegram' -> Telegram Bot (chat_id from kv_store.creds.telegram_bot)
 *   channel='auto'     -> deviceState.pickChannel(), then recurse
 *
 * Records APNs delivery success/failure in deviceState on every native push.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const { randomUUID } = require('node:crypto')
const db = require('../config/db')
const logger = require('../config/logger')
const apnsClient = require('./apnsClient')
const deviceState = require('./deviceState')
const { sendSmsToTate } = require('./transports/smsTransport')
const { sendTelegramMessage } = require('./transports/telegramTransport')
const { appendOutbound } = require('./threadMirror')

let _tgChatCache = { value: null, expiresAt: 0 }
const TG_CHAT_TTL_MS = 5 * 60 * 1000

async function _loadTelegramChatId() {
  if (process.env.TATE_TELEGRAM_CHAT_ID) return process.env.TATE_TELEGRAM_CHAT_ID
  if (_tgChatCache.expiresAt > Date.now() && _tgChatCache.value) return _tgChatCache.value
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.telegram_bot' LIMIT 1`
    const raw = rows?.[0]?.value
    let parsed = null
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) } catch { parsed = null }
    } else if (raw && typeof raw === 'object') {
      parsed = raw
    }
    const ids = parsed?.allowed_user_ids
    const chatId = Array.isArray(ids) && ids.length > 0 ? String(ids[0]) : null
    _tgChatCache = { value: chatId, expiresAt: Date.now() + TG_CHAT_TTL_MS }
    return chatId
  } catch (err) {
    logger.warn('notifyTate: telegram chat_id load failed', { error: err.message })
    return null
  }
}

async function _sendNative({ body, urgency, message_id, deep_link }) {
  const state = await deviceState.read()
  const token = state?.apns_token
  if (!token) return { ok: false, reason: 'no_apns_token' }
  const payload = apnsClient.buildAlertPayload({ body, urgency, message_id, deep_link })
  const r = await apnsClient.push({ deviceToken: token, payload, pushType: 'alert' })
  const ok = r.status === 200
  await deviceState.recordApnsDelivery({ ok })
  if (ok) {
    // Mirror outbound on native thread (single thread_id = 'tate').
    appendOutbound({ channel: 'native', thread_id: 'tate', body }).catch(() => {})
    return { ok: true, transport: 'native', message_id, apns_status: r.status }
  }
  return {
    ok: false,
    reason: r.error === 'apns_not_provisioned' ? 'apns_not_provisioned' : `apns_${r.status || 0}`,
    apns_status: r.status,
    apns_error: r.error || r.body?.reason || null,
  }
}

/**
 * Public entry point. Always returns
 * { ok, transport: 'native'|'sms'|'telegram', message_id, fallback_reason? }
 * unless every path errors, in which case { ok: false, error }.
 */
async function notifyTate({ body, urgency, channel, thread_id, deep_link } = {}) {
  const message_id = randomUUID()
  const ch = channel || 'auto'

  let effective = ch
  if (ch === 'auto') effective = await deviceState.pickChannel()

  if (effective === 'native') {
    const r = await _sendNative({ body, urgency, message_id, deep_link })
    if (r.ok) return r
    logger.warn('notifyTate: APNs path failed, falling back to SMS', { reason: r.reason, apns_status: r.apns_status })
    const sms = await sendSmsToTate({ body, append_to_mirror: true })
    return {
      ok: !!sms.ok,
      transport: 'sms',
      message_id: sms.sid || message_id,
      fallback_reason: r.reason,
      error: sms.ok ? undefined : sms.error,
    }
  }

  if (effective === 'sms') {
    const sms = await sendSmsToTate({ body, append_to_mirror: true })
    return {
      ok: !!sms.ok,
      transport: 'sms',
      message_id: sms.sid || message_id,
      error: sms.ok ? undefined : sms.error,
    }
  }

  if (effective === 'telegram') {
    const chatId = thread_id || await _loadTelegramChatId()
    if (!chatId) {
      return { ok: false, transport: 'telegram', message_id, error: 'no_telegram_chat_id' }
    }
    const tg = await sendTelegramMessage({ chat_id: chatId, text: body, append_to_mirror: true })
    return {
      ok: !!tg.ok,
      transport: 'telegram',
      message_id: tg.message_id ? String(tg.message_id) : message_id,
      error: tg.ok ? undefined : tg.error,
    }
  }

  return { ok: false, error: `unknown_channel_${effective}` }
}

module.exports = { notifyTate }

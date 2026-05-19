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
 *   channel='telegram' -> Telegram Bot
 *   channel='auto'     -> deviceState.pickChannel(), then recurse
 *
 * Records APNs delivery success/failure in deviceState on every native push.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const crypto = require('node:crypto')
const logger = require('../config/logger')
const apnsClient = require('./apnsClient')
const deviceState = require('./deviceState')
const { sendSmsToTate } = require('./transports/smsTransport')
const { sendTelegramMessage } = require('./transports/telegramTransport')
const { appendOutbound } = require('./threadMirror')

const TATE_TG_CHAT_ID = process.env.TATE_TELEGRAM_CHAT_ID || null

function _newMessageId() {
  return `nt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

async function _sendNative({ body, urgency, message_id, deep_link }) {
  const state = await deviceState.read()
  const token = state?.apns_token
  if (!token) {
    return { ok: false, reason: 'no_apns_token' }
  }
  const payload = apnsClient.buildAlertPayload({ body, urgency, message_id, deep_link })
  const priority = urgency === 'critical' || urgency === 'alert' ? 10 : 5
  const r = await apnsClient.push({
    deviceToken: token,
    payload,
    pushType: 'alert',
    priority,
  })
  const ok = r.status >= 200 && r.status < 300
  await deviceState.recordApnsDelivery({ ok })
  if (ok) {
    // Mirror outbound on native thread (single thread_id = 'tate').
    appendOutbound({ channel: 'native', thread_id: 'tate', body }).catch(() => {})
    return { ok: true, transport: 'apns', message_id, apns_status: r.status }
  }
  return { ok: false, reason: 'apns_failed', apns_status: r.status, apns_error: r.error || r.body?.reason || null }
}

/**
 * Public entry point. Always returns
 * { ok, transport: 'apns'|'sms'|'telegram', message_id, fallback_reason? }
 * unless every path errors, in which case { ok: false, error }.
 */
async function notifyTate({ body, urgency, channel, thread_id, deep_link } = {}) {
  const message_id = _newMessageId()
  const ch = channel || 'auto'

  if (ch === 'auto') {
    const picked = await deviceState.pickChannel()
    return notifyTate({ body, urgency, channel: picked, thread_id, deep_link })
  }

  if (ch === 'native') {
    const r = await _sendNative({ body, urgency, message_id, deep_link })
    if (r.ok) return r
    logger.warn('notifyTate: APNs path failed, falling back to SMS', { reason: r.reason, apns_status: r.apns_status })
    const sms = await sendSmsToTate({ body })
    return {
      ok: !!sms.ok,
      transport: 'sms',
      message_id,
      fallback_reason: r.reason || 'apns_failed',
      sms_sid: sms.sid,
      error: sms.ok ? undefined : sms.error,
    }
  }

  if (ch === 'sms') {
    const sms = await sendSmsToTate({ body })
    return {
      ok: !!sms.ok,
      transport: 'sms',
      message_id,
      sms_sid: sms.sid,
      error: sms.ok ? undefined : sms.error,
    }
  }

  if (ch === 'telegram') {
    const chatId = thread_id || TATE_TG_CHAT_ID
    if (!chatId) {
      return { ok: false, transport: 'telegram', message_id, error: 'no_telegram_chat_id' }
    }
    const tg = await sendTelegramMessage({ chat_id: chatId, text: body })
    return {
      ok: !!tg.ok,
      transport: 'telegram',
      message_id,
      tg_message_id: tg.message_id,
      error: tg.ok ? undefined : tg.error,
    }
  }

  return { ok: false, error: `unsupported channel: ${ch}` }
}

module.exports = { notifyTate }

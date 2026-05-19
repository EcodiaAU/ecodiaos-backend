'use strict'

/**
 * telegramTransport.js
 *
 * Standalone Telegram Bot API sender. Uses https.request with family: 4
 * because node 20 native fetch ETIMEDOUTs on api.telegram.org's IPv6 record
 * when the VPS has no IPv6 connectivity.
 *
 * Bot token loaded from kv_store.creds.telegram_bot (cached 5min).
 *
 * Imported by:
 *   - headlessConductor's send_telegram_message tool (triage channel-matched reply)
 *   - native-app's notifyTate service (when 'telegram' transport picked, rare)
 */

const https = require('https')
const logger = require('../../config/logger')
const db = require('../../config/db')
const { appendOutbound } = require('../threadMirror')

let _credCache = { value: null, expiresAt: 0 }

async function _loadBotToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN
  if (_credCache.expiresAt > Date.now() && _credCache.value) return _credCache.value
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.telegram_bot' LIMIT 1`
    const raw = rows?.[0]?.value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const token = parsed?.bot_token || null
    _credCache = { value: token, expiresAt: Date.now() + 5 * 60 * 1000 }
    return token
  } catch (err) {
    logger.warn('telegramTransport: cred load failed', { error: err.message })
    return null
  }
}

function _httpsPost({ host, path, headers, body, timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    const buf = Buffer.from(body, 'utf8')
    const reqHeaders = { 'Content-Length': buf.length, ...headers }
    const req = https.request({
      host, port: 443, path, method: 'POST', family: 4, headers: reqHeaders, timeout: timeoutMs,
    }, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try { parsed = JSON.parse(text) } catch {}
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: parsed })
      })
    })
    req.on('error', err => resolve({ ok: false, status: 0, error: err.message, code: err.code }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }) })
    req.write(buf)
    req.end()
  })
}

/**
 * Send a Telegram message via the EcodiaOS bot.
 *
 * @param {Object} args
 * @param {string|number} args.chat_id - Telegram chat id
 * @param {string} args.text - body
 * @param {string} [args.parse_mode] - Markdown | HTML | MarkdownV2
 * @param {number} [args.reply_to_message_id]
 * @param {boolean} [args.append_to_mirror=true]
 * @returns {Promise<{ok: boolean, message_id?: number, error?: string}>}
 */
async function sendTelegramMessage({ chat_id, text, parse_mode, reply_to_message_id, append_to_mirror = true }) {
  const tok = await _loadBotToken()
  if (!tok) return { ok: false, error: 'telegram bot_token missing' }
  const params = new URLSearchParams()
  params.set('chat_id', String(chat_id))
  params.set('text', text)
  if (parse_mode) params.set('parse_mode', parse_mode)
  if (reply_to_message_id) params.set('reply_to_message_id', String(reply_to_message_id))
  const r = await _httpsPost({
    host: 'api.telegram.org',
    path: `/bot${tok}/sendMessage`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (r.body?.ok) {
    if (append_to_mirror) {
      appendOutbound({ channel: 'telegram', thread_id: String(chat_id), body: text }).catch(() => {})
    }
    return { ok: true, message_id: r.body.result?.message_id }
  }
  return { ok: false, error: r.body?.description || `telegram ${r.status}` }
}

module.exports = { sendTelegramMessage }

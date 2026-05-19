'use strict'

/**
 * smsTransport.js
 *
 * Standalone Twilio SMS sender. Imported by:
 *   - headlessConductor's send_sms_to_tate tool (triage channel-matched reply)
 *   - native-app's notifyTate service (when it picks 'sms' transport)
 *   - any future caller that needs to push an outbound SMS to Tate
 *
 * Writes outbound to the thread mirror (cowork.message_thread.sms.<to>) so
 * the next inbound's triage context-load sees both sides of the conversation.
 * Opt out via { append_to_mirror: false } when the caller writes to a
 * different mirror (e.g. notifyTate auto-resolving to a non-SMS channel).
 */

const https = require('https')
const logger = require('../../config/logger')
const { appendOutbound } = require('../threadMirror')

const TWILIO_HOST = 'api.twilio.com'

function _httpsPost({ host, path, headers, body, timeoutMs = 15000 }) {
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
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: parsed, raw: text })
      })
    })
    req.on('error', err => resolve({ ok: false, status: 0, error: err.message, code: err.code }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }) })
    req.write(buf)
    req.end()
  })
}

/**
 * Send an SMS to Tate (or any E.164 recipient).
 *
 * @param {Object} args
 * @param {string} args.body - message body (<=160 GSM for single segment)
 * @param {string} [args.to] - recipient phone (defaults to TATE_MOBILE env)
 * @param {string} [args.from] - sender phone (defaults to TWILIO_FROM_NUMBER env)
 * @param {boolean} [args.append_to_mirror=true] - write outbound to thread mirror
 * @returns {Promise<{ok: boolean, sid?: string, status?: string, error?: string, code?: string|number}>}
 */
async function sendSmsToTate({ body, to, from, append_to_mirror = true }) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const tok = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = from || process.env.TWILIO_FROM_NUMBER || '+61485027195'
  const toNumber = to || process.env.TATE_MOBILE || '+61404247153'
  if (!sid || !tok) return { ok: false, error: 'twilio creds missing' }
  const auth = Buffer.from(`${sid}:${tok}`).toString('base64')
  const params = new URLSearchParams({ From: fromNumber, To: toNumber, Body: body })
  const r = await _httpsPost({
    host: TWILIO_HOST,
    path: `/2010-04-01/Accounts/${sid}/Messages.json`,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (r.ok && r.body?.sid) {
    if (append_to_mirror) {
      appendOutbound({ channel: 'sms', thread_id: toNumber, body }).catch(() => {})
    }
    return { ok: true, sid: r.body.sid, status: r.body.status }
  }
  logger.warn('smsTransport: send failed', { status: r.status, error: r.body?.message || r.error })
  return { ok: false, error: r.body?.message || r.error || `twilio ${r.status}`, code: r.body?.code }
}

module.exports = { sendSmsToTate }

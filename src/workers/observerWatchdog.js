'use strict'

/**
 * observerWatchdog — independent failure-domain watchdog.
 *
 * Runs in its own PM2 process (ecodia-observer-watchdog) so it can detect
 * and alert on ecodia-api / ecodia-conductor death even when those processes
 * are wedged and unable to emit their own observability.
 *
 * One job: every 10s, probe http://127.0.0.1:3001/api/health and the
 * conductor loopback at 127.0.0.1:3002/health. If either is unreachable for
 * N consecutive probes, write a P1 observer_signals row directly to Supabase
 * + optionally SMS Tate via Twilio.
 *
 * This watchdog is deliberately tiny:
 *   - No app modules required (avoids the failure domain it's watching).
 *   - Direct pg + https requests only.
 *   - ~150 lines of code.
 *
 * Environment:
 *   OBSERVER_WATCHDOG_INTERVAL_MS    default 10000
 *   OBSERVER_WATCHDOG_FAILURE_THRESHOLD  default 4 (=40s of continuous fail)
 *   OBSERVER_WATCHDOG_API_URL        default http://127.0.0.1:3001/api/health
 *   OBSERVER_WATCHDOG_CONDUCTOR_URL  default http://127.0.0.1:3002/health
 *   OBSERVER_WATCHDOG_DATABASE_URL   default $DATABASE_URL
 *   OBSERVER_WATCHDOG_TWILIO_DISABLED  set 'true' to skip SMS path
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const http = require('http')
const { URL } = require('url')

const INTERVAL_MS = parseInt(process.env.OBSERVER_WATCHDOG_INTERVAL_MS || '10000', 10)
const FAILURE_THRESHOLD = parseInt(process.env.OBSERVER_WATCHDOG_FAILURE_THRESHOLD || '4', 10)
const API_URL = process.env.OBSERVER_WATCHDOG_API_URL || 'http://127.0.0.1:3001/api/health'
const CONDUCTOR_URL = process.env.OBSERVER_WATCHDOG_CONDUCTOR_URL || 'http://127.0.0.1:3002/health'
const SMS_DISABLED = String(process.env.OBSERVER_WATCHDOG_TWILIO_DISABLED || '').toLowerCase() === 'true'

const _failureCounts = { api: 0, conductor: 0 }
const _lastAlertAt = { api: 0, conductor: 0 }
const ALERT_COOLDOWN_MS = 10 * 60 * 1000   // 10 min between duplicate P1 alerts

function _probe(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok, detail) => {
      if (settled) return
      settled = true
      resolve({ ok, detail })
    }
    try {
      const u = new URL(url)
      const req = http.request({
        method: 'GET',
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + (u.search || ''),
        timeout: timeoutMs,
      }, (res) => {
        let body = ''
        res.on('data', (chunk) => { if (body.length < 500) body += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            finish(true, `${res.statusCode}`)
          } else {
            finish(false, `status=${res.statusCode} body=${body.slice(0, 100)}`)
          }
        })
      })
      req.on('error', (err) => finish(false, `error=${err.code || err.message}`))
      req.on('timeout', () => { try { req.destroy() } catch {} finish(false, 'timeout') })
      req.end()
    } catch (err) {
      finish(false, `throw=${err.message}`)
    }
  })
}

async function _writeP1Signal({ target, detail, failureStreak }) {
  // Direct pg insert to observer_signals. We use the postgres library if
  // available (the same one app uses), but if anything fails we just log
  // — the watchdog's primary job is to be ALIVE; the secondary jobs (DB
  // alert, SMS) are best-effort.
  try {
    // Lazy-require so the watchdog still starts if DB module is broken.
    const postgres = require('postgres')
    const connStr = process.env.OBSERVER_WATCHDOG_DATABASE_URL || process.env.DATABASE_URL
    if (!connStr) return false
    const sql = postgres(connStr, { max: 1, idle_timeout: 5, connect_timeout: 5 })
    const fp = `watchdog:${target}:${Math.floor(Date.now() / (5 * 60 * 1000))}`
    const message = `[watchdog] ${target} unreachable for ${failureStreak} consecutive probes (${failureStreak * (INTERVAL_MS / 1000)}s). Last detail: ${detail}.`
    await sql`
      INSERT INTO observer_signals
        (observer_name, signal_kind, message, reason, confidence, fingerprint,
         expires_at, priority)
      VALUES
        ('observerWatchdog', 'process_death', ${message.slice(0, 400)},
         ${'watchdog probe failure'}, 0.99, ${fp},
         NOW() + INTERVAL '30 minutes', 1)
    `.catch(err => console.warn('[watchdog] observer_signals insert failed', err.message))
    await sql.end({ timeout: 2 }).catch(() => {})
    return true
  } catch (err) {
    console.error('[watchdog] writeP1Signal failed:', err.message)
    return false
  }
}

async function _smsTate(text) {
  if (SMS_DISABLED) return false
  try {
    // Best-effort — try to use Twilio via existing service if available.
    // If the app modules are sound, this works; if they're wedged, we
    // fail silently. Watchdog's primary alert path is the DB row, which
    // surfaces in the admin lens / next conductor turn / wakes.
    const path = '/home/tate/ecodiaos/src/services/twilioSmsService.js'
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const twilio = require(path)
    if (typeof twilio.sendSms === 'function') {
      await twilio.sendSms({ body: text.slice(0, 320) })
      return true
    }
  } catch {
    // SMS unavailable — that's fine. Operator will see DB row or admin lens.
  }
  return false
}

async function _tick() {
  const [apiRes, condRes] = await Promise.all([
    _probe(API_URL),
    _probe(CONDUCTOR_URL),
  ])

  for (const [target, res] of [['api', apiRes], ['conductor', condRes]]) {
    if (res.ok) {
      if (_failureCounts[target] > 0) {
        console.log(`[watchdog] ${target} recovered after ${_failureCounts[target]} failed probes`)
      }
      _failureCounts[target] = 0
      continue
    }
    _failureCounts[target] += 1
    if (_failureCounts[target] >= FAILURE_THRESHOLD) {
      const now = Date.now()
      if (now - _lastAlertAt[target] > ALERT_COOLDOWN_MS) {
        _lastAlertAt[target] = now
        console.error(`[watchdog] ${target} unreachable: ${res.detail}. Alerting.`)
        await _writeP1Signal({ target, detail: res.detail, failureStreak: _failureCounts[target] })
        await _smsTate(`EcodiaOS watchdog: ${target} down for ${_failureCounts[target] * (INTERVAL_MS / 1000)}s. detail=${res.detail}`)
      } else {
        console.warn(`[watchdog] ${target} still unreachable; in cooldown`)
      }
    }
  }
}

function start() {
  console.log('[watchdog] starting', { INTERVAL_MS, FAILURE_THRESHOLD, API_URL, CONDUCTOR_URL })
  setInterval(() => { _tick().catch(err => console.error('[watchdog] tick threw:', err.message)) }, INTERVAL_MS)
  // Run an immediate probe for fast feedback.
  _tick().catch(err => console.warn('[watchdog] initial tick failed:', err.message))
}

if (require.main === module) {
  start()
}

module.exports = { start, _tick, _probe }

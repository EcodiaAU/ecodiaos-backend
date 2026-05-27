'use strict'

/**
 * corazonWatchdog.js - Phase 6 autonomy substrate
 *
 * VPS-side watchdog that SMSes Tate when the Corazon laptop-agent is
 * unreachable or the scheduler queue is backing up.
 *
 * HARD INVARIANTS - this service:
 *   - Never executes scheduled work.
 *   - Never swaps or rotates credentials.
 *   - Never attempts to wake, WoL, or RDP Corazon.
 *   - Only function: detect + escalate via SMS.
 *
 * Four checks run every POLL_INTERVAL_MS (5 min):
 *   1. Ping the Corazon laptop-agent /api/info. After 3 consecutive
 *      failures, SMS Tate.
 *   2. Count os_scheduled_tasks rows overdue by >30 min. SMS if >20.
 *   3. Scan kv_store for creds.refresh_failure.* keys. SMS per new key.
 *   4. Count os_scheduled_tasks rows with status='orphaned'. SMS if >0.
 *
 * Anti-spam: each alert kind has a 1-hour cooldown.
 *
 * Environment:
 *   LAPTOP_AGENT_URL   default http://100.114.219.69:7456
 *   DATABASE_URL       (inherited from VPS .env / PM2 ecosystem)
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER / TATE_MOBILE
 *                      (inherited - used by smsTransport)
 *
 * Origin: Phase 6 autonomy substrate, 2026-05-27.
 */

const http = require('http')
const { URL } = require('url')

// Lazy-imported so the watchdog starts even if the DB or SMS module is wedged.
let _smsModule = null
let _postgresModule = null
let _escalateModule = null

const POLL_INTERVAL_MS = 5 * 60 * 1000   // 5 minutes
const AGENT_FAILURE_THRESHOLD = 3         // consecutive failures before SMS
const QUEUE_BACKUP_THRESHOLD = 20         // overdue tasks before SMS
const ALERT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between same-kind alerts

// Module-level state.
let _consecutiveFailures = 0
const _alertedKeys = new Map()            // alertKey -> expiry timestamp (ms)

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true when the named alert fired within the cooldown window.
 * @param {string} key
 * @param {number} [cooldownMs]
 */
function isAlertCooled(key, cooldownMs = ALERT_COOLDOWN_MS) {
  const expiry = _alertedKeys.get(key)
  if (expiry === undefined) return false
  return Date.now() < expiry
}

/**
 * Records that an alert has fired and sets its cooldown expiry.
 * @param {string} key
 * @param {number} [ttlMs]
 */
function markAlerted(key, ttlMs = ALERT_COOLDOWN_MS) {
  _alertedKeys.set(key, Date.now() + ttlMs)
}

/**
 * GET the laptop-agent /api/info endpoint.
 * Returns true on 2xx, false on anything else (timeout, error, non-2xx).
 * Uses Node's built-in http module only.
 * @param {{timeout_ms?: number}} [opts]
 */
function pingLaptopAgent({ timeout_ms = 10000 } = {}) {
  const base = process.env.LAPTOP_AGENT_URL || 'http://100.114.219.69:7456'
  const target = base.replace(/\/$/, '') + '/api/info'
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const u = new URL(target)
      const req = http.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port: parseInt(u.port || '80', 10),
          path: u.pathname + (u.search || ''),
          timeout: timeout_ms,
        },
        (res) => {
          // Drain body so socket is released.
          res.on('data', () => {})
          res.on('end', () => {
            finish(res.statusCode >= 200 && res.statusCode < 300)
          })
        },
      )
      req.on('error', () => finish(false))
      req.on('timeout', () => { try { req.destroy() } catch {} finish(false) })
      req.end()
    } catch {
      finish(false)
    }
  })
}

/**
 * Returns a connected postgres instance (lazy-init, module-level).
 * Uses the same DATABASE_URL convention as the rest of the backend.
 */
function _getDb() {
  if (!_postgresModule) {
    // eslint-disable-next-line global-require
    const postgres = require('postgres')
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL not set')
    _postgresModule = postgres(url, { max: 2, idle_timeout: 30, connect_timeout: 10 })
  }
  return _postgresModule
}

/**
 * Count os_scheduled_tasks rows that are active but overdue by >30 min.
 * Returns the integer count.
 */
async function checkQueueBackup() {
  const sql = _getDb()
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM os_scheduled_tasks
    WHERE status = 'active'
      AND next_run_at < now() - interval '30 minutes'
  `
  return rows[0].n
}

/**
 * Count os_scheduled_tasks rows with status='orphaned'.
 * Returns the integer count.
 */
async function checkOrphaned() {
  const sql = _getDb()
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM os_scheduled_tasks
    WHERE status = 'orphaned'
  `
  return rows[0].n
}

/**
 * Fetch kv_store rows matching creds.refresh_failure.*.
 * Returns an array of { key, value } objects.
 */
async function checkRefreshFailures() {
  const sql = _getDb()
  const rows = await sql`
    SELECT key, value
    FROM kv_store
    WHERE key LIKE 'creds.refresh_failure.%'
  `
  return rows
}

/**
 * Send an SMS to Tate using the existing smsTransport module.
 * Best-effort: logs and continues if the module or Twilio is unavailable.
 *
 * Retained as the fallback path: if failureEscalate.fire throws (e.g.
 * observerSignalsService import fails), the watchdog still SMSes directly.
 * The watchdog's HARD INVARIANT is "must alert"; consistency is secondary.
 * @param {string} text
 */
async function _smsTate(text) {
  try {
    if (!_smsModule) {
      // eslint-disable-next-line global-require
      _smsModule = require('./transports/smsTransport')
    }
    const result = await _smsModule.sendSmsToTate({
      body: text.slice(0, 320),
      append_to_mirror: false,
    })
    if (!result.ok) {
      console.warn('[corazonWatchdog] SMS not delivered:', result.error)
    }
    return result.ok
  } catch (err) {
    console.warn('[corazonWatchdog] SMS unavailable:', err.message)
    return false
  }
}

/**
 * Route a watchdog finding through failureEscalateService for consistent
 * tier-based fan-out (sms + observer_signal + status_board) + 1h dedupe.
 *
 * The watchdog still keeps its local in-memory cooldown as belt + braces
 * (failureEscalate's dedupe is kv_store-based; in-memory protects against
 * the kv_store path failing). If failureEscalate throws or its module is
 * unavailable, falls back to direct _smsTate so the watchdog's "must alert"
 * contract is preserved.
 *
 * @param {{severity:string, kind:string, message:string, dedupe_key:string, context?:object}} args
 */
async function _escalate({ severity, kind, message, dedupe_key, context }) {
  try {
    if (!_escalateModule) {
      // eslint-disable-next-line global-require
      _escalateModule = require('./failureEscalateService')
    }
    return await _escalateModule.fire({ severity, kind, message, dedupe_key, context })
  } catch (err) {
    console.warn('[corazonWatchdog] failureEscalate unavailable, falling back to direct SMS:', err.message)
    await _smsTate(message)
    return { ok: true, fallback: true }
  }
}

// ─── main pass ───────────────────────────────────────────────────────────────

/**
 * Run all four checks. Each check is independent - one failing does not
 * prevent the others from running.
 */
async function pass() {
  const results = await Promise.allSettled([
    _checkAgentHealth(),
    _checkQueueBackupAlert(),
    _checkOrphanedAlert(),
    _checkRefreshFailureAlerts(),
  ])

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[corazonWatchdog] check threw:', r.reason?.message || r.reason)
    }
  }
}

async function _checkAgentHealth() {
  const ok = await pingLaptopAgent()
  if (ok) {
    if (_consecutiveFailures > 0) {
      console.log(`[corazonWatchdog] laptop-agent recovered after ${_consecutiveFailures} failures`)
    }
    _consecutiveFailures = 0
    return
  }

  _consecutiveFailures += 1
  console.warn(`[corazonWatchdog] laptop-agent unreachable (consecutive=${_consecutiveFailures})`)

  if (_consecutiveFailures >= AGENT_FAILURE_THRESHOLD) {
    const key = 'agent:unreachable'
    if (!isAlertCooled(key)) {
      markAlerted(key)
      await _escalate({
        severity: 'time_critical',
        kind: 'corazon_agent_unreachable',
        message: 'laptop-agent unreachable for 15+ min',
        dedupe_key: 'watchdog:agent_unreachable',
        context: { consecutive_failures: _consecutiveFailures, agent_url: process.env.LAPTOP_AGENT_URL || 'http://100.114.219.69:7456' },
      })
    }
  }
}

async function _checkQueueBackupAlert() {
  const overdue = await checkQueueBackup()
  if (overdue > QUEUE_BACKUP_THRESHOLD) {
    const key = 'queue:backup'
    if (!isAlertCooled(key)) {
      markAlerted(key)
      await _escalate({
        severity: 'time_critical',
        kind: 'scheduler_queue_backup',
        message: `${overdue} scheduled tasks overdue (>30 min)`,
        dedupe_key: 'watchdog:queue_backup',
        context: { overdue_count: overdue, threshold: QUEUE_BACKUP_THRESHOLD },
      })
    }
  }
}

async function _checkOrphanedAlert() {
  const orphaned = await checkOrphaned()
  if (orphaned > 0) {
    const key = 'orphaned:tasks'
    if (!isAlertCooled(key)) {
      markAlerted(key)
      // action_recommended - workers crashed, needs cleanup but not life-or-death.
      // Will surface via observer + status_board (no SMS), conductor handles on next turn.
      await _escalate({
        severity: 'action_recommended',
        kind: 'scheduler_orphaned_tasks',
        message: `${orphaned} orphaned tasks (>6h running, no signal_done)`,
        dedupe_key: 'watchdog:orphaned',
        context: { orphaned_count: orphaned },
      })
    }
  }
}

async function _checkRefreshFailureAlerts() {
  const rows = await checkRefreshFailures()
  for (const row of rows) {
    // key shape: creds.refresh_failure.<account>
    const account = row.key.replace(/^creds\.refresh_failure\./, '')
    const alertKey = `refresh:${account}`
    if (!isAlertCooled(alertKey)) {
      markAlerted(alertKey)
      // value may be a JSON object or plain string
      let errorMsg = ''
      try {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
        errorMsg = parsed?.error || parsed?.message || JSON.stringify(parsed)
      } catch {
        errorMsg = String(row.value || '').slice(0, 80)
      }
      await _escalate({
        severity: 'time_critical',
        kind: 'cred_refresh_failure',
        message: `cred refresh failing for ${account} (${errorMsg})`,
        dedupe_key: `watchdog:cred_refresh:${account}`,
        context: { account, error_excerpt: errorMsg.slice(0, 200) },
      })
    }
  }
}

// ─── start ───────────────────────────────────────────────────────────────────

function start() {
  console.log('[corazonWatchdog] starting', {
    POLL_INTERVAL_MS,
    AGENT_FAILURE_THRESHOLD,
    QUEUE_BACKUP_THRESHOLD,
    LAPTOP_AGENT_URL: process.env.LAPTOP_AGENT_URL || 'http://100.114.219.69:7456',
  })

  // Immediate first pass for fast feedback.
  pass().catch((err) => console.error('[corazonWatchdog] initial pass error:', err.message))

  setInterval(() => {
    pass().catch((err) => console.error('[corazonWatchdog] pass error:', err.message))
  }, POLL_INTERVAL_MS)
}

if (require.main === module) {
  start()
}

module.exports = {
  // Public API (tests + callers)
  start,
  pass,
  pingLaptopAgent,
  checkQueueBackup,
  checkOrphaned,
  checkRefreshFailures,
  isAlertCooled,
  markAlerted,
  // Exposed for test resets only.
  _resetState() {
    _consecutiveFailures = 0
    _alertedKeys.clear()
    _smsModule = null
    _postgresModule = null
    _escalateModule = null
  },
  _setConsecutiveFailures(n) { _consecutiveFailures = n },
  _getConsecutiveFailures() { return _consecutiveFailures },
}

/**
 * OS Alerting - ONE way for the OS to reach Tate when he's in Africa.
 *
 * Fires email + SMS (for urgent alerts) when the OS hits states that need
 * human awareness but aren't crash-severe:
 * - Weekly quota above 90% (heading into critical)
 * - 3+ consecutive failed turns (systemic issue)
 * - Process crash recovered (pm2 restarted us)
 * - Daily digest - "I'm alive, here's what I did"
 *
 * Bedrock fallback alert removed Tate 5 May 2026 12:40 AEST per
 * ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
 *
 * Dedup-aware: each alert has a cooldown so we don't spam the inbox when a
 * state flaps. Cooldowns persist across pm2 restarts via kv_store.
 *
 * All alerts go FROM code@ecodia.au TO ALERT_EMAIL_TO (default: tate@ecodia.au).
 * If gmail is disabled or sending fails, we log loudly but never throw - 
 * alerts must never break the caller's path.
 */

const logger = require('../config/logger')
const db = require('../config/db')
const crypto = require('crypto')

const ALERT_TO = process.env.ALERT_EMAIL_TO || 'tate@ecodia.au'

// ─── Quiet hours + content-hash dedupe (substrate hardening, 2026-05-18) ────
//
// Quiet hours: 22:00 - 07:00 AEST (Australia/Brisbane, no DST). Non-critical
// SMS is dropped during this window. severity='critical_outage' bypasses.
//
// Content-hash dedupe: 30min TTL per body hash. Suppresses storms when a
// failure-mode flaps and the same alert body would fire repeatedly inside
// the per-alertType cooldown window's edges. Lives in-memory; resets on
// process restart (intentional - persistent dedupe is the cooldown's job).
const QUIET_HOURS_START = 22
const QUIET_HOURS_END = 7
const SMS_DEDUPE_TTL_MS = 30 * 60 * 1000
const _recentHashes = new Map()

function _isQuietHours(now = new Date()) {
  // Brisbane is UTC+10 year-round (no DST). Compute the AEST hour from the
  // current UTC ms epoch so this is deterministic regardless of host TZ.
  const aestMs = now.getTime() + 10 * 60 * 60 * 1000
  const aestHour = new Date(aestMs).getUTCHours()
  if (QUIET_HOURS_START > QUIET_HOURS_END) {
    // Window wraps midnight - active when hour >= start OR hour < end.
    return aestHour >= QUIET_HOURS_START || aestHour < QUIET_HOURS_END
  }
  return aestHour >= QUIET_HOURS_START && aestHour < QUIET_HOURS_END
}

function _hashBody(body) {
  return crypto.createHash('sha256').update(String(body || '')).digest('hex').slice(0, 24)
}

function _pruneHashes(now) {
  for (const [h, exp] of _recentHashes) {
    if (exp <= now) _recentHashes.delete(h)
  }
}

function _seenRecently(body) {
  const now = Date.now()
  _pruneHashes(now)
  const h = _hashBody(body)
  const exp = _recentHashes.get(h)
  if (exp && exp > now) return true
  _recentHashes.set(h, now + SMS_DEDUPE_TTL_MS)
  return false
}

// Per-alert cooldowns in ms. After firing, same alert type blocked until elapsed.
const COOLDOWNS = {
  quota_high:          12 * 60 * 60 * 1000,  // twice per day max
  consecutive_failures: 4 * 60 * 60 * 1000,  // every 4h
  process_restart:     15 * 60 * 1000,       // every 15 min (flapping = crash loop, worth noisy)
  daily_digest:        20 * 60 * 60 * 1000,  // once per ~day
}

// kv_store.value is TEXT - we serialise JSON ourselves.
// New rows store JSON.stringify({ts: <ms>, type: <alertType>}).
// Legacy rows may contain a bare numeric string ("1776634957262").
// Broken rows contain "[object Object]" (old bug) - parse fails → Infinity → fires once, self-heals.
async function _getCooldownMs(alertType) {
  try {
    const row = await db`SELECT value FROM kv_store WHERE key = ${`alert_last:${alertType}`}`
    if (!row.length) return Infinity
    const v = row[0].value
    let lastAt = Infinity
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v)
        if (parsed && typeof parsed === 'object' && Number.isFinite(parsed.ts)) {
          lastAt = parsed.ts
        } else if (Number.isFinite(Number(parsed))) {
          lastAt = Number(parsed)
        }
      } catch {
        // Not JSON - try as bare number (legacy alert-cooldown rows)
        const n = Number(v)
        if (Number.isFinite(n)) lastAt = n
      }
    } else if (typeof v === 'object' && v !== null && Number.isFinite(v.ts)) {
      // Driver returned parsed object despite TEXT column - handle gracefully
      lastAt = v.ts
    }
    if (!Number.isFinite(lastAt)) return Infinity
    return Date.now() - lastAt
  } catch {
    return Infinity  // err on side of letting the alert through
  }
}

async function _markFired(alertType) {
  try {
    // kv_store.value is TEXT - must JSON.stringify ourselves.
    const payload = JSON.stringify({ ts: Date.now(), type: alertType })
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${`alert_last:${alertType}`}, ${payload})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('alerting: failed to record cooldown', { alertType, error: err.message })
  }
}

async function _sendTwilio(body) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = (process.env.TWILIO_FROM_NUMBER || '').trim()
  const to = process.env.TATE_MOBILE
  if (!sid || !token || !from || !to) {
    logger.warn('alerting: SMS env not configured, skipping SMS')
    return false
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const params = new URLSearchParams({ From: from, To: to, Body: body.slice(0, 1500) })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      const text = await res.text()
      logger.error('alerting: Twilio SMS failed', { status: res.status, body: text.slice(0, 200) })
      return false
    }
    return true
  } catch (err) {
    logger.error('alerting: SMS send threw', { error: err.message })
    return false
  }
}

/**
 * SMS to Tate via Twilio. iMessage substrate removed Tate-directed
 * 11 May 2026 16:44 AEST. Twilio is the sole contact channel.
 *
 * Quiet-hours + content-hash dedupe gates added 2026-05-18:
 *   - 22:00-07:00 AEST: non-critical SMS is dropped unless severity is
 *     'critical_outage' (case-insensitive).
 *   - sha256(body) seen inside the last 30min: dropped as duplicate.
 *
 * Both gates return a structured `{skipped: '...'}` object instead of a
 * boolean to give callers visibility. Existing callers that treat the
 * return as truthy still see falsy on a skip (Boolean({skipped:...}) is
 * true - callers checking `if (ok)` will still see it as success, which
 * matches the prior fire-and-forget contract). Callers that want to
 * distinguish skip vs send check the object shape.
 */
async function _sendSms(body, opts = {}) {
  const severity = (opts && typeof opts.severity === 'string')
    ? opts.severity.toLowerCase()
    : null
  const isCritical = severity === 'critical_outage'

  if (!isCritical && _isQuietHours()) {
    logger.info('alerting: SMS suppressed by quiet-hours gate', {
      severity: severity || 'unspecified',
    })
    return { skipped: 'quiet_hours' }
  }

  if (_seenRecently(body)) {
    logger.info('alerting: SMS suppressed by 30min content-hash dedupe')
    return { skipped: 'duplicate_30min' }
  }

  return _sendTwilio(body)
}

const SMS_ALERT_TYPES = new Set(['consecutive_failures', 'process_restart'])

async function _send(subject, body) {
  try {
    const gmail = require('./gmailService')
    // Send FROM code@ (OS inbox) TO tate@. Tagged autonomous + internal-alert
    // so the Tier-3 gate picks up the internal_ecodia_comms pattern without
    // SMS-OTP. Critical urgency bypasses calendar deferrals.
    await gmail.sendNewEmail('code@ecodia.au', ALERT_TO, `[EcodiaOS] ${subject}`, body, {
      source: 'osAlerting',
      autonomous: true,
      urgency: 'critical',
    })
    logger.info('Alert sent', { subject, to: ALERT_TO })
    return true
  } catch (err) {
    logger.error('Alert send FAILED', { subject, error: err.message })
    return false
  }
}

async function _fire(alertType, subject, body) {
  const cooldown = COOLDOWNS[alertType]
  if (!cooldown) {
    logger.warn('alerting: unknown alertType, firing anyway', { alertType })
  } else {
    const ago = await _getCooldownMs(alertType)
    if (ago < cooldown) {
      logger.debug('alerting: suppressed by cooldown', { alertType, agoMs: ago, cooldownMs: cooldown })
      return false
    }
  }
  // SMS first for urgent alert types - so Tate gets it even if email fails.
  // _sendSms now applies quiet-hours + dedupe gates internally; we pass
  // severity so the gate can recognise a true critical_outage. The cooldowns
  // declared in COOLDOWNS still bind; this is additional defence-in-depth.
  if (SMS_ALERT_TYPES.has(alertType)) {
    const smsBody = `[EcodiaOS] ${subject}\n${body.split('\n')[0]}`
    _sendSms(smsBody, { severity: 'operational' }).catch(() => {})
  }
  const ok = await _send(subject, body)
  if (ok) {
    await _markFired(alertType)
    // Log the outgoing alert so the OS can see what Tate has been notified
    // about without scraping its own email inbox.
    try {
      require('./osIncidentService').log({
        kind: 'alert_fired',
        severity: 'info',
        component: alertType,
        message: subject,
        context: { alertType },
      })
    } catch {}
  }
  return ok
}

// ─── Public alert trigger functions ─────────────────────────────────────────

// alertBedrockFallback removed Tate 5 May 2026 12:40 AEST per
// ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.

async function alertQuotaHigh(account, pctUsed, resetsAt) {
  const pctStr = `${Math.round(pctUsed * 100)}%`
  const resetStr = resetsAt ? new Date(resetsAt * 1000).toISOString() : 'unknown'
  return _fire(
    'quota_high',
    `Claude Max quota ${pctStr} (${account})`,
    `Account: ${account}
Weekly utilization: ${pctStr}
Resets at: ${resetStr}

Approaching critical. The system will auto-throttle schedules and may switch to
DeepSeek if it goes over 99%. No action needed unless cadence of usage is abnormal.`
  )
}

async function alertConsecutiveFailures(count, lastError) {
  return _fire(
    'consecutive_failures',
    `${count} consecutive OS turn failures`,
    `The OS Session has failed ${count} turns in a row.

Last error: ${lastError || '(none captured)'}
Time: ${new Date().toISOString()}

This usually indicates: quota exhaustion, MCP server down, or a systemic SDK issue.
Check pm2 logs for the full error trace. If it clears within the next hour, no action.`
  )
}

async function alertProcessRestart(uptimeMs) {
  const minutes = Math.round(uptimeMs / 60000)
  return _fire(
    'process_restart',
    `ecodia-api restarted (uptime was ${minutes}m)`,
    `The ecodia-api process restarted - pm2 brought it back up.

Previous uptime: ${minutes} minutes
Time: ${new Date().toISOString()}

Short uptime (<10m) usually means a crash loop. Longer uptime is a normal
memory-restart or manual kick. Check pm2 logs 50 lines back for the exit reason.`
  )
}

async function sendDailyDigest({ turns24h, energyPct, provider, crashCount, scheduledTasksFired }) {
  return _fire(
    'daily_digest',
    `Daily digest - ${new Date().toISOString().slice(0, 10)}`,
    `EcodiaOS 24h summary

Turns: ${turns24h || 0}
Energy: ${Math.round((energyPct || 0) * 100)}% used this week
Provider: ${provider || 'unknown'}
Crashes: ${crashCount || 0}
Scheduled tasks fired: ${scheduledTasksFired || 0}

System is alive. No action needed if numbers look sane.`
  )
}

/**
 * Generic Twilio SMS to Tate bypassing the alert-cooldown table. Used by
 * securityIncidentResponse.wireServices so incident SMS always fires -
 * an incident is not subject to the per-alertType cooldowns.
 *
 * Returns boolean success or {skipped} on gate hit; never throws.
 *
 * Accepts opts.severity to bypass quiet-hours when the caller knows the
 * payload is a critical_outage (e.g. security incident, host down,
 * substrate-level breakage). Default severity is 'operational' which
 * respects quiet hours.
 */
async function sendSmsToTate(body, opts = {}) {
  return _sendSms(String(body || ''), opts)
}

/**
 * APNs push wrapper. Delegates to pushApnsService. Re-exported here so
 * callers depending on osAlertingService for "all things contact-Tate"
 * can use a single surface. Loaded lazily so tests that mock kv_store at
 * import time don't trip cred-loading.
 *
 * Returns { ok, status_code, apns_id?, error? }.
 * Never throws.
 */
async function pushApns({ device_token, payload }) {
  try {
    const svc = require('./pushApnsService')
    return svc.pushApns({ device_token, payload })
  } catch (err) {
    logger.error('alerting: pushApns delegation failed', { error: err.message })
    return { ok: false, status_code: 0, error: err.message }
  }
}

/**
 * Multi-channel Tate notification: APNs to all registered push tokens
 * for user_id='tate', then Twilio SMS as final fallback.
 * iMessage substrate removed Tate-directed 11 May 2026 16:44 AEST.
 *
 * Returns { ok, channels: { apns: [...], sms } }.
 */
async function notifyTateMultiChannel(opts) {
  try {
    const svc = require('./pushApnsService')
    return svc.notifyTateMultiChannel(opts || {})
  } catch (err) {
    logger.error('alerting: notifyTateMultiChannel delegation failed', { error: err.message })
    return { ok: false, channels: {}, error: err.message }
  }
}

module.exports = {
  alertQuotaHigh,
  alertConsecutiveFailures,
  alertProcessRestart,
  sendDailyDigest,
  sendSmsToTate,
  pushApns,
  notifyTateMultiChannel,
  // Exposed for tests + callers that need to know whether the gate would
  // currently fire before composing an SMS.
  _isQuietHours,
  _recentHashes,
  _hashBody,
}

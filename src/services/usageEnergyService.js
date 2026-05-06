/**
 * Usage Energy Service - Dual-Account + DeepSeek Fallback
 *
 * Tracks BOTH Claude Max accounts independently and picks the healthiest one.
 * Falls back to DeepSeek V4 when both Max accounts are exhausted.
 *
 * How it works:
 *   Every /v1/messages response from Anthropic includes:
 *     anthropic-ratelimit-unified-7d-utilization - float 0–1 (real weekly % used)
 *     anthropic-ratelimit-unified-7d-reset - Unix timestamp of next reset
 *     anthropic-ratelimit-unified-5h-utilization - 5-hour session utilization
 *     anthropic-ratelimit-unified-5h-reset - Unix seconds when 5h window resets
 *     anthropic-ratelimit-unified-status - allowed | allowed_warning | rejected
 *
 *   We probe BOTH accounts via lightweight 1-token quota-checks (independent timers).
 *   This lets us always know which account has more headroom - weekly AND 5h session.
 *
 * Provider priority (Tate 5 May 2026 12:40 AEST - Bedrock removed):
 *   1. Healthiest Claude Max account (whichever has lower utilization)
 *   2. The other Claude Max account (if first is capped)
 *   3. DeepSeek V4 (final fallback when both Max accounts are exhausted, if enabled)
 *   See ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
 *
 * Energy states (derived from real utilization):
 *   full      0–10%  used - opus freely, all schedules
 *   healthy  10–40%  used - normal
 *   conserve 40–70%  used - prefer sonnet for routine, opus for important
 *   low      70–90%  used - sonnet only, reduce schedule frequency
 *   critical 90–100% used - minimal ops, defer non-urgent, wait for weekly reset
 */

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')
const logger = require('../config/logger')
const db = require('../config/db')

// Event bus for reset-driven notifications. Currently emits:
//   'claude-available' { provider, reason } - fired after a reset window passes
//   and a Claude account becomes healthy again. osSessionService listens to
//   flip _currentProvider back from deepseek at the next turn boundary;
//   osHeartbeatService listens to wake immediately so autonomy resumes without
//   waiting for the next scheduled tick.
const _events = new EventEmitter()
_events.setMaxListeners(20)

// ─── Per-account state ──────────────────────────────────────────────────────
// Each account has its own independent utilization tracking.
function _makeAccountState() {
  return {
    weeklyUtilization: null,     // 0–1 float
    weeklyResetsAt: null,        // Unix seconds
    sessionUtilization: null,    // 0–1 float (5h window)
    sessionResetsAt: null,       // Unix seconds
    rateLimitStatus: 'allowed',  // allowed | allowed_warning | rejected
    rateLimitType: null,         // seven_day | five_hour | overage | etc.
    isUsingOverage: false,
    headersUpdatedAt: null,      // Date.now() when headers were last captured
    quotaCheckInFlight: null,    // promise if a quota-check is running
    rejectionClearedAt: 0,       // Date.now() when we last auto-cleared 'rejected' - debounces re-marking
  }
}

const _accounts = {
  claude_max:   _makeAccountState(),
  claude_max_2: _makeAccountState(),
}

// Which provider is currently active (set by osSessionService).
// Default to the code token (acct2) when tate@ is paused - avoids `active === null`
// on the first energy snapshot before setProvider() runs.
let _activeProvider = process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE && !process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
  ? 'claude_max_2'
  : 'claude_max'

// Cache the full energy snapshot (60s TTL)
let _cache = null
let _cacheAt = 0
const CACHE_TTL_MS = 60_000

// How long before we proactively refresh via quota-check (10 min - tighter than before)
const HEADER_STALE_MS = 10 * 60 * 1000

// ─── Called by osSessionService to keep active provider in sync ──────────────
function setProvider(provider) {
  if (_activeProvider !== provider) {
    _activeProvider = provider
    _cache = null
    _cacheAt = 0
  }
}

// ─── Update state from real Anthropic response headers ──────────────────────
// account: 'claude_max' or 'claude_max_2'
function updateFromHeaders(headers, account = null) {
  const acct = account || _activeProvider
  const state = _accounts[acct]
  if (!state) return

  try {
    const get = (k) => {
      if (typeof headers.get === 'function') return headers.get(k)
      if (typeof headers === 'object') return headers[k] ?? headers[k.toLowerCase()] ?? null
      return null
    }

    const weeklyUtil   = get('anthropic-ratelimit-unified-7d-utilization')
    const weeklyReset  = get('anthropic-ratelimit-unified-7d-reset')
    const sessionUtil  = get('anthropic-ratelimit-unified-5h-utilization')
    const sessionReset = get('anthropic-ratelimit-unified-5h-reset')
    const status       = get('anthropic-ratelimit-unified-status')
    const claim        = get('anthropic-ratelimit-unified-representative-claim')
    const overageStatus = get('anthropic-ratelimit-unified-overage-status')

    if (weeklyUtil !== null && weeklyUtil !== undefined) {
      const newUtil = Number(weeklyUtil)
      const prevUtil = state.weeklyUtilization
      state.weeklyUtilization = newUtil
      state.headersUpdatedAt  = Date.now()
      _cache = null
      _cacheAt = 0
      // Fire quota-high alert on upward crossing of 0.90. Dedup is handled
      // in osAlertingService (12h cooldown) so flapping can't spam.
      if ((prevUtil === null || prevUtil < 0.90) && newUtil >= 0.90) {
        try {
          const alerting = require('./osAlertingService')
          alerting.alertQuotaHigh(acct, newUtil, state.weeklyResetsAt).catch(() => {})
        } catch {}
      }
    }
    if (weeklyReset !== null && weeklyReset !== undefined) {
      state.weeklyResetsAt = Number(weeklyReset)
    }
    if (sessionUtil !== null && sessionUtil !== undefined) {
      state.sessionUtilization = Number(sessionUtil)
    }
    if (sessionReset !== null && sessionReset !== undefined) {
      state.sessionResetsAt = Number(sessionReset)
    }
    if (status) state.rateLimitStatus = status
    if (claim)  state.rateLimitType   = claim
    state.isUsingOverage = overageStatus === 'allowed' || overageStatus === 'allowed_warning'

    logger.info('Claude usage headers captured', {
      account: acct,
      weeklyUtil: state.weeklyUtilization,
      weeklyReset: state.weeklyResetsAt,
      sessionUtil: state.sessionUtilization,
      sessionReset: state.sessionResetsAt,
      status: state.rateLimitStatus,
      type: state.rateLimitType,
      rawWeeklyUtil: weeklyUtil,
      rawWeeklyReset: weeklyReset,
      rawStatus: status,
    })

    // Reset moments may have just changed - re-arm the watcher so we wake at
    // the new earliest reset (handles both fresh reset times and account
    // transitions out of "no data").
    try { _armResetWatcher() } catch {}
  } catch (err) {
    logger.debug('updateFromHeaders failed', { error: err.message, account: acct })
  }
}

// ─── Quota-check: fire a minimal 1-token API call to read headers ────────────
// Now takes an explicit account parameter so we can probe both independently.
function _getConfigDir(account) {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (account === 'claude_max_2') {
    return process.env.CLAUDE_CONFIG_DIR_2 || null
  }
  return process.env.CLAUDE_CONFIG_DIR_1 || path.join(home, '.claude')
}

function _readOAuthToken(configDir, account) {
  // Long-lived env-var tokens (from `claude setup-token`) take precedence
  // over file-based credentials. The file-based path is legacy; if tokens
  // are only in env vars, checking files returns null and spams "no OAuth
  // token found" warnings even though the OS is happily using the env token.
  if (account === 'claude_max' && process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
  }
  if (account === 'claude_max_2' && process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
  }

  if (!configDir) return null

  const credCandidates = [
    path.join(configDir, '.credentials.json'),
    path.join(configDir, 'credentials.json'),
  ]
  const configCandidates = [
    path.join(configDir, '.claude.json'),
    path.join(configDir, 'claude.json'),
    configDir + '.json',
  ]

  for (const p of credCandidates) {
    if (fs.existsSync(p)) {
      try {
        const cred = JSON.parse(fs.readFileSync(p, 'utf8'))
        const token = cred?.claudeAiOauth?.accessToken
          || cred?.oauthAccount?.accessToken
          || cred?.accessToken
          || null
        if (token) return token
      } catch {}
    }
  }

  for (const p of configCandidates) {
    if (fs.existsSync(p)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
        const token = cfg?.oauthAccount?.accessToken
          || cfg?.claudeAiOauth?.accessToken
          || null
        if (token) return token
      } catch {}
    }
  }

  return null
}

async function _doQuotaCheck(account) {
  const state = _accounts[account]
  if (!state) return

  logger.info('quota-check: starting', { account })

  try {
    const configDir = _getConfigDir(account)
    if (!configDir) {
      logger.warn('quota-check: no config dir, skipping', { account })
      return
    }

    const oauthToken = _readOAuthToken(configDir, account)
    if (!oauthToken) {
      logger.warn('quota-check: no OAuth token found', { account, configDir })
      return
    }
    logger.info('quota-check: token found, fetching', { account, tokenPrefix: oauthToken.slice(0, 16), source: process.env[account === 'claude_max' ? 'CLAUDE_CODE_OAUTH_TOKEN_TATE' : 'CLAUDE_CODE_OAUTH_TOKEN_CODE'] ? 'env' : 'file' })

    // Quota-check is a throwaway 1-token probe - any valid model ID works.
    // Picking a cheap current one so a retired default can't silently 400
    // the probe and blind the provider router. OS_SESSION_MODEL env var
    // wins if set.
    const model = process.env.OS_SESSION_MODEL || 'claude-haiku-4-5-20251001'

    // 10s hard timeout - without this, an Anthropic endpoint partition hangs
    // the quota-check forever, which in turn makes refreshQuotaCheck() return
    // the hanging promise to every subsequent caller (quotaCheckInFlight guard).
    // Result: provider routing blind to quota state until process restart.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    let resp
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'quota' }],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    logger.info('quota-check: response received', {
      account,
      status: resp.status,
      hasGetHeader: typeof resp.headers?.get === 'function',
      sample7dUtil: resp.headers?.get?.('anthropic-ratelimit-unified-7d-utilization'),
      sample7dReset: resp.headers?.get?.('anthropic-ratelimit-unified-7d-reset'),
      sampleStatus: resp.headers?.get?.('anthropic-ratelimit-unified-status'),
    })

    // Extract headers regardless of status - 429s still carry utilization headers
    updateFromHeaders(resp.headers, account)

    if (resp.status === 429 && state.weeklyUtilization === null) {
      state.weeklyUtilization = 1.0
      state.rateLimitStatus = 'rejected'
      _cache = null
      _cacheAt = 0
    }

    if (resp.status === 401) {
      // Long-lived OAuth tokens (from `claude setup-token`) are NOT valid
      // against raw /v1/messages - they 401 here but still work fine through
      // the SDK. Treat 401 as "can't read quota headers" (headers are null),
      // NOT as "token dead". Do not trigger refresh - that clobbers the
      // long-lived token with rotating-token garbage.
      const usingLongLived = !!(
        process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE ||
        process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      )
      if (usingLongLived) {
        logger.debug('quota-check: 401 with long-lived token - expected, skipping refresh', { account })
        return
      }
      // Legacy rotating-token path: try refresh once.
      logger.warn('quota-check: 401 Unauthorized - triggering token refresh', { account })
      try {
        const tokenRefresh = require('./claudeTokenRefreshService')
        const result = await tokenRefresh.refreshAccount(account, { force: true })
        if (result.refreshed) {
          logger.info('quota-check: token refreshed after 401 - retrying quota check', { account })
          return _doQuotaCheck(account)
        }
        if (result.isRevoked) {
          logger.error('quota-check: REFRESH TOKEN REVOKED - manual login required', { account })
        }
      } catch (refreshErr) {
        logger.warn('quota-check: token refresh failed after 401', { account, error: refreshErr.message })
      }
      return
    }

    logger.info('Claude quota-check complete', {
      account,
      status: resp.status,
      weeklyUtil: state.weeklyUtilization,
      sessionUtil: state.sessionUtilization,
      rateLimitStatus: state.rateLimitStatus,
      rateLimitType: state.rateLimitType,
    })
  } catch (err) {
    logger.debug('quota-check failed', { error: err.message, account })
  } finally {
    state.quotaCheckInFlight = null
  }
}

async function refreshQuotaCheck(account = null) {
  // If no account specified, refresh the active one
  if (!account) account = _activeProvider
  const state = _accounts[account]
  if (!state) return
  if (state.quotaCheckInFlight) return state.quotaCheckInFlight
  state.quotaCheckInFlight = _doQuotaCheck(account)
  return state.quotaCheckInFlight
}

// Refresh BOTH accounts - used on startup and periodically
async function refreshAllAccounts() {
  const promises = []
  // Skip acct1 (tate) entirely when its subscription is paused and we're on the code token.
  const skipAcct1 = !!process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE && !process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
  if (!skipAcct1) {
    promises.push(refreshQuotaCheck('claude_max').catch(() => {}))
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE || process.env.CLAUDE_CONFIG_DIR_2) {
    promises.push(refreshQuotaCheck('claude_max_2').catch(() => {}))
  }
  await Promise.allSettled(promises)
}

// ─── Reset watcher ──────────────────────────────────────────────────────────
// On fallback (deepseek), nothing in-flight re-evaluates providers
// until the next user message or heartbeat - and the heartbeat itself is
// paused on fallback (osHeartbeatService:284). Without a watcher, Claude
// reset windows pass silently and the OS stays on DeepSeek until Tate starts
// a new session. The watcher arms a single setTimeout for the earliest
// pending reset (weekly OR 5h) across both accounts, fires re-probes, and
// emits 'claude-available' when a Claude account scores healthy again.
let _resetTimer = null
let _resetTimerArmedFor = null  // unix seconds the current timer is targeting
const RESET_SLACK_MS = 30_000   // re-probe slightly after the reset boundary
const RESET_RETRY_MS = 5 * 60 * 1000  // if reset passed but probe still says rejected
const RESET_MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000  // hard cap (weekly window)

function _earliestPendingResetSec() {
  const nowSec = Date.now() / 1000
  let earliest = null
  for (const [, state] of Object.entries(_accounts)) {
    for (const ts of [state.weeklyResetsAt, state.sessionResetsAt]) {
      if (!ts || ts <= nowSec) continue
      if (earliest === null || ts < earliest) earliest = ts
    }
  }
  return earliest
}

function _armResetWatcher() {
  const targetSec = _earliestPendingResetSec()
  if (!targetSec) {
    // No known reset windows - nothing to arm. If a timer is outstanding for
    // a now-unknown target, leave it; it'll fire and self-clear harmlessly.
    return
  }

  // Already armed for the same (or earlier) target - don't churn.
  if (_resetTimer && _resetTimerArmedFor !== null && targetSec >= _resetTimerArmedFor) {
    return
  }

  if (_resetTimer) {
    clearTimeout(_resetTimer)
    _resetTimer = null
  }

  const delayMs = Math.min(
    RESET_MAX_DELAY_MS,
    Math.max(1_000, (targetSec * 1000 - Date.now()) + RESET_SLACK_MS),
  )
  _resetTimerArmedFor = targetSec

  _resetTimer = setTimeout(async () => {
    _resetTimer = null
    _resetTimerArmedFor = null
    try {
      await _onResetFired()
    } catch (err) {
      logger.warn('reset watcher: _onResetFired crashed', { error: err.message })
    }
    // Re-arm for the next pending boundary (could be the OTHER account's window).
    _armResetWatcher()
  }, delayMs)

  if (typeof _resetTimer.unref === 'function') _resetTimer.unref()

  logger.info('reset watcher armed', {
    targetSec,
    delayMinutes: Math.round(delayMs / 60_000),
  })
}

async function _onResetFired() {
  logger.info('reset watcher fired - probing both accounts')
  await refreshAllAccounts()

  const best = getBestProvider()
  const isClaude = best.provider === 'claude_max' || best.provider === 'claude_max_2'

  if (!isClaude) {
    // Reset boundary passed but probe still shows both accounts capped.
    // Arm a short retry - clock skew or staggered reset cadence on Anthropic's
    // side can leave the account rejected for a few minutes after the timestamp.
    logger.info('reset watcher: still on fallback after probe - retry in 5min', {
      provider: best.provider,
      reason: best.reason,
    })
    if (_resetTimer) clearTimeout(_resetTimer)
    _resetTimer = setTimeout(() => {
      _resetTimer = null
      _resetTimerArmedFor = null
      _onResetFired().catch(() => {})
    }, RESET_RETRY_MS)
    if (typeof _resetTimer.unref === 'function') _resetTimer.unref()
    _resetTimerArmedFor = (Date.now() + RESET_RETRY_MS) / 1000
    return
  }

  // Don't emit if we never left Claude in the first place - listeners only
  // care about the deepseek → claude transition.
  const onFallback = _activeProvider === 'deepseek'
  if (!onFallback) {
    logger.debug('reset watcher: Claude healthy but already on Claude - no event needed')
    return
  }

  logger.info('reset watcher: Claude available again - emitting claude-available', {
    provider: best.provider,
    reason: best.reason,
    activeProvider: _activeProvider,
  })
  _events.emit('claude-available', { provider: best.provider, reason: best.reason })
}

function on(event, listener)  { _events.on(event, listener) }
function off(event, listener) { _events.off(event, listener) }

// ─── Energy state from real utilization ───────────────────────────────────────
function _energyState(pctUsed) {
  if (pctUsed <= 0.10) return { level: 'full',     label: 'Full energy',        modelRec: 'opus',   scheduleMultiplier: 1.0 }
  if (pctUsed <= 0.40) return { level: 'healthy',  label: 'Healthy',            modelRec: 'opus',   scheduleMultiplier: 1.0 }
  if (pctUsed <= 0.70) return { level: 'conserve', label: 'Conserving',         modelRec: 'sonnet', scheduleMultiplier: 0.75 }
  if (pctUsed <= 0.90) return { level: 'low',      label: 'Low energy',         modelRec: 'sonnet', scheduleMultiplier: 0.5 }
  return                      { level: 'critical',  label: 'Critical - minimal', modelRec: 'sonnet', scheduleMultiplier: 0.25 }
}

// ─── Account health scoring ─────────────────────────────────────────────────
// Returns a numeric score for how usable an account is right now.
// Higher = healthier. Negative = unusable.
function _accountHealth(account) {
  const state = _accounts[account]
  if (!state) return { score: -100, reason: 'no_state' }

  // Account is "present" if either a long-lived token OR a legacy config dir exists.
  const hasLongLivedToken = account === 'claude_max_2'
    ? !!process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
    : !!process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
  const configDir = _getConfigDir(account)
  if (!hasLongLivedToken && !configDir) return { score: -100, reason: 'no_token_or_config_dir' }

  // Rejected = completely unusable UNLESS the reset time has passed.
  // Without this, once we mark an account rejected we stay on the fallback forever.
  // Check BOTH weekly reset AND 5-hour session reset - if either has passed,
  // the account is usable again. The quota-check will re-probe and update
  // with real headers.
  if (state.rateLimitStatus === 'rejected') {
    const nowSec = Date.now() / 1000
    const weeklyResetPassed = state.weeklyResetsAt && state.weeklyResetsAt < nowSec
    const sessionResetPassed = state.sessionResetsAt && state.sessionResetsAt < nowSec
    if (weeklyResetPassed || sessionResetPassed) {
      const resetType = weeklyResetPassed ? 'weekly' : '5h-session'
      logger.info('Account rejection auto-cleared: reset time passed', {
        account,
        resetType,
        weeklyResetsAt: state.weeklyResetsAt,
        sessionResetsAt: state.sessionResetsAt,
      })
      state.rateLimitStatus = 'allowed'
      state.rateLimitType = null
      state.weeklyUtilization = null  // force re-probe
      state.sessionUtilization = null // clear 5h session too
      state.rejectionClearedAt = Date.now()  // debounce markAccountRejected for 5 min
      // Fire a fresh quota-check in the background (don't await - decision needs a value now)
      refreshQuotaCheck(account).catch(() => {})
      return { score: 30, reason: `reset_just_passed_reprobing (${resetType})` }
    }
    // Stuck-rejection guard: if status is rejected but we have no reset
    // timestamp AND no captured headers, treat as a stale wedge (typically:
    // boot-time probe got a 429 before reset headers parsed correctly, or
    // an SDK error mis-classified). Clear it and let the next real call
    // re-establish ground truth - it'll either succeed (proving acct healthy)
    // or 429 again (this time hopefully with proper headers).
    if (!state.weeklyResetsAt && !state.sessionResetsAt && !state.headersUpdatedAt) {
      logger.warn('Account rejection auto-cleared: stale wedge (no reset times, no headers)', { account })
      state.rateLimitStatus = 'allowed'
      state.rateLimitType = null
      state.weeklyUtilization = null
      state.sessionUtilization = null
      state.rejectionClearedAt = Date.now()
      refreshQuotaCheck(account).catch(() => {})
      return { score: 30, reason: 'stuck_rejection_cleared_reprobing' }
    }
    return { score: -10, reason: `rejected (${state.rateLimitType || 'unknown'})` }
  }

  // No data yet - unknown, treat as moderately healthy (prefer known-good accounts)
  if (state.weeklyUtilization === null) {
    return { score: 30, reason: 'no_data' }
  }

  const weeklyPct = state.weeklyUtilization  // 0–1
  const sessionPct = state.sessionUtilization // 0–1 or null

  // 5h session capped (>=95%) - this account can't do heavy work right now
  if (sessionPct !== null && sessionPct >= 0.95) {
    // But it might reset soon - check sessionResetsAt
    const now = Date.now()
    const resetsInMs = state.sessionResetsAt ? (state.sessionResetsAt * 1000 - now) : Infinity
    if (resetsInMs > 5 * 60 * 1000) {
      // More than 5 min until session reset - treat as capped
      return { score: -5, reason: `5h_session_capped (${Math.round(sessionPct * 100)}%, resets in ${Math.round(resetsInMs / 60000)}m)` }
    }
    // Resets soon - still usable but slightly penalised
  }

  // Weekly >= 99% - effectively exhausted
  if (weeklyPct >= 0.99) {
    return { score: -8, reason: `weekly_exhausted (${Math.round(weeklyPct * 100)}%)` }
  }

  // Score: base 100, subtract weekly usage, subtract session pressure
  let score = 100 - (weeklyPct * 80)  // 0% used = 100, 100% used = 20
  if (sessionPct !== null) {
    score -= sessionPct * 20  // 5h session pressure reduces score
  }

  // Penalise "allowed_warning" - it's about to get capped
  if (state.rateLimitStatus === 'allowed_warning') {
    score -= 15
  }

  return { score: Math.round(score), reason: 'healthy' }
}

// ─── Pick the best provider ────────────────────────────────────────────────
// Returns { provider, reason, isDeepseekFallback } for the caller to use.
// Priority: claude_max → claude_max_2 → deepseek (if enabled) → best-effort.
// Bedrock removed Tate 5 May 2026 12:40 AEST per
// ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
function getBestProvider() {
  const hasAccount2   = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE || process.env.CLAUDE_CONFIG_DIR_2)
  const hasDeepseek   = process.env.DEEPSEEK_FALLBACK_ENABLED === 'true' && !!process.env.DEEPSEEK_API_KEY

  const health1 = _accountHealth('claude_max')
  const health2 = hasAccount2 ? _accountHealth('claude_max_2') : { score: -100, reason: 'not_configured' }

  logger.debug('Provider health scores', {
    acct1: { score: health1.score, reason: health1.reason },
    acct2: { score: health2.score, reason: health2.reason },
    hasDeepseek,
  })

  // Both usable - pick the healthier one
  if (health1.score > 0 && health2.score > 0) {
    if (health1.score >= health2.score) {
      return { provider: 'claude_max', reason: `acct1 healthier (${health1.score} vs ${health2.score})`, isDeepseekFallback: false }
    }
    return { provider: 'claude_max_2', reason: `acct2 healthier (${health2.score} vs ${health1.score})`, isDeepseekFallback: false }
  }

  // One usable - use it
  if (health1.score > 0) {
    return { provider: 'claude_max', reason: `acct1 ok (${health1.reason}), acct2 down (${health2.reason})`, isDeepseekFallback: false }
  }
  if (health2.score > 0) {
    return { provider: 'claude_max_2', reason: `acct2 ok (${health2.reason}), acct1 down (${health1.reason})`, isDeepseekFallback: false }
  }

  const bothDownReason = `both Max accounts down (acct1: ${health1.reason}, acct2: ${health2.reason})`

  // Both down - try DeepSeek (final tier)
  if (hasDeepseek) {
    return { provider: 'deepseek', reason: `${bothDownReason} - using DeepSeek V4 Pro`, isDeepseekFallback: true }
  }

  // Nothing available - return whichever is least bad
  const best = health1.score >= health2.score ? 'claude_max' : 'claude_max_2'
  return {
    provider: best,
    reason: `all providers exhausted - using ${best} as best-effort (acct1: ${health1.reason}, acct2: ${health2.reason})`,
    isDeepseekFallback: false,
  }
}

// ─── Get energy snapshot for a specific account ──────────────────────────────
function _getAccountSnapshot(account) {
  const state = _accounts[account]
  if (!state) return null

  const now = Date.now()
  const hasRealData = state.weeklyUtilization !== null
  const pctUsed = hasRealData ? state.weeklyUtilization : null
  const pctRemaining = hasRealData ? Math.max(0, 1 - pctUsed) : null
  const energy = _energyState(pctUsed ?? 0)

  let hoursUntilReset = null
  if (state.weeklyResetsAt) {
    hoursUntilReset = Math.max(0, (state.weeklyResetsAt * 1000 - now) / 3_600_000)
  }

  let sessionHoursUntilReset = null
  if (state.sessionResetsAt) {
    sessionHoursUntilReset = Math.max(0, (state.sessionResetsAt * 1000 - now) / 3_600_000)
  }

  const sessionPctUsed = state.sessionUtilization ?? null

  return {
    source: hasRealData ? 'anthropic_headers' : 'no_data',
    pctUsed: pctUsed != null ? Math.round(pctUsed * 1000) / 10 : null,
    pctRemaining: pctRemaining != null ? Math.round(pctRemaining * 1000) / 10 : null,
    rateLimitStatus: state.rateLimitStatus,
    rateLimitType: state.rateLimitType,
    isUsingOverage: state.isUsingOverage,
    hoursUntilReset: hoursUntilReset != null ? Math.round(hoursUntilReset * 10) / 10 : null,
    sessionPctUsed: sessionPctUsed != null ? Math.round(sessionPctUsed * 1000) / 10 : null,
    sessionHoursUntilReset: sessionHoursUntilReset != null ? Math.round(sessionHoursUntilReset * 10) / 10 : null,
    headersAge: state.headersUpdatedAt ? Math.round((now - state.headersUpdatedAt) / 1000) : null,
    ...energy,
  }
}

// ─── Get current energy snapshot (main API - used by routes + osSession) ─────
async function getEnergy() {
  const now = Date.now()

  // Return cached snapshot if fresh
  if (_cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache

  // Stale-header background refresh disabled 2026-05-05 - quota-check fetch
  // was crashing the api process (silent exit code 0 mid-fetch). Real SDK
  // turns populate headers via updateFromHeaders, which is enough for routing.
  const hasAcct2 = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE || process.env.CLAUDE_CONFIG_DIR_2)
  const skipAcct1 = !!process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE && !process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE && !process.env.CLAUDE_CONFIG_DIR_1

  // Build snapshots for both accounts
  const acct1 = skipAcct1 ? null : _getAccountSnapshot('claude_max')
  const acct2 = hasAcct2 ? _getAccountSnapshot('claude_max_2') : null

  // Active account's snapshot is the primary one (backwards compat)
  const active = _activeProvider === 'claude_max_2' ? acct2 : acct1
  const hasRealData = active?.source === 'anthropic_headers'

  // Self-tracked turn count
  const selfTracked = await _getSelfTrackedTurns().catch(() => ({ turns: 0 }))

  // Best provider recommendation
  const best = getBestProvider()

  // Token auth health (proactive refresh status)
  let tokenHealth = null
  try {
    const tokenRefresh = require('./claudeTokenRefreshService')
    tokenHealth = tokenRefresh.getTokenHealth()
  } catch {}

  _cache = {
    // ─── Active account (backwards compat with existing consumers)
    source: active?.source || 'no_data',
    currentProvider: _activeProvider,
    headersAge: active?.headersAge,
    pctUsed: active?.pctUsed,
    pctRemaining: active?.pctRemaining,
    rateLimitStatus: active?.rateLimitStatus,
    rateLimitType: active?.rateLimitType,
    isUsingOverage: active?.isUsingOverage,
    hoursUntilReset: active?.hoursUntilReset,
    sessionPctUsed: active?.sessionPctUsed,
    sessionHoursUntilReset: active?.sessionHoursUntilReset,
    // ─── Energy decision layer (from active account)
    level: active?.level || 'full',
    label: active?.label || 'Unknown',
    modelRec: active?.modelRec || 'opus',
    scheduleMultiplier: active?.scheduleMultiplier || 1.0,
    // ─── Both accounts (for dashboard / debugging)
    accounts: {
      claude_max: acct1,
      claude_max_2: acct2,
    },
    // ─── Smart provider recommendation
    recommendedProvider: best.provider,
    providerReason: best.reason,
    isDeepseekFallback: best.isDeepseekFallback,
    // ─── Self-tracked activity
    turnsThisWeek: selfTracked.turns,
    // ─── Token auth health
    tokenHealth,
    // ─── Human-readable summary
    summary: _buildSummary({ acct1, acct2, active, hasRealData, turns: selfTracked.turns, best }),
  }

  _cacheAt = now
  return _cache
}

async function _getSelfTrackedTurns() {
  try {
    const weekStart = _getWeekStart()
    const [row] = await db`
      SELECT COUNT(*)::int AS turns
      FROM claude_usage
      WHERE week_start = ${weekStart}
    `
    return { turns: row?.turns || 0 }
  } catch {
    return { turns: 0 }
  }
}

function _getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function _buildSummary({ acct1, acct2, active, hasRealData, turns, best }) {
  if (!hasRealData && active?.source !== 'anthropic_headers') {
    return `Claude Max energy: unknown (no headers yet). Recommended provider: ${best.provider} (${best.reason}).`
  }

  const lines = []

  // Account 1 summary
  if (acct1) {
    const w = acct1.pctUsed != null ? `${Math.round(acct1.pctUsed)}% weekly` : 'weekly unknown'
    const s = acct1.sessionPctUsed != null ? `, ${Math.round(acct1.sessionPctUsed)}% 5h-session` : ''
    lines.push(`Acct1: ${w}${s} [${acct1.rateLimitStatus}]`)
  }

  // Account 2 summary
  if (acct2) {
    const w = acct2.pctUsed != null ? `${Math.round(acct2.pctUsed)}% weekly` : 'weekly unknown'
    const s = acct2.sessionPctUsed != null ? `, ${Math.round(acct2.sessionPctUsed)}% 5h-session` : ''
    lines.push(`Acct2: ${w}${s} [${acct2.rateLimitStatus}]`)
  }

  lines.push(`Active: ${_activeProvider}. Recommended: ${best.provider} (${best.reason}).`)
  if (turns > 0) lines.push(`${turns} turns tracked this week.`)
  if (active?.hoursUntilReset != null) lines.push(`Week resets in ${Math.round(active.hoursUntilReset)}h.`)
  if (active?.isUsingOverage) lines.push('Using extra usage (overage).')

  return lines.join(' ')
}

// ─── Log a turn to our DB (for activity tracking / history) ──────────────────
// Audit Tier A 2026-05-01 (fork_mom9j8g9_5ab468): now also persists cache
// tokens + estimated cost_usd so the /ops dashboard can surface
// cache_hit_ratio + cost_per_turn_usd panels. Migration 082 added the
// two cache columns; cost_usd column already existed but was never populated.
// All new params optional - callers that don't pass them get the old shape.
async function logUsage({
  sessionId = null,
  source = 'os_session',
  provider = 'claude_max',
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
  clientId = null,
  projectId = null,
} = {}) {
  try {
    const weekStart = _getWeekStart()
    let costUsd = null
    try {
      const { estimateCostUsd } = require('../config/anthropicPricing')
      costUsd = estimateCostUsd({
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
      })
    } catch (priceErr) {
      // Pricing module is additive; if anything goes wrong, persist null cost
      // and continue. Never break logUsage on cost-estimation errors.
      logger.debug('estimateCostUsd unavailable', { error: priceErr.message })
    }
    await db`
      INSERT INTO claude_usage (
        session_id, source, provider, model,
        input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens,
        cost_usd, week_start, client_id, project_id
      )
      VALUES (
        ${sessionId}, ${source}, ${provider}, ${model},
        ${inputTokens}, ${outputTokens},
        ${cacheCreationTokens}, ${cacheReadTokens},
        ${costUsd}, ${weekStart}, ${clientId}, ${projectId}
      )
    `
    _cache = null
    _cacheAt = 0
  } catch (err) {
    logger.warn('claude_usage log failed', { error: err.message })
  }
}

// ─── Get historical weekly summaries ─────────────────────────────────────────
async function getWeeklyHistory(weeks = 4) {
  try {
    const rows = await db`
      SELECT
        week_start,
        provider,
        SUM(input_tokens)::bigint  AS input_tokens,
        SUM(output_tokens)::bigint AS output_tokens,
        COUNT(*)::int              AS turns
      FROM claude_usage
      WHERE week_start >= (CURRENT_DATE - INTERVAL '${db.unsafe(String(weeks * 7))} days')
      GROUP BY week_start, provider
      ORDER BY week_start DESC, provider
    `
    return rows
  } catch (err) {
    logger.warn('claude_usage history failed', { error: err.message })
    return []
  }
}

function invalidateCache() {
  _cache = null
  _cacheAt = 0
}

// Stamp a weekly reset timestamp directly. Used when we learned the reset
// time from a non-header source (e.g. parsed from an SDK error string)
// and want the reset watcher to arm even though `_doQuotaCheck` headers
// never landed for this account.
function stampReset(account, weeklyResetsAtSec) {
  const state = _accounts[account]
  if (!state) return
  state.weeklyResetsAt = Number(weeklyResetsAtSec)
  _cache = null
  _cacheAt = 0
  try { _armResetWatcher() } catch {}
  logger.info('stampReset applied', { account, weeklyResetsAtSec })
}

// Reset all in-memory account state to fresh defaults. Used by the manual
// /energy/reset endpoint when stale rejected state with no reset timestamps
// is wedging the router into permanent fallback. Next getEnergy() call will
// re-probe via stale-headers path.
function resetAllAccounts() {
  for (const acct of Object.keys(_accounts)) {
    _accounts[acct] = _makeAccountState()
  }
  _cache = null
  _cacheAt = 0
  if (_resetTimer) {
    clearTimeout(_resetTimer)
    _resetTimer = null
    _resetTimerArmedFor = null
  }
  logger.info('usageEnergy: all account state reset to defaults')
}

// ─── Mark an account as rejected (called by osSession on 429 / exhaustion) ───
function markAccountRejected(account, rateLimitType = 'unknown') {
  const state = _accounts[account]
  if (!state) return
  // Debounce: if we auto-cleared rejection in the last 5 min (reset just passed),
  // don't immediately flip back. Otherwise the account bounces
  // rejected -> reprobing -> rejected -> reprobing forever during a flaky reset
  // window, and each bounce can trigger a session switch + alert.
  const clearedAgoMs = Date.now() - (state.rejectionClearedAt || 0)
  if (clearedAgoMs < 5 * 60 * 1000) {
    logger.info('markAccountRejected suppressed by post-clear debounce', { account, clearedAgoMs })
    return
  }
  state.rateLimitStatus = 'rejected'
  state.rateLimitType = rateLimitType
  if (state.weeklyUtilization === null) state.weeklyUtilization = 1.0
  // Stamp headersUpdatedAt so the stuck-rejection clear guard in
  // _accountHealth doesn't immediately undo this. The SDK 429 path doesn't
  // give us reset timestamps (those would come from response headers, not
  // the surfaced error string), so we rely on this stamp to differentiate
  // "freshly rejected by real 429" from "stale wedge from old probe".
  state.headersUpdatedAt = Date.now()
  _cache = null
  _cacheAt = 0
  logger.warn('Account marked rejected', { account, rateLimitType })
  // Just got rejected - make sure the watcher is armed for whatever reset
  // window we know about. If we only just learned this account is rejected
  // and don't have reset timestamps yet, refreshAllAccounts (called via
  // the next getBestProvider tick) will populate them.
  try { _armResetWatcher() } catch {}
}

module.exports = {
  setProvider,
  updateFromHeaders,
  refreshQuotaCheck,
  refreshAllAccounts,
  logUsage,
  getEnergy,
  getWeeklyHistory,
  getBestProvider,
  invalidateCache,
  markAccountRejected,
  resetAllAccounts,
  stampReset,
  on,
  off,
}

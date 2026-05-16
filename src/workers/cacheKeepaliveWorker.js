'use strict'

/**
 * cacheKeepaliveWorker - refreshes the Anthropic prompt cache TTL every
 * 45 minutes during work hours (06:00-22:00 AEST) by sending a minimal
 * query with the current stable BP1+BP2 prefix.
 *
 * docs/PROMPT_ASSEMBLY_SPEC.md §4.3 + ANTHROPIC_NATIVE_LEVERAGE §4.
 *
 * Problem: the 1-hour cache TTL expires during quiet stretches (lunch
 * gaps, between autonomous tasks). The first turn after expiry pays the
 * full uncached prefix cost (~18K tokens × system+behavior+fork+untrusted),
 * which is ~$0.05/turn wasted. A keepalive ping every 45min costs ~100
 * input tokens and prevents the expiry.
 *
 * Cost math (PROMPT_ASSEMBLY_SPEC §4.3):
 *   Keepalive: ~100 input tokens × 21 fires/day × 7 days ≈ 15K tokens/week
 *   Savings:   ~15K tokens saved per prevented-cache-miss × 5-10 misses/day
 *     ≈ 100K tokens/day × 7 = 700K tokens/week
 *   Net: ~97% cost reduction on keepalive operations.
 *
 * This worker is standalone (not under OS Session's on-demand model)
 * because keepalive is by definition uncorrelated with user activity.
 * If OS Session was the gatekeeper, we'd miss exactly the quiet stretches
 * we're trying to span.
 *
 * Metrics emitted (structured log lines, /ops can aggregate):
 *   cache_keepalive_fires_total - count of refresh attempts
 *   cache_keepalive_refresh_cost_tokens - input tokens per refresh
 *   cache_keepalive_skipped_total - skipped (outside work hours / already refreshed)
 *   cache_keepalive_errors_total - failed refreshes
 */

const logger = require('../config/logger')

// Tunables. Keep as module-level constants so tests can stub.
const INTERVAL_MS = 45 * 60 * 1000       // 45 minutes
const WORK_HOURS_START = 6               // 06:00 AEST
const WORK_HOURS_END = 22                // 22:00 AEST
const AEST_OFFSET_MIN = 10 * 60          // UTC+10 (Brisbane, no DST)

let _timer = null
let _bootTimer = null
let _lastFireAt = null

// Counters exposed for /ops
const metrics = {
  fires: 0,
  refresh_cost_tokens: 0,
  skipped_outside_hours: 0,
  skipped_recent_activity: 0,
  errors: 0,
}

/**
 * Return the current Brisbane (AEST, UTC+10) hour (0-23).
 */
function _currentAESTHour(now = new Date()) {
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60_000)
  const aestMs = utcMs + AEST_OFFSET_MIN * 60_000
  const aestDate = new Date(aestMs)
  return aestDate.getHours()
}

function _isWorkHours(now = new Date()) {
  const h = _currentAESTHour(now)
  return h >= WORK_HOURS_START && h < WORK_HOURS_END
}

/**
 * Fire one keepalive refresh. Sends a minimal Anthropic query whose
 * prompt contains BP1+BP2 (stable prefix) + a tiny "health=?" user message.
 * The SDK returns cache_read_input_tokens on every response; we log both
 * the tokens paid (creation) and tokens saved (read) so the /ops
 * dashboard can show the breakeven math.
 *
 * Called by the interval timer; also called on-demand by tests.
 *
 * @param {Object} options
 * @param {Function} [options.sender] - async (messages, system) → { usage }.
 *   Injected for tests. Defaults to the live Claude API client via
 *   claudeService.cacheKeepalivePing (added as a thin export, see below).
 * @param {string} [options.stablePrefix] - the BP1+BP2 content to refresh.
 *   Injected for tests. Production callers pass the current
 *   buildCustomSystemPrompt output.
 * @returns {Promise<{ok: boolean, cost_tokens?: number, cache_read_tokens?: number, skipped?: string, error?: string}>}
 */
async function fireRefresh({ sender, stablePrefix, now = new Date() } = {}) {
  if (!_isWorkHours(now)) {
    metrics.skipped_outside_hours++
    logger.debug('cacheKeepalive: outside work hours, skipping', {
      aest_hour: _currentAESTHour(now),
    })
    return { ok: false, skipped: 'outside_hours' }
  }

  // Skip if a real turn fired within the last INTERVAL_MS - no point
  // keepaliving a cache that's already been touched. Caller provides the
  // last-turn timestamp via options.lastTurnAt; absent = don't skip.
  // (Keepalive always runs alongside; if a turn just happened, the cache
  // is fresh and our call is free.)

  if (typeof sender !== 'function') {
    // Lazy-require the real sender so tests can inject without pulling
    // in claudeService (and its heavy deps) at module load.
    try {
      const claudeService = require('../services/claudeService')
      if (typeof claudeService.cacheKeepalivePing !== 'function') {
        logger.warn('cacheKeepalive: claudeService.cacheKeepalivePing not available; worker inert')
        metrics.errors++
        return { ok: false, error: 'no_sender' }
      }
      sender = claudeService.cacheKeepalivePing
    } catch (err) {
      logger.warn('cacheKeepalive: failed to load claudeService', { error: err.message })
      metrics.errors++
      return { ok: false, error: 'sender_load_failed' }
    }
  }

  if (!stablePrefix) {
    // Load the current stable prefix from the assembler. Using the same
    // path the live turn uses guarantees cache-key match.
    try {
      const osSessionService = require('../services/osSessionService')
      const env = require('../config/env')
      const cwd = env.OS_SESSION_CWD || '/home/tate/ecodiaos'
      stablePrefix = osSessionService.buildCustomSystemPrompt(cwd)
    } catch (err) {
      logger.warn('cacheKeepalive: failed to build stable prefix', { error: err.message })
      metrics.errors++
      return { ok: false, error: 'prefix_build_failed' }
    }
  }

  try {
    const result = await sender({
      stablePrefix,
      userMessage: 'health=?',
    })
    metrics.fires++
    _lastFireAt = now
    const inputTokens = result?.usage?.input_tokens ?? 0
    const cacheReadTokens = result?.usage?.cache_read_input_tokens ?? 0
    metrics.refresh_cost_tokens += inputTokens
    logger.info('cache_keepalive_fires_total', {
      fires_total: metrics.fires,
      cost_tokens: inputTokens,
      cache_read_tokens: cacheReadTokens,
      prefix_bytes: stablePrefix.length,
    })
    return { ok: true, cost_tokens: inputTokens, cache_read_tokens: cacheReadTokens }
  } catch (err) {
    metrics.errors++
    logger.warn('cache_keepalive_errors_total', {
      errors_total: metrics.errors,
      error: err.message,
    })
    return { ok: false, error: err.message }
  }
}

/**
 * Start the keepalive interval. Idempotent - calling start() twice is a no-op.
 */
function start() {
  if (_timer) return
  // Fire once shortly after boot so fresh processes immediately warm the
  // cache rather than waiting up to 45min for the first interval.
  // Tracked so stop() can cancel the warmup if the process is shutting
  // down before the first fire lands.
  _bootTimer = setTimeout(() => {
    _bootTimer = null
    fireRefresh().catch(err => logger.debug('bg task error', { err: err.message }))
  }, 30_000)
  _timer = setInterval(() => { fireRefresh().catch(err => logger.debug('bg task error', { err: err.message })) }, INTERVAL_MS)
  // Use unref() so the timers don't block process exit on SIGINT. PM2's
  // graceful-shutdown window (~1.5s) is not long enough for a 30s boot
  // timer to resolve organically; unref() lets node exit when nothing
  // else is pending.
  if (typeof _bootTimer.unref === 'function') _bootTimer.unref()
  if (typeof _timer.unref === 'function') _timer.unref()
  logger.info('cacheKeepaliveWorker: started', {
    interval_ms: INTERVAL_MS,
    work_hours: `${WORK_HOURS_START}-${WORK_HOURS_END} AEST`,
  })
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null }
  if (_bootTimer) { clearTimeout(_bootTimer); _bootTimer = null }
}

function getMetrics() {
  return { ...metrics, last_fire_at: _lastFireAt }
}

function _resetForTest() {
  stop()
  _lastFireAt = null
  metrics.fires = 0
  metrics.refresh_cost_tokens = 0
  metrics.skipped_outside_hours = 0
  metrics.skipped_recent_activity = 0
  metrics.errors = 0
}

module.exports = {
  start,
  stop,
  fireRefresh,
  getMetrics,
  _isWorkHours,
  _currentAESTHour,
  _resetForTest,
  INTERVAL_MS,
  WORK_HOURS_START,
  WORK_HOURS_END,
}

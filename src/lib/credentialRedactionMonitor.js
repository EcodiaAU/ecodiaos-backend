'use strict'

/**
 * credentialRedactionMonitor - bootstrap-aware burst detector for §5.1.
 *
 * credentialFilter.getCounters() is a per-process map of type+source
 * counters. A non-zero counter is a signal: either a real credential
 * was seen in an emit path (actual leak), or a known-false pattern
 * matched early in the process lifecycle (bootstrap noise).
 *
 * §7.2 specifies: after a bootstrap window, any increment to the
 * redaction total fires `credential_redaction_burst`. Before the window
 * closes, counters are observed but do not fire.
 *
 * Bootstrap window defaults to 2 hours - long enough for any startup
 * log flush, listener warm-up, and initial session resumes to complete.
 */

const credentialFilter = require('./credentialFilter')
const logger = require('../config/logger')

const DEFAULT_BOOTSTRAP_MS = Number(process.env.CRED_REDACT_BOOTSTRAP_MS) || (2 * 60 * 60 * 1000)
const DEFAULT_POLL_MS = Number(process.env.CRED_REDACT_POLL_MS) || 30_000

let _bootAt = null
let _bootstrapMs = DEFAULT_BOOTSTRAP_MS
let _lastTotal = 0
let _poller = null
let _fireIncident = null

function _sumCounters() {
  const c = credentialFilter.getCounters()
  let sum = 0
  for (const v of Object.values(c)) sum += v
  return sum
}

/**
 * Returns a 24h-ish snapshot for /api/ops/metrics. Since counters are
 * in-process and reset on restart, "24h" here is effectively "since boot"
 * - accurate because emergency-mode procedure requires a manual restart
 * anyway. Include bootstrap window status so the dashboard can badge.
 */
function snapshot() {
  const now = Date.now()
  const boot = _bootAt || now
  const elapsedMs = now - boot
  const bootstrapDone = elapsedMs >= _bootstrapMs
  return {
    total_since_boot: _sumCounters(),
    bootstrap_done: bootstrapDone,
    bootstrap_remaining_ms: bootstrapDone ? 0 : _bootstrapMs - elapsedMs,
    counters_by_type_source: credentialFilter.getCounters(),
  }
}

/**
 * Start the poller. Takes a fireIncident fn (dependency-injected so tests
 * and boot wiring can replace it). Called once at server boot.
 */
function start({ fireIncident, bootstrapMs, pollMs } = {}) {
  if (_poller) return
  _bootAt = Date.now()
  if (typeof bootstrapMs === 'number') _bootstrapMs = bootstrapMs
  if (typeof fireIncident === 'function') _fireIncident = fireIncident
  _lastTotal = _sumCounters()
  const pollInterval = typeof pollMs === 'number' ? pollMs : DEFAULT_POLL_MS
  _poller = setInterval(_tick, pollInterval)
  if (_poller.unref) _poller.unref()
  logger.info('credentialRedactionMonitor started', {
    bootstrap_ms: _bootstrapMs,
    poll_ms: pollInterval,
  })
}

function stop() {
  if (_poller) { clearInterval(_poller); _poller = null }
}

async function _tick() {
  const snap = snapshot()
  if (!snap.bootstrap_done) {
    _lastTotal = snap.total_since_boot
    return
  }
  if (snap.total_since_boot > _lastTotal) {
    const delta = snap.total_since_boot - _lastTotal
    _lastTotal = snap.total_since_boot
    if (typeof _fireIncident === 'function') {
      try {
        await _fireIncident({
          incident_class: 'credential_redaction_burst',
          trigger_source: 'credentialRedactionMonitor',
          details: {
            delta,
            total_since_boot: snap.total_since_boot,
            counters_by_type_source: snap.counters_by_type_source,
          },
        })
      } catch (err) {
        logger.error('credentialRedactionMonitor: fireIncident threw', { error: err.message })
      }
    } else {
      logger.error('credentialRedactionMonitor: burst detected but no fireIncident wired', {
        delta, total_since_boot: snap.total_since_boot,
      })
    }
  }
}

// Test hooks
function _resetForTest() {
  stop()
  _bootAt = null
  _bootstrapMs = DEFAULT_BOOTSTRAP_MS
  _lastTotal = 0
  _fireIncident = null
}

module.exports = {
  start,
  stop,
  snapshot,
  _tick,
  _resetForTest,
}

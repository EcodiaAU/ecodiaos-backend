'use strict'

/**
 * systemPulseObserver — the firehose observer.
 *
 * Unlike the trio (which subscribe to assistant_text / user / tool_use stream
 * events via the listener registry), systemPulse pulls from THREE sources:
 *
 *   1. perceptionBus.subscribe() in-process callback (all bus events).
 *   2. logger transport tail (warn+error Pino entries) via subscribeToLogStream.
 *   3. /api/observer-pulse/fe-event POSTs from frontend console proxy.
 *
 * All three feed pulseEventBuffer, which:
 *   - keeps a 1000-event ring for fast Haiku compaction every 5min, and
 *   - persists each event to observer_pulse_events for the admin lens.
 *
 * The actual Haiku-driven anomaly detection lives in pulseStreamService.
 * This module is the WIRING layer.
 *
 * It is NOT a listener in the registry-managed sense (the registry watches
 * only conductor-stream events). It's a self-starting service started by
 * server.js boot block.
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const logger = require('../../config/logger')
const pulseBuffer = require('../pulseEventBuffer')
const perceptionBus = require('../perceptionBus')
const pulseStream = require('../pulseStreamService')

let _started = false

function _onPerceptionEvent(event) {
  if (!event) return
  pulseBuffer.push({
    source: 'perception_bus',
    level: null,
    kind: event.kind || null,
    payload: {
      source: event.source,
      data: event.data,
      confidence: event.confidence,
      id: event.id,
    },
    ts: event.observed_at ? new Date(event.observed_at).toISOString() : undefined,
  })
}

function _onLogEvent(entry) {
  // Called by logger.subscribeToLogStream for warn/error level entries.
  if (!entry) return
  pulseBuffer.push({
    source: 'pino_log',
    level: entry.level || null,
    kind: entry.event || entry.msg || null,
    payload: entry,
    ts: entry.time ? new Date(entry.time).toISOString() : undefined,
  })
}

// Called by /api/observer-pulse/fe-event route handler (see Phase 3).
function ingestFeEvent(event) {
  if (!event || typeof event !== 'object') return
  pulseBuffer.push({
    source: event.source || 'fe_console',
    level: event.level || null,
    kind: event.kind || null,
    payload: event.payload || {},
    ts: event.ts || undefined,
  })
}

function start() {
  if (_started) return
  _started = true

  try {
    perceptionBus.subscribe(_onPerceptionEvent)
    logger.info('systemPulseObserver: subscribed to perceptionBus')
  } catch (err) {
    logger.warn('systemPulseObserver: perceptionBus subscribe failed', { error: err.message })
  }

  // Logger stream subscription is best-effort — if the logger module hasn't
  // exposed subscribeToLogStream (older builds), we skip without erroring.
  try {
    if (typeof logger.subscribeToLogStream === 'function') {
      logger.subscribeToLogStream(_onLogEvent)
      logger.info('systemPulseObserver: subscribed to logger warn+error stream')
    } else {
      logger.debug('systemPulseObserver: logger.subscribeToLogStream not available — skipping pino tail')
    }
  } catch (err) {
    logger.warn('systemPulseObserver: logger subscribe failed', { error: err.message })
  }

  // Start the Haiku compaction loop.
  try {
    pulseStream.start()
  } catch (err) {
    logger.warn('systemPulseObserver: pulseStream.start failed', { error: err.message })
  }
}

module.exports = { start, ingestFeEvent }

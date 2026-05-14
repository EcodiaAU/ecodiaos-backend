'use strict'

/**
 * pulseStreamService — rolling Haiku state-summary loop.
 *
 * Every COMPACT_INTERVAL_MS:
 *   1. Read events from pulseEventBuffer since last compaction.
 *   2. Read last compaction state_summary from observer_pulse_state.
 *   3. Send to Haiku: "here's the prior state, here's what happened, return
 *      new state + list of anomalies".
 *   4. Persist new state_summary + counters back to observer_pulse_state.
 *   5. For each anomaly with severity >= floor → write to observer_signals
 *      (via observerSignalsService) with priority derived from severity.
 *
 * This is the only Haiku call cost in the firehose loop. Cap is ~12 calls/hour
 * by default (every 5 minutes). Budget: ~$0.50/day on Haiku 4.5.
 *
 * Design intent:
 *   - The conductor never reads this state directly. It only sees the
 *     anomaly-derived observer_signals (same channel as the other observers).
 *   - The admin lens reads observer_pulse_state.state_summary for the
 *     human-readable rolling overview ("the system is healthy" / "elevated
 *     fork-error rate in the last 10min").
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const logger = require('../config/logger')
const db = require('../config/db')
const haikuClient = require('./observers/_haikuClient')
const pulseBuffer = require('./pulseEventBuffer')
const observerSignals = require('./observerSignalsService')
const { _postIntervention } = require('./observers/_observerBase')

const COMPACT_INTERVAL_MS = parseInt(process.env.PULSE_COMPACT_MS || String(5 * 60 * 1000), 10)
const INITIAL_DELAY_MS = parseInt(process.env.PULSE_INITIAL_DELAY_MS || String(45 * 1000), 10)
const ANOMALY_FLOOR_DEFAULT = process.env.PULSE_ANOMALY_FLOOR || 'medium'

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }

const SYSTEM_PROMPT = `You are the systemPulse observer for EcodiaOS — a rolling state-summary intelligence over a 24/7 agentic operating system.

Every 5 minutes you receive (a) the prior compacted state summary, (b) a chronological list of structured events from the last 5 minutes covering perception bus, server warn/error logs, and frontend events. Your job:
  1. Return a new compacted STATE_SUMMARY (<= 600 chars). The summary is a human-readable health snapshot — running services, recent activity volume, notable status changes.
  2. Identify ANOMALIES. An anomaly is a deviation worth telling the conductor about: error spikes, repeated identical warnings, FE 401s indicating auth expiry, fork-error storms, unexpected restarts, stuck queues, perception events about external blockers.

Severity grading:
  info     = "minor blip, no action needed" — DO NOT EMIT, just summarise in state.
  low      = "trending, worth watching" — emit, conductor decides.
  medium   = "anomaly with plausible action" — emit, normal priority.
  high     = "system degradation, needs attention this hour" — emit.
  critical = "production-impacting, user-blocking, or data-loss-risk" — emit as P1.

Priority mapping for emitted anomalies:
  low/medium/high → priority 3 (ambient)
  critical        → priority 1 (interrupt-eligible)

Always return JSON only:
  {
    "state_summary": "<= 600 chars>",
    "anomalies": [
      {
        "severity": "low|medium|high|critical",
        "title": "<short>",
        "description": "<= 200 chars>",
        "evidence_seqs": [<seq numbers from input>],
        "suggested_action": "<short or null>"
      }
    ],
    "structured_state": { "<key>": <value> }
  }`

let _timer = null
let _initialDelay = null
let _running = false

async function _readPrior() {
  try {
    const rows = await db`SELECT state_summary, events_observed_since_boot, anomalies_flagged_since_boot, last_compaction_at FROM observer_pulse_state WHERE id = 1`
    if (rows.length === 0) return { state_summary: null, events: 0, anomalies: 0, last: null }
    const r = rows[0]
    return {
      state_summary: r.state_summary,
      events: Number(r.events_observed_since_boot || 0),
      anomalies: Number(r.anomalies_flagged_since_boot || 0),
      last: r.last_compaction_at,
    }
  } catch (err) {
    logger.debug('pulseStreamService._readPrior failed', { error: err.message })
    return { state_summary: null, events: 0, anomalies: 0, last: null }
  }
}

async function _writeState({ state_summary, structured_state, eventsThisCycle, anomaliesThisCycle, priorTotals }) {
  try {
    const newEvents = priorTotals.events + eventsThisCycle
    const newAnoms = priorTotals.anomalies + anomaliesThisCycle
    await db`
      UPDATE observer_pulse_state
      SET state_summary = ${state_summary || null},
          events_observed_since_boot = ${newEvents},
          anomalies_flagged_since_boot = ${newAnoms},
          current_state_json = ${JSON.stringify(structured_state || {})}::jsonb,
          last_compaction_at = NOW(),
          updated_at = NOW()
      WHERE id = 1
    `
  } catch (err) {
    logger.debug('pulseStreamService._writeState failed', { error: err.message })
  }
}

function _buildPrompt(prior, events) {
  const lines = []
  lines.push('PRIOR STATE SUMMARY:')
  lines.push(prior.state_summary ? prior.state_summary : '(none — first compaction since boot)')
  lines.push(`\nTOTAL EVENTS SINCE BOOT: ${prior.events}`)
  lines.push(`TOTAL ANOMALIES SINCE BOOT: ${prior.anomalies}`)
  lines.push(`\nEVENTS THIS CYCLE (${events.length}, oldest first):`)
  if (events.length === 0) {
    lines.push('  (none)')
  } else {
    for (const e of events) {
      const head = `[seq=${e.seq} ${String(e.ts).slice(11, 19)} ${e.source}${e.level ? '/' + e.level : ''}${e.kind ? '/' + e.kind : ''}]`
      let body
      try {
        body = JSON.stringify(e.payload).slice(0, 300)
      } catch {
        body = '(unserialisable)'
      }
      lines.push(`  ${head} ${body}`)
    }
  }
  lines.push('\nReturn JSON only.')
  return lines.join('\n')
}

async function _cycle() {
  if (_running) return
  _running = true
  try {
    const events = pulseBuffer.drain(14_000)
    if (events.length === 0) {
      // No events this cycle — skip Haiku call to save tokens. Touch
      // last_compaction_at so the admin lens can tell the loop is alive.
      try {
        await db`UPDATE observer_pulse_state SET last_compaction_at = NOW(), updated_at = NOW() WHERE id = 1`
      } catch { /* non-fatal */ }
      return
    }

    const prior = await _readPrior()
    const prompt = _buildPrompt(prior, events)
    const result = await haikuClient.call({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: prompt,
      observerName: 'systemPulse',
    })

    const state_summary = result?.state_summary
      ? String(result.state_summary).slice(0, 600)
      : '(systemPulse: state_summary missing from Haiku response)'

    const anomalies = Array.isArray(result?.anomalies) ? result.anomalies : []
    let emitted = 0
    for (const a of anomalies) {
      const severity = String(a.severity || '').toLowerCase()
      const rank = SEVERITY_RANK[severity] ?? 0
      const floorRank = SEVERITY_RANK[ANOMALY_FLOOR_DEFAULT] ?? 2
      if (rank < floorRank) continue

      const priority = severity === 'critical' ? 1 : 3
      const confidence = severity === 'critical' ? 0.95
        : severity === 'high' ? 0.9
        : severity === 'medium' ? 0.8
        : 0.7
      const message = `[${severity}] ${a.title || 'anomaly'} — ${(a.description || '').slice(0, 200)}${a.suggested_action ? ` (suggest: ${String(a.suggested_action).slice(0, 80)})` : ''}`
      const correlationId = `pulse:${Date.now()}:${emitted}`
      try {
        // Route through _postIntervention so we get the P1 WS broadcast +
        // dedup + mute machinery the trio observers use.
        await _postIntervention('systemPulse', message.slice(0, 400), {
          signal_kind: `anomaly_${severity}`,
          reason: a.title || null,
          confidence,
          priority,
          correlation_id: correlationId,
        })
        emitted += 1
      } catch (err) {
        logger.debug('pulseStreamService: writeSignal failed', { error: err.message })
      }
    }

    await _writeState({
      state_summary,
      structured_state: result?.structured_state || {},
      eventsThisCycle: events.length,
      anomaliesThisCycle: anomalies.length,
      priorTotals: prior,
    })

    logger.info('pulseStreamService: compaction cycle complete', {
      events: events.length,
      anomalies_seen: anomalies.length,
      signals_emitted: emitted,
    })
  } catch (err) {
    logger.warn('pulseStreamService: cycle threw', { error: err.message })
  } finally {
    _running = false
  }
}

function start() {
  if (_timer || _initialDelay) return
  logger.info('pulseStreamService: starting compaction loop', {
    interval_ms: COMPACT_INTERVAL_MS,
    initial_delay_ms: INITIAL_DELAY_MS,
  })
  _initialDelay = setTimeout(() => {
    _initialDelay = null
    _cycle().catch(() => {})
    _timer = setInterval(() => _cycle().catch(() => {}), COMPACT_INTERVAL_MS)
    if (_timer.unref) _timer.unref()
  }, INITIAL_DELAY_MS)
  if (_initialDelay.unref) _initialDelay.unref()
}

function stop() {
  if (_initialDelay) { clearTimeout(_initialDelay); _initialDelay = null }
  if (_timer) { clearInterval(_timer); _timer = null }
}

module.exports = { start, stop, _cycle }

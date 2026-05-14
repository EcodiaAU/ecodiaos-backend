'use strict'

/**
 * /api/observer-pulse — frontend firehose ingestion + state read endpoints.
 *
 *   POST /api/observer-pulse/fe-event   batched FE events (console + routes + ws + errors)
 *   GET  /api/observer-pulse/state      latest compacted state snapshot (admin lens)
 *   GET  /api/observer-pulse/events     recent events (admin lens)
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const { Router } = require('express')
const logger = require('../config/logger')
const db = require('../config/db')

const router = Router()

// ── Posting events from the FE console proxy ────────────────────────────────

const FE_EVENT_MAX_PER_REQUEST = 200
const FE_PAYLOAD_BYTE_CAP = 8000  // per event payload — guards against runaway log lines

function _normaliseFeEvent(e) {
  if (!e || typeof e !== 'object') return null
  const out = {
    source: String(e.source || 'fe_console').slice(0, 64),
    level: e.level ? String(e.level).slice(0, 16) : null,
    kind: e.kind ? String(e.kind).slice(0, 64) : null,
    ts: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString(),
  }
  // Payload: anything serialisable. Drop if oversized.
  let payload = e.payload
  try {
    const json = JSON.stringify(payload || {})
    out.payload = json.length > FE_PAYLOAD_BYTE_CAP
      ? { _truncated: true, head: json.slice(0, FE_PAYLOAD_BYTE_CAP) }
      : (payload || {})
  } catch {
    out.payload = { _stringify_failed: true }
  }
  return out
}

router.post('/fe-event', async (req, res, next) => {
  try {
    const body = req.body || {}
    const events = Array.isArray(body.events) ? body.events : (body.event ? [body.event] : [])
    if (events.length === 0) return res.status(400).json({ ok: false, error: 'no events' })
    if (events.length > FE_EVENT_MAX_PER_REQUEST) {
      return res.status(413).json({ ok: false, error: `max ${FE_EVENT_MAX_PER_REQUEST} events per request` })
    }

    const systemPulse = (() => {
      try { return require('../services/observers/systemPulseObserver') } catch { return null }
    })()

    let accepted = 0
    for (const raw of events) {
      const norm = _normaliseFeEvent(raw)
      if (!norm) continue
      if (systemPulse && typeof systemPulse.ingestFeEvent === 'function') {
        systemPulse.ingestFeEvent(norm)
      }
      accepted += 1
    }
    return res.json({ ok: true, accepted })
  } catch (err) {
    logger.warn('POST /api/observer-pulse/fe-event failed', { error: err.message })
    next(err)
  }
})

// ── Admin lens reads ────────────────────────────────────────────────────────

router.get('/state', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT state_summary, events_observed_since_boot, anomalies_flagged_since_boot,
             current_state_json, last_compaction_at, updated_at
      FROM observer_pulse_state
      WHERE id = 1
    `
    if (rows.length === 0) {
      return res.json({
        state_summary: null,
        events_observed_since_boot: 0,
        anomalies_flagged_since_boot: 0,
        current_state_json: {},
        last_compaction_at: null,
      })
    }
    res.json(rows[0])
  } catch (err) {
    if (err.code === '42P01') return res.json({ state_summary: null, events_observed_since_boot: 0, anomalies_flagged_since_boot: 0, current_state_json: {}, last_compaction_at: null })
    logger.warn('GET /api/observer-pulse/state failed', { error: err.message })
    next(err)
  }
})

router.get('/events', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 15 * 60 * 1000)
    const source = req.query.source || null
    const rows = await db`
      SELECT id, source, level, kind, payload, ts
      FROM observer_pulse_events
      WHERE ts > ${since}
        AND (${source}::text IS NULL OR source = ${source})
      ORDER BY ts DESC
      LIMIT ${limit}
    `
    res.json({ events: rows, count: rows.length })
  } catch (err) {
    if (err.code === '42P01') return res.json({ events: [], count: 0 })
    logger.warn('GET /api/observer-pulse/events failed', { error: err.message })
    next(err)
  }
})

module.exports = router

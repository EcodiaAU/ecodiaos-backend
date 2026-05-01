/**
 * /api/telemetry routes - observability for the Decision Quality
 * Self-Optimization Architecture (Phases B + D).
 *
 * See:
 *   ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *
 * Endpoints:
 *   GET  /api/telemetry/decision-quality?days=7   - 5-panel dashboard
 *   GET  /api/telemetry/drift                     - active drift flags
 *   POST /api/telemetry/consume                   - one-shot trigger of the
 *                                                   batch consumer (admin/cron use)
 *   POST /api/telemetry/infer-outcomes            - one-shot trigger of the
 *                                                   outcome inferrer (admin/cron use)
 *   POST /api/telemetry/classify-outcomes         - one-shot trigger of the
 *                                                   failureClassifier (Phase D)
 *   POST /api/telemetry/outcome/:id/classify      - Tate-tagged ground-truth
 *                                                   override of an outcome's
 *                                                   classification (Phase D
 *                                                   Task 4)
 *
 * All routes require auth (Bearer token / MCP_INTERNAL_TOKEN). The dashboard
 * route is read-only; consume + infer-outcomes + classify-outcomes mutate by
 * inserting/updating rows. The override route lands a Tate-tagged value the
 * accuracy check uses as ground truth.
 */

'use strict'

const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const decisionQualityService = require('../services/telemetry/decisionQualityService')
const dispatchEventConsumer = require('../services/telemetry/dispatchEventConsumer')
const outcomeInference = require('../services/telemetry/outcomeInference')
const failureClassifier = require('../services/telemetry/failureClassifier')
const episodeResurface = require('../services/episodeResurface')
const turnInjection = require('../services/turnInjectionService')
const fs = require('fs')
const readline = require('readline')

const VALID_CLASSIFICATIONS = new Set(['usage_failure', 'surfacing_failure', 'doctrine_failure'])

router.use(auth)

// GET /api/telemetry/decision-quality?days=7
router.get('/decision-quality', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7))
    const result = await decisionQualityService.computeDecisionQuality({ days })
    res.json(result)
  } catch (err) { next(err) }
})

// GET /api/telemetry/drift
router.get('/drift', async (_req, res, next) => {
  try {
    const flags = await decisionQualityService.computeDriftSignals()
    res.json({ flags, count: flags.length })
  } catch (err) { next(err) }
})

// POST /api/telemetry/consume
// Triggers a one-shot run of the dispatchEventConsumer (rotates JSONL,
// inserts rows, prunes processed/). Used by the consumer cron when the
// scheduler fires.
router.post('/consume', async (_req, res, next) => {
  try {
    const result = await dispatchEventConsumer.runOnce()
    res.json(result)
  } catch (err) { next(err) }
})

// POST /api/telemetry/infer-outcomes
// Triggers a one-shot run of the outcome inferrer.
router.post('/infer-outcomes', async (_req, res, next) => {
  try {
    const result = await outcomeInference.runOnce()
    res.json(result)
  } catch (err) { next(err) }
})

// POST /api/telemetry/classify-outcomes?max=50
// One-shot trigger of the Phase D failureClassifier.
router.post('/classify-outcomes', async (req, res, next) => {
  try {
    const max = Math.max(1, Math.min(500, parseInt(req.query.max, 10) || failureClassifier.DEFAULT_MAX_PER_TICK || 50))
    const result = await failureClassifier.runOnce({ max })
    res.json(result)
  } catch (err) { next(err) }
})

// ─── Phase F (Layer 7) — Episode resurfacing ────────────────────────────

// GET /api/telemetry/episode-resurface?days=7
router.get('/episode-resurface', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7))
    const [byHook, healthMetric] = await Promise.all([
      episodeResurface.getResurfaceFrequency({ days }),
      episodeResurface.getRepeatedFailureRate({ days: Math.max(days, 30) }),
    ])
    res.json({ window_days: days, by_hook: byHook, health: healthMetric })
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/run
router.post('/episode-resurface/run', async (req, res, next) => {
  try {
    const body = req.body || {}
    const queryText = body.queryText || ''
    if (!queryText || typeof queryText !== 'string') {
      return res.status(400).json({ error: 'queryText (string) is required' })
    }
    if (body.recordRows !== false) {
      const result = await episodeResurface.runForDispatch({
        queryText,
        dispatchEventId: body.dispatchEventId,
        hookName: body.hookName,
        toolName: body.toolName,
        limit: body.limit,
        minScore: body.minScore,
        metadataExtra: body.metadataExtra,
      })
      return res.json(result)
    }
    const hits = await episodeResurface.resurfaceEpisodes(queryText, { limit: body.limit, minScore: body.minScore })
    res.json({ hits, recorded: { inserted: 0, ids: [] } })
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/:id/acknowledge
router.post('/episode-resurface/:id/acknowledge', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })
    const result = await episodeResurface.markAcknowledgement({ id, ack: req.body && req.body.ack === true })
    res.json(result)
  } catch (err) { next(err) }
})

// POST /api/telemetry/outcome/:id/classify
// Tate-tagged ground-truth override (Phase D Task 4).
router.post('/outcome/:id/classify', async (req, res, next) => {
  try {
    const id = req.params.id
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'invalid_outcome_id' })
    }
    const classification = req.body && req.body.classification
    const note = req.body && typeof req.body.note === 'string' ? req.body.note : null
    if (!classification || !VALID_CLASSIFICATIONS.has(classification)) {
      return res.status(400).json({
        error: 'invalid_classification',
        allowed: Array.from(VALID_CLASSIFICATIONS),
      })
    }
    const { Client } = require('pg')
    const env = require('../config/env')
    const client = new Client({ connectionString: env.DATABASE_URL })
    await client.connect()
    try {
      const noteUpdate = note
        ? `, classification_evidence = COALESCE(classification_evidence, '{}'::jsonb) || jsonb_build_object('tate_note', $3::text)`
        : ''
      const params = note ? [id, classification, note] : [id, classification]
      const sql = `UPDATE outcome_event SET classification_tate_tagged = $2 ${noteUpdate} WHERE id = $1 RETURNING id, outcome, classification, classification_tate_tagged, classification_at, classification_evidence`
      const r = await client.query(sql, params)
      if (r.rowCount === 0) {
        return res.status(404).json({ error: 'outcome_not_found', id })
      }
      res.json({ ok: true, outcome: r.rows[0] })
    } finally {
      try { await client.end() } catch { /* ignore */ }
    }
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/:id/repeated-failure
router.post('/episode-resurface/:id/repeated-failure', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })
    const repeated = req.body && req.body.repeated === true
    const result = await episodeResurface.markRepeatedFailure({ id, repeated })
    res.json(result)
  } catch (err) { next(err) }
})

// ─── Per-turn injection cost telemetry ──────────────────────────────────────

// GET /api/telemetry/per-turn-injection-cost?days=1&session_id=...
router.get('/per-turn-injection-cost', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 1))
    const sessionFilter = (req.query.session_id || '').trim() || null
    const sampleLimit = Math.max(0, Math.min(500, parseInt(req.query.sample, 10) || 50))
    const file = turnInjection._TELEMETRY_FILE
    if (!fs.existsSync(file)) {
      return res.json({ window_days: days, session_id: sessionFilter, total_rows: 0, per_block: {}, sample: [], notice: 'no telemetry file yet' })
    }
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const stream = fs.createReadStream(file, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
    const perBlock = {}
    const sample = []
    let totalRows = 0
    for await (const line of rl) {
      if (!line.trim()) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      if (!row || !row.ts) continue
      if (Date.parse(row.ts) < cutoff) continue
      if (sessionFilter && row.session_id !== sessionFilter) continue
      totalRows += 1
      const tag = row.block_name || '<unknown>'
      const bucket = perBlock[tag] || (perBlock[tag] = { emit: 0, skip: 0, skip_reasons: {}, total_chars_emit: 0, total_chars_skip: 0 })
      if (row.emitted) { bucket.emit += 1; bucket.total_chars_emit += Number(row.char_count) || 0 }
      else { bucket.skip += 1; bucket.total_chars_skip += Number(row.char_count) || 0; const reason = row.skip_reason || 'unknown'; bucket.skip_reasons[reason] = (bucket.skip_reasons[reason] || 0) + 1 }
      if (sample.length < sampleLimit) sample.push(row)
    }
    for (const [tag, b] of Object.entries(perBlock)) {
      const total = b.emit + b.skip; b.total = total
      b.emit_rate = total > 0 ? b.emit / total : 0; b.skip_rate = total > 0 ? b.skip / total : 0
      b.dedupe_rate = total > 0 ? (b.skip_reasons.dedupe || 0) / total : 0
      b.avg_chars_emit = b.emit > 0 ? Math.round(b.total_chars_emit / b.emit) : 0
      b.avg_chars_skip = b.skip > 0 ? Math.round(b.total_chars_skip / b.skip) : 0
    }
    const total_emit = Object.values(perBlock).reduce((a, b) => a + b.total_chars_emit, 0)
    const total_skip = Object.values(perBlock).reduce((a, b) => a + b.total_chars_skip, 0)
    res.json({ window_days: days, session_id: sessionFilter, rollup: { total_rows: totalRows, total_chars_emit: total_emit, total_chars_skipped: total_skip, cost_savings_pct: (total_emit + total_skip) > 0 ? total_skip / (total_emit + total_skip) : 0 }, per_block: perBlock, sample })
  } catch (err) { next(err) }
})

// GET /api/telemetry/per-turn-injection-cost/minimal-mode
router.get('/per-turn-injection-cost/minimal-mode', async (_req, res, next) => {
  try { const enabled = await turnInjection.getMinimalMode(); res.json({ enabled }) }
  catch (err) { next(err) }
})

// POST /api/telemetry/per-turn-injection-cost/minimal-mode
router.post('/per-turn-injection-cost/minimal-mode', async (req, res, next) => {
  try { const enabled = !!(req.body && req.body.enabled); await turnInjection.setMinimalMode(enabled); res.json({ enabled }) }
  catch (err) { next(err) }
})
  } catch (err) { next(err) }
})

module.exports = router

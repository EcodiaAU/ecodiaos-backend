/**
 * /api/telemetry routes - Phase B observability for the Decision Quality
 * Self-Optimization Architecture.
 *
 * See:
 *   ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *
 * Endpoints:
 *   GET  /api/telemetry/decision-quality?days=7 - 4-panel dashboard
 *   GET  /api/telemetry/drift - active drift flags
 *   POST /api/telemetry/consume - one-shot trigger of the
 *                                                   batch consumer (admin/cron use)
 *   POST /api/telemetry/infer-outcomes - one-shot trigger of the
 *                                                   outcome inferrer (admin/cron use)
 *
 * All routes require auth (Bearer token / MCP_INTERNAL_TOKEN). The dashboard
 * route is read-only; consume + infer-outcomes mutate by inserting rows.
 */

'use strict'

const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const decisionQualityService = require('../services/telemetry/decisionQualityService')
const dispatchEventConsumer = require('../services/telemetry/dispatchEventConsumer')
const outcomeInference = require('../services/telemetry/outcomeInference')
const episodeResurface = require('../services/episodeResurface')
const turnInjection = require('../services/turnInjectionService')
const fs = require('fs')
const readline = require('readline')
const db = require('../config/db')

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

// ─── Phase F (Layer 7) - Episode resurfacing ────────────────────────────

// GET /api/telemetry/episode-resurface?days=7
// Layer-7 dashboard: resurface frequency by hook + repeated-failure rate.
// See: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
router.get('/episode-resurface', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7))
    const [byHook, healthMetric] = await Promise.all([
      episodeResurface.getResurfaceFrequency({ days }),
      episodeResurface.getRepeatedFailureRate({ days: Math.max(days, 30) }),
    ])
    res.json({
      window_days: days,
      by_hook: byHook,
      health: healthMetric,
    })
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/run
// Run a Layer-7 semantic search for the supplied query text and (optionally)
// record the resurface_event rows. Caller passes:
//   { queryText, dispatchEventId?, hookName?, toolName?, limit?, minScore?,
//     metadataExtra?, recordRows?: boolean (default true) }
router.post('/episode-resurface/run', async (req, res, next) => {
  try {
    const body = req.body || {}
    const queryText = body.queryText || ''
    if (!queryText || typeof queryText !== 'string') {
      return res.status(400).json({ error: 'queryText (string) is required' })
    }
    const recordRows = body.recordRows !== false
    if (recordRows) {
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
    const hits = await episodeResurface.resurfaceEpisodes(queryText, {
      limit: body.limit,
      minScore: body.minScore,
    })
    res.json({ hits, recorded: { inserted: 0, ids: [] } })
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/:id/acknowledge
// Body: { ack: boolean }
router.post('/episode-resurface/:id/acknowledge', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })
    const ack = req.body && req.body.ack === true
    const result = await episodeResurface.markAcknowledgement({ id, ack })
    res.json(result)
  } catch (err) { next(err) }
})

// POST /api/telemetry/episode-resurface/:id/repeated-failure
// Body: { repeated: boolean }
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
//
// Reads the JSONL append log emitted by turnInjectionService.processBlocks
// (logs/telemetry/injection-events.jsonl). Each row is one block-emission
// decision { ts, session_id, turn_idx, block_name, char_count, emitted,
// skip_reason, hash_prefix, minimal_mode }.
//
// Aggregates returned: per-block emit/skip counts, average char_count,
// dedupe hit rate, skip-by-reason breakdown, plus the most recent N raw
// rows for spot-checking. The per-row reads are O(file size) so callers
// should pass session_id to scope the result when possible.
router.get('/per-turn-injection-cost', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 1))
    const sessionFilter = (req.query.session_id || '').trim() || null
    const sampleLimit = Math.max(0, Math.min(500, parseInt(req.query.sample, 10) || 50))

    const file = turnInjection._TELEMETRY_FILE
    if (!fs.existsSync(file)) {
      return res.json({
        window_days: days,
        session_id: sessionFilter,
        total_rows: 0,
        per_block: {},
        sample: [],
        notice: 'no telemetry file yet (no turns processed since service shipped)',
      })
    }
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    const stream = fs.createReadStream(file, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    const perBlock = {}      // tag -> { emit, skip, skip_reasons, total_chars_emit, total_chars_skip }
    const sample = []
    let totalRows = 0

    for await (const line of rl) {
      if (!line.trim()) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      if (!row || !row.ts) continue
      const ts = Date.parse(row.ts)
      if (!Number.isFinite(ts) || ts < cutoff) continue
      if (sessionFilter && row.session_id !== sessionFilter) continue

      totalRows += 1
      const tag = row.block_name || '<unknown>'
      const bucket = perBlock[tag] || (perBlock[tag] = {
        emit: 0,
        skip: 0,
        skip_reasons: {},
        total_chars_emit: 0,
        total_chars_skip: 0,
      })
      if (row.emitted) {
        bucket.emit += 1
        bucket.total_chars_emit += Number(row.char_count) || 0
      } else {
        bucket.skip += 1
        bucket.total_chars_skip += Number(row.char_count) || 0
        const reason = row.skip_reason || 'unknown'
        bucket.skip_reasons[reason] = (bucket.skip_reasons[reason] || 0) + 1
      }

      if (sample.length < sampleLimit) sample.push(row)
    }

    // Compute per-block averages + dedupe hit rate
    for (const [tag, b] of Object.entries(perBlock)) {
      const total = b.emit + b.skip
      b.total = total
      b.emit_rate = total > 0 ? b.emit / total : 0
      b.skip_rate = total > 0 ? b.skip / total : 0
      b.dedupe_rate = total > 0 ? (b.skip_reasons.dedupe || 0) / total : 0
      b.avg_chars_emit = b.emit > 0 ? Math.round(b.total_chars_emit / b.emit) : 0
      b.avg_chars_skip = b.skip > 0 ? Math.round(b.total_chars_skip / b.skip) : 0
    }

    // Aggregate roll-up for at-a-glance read
    const rollup = {
      total_rows: totalRows,
      total_chars_emit: Object.values(perBlock).reduce((a, b) => a + b.total_chars_emit, 0),
      total_chars_skipped: Object.values(perBlock).reduce((a, b) => a + b.total_chars_skip, 0),
    }
    rollup.cost_savings_pct = (rollup.total_chars_emit + rollup.total_chars_skipped) > 0
      ? rollup.total_chars_skipped / (rollup.total_chars_emit + rollup.total_chars_skipped)
      : 0

    res.json({
      window_days: days,
      session_id: sessionFilter,
      rollup,
      per_block: perBlock,
      sample,
    })
  } catch (err) { next(err) }
})

// GET /api/telemetry/per-turn-injection-cost/minimal-mode
// Reads the kv_store flag.
router.get('/per-turn-injection-cost/minimal-mode', async (_req, res, next) => {
  try {
    const enabled = await turnInjection.getMinimalMode()
    res.json({ enabled })
  } catch (err) { next(err) }
})

// POST /api/telemetry/per-turn-injection-cost/minimal-mode
// Body: { enabled: boolean }. Flips the flag.
router.post('/per-turn-injection-cost/minimal-mode', async (req, res, next) => {
  try {
    const enabled = !!(req.body && req.body.enabled)
    await turnInjection.setMinimalMode(enabled)
    res.json({ enabled })
  } catch (err) { next(err) }
})

// ─── Prompt cache hit-rate dashboard ────────────────────────────────────────

// GET /api/telemetry/cache-hit-rate?hours=24
//
// Queries claude_usage for cache_read_input_tokens vs total input_tokens over
// the requested window. Reports:
//   - overall hit rate % (cache_read / (input + cache_read))
//   - rolling breakdown by hour
//   - per-session top 10 by cache savings
//   - most recent prompt_assembler_bytes_per_breakpoint log snapshot (from
//     kv_store key prompt_assembler.last_bp_bytes if populated by the logger
//     sink, or a static reference from the spec §4.1 if not yet live)
//
// Used by the conductor to judge when to flip PROMPT_ASSEMBLY_V2=live.
// Target: cache_read_input_tokens rising turn-over-turn = breakpoints landing.
router.get('/cache-hit-rate', async (req, res, next) => {
  try {
    const hours = Math.max(1, Math.min(168, parseInt(req.query.hours, 10) || 24))
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

    // Overall totals for the window
    const [totals] = await db`
      SELECT
        COALESCE(SUM(input_tokens), 0)                  AS input_tokens,
        COALESCE(SUM(output_tokens), 0)                 AS output_tokens,
        COALESCE(SUM(cache_creation_input_tokens), 0)   AS cache_write_tokens,
        COALESCE(SUM(cache_read_input_tokens), 0)       AS cache_read_tokens,
        COUNT(*)                                        AS turn_count
      FROM claude_usage
      WHERE created_at >= ${cutoff}
        AND source = 'os_session'
    `

    const inputN = Number(totals.input_tokens)
    const cacheReadN = Number(totals.cache_read_tokens)
    const cacheWriteN = Number(totals.cache_write_tokens)
    const denominator = inputN + cacheReadN
    const hitRatePct = denominator > 0
      ? Math.round((cacheReadN / denominator) * 10000) / 100
      : null

    // Hourly breakdown (up to 48h to keep result size sane)
    const clampedHours = Math.min(hours, 48)
    const hourly = await db`
      SELECT
        DATE_TRUNC('hour', created_at)                    AS hour,
        COALESCE(SUM(input_tokens), 0)                    AS input_tokens,
        COALESCE(SUM(cache_read_input_tokens), 0)         AS cache_read_tokens,
        COALESCE(SUM(cache_creation_input_tokens), 0)     AS cache_write_tokens,
        COUNT(*)                                          AS turns
      FROM claude_usage
      WHERE created_at >= ${new Date(Date.now() - clampedHours * 60 * 60 * 1000)}
        AND source = 'os_session'
      GROUP BY 1
      ORDER BY 1 DESC
    `

    const hourlyRows = hourly.map(r => {
      const inp = Number(r.input_tokens)
      const rd  = Number(r.cache_read_tokens)
      const denom = inp + rd
      return {
        hour: r.hour,
        input_tokens: inp,
        cache_read_tokens: rd,
        cache_write_tokens: Number(r.cache_write_tokens),
        turns: Number(r.turns),
        hit_rate_pct: denom > 0 ? Math.round((rd / denom) * 10000) / 100 : null,
      }
    })

    // Spec §4.1 reference byte counts (what "good" looks like per tier).
    // The assembler logs prompt_assembler_bytes_per_breakpoint on every turn;
    // the most recent values are best read from logs, but as a reference floor
    // the spec targets are:
    const specTargetBytes = { bp1: 3000, bp2: 15000, bp3: 5000, bp4: 'variable' }

    res.json({
      window_hours: hours,
      overall: {
        turn_count: Number(totals.turn_count),
        input_tokens: inputN,
        cache_read_tokens: cacheReadN,
        cache_write_tokens: cacheWriteN,
        hit_rate_pct: hitRatePct,
        target_hit_rate_pct: 70,
        status: hitRatePct === null ? 'no_data'
          : hitRatePct >= 70 ? 'target_met'
          : hitRatePct >= 40 ? 'improving'
          : 'below_target',
      },
      hourly: hourlyRows,
      spec_target_bytes_per_breakpoint: specTargetBytes,
      note: 'hit_rate_pct = cache_read / (input + cache_read). Rising turn-over-turn after restart = breakpoints landing. Flip PROMPT_ASSEMBLY_V2=live when stable >=70% over 20 turns.',
    })
  } catch (err) { next(err) }
})

module.exports = router

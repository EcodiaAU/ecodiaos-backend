'use strict'

/**
 * GKG Phase 2 - Pipeline Orchestrator.
 *
 * Walks gkg_events through the four pipeline stages in order and reports
 * a structured summary so the cron-fork that fires this can land a
 * deliverable line in its [FORK_REPORT].
 *
 *   stage 1: classify   -> classifier.classifyPending()
 *   stage 2: enrich     -> visionEnricher.enrichActionsBatch()
 *   stage 3: embed      -> embeddings.embedActionsBatch()
 *   stage 4: upsert     -> graphUpsert.upsertActionsBatch()
 *                          + graphUpsert.drainNonActionEvents()
 *
 * Each stage is idempotent and works against its own progress flag, so
 * a partial run (e.g. SIGTERM mid-pipeline) resumes cleanly on the next
 * sweep. The pipeline does not retry within itself; the cron cadence is
 * the retry mechanism.
 *
 * Exposed callsites:
 *   runPipeline(opts) -> structured summary (default entrypoint)
 *   runStage(name, opts) -> single-stage runner for diagnostics / smoke
 *
 * Phase 1 ingest path (route /api/gkg/ingest) is the producer that lands
 * gkg_events rows; this pipeline is the consumer. They never touch the
 * same code path.
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md §6 Phase 2.
 * Authored 7 May 2026 fork_mov80as1_c968cc for GKG Phase 2.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const classifier = require('./classifier')
const visionEnricher = require('./visionEnricher')
const embeddings = require('./embeddings')
const graphUpsert = require('./graphUpsert')

const DEFAULT_BATCH = 100

/**
 * Run the full pipeline once. Returns a summary suitable for cron-fork
 * deliverable narration.
 */
async function runPipeline(opts = {}) {
  const limit = opts.limit || DEFAULT_BATCH
  const startedAt = new Date()
  const summary = {
    started_at: startedAt.toISOString(),
    stages: {},
  }

  // Stage 1: classify pending events.
  let actions = []
  try {
    const r = await classifier.classifyPending(limit)
    actions = r.actions
    summary.stages.classify = {
      events_classified: r.classifiedCount,
      actions_emitted: r.actions.length,
    }
  } catch (err) {
    logger.error('gkg.pipeline: stage classify failed', { err: err.message })
    summary.stages.classify = { error: err.message }
    // continue to drain remaining stages on existing classified rows
  }

  // For stages 2-4, we need to process actions whose underlying gkg_events
  // row is past the prior stage. Since we just classified some, those are
  // immediately available via the in-memory `actions` list. ALSO pick up
  // any actions classified in a prior sweep that didn't make it through
  // (e.g. rate-limited at vision step).
  if (actions.length < limit) {
    const more = await _hydrateBackfillActions(limit - actions.length)
    actions = actions.concat(more)
  }

  // Stage 2: vision enrich.
  let enriched = actions
  if (actions.length) {
    try {
      enriched = await visionEnricher.enrichActionsBatch(actions)
      const purposeCount = enriched.filter(a => a.purpose).length
      const skippedCount = enriched.filter(a => a.vision_skipped_reason).length
      const deferredCount = enriched.filter(a => a._enrich_deferred).length
      summary.stages.enrich = {
        actions_in: actions.length,
        purposes_attached: purposeCount,
        vision_skipped: skippedCount,
        deferred: deferredCount,
      }
    } catch (err) {
      logger.error('gkg.pipeline: stage enrich failed', { err: err.message })
      summary.stages.enrich = { error: err.message }
    }
  } else {
    summary.stages.enrich = { actions_in: 0 }
  }

  // Stage 3: embed.
  // Operate only on rows whose embedded_at is still NULL (i.e. haven't
  // already been embedded by an earlier sweep).
  const toEmbed = enriched.filter(a => !a._enrich_deferred)
  let embedded = []
  if (toEmbed.length) {
    try {
      embedded = await embeddings.embedActionsBatch(toEmbed)
      summary.stages.embed = {
        actions_in: toEmbed.length,
        with_vector: embedded.filter(a => a.embedding).length,
      }
    } catch (err) {
      logger.error('gkg.pipeline: stage embed failed', { err: err.message })
      summary.stages.embed = { error: err.message }
    }
  } else {
    summary.stages.embed = { actions_in: 0 }
  }

  // Stage 4: graph upsert.
  if (embedded.length) {
    try {
      const r = await graphUpsert.upsertActionsBatch(embedded)
      summary.stages.upsert = {
        actions_in: embedded.length,
        upserted: r.upserted,
        failed: r.failed,
        reason: r.reason,
        error: r.error,
        code: r.code,
      }
    } catch (err) {
      logger.error('gkg.pipeline: stage upsert failed', { err: err.message })
      summary.stages.upsert = { error: err.message }
    }
  } else {
    summary.stages.upsert = { actions_in: 0 }
  }

  // Drain non-action events (foreground_change, allowlist_skip, screenshot,
  // pause_state, input) that won't otherwise progress past stage 4.
  try {
    const drained = await graphUpsert.drainNonActionEvents()
    summary.stages.drain_non_actions = drained
  } catch (err) {
    logger.warn('gkg.pipeline: drain non-actions failed', { err: err.message })
    summary.stages.drain_non_actions = { error: err.message }
  }

  // Backlog snapshot.
  const backlog = await _backlogCounts()
  summary.backlog = backlog
  summary.finished_at = new Date().toISOString()
  summary.duration_ms = Date.now() - startedAt.getTime()

  logger.info('gkg.pipeline: run complete', summary)
  return summary
}

/**
 * Hydrate actions from rows that were classified in a prior sweep but
 * never made it past stage 2/3 (e.g. SIGTERM, rate-limit). Re-decrypts
 * payloads and rebuilds the in-memory action records. Used by runPipeline
 * to top up the batch when the freshly-classified set is small.
 */
async function _hydrateBackfillActions(limit) {
  const rows = await db`
    SELECT id, session_id, sequence_no, timestamp_iso, event_type,
           payload_ciphertext, payload_iv, payload_auth_tag,
           process_name, app_bucket
    FROM gkg_events
    WHERE classified_at IS NOT NULL
      AND graph_upserted_at IS NULL
      AND event_type = 'click_with_uia'
    ORDER BY timestamp_iso ASC
    LIMIT ${limit}
  `
  if (!rows.length) return []
  const { actions } = await classifier._classifyBatch(rows)
  return actions
}

async function _backlogCounts() {
  const [r] = await db`
    SELECT
      COUNT(*) FILTER (WHERE classified_at IS NULL)::int           AS pending_classify,
      COUNT(*) FILTER (WHERE classified_at IS NOT NULL AND enriched_at IS NULL AND event_type = 'click_with_uia')::int AS pending_enrich,
      COUNT(*) FILTER (WHERE enriched_at IS NOT NULL AND embedded_at IS NULL)::int  AS pending_embed,
      COUNT(*) FILTER (WHERE embedded_at IS NOT NULL AND graph_upserted_at IS NULL)::int AS pending_upsert,
      COUNT(*) FILTER (WHERE graph_upserted_at IS NOT NULL)::int   AS done,
      COUNT(*)::int                                                AS total
    FROM gkg_events
  `
  return r
}

/**
 * Single-stage runner for diagnostics. `name` is one of
 * 'classify' | 'enrich' | 'embed' | 'upsert' | 'drain'.
 */
async function runStage(name, opts = {}) {
  switch (name) {
    case 'classify': return classifier.classifyPending(opts.limit || DEFAULT_BATCH)
    case 'enrich': {
      const more = await _hydrateBackfillActions(opts.limit || DEFAULT_BATCH)
      return visionEnricher.enrichActionsBatch(more)
    }
    case 'embed': {
      const more = await _hydrateBackfillActions(opts.limit || DEFAULT_BATCH)
      return embeddings.embedActionsBatch(more)
    }
    case 'upsert': {
      const more = await _hydrateBackfillActions(opts.limit || DEFAULT_BATCH)
      return graphUpsert.upsertActionsBatch(more)
    }
    case 'drain':
      return graphUpsert.drainNonActionEvents()
    default:
      throw new Error(`unknown stage: ${name}`)
  }
}

module.exports = {
  runPipeline,
  runStage,
  _backlogCounts,
  _hydrateBackfillActions,
  DEFAULT_BATCH,
}

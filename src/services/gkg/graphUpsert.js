'use strict'

/**
 * GKG Phase 2 - Neo4j Graph Upsert.
 *
 * Idempotent MERGE writer. Takes embedded UIAction records (with optional
 * purpose + embedding) and lands the corresponding :Handler + :UIAction +
 * :LEADS_TO + :RUNS_HANDLER mutations.
 *
 * Schema reused from Phase 0 bootstrap (~/ecodiaos/docs/gkg-spec-v0.1.md
 * §5). Phase 0 already created 15 :Handler + 32 :UIAction + 29 :LEADS_TO
 * + 9 :RUNS_HANDLER nodes/edges from hand-authored recipes; Phase 2
 * extends the same labels/relationship types so a single Cypher query
 * can read across both bootstrapped + capture-derived data.
 *
 * Per brief, RUNS_HANDLER goes Handler -> UIAction (the simplification
 * over spec §5.2's UIState->UIState shape; the spec's coarse-grained
 * Handler-to-Handler edges from Phase 0 remain valid alongside).
 *
 * Idempotency: every write uses MERGE keyed on stable identifiers
 * (Handler.name, UIAction.action_id == gkg_events.id). Re-running a
 * batch is a no-op. Embeddings + purpose are CONDITIONALLY set so a
 * later sweep that does have a purpose (e.g. the daemon backfilled the
 * frame) can fill it in without clobbering an earlier wrote.
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md §5, §6 Phase 0.
 * Authored 7 May 2026 fork_mov80as1_c968cc for GKG Phase 2.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const { runWrite, getDriver } = require('../../config/neo4j')

const HANDLER_SOURCE_FILE_DEFAULT = 'gkg-phase-2-classifier'
const HANDLER_KIND = 'capture-classified'
const HANDLER_VALIDATION_STATUS = 'capture-derived'

/**
 * Cypher upsert for one batch. Drives a single transaction with UNWIND
 * so N actions land in one round-trip.
 */
const UPSERT_CYPHER = `
UNWIND $actions AS a
MERGE (h:Handler { name: a.handler_name })
  ON CREATE SET
    h.source_file = coalesce(a.handler_source_file, $defaultSourceFile),
    h.validation_status = $validationStatus,
    h.kind = $kind,
    h.origin = 'gkg-phase-2-classifier',
    h.bootstrapped_at = datetime()
  ON MATCH SET
    h.last_observed_at = datetime()
MERGE (u:UIAction { action_id: a.action_id })
  ON CREATE SET
    u.type = 'click',
    u.session_id = a.session_id,
    u.sequence_no = a.sequence_no,
    u.captured_at = datetime(a.timestamp_iso),
    u.captured_via = 'capture-daemon',
    u.staleness = 'fresh',
    u.confidence = 0.6,
    u.created_at = datetime()
  ON MATCH SET
    u.last_seen_at = datetime()
SET
  u.anchor_uia_name = a.anchor_name,
  u.anchor_uia_role = a.anchor_role,
  u.anchor_automation_id = a.anchor_automation_id,
  u.anchor_neighbors = a.anchor_neighbors,
  u.pixel_x = a.pixel_x,
  u.pixel_y = a.pixel_y,
  u.button = a.button,
  u.window_title = a.window_title,
  u.process_name = a.process_name,
  u.app_bucket = a.app_bucket
FOREACH (_ IN CASE WHEN a.purpose IS NOT NULL THEN [1] ELSE [] END |
  SET u.purpose = a.purpose,
      u.reasoning = a.purpose,
      u.reasoning_model = a.reasoning_model,
      u.reasoning_confidence = a.reasoning_confidence
)
FOREACH (_ IN CASE WHEN a.vision_skipped_reason IS NOT NULL AND a.purpose IS NULL THEN [1] ELSE [] END |
  SET u.vision_skipped_reason = a.vision_skipped_reason
)
FOREACH (_ IN CASE WHEN a.embedding IS NOT NULL THEN [1] ELSE [] END |
  SET u.embedding = a.embedding,
      u.embedding_model = $embeddingModel,
      u.embedding_text = a.embedding_text
)
MERGE (h)-[r1:RUNS_HANDLER]->(u)
  ON CREATE SET r1.first_seen_at = datetime(), r1.observed_count = 1
  ON MATCH SET r1.observed_count = coalesce(r1.observed_count, 0) + 1, r1.last_seen_at = datetime()
WITH a, u
MATCH (prev:UIAction { action_id: a.prev_action_id })
WHERE a.prev_action_id IS NOT NULL
MERGE (prev)-[r2:LEADS_TO]->(u)
  ON CREATE SET r2.first_seen_at = datetime(), r2.observed_count = 1, r2.via_action_id = a.action_id
  ON MATCH SET r2.observed_count = coalesce(r2.observed_count, 0) + 1, r2.last_seen_at = datetime()
RETURN count(u) AS upserted
`

function _toNeo4jShape(action) {
  const a = action.anchor || {}
  return {
    action_id: action.action_id,
    session_id: action.session_id,
    sequence_no: action.sequence_no,
    timestamp_iso: action.timestamp_iso,
    handler_name: action.handler_name,
    handler_source_file: action.handler_source_hint || HANDLER_SOURCE_FILE_DEFAULT,
    anchor_name: a.name || '',
    anchor_role: a.role || '',
    anchor_automation_id: a.automation_id || '',
    anchor_neighbors: Array.isArray(a.neighbors) ? a.neighbors.slice(0, 5) : [],
    pixel_x: a.pixel_x,
    pixel_y: a.pixel_y,
    button: a.button || 'left',
    window_title: action.window_title || '',
    process_name: action.process_name || '',
    app_bucket: action.app_bucket || '',
    prev_action_id: action.prev_action_id || null,
    purpose: action.purpose || null,
    reasoning_model: action.model || null,
    reasoning_confidence: action.purpose ? 0.7 : null,
    vision_skipped_reason: action.vision_skipped_reason || null,
    embedding: action.embedding || null,
    embedding_text: action.embedding_text || null,
  }
}

/**
 * Upsert a batch of actions to Neo4j. Marks graph_upserted_at +
 * processed_at on each event. Returns { upserted, failed }.
 */
async function upsertActionsBatch(actions, opts = {}) {
  if (!actions || !actions.length) return { upserted: 0, failed: 0 }

  const driver = getDriver()
  if (!driver) {
    logger.warn('gkg.graphUpsert: NEO4J_URI not configured, skipping graph upsert')
    return { upserted: 0, failed: actions.length, reason: 'neo4j_not_configured' }
  }

  const params = {
    actions: actions.map(_toNeo4jShape),
    defaultSourceFile: HANDLER_SOURCE_FILE_DEFAULT,
    validationStatus: HANDLER_VALIDATION_STATUS,
    kind: HANDLER_KIND,
    embeddingModel: opts.embeddingModel || 'text-embedding-3-small',
  }

  let upserted = 0
  try {
    const records = await runWrite(UPSERT_CYPHER, params)
    if (records && records.length) {
      const v = records[0].get('upserted')
      upserted = typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v) || 0
    }
  } catch (err) {
    logger.error('gkg.graphUpsert: cypher failed', { err: err.message })
    return { upserted: 0, failed: actions.length, reason: 'cypher_failed', error: err.message }
  }

  // Mark graph_upserted_at + processed_at for every event.
  const eventIds = actions.map(a => a.event_id).filter(Boolean)
  if (eventIds.length) {
    try {
      await db`
        UPDATE gkg_events
        SET graph_upserted_at = NOW(), processed_at = NOW()
        WHERE id = ANY(${eventIds}::uuid[])
          AND graph_upserted_at IS NULL
      `
    } catch (err) {
      logger.warn('gkg.graphUpsert: stage marker update failed', { err: err.message })
    }
  }

  logger.info('gkg.graphUpsert: batch upserted', {
    requested: actions.length,
    upserted,
  })

  return { upserted, failed: actions.length - upserted }
}

/**
 * Mark non-action events (foreground_change / allowlist_skip / etc) as
 * graph_upserted_at + processed_at without writing any graph - they were
 * classified for queue-drain only.
 */
async function drainNonActionEvents() {
  const result = await db`
    UPDATE gkg_events
    SET graph_upserted_at = NOW(), processed_at = NOW()
    WHERE classified_at IS NOT NULL
      AND graph_upserted_at IS NULL
      AND event_type NOT IN ('click_with_uia')
    RETURNING id
  `
  return { drained: result.length }
}

module.exports = {
  upsertActionsBatch,
  drainNonActionEvents,
  _toNeo4jShape,
  UPSERT_CYPHER,
}

'use strict'

/**
 * GKG Phase 2 - Classifier.
 *
 * Reads gkg_events rows where classified_at IS NULL and emits in-memory
 * UIAction + Handler records ready for the next pipeline stage. The
 * classifier does NOT write Neo4j directly (graphUpsert.js does that); it
 * only resolves the semantic identity of each event so downstream stages
 * can enrich/embed in batches.
 *
 * What gets classified:
 *   click_with_uia  -> one :UIAction record per row.
 *   foreground_change -> contributes Handler context (process_name + URL/title).
 *                        Does not create a UIAction but its row IS marked
 *                        classified_at so the pipeline doesn't keep visiting it.
 *   screenshot      -> not a UIAction by itself; provides frame_path that
 *                        downstream vision enrichment can fetch (when the
 *                        frame storage path is wired). Marked classified.
 *   allowlist_skip  -> not in graph. Marked classified to drain the queue.
 *   pause_state     -> not in graph. Marked classified.
 *   input           -> aggregated alongside the next click_with_uia in the
 *                        same session; non-actionable on its own. Marked
 *                        classified.
 *
 * Handler resolution:
 *   - Reuses ingestService._appBucket(processName, payload) for stable
 *     per-app buckets (matches Phase 0 :Handler.name where applicable).
 *   - For browser apps without a known bucket, derives `<chrome>:<host>` so
 *     the graph still has a stable handler identity (e.g. `chrome:apple.com`).
 *   - Falls back to process_name when nothing else fits.
 *
 * UIAction sequencing:
 *   Within a single session_id, consecutive click_with_uia events that share
 *   the same handler get a `prev_action_id` pointer so graphUpsert can
 *   create :LEADS_TO / :NEXT edges. A foreground_change to a different
 *   handler resets the chain (the next click is a fresh chain head).
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md §3.2, §5.
 * Authored 7 May 2026 fork_mov80as1_c968cc for GKG Phase 2.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const { decrypt } = require('./payloadCrypto')
const { _appBucket } = require('./ingestService')

const DEFAULT_BATCH_SIZE = 200

function _handlerNameFor(processName, payload) {
  const bucket = _appBucket(processName, payload)
  if (bucket) return bucket
  const url = (payload && (payload.chrome_url || payload.url)) || ''
  const hostMatch = url.match(/^https?:\/\/([^/]+)/i)
  if (hostMatch) {
    return `chrome:${hostMatch[1].toLowerCase()}`
  }
  if (processName) return `app:${String(processName).toLowerCase()}`
  return 'unknown'
}

function _handlerSourceHint(handlerName) {
  // Phase 0 bootstrapped concrete handler files for known buckets; for
  // dynamically-classified handlers we record where the name was derived
  // so graphUpsert can attribute origin.
  if (handlerName && handlerName.startsWith('chrome:')) {
    return 'gkg-phase-2-classifier:chrome-host'
  }
  if (handlerName && handlerName.startsWith('app:')) {
    return 'gkg-phase-2-classifier:process-name'
  }
  return 'gkg-phase-2-classifier:app-bucket'
}

function _decodePayload(row) {
  try {
    const pt = JSON.parse(
      // decrypt is async; we wrap in caller. Placeholder for shape.
      ''
    )
    return pt
  } catch {
    return {}
  }
}

/**
 * Classify a batch of events. Pure - does NOT mutate gkg_events. Returns
 * { actions, eventIds, sessionsTouched } where:
 *   actions[] - one record per click_with_uia event:
 *     { event_id, action_id, session_id, sequence_no, timestamp_iso,
 *       handler_name, handler_source_hint, app_bucket, process_name,
 *       window_title, anchor: { name, role, automation_id, neighbors,
 *         pixel_x, pixel_y, button }, prev_action_id, frame_path }
 *   eventIds[] - all event ids in the batch (for stage marking).
 *   sessionsTouched[] - distinct session_ids in the batch.
 */
async function _classifyBatch(rows) {
  // Decrypt payloads. Each row has its own GCM IV/auth_tag.
  const decoded = []
  for (const r of rows) {
    let payload = {}
    try {
      const pt = await decrypt({
        ciphertext: r.payload_ciphertext,
        iv: r.payload_iv,
        authTag: r.payload_auth_tag,
      })
      payload = JSON.parse(pt)
    } catch (err) {
      logger.warn('gkg.classifier: decrypt failed for event', {
        event_id: r.id, err: err.message,
      })
    }
    decoded.push({ row: r, payload })
  }

  // Build per-session state so we can chain consecutive clicks.
  const sessionState = new Map() // session_id -> { lastHandler, lastActionId }
  const actions = []
  const eventIds = []
  const sessionsTouched = new Set()

  // Sort by (session_id, sequence_no) so chains form correctly.
  decoded.sort((a, b) => {
    if (a.row.session_id < b.row.session_id) return -1
    if (a.row.session_id > b.row.session_id) return 1
    return Number(a.row.sequence_no) - Number(b.row.sequence_no)
  })

  for (const { row, payload } of decoded) {
    eventIds.push(row.id)
    sessionsTouched.add(row.session_id)

    const evType = row.event_type
    if (evType === 'foreground_change') {
      // Update session state but don't emit an action.
      const handlerName = _handlerNameFor(row.process_name || payload.process_name, payload)
      const st = sessionState.get(row.session_id) || {}
      // Chain reset if handler changed.
      if (st.lastHandler !== handlerName) {
        st.lastActionId = null
      }
      st.lastHandler = handlerName
      sessionState.set(row.session_id, st)
      continue
    }

    if (evType !== 'click_with_uia') {
      // input / screenshot / allowlist_skip / pause_state - mark classified
      // (eventIds already pushed) and skip.
      continue
    }

    const handlerName = _handlerNameFor(row.process_name || payload.process_name, payload)
    const handlerSourceHint = _handlerSourceHint(handlerName)
    const st = sessionState.get(row.session_id) || {}
    if (st.lastHandler !== handlerName) {
      st.lastActionId = null
      st.lastHandler = handlerName
    }

    const action = {
      event_id: row.id,
      action_id: row.id, // 1:1 with the gkg_events row UUID
      session_id: row.session_id,
      sequence_no: Number(row.sequence_no),
      timestamp_iso: row.timestamp_iso,
      handler_name: handlerName,
      handler_source_hint: handlerSourceHint,
      app_bucket: row.app_bucket || null,
      process_name: row.process_name || payload.process_name || null,
      window_title: payload.window_title || null,
      anchor: {
        name: payload.uia_name || '',
        role: payload.uia_role || '',
        automation_id: payload.uia_automation_id || '',
        neighbors: Array.isArray(payload.uia_neighbors) ? payload.uia_neighbors : [],
        pixel_x: Number.isFinite(payload.pixel_x) ? payload.pixel_x : null,
        pixel_y: Number.isFinite(payload.pixel_y) ? payload.pixel_y : null,
        button: payload.button || 'left',
      },
      prev_action_id: st.lastActionId || null,
      frame_path: payload.frame_path || payload.path || null,
    }
    actions.push(action)

    st.lastActionId = action.action_id
    sessionState.set(row.session_id, st)
  }

  return { actions, eventIds, sessionsTouched: Array.from(sessionsTouched) }
}

/**
 * Read up to `limit` events with classified_at IS NULL, classify them,
 * write classified_at = now() for every event in the batch.
 *
 * Returns { actions, eventCount, classifiedCount }.
 */
async function classifyPending(limit = DEFAULT_BATCH_SIZE) {
  const rows = await db`
    SELECT id, session_id, sequence_no, timestamp_iso, event_type,
           payload_ciphertext, payload_iv, payload_auth_tag,
           process_name, app_bucket
    FROM gkg_events
    WHERE classified_at IS NULL
    ORDER BY session_id, sequence_no
    LIMIT ${limit}
  `
  if (!rows.length) {
    return { actions: [], eventCount: 0, classifiedCount: 0 }
  }

  const { actions, eventIds } = await _classifyBatch(rows)

  // Mark every visited row classified, even non-action types - they're
  // drained from the queue.
  if (eventIds.length) {
    await db`
      UPDATE gkg_events
      SET classified_at = NOW()
      WHERE id = ANY(${eventIds}::uuid[])
        AND classified_at IS NULL
    `
  }

  logger.info('gkg.classifier: batch classified', {
    eventCount: rows.length,
    actionCount: actions.length,
  })

  return {
    actions,
    eventCount: rows.length,
    classifiedCount: eventIds.length,
  }
}

module.exports = {
  classifyPending,
  _classifyBatch,
  _handlerNameFor,
  _handlerSourceHint,
  DEFAULT_BATCH_SIZE,
}

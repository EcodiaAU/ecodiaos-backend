'use strict'

/**
 * GKG (GUI Knowledge Graph) ingest route - POST /api/gkg/ingest.
 *
 * Architecture per spec ~/ecodiaos/docs/gkg-spec-v0.1.md §3.2:
 *
 *   Capture daemon on Corazon (~/ecodiaos/laptop-agent/daemons/gkg-capture.ahk
 *   mirrored to D:\.code\eos-laptop-agent\daemons\gkg-capture.ahk) buffers
 *   events as NDJSON and POSTs every ~30 events / 5s to this endpoint.
 *
 *   Each request is HMAC-SHA256-signed with kv_store.gkg.daemon_hmac_secret
 *   (validateGkgSignature middleware). The route then parses NDJSON, encrypts
 *   each event payload with AES-256-GCM (kv_store.gkg.tate_payload_key), and
 *   inserts into gkg_events (idempotent on session_id+sequence_no).
 *
 * Phase 1 cut: emit raw rows. NO graph mutation here. Phase 2 cron walks
 * processed_at IS NULL and emits Neo4j :UIAction / :UIState / :LEADS_TO /
 * :RUNS_HANDLER as a separate concern.
 *
 * Status_board: 04599f46-b09f-4958-8129-01bf8e693109
 * Authored 7 May 2026 fork_mov3r45p_73555d.
 */

const express = require('express')
const router = express.Router()
const validateGkgSignature = require('../middleware/validateGkgSignature')
const ingestService = require('../services/gkg/ingestService')
const logger = require('../config/logger')

// Raw body parser MUST run before HMAC validator so the bytes signed are the
// bytes verified. NDJSON typical chunk = ~1MB; cap at 4MB to handle bursty
// 30-event flushes plus headroom.
router.use(express.raw({ type: '*/*', limit: '4mb' }))

router.post('/ingest', validateGkgSignature, async (req, res) => {
  try {
    const { events, errors: parseErrors } = ingestService.parseNdjson(req.body)
    if (!events.length && parseErrors.length) {
      return res.status(400).json({ ok: false, error: 'no_valid_events', parse_errors: parseErrors })
    }

    const { accepted, rejected } = await ingestService.persistEvents(events)

    if (parseErrors.length) {
      logger.warn('gkg.ingest: NDJSON parse errors', { count: parseErrors.length })
    }

    return res.status(200).json({
      ok: true,
      accepted,
      rejected,
      parse_errors: parseErrors,
    })
  } catch (err) {
    logger.error('gkg.ingest: handler error', { err: err.message, stack: err.stack })
    return res.status(500).json({ ok: false, error: 'ingest_failed' })
  }
})

// Health probe for the daemon to verify reachability + HMAC config without
// posting events. Returns the count of events ingested in the last hour.
router.get('/health', async (req, res) => {
  try {
    const db = require('../config/db')
    const rows = await db`
      SELECT COUNT(*)::int AS n
      FROM gkg_events
      WHERE ingested_at > now() - interval '1 hour'
    `
    return res.json({
      ok: true,
      events_last_hour: rows[0]?.n || 0,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    logger.error('gkg.health: failed', { err: err.message })
    return res.status(500).json({ ok: false })
  }
})

module.exports = router

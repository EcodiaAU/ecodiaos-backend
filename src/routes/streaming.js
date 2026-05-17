'use strict'

/**
 * /api/stream/* - SSE streaming substrate (Phase 2 Lane 06, 2026-05-15).
 *
 * STUB: Channel hub that complements the MCP surface with a long-lived SSE
 * channel per subscriber. Channel registry planned at backend/streaming/channels.json.
 *
 * Full implementation will expose:
 *   GET /api/stream/:channelId   - SSE subscription (Accept: text/event-stream)
 *   POST /api/stream/:channelId  - publish event to subscribers
 *   GET /api/stream              - list active channels
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({
    channels: [],
    _stub: true,
    _note: 'Streaming substrate stub - not yet implemented',
  })
})

router.all('*', express.json({ limit: '1mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    endpoint: '/api/stream',
    note: 'SSE streaming stub - implementation pending',
  })
})

module.exports = router

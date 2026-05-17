'use strict'

/**
 * Streaming substrate stub (Phase 2 Lane 06, 2026-05-15).
 *
 * Stub implementation: returns 501 on all streaming endpoints.
 * Full implementation on VPS at ~/ecodiaos/src/routes/streaming.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour: SSE channel hub complementing the MCP connector surface.
 * Channel registry at backend/streaming/channels.json.
 * Bearer auth enforced via ecodiaFullAuth middleware.
 *
 * Endpoints (when implemented):
 *   GET  /api/stream/:channel   - SSE event stream subscription
 *   POST /api/stream/:channel   - publish event to channel
 */

const express = require('express')
const router = express.Router()
const logger = require('../config/logger')

router.use(express.json({ limit: '256kb' }))

const STUB_MSG = 'Streaming substrate stub: full SSE implementation pending VPS sync.'

router.get('/:channel', (req, res) => {
  logger.warn(`[streaming] stub: GET /${req.params.channel}`)
  res.status(501).json({ error: 'not_implemented', message: STUB_MSG })
})

router.post('/:channel', (req, res) => {
  logger.warn(`[streaming] stub: POST /${req.params.channel}`)
  res.status(501).json({ error: 'not_implemented', message: STUB_MSG })
})

module.exports = router

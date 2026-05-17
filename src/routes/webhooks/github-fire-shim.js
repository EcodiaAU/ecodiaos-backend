'use strict'

/**
 * GitHub webhook -> Routine fire-shim (Lane D, 2026-05-15).
 *
 * STUB: Full implementation will verify x-hub-signature-256 HMAC,
 * dedupe via kv_store, and forward the parsed payload to the Routine.
 *
 * See: backend/patterns/webhook-fire-shim-architecture-2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.all('*', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    route: '/api/webhooks/github-fire',
    note: 'Lane D github fire-shim stub - implementation pending',
  })
})

module.exports = router

'use strict'

/**
 * Vercel webhook -> Routine fire-shim (Lane D, 2026-05-15).
 *
 * STUB: Route registered at /api/webhooks/vercel-fire (parallel to the
 * existing /api/webhooks/vercel handler). Full implementation will verify
 * Vercel's x-vercel-signature, dedupe via kv_store, and forward to Routine.
 *
 * See: backend/patterns/webhook-fire-shim-architecture-2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.all('*', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    route: '/api/webhooks/vercel-fire',
    note: 'Lane D vercel fire-shim stub - implementation pending',
  })
})

module.exports = router

'use strict'

/**
 * Stripe webhook -> Routine fire-shim (Lane D, 2026-05-15).
 *
 * STUB: Route registered at /api/webhooks/stripe-fire (parallel to the
 * existing /api/webhooks/stripe handler). Full implementation will verify
 * Stripe-Signature HMAC, dedupe via kv_store, and forward to the Routine.
 *
 * See: backend/patterns/webhook-fire-shim-architecture-2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.all('*', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    route: '/api/webhooks/stripe-fire',
    note: 'Lane D stripe fire-shim stub - implementation pending',
  })
})

module.exports = router

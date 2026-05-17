'use strict'

/**
 * Apple ASN webhook -> Routine fire-shim (Lane D, 2026-05-15).
 *
 * STUB: Full implementation will verify Apple's JWT-signed notification,
 * dedupe via kv_store, and forward to the Routine.
 *
 * See: backend/patterns/webhook-fire-shim-architecture-2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.all('*', express.json({ limit: '2mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    route: '/api/webhooks/apple-asn',
    note: 'Lane D apple-asn fire-shim stub - implementation pending',
  })
})

module.exports = router

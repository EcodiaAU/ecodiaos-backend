'use strict'

/**
 * Apple App Store Server Notifications -> fire-shim stub (Lane D, Phase 2).
 *
 * Stub implementation: accepts inbound Apple ASN JWS payloads and logs them.
 * Full implementation on VPS at ~/ecodiaos/src/routes/webhooks/apple-asn-fire-shim.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour (Phase 3): verify Apple-signed JWS (signed_payload), dedupe
 * via kv_store, forward parsed subscription/refund event to the corresponding
 * Routine /fire endpoint.
 */

const express = require('express')
const router = express.Router()
const logger = require('../../config/logger')

router.use(express.json({ limit: '1mb' }))

router.post('/', (req, res) => {
  logger.warn('[apple-asn-fire-shim] stub: received ASN event, full implementation pending VPS sync')
  res.status(200).json({ ok: true, stub: true })
})

module.exports = router

'use strict'

/**
 * Stripe webhook -> fire-shim stub (Lane D, Phase 2).
 *
 * Stub implementation: accepts inbound Stripe webhook events and logs them.
 * Full implementation on VPS at ~/ecodiaos/src/routes/webhooks/stripe-fire-shim.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour (Phase 3): verify Stripe-Signature header, dedupe via
 * kv_store, forward parsed event to the corresponding Routine /fire endpoint.
 * Runs alongside (not replacing) /api/webhooks/stripe until Phase 3 cutover.
 */

const express = require('express')
const router = express.Router()
const logger = require('../../config/logger')

router.use(express.raw({ type: 'application/json', limit: '1mb' }))

router.post('/', (req, res) => {
  logger.warn('[stripe-fire-shim] stub: received webhook, full implementation pending VPS sync')
  res.status(202).json({ ok: true, stub: true })
})

module.exports = router

'use strict'

/**
 * Resend webhook -> fire-shim stub (Lane D, Phase 2).
 *
 * Stub implementation: accepts inbound Resend webhook events and logs them.
 * Full implementation on VPS at ~/ecodiaos/src/routes/webhooks/resend-fire-shim.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour (Phase 3): verify Resend SVIX signature, dedupe via
 * kv_store, forward parsed payload to the corresponding Routine /fire
 * endpoint via kv_store.cowork.routine_registry.
 */

const express = require('express')
const router = express.Router()
const logger = require('../../config/logger')

router.use(express.raw({ type: 'application/json', limit: '1mb' }))

router.post('/', (req, res) => {
  logger.warn('[resend-fire-shim] stub: received webhook, full implementation pending VPS sync')
  res.status(202).json({ ok: true, stub: true })
})

module.exports = router

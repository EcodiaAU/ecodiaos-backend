'use strict'

/**
 * Resend webhook -> Routine fire-shim (Lane D, 2026-05-15).
 *
 * STUB: Route registered but not yet implemented. The full implementation
 * will verify Resend's svix-signature, dedupe via kv_store, and forward to
 * the relevant Routine's /fire endpoint.
 *
 * See: backend/patterns/webhook-fire-shim-architecture-2026-05-15.md
 * Track: status_board (next_action_by='ecodiaos')
 */

const express = require('express')

const router = express.Router()

router.all('*', express.json({ limit: '2mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    route: '/api/webhooks/resend',
    note: 'Lane D resend fire-shim stub - implementation pending',
  })
})

module.exports = router

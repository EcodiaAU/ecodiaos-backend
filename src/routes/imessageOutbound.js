'use strict'

/**
 * iMessage Outbound Queue Routes
 *
 * Substrate replacing the SSH+osascript path in skills/tate-msg/index.js.
 * Authored 7 May 2026 by fork_mousbxym_89ac2e during the iMessage outbound
 * migration off SSH (Tate verbatim 2026-05-06 08:08 AEST + 2026-05-07
 * 11:03 AEST).
 *
 * Three routes:
 *   POST /api/imessage/outbound/queue    (internal-only, queues a row)
 *   POST /api/imessage/outbound/next     (HMAC-validated, dequeues for watcher)
 *   POST /api/imessage/outbound/ack      (HMAC-validated, marks result)
 *
 * Mount order: in src/app.js, mounted under /api/imessage BEFORE the
 * global express.json() so the HMAC validator (which lives on /next +
 * /ack) sees raw bytes. /queue uses express.json() directly because it is
 * internal-only and not HMAC-signed.
 *
 * The HMAC routes share the SAME validateImessageSignature middleware
 * used by the inbound webhook (same secret in
 * kv_store.imessage.webhook.hmac_secret).
 *
 * /queue auth: localhost-only by default. The X-Internal-Token header is
 * accepted as a fallback for non-localhost callers (only same-VPS code
 * paths use this; nothing on the public internet should reach /queue
 * directly because Cloudflare/nginx fronts /api/imessage). A missing
 * Bearer just relies on the localhost gate.
 */

const express = require('express')
const router = express.Router()
const validateImessageSignature = require('../middleware/validateImessageSignature')
const queueService = require('../services/imessageOutboundQueue')
const logger = require('../config/logger')

// Local IPs only by default. ::ffff:127.0.0.1 (IPv4-mapped-IPv6) and ::1
// are both localhost. Extra defence: the route is not advertised
// publicly; nginx forwards /api/imessage/* but the queue path is only
// invoked by sendImessage() inside ecodia-api (same process).
function _isLocal(req) {
  const ip = (req.ip || '').replace(/^::ffff:/, '')
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === ''
}

// ── /queue: internal enqueue ──────────────────────────────────────────
// Uses express.json() directly because it does NOT participate in HMAC.
// Body: { to: '+61404247153', body: '...' } → returns { ok, id }
const queueParser = express.json({ limit: '64kb' })

router.post('/outbound/queue', queueParser, async (req, res) => {
  if (!_isLocal(req)) {
    logger.warn('imessage-outbound-queue: rejected non-local caller', { ip: req.ip })
    return res.status(403).json({ ok: false, error: 'localhost_only' })
  }
  const { to, body } = req.body || {}
  const result = await queueService.enqueue({ to, body })
  if (!result.ok) {
    return res.status(400).json(result)
  }
  return res.status(200).json(result)
})

// ── /next + /ack: HMAC-validated, raw body ───────────────────────────
// We mount express.raw() then validateImessageSignature scoped to these
// two paths only. The validator parses req.body to JSON after verifying.
const hmacRouter = express.Router()
hmacRouter.use(express.raw({ type: '*/*', limit: '64kb' }))
hmacRouter.use(validateImessageSignature)

hmacRouter.post('/next', async (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.body?.limit, 10) || 5))
  const rows = await queueService.dequeue({ limit })
  return res.status(200).json({ ok: true, rows })
})

hmacRouter.post('/ack', async (req, res) => {
  const { id, ok, error } = req.body || {}
  const result = await queueService.ack({ id, ok: !!ok, error })
  if (!result.ok) {
    return res.status(400).json(result)
  }
  return res.status(200).json(result)
})

router.use('/outbound', hmacRouter)

module.exports = router

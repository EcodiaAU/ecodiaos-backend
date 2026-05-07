'use strict'

/**
 * Push token registration route.
 *
 * Authored 2026-05-07 by fork_mov3s5fq_a7009b during EOS mobile push
 * wiring (status_board P2 row 42d6d656).
 *
 * POST /api/push/register
 *   body: { device_token, user_id, platform, bundle_id }
 *   → 200 { ok: true, id }   on upsert success
 *   → 400 { ok: false, error: '...' } on missing/invalid fields
 *
 * Idempotent: ON CONFLICT (device_token) DO UPDATE SET last_seen_at = now(),
 * revoked_at = NULL, user_id/platform/bundle_id refreshed (in case the user
 * reassigns their device).
 */

const express = require('express')
const router = express.Router()
const db = require('../config/db')
const logger = require('../config/logger')

router.use(express.json({ limit: '8kb' }))

const VALID_PLATFORMS = new Set(['ios', 'android', 'web'])

router.post('/register', async (req, res) => {
  const { device_token, user_id, platform, bundle_id } = req.body || {}
  if (!device_token || typeof device_token !== 'string' || device_token.length < 16) {
    return res.status(400).json({ ok: false, error: 'invalid_device_token' })
  }
  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ ok: false, error: 'invalid_user_id' })
  }
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return res.status(400).json({ ok: false, error: 'invalid_platform' })
  }
  const bundleStr = bundle_id ? String(bundle_id) : null

  try {
    const rows = await db`
      INSERT INTO push_tokens (device_token, user_id, platform, bundle_id, registered_at, last_seen_at)
      VALUES (${device_token}, ${user_id}, ${platform}, ${bundleStr}, now(), now())
      ON CONFLICT (device_token) DO UPDATE
        SET last_seen_at = now(),
            revoked_at = NULL,
            user_id = EXCLUDED.user_id,
            platform = EXCLUDED.platform,
            bundle_id = EXCLUDED.bundle_id
      RETURNING id
    `
    const id = rows[0]?.id
    logger.info('push: token registered', {
      user_id,
      platform,
      bundle_id: bundleStr,
      token_tail: device_token.slice(-8),
    })
    return res.status(200).json({ ok: true, id })
  } catch (err) {
    logger.error('push: register failed', { error: err.message })
    return res.status(500).json({ ok: false, error: 'register_failed' })
  }
})

module.exports = router

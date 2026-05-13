'use strict'
/**
 * /api/kv-store - kv_store observability endpoint.
 *
 * Phase 4 dashboard (fork_mp3pkavh_12c438): kv_store Writes panel.
 * GET /api/kv-store/recent — last 10 keys updated (credential keys filtered out).
 *
 * SECURITY: creds.* keys are explicitly excluded at the SQL layer.
 * Keys + timestamps are exposed; values are never returned.
 */

const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const db = require('../config/db')
const logger = require('../config/logger')

router.use(auth)

// GET /api/kv-store/recent
// Returns last 10 kv_store keys by updated_at, excluding any creds.* keys.
// Returns: { writes: [{ key, val_size, updated_at }] }
router.get('/recent', async (_req, res, next) => {
  try {
    const rows = await db`
      SELECT
        key,
        octet_length(value::text) AS val_size,
        updated_at
      FROM kv_store
      WHERE key NOT LIKE 'creds.%'
        AND key NOT LIKE 'creds/%'
        AND key NOT LIKE 'creds:%'
      ORDER BY updated_at DESC
      LIMIT 10
    `
    res.json({
      writes: rows.map((r) => ({
        key:        r.key,
        val_size:   r.val_size ?? 0,
        updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      })),
    })
  } catch (err) {
    logger.debug('/kv-store: recent unavailable', { error: err.message })
    next(err)
  }
})

module.exports = router

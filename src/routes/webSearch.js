'use strict'

/**
 * POST /api/web-search   body: { query, count?, country?, safesearch?, bypassCache? }
 * GET  /api/web-search?query=...&count=...
 *
 * Brave-Search-backed web search with 24h cache. AUTONOMY_AUDIT_2026-05-13 §27.
 */

const { Router } = require('express')
const router = Router()
const logger = require('../config/logger')
const webSearch = require('../services/webSearchService')

async function _handle(req, res) {
  try {
    const params = req.method === 'POST' ? (req.body || {}) : (req.query || {})
    const query = String(params.query || '').trim()
    if (!query) return res.status(400).json({ ok: false, error: 'query required' })
    const result = await webSearch.search(query, {
      count: parseInt(params.count, 10) || undefined,
      country: params.country,
      safesearch: params.safesearch,
      bypassCache: params.bypassCache === true || params.bypassCache === 'true',
    })
    res.json(result)
  } catch (err) {
    logger.error('/api/web-search failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
}

router.post('/', _handle)
router.get('/', _handle)

module.exports = router

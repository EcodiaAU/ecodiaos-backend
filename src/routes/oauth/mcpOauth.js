'use strict'

/**
 * OAuth 2.0 PKCE wrapper for the ecodia-full MCP bearer (Lane E, 2026-05-15).
 *
 * Stub implementation: returns 501 on all OAuth endpoints.
 * Full implementation on VPS at ~/ecodiaos/src/routes/oauth/mcpOauth.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour: standard OAuth 2.0 Authorization Code + PKCE flow with
 * a pre-registered client_id and locked redirect_uri. Defensive ship in
 * case claude.ai Custom Connectors require OAuth rather than plain bearer.
 *
 * Endpoints (when implemented):
 *   GET  /api/oauth/mcp/authorize   - PKCE challenge redirect
 *   POST /api/oauth/mcp/token       - code exchange
 *   POST /api/oauth/mcp/revoke      - token revocation
 */

const express = require('express')
const router = express.Router()
const logger = require('../../config/logger')

router.use(express.json({ limit: '64kb' }))

const STUB_MSG = 'MCP OAuth stub: full PKCE flow pending VPS sync.'

router.get('/authorize', (_req, res) => {
  logger.warn('[mcp-oauth] stub: /authorize called')
  res.status(501).json({ error: 'not_implemented', message: STUB_MSG })
})

router.post('/token', (_req, res) => {
  logger.warn('[mcp-oauth] stub: /token called')
  res.status(501).json({ error: 'not_implemented', message: STUB_MSG })
})

router.post('/revoke', (_req, res) => {
  logger.warn('[mcp-oauth] stub: /revoke called')
  res.status(501).json({ error: 'not_implemented', message: STUB_MSG })
})

module.exports = router

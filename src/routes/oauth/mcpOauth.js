'use strict'

/**
 * /api/oauth/mcp/* - OAuth 2.0 PKCE wrapper for the ecodia-full MCP bearer.
 *
 * STUB: Defensive ship for the case where claude.ai Custom Connectors require
 * OAuth rather than a bare bearer token (Lane E, 2026-05-15).
 *
 * Full implementation will expose:
 *   GET  /api/oauth/mcp/authorize  - PKCE authorization endpoint
 *   POST /api/oauth/mcp/token      - token exchange
 *   GET  /api/oauth/mcp/.well-known/openid-configuration
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 */

const express = require('express')

const router = express.Router()

router.get('/.well-known/openid-configuration', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}/api/oauth/mcp`
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    _stub: true,
    _note: 'OAuth MCP stub - not yet implemented',
  })
})

router.all('*', express.json({ limit: '1mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    endpoint: '/api/oauth/mcp',
    note: 'PKCE OAuth wrapper stub - implementation pending',
  })
})

module.exports = router

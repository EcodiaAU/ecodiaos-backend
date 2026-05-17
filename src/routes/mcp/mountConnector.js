'use strict'

/**
 * mountConnector(connector) - factory that returns an Express router for a
 * domain-scoped MCP connector (Phase 2 Lane 10, 2026-05-15).
 *
 * STUB: Real implementation proxies a named stdio MCP server behind an HTTP
 * adapter with per-connector bearer auth + scope enforcement.
 *
 * Usage (from app.js):
 *   const mountConnector = require('./routes/mcp/mountConnector')
 *   app.use('/api/mcp/' + connector.mountPath, mountConnector(connector))
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 */

const express = require('express')

function mountConnector(connector) {
  const router = express.Router()

  router.get('/', (req, res) => {
    res.json({
      schema_version: '2025-11-05',
      name: connector.name || 'unknown',
      description: `${connector.name} connector (stub - not yet implemented)`,
      tools: [],
      _stub: true,
    })
  })

  router.all('*', express.json({ limit: '5mb' }), (req, res) => {
    res.status(503).json({
      error: 'not_yet_implemented',
      connector: connector.name || 'unknown',
      note: 'Domain-scoped connector stub - implementation pending',
    })
  })

  return router
}

module.exports = mountConnector

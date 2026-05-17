'use strict'

/**
 * /api/mcp/ecodia-full - Lane E VPS-to-local migration (2026-05-15).
 *
 * STUB: Wider-bearer MCP endpoint that proxies the 10 stdio MCP servers
 * and re-exposes cowork V2 tools. Full implementation requires:
 *   - connectorManifests.CONNECTORS enumeration
 *   - mountConnector factory wiring each stdio server to an HTTP adapter
 *   - Bearer validation wider than the cowork bearer scope
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 * Track: status_board migration row 580f7aaf-d0c5-4153-b712-0b5d6738d3d5
 */

const express = require('express')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({
    schema_version: '2025-11-05',
    name: 'ecodia-full',
    description: 'EcodiaOS full MCP endpoint (Lane E stub - not yet implemented)',
    tools: [],
    _stub: true,
    _note: 'Implementation pending - see MIGRATION_FULL_ARCHITECTURE_2026-05-15.md',
  })
})

router.all('*', express.json({ limit: '5mb' }), (req, res) => {
  res.status(503).json({
    error: 'not_yet_implemented',
    endpoint: '/api/mcp/ecodia-full',
    note: 'Lane E stub - connectorManifests + mountConnector implementation pending',
  })
})

module.exports = router

'use strict'

/**
 * Domain-scoped MCP connector mount factory (Phase 2 Lane 10, 2026-05-15).
 *
 * Stub implementation: creates an Express router for each connector that
 * returns an MCP-compliant discovery response and 501 on tools/call.
 * Full implementation on VPS at ~/ecodiaos/src/routes/mcp/mountConnector.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour: each connector has its own bearer + OAuth client_id, proxies
 * the corresponding stdio MCP server, enforces scope subset per connector.
 */

const express = require('express')
const logger = require('../../config/logger')

const PROTOCOL_VERSION = '2025-03-26'

/**
 * Create an Express router for a connector manifest entry.
 * @param {object} connector - Entry from CONNECTORS in connectorManifests.js
 * @returns {express.Router}
 */
function mountConnector(connector) {
  const router = express.Router()
  router.use(express.json({ limit: '512kb' }))

  // MCP discovery (public per MCP spec, no auth required)
  router.get('/', (_req, res) => {
    res.json({
      stub: true,
      name: connector.name,
      description: connector.description,
      protocol_version: PROTOCOL_VERSION,
      message: 'Full implementation pending VPS sync. See ~/ecodiaos/src/routes/mcp/mountConnector.js',
    })
  })

  // MCP JSON-RPC endpoint (stub)
  router.post('/', (req, res) => {
    const { method, id } = req.body || {}
    logger.warn(`[mountConnector:${connector.name}] stub: method=${method}`)

    // Handle MCP handshake methods with valid responses so claude.ai can enumerate
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: connector.name, version: '0.0.0-stub' },
        },
      })
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: { tools: [] },
      })
    }

    if (method === 'notifications/initialized' || method === 'ping') {
      return res.status(200).end()
    }

    // tools/call and everything else: not implemented
    return res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `${connector.name} stub: method not implemented. Full connector pending VPS sync.`,
      },
    })
  })

  return router
}

module.exports = mountConnector

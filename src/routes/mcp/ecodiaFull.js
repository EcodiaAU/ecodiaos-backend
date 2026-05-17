'use strict'

/**
 * EcodiaOS Full MCP endpoint stub (Lane E, 2026-05-15).
 *
 * Stub implementation: returns MCP-compliant discovery + empty tools list.
 * Full implementation on VPS at ~/ecodiaos/src/routes/mcp/ecodiaFull.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Full behaviour: wider bearer that proxies all 10 stdio MCP servers and
 * re-exposes cowork V2 tools. Kept as migration alias for 30d alongside
 * the 10 domain-scoped connectors at /api/mcp/ecodia-*.
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 */

const express = require('express')
const router = express.Router()
const logger = require('../../config/logger')

const PROTOCOL_VERSION = '2025-03-26'

router.use(express.json({ limit: '2mb' }))

router.get('/_health', (_req, res) => {
  res.json({ ok: true, service: 'ecodia-full', stub: true })
})

// MCP JSON-RPC root (public discovery per MCP spec)
router.post('/', (req, res) => {
  const { method, id } = req.body || {}
  logger.warn(`[ecodiaFull] stub: method=${method}`)

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'EcodiaOS Full', version: '0.0.0-stub' },
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

  return res.json({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: 'ecodia-full stub: method not implemented. Full proxy pending VPS sync.',
    },
  })
})

module.exports = router

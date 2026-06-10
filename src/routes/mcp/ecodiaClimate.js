/**
 * ecodia-climate - narrow domain-scoped MCP connector router (W7).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W7)
 *
 * Mirrors mountConnector.js + connectorMcpShim.js mechanics exactly (same
 * route surface, same bearer middleware, same JSON-RPC methods, same error
 * envelope and audit path), with ONE structural difference: the cd_* tools
 * are in-process handlers over the DEDICATED ecodia-climate database, not
 * cowork-router dispatch or stdio proxying, so tools/call validates args
 * against each tool's explicit zod schema and invokes the handler directly.
 *
 * Why not a connectorManifests.CONNECTORS entry: see the rationale block in
 * src/services/climate/connector/manifest.js (boot-time scope validation +
 * client-gated mount). Enabling this connector is one line in app.js:
 *
 *   app.use('/api/mcp/ecodia-climate', require('./routes/mcp/ecodiaClimate')())
 *
 * Routes:
 *   GET  /_health  -> ok + tool count (no auth, safe diagnostic)
 *   GET  /_tools   -> full tool manifest (auth required)
 *   POST /         -> JSON-RPC root (initialize/list public, tools/call gated)
 *   POST /tool     -> REST mirror for non-JSON-RPC callers (auth required)
 */
'use strict'

const express = require('express')
const { randomUUID } = require('node:crypto')

const logger = require('../../config/logger')
const makeConnectorAuth = require('../../middleware/connectorAuth')
const connectorAudit = require('../../services/connectorAudit')
const { CONNECTOR } = require('../../services/climate/connector/manifest')
const { TOOLS, getTool } = require('../../services/climate/connector/tools')
const { getClimateDb } = require('../../services/climate/connector/climateDb')

const PROTOCOL_VERSION = '2025-03-26'

const RPC_ERR = Object.freeze({
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' },
  UNAUTHENTICATED:  { code: -32000, message: 'unauthenticated' },
  SCOPE_DENIED:     { code: -32001, message: 'scope_denied' },
})

function rpcError(id, err, details) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: err.code, message: err.message, ...(details !== undefined ? { data: details } : {}) },
  }
}
function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function _shortDescribe(name, fullDesc) {
  if (fullDesc && typeof fullDesc === 'string') {
    const firstLine = fullDesc.split('\n')[0].trim()
    if (firstLine.length <= 120) return firstLine
    return firstLine.slice(0, 117) + '...'
  }
  return `Tool ${name}`
}

/**
 * Run one cd_* tool call: scope gate (requireScope envelope over
 * req.connectorScopes), zod parse (422 invalid_params), handler invoke.
 * Returns { statusCode, body } - the same dispatch contract the shim's
 * cowork/stdio paths produce, so the JSON-RPC and REST surfaces render
 * identically to the sibling connectors.
 */
async function dispatchClimateTool(req, tool, rawArgs, db) {
  // Scope gate - mirrors ecodiaFullScope.requireScope's envelope exactly,
  // checked against the climate bearer's scopes (climate scopes live outside
  // ecodiaFullScope.SCOPES by design; see manifest.js).
  const granted = Array.isArray(req.connectorScopes) ? req.connectorScopes : []
  if (!granted.includes(tool.scope)) {
    return {
      statusCode: 403,
      body: {
        error: 'scope_denied',
        message: `requires ${tool.scope}`,
        details: { required: tool.scope, granted },
      },
    }
  }

  const parsed = tool.schema.safeParse(rawArgs ?? {})
  if (!parsed.success) {
    return {
      statusCode: 422,
      body: {
        error: 'invalid_params',
        tool: tool.name,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    }
  }

  try {
    const result = await tool.handler({ args: parsed.data, db, req })
    return { statusCode: 200, body: result }
  } catch (err) {
    const status = Number.isInteger(err?.httpStatus) ? err.httpStatus : 500
    if (status >= 500) {
      logger.error('ecodia-climate: tool handler error', {
        tool: tool.name, error: err.message, stack: err.stack,
      })
    }
    return {
      statusCode: status,
      body: {
        error: err?.code || 'internal_error',
        message: err?.message || 'tool handler failed',
        ...(err?.details ? { details: err.details } : {}),
      },
    }
  }
}

function buildClimateRouter(overrides = {}) {
  const connector = CONNECTOR
  const router = express.Router()
  router.use(express.json({ limit: '8mb' }))

  const auth = overrides.auth || makeConnectorAuth(connector)
  // db resolves lazily PER CALL: the dedicated project is client-gated and
  // may not exist at mount time; _health and discovery must work regardless.
  const resolveDb = overrides.resolveDb || (() => getClimateDb())
  const allowlist = new Set(connector.tools)

  async function _handleSingle(req, rpcBody) {
    const id = rpcBody.id
    const method = rpcBody.method
    const params = rpcBody.params || {}
    const isNotification = id === undefined

    try {
      if (method === 'initialize') {
        return rpcResult(id ?? null, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: `EcodiaOS ${connector.title} MCP`, version: '1.0.0' },
        })
      }
      if (method === 'notifications/initialized' || method === 'initialized') return null
      if (method === 'ping') return rpcResult(id ?? null, {})
      if (method === 'tools/list') {
        // Deferred-load shape, per the sibling connectors (full schema via tools/describe).
        const tools = TOOLS.map((t) => ({
          name: t.name,
          description: _shortDescribe(t.name, t.description),
          inputSchema: { type: 'object', properties: {}, _deferred: true },
        }))
        return rpcResult(id ?? null, { tools })
      }
      if (method === 'tools/describe') {
        const names = Array.isArray(params?.names) ? params.names
          : (typeof params?.name === 'string' ? [params.name] : [])
        if (!names.length) return rpcError(id ?? null, RPC_ERR.INVALID_PARAMS, { reason: 'names (string[]) or name (string) required' })
        const out = []
        for (const n of names) {
          if (!allowlist.has(n)) {
            out.push({ name: n, error: 'tool_not_in_connector', connector: connector.name })
            continue
          }
          const t = getTool(n)
          if (!t) out.push({ name: n, error: 'tool_unresolved' })
          else out.push({ name: t.name, description: t.description, inputSchema: t.inputSchema, _source: 'climate_inprocess' })
        }
        return rpcResult(id ?? null, { tools: out })
      }
      if (method === 'prompts/list') return rpcResult(id ?? null, { prompts: [] })
      if (method === 'resources/list') return rpcResult(id ?? null, { resources: [] })

      if (method === 'tools/call') {
        const toolName = params?.name
        const toolArgs = params?.arguments || {}
        if (!toolName || typeof toolName !== 'string') {
          return rpcError(id ?? null, RPC_ERR.INVALID_PARAMS, { reason: 'name (string) required' })
        }
        if (!allowlist.has(toolName)) {
          return rpcError(id ?? null, RPC_ERR.SCOPE_DENIED, {
            reason: 'tool_not_in_connector',
            connector: connector.name,
            tool: toolName,
            hint: `tool ${toolName} is not exposed under ${connector.name}; load the matching connector`,
          })
        }
        const tool = getTool(toolName)
        if (!tool) return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { reason: 'tool_unrouted', tool: toolName })

        let db
        try {
          db = resolveDb()
        } catch (err) {
          return rpcResult(id ?? null, {
            content: [{ type: 'text', text: JSON.stringify({ error: err.code || 'climate_db_unavailable', message: err.message }) }],
            isError: true,
            _meta: { http_status: err.httpStatus || 503 },
          })
        }

        const startedAt = Date.now()
        const result = await dispatchClimateTool(req, tool, toolArgs, db)

        connectorAudit.recordConnectorAuditRow({
          connectorName: connector.name,
          toolName,
          bearerFingerprint: req.connectorBearerFingerprint,
          args: toolArgs,
          result: result.body,
          statusCode: result.statusCode,
          durationMs: Date.now() - startedAt,
        }).catch(() => {})

        const isError = result.statusCode >= 400
        const text = result.body == null ? '' :
          (typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
        return rpcResult(id ?? null, {
          content: [{ type: 'text', text }],
          isError,
          _meta: { http_status: result.statusCode, ...(isError ? { error_body: result.body } : {}) },
        })
      }

      if (isNotification) return null
      return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { method })
    } catch (err) {
      logger.error('ecodia-climate: shim handler error', {
        connector: connector.name, method, error: err.message, stack: err.stack,
      })
      if (isNotification) return null
      return rpcError(id ?? null, RPC_ERR.INTERNAL_ERROR, { error: err.message })
    }
  }

  async function handleMcpRequest(req, res) {
    const body = req.body
    if (body == null || typeof body !== 'object') {
      return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'body must be JSON object or array' }))
    }
    if (Array.isArray(body)) {
      if (!body.length) return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'empty batch' }))
      const out = []
      for (const item of body) {
        const r = await _handleSingle(req, item || {})
        if (r !== null) out.push(r)
      }
      return out.length ? res.json(out) : res.status(204).end()
    }
    const result = await _handleSingle(req, body)
    if (result === null) return res.status(204).end()
    return res.json(result)
  }

  router.get('/_health', (_req, res) => {
    res.json({
      ok: true,
      service: `ecodia-connector:${connector.name}`,
      version: 1,
      connector: connector.name,
      tool_count: connector.tools.length,
      bearer_key: connector.bearerKey,
      mounted_at: new Date().toISOString(),
    })
  })

  // JSON-RPC root - discovery public per MCP spec, tools/call + tools/describe
  // behind the bearer (same soft-auth pre-pass as mountConnector.js).
  router.post('/', async (req, res, next) => {
    const method = req.body && req.body.method
    if (method === 'tools/call' || method === 'tools/describe') {
      return auth(req, res, async (err) => {
        if (err) return next(err)
        return handleMcpRequest(req, res)
      })
    }
    return handleMcpRequest(req, res)
  })

  // Everything below requires bearer
  router.use(auth)

  router.get('/_tools', (_req, res) => {
    res.json({
      connector: connector.name,
      tool_count: connector.tools.length,
      tools: connector.tools,
      scopes: connector.scopes,
    })
  })

  // REST mirror for callers that don't speak JSON-RPC
  router.post('/tool', async (req, res) => {
    const toolName = req.body?.tool
    const args = req.body?.arguments || {}
    if (!toolName) return res.status(400).json({ error: 'missing_tool' })
    if (!allowlist.has(toolName)) {
      return res.status(403).json({
        error: 'scope_denied',
        message: `tool ${toolName} not exposed under ${connector.name}`,
        connector: connector.name,
      })
    }
    req.body = { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: toolName, arguments: args } }
    return handleMcpRequest(req, res)
  })

  return router
}

module.exports = buildClimateRouter
module.exports.CONNECTOR = CONNECTOR
module.exports._internal = { dispatchClimateTool, RPC_ERR }

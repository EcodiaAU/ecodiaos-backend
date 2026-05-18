/**
 * Domain-scoped MCP connector - JSON-RPC 2.0 shim factory.
 *
 * Given a connector descriptor (from connectorManifests), returns a per-
 * connector shim that handles initialize / tools/list / tools/describe /
 * tools/call. Differences vs ecodiaFullMcpShim:
 *   - tool surface filtered to the connector's `tools` allowlist
 *   - tools/list returns minimal shape (name + 1-line description only)
 *     for deferred-load. Full inputSchema is fetched per-tool via the
 *     new `tools/describe` method (companion fix §10.5).
 *   - tools/call returns `tool_not_in_connector` for any tool outside the
 *     allowlist (cross-connector denial test)
 *   - shell_exec routes to the dedicated /shell_exec endpoint (only present
 *     under ecodia-shell)
 *
 * Spec: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md §10.2 + §10.5.
 * Authored: 15 May 2026.
 */
'use strict'

const logger = require('../../config/logger')
const manifests = require('../../services/connectorManifests')
const stdio = require('../../services/ecodiaFullStdioProxy')
const coworkShim = require('./coworkMcpShim')
const ecodiaFullShim = require('./ecodiaFullMcpShim')
const connectorAudit = require('../../services/connectorAudit')

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

// Lazy: minimal cowork tool descriptors keyed by name (we only need
// { name, description, inputSchema }).
const _coworkByName = new Map(
  coworkShim.TOOLS.map(t => [t.name, t])
)

// 1-line description fallback for stdio tools whose underlying server's
// tools/list returns long descriptions. We derive short hints from the name.
function _shortDescribe(name, fullDesc) {
  if (fullDesc && typeof fullDesc === 'string') {
    const firstLine = fullDesc.split('\n')[0].trim()
    if (firstLine.length <= 120) return firstLine
    return firstLine.slice(0, 117) + '...'
  }
  return `Tool ${name}`
}

// Resolve a tool descriptor (name + description + inputSchema) given the
// connector's allowed tool name. Hits cowork-static-list for cowork tools,
// hits the stdio proxy's listTools() cache for stdio tools.
async function _resolveTool(toolName) {
  if (manifests.isCoworkTool(toolName)) {
    const t = _coworkByName.get(toolName)
    if (!t) return null
    return {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
      _source: 'cowork_inprocess',
    }
  }
  const serverName = manifests.stdioServerForTool(toolName)
  if (!serverName) return null
  try {
    const tools = await stdio.listTools(serverName)
    const t = (tools || []).find(x => x && x.name === toolName)
    if (!t) return null
    return {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || t.input_schema || { type: 'object', properties: {} },
      _source: `stdio:${serverName}`,
    }
  } catch (err) {
    logger.warn('connector-shim: stdio resolve failed', { toolName, serverName, error: err.message })
    return null
  }
}

// Build minimal (deferred-load) tools/list entries from allowlist.
async function _toolsListMinimal(connector) {
  const out = []
  // Cowork tools: descriptions are inline in coworkShim.TOOLS - keep first line
  for (const toolName of connector.tools) {
    if (manifests.isCoworkTool(toolName)) {
      const t = _coworkByName.get(toolName)
      out.push({
        name: toolName,
        description: _shortDescribe(toolName, t?.description),
        // Deferred: do not include inputSchema. Caller will fetch via tools/describe.
        inputSchema: { type: 'object', properties: {}, _deferred: true },
      })
    }
  }
  // Stdio tools: hit listTools per server once and pick names
  const stdioByServer = new Map()
  for (const toolName of connector.tools) {
    if (manifests.isCoworkTool(toolName)) continue
    const srv = manifests.stdioServerForTool(toolName)
    if (!srv) continue
    if (!stdioByServer.has(srv)) stdioByServer.set(srv, [])
    stdioByServer.get(srv).push(toolName)
  }
  for (const [srv, names] of stdioByServer.entries()) {
    let serverTools = []
    try { serverTools = await stdio.listTools(srv) } catch (err) {
      logger.warn('connector-shim: listTools failed', { server: srv, error: err.message })
    }
    const byName = new Map((serverTools || []).map(t => [t.name, t]))
    for (const n of names) {
      const t = byName.get(n)
      out.push({
        name: n,
        description: _shortDescribe(n, t?.description),
        inputSchema: { type: 'object', properties: {}, _deferred: true },
      })
    }
  }
  return out
}

// _dispatchCoworkTool - reuse the existing ecodia-full helper. It reads
// req.ecodiaFullScopes which we mirror in connectorAuth so cowork scope
// checks pass transparently.
async function _dispatchCoworkTool(parentReq, toolName, args) {
  const coworkRouter = require('./cowork')
  return new Promise((resolve) => {
    const layer = coworkRouter.stack.find(l => l.route && l.route.path === `/${toolName}`)
    if (!layer) {
      return resolve({ statusCode: 404, body: { error: 'cowork_tool_not_found', tool: toolName } })
    }
    const handlers = layer.route.stack.map(s => s.handle)
    const syntheticReq = Object.assign(
      Object.create(Object.getPrototypeOf(parentReq) || Object.prototype),
      parentReq,
      {
        body: args && typeof args === 'object' ? args : {},
        method: 'POST',
        url: '/' + toolName,
        originalUrl: '/api/mcp/' + (parentReq.connectorName || 'unknown') + '/' + toolName,
        coworkScopes: parentReq.connectorScopes || parentReq.ecodiaFullScopes || [],
        coworkBearerFingerprint: parentReq.connectorBearerFingerprint,
        coworkBearerRow: parentReq.connectorBearerRow,
      }
    )
    let settled = false
    const finish = (out) => { if (settled) return; settled = true; resolve(out) }
    const syntheticRes = {
      _status: 200, _headers: {}, headersSent: false,
      status(code) { this._status = code; return this },
      setHeader(name, value) { this._headers[name] = value; return this },
      getHeader(name) { return this._headers[name] },
      json(obj) { this.headersSent = true; finish({ statusCode: this._status, body: obj }); return this },
      send(obj) {
        this.headersSent = true
        if (typeof obj === 'object' && obj !== null) return this.json(obj)
        finish({ statusCode: this._status, body: { text: String(obj) } })
        return this
      },
      end() { this.headersSent = true; finish({ statusCode: this._status, body: null }); return this },
    }
    let i = 0
    const next = (err) => {
      if (settled) return
      if (err) return finish({ statusCode: 500, body: { error: 'middleware_error', message: err?.message || String(err) } })
      if (i >= handlers.length) return finish({ statusCode: 404, body: { error: 'no_handler' } })
      const handler = handlers[i++]
      try {
        const ret = handler(syntheticReq, syntheticRes, next)
        if (ret && typeof ret.catch === 'function') ret.catch((e) => next(e))
      } catch (e) { next(e) }
    }
    next()
  })
}

async function _dispatchStdioTool(serverName, toolName, args) {
  try {
    const result = await stdio.callTool(serverName, toolName, args)
    return { statusCode: result?.isError ? 500 : 200, body: result }
  } catch (err) {
    return { statusCode: 500, body: { error: 'stdio_dispatch_failed', server: serverName, tool: toolName, message: err.message } }
  }
}

function makeConnectorShim(connector) {
  const allowlist = new Set(connector.tools)

  async function _handleSingle(parentReq, rpcBody) {
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
        const tools = await _toolsListMinimal(connector)
        return rpcResult(id ?? null, { tools })
      }
      if (method === 'tools/describe') {
        // Companion fix §10.5: full-schema fetch on demand.
        const names = Array.isArray(params?.names) ? params.names
          : (typeof params?.name === 'string' ? [params.name] : [])
        if (!names.length) return rpcError(id ?? null, RPC_ERR.INVALID_PARAMS, { reason: 'names (string[]) or name (string) required' })
        const out = []
        for (const n of names) {
          if (!allowlist.has(n)) {
            out.push({ name: n, error: 'tool_not_in_connector', connector: connector.name })
            continue
          }
          const t = await _resolveTool(n)
          if (!t) out.push({ name: n, error: 'tool_unresolved' })
          else out.push(t)
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
        // Allowlist filter - the connector boundary
        if (!allowlist.has(toolName)) {
          return rpcError(id ?? null, RPC_ERR.SCOPE_DENIED, {
            reason: 'tool_not_in_connector',
            connector: connector.name,
            tool: toolName,
            hint: `tool ${toolName} is not exposed under ${connector.name}; load the matching connector`,
          })
        }
        // shell_exec via tools/call is forbidden; use dedicated route
        if (toolName === 'shell_exec' || toolName === 'vps.shell_exec') {
          return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, {
            reason: 'use_dedicated_route',
            hint: `POST /api/mcp/${connector.mountPath}/shell_exec for confirm-gate + rate cap + denylist`,
          })
        }

        const startedAt = Date.now()
        let result
        if (manifests.isCoworkTool(toolName)) {
          result = await _dispatchCoworkTool(parentReq, toolName, toolArgs)
        } else {
          const srv = manifests.stdioServerForTool(toolName)
          if (!srv) {
            return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { reason: 'tool_unrouted', tool: toolName })
          }
          result = await _dispatchStdioTool(srv, toolName, toolArgs)
        }

        connectorAudit.recordConnectorAuditRow({
          connectorName: connector.name,
          toolName,
          bearerFingerprint: parentReq.connectorBearerFingerprint,
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
      logger.error('connector-shim: handler error', {
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
      if (body.length === 0) {
        return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'empty batch' }))
      }
      const responses = []
      for (const env of body) {
        if (!env || typeof env !== 'object' || env.jsonrpc !== '2.0' || typeof env.method !== 'string') {
          responses.push(rpcError(env?.id ?? null, RPC_ERR.INVALID_REQUEST))
          continue
        }
        const out = await _handleSingle(req, env)
        if (out !== null) responses.push(out)
      }
      if (responses.length === 0) return res.status(204).end()
      return res.json(responses)
    }
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return res.status(400).json(rpcError(body.id ?? null, RPC_ERR.INVALID_REQUEST))
    }
    const out = await _handleSingle(req, body)
    if (out === null) return res.status(204).end()
    return res.json(out)
  }

  return { handleMcpRequest, _RPC_ERR: RPC_ERR }
}

module.exports = makeConnectorShim
module.exports.PROTOCOL_VERSION = PROTOCOL_VERSION
module.exports._RPC_ERR = RPC_ERR

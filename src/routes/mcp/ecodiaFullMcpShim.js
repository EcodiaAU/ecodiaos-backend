/**
 * ecodia-full MCP - JSON-RPC 2.0 shim.
 *
 * Same wire protocol as coworkMcpShim. Differences:
 *   - bearer: kv_store.creds.ecodia_full_mcp_bearer (via ecodiaFullAuth)
 *   - tool surface: 22 cowork V2 tools + 10 stdio MCP servers' tools
 *   - dispatch routing: tools with names matching a cowork V2 path land
 *     in the cowork router via synthetic-request injection; everything else
 *     routes through ecodiaFullStdioProxy to the appropriate child process
 *   - audit: every tools/call goes through ecodiaFullAudit.recordAuditRow
 *   - vps.shell_exec: tools/call is FORBIDDEN (must call POST /shell_exec
 *     which has the dedicated gate). The MCP tools/list still advertises it
 *     so callers know it exists, but tools/call returns method_not_found
 *     with a hint to use the dedicated route.
 *
 * Spec: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §2.
 * Authored: 15 May 2026 (Lane E).
 */
'use strict'

const logger = require('../../config/logger')
const ecodiaFullAuth = require('../../middleware/ecodiaFullAuth')
const audit = require('../../services/ecodiaFullAudit')
const stdio = require('../../services/ecodiaFullStdioProxy')
const coworkShim = require('./coworkMcpShim')

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = Object.freeze({
  name: 'EcodiaOS Full MCP',
  version: '1.0.0',
})

// ── Cowork V2 in-process tools (re-exposed under the wider bearer) ──────
// We borrow the existing TOOLS array from coworkMcpShim and tag each one as
// 'cowork_inprocess' so dispatch routes it via the cowork router's synthetic
// request path. The bearer used is ecodia-full, but the scope check inside
// the cowork router still runs (and passes, because the ecodia-full bearer
// includes all cowork scopes - see ecodiaFullScope.COWORK_SCOPES).
const COWORK_INPROCESS_TOOLS = coworkShim.TOOLS.map(t => ({ ...t, _source: 'cowork_inprocess' }))
const COWORK_TOOL_NAMES = new Set(COWORK_INPROCESS_TOOLS.map(t => t.name))

// ── Stdio-server tool routing table ─────────────────────────────────────
// Maps unprefixed tool name -> server name. Populated lazily on first
// tools/list call. Keeps the route handler stateless wrt which server owns
// what until we actually need to know.
const _toolToServer = new Map()
let _toolMapPopulated = false
let _toolMapPromise = null

async function _populateToolMap() {
  if (_toolMapPopulated) return
  if (_toolMapPromise) return _toolMapPromise
  _toolMapPromise = (async () => {
    const all = await stdio.listAllTools()
    for (const [serverName, tools] of Object.entries(all)) {
      if (!Array.isArray(tools)) continue
      for (const t of tools) {
        if (!t || !t.name) continue
        _toolToServer.set(t.name, serverName)
      }
    }
    _toolMapPopulated = true
  })()
  try {
    await _toolMapPromise
  } finally {
    _toolMapPromise = null
  }
}

async function _allToolsForList() {
  await _populateToolMap()
  const stdioTools = []
  const all = await stdio.listAllTools()
  for (const [serverName, tools] of Object.entries(all)) {
    if (!Array.isArray(tools)) continue
    for (const t of tools) {
      stdioTools.push({
        ...t,
        _source: `stdio:${serverName}`,
      })
    }
  }
  return [...COWORK_INPROCESS_TOOLS, ...stdioTools]
}

// ── JSON-RPC error helpers ──────────────────────────────────────────────
const RPC_ERR = Object.freeze({
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' },
  UNAUTHENTICATED:  { code: -32000, message: 'unauthenticated' },
})

function rpcError(id, err, details) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code: err.code,
      message: err.message,
      ...(details !== undefined ? { data: details } : {}),
    },
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

// ── Programmatic ecodiaFullAuth wrap (same shape as coworkMcpShim) ──────
function _runEcodiaFullAuth(parentReq) {
  return new Promise((resolve, reject) => {
    let settled = false
    const fakeRes = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(body) {
        if (settled) return this
        settled = true
        const err = new Error((body && body.message) || 'auth_failed')
        err._authFail = true
        err._authBody = body || { error: 'auth_failed' }
        err._authStatus = this._status
        reject(err)
        return this
      },
    }
    const next = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    Promise.resolve()
      .then(() => ecodiaFullAuth(parentReq, fakeRes, next))
      .catch((e) => { if (!settled) { settled = true; reject(e) } })
  })
}

// ── Dispatch a cowork V2 tool via synthetic request into the cowork router
function _dispatchCoworkTool(parentReq, toolName, args) {
  // Lazy-load the cowork router to avoid a circular require during boot.
  const coworkRouter = require('./cowork')
  return new Promise((resolve) => {
    const layer = coworkRouter.stack.find(l => l.route && l.route.path === `/${toolName}`)
    if (!layer) {
      return resolve({ statusCode: 404, body: { error: 'cowork_tool_not_found', tool: toolName }, headers: {} })
    }
    const handlers = layer.route.stack.map(s => s.handle)

    // The cowork handlers read req.coworkScopes via the cowork scope helpers.
    // The ecodia-full bearer carries the cowork scopes too (additive design),
    // but they're stored on req.ecodiaFullScopes. Mirror them onto coworkScopes
    // for the synthetic request so the cowork scope checks pass transparently.
    const syntheticReq = Object.assign(
      Object.create(Object.getPrototypeOf(parentReq) || Object.prototype),
      parentReq,
      {
        body: args && typeof args === 'object' ? args : {},
        method: 'POST',
        url: '/' + toolName,
        originalUrl: '/api/mcp/ecodia-full/' + toolName,
        coworkScopes: parentReq.ecodiaFullScopes || [],
        coworkBearerFingerprint: parentReq.ecodiaFullBearerFingerprint,
        coworkBearerRow: parentReq.ecodiaFullBearerRow,
      }
    )

    let settled = false
    const finish = (out) => {
      if (settled) return
      settled = true
      resolve(out)
    }

    const syntheticRes = {
      _status: 200,
      _headers: {},
      headersSent: false,
      status(code) { this._status = code; return this },
      setHeader(name, value) { this._headers[name] = value; return this },
      getHeader(name) { return this._headers[name] },
      json(obj) {
        this.headersSent = true
        finish({ statusCode: this._status, body: obj, headers: this._headers })
        return this
      },
      send(obj) {
        this.headersSent = true
        if (typeof obj === 'object' && obj !== null) return this.json(obj)
        finish({ statusCode: this._status, body: { text: String(obj) }, headers: this._headers })
        return this
      },
      end() {
        this.headersSent = true
        finish({ statusCode: this._status, body: null, headers: this._headers })
        return this
      },
    }

    let i = 0
    const next = (err) => {
      if (settled) return
      if (err) {
        return finish({ statusCode: 500, body: { error: 'middleware_error', message: err?.message || String(err) }, headers: {} })
      }
      if (i >= handlers.length) {
        return finish({ statusCode: 404, body: { error: 'no_handler' }, headers: {} })
      }
      const handler = handlers[i++]
      try {
        const ret = handler(syntheticReq, syntheticRes, next)
        if (ret && typeof ret.catch === 'function') ret.catch((e) => next(e))
      } catch (e) {
        next(e)
      }
    }
    next()
  })
}

// ── Dispatch a stdio-child tool via the proxy ────────────────────────────
async function _dispatchStdioTool(serverName, toolName, args) {
  try {
    const result = await stdio.callTool(serverName, toolName, args)
    // stdio MCP servers return { content: [...], isError: bool } already
    return { statusCode: result?.isError ? 500 : 200, body: result, headers: {} }
  } catch (err) {
    return { statusCode: 500, body: { error: 'stdio_dispatch_failed', server: serverName, tool: toolName, message: err.message }, headers: {} }
  }
}

// ── Unified dispatch (also callable from the /tool REST shim) ───────────
async function dispatchToolCall(parentReq, toolName, args) {
  const startedAt = Date.now()
  const bearerFp = parentReq.ecodiaFullBearerFingerprint

  // 1. shell_exec - hard refusal via tools/call. Use the dedicated route.
  if (toolName === 'vps.shell_exec' || toolName === 'shell_exec') {
    return {
      statusCode: 400,
      body: { error: 'use_dedicated_route', message: 'shell_exec requires POST /api/mcp/ecodia-full/shell_exec for confirm-gate + rate cap + denylist enforcement' },
    }
  }

  let result
  if (COWORK_TOOL_NAMES.has(toolName)) {
    result = await _dispatchCoworkTool(parentReq, toolName, args)
  } else {
    await _populateToolMap()
    const serverName = _toolToServer.get(toolName)
    if (!serverName) {
      return { statusCode: 404, body: { error: 'tool_not_found', tool: toolName } }
    }
    result = await _dispatchStdioTool(serverName, toolName, args)
  }

  audit.recordAuditRow({
    toolName,
    bearerFingerprint: bearerFp,
    args,
    result: result.body,
    statusCode: result.statusCode,
    durationMs: Date.now() - startedAt,
  }).catch(() => {})

  return result
}

// ── JSON-RPC method dispatcher ──────────────────────────────────────────
async function _handleSingle(router, parentReq, rpcBody) {
  const id = rpcBody.id
  const method = rpcBody.method
  const params = rpcBody.params || {}
  const isNotification = id === undefined

  try {
    if (method === 'initialize') {
      return rpcResult(id ?? null, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools:     { listChanged: false },
          prompts:   { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      })
    }

    if (method === 'notifications/initialized' || method === 'initialized') {
      return null
    }

    if (method === 'ping') {
      return rpcResult(id ?? null, {})
    }

    if (method === 'tools/list') {
      const tools = await _allToolsForList()
      return rpcResult(id ?? null, { tools })
    }

    if (method === 'prompts/list') {
      return rpcResult(id ?? null, { prompts: [] })
    }

    if (method === 'resources/list') {
      return rpcResult(id ?? null, { resources: [] })
    }

    if (method === 'tools/call') {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}

      if (!toolName || typeof toolName !== 'string') {
        return rpcError(id ?? null, RPC_ERR.INVALID_PARAMS, { reason: 'name (string) required' })
      }

      // Auth (only on tools/call, per MCP discovery-public spec)
      try {
        if (!parentReq.ecodiaFullScopes) {
          await _runEcodiaFullAuth(parentReq)
        }
      } catch (authErr) {
        if (authErr && authErr._authFail) {
          return rpcError(id ?? null, RPC_ERR.UNAUTHENTICATED, {
            reason: authErr._authBody?.error || 'unauthenticated',
            http_status: authErr._authStatus || 401,
          })
        }
        return rpcError(id ?? null, RPC_ERR.INTERNAL_ERROR, { error: authErr?.message || 'auth_error' })
      }

      const result = await dispatchToolCall(parentReq, toolName, toolArgs)
      const isError = result.statusCode >= 400
      const text = result.body == null
        ? ''
        : (typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
      return rpcResult(id ?? null, {
        content: [{ type: 'text', text }],
        isError,
        _meta: { http_status: result.statusCode, ...(isError ? { error_body: result.body } : {}) },
      })
    }

    if (isNotification) return null
    return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { method })
  } catch (err) {
    logger.error('ecodia-full-mcp-shim: handler error', {
      method, error: err.message, stack: err.stack,
    })
    if (isNotification) return null
    return rpcError(id ?? null, RPC_ERR.INTERNAL_ERROR, { error: err.message })
  }
}

async function handleMcpRequest(router, req, res) {
  const body = req.body
  if (body == null || typeof body !== 'object') {
    return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'body must be JSON object or array' }))
  }
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'empty batch' }))
    }
    const responses = []
    for (const envelope of body) {
      if (!envelope || typeof envelope !== 'object' || envelope.jsonrpc !== '2.0' || typeof envelope.method !== 'string') {
        responses.push(rpcError(envelope?.id ?? null, RPC_ERR.INVALID_REQUEST))
        continue
      }
      const out = await _handleSingle(router, req, envelope)
      if (out !== null) responses.push(out)
    }
    if (responses.length === 0) return res.status(204).end()
    return res.json(responses)
  }
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return res.status(400).json(rpcError(body.id ?? null, RPC_ERR.INVALID_REQUEST))
  }
  const out = await _handleSingle(router, req, body)
  if (out === null) return res.status(204).end()
  return res.json(out)
}

module.exports = {
  handleMcpRequest,
  dispatchToolCall,
  COWORK_INPROCESS_TOOLS,
  COWORK_TOOL_NAMES,
  PROTOCOL_VERSION,
  SERVER_INFO,
  _RPC_ERR: RPC_ERR,
}

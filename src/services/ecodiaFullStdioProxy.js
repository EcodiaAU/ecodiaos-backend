/**
 * ecodia-full MCP - long-lived stdio MCP child-process proxy.
 *
 * Spawns each of the 10 underlying stdio MCP servers (factory,
 * google-workspace, supabase, vps, business-tools, bookkeeping, crm,
 * scheduler, neo4j, sms) once and holds the JSON-RPC stdio pipe open.
 * Every tools/call into /api/mcp/ecodia-full for a tool that belongs
 * to one of these servers is forwarded over the held pipe.
 *
 * The stdio MCP servers implement the same JSON-RPC 2.0 envelope as the
 * HTTP MCP spec. We just pipe envelopes through. That means zero behaviour
 * drift between "this tool called inside a Claude Code CLI session" and
 * "this tool called via ecodia-full from a Routine / Custom Connector".
 *
 * Lifecycle:
 *   - lazy spawn on first request to a server (or eager via spawnAll())
 *   - keep warm; restart on child exit
 *   - crash-loop detect (3 restarts in 60s -> mark unhealthy, fail-fast
 *     subsequent calls with last_error until a manual reset)
 *   - graceful shutdown on SIGTERM (drain pending then SIGKILL after 5s)
 *
 * NOT supported in v1:
 *   - parallel multiplex per child (JSON-RPC over stdio is sequential per
 *     pipe). Concurrent calls to the same server queue. If a server
 *     becomes a bottleneck, spawn N children for that server.
 *
 * Authored: 15 May 2026 (Lane E).
 */
'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const logger = require('../config/logger')

const VPS_MCP_DIR = process.env.ECODIA_FULL_MCP_DIR || '/home/tate/ecodiaos/mcp-servers'

// The 10 live servers from .mcp.json plus visual-test (Phase 2 / 08).
// github + stripe were dead stubs, excluded per
// ECODIA_FULL_MCP_INVENTORY_2026-05-15.md.
const SERVERS = Object.freeze({
  factory:          { dir: 'factory',          start: 'start.sh' },
  'google-workspace': { dir: 'google-workspace', start: 'start.sh' },
  supabase:         { dir: 'supabase',         start: 'start.sh' },
  vps:              { dir: 'vps',              start: 'start.sh' },
  'business-tools': { dir: 'business-tools',   start: 'start.sh' },
  bookkeeping:      { dir: 'bookkeeping',      start: 'start.sh' },
  crm:              { dir: 'crm',              start: 'start.sh' },
  scheduler:        { dir: 'scheduler',        start: 'start.sh' },
  neo4j:            { dir: 'neo4j',            start: 'start.sh' },
  sms:              { dir: 'sms',              start: 'start.sh' },
  // visual-test child spawns over SSH into Corazon so the wrapped
  // laptop-hands stays reachable from VPS-side proxy callers.
  // Requires env VISUAL_TEST_MCP_VIA_SSH=1, VISUAL_TEST_MCP_SSH_HOST=tate@100.114.219.69,
  // HANDS_URL=http://100.114.219.69:7800, HANDS_SHARED_SECRET=<laptop-hands secret>
  // on the proxy host. Local-on-Corazon runs the local node binary instead.
  'visual-test':    { dir: 'visual-test',      start: 'start.sh' },
})

const CRASH_LOOP_WINDOW_MS = 60_000
const CRASH_LOOP_THRESHOLD = 3
const CHILD_INIT_TIMEOUT_MS = 20_000
const TOOL_CALL_TIMEOUT_MS = 90_000

const children = new Map() // serverName -> { proc, ready, queue, pending, restarts, unhealthy, lastError, toolsCache }
let nextRpcId = 1

function _newChildState() {
  return {
    proc: null,
    ready: false,
    initPromise: null,
    pending: new Map(), // rpcId -> { resolve, reject, timeout }
    restartTimestamps: [],
    unhealthy: false,
    lastError: null,
    toolsCache: null,
    buffer: '',
  }
}

function _serverStartCommand(serverName) {
  const cfg = SERVERS[serverName]
  if (!cfg) throw new Error(`unknown ecodia-full server: ${serverName}`)
  const startPath = path.join(VPS_MCP_DIR, cfg.dir, cfg.start)
  if (!fs.existsSync(startPath)) {
    throw new Error(`start script not found: ${startPath}`)
  }
  return startPath
}

function _attachReader(serverName, state) {
  const onData = (chunk) => {
    state.buffer += chunk.toString('utf8')
    let idx
    while ((idx = state.buffer.indexOf('\n')) !== -1) {
      const line = state.buffer.slice(0, idx).trim()
      state.buffer = state.buffer.slice(idx + 1)
      if (!line) continue
      let envelope
      try {
        envelope = JSON.parse(line)
      } catch (err) {
        logger.warn('ecodia-full stdio: non-JSON line from child', { server: serverName, line: line.slice(0, 200) })
        continue
      }
      // Notifications have no id. Ignore.
      if (envelope.id === undefined || envelope.id === null) continue
      const waiter = state.pending.get(envelope.id)
      if (!waiter) continue
      state.pending.delete(envelope.id)
      clearTimeout(waiter.timeout)
      if (envelope.error) {
        waiter.reject(Object.assign(new Error(envelope.error.message || 'jsonrpc_error'), {
          jsonrpc_error: envelope.error,
        }))
      } else {
        waiter.resolve(envelope.result)
      }
    }
  }
  state.proc.stdout.on('data', onData)
  state.proc.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim()
    if (text) logger.debug('ecodia-full stdio stderr', { server: serverName, line: text.slice(0, 500) })
  })
}

function _detachAndRejectPending(state, reasonErr) {
  for (const [id, waiter] of state.pending.entries()) {
    clearTimeout(waiter.timeout)
    waiter.reject(reasonErr)
    state.pending.delete(id)
  }
}

async function _spawnChild(serverName) {
  const startPath = _serverStartCommand(serverName)
  const state = children.get(serverName) || _newChildState()
  children.set(serverName, state)

  // Crash-loop guard
  const now = Date.now()
  state.restartTimestamps = state.restartTimestamps.filter(t => now - t < CRASH_LOOP_WINDOW_MS)
  if (state.restartTimestamps.length >= CRASH_LOOP_THRESHOLD) {
    state.unhealthy = true
    state.lastError = `crash_loop_detected: ${state.restartTimestamps.length} restarts in ${CRASH_LOOP_WINDOW_MS}ms`
    logger.error('ecodia-full stdio: crash loop, refusing further spawns', { server: serverName, restarts: state.restartTimestamps.length })
    throw new Error(state.lastError)
  }
  state.restartTimestamps.push(now)

  const proc = spawn('/bin/bash', [startPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: false,
  })
  state.proc = proc
  state.buffer = ''
  state.ready = false
  state.toolsCache = null

  _attachReader(serverName, state)

  proc.on('exit', (code, signal) => {
    logger.warn('ecodia-full stdio: child exited', { server: serverName, code, signal })
    state.ready = false
    state.proc = null
    _detachAndRejectPending(state, new Error(`child_exited: code=${code} signal=${signal}`))
    // Lazy respawn on next call. Don't auto-spawn here to avoid tight loops
    // when the failure cause is persistent (missing env var, bad token).
  })

  proc.on('error', (err) => {
    logger.error('ecodia-full stdio: child error', { server: serverName, error: err.message })
    state.lastError = err.message
  })

  // Initialize handshake: send `initialize` + `notifications/initialized`
  await _sendInitialize(serverName, state)
  state.ready = true
  state.unhealthy = false
  state.lastError = null
  return state
}

async function _sendInitialize(serverName, state) {
  const initId = nextRpcId++
  const initEnv = {
    jsonrpc: '2.0',
    id: initId,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'ecodia-full-proxy', version: '1.0.0' },
    },
  }
  const initResult = await _writeAndWait(state, initEnv, CHILD_INIT_TIMEOUT_MS, serverName)
  // notifications/initialized has no id and no response
  state.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  return initResult
}

function _writeAndWait(state, envelope, timeoutMs, serverName) {
  return new Promise((resolve, reject) => {
    if (!state.proc || !state.proc.stdin.writable) {
      return reject(new Error(`child_not_writable: ${serverName}`))
    }
    const timeout = setTimeout(() => {
      state.pending.delete(envelope.id)
      reject(new Error(`jsonrpc_timeout: ${envelope.method} on ${serverName} after ${timeoutMs}ms`))
    }, timeoutMs)
    state.pending.set(envelope.id, { resolve, reject, timeout })
    state.proc.stdin.write(JSON.stringify(envelope) + '\n')
  })
}

async function _ensureReady(serverName) {
  let state = children.get(serverName)
  if (state && state.unhealthy) {
    throw new Error(`server_unhealthy: ${serverName} (${state.lastError})`)
  }
  if (state && state.ready && state.proc && !state.proc.killed) return state
  if (state && state.initPromise) {
    await state.initPromise
    return children.get(serverName)
  }
  // Spawn (or respawn)
  const spawnPromise = _spawnChild(serverName)
  state = children.get(serverName)
  state.initPromise = spawnPromise
  try {
    await spawnPromise
  } finally {
    if (state) state.initPromise = null
  }
  return children.get(serverName)
}

async function listTools(serverName) {
  const state = await _ensureReady(serverName)
  if (state.toolsCache) return state.toolsCache
  const envelope = {
    jsonrpc: '2.0',
    id: nextRpcId++,
    method: 'tools/list',
    params: {},
  }
  const result = await _writeAndWait(state, envelope, TOOL_CALL_TIMEOUT_MS, serverName)
  state.toolsCache = result?.tools || []
  return state.toolsCache
}

async function callTool(serverName, toolName, args) {
  const state = await _ensureReady(serverName)
  const envelope = {
    jsonrpc: '2.0',
    id: nextRpcId++,
    method: 'tools/call',
    params: { name: toolName, arguments: args || {} },
  }
  return _writeAndWait(state, envelope, TOOL_CALL_TIMEOUT_MS, serverName)
}

async function listAllTools() {
  // Returns { serverName: [tool, ...], ... } - lazy spawns each child on first
  // invocation. Use sparingly (cold start ~5-10s for all 10).
  const all = {}
  for (const serverName of Object.keys(SERVERS)) {
    try {
      all[serverName] = await listTools(serverName)
    } catch (err) {
      all[serverName] = { error: err.message }
    }
  }
  return all
}

function healthSnapshot() {
  const snap = {}
  for (const [name, state] of children.entries()) {
    snap[name] = {
      ready: !!state.ready,
      unhealthy: !!state.unhealthy,
      restarts_recent: state.restartTimestamps.length,
      pending: state.pending.size,
      last_error: state.lastError,
      tools_cached: state.toolsCache ? state.toolsCache.length : null,
    }
  }
  for (const name of Object.keys(SERVERS)) {
    if (!snap[name]) snap[name] = { ready: false, unhealthy: false, spawned: false }
  }
  return snap
}

function shutdownAll() {
  for (const [name, state] of children.entries()) {
    if (state.proc && !state.proc.killed) {
      try { state.proc.kill('SIGTERM') } catch {}
    }
  }
}

// SIGTERM hookup for clean PM2 reload
if (!process.env.ECODIA_FULL_NO_SIGTERM_HOOK) {
  process.once('SIGTERM', shutdownAll)
  process.once('SIGINT', shutdownAll)
}

module.exports = {
  SERVERS,
  listTools,
  listAllTools,
  callTool,
  healthSnapshot,
  shutdownAll,
  // exposed for tests / introspection
  _children: children,
}

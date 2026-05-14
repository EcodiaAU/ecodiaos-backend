'use strict'

/**
 * mcpDiscovery — scans .mcp.json + src/mcp/* for available MCP servers.
 *
 * Used by forkService to expose a dynamic conductor MCP surface so that an
 * MCP server shipped by a factory self-modification session shows up to forks
 * on the next process restart without a hand-edit.
 *
 * Two surfaces are merged:
 *   1. `.mcp.json` (the canonical multi-tenant MCP config used by the SDK)
 *   2. `src/mcp/<name>/index.js` (in-process MCP servers wired by app.js)
 *
 * A denylist (`FORK_MCP_DENYLIST` env, comma-separated) excludes servers that
 * should never reach forks (cred-handling, secret-rotation, etc).
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 fork audit, §31.
 */

const fs = require('fs')
const path = require('path')
const logger = require('../config/logger')

const REPO_ROOT = process.env.OS_SESSION_CWD || '/home/tate/ecodiaos'
const DENYLIST = (process.env.FORK_MCP_DENYLIST || '')
  .split(',').map(s => s.trim()).filter(Boolean)

function _readMcpJson() {
  try {
    const p = path.join(REPO_ROOT, '.mcp.json')
    if (!fs.existsSync(p)) return {}
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return parsed.mcpServers || {}
  } catch (err) {
    logger.warn('mcpDiscovery: .mcp.json read failed', { error: err.message })
    return {}
  }
}

function _scanInProcessMcp() {
  try {
    const dir = path.join(REPO_ROOT, 'src', 'mcp')
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(name => {
        const sub = path.join(dir, name)
        try {
          return fs.statSync(sub).isDirectory()
            && fs.existsSync(path.join(sub, 'index.js'))
        } catch { return false }
      })
  } catch (err) {
    logger.warn('mcpDiscovery: src/mcp scan failed', { error: err.message })
    return []
  }
}

/**
 * Return the full universe of MCP server names available to this process.
 * Caller decides which subset to wire (e.g. forkService filters to a
 * conductor allow-list via FORK_CONDUCTOR_SERVERS env).
 */
function listAvailable() {
  const jsonNames = Object.keys(_readMcpJson())
  const inProc = _scanInProcessMcp()
  const set = new Set([...jsonNames, ...inProc])
  for (const d of DENYLIST) set.delete(d)
  return Array.from(set).sort()
}

/**
 * Snapshot for observability — what is wired vs. what is available.
 */
function diagnose() {
  const json = _readMcpJson()
  const inProc = _scanInProcessMcp()
  return {
    json_servers: Object.keys(json),
    in_process_servers: inProc,
    denied: DENYLIST,
    available: listAvailable(),
  }
}

module.exports = { listAvailable, diagnose, REPO_ROOT }

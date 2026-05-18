/**
 * ecodia-full MCP - HTTP MCP endpoint with wider bearer than cowork.
 *
 * Mount: /api/mcp/ecodia-full in src/app.js (after /api/mcp/cowork).
 * Auth:  bearer from kv_store.creds.ecodia_full_mcp_bearer via ecodiaFullAuth.
 *
 * Tool surface = (cowork V2 tools, re-exposed) UNION (10 stdio MCP servers
 * proxied as child processes via ecodiaFullStdioProxy). See
 * backend/docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md for the catalogue.
 *
 * Health probe: GET /_health (no auth) returns child-process state snapshot.
 * Tool registry: GET /_tools (auth required) lists every exposed tool.
 *
 * Spec: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §2.
 * Authored: 15 May 2026 (Lane E of VPS-to-local migration).
 */
'use strict'

const express = require('express')
const router = express.Router()
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { randomUUID } = require('node:crypto')

const execFileAsync = promisify(execFile)

const logger = require('../../config/logger')
const ecodiaFullAuth = require('../../middleware/ecodiaFullAuth')
const scope = require('../../services/ecodiaFullScope')
const audit = require('../../services/ecodiaFullAudit')
const stdio = require('../../services/ecodiaFullStdioProxy')
const mcpShim = require('./ecodiaFullMcpShim')

router.use(express.json({ limit: '4mb' }))

// Health (no auth) - safe diagnostic of stdio-child state
router.get('/_health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ecodia-full-mcp',
    version: 1,
    children: stdio.healthSnapshot(),
    mounted_at: new Date().toISOString(),
  })
})

// MCP JSON-RPC root - discovery handshake public (initialize / tools/list / etc).
// Auth on tools/call enforced inside the shim.
router.post('/', (req, res) => mcpShim.handleMcpRequest(router, req, res))

// All other endpoints require the wider bearer
router.use(ecodiaFullAuth)

// _tools - dump full registry
router.get('/_tools', async (req, res) => {
  try {
    const stdioTools = await stdio.listAllTools()
    res.json({
      cowork_inprocess: mcpShim.COWORK_INPROCESS_TOOLS.map(t => t.name),
      stdio_children: stdioTools,
      total_stdio: Object.values(stdioTools).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0),
    })
  } catch (err) {
    res.status(500).json({ error: 'tool_registry_failed', message: err.message })
  }
})

// vps.shell_exec - the high-risk tool, gated here rather than passed
// straight through to the vps stdio server. We want our own audit + denylist
// + rate cap + confirm-gate. The vps stdio server's own shell_exec is still
// callable via tools/call on the proxy if explicitly invoked, but the
// preferred path is this dedicated route which guards every call.
router.post('/shell_exec',
  scope.requireScope('write.vps.shell_exec'),
  async (req, res) => {
    const callId = randomUUID()
    const startedAt = Date.now()
    const command = req.body?.command
    const cwd = req.body?.cwd || '/home/tate'
    const timeoutMs = Math.min(Math.max(parseInt(req.body?.timeout, 10) || 30_000, 1000), 60_000)
    const requiresConfirmation = !!req.body?.requires_confirmation
    const bearerFp = req.ecodiaFullBearerFingerprint

    // Denylist
    const denyCheck = scope.shellCommandIsDenied(command)
    if (denyCheck.denied) {
      audit.recordShellAudit({
        callId, bearerFingerprint: bearerFp, command, cwd, denied: denyCheck,
        durationMs: 0,
      }).catch(() => {})
      audit.recordAuditRow({
        toolName: 'vps.shell_exec', bearerFingerprint: bearerFp,
        args: { command, cwd }, result: { denied: denyCheck.reason },
        statusCode: 403, durationMs: Date.now() - startedAt,
      }).catch(() => {})
      return res.status(403).json({ error: 'shell_exec_denied', message: denyCheck.reason, details: denyCheck })
    }

    // Rate cap
    const recent = await audit.shellExecRateCount()
    if (recent >= scope.RATE_CAPS.shell_exec_per_hour) {
      return res.status(429).json({
        error: 'rate_cap_exceeded',
        message: `shell_exec cap ${scope.RATE_CAPS.shell_exec_per_hour}/hour reached (current=${recent})`,
      })
    }

    // Confirm gate
    if (requiresConfirmation) {
      const gate = await audit.awaitConfirmation(callId, command, 60_000)
      if (gate.aborted) {
        audit.recordShellAudit({
          callId, bearerFingerprint: bearerFp, command, cwd,
          denied: { denied: true, reason: 'aborted_by_tate', by: gate.by },
          durationMs: Date.now() - startedAt,
        }).catch(() => {})
        return res.status(409).json({ error: 'aborted', message: 'shell_exec aborted via confirm gate' })
      }
    }

    // Execute
    try {
      const { stdout, stderr } = await execFileAsync('/bin/bash', ['-c', command], {
        cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, env: process.env,
      })
      const durationMs = Date.now() - startedAt
      const result = {
        call_id: callId,
        exit_code: 0,
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
        duration_ms: durationMs,
      }
      audit.recordShellAudit({
        callId, bearerFingerprint: bearerFp, command, cwd,
        exitCode: 0, stdout: result.stdout, stderr: result.stderr, durationMs,
      }).catch(() => {})
      audit.recordAuditRow({
        toolName: 'vps.shell_exec', bearerFingerprint: bearerFp,
        args: { command, cwd }, result: { exit_code: 0, stdout_len: result.stdout.length },
        statusCode: 200, durationMs,
      }).catch(() => {})
      return res.json(result)
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const exitCode = (err && typeof err.code === 'number') ? err.code : 1
      const stdout = err?.stdout ? String(err.stdout) : ''
      const stderr = err?.stderr ? String(err.stderr) : (err?.message || '')
      audit.recordShellAudit({
        callId, bearerFingerprint: bearerFp, command, cwd,
        exitCode, stdout, stderr, durationMs,
      }).catch(() => {})
      audit.recordAuditRow({
        toolName: 'vps.shell_exec', bearerFingerprint: bearerFp,
        args: { command, cwd }, result: { exit_code: exitCode, error: stderr.slice(0, 200) },
        statusCode: 500, durationMs,
      }).catch(() => {})
      return res.status(500).json({
        error: 'shell_exec_failed',
        call_id: callId,
        exit_code: exitCode,
        stdout, stderr, duration_ms: durationMs,
      })
    }
  }
)

// All non-shell-exec tool calls route through the MCP shim's tools/call path.
// This endpoint exists as a REST mirror for callers that don't speak JSON-RPC,
// using ?tool= or POST { tool, arguments } with a wildcard route catcher.
router.post('/tool', async (req, res) => {
  const toolName = req.body?.tool
  const args = req.body?.arguments || {}
  if (!toolName) return res.status(400).json({ error: 'missing_tool' })
  if (toolName === 'vps.shell_exec' || toolName === 'shell_exec') {
    return res.status(400).json({ error: 'use_dedicated_route', message: 'call POST /shell_exec for shell exec' })
  }
  try {
    const result = await mcpShim.dispatchToolCall(req, toolName, args)
    res.status(result.statusCode || 200).json(result.body)
  } catch (err) {
    res.status(500).json({ error: 'dispatch_failed', message: err.message })
  }
})

module.exports = router

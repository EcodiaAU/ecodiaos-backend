/**
 * Mount one domain-scoped MCP connector router.
 *
 * Usage:
 *   const router = mountConnector(connector)
 *   app.use('/api/mcp/' + connector.mountPath, router)
 *
 * Routes mounted per connector:
 *   GET  /_health    -> ok + tool count (no auth, safe diagnostic)
 *   GET  /_tools     -> full tool manifest (auth required)
 *   POST /           -> JSON-RPC root (initialize/list public, tools/call gated)
 *   POST /shell_exec -> ONLY mounted for ecodia-shell - denylist + rate cap +
 *                       confirm-gate + audit (parallel to ecodia-full's path)
 *
 * Spec: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md §10.2.
 * Authored: 15 May 2026.
 */
'use strict'

const express = require('express')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { randomUUID } = require('node:crypto')
const execFileAsync = promisify(execFile)

const logger = require('../../config/logger')
const makeConnectorAuth = require('../../middleware/connectorAuth')
const ecodiaFullScope = require('../../services/ecodiaFullScope')
const connectorAudit = require('../../services/connectorAudit')
const makeConnectorShim = require('./connectorMcpShim')

function mountConnector(connector) {
  if (!connector || !connector.name) throw new Error('mountConnector: connector required')
  const router = express.Router()
  router.use(express.json({ limit: '4mb' }))

  const auth = makeConnectorAuth(connector)
  const shim = makeConnectorShim(connector)

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

  // MCP JSON-RPC root - discovery (initialize / tools/list) public per MCP spec.
  // Auth on tools/call is enforced inside the shim by checking
  // req.connectorScopes; we attach those via a soft-auth pre-pass that
  // returns 200 + lets the shim do the per-method gating.
  router.post('/', async (req, res, next) => {
    // Soft auth: try to attach, but never fail discovery methods (they're
    // public). Real enforcement on tools/call happens in the shim path
    // after this middleware runs the full bearer check below.
    const method = req.body && req.body.method
    if (method === 'tools/call' || method === 'tools/describe') {
      return auth(req, res, async (err) => {
        if (err) return next(err)
        return shim.handleMcpRequest(req, res)
      })
    }
    return shim.handleMcpRequest(req, res)
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
    if (!connector.tools.includes(toolName)) {
      return res.status(403).json({
        error: 'scope_denied',
        message: `tool ${toolName} not exposed under ${connector.name}`,
        connector: connector.name,
      })
    }
    if (toolName === 'shell_exec' || toolName === 'vps.shell_exec') {
      return res.status(400).json({ error: 'use_dedicated_route', message: `POST /api/mcp/${connector.mountPath}/shell_exec` })
    }
    // Delegate to the JSON-RPC tools/call path inside the shim
    req.body = { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: toolName, arguments: args } }
    return shim.handleMcpRequest(req, res)
  })

  // shell_exec - only for ecodia-shell
  if (connector.name === 'ecodia-shell') {
    router.post('/shell_exec',
      ecodiaFullScope.requireScope('write.vps.shell_exec'),
      async (req, res) => {
        const callId = randomUUID()
        const startedAt = Date.now()
        const command = req.body?.command
        const cwd = req.body?.cwd || '/home/tate'
        const timeoutMs = Math.min(Math.max(parseInt(req.body?.timeout, 10) || 30_000, 1000), 60_000)
        const requiresConfirmation = !!req.body?.requires_confirmation
        const bearerFp = req.connectorBearerFingerprint

        const denyCheck = ecodiaFullScope.shellCommandIsDenied(command)
        if (denyCheck.denied) {
          connectorAudit.recordShellAudit({
            callId, bearerFingerprint: bearerFp, command, cwd, denied: denyCheck, durationMs: 0,
          }).catch(() => {})
          connectorAudit.recordConnectorAuditRow({
            connectorName: connector.name, toolName: 'vps.shell_exec',
            bearerFingerprint: bearerFp, args: { command, cwd },
            result: { denied: denyCheck.reason }, statusCode: 403,
            durationMs: Date.now() - startedAt, callId,
          }).catch(() => {})
          return res.status(403).json({ error: 'shell_exec_denied', message: denyCheck.reason, details: denyCheck })
        }

        const recent = await connectorAudit.shellExecRateCount()
        if (recent >= ecodiaFullScope.RATE_CAPS.shell_exec_per_hour) {
          return res.status(429).json({
            error: 'rate_cap_exceeded',
            message: `shell_exec cap ${ecodiaFullScope.RATE_CAPS.shell_exec_per_hour}/hour reached (current=${recent})`,
          })
        }

        if (requiresConfirmation) {
          const gate = await connectorAudit.awaitConfirmation(callId, command, 60_000)
          if (gate.aborted) {
            connectorAudit.recordShellAudit({
              callId, bearerFingerprint: bearerFp, command, cwd,
              denied: { denied: true, reason: 'aborted_by_tate', by: gate.by },
              durationMs: Date.now() - startedAt,
            }).catch(() => {})
            return res.status(409).json({ error: 'aborted', message: 'shell_exec aborted via confirm gate' })
          }
        }

        try {
          const { stdout, stderr } = await execFileAsync('/bin/bash', ['-c', command], {
            cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, env: process.env,
          })
          const durationMs = Date.now() - startedAt
          const result = {
            call_id: callId, exit_code: 0,
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : '',
            duration_ms: durationMs,
          }
          connectorAudit.recordShellAudit({
            callId, bearerFingerprint: bearerFp, command, cwd,
            exitCode: 0, stdout: result.stdout, stderr: result.stderr, durationMs,
          }).catch(() => {})
          connectorAudit.recordConnectorAuditRow({
            connectorName: connector.name, toolName: 'vps.shell_exec',
            bearerFingerprint: bearerFp, args: { command, cwd },
            result: { exit_code: 0, stdout_len: result.stdout.length },
            statusCode: 200, durationMs, callId,
          }).catch(() => {})
          return res.json(result)
        } catch (err) {
          const durationMs = Date.now() - startedAt
          const exitCode = (err && typeof err.code === 'number') ? err.code : 1
          const stdout = err?.stdout ? String(err.stdout) : ''
          const stderr = err?.stderr ? String(err.stderr) : (err?.message || '')
          connectorAudit.recordShellAudit({
            callId, bearerFingerprint: bearerFp, command, cwd,
            exitCode, stdout, stderr, durationMs,
          }).catch(() => {})
          connectorAudit.recordConnectorAuditRow({
            connectorName: connector.name, toolName: 'vps.shell_exec',
            bearerFingerprint: bearerFp, args: { command, cwd },
            result: { exit_code: exitCode, error: stderr.slice(0, 200) },
            statusCode: 500, durationMs, callId,
          }).catch(() => {})
          return res.status(500).json({
            error: 'shell_exec_failed', call_id: callId, exit_code: exitCode,
            stdout, stderr, duration_ms: durationMs,
          })
        }
      }
    )
  }

  return router
}

module.exports = mountConnector

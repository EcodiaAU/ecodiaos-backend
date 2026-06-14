/**
 * Domain-scoped MCP connectors - audit log.
 *
 * Mirrors ecodiaFullAudit but tags every row with the connector name so the
 * audit table can answer "which connector hit which tool". Per-connector
 * kv_store mirror also lands at:
 *   kv_store.cowork.mcp_audit.<connector_name>.<ts>.<callId>
 *
 * The existing ecodia_full_audit_log table is reused (no new table needed):
 * tool_name receives the bare tool name; connector_name is encoded in the
 * args jsonb under _connector. recordAuditRow's signature is unchanged so
 * downstream consumers keep working.
 *
 * Spec: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md §10.2.
 * Authored: 15 May 2026.
 */
'use strict'

const db = require('../config/db')
const logger = require('../config/logger')
const baseAudit = require('./ecodiaFullAudit')

function _redactArgs(toolName, args) {
  if (!args || typeof args !== 'object') return args
  const out = { ...args }
  if (toolName === 'gmail.send' || toolName === 'gmail_send') {
    if (out.body) out.body = `[redacted len=${String(out.body).length}]`
  }
  if (toolName === 'kv_store.set') {
    if (out.value !== undefined) {
      const v = typeof out.value === 'string' ? out.value : JSON.stringify(out.value)
      out.value = `[redacted len=${v.length}]`
    }
  }
  if (toolName === 'sms.tate' || toolName === 'send_sms') {
    if (out.message) out.message = `[redacted len=${String(out.message).length}]`
  }
  return out
}

function _summariseResult(result) {
  if (result == null) return 'null'
  try {
    const s = typeof result === 'string' ? result : JSON.stringify(result)
    return s.length > 500 ? s.slice(0, 500) + '...' : s
  } catch {
    return 'unserialisable'
  }
}

async function recordConnectorAuditRow({ connectorName, toolName, bearerFingerprint, args, result, statusCode, durationMs, callId }) {
  // 1. Tagged row in the ecodia_full_audit_log table
  try {
    const taggedArgs = { _connector: connectorName, ..._redactArgs(toolName, args || {}) }
    await db`
      INSERT INTO ecodia_full_audit_log (
        tool_name, bearer_fingerprint, args, result_summary, status_code, duration_ms, occurred_at
      ) VALUES (
        ${toolName},
        ${bearerFingerprint},
        ${JSON.stringify(taggedArgs)}::jsonb,
        ${_summariseResult(result)},
        ${statusCode || 200},
        ${durationMs || 0},
        now()
      )
    `
  } catch (err) {
    logger.warn('connector-audit: row insert failed', { error: err.message, connectorName, toolName })
  }
  // 2. Per-connector kv mirror for fast at-a-glance triage.
  //
  // BOUNDED by design (fixed 2026-06-14, kv-store-hygiene cron): the canonical,
  // queryable audit history lives in the ecodia_full_audit_log TABLE above. This
  // kv mirror only answers "what did connector X last do" at a glance, so it is a
  // ROLLING latest-call-per-connector key that overwrites in place. The earlier
  // design embedded the timestamp + callId in the key, so ON CONFLICT never fired
  // and every call appended a new row; that leaked 5350 never-read keys (~7 MB,
  // 81% of kv_store) before this fix. kv_store is ephemeral state, not a log sink:
  // unbounded append-only history belongs in a table, never in kv_store.
  // Doctrine: patterns/kv-store-is-ephemeral-state-not-an-append-only-log-2026-06-14.md
  try {
    const ts = new Date().toISOString()
    const key = `cowork.mcp_audit_last.${connectorName}`
    const payload = {
      ts, connector: connectorName, tool: toolName,
      bearer_fingerprint: bearerFingerprint,
      status_code: statusCode || 200,
      duration_ms: durationMs || 0,
      call_id: callId || null,
      args: _redactArgs(toolName, args || {}),
      result_summary: _summariseResult(result),
    }
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(payload)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('connector-audit: kv mirror failed', { error: err.message, connectorName, toolName })
  }
}

module.exports = {
  recordConnectorAuditRow,
  // Re-export shell audit hooks since ecodia-shell uses them unchanged
  recordShellAudit: baseAudit.recordShellAudit,
  shellExecRateCount: baseAudit.shellExecRateCount,
  awaitConfirmation: baseAudit.awaitConfirmation,
}

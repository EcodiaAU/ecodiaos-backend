/**
 * ecodia-full MCP - audit log + shell-exec gate.
 *
 * Every tools/call into /api/mcp/ecodia-full lands an audit row in
 * ecodia_full_audit_log (mirrors cowork_audit_log shape). vps.shell_exec
 * additionally writes to kv_store.ecodia_full.shell_audit.<ts>.<fingerprint>
 * with full command + truncated stdout/stderr + exit code.
 *
 * Confirm-gate: when args include `requires_confirmation: true`, the call
 * inserts a status_board row of entity_type=infrastructure name='shell_exec pending confirmation'
 * and polls kv_store.cowork.shell_abort.<call_id> for 60s. If the abort key
 * appears, the call returns aborted; otherwise proceeds.
 *
 * Authored: 15 May 2026 (Lane E).
 */
'use strict'

const db = require('../config/db')
const logger = require('../config/logger')
const scope = require('./ecodiaFullScope')

async function recordAuditRow({ toolName, bearerFingerprint, args, result, statusCode, durationMs }) {
  try {
    await db`
      INSERT INTO ecodia_full_audit_log (
        tool_name, bearer_fingerprint, args, result_summary, status_code, duration_ms, occurred_at
      ) VALUES (
        ${toolName},
        ${bearerFingerprint},
        ${JSON.stringify(_redactArgs(toolName, args))}::jsonb,
        ${_summariseResult(result)},
        ${statusCode || 200},
        ${durationMs || 0},
        now()
      )
    `
  } catch (err) {
    logger.warn('ecodia-full audit: row insert failed', { error: err.message, toolName })
  }
}

function _redactArgs(toolName, args) {
  if (!args || typeof args !== 'object') return args
  // Strip likely-secret payloads. The list mirrors what we exclude from
  // cowork audit: full gmail body, full sms message body if urgency!=critical
  // (we still want crit msgs in audit), full kv_store value contents on writes.
  const out = { ...args }
  if (toolName === 'gmail.send' || toolName === 'gmail_send') {
    if (out.body) out.body = `[redacted len=${out.body.length}]`
  }
  if (toolName === 'kv_store.set') {
    if (out.value !== undefined) {
      const v = typeof out.value === 'string' ? out.value : JSON.stringify(out.value)
      out.value = `[redacted len=${v.length}]`
    }
  }
  if (toolName === 'sms.tate' || toolName === 'send_sms') {
    if (out.message) out.message = `[redacted len=${out.message.length}]`
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

async function recordShellAudit({ callId, bearerFingerprint, command, cwd, exitCode, stdout, stderr, durationMs, denied }) {
  const key = `ecodia_full.shell_audit.${new Date().toISOString()}.${bearerFingerprint || 'anon'}.${callId}`
  const payload = {
    ts: new Date().toISOString(),
    call_id: callId,
    bearer_fingerprint: bearerFingerprint,
    command,
    cwd,
    exit_code: exitCode,
    stdout_first_2k: typeof stdout === 'string' ? stdout.slice(0, 2000) : null,
    stderr_first_2k: typeof stderr === 'string' ? stderr.slice(0, 2000) : null,
    duration_ms: durationMs,
    denied: denied || null,
  }
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(payload)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('ecodia-full shell audit: insert failed', { error: err.message, callId })
  }
}

async function shellExecRateCount() {
  try {
    const [row] = await db`
      SELECT count(*)::int AS n
      FROM ecodia_full_audit_log
      WHERE tool_name IN ('vps.shell_exec', 'shell_exec')
        AND occurred_at > now() - interval '1 hour'
    `
    return row?.n || 0
  } catch {
    return 0
  }
}

async function awaitConfirmation(callId, command, timeoutMs = 60_000) {
  // Insert pending status_board row
  const sbName = `shell_exec pending confirmation ${callId}`
  try {
    await db`
      INSERT INTO status_board (
        entity_type, name, status, next_action, next_action_by,
        priority, context, last_touched, created_at
      ) VALUES (
        'infrastructure',
        ${sbName},
        'pending',
        ${'awaiting abort or auto-execute in 60s: ' + command.slice(0, 200)},
        'tate',
        1,
        ${JSON.stringify({ call_id: callId, command, gate: 'shell_exec_confirm' })},
        now(),
        now()
      )
      ON CONFLICT DO NOTHING
    `
  } catch (err) {
    logger.warn('ecodia-full: confirm-gate status_board insert failed', { error: err.message })
  }

  // Poll abort key
  const abortKey = `cowork.shell_abort.${callId}`
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const [row] = await db`SELECT value FROM kv_store WHERE key = ${abortKey}`
      if (row) {
        await db`UPDATE status_board SET status = 'aborted', last_touched = now() WHERE name = ${sbName}`
        return { aborted: true, by: row.value }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }

  // Mark proceed
  try {
    await db`UPDATE status_board SET status = 'proceeded', last_touched = now() WHERE name = ${sbName}`
  } catch {}
  return { aborted: false }
}

module.exports = {
  recordAuditRow,
  recordShellAudit,
  shellExecRateCount,
  awaitConfirmation,
}

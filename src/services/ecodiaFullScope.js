/**
 * ecodia-full MCP - scope constants, allowlists, requireScope helper.
 *
 * Parallel to coworkScope. The ecodia-full bearer carries a wider scope
 * array that includes everything the cowork bearer can do PLUS Factory
 * dispatch, full Gmail/Drive/Calendar/Contacts via google-workspace stdio,
 * full Bookkeeping + CRM + Scheduler control, Supabase DB+Storage direct,
 * Business-Tools (Vercel/Zernio/LinkedIn/Meta/Xero), wider Neo4j graph
 * writes, wider SMS+voice, and vps.shell_exec + pm2 control.
 *
 * Per `shell-exec` is the highest-risk surface and is gated by:
 *   1. `write.vps.shell_exec` scope (presence-checked here)
 *   2. Denylist of catastrophic commands (enforced in the route handler)
 *   3. Per-call audit log to kv_store.ecodia_full.shell_audit.*
 *   4. Rate cap 60/hour per bearer fingerprint
 *   5. Optional confirm-gate per call (status_board + 60s abort window)
 *
 * Spec: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §2 + §6.
 *       backend/docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md
 * Authored: 15 May 2026 (Lane E).
 */
'use strict'

// All cowork scopes are included in ecodia-full (additive design)
const COWORK_SCOPES = [
  'read.status_board',
  'read.kv_store',
  'read.neo4j',
  'read.patterns',
  'read.email_threads',
  'read.crm',
  'read.forks',
  'read.cowork.inbox',
  'read.scheduler.list',
  'write.status_board.cowork_owned',
  'write.kv_store.cowork_namespace',
  'write.neo4j.episode',
  'write.neo4j.decision',
  'write.forks.cowork_pool',
  'write.os_session.message',
  'write.cowork.session_log',
  'write.cowork.heartbeat',
  'write.gmail.send',
  'write.sms.tate',
  'write.scheduler.cron',
]

const ECODIA_FULL_NEW_SCOPES = [
  // Factory dispatch + approve
  'read.factory.session',
  'write.factory.dispatch',
  'write.factory.approve',
  'write.factory.reject',
  'write.factory.resume',
  // Google Workspace - full (not just code@/tate@)
  'write.gmail.send.any',
  'write.gmail.draft',
  'write.gmail.modify',
  'read.gmail.full',
  'write.drive',
  'read.drive',
  'write.calendar',
  'read.calendar',
  'write.contacts',
  'read.contacts',
  // Bookkeeping - full GL access
  'read.bookkeeping',
  'write.bookkeeping.post',
  'write.bookkeeping.rules',
  'write.bookkeeping.staged',
  'read.bookkeeping.reports', // BAS, GST, P&L, balance sheet
  // CRM - full write
  'read.crm.full',
  'write.crm.client',
  'write.crm.project',
  'write.crm.task',
  'write.crm.note',
  // Scheduler - full lifecycle (delete + pause)
  'write.scheduler.delete',
  'write.scheduler.pause',
  'write.scheduler.delayed',
  'write.scheduler.chain',
  'write.scheduler.run_now',
  // Supabase - direct DB and storage
  'read.supabase.db',
  'write.supabase.db',
  'read.supabase.storage',
  'write.supabase.storage',
  // Business tools
  'read.business_tools.vercel',
  'write.business_tools.vercel',
  'read.business_tools.zernio',
  'write.business_tools.zernio',
  'write.business_tools.linkedin',
  'write.business_tools.meta',
  'read.business_tools.xero',
  // Neo4j - wider graph writes
  'write.neo4j.graph',
  // SMS / voice
  'write.sms.any',
  'write.sms.voice',
  'read.sms',
  // VPS - shell + pm2 (CRITICAL)
  'write.vps.shell_exec',
  'write.vps.pm2',
  'read.vps.pm2',
]

const SCOPES = Object.freeze([...COWORK_SCOPES, ...ECODIA_FULL_NEW_SCOPES])

// kv_store write namespaces - widened beyond cowork.* to include
// ecodia_full.* and ecodia.* root namespaces.
const KV_WRITE_NAMESPACES = Object.freeze([
  'cowork.',
  'cowork-session.',
  'ecodia_full.',
  'ecodia.',
])

const KV_WRITE_ALLOWLIST = Object.freeze([])

// creds.* still deny-read - the bearer should never be able to read its own
// bearer row or any other credential.
const KV_READ_DENY_PREFIXES = Object.freeze([
  'creds.',
])

// status_board: ecodia-full CAN update entity_type=infrastructure
// (which cowork could not). legal is still denied as a policy gate.
const STATUS_BOARD_DENIED_UPDATE_TYPES = Object.freeze([
  'legal',
])

const NEO4J_EPISODE_TYPES = Object.freeze([
  'cowork_dispatch',
  'cowork_realisation',
  'cowork_audit',
  'conductor_observed',
  'ecodia_full_dispatch',
  'ecodia_full_realisation',
  'ecodia_full_audit',
])

// Higher rate caps for the wider bearer. shell_exec gets its own dedicated cap.
const RATE_CAPS = Object.freeze({
  os_session_message_per_hour: 30,
  forks_spawn_per_day:         100,
  status_board_upsert_per_day: 500,
  gmail_send_per_day:          200,
  sms_any_per_day:             50,
  scheduler_create_per_day:    100,
  shell_exec_per_hour:         60,
  factory_dispatch_per_day:    100,
})

// Catastrophic-command denylist for vps.shell_exec. Tested as substring +
// regex match before exec. If any pattern matches, the call returns 403.
const SHELL_EXEC_DENYLIST = Object.freeze([
  // root rm
  /^\s*rm\s+-r[f]?\s+\/(?:\s|$)/,
  /^\s*rm\s+-r[f]?\s+\/\*/,
  // mkfs
  /\bmkfs(\.\w+)?\b/,
  // dd of=/dev/
  /\bdd\s+.*\bof=\/dev\//,
  // fork bomb
  /:\(\)\{:\|:&\};:/,
  // chmod 777 root
  /^\s*chmod\s+777\s+\/\s*$/,
  /^\s*chmod\s+-R\s+777\s+\/\s*$/,
  // raw shell pipe from net (curl | bash, wget | sh)
  /\b(curl|wget)\s+[^|]+\|\s*(bash|sh|zsh)\b/,
  // overwrite block device
  />\s*\/dev\/sd[a-z]/,
  /\bdd\s+.*\bof=\/dev\/sd/,
  // userdel root
  /^\s*userdel\s+.*\btate\b/,
  /^\s*userdel\s+.*\broot\b/,
  // shutdown / reboot - safer to schedule via pm2_restart
  /^\s*(shutdown|reboot|halt|poweroff)(\s|$)/,
])

function requireScope(scope) {
  if (!SCOPES.includes(scope)) {
    throw new Error(`requireScope: unknown ecodia-full scope ${scope}`)
  }
  return (req, res, next) => {
    if (!Array.isArray(req.ecodiaFullScopes) || !req.ecodiaFullScopes.includes(scope)) {
      return res.status(403).json({
        error: 'scope_denied',
        message: `requires ${scope}`,
        details: { required: scope, granted: req.ecodiaFullScopes || [] },
      })
    }
    next()
  }
}

function kvKeyIsWritable(key) {
  if (typeof key !== 'string' || !key) return false
  if (KV_WRITE_NAMESPACES.some(prefix => key.startsWith(prefix))) return true
  if (KV_WRITE_ALLOWLIST.includes(key)) return true
  return false
}

function kvKeyIsReadable(key) {
  if (typeof key !== 'string' || !key) return false
  if (KV_READ_DENY_PREFIXES.some(prefix => key.startsWith(prefix))) return false
  return true
}

function statusBoardEntityTypeIsUpdatable(entityType) {
  if (!entityType) return true
  return !STATUS_BOARD_DENIED_UPDATE_TYPES.includes(entityType)
}

function shellCommandIsDenied(command) {
  if (typeof command !== 'string' || !command) return { denied: true, reason: 'empty_command' }
  for (const pattern of SHELL_EXEC_DENYLIST) {
    if (pattern.test(command)) {
      return { denied: true, reason: 'matched_denylist', pattern: pattern.toString() }
    }
  }
  return { denied: false }
}

module.exports = {
  SCOPES,
  COWORK_SCOPES,
  ECODIA_FULL_NEW_SCOPES,
  KV_WRITE_NAMESPACES,
  KV_WRITE_ALLOWLIST,
  KV_READ_DENY_PREFIXES,
  STATUS_BOARD_DENIED_UPDATE_TYPES,
  NEO4J_EPISODE_TYPES,
  RATE_CAPS,
  SHELL_EXEC_DENYLIST,
  requireScope,
  kvKeyIsWritable,
  kvKeyIsReadable,
  statusBoardEntityTypeIsUpdatable,
  shellCommandIsDenied,
}

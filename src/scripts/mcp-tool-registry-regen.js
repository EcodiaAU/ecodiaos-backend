#!/usr/bin/env node
/**
 * mcp-tool-registry-regen.js
 *
 * Introspects the ecodia-full MCP route handler + the 10 stdio child servers
 * and writes a JSON registry to kv_store.cowork.mcp_tool_registry. Sources:
 *   - coworkMcpShim.TOOLS (22 in-process tools)
 *   - ecodiaFullStdioProxy.listAllTools() (each child's tools/list)
 *
 * Registry shape:
 *   {
 *     generated_at: ISO,
 *     total: N,
 *     tools: [
 *       { name, source, required_scopes, audit_category, rate_cap }
 *     ]
 *   }
 *
 * Run manually: node src/scripts/mcp-tool-registry-regen.js
 * Cron: hook into nightly-restart's pre-restart phase, or a daily Routine.
 *
 * Authored: 15 May 2026 (Lane E of VPS-to-local migration).
 */
'use strict'

const path = require('node:path')
process.chdir(path.resolve(__dirname, '../..'))

const db = require('../config/db')
const logger = require('../config/logger')
const coworkShim = require('../routes/mcp/coworkMcpShim')
const stdio = require('../services/ecodiaFullStdioProxy')
const scope = require('../services/ecodiaFullScope')

// Heuristic scope mapping. Source of truth is the route handler itself;
// this lookup table is a snapshot for the registry. If a tool's scope is
// not listed here, it falls back to 'unknown' which surfaces in audits.
const COWORK_SCOPE_MAP = {
  'status_board.query': 'read.status_board',
  'status_board.upsert': 'write.status_board.cowork_owned',
  'kv_store.get': 'read.kv_store',
  'kv_store.set': 'write.kv_store.cowork_namespace',
  'neo4j.search': 'read.neo4j',
  'neo4j.write_episode': 'write.neo4j.episode',
  'neo4j.write_decision': 'write.neo4j.decision',
  'email_threads.query': 'read.email_threads',
  'crm.read': 'read.crm',
  'forks.list': 'read.forks',
  'forks.spawn': 'write.forks.cowork_pool',
  'forks.abort': 'write.forks.cowork_pool',
  'cowork.session_started': 'write.cowork.session_log',
  'cowork.session_ended': 'write.cowork.session_log',
  'cowork.heartbeat': 'write.cowork.heartbeat',
  'inbox.read': 'read.cowork.inbox',
  'gmail.send': 'write.gmail.send',
  'sms.tate': 'write.sms.tate',
  'scheduler.cron': 'write.scheduler.cron',
  'scheduler.delayed': 'write.scheduler.cron',
  'scheduler.list': 'read.scheduler.list',
  'graph_semantic_search': 'read.neo4j',
}

const STDIO_SCOPE_MAP = {
  // factory
  start_cc_session: 'write.factory.dispatch',
  send_cc_message: 'write.factory.dispatch',
  resume_cc_session: 'write.factory.resume',
  approve_factory_deploy: 'write.factory.approve',
  reject_factory_session: 'write.factory.reject',
  review_factory_session: 'read.factory.session',
  get_factory_status: 'read.factory.session',
  get_session_progress: 'read.factory.session',
  get_cc_session_details: 'read.factory.session',
  list_codebases: 'read.factory.session',
  // google-workspace
  gmail_send: 'write.gmail.send.any',
  gmail_reply: 'write.gmail.send.any',
  gmail_create_draft: 'write.gmail.draft',
  gmail_modify_labels: 'write.gmail.modify',
  gmail_mark_read: 'write.gmail.modify',
  gmail_archive: 'write.gmail.modify',
  gmail_trash: 'write.gmail.modify',
  gmail_list_messages: 'read.gmail.full',
  gmail_get_message: 'read.gmail.full',
  gmail_get_thread: 'read.gmail.full',
  gmail_list_labels: 'read.gmail.full',
  gmail_create_label: 'write.gmail.modify',
  drive_search: 'read.drive',
  drive_list_folder: 'read.drive',
  drive_get_file: 'read.drive',
  drive_read_sheet: 'read.drive',
  drive_create_folder: 'write.drive',
  drive_create_doc: 'write.drive',
  drive_create_sheet: 'write.drive',
  drive_update_doc: 'write.drive',
  drive_update_sheet: 'write.drive',
  drive_append_sheet: 'write.drive',
  drive_move_file: 'write.drive',
  drive_delete_file: 'write.drive',
  drive_share_file: 'write.drive',
  calendar_create_event: 'write.calendar',
  calendar_update_event: 'write.calendar',
  calendar_delete_event: 'write.calendar',
  calendar_list_events: 'read.calendar',
  calendar_get_event: 'read.calendar',
  contacts_list: 'read.contacts',
  contacts_search: 'read.contacts',
  contacts_create: 'write.contacts',
  contacts_update: 'write.contacts',
  // supabase
  db_query: 'read.supabase.db',
  db_list_tables: 'read.supabase.db',
  db_describe_table: 'read.supabase.db',
  db_execute: 'write.supabase.db',
  storage_list: 'read.supabase.storage',
  storage_get_url: 'read.supabase.storage',
  storage_upload: 'write.supabase.storage',
  storage_delete: 'write.supabase.storage',
  // vps
  shell_exec: 'write.vps.shell_exec',
  pm2_list: 'read.vps.pm2',
  pm2_logs: 'read.vps.pm2',
  pm2_restart: 'write.vps.pm2',
  // business-tools
  vercel_list_projects: 'read.business_tools.vercel',
  vercel_list_deployments: 'read.business_tools.vercel',
  vercel_get_deployment: 'read.business_tools.vercel',
  vercel_trigger_deploy: 'write.business_tools.vercel',
  zernio_list_accounts: 'read.business_tools.zernio',
  zernio_list_posts: 'read.business_tools.zernio',
  zernio_get_post: 'read.business_tools.zernio',
  zernio_get_analytics: 'read.business_tools.zernio',
  zernio_get_comments: 'read.business_tools.zernio',
  zernio_get_conversations: 'read.business_tools.zernio',
  zernio_get_upload_url: 'read.business_tools.zernio',
  zernio_best_time_to_post: 'read.business_tools.zernio',
  zernio_create_post: 'write.business_tools.zernio',
  zernio_delete_post: 'write.business_tools.zernio',
  zernio_reply_comment: 'write.business_tools.zernio',
  zernio_send_message: 'write.business_tools.zernio',
  xero_get_contacts: 'read.business_tools.xero',
  xero_get_invoices: 'read.business_tools.xero',
  xero_get_transactions: 'read.business_tools.xero',
  xero_categorize: 'write.bookkeeping.post',
  linkedin_create_post: 'write.business_tools.linkedin',
  linkedin_send_dm: 'write.business_tools.linkedin',
  linkedin_get_posts: 'read.business_tools.vercel',
  linkedin_check_dms: 'read.business_tools.vercel',
  meta_list_pages: 'read.business_tools.vercel',
  meta_get_conversations: 'read.business_tools.vercel',
  meta_create_post: 'write.business_tools.meta',
  meta_send_message: 'write.business_tools.meta',
  // bookkeeping
  bk_post_transaction: 'write.bookkeeping.post',
  bk_batch_post: 'write.bookkeeping.post',
  bk_categorize: 'write.bookkeeping.post',
  bk_auto_categorize: 'write.bookkeeping.post',
  bk_create_rule: 'write.bookkeeping.rules',
  bk_delete_rule: 'write.bookkeeping.rules',
  bk_list_rules: 'read.bookkeeping',
  bk_list_staged: 'write.bookkeeping.staged',
  bk_staged_counts: 'read.bookkeeping',
  bk_discard: 'write.bookkeeping.staged',
  bk_ledger: 'read.bookkeeping',
  bk_list_accounts: 'read.bookkeeping',
  bk_trial_balance: 'read.bookkeeping.reports',
  bk_balance_sheet: 'read.bookkeeping.reports',
  bk_pnl: 'read.bookkeeping.reports',
  bk_cash_flow: 'read.bookkeeping.reports',
  bk_bas: 'read.bookkeeping.reports',
  bk_gst_position: 'read.bookkeeping.reports',
  bk_director_loan_balance: 'read.bookkeeping.reports',
  // crm
  crm_create_client: 'write.crm.client',
  crm_list_clients: 'read.crm.full',
  crm_search_clients: 'read.crm.full',
  crm_get_client: 'read.crm.full',
  crm_update_stage: 'write.crm.client',
  crm_create_project: 'write.crm.project',
  crm_get_projects: 'read.crm.full',
  crm_get_tasks: 'read.crm.full',
  crm_complete_task: 'write.crm.task',
  crm_add_contact: 'write.crm.client',
  crm_get_contacts: 'read.crm.full',
  crm_add_note: 'write.crm.note',
  crm_get_timeline: 'read.crm.full',
  crm_get_intelligence: 'read.crm.full',
  crm_dashboard: 'read.crm.full',
  crm_pipeline: 'read.crm.full',
  crm_revenue: 'read.crm.full',
  // scheduler
  schedule_cron: 'write.scheduler.cron',
  schedule_delayed: 'write.scheduler.delayed',
  schedule_chain: 'write.scheduler.chain',
  schedule_list: 'read.scheduler.list',
  schedule_run_now: 'write.scheduler.run_now',
  schedule_pause: 'write.scheduler.pause',
  schedule_resume: 'write.scheduler.pause',
  schedule_cancel: 'write.scheduler.delete',
  // neo4j
  graph_search: 'read.neo4j',
  graph_query: 'read.neo4j',
  graph_context: 'read.neo4j',
  graph_schema: 'read.neo4j',
  graph_create_node: 'write.neo4j.graph',
  graph_merge_node: 'write.neo4j.graph',
  graph_create_relationship: 'write.neo4j.graph',
  graph_reflect: 'write.neo4j.graph',
  graph_replay_buffer: 'write.neo4j.graph',
  // sms
  send_sms: 'write.sms.any',
  make_call: 'write.sms.voice',
  list_messages: 'read.sms',
  list_calls: 'read.sms',
}

const RATE_CAPS_BY_SCOPE = {
  'write.vps.shell_exec': { window: 'hour', cap: scope.RATE_CAPS.shell_exec_per_hour },
  'write.factory.dispatch': { window: 'day', cap: scope.RATE_CAPS.factory_dispatch_per_day },
  'write.scheduler.cron': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.scheduler.delayed': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.scheduler.chain': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.scheduler.delete': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.scheduler.pause': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.scheduler.run_now': { window: 'day', cap: scope.RATE_CAPS.scheduler_create_per_day },
  'write.gmail.send': { window: 'day', cap: scope.RATE_CAPS.gmail_send_per_day },
  'write.gmail.send.any': { window: 'day', cap: scope.RATE_CAPS.gmail_send_per_day },
  'write.sms.tate': { window: 'day', cap: 3 },
  'write.sms.any': { window: 'day', cap: scope.RATE_CAPS.sms_any_per_day },
  'write.status_board.cowork_owned': { window: 'day', cap: scope.RATE_CAPS.status_board_upsert_per_day },
  'write.forks.cowork_pool': { window: 'day', cap: scope.RATE_CAPS.forks_spawn_per_day },
  'write.os_session.message': { window: 'hour', cap: scope.RATE_CAPS.os_session_message_per_hour },
}

function _auditCategory(toolName) {
  if (toolName === 'shell_exec' || toolName === 'vps.shell_exec') return 'shell_exec'
  if (toolName.startsWith('bk_') || toolName.startsWith('xero_')) return 'financial'
  if (toolName.startsWith('gmail_') || toolName === 'gmail.send') return 'comms_email'
  if (toolName === 'send_sms' || toolName === 'sms.tate' || toolName === 'make_call') return 'comms_sms_voice'
  if (toolName.startsWith('factory') || toolName.includes('cc_session') || toolName.includes('factory_')) return 'factory'
  if (toolName.startsWith('crm_')) return 'crm'
  if (toolName.startsWith('graph_') || toolName === 'neo4j.search') return 'knowledge_graph'
  if (toolName.startsWith('schedule_') || toolName.startsWith('scheduler.')) return 'scheduler'
  if (toolName.startsWith('vercel_') || toolName.startsWith('zernio_') || toolName.startsWith('linkedin_') || toolName.startsWith('meta_')) return 'business_tools'
  if (toolName.startsWith('db_') || toolName.startsWith('storage_')) return 'supabase'
  if (toolName.startsWith('drive_') || toolName.startsWith('calendar_') || toolName.startsWith('contacts_')) return 'google_workspace'
  if (toolName === 'pm2_list' || toolName === 'pm2_logs' || toolName === 'pm2_restart') return 'vps_pm2'
  if (toolName === 'kv_store.get' || toolName === 'kv_store.set') return 'kv_store'
  if (toolName === 'status_board.query' || toolName === 'status_board.upsert') return 'status_board'
  return 'other'
}

async function buildRegistry() {
  const tools = []

  // 1. Cowork in-process tools
  for (const t of coworkShim.TOOLS) {
    const requiredScope = COWORK_SCOPE_MAP[t.name] || 'unknown'
    tools.push({
      name: t.name,
      source: 'cowork_inprocess',
      description: t.description,
      input_schema: t.inputSchema,
      required_scopes: [requiredScope],
      audit_category: _auditCategory(t.name),
      rate_cap: RATE_CAPS_BY_SCOPE[requiredScope] || null,
    })
  }

  // 2. Stdio child tools
  const all = await stdio.listAllTools()
  for (const [serverName, childTools] of Object.entries(all)) {
    if (!Array.isArray(childTools)) continue
    for (const t of childTools) {
      const requiredScope = STDIO_SCOPE_MAP[t.name] || 'unknown'
      tools.push({
        name: t.name,
        source: `stdio:${serverName}`,
        description: t.description,
        input_schema: t.inputSchema,
        required_scopes: [requiredScope],
        audit_category: _auditCategory(t.name),
        rate_cap: RATE_CAPS_BY_SCOPE[requiredScope] || null,
      })
    }
  }

  return {
    generated_at: new Date().toISOString(),
    total: tools.length,
    tools,
    unknown_scope_count: tools.filter(t => t.required_scopes.includes('unknown')).length,
  }
}

async function main() {
  try {
    const registry = await buildRegistry()
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES ('cowork.mcp_tool_registry', ${JSON.stringify(registry)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
    logger.info('mcp-tool-registry-regen: wrote registry', {
      total: registry.total,
      unknown_scope: registry.unknown_scope_count,
    })
    console.log(JSON.stringify({
      ok: true, total: registry.total, unknown_scope_count: registry.unknown_scope_count,
    }, null, 2))
    stdio.shutdownAll()
    process.exit(0)
  } catch (err) {
    logger.error('mcp-tool-registry-regen: failed', { error: err.message, stack: err.stack })
    console.error('FAILED:', err.message)
    process.exit(1)
  }
}

if (require.main === module) main()

module.exports = { buildRegistry, COWORK_SCOPE_MAP, STDIO_SCOPE_MAP, RATE_CAPS_BY_SCOPE }

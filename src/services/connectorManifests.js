/**
 * Domain-scoped MCP connectors - canonical manifest.
 *
 * Source of truth for Phase 2 Lane 10 (the split of /api/mcp/ecodia-full
 * into 10 narrow connectors). Each entry declares:
 *   - tools:    the tool-name allowlist this connector exposes. The mounted
 *               handler filters tools/list and tools/call against this set.
 *   - scopes:   the subset of ecodia-full scopes the connector's bearer
 *               needs to carry (used by registerBearer + scope.requireScope
 *               at runtime).
 *   - bearerKey: kv_store key holding { token, scopes, fingerprint } for
 *               this connector. Auth middleware reads it.
 *   - clientId: OAuth client_id for this connector (claude.ai Connector form).
 *   - mountPath: the URL path under /api/mcp (no leading slash).
 *
 * See: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md
 *      backend/docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md
 * Authored: 15 May 2026.
 */
'use strict'

const ecodiaFullScope = require('./ecodiaFullScope')

// Cowork V2 in-process tool names (mirrors coworkMcpShim.TOOLS - exhaustive
// list as of 2026-05-15; if cowork ever adds a tool, slot it here too).
const COWORK_TOOLS = Object.freeze({
  status_board_query:    'status_board.query',
  status_board_upsert:   'status_board.upsert',
  kv_store_get:          'kv_store.get',
  kv_store_set:          'kv_store.set',
  neo4j_search:          'neo4j.search',
  neo4j_write_episode:   'neo4j.write_episode',
  neo4j_write_decision:  'neo4j.write_decision',
  // forks_spawn + forks_list removed from conductor MCP surface 2026-06-09.
  // SDK forks are dead post-laptop-agent migration; the canonical conductor entry
  // for spawning a worker is scheduler.delayed (ecodia-scheduler connector). The
  // scheduler poller dispatches via cowork.dispatch_worker on the laptop-agent
  // under the hood. The forks.spawn / forks.list route handlers in
  // src/routes/mcp/cowork.js + the rate caps in coworkScope.js / ecodiaFullScope.js
  // stay in place for now (any in-flight legacy Routine that still calls them
  // continues to work) but neither is surfaced through any narrow connector,
  // so a conductor opening tools/list will not see them.
  patterns_search:       'patterns.semantic_search',
  email_threads_read:    'email_threads.read',
  crm_intelligence:      'crm.get_intelligence',
  os_session_message:    'os_session.message',
  cowork_log_session:    'cowork.log_session',
  cowork_heartbeat:      'cowork.heartbeat',
  cowork_session_started:'cowork.session_started',
  inbox_read:            'inbox.read',
  gmail_send:            'gmail.send',
  sms_tate:              'sms.tate',
  scheduler_cron:        'scheduler.cron',
  scheduler_delayed:     'scheduler.delayed',
  scheduler_list:        'scheduler.list',
  checkpoint_schedule:   'checkpoint.schedule',
  checkpoint_status:     'checkpoint.status',
  checkpoint_list:       'checkpoint.list',
  checkpoint_stop:       'checkpoint.stop',
  stripe_agent_probe:                 'stripe_agent.probe',
  stripe_agent_create_customer:       'stripe_agent.create_customer',
  stripe_agent_create_product:        'stripe_agent.create_product',
  stripe_agent_create_price:          'stripe_agent.create_price',
  stripe_agent_create_payment_link:   'stripe_agent.create_payment_link',
  stripe_agent_create_checkout_session:'stripe_agent.create_checkout_session',
})

// Stdio-server tool inventories (from ECODIA_FULL_MCP_INVENTORY_2026-05-15.md).
// Used as the source-of-truth for which connector each stdio tool routes to
// at dispatch time.
const STDIO_GMAIL = [
  'gmail_send','gmail_reply','gmail_create_draft','gmail_list_messages',
  'gmail_get_message','gmail_get_thread','gmail_list_labels','gmail_create_label',
  'gmail_modify_labels','gmail_mark_read','gmail_archive','gmail_trash',
]
const STDIO_DRIVE = [
  'drive_search','drive_list_folder','drive_get_file','drive_create_folder',
  'drive_create_doc','drive_create_sheet','drive_read_sheet','drive_update_doc',
  'drive_update_sheet','drive_append_sheet','drive_move_file','drive_delete_file',
  'drive_share_file',
]
const STDIO_CALENDAR = [
  'calendar_create_event','calendar_list_events','calendar_get_event',
  'calendar_update_event','calendar_delete_event',
]
const STDIO_CONTACTS = ['contacts_list','contacts_search','contacts_create','contacts_update']
const STDIO_SMS = ['send_sms','make_call','list_messages','list_calls']
const STDIO_VERCEL = ['vercel_list_projects','vercel_list_deployments','vercel_get_deployment','vercel_trigger_deploy']
const STDIO_XERO = ['xero_get_contacts','xero_get_invoices','xero_get_transactions','xero_categorize']
const STDIO_BK = [
  'bk_post_transaction','bk_batch_post','bk_categorize','bk_auto_categorize',
  'bk_create_rule','bk_delete_rule','bk_list_rules','bk_list_staged',
  'bk_staged_counts','bk_discard','bk_ledger','bk_list_accounts',
  'bk_trial_balance','bk_balance_sheet','bk_pnl','bk_cash_flow',
  'bk_bas','bk_gst_position','bk_director_loan_balance',
]
const STDIO_CRM = [
  'crm_create_client','crm_list_clients','crm_search_clients','crm_get_client',
  'crm_update_stage','crm_create_project','crm_get_projects','crm_get_tasks',
  'crm_complete_task','crm_add_contact','crm_get_contacts','crm_add_note',
  'crm_get_timeline','crm_get_intelligence','crm_dashboard','crm_pipeline','crm_revenue',
]
const STDIO_SCHEDULER = [
  'schedule_cron','schedule_delayed','schedule_chain','schedule_list',
  'schedule_run_now','schedule_pause','schedule_resume','schedule_cancel',
]
const STDIO_NEO4J = [
  'graph_search','graph_query','graph_context','graph_schema','graph_create_node',
  'graph_merge_node','graph_create_relationship','graph_reflect',
  'graph_semantic_search','graph_replay_buffer',
]
const STDIO_FACTORY = [
  'start_cc_session','get_factory_status','get_session_progress',
  'get_cc_session_details','list_codebases','send_cc_message','resume_cc_session',
  'review_factory_session','approve_factory_deploy','reject_factory_session',
]
const STDIO_SUPABASE = [
  'db_query','db_execute','db_list_tables','db_describe_table',
  'storage_list','storage_get_url','storage_upload','storage_delete',
]
const STDIO_VPS = ['shell_exec','pm2_list','pm2_logs','pm2_restart']

// The 10-connector taxonomy. Each connector's `tools` is the unioned
// allowlist for tools/list + tools/call. `scopes` mirrors ecodiaFullScope
// but narrowed.
const CONNECTORS = Object.freeze({
  'ecodia-core': {
    name: 'ecodia-core',
    title: 'EcodiaOS Core',
    mountPath: 'ecodia-core',
    bearerKey: 'creds.ecodia_core_mcp_bearer',
    clientId: 'ecodia_core_connector',
    scopes: [
      'read.status_board','write.status_board.cowork_owned',
      'read.kv_store','write.kv_store.cowork_namespace',
      'read.neo4j','write.neo4j.episode','write.neo4j.decision',
      'read.patterns','read.email_threads','read.cowork.inbox',
      'read.crm','read.scheduler.list',
      'write.os_session.message','write.cowork.session_log','write.cowork.heartbeat',
    ],
    tools: [
      COWORK_TOOLS.status_board_query, COWORK_TOOLS.status_board_upsert,
      COWORK_TOOLS.kv_store_get, COWORK_TOOLS.kv_store_set,
      COWORK_TOOLS.neo4j_search, COWORK_TOOLS.neo4j_write_episode, COWORK_TOOLS.neo4j_write_decision,
      COWORK_TOOLS.cowork_heartbeat, COWORK_TOOLS.cowork_session_started, COWORK_TOOLS.cowork_log_session,
      COWORK_TOOLS.patterns_search,
      COWORK_TOOLS.inbox_read, COWORK_TOOLS.email_threads_read,
      COWORK_TOOLS.os_session_message,
    ],
  },

  'ecodia-comms': {
    name: 'ecodia-comms',
    title: 'EcodiaOS Comms',
    mountPath: 'ecodia-comms',
    bearerKey: 'creds.ecodia_comms_mcp_bearer',
    clientId: 'ecodia_comms_connector',
    scopes: [
      'write.gmail.send','write.gmail.send.any','write.gmail.draft','write.gmail.modify','read.gmail.full',
      'write.drive','read.drive',
      'write.calendar','read.calendar',
      'write.contacts','read.contacts',
      'write.sms.tate','write.sms.any','write.sms.voice','read.sms',
      'read.email_threads',
    ],
    tools: [
      COWORK_TOOLS.gmail_send, COWORK_TOOLS.email_threads_read,
      ...STDIO_GMAIL, ...STDIO_DRIVE, ...STDIO_CALENDAR, ...STDIO_CONTACTS,
      COWORK_TOOLS.sms_tate, ...STDIO_SMS,
    ],
  },

  'ecodia-code': {
    name: 'ecodia-code',
    title: 'EcodiaOS Code',
    mountPath: 'ecodia-code',
    bearerKey: 'creds.ecodia_code_mcp_bearer',
    clientId: 'ecodia_code_connector',
    // forks.{spawn,list} scopes + tools dropped 2026-06-09 - dead post-laptop-agent migration.
    // Conductor's parallelism entry is scheduler.delayed on ecodia-scheduler. The Vercel
    // surface is the only live thing on this connector now; the connector itself stays
    // because there are GitHub + Vercel tools to add as that work matures.
    scopes: [
      'read.business_tools.vercel','write.business_tools.vercel',
    ],
    tools: [
      ...STDIO_VERCEL,
    ],
  },

  'ecodia-money': {
    name: 'ecodia-money',
    title: 'EcodiaOS Money',
    mountPath: 'ecodia-money',
    bearerKey: 'creds.ecodia_money_mcp_bearer',
    clientId: 'ecodia_money_connector',
    scopes: [
      'read.bookkeeping','write.bookkeeping.post','write.bookkeeping.rules',
      'write.bookkeeping.staged','read.bookkeeping.reports',
      'read.business_tools.xero',
      'write.stripe_agent',
    ],
    tools: [
      ...STDIO_BK, ...STDIO_XERO,
      COWORK_TOOLS.stripe_agent_probe,
      COWORK_TOOLS.stripe_agent_create_customer,
      COWORK_TOOLS.stripe_agent_create_product,
      COWORK_TOOLS.stripe_agent_create_price,
      COWORK_TOOLS.stripe_agent_create_payment_link,
      COWORK_TOOLS.stripe_agent_create_checkout_session,
    ],
  },

  'ecodia-shell': {
    name: 'ecodia-shell',
    title: 'EcodiaOS Shell',
    mountPath: 'ecodia-shell',
    bearerKey: 'creds.ecodia_shell_mcp_bearer',
    clientId: 'ecodia_shell_connector',
    scopes: ['write.vps.shell_exec','write.vps.pm2','read.vps.pm2'],
    tools: STDIO_VPS,
  },

  'ecodia-supabase': {
    name: 'ecodia-supabase',
    title: 'EcodiaOS Supabase',
    mountPath: 'ecodia-supabase',
    bearerKey: 'creds.ecodia_supabase_mcp_bearer',
    clientId: 'ecodia_supabase_connector',
    scopes: ['read.supabase.db','write.supabase.db','read.supabase.storage','write.supabase.storage'],
    tools: STDIO_SUPABASE,
  },

  'ecodia-scheduler': {
    name: 'ecodia-scheduler',
    title: 'EcodiaOS Scheduler',
    mountPath: 'ecodia-scheduler',
    bearerKey: 'creds.ecodia_scheduler_mcp_bearer',
    clientId: 'ecodia_scheduler_connector',
    scopes: [
      'read.scheduler.list','write.scheduler.cron','write.scheduler.delayed',
      'write.scheduler.chain','write.scheduler.delete','write.scheduler.pause',
      'write.scheduler.run_now',
    ],
    tools: [
      COWORK_TOOLS.scheduler_cron, COWORK_TOOLS.scheduler_delayed, COWORK_TOOLS.scheduler_list,
      COWORK_TOOLS.checkpoint_schedule, COWORK_TOOLS.checkpoint_status,
      COWORK_TOOLS.checkpoint_list, COWORK_TOOLS.checkpoint_stop,
      ...STDIO_SCHEDULER,
    ],
  },

  'ecodia-crm': {
    name: 'ecodia-crm',
    title: 'EcodiaOS CRM',
    mountPath: 'ecodia-crm',
    bearerKey: 'creds.ecodia_crm_mcp_bearer',
    clientId: 'ecodia_crm_connector',
    scopes: [
      'read.crm','read.crm.full','write.crm.client','write.crm.project',
      'write.crm.task','write.crm.note',
    ],
    tools: [
      COWORK_TOOLS.crm_intelligence,
      ...STDIO_CRM,
    ],
  },

  'ecodia-graph': {
    name: 'ecodia-graph',
    title: 'EcodiaOS Graph',
    mountPath: 'ecodia-graph',
    bearerKey: 'creds.ecodia_graph_mcp_bearer',
    clientId: 'ecodia_graph_connector',
    scopes: ['read.neo4j','write.neo4j.episode','write.neo4j.decision','write.neo4j.graph'],
    tools: STDIO_NEO4J,
  },

  'ecodia-factory': {
    name: 'ecodia-factory',
    title: 'EcodiaOS Factory',
    mountPath: 'ecodia-factory',
    bearerKey: 'creds.ecodia_factory_mcp_bearer',
    clientId: 'ecodia_factory_connector',
    scopes: [
      'read.factory.session','write.factory.dispatch','write.factory.approve',
      'write.factory.reject','write.factory.resume',
    ],
    tools: STDIO_FACTORY,
  },
})

const CONNECTOR_NAMES = Object.freeze(Object.keys(CONNECTORS))

// Map cowork tool-name -> true so dispatch knows to route into the cowork
// router rather than the stdio proxy.
const COWORK_TOOL_NAME_SET = new Set(Object.values(COWORK_TOOLS))

// Map stdio tool-name -> stdio server name. Mirrors the inventory.
const STDIO_TOOL_TO_SERVER = Object.freeze({
  ...Object.fromEntries(STDIO_GMAIL.map(t => [t, 'google-workspace'])),
  ...Object.fromEntries(STDIO_DRIVE.map(t => [t, 'google-workspace'])),
  ...Object.fromEntries(STDIO_CALENDAR.map(t => [t, 'google-workspace'])),
  ...Object.fromEntries(STDIO_CONTACTS.map(t => [t, 'google-workspace'])),
  ...Object.fromEntries(STDIO_SMS.map(t => [t, 'sms'])),
  ...Object.fromEntries(STDIO_VERCEL.map(t => [t, 'business-tools'])),
  ...Object.fromEntries(STDIO_XERO.map(t => [t, 'business-tools'])),
  ...Object.fromEntries(STDIO_BK.map(t => [t, 'bookkeeping'])),
  ...Object.fromEntries(STDIO_CRM.map(t => [t, 'crm'])),
  ...Object.fromEntries(STDIO_SCHEDULER.map(t => [t, 'scheduler'])),
  ...Object.fromEntries(STDIO_NEO4J.map(t => [t, 'neo4j'])),
  ...Object.fromEntries(STDIO_FACTORY.map(t => [t, 'factory'])),
  ...Object.fromEntries(STDIO_SUPABASE.map(t => [t, 'supabase'])),
  ...Object.fromEntries(STDIO_VPS.map(t => [t, 'vps'])),
})

function getConnector(name) {
  return CONNECTORS[name] || null
}

function isCoworkTool(name) {
  return COWORK_TOOL_NAME_SET.has(name)
}

function stdioServerForTool(name) {
  return STDIO_TOOL_TO_SERVER[name] || null
}

// Validate that every scope listed on every connector is a real ecodia-full scope
function _validateScopes() {
  const known = new Set(ecodiaFullScope.SCOPES)
  const offenders = []
  for (const c of Object.values(CONNECTORS)) {
    for (const s of c.scopes) {
      if (!known.has(s)) offenders.push(`${c.name}:${s}`)
    }
  }
  if (offenders.length) {
    // Surface at boot; never silently drop.
    throw new Error(`connectorManifests: unknown scope(s) on connector(s): ${offenders.join(', ')}`)
  }
}
_validateScopes()

module.exports = {
  CONNECTORS,
  CONNECTOR_NAMES,
  COWORK_TOOLS,
  COWORK_TOOL_NAME_SET,
  STDIO_TOOL_TO_SERVER,
  getConnector,
  isCoworkTool,
  stdioServerForTool,
}

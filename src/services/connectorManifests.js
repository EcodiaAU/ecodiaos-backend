'use strict'

/**
 * Domain-scoped MCP connector manifests (Phase 2 Lane 10, 2026-05-15).
 *
 * Stub implementation: exports CONNECTORS map with placeholder definitions.
 * Full implementation on VPS at ~/ecodiaos/src/services/connectorManifests.js.
 * This stub ensures the app starts cleanly from a fresh git clone.
 *
 * Each connector exposes a narrow HTTP MCP endpoint with its own bearer +
 * OAuth client_id + scope subset. The 10 domain-scoped connectors replace
 * the single wide ecodia-full bearer as the primary claude.ai connector surface.
 */

const CONNECTORS = Object.freeze({
  'ecodia-core': {
    name: 'ecodia-core',
    mountPath: 'ecodia-core',
    description: 'Core OS tools: status_board, kv_store, neo4j, patterns, os_session',
    stub: true,
  },
  'ecodia-comms': {
    name: 'ecodia-comms',
    mountPath: 'ecodia-comms',
    description: 'Communications: gmail, email_threads, inbox',
    stub: true,
  },
  'ecodia-code': {
    name: 'ecodia-code',
    mountPath: 'ecodia-code',
    description: 'Code/factory tools: cc_sessions, forks',
    stub: true,
  },
  'ecodia-money': {
    name: 'ecodia-money',
    mountPath: 'ecodia-money',
    description: 'Finance: bookkeeping, stripe, xero',
    stub: true,
  },
  'ecodia-shell': {
    name: 'ecodia-shell',
    mountPath: 'ecodia-shell',
    description: 'VPS shell: pm2, shell_exec',
    stub: true,
  },
  'ecodia-supabase': {
    name: 'ecodia-supabase',
    mountPath: 'ecodia-supabase',
    description: 'Supabase: db_query, db_execute, storage',
    stub: true,
  },
  'ecodia-scheduler': {
    name: 'ecodia-scheduler',
    mountPath: 'ecodia-scheduler',
    description: 'Scheduler: schedule_cron, schedule_delayed, schedule_list',
    stub: true,
  },
  'ecodia-crm': {
    name: 'ecodia-crm',
    mountPath: 'ecodia-crm',
    description: 'CRM: clients, projects, tasks, contacts',
    stub: true,
  },
  'ecodia-graph': {
    name: 'ecodia-graph',
    mountPath: 'ecodia-graph',
    description: 'Neo4j graph: search, write_episode, write_decision',
    stub: true,
  },
  'ecodia-factory': {
    name: 'ecodia-factory',
    mountPath: 'ecodia-factory',
    description: 'Factory: start_cc_session, review, approve, reject',
    stub: true,
  },
})

module.exports = { CONNECTORS }

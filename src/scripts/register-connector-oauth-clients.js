#!/usr/bin/env node
/**
 * Phase 2 Lane 10 - register the 10 domain-scoped MCP connectors' bearers
 * + OAuth clients in kv_store. Idempotent (ON CONFLICT DO UPDATE).
 *
 * Run:  node src/scripts/register-connector-oauth-clients.js
 * Or from VPS: cd ~/ecodiaos && node src/scripts/register-connector-oauth-clients.js
 *
 * Outputs a credential-card markdown to stdout that Tate can paste into
 * claude.ai's Custom Connector forms. Also writes the same card to:
 *   backend/docs/MCP_CONNECTOR_CREDENTIALS_2026-05-15.md
 *
 * Already executed once at registration (2026-05-15). Re-running rotates
 * the bearer + client_secret for any connector you pass via --rotate <name>;
 * default runs are no-ops because rows already exist (ON CONFLICT DO
 * NOTHING for first-mint shape; pass --force to overwrite).
 *
 * Spec: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md §10.3.
 * Authored: 15 May 2026.
 */
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const db = require('../config/db')

const CONNECTORS = [
  {
    name: 'ecodia-core',
    bearer_key: 'creds.ecodia_core_mcp_bearer',
    client_id: 'ecodia_core_connector',
    scopes: [
      'read.status_board','write.status_board.cowork_owned',
      'read.kv_store','write.kv_store.cowork_namespace',
      'read.neo4j','write.neo4j.episode','write.neo4j.decision',
      'read.patterns','read.email_threads','read.cowork.inbox','read.crm',
      'read.scheduler.list',
      'write.os_session.message','write.cowork.session_log','write.cowork.heartbeat',
    ],
    consumers: 'claude.ai tate@, code@, money@; VS Code default',
    notes: 'Phase 2 Lane 10 - always-on baseline; status_board + kv_store + neo4j + patterns + inbox + os_session',
    accounts: ['tate@', 'code@', 'money@'],
  },
  {
    name: 'ecodia-comms',
    bearer_key: 'creds.ecodia_comms_mcp_bearer',
    client_id: 'ecodia_comms_connector',
    scopes: [
      'write.gmail.send','write.gmail.send.any','write.gmail.draft','write.gmail.modify','read.gmail.full',
      'write.drive','read.drive','write.calendar','read.calendar','write.contacts','read.contacts',
      'write.sms.tate','write.sms.any','write.sms.voice','read.sms','read.email_threads',
    ],
    consumers: 'claude.ai tate@, code@, money@',
    notes: 'Phase 2 Lane 10 - outbound comms (Gmail/Drive/Calendar/Contacts/SMS/voice)',
    accounts: ['tate@', 'code@', 'money@'],
  },
  {
    name: 'ecodia-code',
    bearer_key: 'creds.ecodia_code_mcp_bearer',
    client_id: 'ecodia_code_connector',
    scopes: ['read.forks','write.forks.cowork_pool','read.business_tools.vercel','write.business_tools.vercel'],
    consumers: 'claude.ai tate@, code@; VS Code default',
    notes: 'Phase 2 Lane 10 - forks + Vercel deploys',
    accounts: ['tate@', 'code@'],
  },
  {
    name: 'ecodia-money',
    bearer_key: 'creds.ecodia_money_mcp_bearer',
    client_id: 'ecodia_money_connector',
    scopes: [
      'read.bookkeeping','write.bookkeeping.post','write.bookkeeping.rules',
      'write.bookkeeping.staged','read.bookkeeping.reports','read.business_tools.xero',
    ],
    consumers: 'claude.ai tate@, money@',
    notes: 'Phase 2 Lane 10 - bookkeeping + Xero',
    accounts: ['tate@', 'money@'],
  },
  {
    name: 'ecodia-shell',
    bearer_key: 'creds.ecodia_shell_mcp_bearer',
    client_id: 'ecodia_shell_connector',
    scopes: ['write.vps.shell_exec','write.vps.pm2','read.vps.pm2'],
    consumers: 'claude.ai tate@ ONLY (hard-stop: never on code@ or money@)',
    notes: 'Phase 2 Lane 10 - VPS shell + PM2; DR + infrastructure only',
    accounts: ['tate@'],
  },
  {
    name: 'ecodia-supabase',
    bearer_key: 'creds.ecodia_supabase_mcp_bearer',
    client_id: 'ecodia_supabase_connector',
    scopes: ['read.supabase.db','write.supabase.db','read.supabase.storage','write.supabase.storage'],
    consumers: 'claude.ai tate@, code@',
    notes: 'Phase 2 Lane 10 - direct Supabase DB + Storage',
    accounts: ['tate@', 'code@'],
  },
  {
    name: 'ecodia-scheduler',
    bearer_key: 'creds.ecodia_scheduler_mcp_bearer',
    client_id: 'ecodia_scheduler_connector',
    scopes: [
      'read.scheduler.list','write.scheduler.cron','write.scheduler.delayed','write.scheduler.chain',
      'write.scheduler.delete','write.scheduler.pause','write.scheduler.run_now',
    ],
    consumers: 'claude.ai tate@, code@, money@; VS Code default',
    notes: 'Phase 2 Lane 10 - scheduler + checkpoint primitives',
    accounts: ['tate@', 'code@', 'money@'],
  },
  {
    name: 'ecodia-crm',
    bearer_key: 'creds.ecodia_crm_mcp_bearer',
    client_id: 'ecodia_crm_connector',
    scopes: ['read.crm','read.crm.full','write.crm.client','write.crm.project','write.crm.task','write.crm.note'],
    consumers: 'claude.ai tate@, money@',
    notes: 'Phase 2 Lane 10 - CRM read + write',
    accounts: ['tate@', 'money@'],
  },
  {
    name: 'ecodia-graph',
    bearer_key: 'creds.ecodia_graph_mcp_bearer',
    client_id: 'ecodia_graph_connector',
    scopes: ['read.neo4j','write.neo4j.episode','write.neo4j.decision','write.neo4j.graph'],
    consumers: 'claude.ai tate@, code@',
    notes: 'Phase 2 Lane 10 - deeper Neo4j ops for graph maintenance + memory routines',
    accounts: ['tate@', 'code@'],
  },
  {
    name: 'ecodia-factory',
    bearer_key: 'creds.ecodia_factory_mcp_bearer',
    client_id: 'ecodia_factory_connector',
    scopes: ['read.factory.session','write.factory.dispatch','write.factory.approve','write.factory.reject','write.factory.resume'],
    consumers: 'claude.ai tate@, code@',
    notes: 'Phase 2 Lane 10 - Factory dispatch sessions',
    accounts: ['tate@', 'code@'],
  },
]

function hex(bytes = 32) { return crypto.randomBytes(bytes).toString('hex') }

async function _bearerExists(key) {
  const [row] = await db`SELECT key FROM kv_store WHERE key = ${key}`
  return !!row
}

async function _clientExists(clientId) {
  const [row] = await db`SELECT key FROM kv_store WHERE key = ${'ecodia_full.oauth_clients.' + clientId}`
  return !!row
}

async function registerOne(c, { force = false, rotateName = null } = {}) {
  const shouldRotate = force || rotateName === c.name
  const bearerHere = await _bearerExists(c.bearer_key)
  const clientHere = await _clientExists(c.client_id)

  if (bearerHere && !shouldRotate) {
    // Read existing
    const [row] = await db`SELECT value FROM kv_store WHERE key = ${c.bearer_key}`
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    c._token = parsed.token
  } else {
    const token = hex(32)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${c.bearer_key}, ${JSON.stringify({
        token,
        scopes: c.scopes,
        consumers: c.consumers,
        notes: c.notes,
        minted_at: new Date().toISOString(),
        minted_by: 'phase2-10-domain-scoped-connectors',
        rotation_due: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
    c._token = token
  }

  if (clientHere && !shouldRotate) {
    const [row] = await db`SELECT value FROM kv_store WHERE key = ${'ecodia_full.oauth_clients.' + c.client_id}`
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    c._client_secret = parsed.client_secret
  } else {
    const client_secret = hex(32)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (
        ${'ecodia_full.oauth_clients.' + c.client_id},
        ${JSON.stringify({
          name: 'EcodiaOS ' + c.name.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase()) + ' Connector',
          client_id: c.client_id,
          client_secret,
          redirect_uris: [
            'https://claude.ai/api/organizations/connectors/oauth/callback',
            'https://claude.ai/connectors/callback',
          ],
          scopes_granted: ['mcp.' + c.name],
          connector_name: c.name,
          bearer_key: c.bearer_key,
          created_at: new Date().toISOString(),
          created_by: 'phase2-10-domain-scoped-connectors',
        })},
        now()
      )
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
    c._client_secret = client_secret
  }
}

function _mdBlock(c) {
  return [
    `## ${c.name}`,
    '',
    `- Name in claude.ai: \`${c.name}\``,
    `- URL: \`https://api.admin.ecodia.au/api/mcp/${c.name}\``,
    `- Auth: OAuth (PKCE)`,
    `- Client ID: \`${c.client_id}\``,
    `- Client Secret: \`${c._client_secret}\``,
    `- Authorization URL: \`https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=${c.client_id}\``,
    `- Token URL: \`https://api.admin.ecodia.au/api/oauth/mcp/token\``,
    `- Scope: \`mcp.${c.name}\``,
    `- Bearer (raw, if a client supports bearer instead of OAuth): \`${c._token}\``,
    `- Register on which accounts: ${c.accounts.join(', ')}`,
    '',
    `Notes: ${c.notes}`,
    '',
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const rotIdx = args.indexOf('--rotate')
  const rotateName = rotIdx >= 0 ? args[rotIdx + 1] : null

  for (const c of CONNECTORS) {
    await registerOne(c, { force, rotateName })
    process.stderr.write(`registered: ${c.name} (bearer=${c.bearer_key}, client_id=${c.client_id})\n`)
  }

  const banner = [
    `# MCP Connector Credentials - Phase 2 Lane 10`,
    `Authored 2026-05-15. KEEP THIS FILE PRIVATE. Treat as creds-grade.`,
    ``,
    `Phase 2 Lane 10 split /api/mcp/ecodia-full into 10 domain-scoped`,
    `connectors. Each has its own URL, bearer, OAuth client_id, and scope.`,
    `Paste each block into claude.ai > Settings > Custom Connectors on the`,
    `account(s) named in the block. \`ecodia-full\` stays alive for 30 days as`,
    `a migration alias - existing connectors against it continue to work.`,
    ``,
    `## Hard-stop`,
    ``,
    `**\`ecodia-shell\` registers on tate@ ONLY**. Do not paste its block into`,
    `code@ or money@. shell_exec lives on tate@ alone.`,
    ``,
    `## Common discovery metadata`,
    ``,
    `- OAuth discovery (RFC 8414): https://api.admin.ecodia.au/api/oauth/mcp/.well-known/oauth-authorization-server`,
    `- PKCE: S256 required`,
    `- Redirect URIs registered: \`https://claude.ai/api/organizations/connectors/oauth/callback\`, \`https://claude.ai/connectors/callback\``,
    ``,
    `## Per-connector blocks`,
    ``,
  ].join('\n')

  const body = CONNECTORS.map(_mdBlock).join('\n')
  const md = banner + body

  const outPath = path.resolve(__dirname, '../../docs/MCP_CONNECTOR_CREDENTIALS_2026-05-15.md')
  fs.writeFileSync(outPath, md, 'utf8')
  process.stderr.write(`\nwrote credential card -> ${outPath}\n`)
  process.stdout.write(md)
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
}

module.exports = { CONNECTORS, registerOne }

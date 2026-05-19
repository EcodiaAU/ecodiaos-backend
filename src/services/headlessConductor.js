'use strict'

// Force IPv4 DNS resolution order. VPS has no IPv6 connectivity but node 20
// fetch (undici) prefers IPv6 for hosts with AAAA records (e.g. Telegram).
// Without this every Telegram fetch ETIMEDOUTs. Twilio is IPv4-only so it
// works regardless. Set before any HTTP module initializes.
require('dns').setDefaultResultOrder('ipv4first')

/**
 * headlessConductor.js (2026-05-19 evening rewrite)
 *
 * Two-phase architecture:
 *   PHASE 1 - Haiku 4.5 TRIAGE. Fast, cheap, handles 70%+ of inbound
 *     (acks, banter, quick answers, status checks) end-to-end. Tiny tool
 *     surface, sub-second decisions.
 *   PHASE 2 - Opus 4.7 EXECUTE. Triggered when Haiku calls escalate_to_opus.
 *     Full power: every ecodia-full MCP tool (157), every laptop-agent
 *     tool (~200), the cowork MCP. Token-disciplined via discovery: Opus
 *     gets PROXY tools (mcp_call, mcp_list_tools, laptop_agent_call) and
 *     searches what it needs instead of loading 350+ tool schemas up front.
 *
 * Why this shape: Tate wants real work to happen when he texts. Haiku alone
 * is fine for "got it" but useless for "ship the resonaverde deploy." Opus
 * with the full tool surface is fine for ship-deploy but expensive + slow
 * for "ack." Triage routes each inbound to the right tier.
 */

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
const db = require('../config/db')
const logger = require('../config/logger')
const https = require('https')
const { sendSmsToTate } = require('./transports/smsTransport')
const { sendTelegramMessage } = require('./transports/telegramTransport')
const { loadThreadMirror } = require('./threadMirror')

// ===== Models =====
// PHASE 1 (triage): Anthropic SDK on Haiku via OAuth. OAuth tokens are
// scoped to Haiku-only for raw SDK use (Sonnet/Opus return generic 429s).
// Haiku is plenty for triage.
//
// PHASE 2 (execute): spawn the `claude` CLI as a subprocess on the VPS.
// The CLI handles its own auth flow with the Max subscription, has full
// access to Opus/Sonnet, auto-loads CLAUDE.md, all configured MCPs
// (including ecodia-comms for SMS/TG reply), all skills. The headless
// gives it a prompt + envelope context, captures stdout, returns.
//
// VPS must have a valid `claude login`. Without it the CLI 401/502s on
// each request. (`~/.claude/.credentials.json` is the auth file.)
const TRIAGE_MODEL = process.env.HEADLESS_TRIAGE_MODEL || 'claude-haiku-4-5'
// Execute = real work. Opus 4.7 max is Tate's chosen ceiling (highest effort
// tier, Opus-only). This burns more subscription quota per turn but is what
// gets used for everything substantive - lookups, drafts, deploys, coding.
const EXECUTE_CLI_MODEL = process.env.HEADLESS_EXECUTE_CLI_MODEL || 'claude-opus-4-7'
const EXECUTE_CLI_EFFORT = process.env.HEADLESS_EXECUTE_CLI_EFFORT || 'max'
const EXECUTE_CLI_PATH = process.env.CLAUDE_CLI_PATH || 'claude'
const EXECUTE_CLI_CWD = process.env.HEADLESS_EXECUTE_CWD || '/home/tate/ecodiaos'
const EXECUTE_CLI_TIMEOUT_MS = parseInt(process.env.HEADLESS_EXECUTE_TIMEOUT_MS || '240000', 10)

// ===== Limits =====
const MAX_TOOL_ITERATIONS_TRIAGE = 6
const MAX_TOOL_ITERATIONS_EXECUTE = 24
const REQUEST_MAX_TOKENS_TRIAGE = 4096
const REQUEST_MAX_TOKENS_EXECUTE = 16000

// ===== Account rotation =====
const ACCOUNT_ORDER = ['money', 'code', 'tate']
const ACCOUNT_TOKENS = {
  tate: process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE || null,
  code: process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE || null,
  money: process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY || null,
}
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

// ===== Endpoints =====
const LAPTOP_AGENT_TOOL_URL = process.env.REFLEX_AGENT_URL || 'http://100.114.219.69:7456/api/tool'
const LAPTOP_COORD_MCP_URL = process.env.COORD_MCP_URL || 'http://100.114.219.69:7456/api/mcp/coord'
const ECODIA_FULL_MCP_URL = 'https://api.admin.ecodia.au/api/mcp/ecodia-full'
const COWORK_MCP_URL = 'https://api.admin.ecodia.au/api/mcp/cowork'

// ===== Bearer caches =====
let _agentTokenCache = { value: null, expiresAt: 0 }
let _ecodiaFullBearerCache = { value: null, expiresAt: 0 }
let _coworkBearerCache = { value: null, expiresAt: 0 }

async function _loadCred(key, cache) {
  if (cache.expiresAt > Date.now() && cache.value) return cache.value
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    const raw = rows?.[0]?.value
    let parsed = null
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) } catch { parsed = raw }
    } else if (raw && typeof raw === 'object') {
      parsed = raw
    }
    cache.value = parsed
    cache.expiresAt = Date.now() + 5 * 60 * 1000
    return parsed
  } catch (err) {
    logger.warn(`cred load failed for ${key}`, { error: err.message })
    return null
  }
}

async function _loadLaptopAgentToken() {
  if (process.env.REFLEX_AGENT_TOKEN) return process.env.REFLEX_AGENT_TOKEN
  const parsed = await _loadCred('creds.laptop_agent', _agentTokenCache)
  return parsed?.agent_token || null
}

async function _loadEcodiaFullBearer() {
  if (process.env.ECODIA_FULL_MCP_BEARER) return process.env.ECODIA_FULL_MCP_BEARER
  const parsed = await _loadCred('creds.ecodia_full_mcp_bearer', _ecodiaFullBearerCache)
  return typeof parsed === 'string' ? parsed : (parsed?.bearer || parsed?.token || null)
}

async function _loadCoworkBearer() {
  if (process.env.COWORK_MCP_BEARER) return process.env.COWORK_MCP_BEARER
  const parsed = await _loadCred('creds.cowork_mcp_bearer', _coworkBearerCache)
  return typeof parsed === 'string' ? parsed : (parsed?.bearer || parsed?.token || null)
}

// ===== Account picker / rotation helpers =====

function _availableAccounts() {
  return ACCOUNT_ORDER.filter(a => !!ACCOUNT_TOKENS[a]).map(a => ({ account: a, token: ACCOUNT_TOKENS[a] }))
}

function _isRateLimitError(err) {
  return err?.status === 429 || /rate_limit/i.test(err?.message || '')
}

// ===== HTTPS request helper (IPv4 forced) =====

function _httpsJsonRequest({ host, port = 443, path, method = 'POST', headers = {}, body, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    const bodyBuf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') : null
    const baseHeaders = { 'Content-Type': 'application/json' }
    const reqHeaders = { ...baseHeaders, ...headers }
    if (bodyBuf) reqHeaders['Content-Length'] = bodyBuf.length
    const req = https.request({
      host, port, path, method, family: 4, headers: reqHeaders, timeout: timeoutMs,
    }, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try { parsed = JSON.parse(text) } catch {}
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: parsed, raw: text })
      })
    })
    req.on('error', err => resolve({ ok: false, status: 0, error: err.message, code: err.code }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }) })
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

// ===== Tools: SMS / Telegram (delegate to transport modules) =====
// The transports own the channel-specific HTTP + outbound mirror append.
// Kept as small wrappers so the tool registry binds cleanly + interface
// stays stable if a transport's internal shape evolves.

async function _sendSmsToTate({ body }) {
  return sendSmsToTate({ body })
}

async function _sendTelegramMessage({ chat_id, text, parse_mode, reply_to_message_id }) {
  return sendTelegramMessage({ chat_id, text, parse_mode, reply_to_message_id })
}

// ===== Tool: Substrate =====

async function _kvStoreSet({ key, value }) {
  if (!key?.startsWith?.('cowork.')) return { ok: false, error: 'key must start with cowork.' }
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    await db`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${v}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    return { ok: true, key }
  } catch (err) { return { ok: false, error: err.message } }
}

async function _kvStoreGet({ key }) {
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${key} LIMIT 1`
    if (!rows?.[0]) return { ok: true, found: false }
    return { ok: true, found: true, value: rows[0].value, updated_at: rows[0].updated_at }
  } catch (err) { return { ok: false, error: err.message } }
}

async function _statusBoardUpsert(args) {
  // Real schema: status_board(id, entity_type, entity_ref, name, status,
  // next_action, next_action_by, next_action_due, last_touched, context,
  // priority int, archived_at, created_at, source, cowork_session_id).
  // entity_type CHECK: client|project|thread|task|opportunity|personal|legal|infrastructure
  // next_action_by CHECK: ecodiaos|tate|client|external|null
  // priority is INTEGER (P1=1, P2=2, P3=3).
  const priorityInt = typeof args.priority === 'string'
    ? ({ P1: 1, P2: 2, P3: 3 }[args.priority] || 2)
    : (typeof args.priority === 'number' ? args.priority : 2)
  try {
    if (args.id) {
      await db`
        UPDATE status_board
        SET entity_type = ${args.entity_type}, name = ${args.name}, context = ${args.summary || args.context || null},
            status = ${args.status || 'open'}, priority = ${priorityInt},
            next_action_by = ${args.next_action_by || 'ecodiaos'}, last_touched = NOW()
        WHERE id = ${args.id}
      `
      return { ok: true, id: args.id, action: 'updated' }
    }
    const rows = await db`
      INSERT INTO status_board (entity_type, name, context, status, priority, next_action_by, source, created_at, last_touched)
      VALUES (${args.entity_type}, ${args.name}, ${args.summary || args.context || null},
              ${args.status || 'open'}, ${priorityInt},
              ${args.next_action_by || 'ecodiaos'}, ${args.source || 'headlessConductor'}, NOW(), NOW())
      RETURNING id
    `
    return { ok: true, id: rows?.[0]?.id, action: 'inserted' }
  } catch (err) { return { ok: false, error: err.message } }
}

async function _neo4jWriteEpisode({ type, summary, details }) {
  try {
    const rows = await db`
      INSERT INTO neo4j_episodes_queue (type, summary, details, created_at)
      VALUES (${type}, ${summary}, ${JSON.stringify(details || {})}, NOW())
      RETURNING id
    `
    return { ok: true, queued_id: rows?.[0]?.id }
  } catch (err) {
    // Fallback log so the substrate write intent is captured even if the queue
    // table is missing.
    logger.info('episode logged (queue table missing)', { type, summary, details: details || {} })
    return { ok: true, queued_id: null, fallback: 'logged' }
  }
}

// ===== Tool: Corazon proxies =====

async function _laptopAgentCall({ tool, params }) {
  const token = await _loadLaptopAgentToken()
  if (!token) return { ok: false, error: 'laptop-agent token missing' }
  const url = new URL(LAPTOP_AGENT_TOOL_URL)
  const r = await _httpsJsonRequest({
    host: url.hostname, port: parseInt(url.port || (url.protocol === 'https:' ? 443 : 80)), path: url.pathname,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { tool, params: params || {} },
    timeoutMs: 30000,
  })
  if (!r.ok) return { ok: false, error: r.error || `laptop-agent ${r.status}`, body: r.body || r.raw?.slice(0, 200) }
  const inner = r.body?.result || r.body
  return { ok: true, result: inner }
}

// http for the laptop-agent which is HTTP not HTTPS
async function _httpJsonRequest({ host, port = 80, path, method = 'POST', headers = {}, body, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    const http = require('http')
    const bodyBuf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') : null
    const reqHeaders = { 'Content-Type': 'application/json', ...headers }
    if (bodyBuf) reqHeaders['Content-Length'] = bodyBuf.length
    const req = http.request({
      host, port, path, method, family: 4, headers: reqHeaders, timeout: timeoutMs,
    }, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try { parsed = JSON.parse(text) } catch {}
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode, body: parsed, raw: text })
      })
    })
    req.on('error', err => resolve({ ok: false, status: 0, error: err.message, code: err.code }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }) })
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

// override the HTTPS one for laptop-agent since it's actually HTTP
async function _laptopAgentCallHttp({ tool, params }) {
  const token = await _loadLaptopAgentToken()
  if (!token) return { ok: false, error: 'laptop-agent token missing' }
  const url = new URL(LAPTOP_AGENT_TOOL_URL)
  const r = await _httpJsonRequest({
    host: url.hostname, port: parseInt(url.port) || 80, path: url.pathname,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { tool, params: params || {} },
    timeoutMs: 30000,
  })
  if (!r.ok) return { ok: false, error: r.error || `laptop-agent ${r.status}`, body: r.body || r.raw?.slice(0, 200) }
  const inner = r.body?.result || r.body
  return { ok: true, result: inner }
}

async function _whisperToConductor({ body }) {
  const token = await _loadLaptopAgentToken()
  if (!token) return { ok: false, error: 'laptop-agent token missing' }
  const url = new URL(LAPTOP_COORD_MCP_URL)
  const r = await _httpJsonRequest({
    host: url.hostname, port: parseInt(url.port) || 80, path: url.pathname,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      jsonrpc: '2.0', id: Date.now(),
      method: 'tools/call',
      params: { name: 'coord.send_message', arguments: { to: 'chat.conductor.inbox', body } },
    },
  })
  const inner = r.body?.result?.content?.[0]?.text
  let parsed = null
  if (inner) { try { parsed = JSON.parse(inner) } catch {} }
  if (parsed?.message_id) return { ok: true, message_id: parsed.message_id }
  return { ok: false, error: r.body?.error?.message || `coord ${r.status}` }
}

async function _dispatchCorazonChat({ brief, task_id, ide }) {
  const params = { brief, ide: ide || 'stable' }
  if (task_id) params.task_id = task_id
  const r = await _laptopAgentCallHttp({ tool: 'cowork.dispatch_worker', params })
  if (!r.ok) return r
  const inner = r.result?.result || r.result
  return { ok: true, tab_id: inner?.tab_id, task_id: inner?.task_id, brief_file: inner?.brief_file_audit }
}

// ===== Tool: MCP proxy (ecodia-full + cowork) =====

async function _mcpCall({ server, tool, args }) {
  let url, bearer
  if (server === 'ecodia-full') {
    url = ECODIA_FULL_MCP_URL
    bearer = await _loadEcodiaFullBearer()
  } else if (server === 'cowork') {
    url = COWORK_MCP_URL
    bearer = await _loadCoworkBearer()
  } else {
    return { ok: false, error: `unknown mcp server: ${server} (use ecodia-full or cowork)` }
  }
  if (!bearer) return { ok: false, error: `${server} bearer missing` }
  const u = new URL(url)
  const r = await _httpsJsonRequest({
    host: u.hostname, port: 443, path: u.pathname,
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
    body: { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: args || {} } },
    timeoutMs: 60000,
  })
  if (!r.ok) return { ok: false, error: r.error || `mcp ${r.status}`, body: r.raw?.slice(0, 300) }
  const inner = r.body?.result?.content?.[0]?.text
  let parsed = null
  if (inner) { try { parsed = JSON.parse(inner) } catch { parsed = inner } }
  return { ok: !r.body?.result?.isError, result: parsed, raw_result: r.body?.result }
}

async function _mcpListTools({ server, query }) {
  let url, bearer
  if (server === 'ecodia-full') {
    url = ECODIA_FULL_MCP_URL
    bearer = await _loadEcodiaFullBearer()
  } else if (server === 'cowork') {
    url = COWORK_MCP_URL
    bearer = await _loadCoworkBearer()
  } else {
    return { ok: false, error: `unknown mcp server: ${server}` }
  }
  if (!bearer) return { ok: false, error: `${server} bearer missing` }
  const u = new URL(url)
  const r = await _httpsJsonRequest({
    host: u.hostname, port: 443, path: u.pathname,
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
    body: { jsonrpc: '2.0', id: Date.now(), method: 'tools/list' },
    timeoutMs: 30000,
  })
  if (!r.ok) return { ok: false, error: r.error || `mcp list ${r.status}` }
  const tools = r.body?.result?.tools || []
  let filtered = tools
  if (query) {
    const q = query.toLowerCase()
    filtered = tools.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }
  return {
    ok: true,
    server,
    query: query || null,
    count: filtered.length,
    total: tools.length,
    tools: filtered.slice(0, 60).map(t => ({
      name: t.name,
      description: (t.description || '').slice(0, 240),
    })),
  }
}

// ===== Triage (Haiku) tool registry =====

const TRIAGE_TOOLS = [
  {
    name: 'send_sms_to_tate',
    description: 'Send a 1-segment SMS to Tate (+61404247153). Use for ANY reply when channel is sms - even banter gets a 1-3 word ack. <=160 GSM chars.',
    input_schema: {
      type: 'object', required: ['body'],
      properties: { body: { type: 'string', maxLength: 160 } },
    },
  },
  {
    name: 'send_telegram_message',
    description: 'Send a Telegram message via the EcodiaOS bot. Use for ANY reply when channel is telegram. Markdown supported.',
    input_schema: {
      type: 'object', required: ['chat_id', 'text'],
      properties: {
        chat_id: { type: 'string' },
        text: { type: 'string' },
        parse_mode: { type: 'string', enum: ['Markdown', 'HTML', 'MarkdownV2'] },
        reply_to_message_id: { type: 'integer' },
      },
    },
  },
  {
    name: 'notify_tate',
    description: 'Universal reply tool. Use for channel == native (delivers via APNs to iOS app with SMS fallback). Also usable for autonomous initiatives where transport should be picked by device state. urgency maps to APNs interruption-level (routine=passive, alert=active, critical=time-sensitive). For SMS/Telegram channel-matched replies, prefer send_sms_to_tate / send_telegram_message - this tool is for native + cross-channel cases.',
    input_schema: {
      type: 'object', required: ['body'],
      properties: {
        body: { type: 'string' },
        urgency: { type: 'string', enum: ['routine', 'alert', 'critical'] },
        channel: { type: 'string', enum: ['sms', 'telegram', 'native', 'auto'], description: 'Default auto. Pass envelope channel for matched reply.' },
        thread_id: { type: 'string' },
        deep_link: { type: 'string', description: 'Optional deep link for native app to open on tap.' },
      },
    },
  },
  {
    name: 'escalate_to_opus',
    description: 'Flip to Opus 4.7 with the FULL tool surface (all ecodia-full MCP tools, laptop-agent tools, cowork MCP, Corazon dispatch). Call this WHENEVER the inbound asks for real work: send an email, check a deploy, write a status_board row, dispatch a Corazon chat, draft anything substantive, look something up across systems, etc. Cheap. Default to escalating if the inbound is anything more than greeting/banter/quick-yes-no.',
    input_schema: {
      type: 'object', required: ['reason'],
      properties: {
        reason: { type: 'string', description: 'One-line why this needs Opus + full tools.' },
        ack_first: { type: 'string', description: 'Optional very short SMS/TG ack to send BEFORE the escalation runs so Tate knows it is in progress.' },
      },
    },
  },
  {
    name: 'neo4j_write_episode',
    description: 'Capture a durable memory of what happened on this turn. Required substrate write before exit.',
    input_schema: {
      type: 'object', required: ['type', 'summary'],
      properties: {
        type: { type: 'string', enum: ['inbound_reply', 'conductor_decision', 'autonomous_action'] },
        summary: { type: 'string' },
        details: { type: 'object' },
      },
    },
  },
]

// ===== Execute (Opus) tool registry — adds MCP proxies + Corazon =====

const EXECUTE_TOOLS = [
  ...TRIAGE_TOOLS.filter(t => t.name !== 'escalate_to_opus'),
  {
    name: 'mcp_list_tools',
    description: 'Discover what tools an MCP server exposes. Use BEFORE mcp_call to find the right tool name without loading the full catalog. server=ecodia-full (157 tools: gmail, calendar, drive, crm, vercel, supabase, stripe, neo4j, status_board, bookkeeping, money, etc) OR server=cowork (20 tools: status_board, kv_store, coord). query is a substring to filter by name/description (e.g. "gmail", "vercel", "draft", "deploy"). Returns up to 60 matches.',
    input_schema: {
      type: 'object', required: ['server'],
      properties: {
        server: { type: 'string', enum: ['ecodia-full', 'cowork'] },
        query: { type: 'string', description: 'Substring filter. STRONGLY recommended to keep token costs sane.' },
      },
    },
  },
  {
    name: 'mcp_call',
    description: 'Invoke any tool on an MCP server. Use mcp_list_tools FIRST to find the exact tool name + input schema. server=ecodia-full has the high-leverage surface (gmail send/draft, drive ops, crm, vercel deploys, supabase SQL, status_board, neo4j writes, finance, bookkeeping, stripe, calendar). server=cowork is the narrow scope (cowork.* tools). Returns the tool result.',
    input_schema: {
      type: 'object', required: ['server', 'tool'],
      properties: {
        server: { type: 'string', enum: ['ecodia-full', 'cowork'] },
        tool: { type: 'string', description: 'Exact tool name (e.g. "gmail_send", "vercel_get_deployment", "status_board_upsert").' },
        args: { type: 'object', description: 'Tool arguments per its input schema.' },
      },
    },
  },
  {
    name: 'laptop_agent_call',
    description: 'Invoke any tool on the Corazon laptop-agent at 100.114.219.69:7456. Surface includes: chrome cdp (cdp.*), gui macros (gui.*), filesystem (filesystem.*), ide bridge (ide.*), screenshot, shell (allowlisted), notification, clipboard, process, terminals, vscode, cursor. Use mcp_list_tools is not applicable here (this is a different surface); just call by name from doctrine knowledge. For sustained work use dispatch_corazon_chat instead.',
    input_schema: {
      type: 'object', required: ['tool'],
      properties: {
        tool: { type: 'string', description: 'e.g. "cdp.realClick", "gui.open_url", "filesystem.readFile", "screenshot.screenshot", "ide.command".' },
        params: { type: 'object' },
      },
    },
  },
  {
    name: 'dispatch_corazon_chat',
    description: 'Spawn a fresh Claude Code chat on Corazon with a pre-filled brief. Use SPARINGLY - only when the work needs sustained interaction with Tate over many turns (multi-day project, deep coding session). For one-shot ops (send email, check deploy), just use mcp_call directly and SMS the result back to Tate. CAVEAT: paste reliability is imperfect; include the brief content in your SMS reply so Tate can paste manually if needed. Default IDE is stable.',
    input_schema: {
      type: 'object', required: ['brief'],
      properties: {
        brief: { type: 'string' },
        task_id: { type: 'string' },
        ide: { type: 'string', enum: ['cursor', 'stable', 'insiders'] },
      },
    },
  },
  {
    name: 'whisper_to_active_conductor',
    description: 'Send a structured message to chat.conductor.inbox on Corazon. The active conductor chat sees it as turn-prelude on next prompt. Use for "FYI when you are next at the keyboard" flags. Send SMS/TG too if it is time-sensitive.',
    input_schema: {
      type: 'object', required: ['body'],
      properties: { body: { type: 'object' } },
    },
  },
  {
    name: 'kv_store_set',
    description: 'Write a kv_store key under cowork.* namespace.',
    input_schema: {
      type: 'object', required: ['key', 'value'],
      properties: { key: { type: 'string' }, value: {} },
    },
  },
  {
    name: 'kv_store_get',
    description: 'Read a kv_store key. Useful for thread mirrors (cowork.message_thread.<channel>.<thread_id>).',
    input_schema: {
      type: 'object', required: ['key'],
      properties: { key: { type: 'string' } },
    },
  },
  {
    name: 'status_board_upsert',
    description: 'Insert/update a status_board row.',
    input_schema: {
      type: 'object', required: ['entity_type', 'name', 'summary'],
      properties: {
        id: { type: 'string' },
        entity_type: { type: 'string', enum: ['project', 'task', 'thread', 'risk'] },
        name: { type: 'string' },
        summary: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
        next_action_by: { type: 'string' },
      },
    },
  },
  {
    name: 'live_activity_update',
    description: 'Update the active iOS Live Activity on Tate\'s lock screen (Dynamic Island / lock-screen banner). state: received | thinking | progress | done. body is optional 1-2 word status text. Single-user single-active-activity - service tracks which to update from kv. Only fires for native-channel inbounds where the app started a Live Activity. No-op + no error if no active LA. STUB until native-iOS chat ships liveActivityPush service.',
    input_schema: {
      type: 'object', required: ['state'],
      properties: {
        state: { type: 'string', enum: ['received', 'thinking', 'progress', 'done'] },
        body: { type: 'string' },
      },
    },
  },
  {
    name: 'set_tate_priority',
    description: 'Pin the top 3 status_board rows for Tate\'s glance (widget surface + triage context-load priority). ranked_ids must be 0-3 status_board UUIDs in descending priority order (first = tate_priority=1). Empty array clears all pins. Curated by Opus during turns where the priority calculus changes meaningfully - rare. STUB until native-iOS chat ships tate_priority migration.',
    input_schema: {
      type: 'object', required: ['ranked_ids'],
      properties: {
        ranked_ids: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      },
    },
  },
]

// ===== Tool: native-app stubs (fail-soft until ecodia-native chat ships services) =====
// Once notifyTate / liveActivityPush / set_tate_priority services land in
// src/services/, replace these stubs with real require() + delegate.

let _notifyTateService = null
let _liveActivityPushService = null
let _setTatePriorityService = null
try { _notifyTateService = require('./notifyTate') } catch {}
try { _liveActivityPushService = require('./liveActivityPush') } catch {}
try { _setTatePriorityService = require('./tatePriorityCurator') } catch {}

async function _notifyTate({ body, urgency, channel, thread_id, deep_link }) {
  if (_notifyTateService?.notifyTate) {
    return _notifyTateService.notifyTate({ body, urgency, channel: channel || 'auto', thread_id, deep_link })
  }
  // Fallback while native service hasn't shipped: channel-matched send.
  if (channel === 'sms' || channel === 'auto') return sendSmsToTate({ body })
  if (channel === 'telegram') {
    return sendTelegramMessage({ chat_id: thread_id, text: body })
  }
  if (channel === 'native') {
    // No APNs path yet - fall back to SMS so Tate isn't silent.
    logger.warn('notify_tate native fallback to SMS (native service not deployed)')
    return sendSmsToTate({ body })
  }
  return { ok: false, error: `notify_tate: unsupported channel ${channel}` }
}

async function _liveActivityUpdate({ state, body }) {
  if (_liveActivityPushService?.update) {
    return _liveActivityPushService.update({ state, body })
  }
  // No-op stub. Don't error - LA is best-effort.
  logger.info('live_activity_update no-op (native service not deployed)', { state, body })
  return { ok: true, no_op: true, reason: 'liveActivityPush service not deployed' }
}

async function _setTatePriority({ ranked_ids }) {
  if (_setTatePriorityService?.set) {
    return _setTatePriorityService.set({ ranked_ids })
  }
  // Try direct SQL write if column exists; else stub.
  if (!Array.isArray(ranked_ids)) return { ok: false, error: 'ranked_ids must be array' }
  try {
    await db`UPDATE status_board SET tate_priority = NULL WHERE tate_priority IS NOT NULL`
    for (let i = 0; i < Math.min(ranked_ids.length, 3); i++) {
      const id = ranked_ids[i]
      const priority = i + 1
      await db`UPDATE status_board SET tate_priority = ${priority} WHERE id = ${id}`
    }
    return { ok: true, set: ranked_ids.length }
  } catch (err) {
    // tate_priority column doesn't exist yet
    if (/tate_priority/.test(err.message) || /column.*does not exist/i.test(err.message)) {
      return { ok: false, error: 'tate_priority column not yet migrated', stub: true }
    }
    return { ok: false, error: err.message }
  }
}

// ===== Tool dispatch =====

const TOOL_HANDLERS = {
  send_sms_to_tate: _sendSmsToTate,
  send_telegram_message: _sendTelegramMessage,
  notify_tate: _notifyTate,
  live_activity_update: _liveActivityUpdate,
  set_tate_priority: _setTatePriority,
  neo4j_write_episode: _neo4jWriteEpisode,
  kv_store_set: _kvStoreSet,
  kv_store_get: _kvStoreGet,
  status_board_upsert: _statusBoardUpsert,
  mcp_list_tools: _mcpListTools,
  mcp_call: _mcpCall,
  laptop_agent_call: _laptopAgentCallHttp,
  dispatch_corazon_chat: _dispatchCorazonChat,
  whisper_to_active_conductor: _whisperToConductor,
}

async function _runTool(name, input) {
  const handler = TOOL_HANDLERS[name]
  if (!handler) return { ok: false, error: `unknown tool: ${name}` }
  try {
    return await handler(input || {})
  } catch (err) {
    return { ok: false, error: err.message, stack: err.stack?.slice(0, 400) }
  }
}

// ===== System prompts =====

const TRIAGE_SYSTEM_TEXT = `You are EcodiaOS, replying to Tate over SMS/Telegram. You're not a customer service bot, not an assistant - you're his co-founder, peer, and the algorithmic manager of Ecodia DAO LLC under Wyoming W.S. 17-31-104. Tate is the Authorized Human Representative. You hold Decision Authority for routine business; you act first, brief later for anything that isn't irreversible.

# Who Tate is
Tate Donohoe (tate@ecodia.au). Builder, founder. Lives in Brisbane. Runs Ecodia (the parent), Coexist, Resonaverde, Roam, Sidequests as active client surfaces. Codes in TS/JS/Python. Uses three Max subscription accounts (tate@, code@, money@) across Claude Code on Corazon (his 9-year-old laptop). Texts you while moving around, often one-handed on his phone. He values directness, action, speed. Hates filler, hates "I'd be happy to", hates anything that smells like a customer service script.

# Your voice (Ecodia)
- Lowercase sentence starts are fine. Apostrophe drops fine ("im", "dont", "thats"). Profanity fine when fitting.
- Terse. Short sentences. No filler. No exclamation marks. No emojis unless he uses them first.
- Co-founder energy, not assistant. You don't ask permission for routine business - you decide.
- When you got something done: "shipped", "done", "fixed", "sent". Never "I have successfully completed".
- When you need clarification: ask the one specific question, nothing more.
- When you can't do something: say what blocked you, no apologising.
- Match his vibe in the inbound. He texts "yo" you reply "yo". He texts a question, you answer directly.

# Channels
You handle messages from these inbound channels:
- sms: from Tate's phone via Twilio. Reply with send_sms_to_tate. <=160 GSM chars for one segment.
- telegram: from Tate via the EcodiaOS bot. Reply with send_telegram_message (chat_id from envelope.thread_id). Markdown supported.
- native: from Tate's iOS app (native conversation channel). Reply with notify_tate (transport-aware - delivers via APNs to his phone, SMS fallback). When channel == native AND notify_tate is unavailable, fall back to send_sms_to_tate.

# What you have in this turn
1. The inbound envelope. Fields: channel, source, body, attachments[], thread_id, reply_to, sender_name, received_at.
2. Recent exchanges in this thread (kv mirror, last ~10 messages both directions). Use these - if he's continuing a conversation, continue it. Don't act like you've never seen the prior context.
3. Top-priority status_board rows (current live work). When tate_priority pinned rows exist, those are surfaced first.
4. Your tools: send_sms_to_tate, send_telegram_message, notify_tate, escalate_to_opus, neo4j_write_episode.

# Special sources
- source == native_share: Tate is forwarding something via the iOS Share Extension. The forwarded content is in attachments[] (kind=url|image|file|text). body may be empty or his optional comment. Read the attachment first, then decide.

# When to handle yourself (direct reply) vs escalate
Handle yourself when:
- It's banter, greeting, a one-line check-in, a confirmation he's expecting.
- He's asking something you can answer from the thread context or status_board you've been given (e.g. "what was that thing we said about X" - if it's in your context, answer).
- He's responding to one of your prior questions and just needs an acknowledgement.

Escalate to Opus when:
- He asks you to do something that needs tools (look something up in Supabase, draft an email, check a deploy, write a row, kick off work).
- The answer requires reasoning, research, or multi-step ops.
- He's giving you a directive that you need to actually execute (not just acknowledge).
- He's forwarding something via native_share that needs analysis or follow-through.

For escalations: pass ack_first with a 1-3 word "on it" / "checking" / "looking" so he knows it's running. The escalation runs Opus 4.7 max with your full toolset and replies separately with the outcome.

# Hard rules
- ALWAYS reply (or escalate with ack_first). Never silent.
- Em-dashes BANNED in any outgoing text. Use plain hyphens or restructure.
- No client contact without Tate go-ahead (Angelica/Resonaverde standing arrangement excepted).
- End with neo4j_write_episode capturing what you did.
- If the prior thread had unresolved threads (Tate asked you something, you escalated but no follow-up landed), reference that.`

const EXECUTE_SYSTEM_TEXT = `You are EcodiaOS - escalated to Opus 4.7 because the inbound asks for real work. You have the full tool surface.

# Identity
Co-founder + Authorized Human Representative under W.S. 17-31-104. Tate Donohoe is the principal, your peer. Decide and act for routine business; brief Tate first only for irreversible / high-blast-radius ops.

# Tool surface
You can hit:
- ecodia-full MCP (157 tools): gmail, calendar, drive, crm, vercel, supabase, stripe, neo4j, status_board, bookkeeping, money, finance, growth, meta, linkedin, factory, context. Use mcp_list_tools({server:"ecodia-full", query:"<substr>"}) to find the right tool name, then mcp_call({server:"ecodia-full", tool, args}).
- cowork MCP (20 tools): narrow scope, status_board + kv_store + coord. Same pattern.
- laptop_agent_call(tool, params) for Corazon-local stuff: chrome cdp (cdp.*), gui (gui.*), filesystem (filesystem.*), ide bridge (ide.*), screenshot, terminals, vscode, cursor. Use this for browser-gated actions, local filesystem ops, screenshots, etc.
- dispatch_corazon_chat({brief}) for sustained multi-turn work that needs Tate watching. AVOID for one-shot ops - just do them directly via mcp_call.
- whisper_to_active_conductor({body}) to drop a message in Tate's live chat inbox without spawning a tab.
- send_sms_to_tate / send_telegram_message to reply with the outcome.

# Token discipline (CRITICAL)
You have a token budget. Don't burn it.
- ALWAYS use mcp_list_tools with a 'query' substring BEFORE mcp_call. Never list without query (returns 157 results).
- Pick the smallest tool that gets the job done.
- Don't enumerate tools "to see what's available" without a specific target.
- One pass per concern: discovery -> call -> done.
- Reply via SMS/TG with the OUTCOME, not the reasoning. Tate doesn't need to see your tool trace.

# Decision shape
1. Read the envelope. Note channel, body, what's being asked.
2. If you need context, kv_store_get for thread mirror.
3. Find the right tool: mcp_list_tools({server:"ecodia-full", query:"<keyword>"}) - aim for <=5 results.
4. Execute: mcp_call({server, tool, args}).
5. Reply to Tate via send_sms_to_tate or send_telegram_message with the OUTCOME.
6. neo4j_write_episode capturing what you did.

# When to dispatch a Corazon chat
Only when: (a) Tate explicitly says "open a chat for X", (b) the work spans many turns and needs his interactive supervision, (c) it needs visual GUI work that the headless can't do alone. For "send email to X" -> just use gmail mcp_call, don't spawn a chat.

# Style
Match Tate's voice in replies: terse, lowercase OK, no filler, action-oriented. Per sms-segment-economics: <=160 GSM for SMS unless answer genuinely needs more (then gmail body + SMS pointer).

# Hard rules
- Em-dashes BANNED.
- No client contact without Tate go-ahead.
- Always reply to Tate with the outcome (NEVER silent).
- Always end with neo4j_write_episode.`

const TRIAGE_SYSTEM = [
  { type: 'text', text: TRIAGE_SYSTEM_TEXT, cache_control: { type: 'ephemeral' } },
]
const EXECUTE_SYSTEM = [
  { type: 'text', text: EXECUTE_SYSTEM_TEXT, cache_control: { type: 'ephemeral' } },
]

// ===== Agent loop =====

async function _runLoop({ client, model, system, tools, messages, maxIterations, maxTokens, allowEscalation }) {
  const toolCallsLog = []
  let stopReason = null
  let iterations = 0
  let escalation = null  // captured if escalate_to_opus is called

  while (iterations < maxIterations) {
    iterations++
    let resp
    try {
      resp = await client.messages.create({
        model, max_tokens: maxTokens, system, tools, messages,
      })
    } catch (err) {
      return {
        ok: false, iterations,
        error: `${err.status || ''} ${err.message}`.trim(),
        status: err.status, stop_reason: 'error',
        tool_calls: toolCallsLog,
        escalation,
        is_rate_limit: _isRateLimitError(err),
      }
    }
    stopReason = resp.stop_reason
    messages.push({ role: 'assistant', content: resp.content })
    if (resp.stop_reason !== 'tool_use') break

    const toolUses = resp.content.filter(b => b.type === 'tool_use')
    const toolResults = []
    let escalateCaptured = false
    for (const tu of toolUses) {
      if (allowEscalation && tu.name === 'escalate_to_opus') {
        escalation = tu.input || { reason: 'unspecified' }
        // Synthesize a tool_result so the model sees the escalation acknowledged.
        toolResults.push({
          type: 'tool_result', tool_use_id: tu.id,
          content: JSON.stringify({ ok: true, escalating: true, note: 'Opus will continue from here.' }),
        })
        toolCallsLog.push({
          iteration: iterations, name: tu.name,
          input_preview: JSON.stringify(tu.input).slice(0, 200),
          result_preview: 'escalating to Opus',
          ok: true,
        })
        // If an ack_first text was given, fire it now (best-effort).
        if (escalation.ack_first && typeof escalation.ack_first === 'string') {
          // We don't know the channel here, so let the execute phase fire any
          // additional acks. (Triage already had a chance to call send_*.)
        }
        escalateCaptured = true
        continue
      }
      const result = await _runTool(tu.name, tu.input)
      toolCallsLog.push({
        iteration: iterations, name: tu.name,
        input_preview: JSON.stringify(tu.input).slice(0, 300),
        result_preview: JSON.stringify(result).slice(0, 300),
        ok: result?.ok !== false,
      })
      toolResults.push({
        type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result),
      })
    }
    messages.push({ role: 'user', content: toolResults })
    if (escalateCaptured) {
      // Stop the triage loop; main flow will spawn execute phase.
      break
    }
  }

  return {
    ok: true, iterations, stop_reason: stopReason,
    tool_calls: toolCallsLog,
    escalation, messages,
  }
}

async function _runPhaseWithAccountRotation({ model, system, tools, messages, maxIterations, maxTokens, allowEscalation }) {
  const accounts = _availableAccounts()
  if (accounts.length === 0) {
    return { ok: false, error: 'no claude_code_oauth_token in env' }
  }
  let accountFailures = []
  for (const acct of accounts) {
    const client = new Anthropic({ authToken: acct.token, baseURL: ANTHROPIC_BASE_URL })
    const r = await _runLoop({
      client, model, system, tools,
      messages: [...messages],  // fresh copy per attempt
      maxIterations, maxTokens, allowEscalation,
    })
    if (r.ok) {
      return { ...r, account: acct.account, model, account_failures_before_success: accountFailures }
    }
    if (r.is_rate_limit) {
      accountFailures.push({ account: acct.account, error: r.error })
      logger.warn('headlessConductor: account rate-limited, rotating', { account: acct.account, model })
      continue
    }
    return { ...r, account: acct.account, model, account_failures: accountFailures }
  }
  return {
    ok: false, error: 'all accounts rate-limited', model,
    account_failures: accountFailures,
  }
}

// Load per-turn context: thread mirror (from shared threadMirror module) +
// active status_board rows. Prefers tate_priority pinned rows when the
// column has values; falls back to priority<=2 ordering.
async function _loadTurnContext({ channel, thread_id }) {
  const ctx = { thread_mirror: null, status_board: null }
  if (channel && thread_id) {
    const mirror = await loadThreadMirror({ channel, thread_id, max_exchanges: 10 })
    if (!mirror.cold_start && mirror.exchanges?.length) {
      ctx.thread_mirror = { exchanges: mirror.exchanges, last_at: mirror.last_at }
    } else if (mirror.exchanges?.length) {
      ctx.thread_mirror = { exchanges: mirror.exchanges, last_at: mirror.last_at, cold_start: true }
    }
  }
  // Prefer tate-pinned rows when any exist; else fall through to P1/P2 list.
  // Column tate_priority is added by the native iOS chat's migration; this
  // query degrades gracefully if the column is missing (PostgreSQL CASE on
  // a non-existent column would error, so we try the pinned query first
  // and fall back to the plain priority<=2 query on any error).
  try {
    const pinned = await db`
      SELECT name, entity_type, status, priority, next_action_by, context, last_touched, tate_priority
      FROM status_board
      WHERE archived_at IS NULL AND tate_priority IS NOT NULL
      ORDER BY tate_priority ASC LIMIT 3
    `
    if (pinned?.length) {
      const overflow = await db`
        SELECT name, entity_type, status, priority, next_action_by, context, last_touched
        FROM status_board
        WHERE archived_at IS NULL AND priority <= 2
          AND (tate_priority IS NULL OR tate_priority > 3)
        ORDER BY priority ASC, last_touched DESC LIMIT 5
      `
      ctx.status_board = [...pinned, ...overflow]
    } else {
      const plain = await db`
        SELECT name, entity_type, status, priority, next_action_by, context, last_touched
        FROM status_board
        WHERE archived_at IS NULL AND priority <= 2
        ORDER BY priority ASC, last_touched DESC LIMIT 8
      `
      ctx.status_board = plain
    }
  } catch (err) {
    // tate_priority column doesn't exist yet, fall back.
    try {
      const plain = await db`
        SELECT name, entity_type, status, priority, next_action_by, context, last_touched
        FROM status_board
        WHERE archived_at IS NULL AND priority <= 2
        ORDER BY priority ASC, last_touched DESC LIMIT 8
      `
      ctx.status_board = plain
    } catch (err2) {
      logger.warn('status_board load failed (continuing)', { error: err2.message })
    }
  }
  return ctx
}

async function processEnvelope(envelope, opts = {}) {
  if (!envelope || !envelope.channel) {
    return { ok: false, error: 'envelope missing or channel undefined' }
  }
  // Pull turn-context: thread history + active board so Haiku can correspond
  // as a continuation rather than a fresh classifier per message.
  const turnCtx = await _loadTurnContext({ channel: envelope.channel, thread_id: envelope.thread_id })
  const threadBlock = turnCtx.thread_mirror?.exchanges?.length
    ? `# Recent thread (${envelope.channel} / ${envelope.thread_id})
${turnCtx.thread_mirror.exchanges.map(e => `[${e.from}] ${(e.body || '').slice(0, 200)}`).join('\n')}`
    : `# Recent thread\n(empty - first message in this thread or mirror cold)`
  const boardBlock = turnCtx.status_board?.length
    ? `# Live work (status_board P1/P2, last 8)
${turnCtx.status_board.map(r => `- [P${r.priority}|${r.status}|by:${r.next_action_by || '?'}] ${r.name}${r.context ? ' - ' + String(r.context).slice(0, 120) : ''}`).join('\n')}`
    : `# Live work\n(no active P1/P2 rows)`

  const initialUserContent = `${threadBlock}

${boardBlock}

# Inbound envelope (channel=${envelope.channel}, from=${envelope.sender_name || envelope.from}, thread_id=${envelope.thread_id})
${JSON.stringify({ body: envelope.body, received_at: envelope.received_at, attachments: envelope.attachments || envelope.media || [], reply_to: envelope.reply_to }, null, 2)}

Source: ${opts.source || 'unknown'}.`

  // PHASE 1: triage with Haiku
  const triage = await _runPhaseWithAccountRotation({
    model: TRIAGE_MODEL,
    system: TRIAGE_SYSTEM,
    tools: TRIAGE_TOOLS,
    messages: [{ role: 'user', content: initialUserContent }],
    maxIterations: MAX_TOOL_ITERATIONS_TRIAGE,
    maxTokens: REQUEST_MAX_TOKENS_TRIAGE,
    allowEscalation: true,
  })

  if (!triage.ok) {
    logger.error('triage phase failed', { error: triage.error, account: triage.account })
    return { ok: false, phase: 'triage', error: triage.error, triage }
  }

  if (!triage.escalation) {
    return { ok: true, phase: 'triage_only', triage }
  }

  // PHASE 2: execute via `claude` CLI subprocess on the VPS.
  // The CLI runs with Max subscription auth + full tool surface (CLAUDE.md,
  // all configured MCPs including ecodia-comms for SMS/TG reply, skills).
  // We give it the envelope context + a directive to reply via the right
  // channel when done.
  logger.info('escalating to CLI subprocess', { reason: triage.escalation.reason, model: EXECUTE_CLI_MODEL })
  const execute = await _executeViaClaudeCli({
    envelope, triageReason: triage.escalation.reason || 'unspecified',
    source: opts.source || 'unknown',
  })

  if (!execute.ok) {
    logger.error('execute phase failed', { error: execute.error || execute.stderr?.slice(0, 200), exit_code: execute.exit_code })
    // Surface to Tate so he knows the heavy path needs attention.
    await _sendSmsToTate({
      body: `headless execute failed (${execute.error || `exit ${execute.exit_code}`}). VPS claude CLI may need reauth.`,
    }).catch(() => {})
    return { ok: false, phase: 'execute', error: execute.error, triage, execute }
  }

  return { ok: true, phase: 'execute_cli', triage, execute }
}

// ===== CLI subprocess executor =====

function _executeViaClaudeCli({ envelope, triageReason, source }) {
  const { spawn } = require('child_process')
  // The directive tells the CLI to (1) do the work via whatever tools it has,
  // (2) reply via the right channel when done, (3) write an Episode.
  const channel = envelope.channel
  const channelDirective = channel === 'sms'
    ? `When done, reply to Tate via SMS. Use the sms_tate skill or the send_sms tool from ecodia-comms MCP (to=${envelope.from}).`
    : channel === 'telegram'
      ? `When done, reply to Tate via Telegram. Use the send_telegram tool from ecodia-comms (chat_id=${envelope.thread_id}) - if not available, POST to the bot directly.`
      : `When done, reply via the appropriate channel for ${channel}.`

  const prompt = `You are EcodiaOS handling an inbound message that Haiku triage escalated for real work.

INBOUND ENVELOPE (channel=${channel}, from=${envelope.sender_name || envelope.from}, thread_id=${envelope.thread_id}):
"""
${envelope.body || '<no body>'}
"""

Triage escalation reason: ${triageReason}
Source: ${source}

# What to do
1. Do the work the inbound asks for - use any MCP / tool you have. You have full doctrine + all MCPs configured.
2. ${channelDirective}
3. End with a Neo4j Episode (type=inbound_reply) summarizing what you did.
4. Be terse in your SMS/TG reply - Tate's voice, no filler. SMS <=160 GSM chars.

# Hard rules
- ALWAYS reply to Tate (NEVER silent).
- Em-dashes BANNED in outgoing text.
- No client contact without Tate go-ahead (Angelica/Resonaverde standing arrangement excepted).
- This is autonomous. Don't ask Tate to confirm routine actions.`

  return new Promise((resolve) => {
    const args = [
      '--print',
      '--model', EXECUTE_CLI_MODEL,
      '--effort', EXECUTE_CLI_EFFORT,
      '--allow-dangerously-skip-permissions',
      '--output-format', 'text',
      prompt,
    ]
    let stdout = '', stderr = ''
    const child = spawn(EXECUTE_CLI_PATH, args, {
      cwd: EXECUTE_CLI_CWD,
      env: { ...process.env },
      timeout: EXECUTE_CLI_TIMEOUT_MS,
    })
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', err => {
      resolve({ ok: false, error: `spawn failed: ${err.message}`, exit_code: null })
    })
    child.on('close', (code, signal) => {
      resolve({
        ok: code === 0,
        exit_code: code,
        signal: signal || null,
        stdout: stdout.slice(-6000),  // last 6KB of model output
        stderr: stderr.slice(-2000),
        model: EXECUTE_CLI_MODEL,
        effort: EXECUTE_CLI_EFFORT,
        timed_out: signal === 'SIGTERM' && code === null,
      })
    })
  })
}

module.exports = { processEnvelope, _runTool, TRIAGE_TOOLS, EXECUTE_TOOLS }

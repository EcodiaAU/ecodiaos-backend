/**
 * Cowork V2 MCP - JSON-RPC 2.0 shim over the existing REST substrate.
 *
 * Translates Anthropic's Model Context Protocol (https://spec.modelcontextprotocol.io/)
 * methods (initialize / tools/list / tools/call / prompts/list / resources/list /
 * notifications/initialized) into the existing 17 V2 REST endpoints in cowork.js.
 *
 * Mounted at POST /api/mcp/cowork/ (root) so claude.ai/settings/connectors custom
 * connector handshake works. Auth is enforced by the same coworkAuth middleware
 * that protects all other V2 routes (applied at the router level in cowork.js).
 *
 * tools/call dispatches via in-process synthetic-request injection into the
 * existing handler chain - NOT loopback HTTP. This preserves scope checks,
 * idempotency, audit logging, and rate caps without duplicating logic.
 *
 * Spec: https://spec.modelcontextprotocol.io/specification/2025-03-26/
 * Authored: 30 Apr 2026 by fork_mokuef8j_5ad613.
 */
'use strict'

const logger = require('../../config/logger')
const coworkAuth = require('../../middleware/coworkAuth')

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = Object.freeze({
  name: 'EcodiaOS Cowork V2',
  version: '2.0.0',
})

// ── Tools metadata ───────────────────────────────────────────────────────
// One entry per V2 endpoint. Names match the route paths in cowork.js
// (without the leading slash). Schemas keep additionalProperties: true so
// we don't have to chase schema-drift for v1 of the shim.
const TOOLS = Object.freeze([
  {
    name: 'status_board.query',
    description:
      'Query the EcodiaOS status_board for active rows. Filters: entity_type, next_action_by, priority_lte, archived, min_last_touched. order_by: priority_asc | last_touched_desc | due_asc.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            entity_type: { type: 'string', description: 'client | project | thread | task | opportunity | legal | infrastructure | personal' },
            next_action_by: { type: 'string', description: 'ecodiaos | tate | client | external' },
            priority_lte: { type: 'integer', description: '1=critical .. 5=low' },
            archived: { type: 'boolean', description: 'include archived rows; default false' },
            min_last_touched: { type: 'string', format: 'date-time' },
          },
          additionalProperties: true,
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        order_by: { type: 'string', enum: ['priority_asc', 'last_touched_desc', 'due_asc'], default: 'priority_asc' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'status_board.upsert',
    description:
      'Insert or update a status_board row in cowork-owned scope. Provide id to update; omit to insert. entity_type+name required for insert. archived_at is locked. entity_type=legal|infrastructure cannot be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'UUID. Omit to insert a new row.' },
        entity_type: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        next_action: { type: 'string' },
        next_action_by: { type: 'string', enum: ['ecodiaos', 'tate', 'client', 'external'] },
        next_action_due: { type: 'string', format: 'date-time' },
        context: { type: 'string' },
        priority: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'kv_store.get',
    description:
      'Read one or more kv_store keys. Either key (single) or keys (array). Read-deny prefix: creds.* (returns scope_denied for that key but other keys still resolve in batch mode).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        keys: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'kv_store.set',
    description:
      'Write a kv_store key. Allowed namespaces: cowork.* and cowork-session.*. Other prefixes return scope_denied.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Must start with cowork. or cowork-session.' },
        value: { description: 'Any JSON-serialisable value.' },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['key', 'value'],
      additionalProperties: true,
    },
  },
  {
    name: 'neo4j.search',
    description:
      'Search the Neo4j knowledge graph. modes: semantic (vector embedding), substring/keyword, cypher (read-only - write keywords blocked).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Required for semantic | substring | keyword.' },
        mode: { type: 'string', enum: ['semantic', 'substring', 'keyword', 'cypher'], default: 'semantic' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        labels: { type: 'array', items: { type: 'string' } },
        cypher: { type: 'string', description: 'Required when mode=cypher. CREATE/MERGE/SET/DELETE/REMOVE/DROP rejected.' },
        params: { type: 'object', description: 'Cypher params (read-only mode).' },
        min_score: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'neo4j.write_episode',
    description:
      'Create or update an Episode node in Neo4j. type must be in: cowork_dispatch | cowork_realisation | cowork_audit | conductor_observed. Optional related_entities[] creates labelled relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['cowork_dispatch', 'cowork_realisation', 'cowork_audit', 'conductor_observed'], default: 'cowork_dispatch' },
        transcript_excerpt: { type: 'string', description: 'Truncated to 4000 chars server-side.' },
        cowork_session_id: { type: 'string' },
        related_entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Neo4j label, e.g. Person, Organization, Project.' },
              name: { type: 'string', description: 'Target node name.' },
              rel_type: { type: 'string', description: 'Relationship type, e.g. RELATES_TO, MENTIONS.' },
            },
            additionalProperties: true,
          },
        },
        idempotency_key: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: true,
    },
  },
  {
    name: 'neo4j.write_decision',
    description:
      'Create or update a Decision node in Neo4j. supersedes archives the named prior Decision (cowork-authored only - non-cowork prior decisions are protected).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        rationale: { type: 'string' },
        supersedes: { type: 'string', description: 'name of prior Decision to archive' },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: true,
    },
  },
  {
    name: 'forks.spawn',
    description:
      'Spawn a new fork in the cowork pool. brief is the dispatch text (the fork inherits 100% of conductor context at spawn). cowork pool cap = 3 concurrent. context_mode = recent (default) | full.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string' },
        context_mode: { type: 'string', enum: ['recent', 'full'], default: 'recent' },
        cowork_session_id: { type: 'string' },
      },
      required: ['brief'],
      additionalProperties: true,
    },
  },
  {
    name: 'forks.list',
    description:
      'List forks. filter.parent default=cowork; pass "*" for all parents. filter.status filters spawning|running|reporting|completed|failed.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            parent: { type: 'string', description: 'cowork | conductor | * (all)' },
            status: { type: 'string' },
          },
          additionalProperties: true,
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'patterns.semantic_search',
    description: 'Semantic search over the ~/ecodiaos/patterns/ doctrine corpus.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
      additionalProperties: true,
    },
  },
  {
    name: 'email_threads.read',
    description:
      'Read email threads with filters. from_contains is ILIKE substring; thread_id|client_id|triage_priority|inbox=label-name; since=ISO timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            from_contains: { type: 'string' },
            since: { type: 'string', format: 'date-time' },
            thread_id: { type: 'string' },
            client_id: { type: 'string', description: 'UUID' },
            triage_priority: { type: 'string' },
            inbox: { type: 'string', description: 'Gmail label name' },
          },
          additionalProperties: true,
        },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'crm.get_intelligence',
    description:
      'Get full client intelligence (projects, emails, tasks, revenue). Provide client_id (UUID), client_slug, or search (substring of name).',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID' },
        client_slug: { type: 'string' },
        search: { type: 'string', description: 'Substring of client name' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'os_session.message',
    description:
      'Send a message to the conductor OS session. mode=queue (default - appended to message_queue, processed when conductor is idle) | direct (streams immediately into the active session, rate-capped).',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        mode: { type: 'string', enum: ['queue', 'direct'], default: 'queue' },
        cowork_session_id: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: true,
    },
  },
  {
    name: 'cowork.log_session',
    description:
      'Log the end of a cowork session - writes a cowork_sessions row + a Neo4j Episode summarising the dispatch.',
    inputSchema: {
      type: 'object',
      properties: {
        cowork_session_id: { type: 'string' },
        started_at: { type: 'string', format: 'date-time' },
        ended_at: { type: 'string', format: 'date-time' },
        outcome: { type: 'string', default: 'completed' },
        outcome_reason: { type: 'string' },
        transcript_summary: { type: 'string' },
        transcript_full_url: { type: 'string' },
        tools_called: { type: 'array', items: { type: 'string' } },
        idempotency_key: { type: 'string' },
      },
      required: ['cowork_session_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'cowork.heartbeat',
    description:
      'Heartbeat ping. Updates kv_store.cowork.last_heartbeat and broadcasts via WS. Returns conductor inbox count + suggested_action.',
    inputSchema: {
      type: 'object',
      properties: {
        cowork_session_id: { type: 'string' },
        status: { type: 'string', enum: ['active', 'idle', 'thinking'], default: 'active' },
        current_action: { type: 'string' },
      },
      required: ['cowork_session_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'cowork.session_started',
    description: 'Register the start of a cowork session. initiated_by = cowork-self | conductor-dispatched | tate-dispatched.',
    inputSchema: {
      type: 'object',
      properties: {
        cowork_session_id: { type: 'string' },
        intent: { type: 'string' },
        initiated_by: { type: 'string', enum: ['cowork-self', 'conductor-dispatched', 'tate-dispatched'], default: 'cowork-self' },
      },
      required: ['cowork_session_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'inbox.read',
    description:
      'Read messages from cowork_inbox (conductor → cowork queue). ack=true marks the read messages as acked so subsequent reads skip them.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', format: 'date-time' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        ack: { type: 'boolean', default: false },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'gmail.send',
    description:
      "Send an email from code@ecodia.au or tate@ecodia.au. Subject + body + optional cc/bcc/thread_id/attachments. Audit logs to/subject/length only - body excluded. Rate cap 50/day.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', enum: ['code', 'tate'], default: 'code', description: "'code' = code@ecodia.au, 'tate' = tate@ecodia.au" },
        to: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Recipient email(s). String or array.',
        },
        cc: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        bcc: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text email body.' },
        thread_id: { type: 'string', description: 'Gmail thread id to thread the reply into.' },
        attachments: {
          type: 'array',
          maxItems: 10,
          description: 'Optional file attachments. Each: { filename, content_type, content_base64 }. Per-file cap 8MB, total cap 20MB, max 10 files.',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: 'Filename shown in the email (e.g. "stats.pdf")' },
              content_type: { type: 'string', description: 'MIME type, e.g. "application/pdf", "image/png". Defaults to application/octet-stream.' },
              content_base64: { type: 'string', description: 'File bytes encoded as standard base64.' },
            },
            required: ['filename', 'content_base64'],
            additionalProperties: false,
          },
        },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: true,
    },
  },
  {
    name: 'sms.tate',
    description:
      "Send a 1-segment SMS to Tate's phone (+61404247153). Enforces segment economics (160 GSM, 70 Unicode). 6h same-body dedupe + 3/day rate cap unless urgency=critical. Body is auto-stripped of greetings/signoffs/filler. For critical/decision/delta updates only.",
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Pre-stripping message. Server strips filler and validates 1-segment cap.' },
        urgency: { type: 'string', enum: ['critical', 'decision', 'delta', 'fyi'], default: 'fyi', description: 'critical bypasses dedupe + rate cap.' },
        dry_run: { type: 'boolean', default: false, description: 'If true, validates + strips but does not send to Twilio.' },
        cowork_session_id: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: true,
    },
  },
  {
    name: 'scheduler.cron',
    description:
      "Schedule a recurring task. name auto-prefixed with 'cowork.' if not already. schedule: 'every 30m' | 'every 2h' | 'daily HH:MM' (AEST). Rate cap 20/day shared with scheduler.delayed.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Task name. Auto-prefixed with 'cowork.' if not already." },
        schedule: { type: 'string', description: "'every 30m' | 'every 2h' | 'daily HH:MM' (AEST = UTC+10)" },
        prompt: { type: 'string', description: 'The prompt fired when the task runs.' },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['name', 'schedule', 'prompt'],
      additionalProperties: true,
    },
  },
  {
    name: 'scheduler.delayed',
    description:
      "Schedule a one-shot future task. name auto-prefixed with 'cowork.' if not already. delay: 'in 30m' | 'in 3h' | 'in 30d' | ISO datetime. Rate cap 20/day shared with scheduler.cron.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Task name. Auto-prefixed with 'cowork.' if not already." },
        delay: { type: 'string', description: "'in 30m' | 'in 3h' | 'in 30d' | ISO datetime" },
        prompt: { type: 'string', description: 'The prompt fired when the task runs.' },
        cowork_session_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['name', 'delay', 'prompt'],
      additionalProperties: true,
    },
  },
  {
    name: 'scheduler.list',
    description:
      "List scheduled tasks. Default filter: cowork-owned (name starts with 'cowork.'). Pass filter.name_prefix='*' for unfiltered, or any other prefix to filter.",
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            name_prefix: { type: 'string', description: "default 'cowork.', '*' for unfiltered" },
            status: { type: 'string', enum: ['active', 'paused', 'completed', 'failed', 'cancelled'] },
          },
          additionalProperties: true,
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'checkpoint.schedule',
    description:
      'Schedule the next wake-up in a multi-hour project chain. Composes a self-resuming Routine prompt that reads chain state, executes action_brief, decides next step, and either re-schedules (iteration+1) or terminates. wake_in: "in 30m" | "in 2h" | "tomorrow HH:MM" | ISO datetime. Defaults: account=code, iteration=1, max_iterations=20. Hard caps: max_iterations<=50, chain wall-time<=7d. Returns chain_id + task_id + wake_at.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id:     { type: 'string', description: 'status_board row id this chain advances.' },
        wake_in:        { type: 'string', description: '"in 30m" | "in 2h" | "tomorrow HH:MM" | ISO 8601 datetime' },
        action_brief:   { type: 'string', description: 'What future-me should do when waking. Read by the composed Routine prompt.' },
        chain_id:       { type: 'string', description: 'Optional. Auto-generated on iteration=1. Pass the same id on subsequent iterations.' },
        iteration:      { type: 'integer', minimum: 1, default: 1, description: '1-based checkpoint counter for this chain.' },
        max_iterations: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        account:        { type: 'string', enum: ['tate', 'code', 'money'], default: 'code', description: 'Which account fires the wake-up Routine.' },
        cowork_session_id: { type: 'string' },
        idempotency_key:   { type: 'string' },
      },
      required: ['project_id', 'wake_in', 'action_brief'],
      additionalProperties: true,
    },
  },
  {
    name: 'checkpoint.status',
    description:
      'Read chain state + all os_scheduled_tasks rows associated with a checkpoint chain.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: { type: 'string' },
      },
      required: ['chain_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'checkpoint.list',
    description:
      'List checkpoint chains in kv_store.cowork.checkpoint_chains.*. Filter by status (default "active"); pass "all" for everything.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'stopped', 'archived', 'completed', 'failed', 'blocked', 'all'], default: 'active' },
        limit:  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'checkpoint.stop',
    description:
      'Emergency-stop a checkpoint chain. Marks chain state stopped and pauses all active os_scheduled_tasks rows whose name starts with cowork.checkpoint.<chain_id>.',
    inputSchema: {
      type: 'object',
      properties: {
        chain_id: { type: 'string' },
        reason:   { type: 'string' },
        cowork_session_id: { type: 'string' },
        idempotency_key:   { type: 'string' },
      },
      required: ['chain_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'stream.list_channels',
    description:
      'List the streaming substrate channel registry from backend/streaming/channels.json. Returns name, description, publisher, retention_count, retention_ttl_seconds for each channel.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  },
  {
    name: 'stream.tail',
    description:
      'Synchronous tail of the most recent events on a channel. Returns immediately. limit default 20, max 500.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name from stream.list_channels.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
      },
      required: ['channel'],
      additionalProperties: true,
    },
  },
  {
    name: 'stream.subscribe',
    description:
      'Open a bounded SSE-style subscription on a channel and return all events received in the duration_seconds window. Bounded so the MCP call cannot block forever. duration_seconds default 60, max 300.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        duration_seconds: { type: 'integer', minimum: 1, maximum: 300, default: 60 },
        since_id: { type: 'string', description: 'Optional. Replay events newer than this id before the live tail.' },
      },
      required: ['channel'],
      additionalProperties: true,
    },
  },
  {
    name: 'stream.publish',
    description:
      'Publish an event to a channel. Useful for broadcasting "I just shipped X" notifications other surfaces (live dashboards, CodeLens) can react to.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        event_type: { type: 'string', description: 'Free-form event class, e.g. vercel.deploy.ready.' },
        payload: { description: 'Any JSON-serialisable value.' },
      },
      required: ['channel', 'event_type'],
      additionalProperties: true,
    },
  },
])

const TOOL_NAMES = new Set(TOOLS.map(t => t.name))

// ── JSON-RPC 2.0 envelope helpers ────────────────────────────────────────
const RPC_ERR = Object.freeze({
  PARSE_ERROR:      { code: -32700, message: 'Parse error' },
  INVALID_REQUEST:  { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS:   { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR:   { code: -32603, message: 'Internal error' },
  // Server-defined (-32000..-32099 reserved for impl). MCP-tools/call only.
  UNAUTHENTICATED:  { code: -32000, message: 'unauthenticated' },
})

// ── Programmatic coworkAuth wrap ─────────────────────────────────────────
// The shim is mounted BEFORE the router-level coworkAuth so MCP discovery
// methods (initialize / tools/list / etc.) flow publicly. tools/call is
// privileged and runs coworkAuth here against the *parent* request so the
// downstream synthetic dispatch sees req.coworkScopes etc. populated by the
// real middleware (single source of truth, no logic duplication).
function _runCoworkAuth(parentReq) {
  return new Promise((resolve, reject) => {
    let settled = false
    const fakeRes = {
      _status: 200,
      status(code) { this._status = code; return this },
      json(body) {
        if (settled) return this
        settled = true
        const err = new Error((body && body.message) || 'auth_failed')
        err._coworkAuthFail = true
        err._coworkAuthBody = body || { error: 'auth_failed' }
        err._coworkAuthStatus = this._status
        reject(err)
        return this
      },
    }
    const next = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    Promise.resolve()
      .then(() => coworkAuth(parentReq, fakeRes, next))
      .catch((e) => { if (!settled) { settled = true; reject(e) } })
  })
}

function rpcError(id, err, details) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code: err.code,
      message: err.message,
      ...(details !== undefined ? { data: details } : {}),
    },
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

// ── In-process dispatch into existing V2 router handler chain ────────────
// Reuses scope middleware + the route's main handler. Synthesises a request
// that carries forward the parent req's coworkScopes / coworkBearerFingerprint
// / coworkBearerRow so audit logging + scope checks still work.
function dispatchTool(router, parentReq, toolName, args) {
  return new Promise((resolve) => {
    const layer = router.stack.find(l => l.route && l.route.path === `/${toolName}`)
    if (!layer) {
      return resolve({
        statusCode: 404,
        body: { error: 'tool_not_found', message: `no route registered for /${toolName}` },
        headers: {},
      })
    }
    const handlers = layer.route.stack.map(s => s.handle)

    // Synthesise req. Object.assign preserves coworkScopes etc.
    const syntheticReq = Object.assign(
      Object.create(Object.getPrototypeOf(parentReq) || Object.prototype),
      parentReq,
      {
        body: args && typeof args === 'object' ? args : {},
        method: 'POST',
        url: '/' + toolName,
        originalUrl: '/api/mcp/cowork/' + toolName,
      }
    )

    let settled = false
    const finish = (out) => {
      if (settled) return
      settled = true
      resolve(out)
    }

    const syntheticRes = {
      _status: 200,
      _headers: {},
      headersSent: false,
      status(code) { this._status = code; return this },
      setHeader(name, value) { this._headers[name] = value; return this },
      getHeader(name) { return this._headers[name] },
      json(obj) {
        this.headersSent = true
        finish({ statusCode: this._status, body: obj, headers: this._headers })
        return this
      },
      send(obj) {
        this.headersSent = true
        if (typeof obj === 'object' && obj !== null) return this.json(obj)
        finish({ statusCode: this._status, body: { text: String(obj) }, headers: this._headers })
        return this
      },
      end() {
        this.headersSent = true
        finish({ statusCode: this._status, body: null, headers: this._headers })
        return this
      },
    }

    let i = 0
    const next = (err) => {
      if (settled) return
      if (err) {
        return finish({ statusCode: 500, body: { error: 'middleware_error', message: err?.message || String(err) }, headers: {} })
      }
      if (i >= handlers.length) {
        return finish({ statusCode: 404, body: { error: 'no_handler', message: 'handler chain exhausted' }, headers: {} })
      }
      const handler = handlers[i++]
      try {
        const ret = handler(syntheticReq, syntheticRes, next)
        if (ret && typeof ret.catch === 'function') {
          ret.catch((e) => next(e))
        }
      } catch (e) {
        next(e)
      }
    }
    next()
  })
}

// ── JSON-RPC method dispatchers ──────────────────────────────────────────
async function _handleSingle(router, parentReq, rpcBody) {
  const id = rpcBody.id
  const method = rpcBody.method
  const params = rpcBody.params || {}
  // Per JSON-RPC 2.0: a Notification has no id field. Notifications get NO response.
  const isNotification = id === undefined

  try {
    // initialize - discovery handshake
    if (method === 'initialize') {
      return rpcResult(id ?? null, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools:     { listChanged: false },
          prompts:   { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      })
    }

    // notifications - no response body
    if (method === 'notifications/initialized' || method === 'initialized') {
      return null
    }

    // ping - keepalive
    if (method === 'ping') {
      return rpcResult(id ?? null, {})
    }

    // tools/list
    if (method === 'tools/list') {
      return rpcResult(id ?? null, { tools: TOOLS })
    }

    // prompts/list - empty for v1 of shim
    if (method === 'prompts/list') {
      return rpcResult(id ?? null, { prompts: [] })
    }

    // resources/list - empty for v1 of shim
    if (method === 'resources/list') {
      return rpcResult(id ?? null, { resources: [] })
    }

    // tools/call - dispatch to V2 handler. Bearer enforced HERE (not at the
    // router level) so MCP discovery methods above flow publicly per spec.
    if (method === 'tools/call') {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}

      if (!toolName || typeof toolName !== 'string') {
        return rpcError(id ?? null, RPC_ERR.INVALID_PARAMS, { reason: 'name (string) required' })
      }
      if (!TOOL_NAMES.has(toolName)) {
        return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { reason: 'unknown tool', tool: toolName })
      }

      // Run coworkAuth against the parent req. On success it populates
      // req.coworkScopes / coworkBearerFingerprint / coworkBearerRow which
      // the synthetic dispatch picks up via Object.assign.
      try {
        if (!parentReq.coworkScopes) {
          await _runCoworkAuth(parentReq)
        }
      } catch (authErr) {
        if (authErr && authErr._coworkAuthFail) {
          return rpcError(id ?? null, RPC_ERR.UNAUTHENTICATED, {
            reason: authErr._coworkAuthBody?.error || 'unauthenticated',
            http_status: authErr._coworkAuthStatus || 401,
          })
        }
        return rpcError(id ?? null, RPC_ERR.INTERNAL_ERROR, { error: authErr?.message || 'auth_error' })
      }

      const result = await dispatchTool(router, parentReq, toolName, toolArgs)
      const isError = result.statusCode >= 400
      const text = result.body == null
        ? ''
        : (typeof result.body === 'string' ? result.body : JSON.stringify(result.body))

      return rpcResult(id ?? null, {
        content: [{ type: 'text', text }],
        isError,
        ...(isError
          ? { _meta: { http_status: result.statusCode, error_body: result.body } }
          : { _meta: { http_status: result.statusCode } }),
      })
    }

    // Unknown notification (id absent) - silently ignore per spec
    if (isNotification) return null

    return rpcError(id ?? null, RPC_ERR.METHOD_NOT_FOUND, { method })
  } catch (err) {
    logger.error('cowork-mcp-shim: handler error', {
      method,
      error: err.message,
      stack: err.stack,
    })
    if (isNotification) return null
    return rpcError(id ?? null, RPC_ERR.INTERNAL_ERROR, { error: err.message })
  }
}

// ── HTTP entry point - Express handler bound in cowork.js ────────────────
async function handleMcpRequest(router, req, res) {
  const body = req.body

  if (body == null || typeof body !== 'object') {
    return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'body must be a JSON object or array' }))
  }

  // Batch request - array of envelopes
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return res.status(400).json(rpcError(null, RPC_ERR.INVALID_REQUEST, { reason: 'empty batch' }))
    }
    const responses = []
    for (const envelope of body) {
      if (!envelope || typeof envelope !== 'object' || envelope.jsonrpc !== '2.0' || typeof envelope.method !== 'string') {
        responses.push(rpcError(envelope?.id ?? null, RPC_ERR.INVALID_REQUEST))
        continue
      }
      const out = await _handleSingle(router, req, envelope)
      if (out !== null) responses.push(out)
    }
    if (responses.length === 0) return res.status(204).end()
    return res.json(responses)
  }

  // Single envelope
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return res.status(400).json(rpcError(body.id ?? null, RPC_ERR.INVALID_REQUEST, { received: { jsonrpc: body.jsonrpc, method: body.method } }))
  }

  const out = await _handleSingle(router, req, body)
  if (out === null) {
    // Notification - no response body per JSON-RPC 2.0
    return res.status(204).end()
  }
  return res.json(out)
}

module.exports = {
  handleMcpRequest,
  TOOLS,
  TOOL_NAMES,
  PROTOCOL_VERSION,
  SERVER_INFO,
  // exposed for tests / programmatic use
  _dispatchTool: dispatchTool,
  _handleSingle,
  _RPC_ERR: RPC_ERR,
}

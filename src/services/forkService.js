/**
 * Fork Service — true parallel sub-sessions of the EcodiaOS conductor.
 *
 * Implements EcodiaOS_Spec_NextBuild Build 1 (Fork-Mode Parallelism).
 *
 * Architecture
 * ────────────
 * The main OS (osSessionService) stays a single-threaded conductor with its
 * own _sendQueue. Forks are *additive*: each is a fresh SDK query() with a
 * separate AbortController, separate ccSessionId, separate provider env. They
 * run on independent Promise chains so 3 forks + main = 4 truly concurrent
 * SDK streams. The conductor never sees a fork's raw stream — it only sees a
 * rolled-up positions table when it asks (or when forks finish and post a
 * [FORK_REPORT] back into main's inbox via the queue).
 *
 * Why a separate file
 * ───────────────────
 * Putting forks inside osSessionService.js would mean either (a) coupling
 * fork lifecycle to the singleton activeQuery/ _sendQueue (kills parallelism),
 * or (b) duplicating ~600 lines of MCP/provider/streaming logic across two
 * code paths inside one file. A separate service with its own minimal stream
 * loop keeps the conductor untouched and the fork loop small.
 *
 * Fork tool scoping (spec §1.4)
 * ─────────────────────────────
 *  - Forks DO get: neo4j, scheduler, factory, supabase + Agent (subagent
 *    delegation: comms/finance/ops/social).
 *  - Forks DO NOT get: any os-session lifecycle (restart, compact, handover) —
 *    that's main's job. We achieve this by simply not exposing those tools to
 *    the fork (fork's MCP server set is identical to conductor's; the os-
 *    session admin endpoints are HTTP-only and forks have no HTTP client).
 *
 * Persistence (os_forks table, migration 062)
 * ───────────────────────────────────────────
 *  - In-memory Map is the runtime source of truth.
 *  - DB row is for visibility (frontend GET /forks), the conductor rollup
 *    (forksRollup() reads it cheaply), and post-mortem if a fork dies.
 *  - DB writes are fire-and-forget — a slow DB never blocks fork progress.
 */
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const db = require('../config/db')
const env = require('../config/env')
const logger = require('../config/logger')
const usageEnergy = require('./usageEnergyService')
const { broadcast } = require('../websocket/wsManager')
const secretSafety = require('./secretSafetyService')
const forkFinalizer = require('./forkFinalizer')
const { tryReserveForkSlot } = require('../lib/forkCapAtomic')

const execFileAsync = promisify(execFile)

// ── SDK loader (shared shape with osSessionService) ─────────────────────────
let _query = null
async function getQuery() {
  if (_queryOverride) return _queryOverride
  if (!_query) {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    _query = sdk.query
  }
  return _query
}
// Test seam — set via _setQueryForTest to inject a fake query() generator so
// parallelism / lifecycle can be verified without burning real Anthropic
// tokens. NEVER set this in production code paths.
let _queryOverride = null

// Test seams for the recoverStaleForks deliverable-probe path. Lets unit tests
// inject fake git output and a fake messageQueue without ever shelling out or
// hitting the durable inbox. NEVER set these in production code paths.
let _execGitOverride = null            // (args:string[], cwd:string) => Promise<{stdout, stderr}>
let _messageQueueOverride = null       // { enqueueMessage: (...) => Promise<void> }

// ── Caps (raised 2026-04-27 — Tate's directive: conductor self-spawns up to 5) ─
// Hard cap is the absolute concurrency ceiling. Energy soft caps step down
// proportionally as the weekly budget tightens — at "low" we still allow 2
// forks so the conductor isn't single-threaded just because we're past 70%.
const HARD_FORK_CAP = 5
const ENERGY_FORK_CAPS = {
  full:     5,
  healthy:  5,
  conserve: 4,
  low:      2,
  critical: 2,
}

// ── Phantom-bail signal (per fork-result-fallback-must-be-marked.md) ────────
// When a fork transcript ends without a [FORK_REPORT] tag, state.result is
// written with this prefix (see line ~668). The conductor's rollup MUST treat
// this prefix as the canonical phantom-bail signal — not the pre-2026-05-02
// 600-char length heuristic, which conflated real-but-short reports with
// silent fallback. Single source of truth so the writer (state.result) and
// the readers (forksRollup, future classifiers) stay in sync.
const FALLBACK_MARKER = '(no [FORK_REPORT] emitted'

function _isPhantomBail(result) {
  return typeof result === 'string' && result.startsWith(FALLBACK_MARKER)
}

// ── Fork-report enqueue helpers ─────────────────────────────────────────────
// Two emission paths share the success-path enqueue (forkService.js, end of
// spawnFork's stream loop):
//
//   (a) clean — fork emitted [FORK_REPORT]; body wraps report verbatim.
//   (b) phantom_bail — fork transcript ended without [FORK_REPORT] tag;
//       state.result carries the FALLBACK_MARKER prefix + transcript tail.
//
// Pre-2026-05-03 the enqueue was gated `if (report)`, so phantom-bail forks
// silently skipped the inbox path — they only surfaced via forks_rollup for
// ~15min before dropping off the conductor's view. Closing this gap is the
// second half of the same observability fix as 3 May rotation C / b00f75f
// (which surfaced phantom_bail in forks_rollup). Body shape is built by a
// pure function so tests can assert content without spinning up the SDK
// loop.
//
// Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
function _buildForkReportBody({ fork_id, brief, report, nextStep, fallbackResult }) {
  // report is null when regex did NOT match (truly no FORK_REPORT).
  // report is '' when regex matched but body was empty
  // (e.g. [FORK_REPORT] all on one line followed by \n\n[NEXT_STEP]).
  // Both cases must be distinguished — empty body is still a valid report.
  if (report !== null) {
    return [
      `[SYSTEM: fork_report ${fork_id}]`,
      `Brief: ${brief}`,
      '',
      `Report: ${report || '(empty body — FORK_REPORT immediately followed by NEXT_STEP)'}`,
      nextStep ? `\nNext step suggested: ${nextStep}` : '',
    ].filter(Boolean).join('\n')
  }
  // Phantom-bail body — TIGHT version (5 May 2026, fork_morzn67x_635460).
  // Pre-fix this dumped the full brief (2-10KB) + full state.result
  // (~2080 chars) into main chat every time a fork closed without
  // [FORK_REPORT]. On 5 May 2026 ALL 16 dispatched forks hit this path
  // (reasons under investigation — transcript-tail truncation, brief
  // length, hooks-eating-budget all suspect), producing ~80KB of pollution
  // in main chat for forks that mostly shipped real work.
  //
  // Tate verbatim 5 May 2026 ~12:05 AEST: "a lot of the forks are
  // converting into queued messages in the main chat… fork should have
  // sent the report cleanly". The fix doesn't address why the model
  // doesn't emit the closing tag (separate diagnosis); it stops the
  // unconditional fallback path from polluting chat.
  //
  // Full state.result + full brief are still on disk in os_forks. The
  // conductor can `mcp__forks__get_fork` or `db_query os_forks WHERE
  // fork_id=...` to pull more context if it needs it. The inbox message
  // is the alert + the breadcrumbs to fetch the rest, NOT the dump.
  // Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
  const briefHead = (brief || '').slice(0, 200)
  const briefSuffix = (brief && brief.length > 200) ? '…' : ''
  // state.result for phantom-bail forks is shaped:
  //   "(no [FORK_REPORT] emitted; last N chars of transcript follow)\n\n${tail}"
  // Strip the marker wrapper line so we surface only the actual transcript
  // tail content, then trim to the last 500 chars. Conductor knows the
  // fork bailed from `no_report_emitted=true` in the SYSTEM tag; carrying
  // the marker in the body is redundant.
  let tailContent = fallbackResult || ''
  if (typeof tailContent === 'string' && tailContent.startsWith(FALLBACK_MARKER)) {
    const splitAt = tailContent.indexOf('\n\n')
    if (splitAt > 0) tailContent = tailContent.slice(splitAt + 2)
  }
  const tailHead = tailContent.length > 500
    ? `…${tailContent.slice(-500)}`
    : (tailContent || '(empty)')
  return [
    `[SYSTEM: fork_report ${fork_id} no_report_emitted=true]`,
    `Brief (head): ${briefHead}${briefSuffix}`,
    `No [FORK_REPORT] emitted. Probe os_forks/${fork_id} or git log --grep=${fork_id} before assuming bailed.`,
    '',
    `Transcript tail (last 500 chars):`,
    tailHead,
  ].filter(Boolean).join('\n')
}

// ── Cron fork_report suppression ─────────────────────────────────────────────
// Cron-spawned forks (dispatched by cronForkDispatcher) run on a self-contained
// brief prefixed with "You are EcodiaOS in fork form, no prior context." When
// the result is a clean no-op (healthy, all-clear, zero-action), the fork_report
// should NOT enqueue to main — it pollutes the conductor's context with noise.
//
// Detection: check the brief for the cron prefix + the report for no-op patterns.
// Both must match to suppress. A cron fork that actually DID work (files changed,
// commits made, emails sent) won't match the no-op patterns and will pass through.
// Origin: Tate 4 May 2026 20:55 AEST "bro wtf... your crons are still coming in"
const CRON_BRIEF_PREFIX = 'You are EcodiaOS in fork form, no prior context.'
const CLEAN_NOOP_PATTERNS = [
  /exit(?:ing)?\s+silent(?:ly)?/i,
  /all\s+(?:systems?\s+)?(?:healthy|clean)/i,
  /no\s+(?:action\s+)?(?:needed|required|alert)/i,
  /zero\s+(?:to\s+)?(?:do|report|action)/i,
  /(?:processed|classified|errors?|inferred|archived|reaped)\s*:?\s*0(?:\D|$)/i,
  /no\s+deployments?\s+in/i,
  /nothing\s+(?:to\s+)?(?:do|report)/i,
]

function _isCleanNoop(report, brief) {
  if (!report || !brief) return false
  const isCron = brief.includes(CRON_BRIEF_PREFIX)
  if (!isCron) return false
  return CLEAN_NOOP_PATTERNS.some(p => p.test(report))
}

async function _enqueueForkReport({ fork_id, brief, report, nextStep, fallbackResult }) {
  // Suppress clean no-op reports from cron-spawned forks — they pollute main chat
  if (_isCleanNoop(report, brief)) {
    logger.debug('forkService: suppressed clean no-op cron fork_report', { fork_id })
    return { enqueued: false, reason: 'suppressed_clean_noop' }
  }

  let mq = _messageQueueOverride
  if (!mq) {
    try { mq = require('./messageQueue') }
    catch (err) {
      logger.warn('forkService: messageQueue unavailable, skipping fork_report enqueue', { fork_id, error: err.message })
      return { enqueued: false, reason: 'mq_unavailable' }
    }
  }
  const body = _buildForkReportBody({ fork_id, brief, report, nextStep, fallbackResult })
  try {
    await mq.enqueueMessage({ body, source: `fork:${fork_id}`, mode: 'queue' })
    return { enqueued: true, had_report: report !== null }
  } catch (err) {
    logger.warn('forkService: failed to enqueue fork_report to main', { fork_id, had_report: report !== null, error: err.message })
    return { enqueued: false, reason: 'enqueue_threw', error: err.message }
  }
}

// Conductor & subagent MCP groups — duplicated from osSessionService so a
// refactor there doesn't silently change fork behaviour. Kept narrow on
// purpose: forks should match the conductor's tool surface (minus session
// lifecycle), not balloon their own.
const FORK_CONDUCTOR_SERVERS = ['neo4j', 'scheduler', 'factory', 'supabase']
const FORK_SUBAGENT_DOMAINS = {
  comms:   ['google-workspace', 'crm', 'sms'],
  finance: ['bookkeeping', 'supabase'],
  ops:     ['vps', 'supabase'],
  social:  ['business-tools'],
}

// ── In-memory registry ───────────────────────────────────────────────────────
// Map<fork_id, ForkState>. Live state: never recovered after process restart.
const _forks = new Map()

function _newForkId() {
  return `fork_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

function _forkSnapshot(state) {
  return {
    fork_id:        state.fork_id,
    parent_id:      state.parent_id,
    brief:          state.brief,
    context_mode:   state.context_mode,
    status:         state.status,
    position:       state.position,
    result:         state.result,
    next_step:      state.next_step,
    provider:       state.provider,
    tokens_input:   state.tokens_input,
    tokens_output:  state.tokens_output,
    tool_calls:     state.tool_calls,
    current_tool:   state.current_tool,
    last_heartbeat: state.last_heartbeat ? new Date(state.last_heartbeat).toISOString() : null,
    started_at:     state.started_at ? new Date(state.started_at).toISOString() : null,
    ended_at:       state.ended_at ? new Date(state.ended_at).toISOString() : null,
    abort_reason:   state.abort_reason,
  }
}

// ── Fork-aware WS broadcast ─────────────────────────────────────────────────
// Every WS event a fork emits carries fork_id so the frontend can thread it.
// Main's events keep fork_id="main" via the wrapper in osSessionService (added
// in step 6 of this build); forks always stamp their own id here.
function _emitForkOutput(fork_id, data) {
  try { broadcast('os-session:output', { fork_id, data }) }
  catch (err) { logger.warn('forkService: broadcast failed (non-fatal)', { error: err.message, fork_id }) }
}

function _emitForkStatus(fork_id, status, meta = {}) {
  try { broadcast('os-session:status', { fork_id, status, ...meta }) }
  catch (err) { logger.warn('forkService: broadcast failed (non-fatal)', { error: err.message, fork_id }) }
}

// Registry-delta event: a single channel the frontend subscribes to for the
// live tracks panel. Fired on spawn, every status transition, every position
// change, and on terminate. Cheap rollup, ~200 bytes per event.
function _emitForkEvent(kind, state) {
  try { broadcast('os-session:fork', { kind, fork: _forkSnapshot(state) }) }
  catch (err) { logger.debug('forkService: fork event broadcast failed', { error: err.message }) }
}

// ── DB persistence (fire-and-forget) ────────────────────────────────────────
async function _dbInsert(state) {
  try {
    await db`
      INSERT INTO os_forks (
        fork_id, parent_id, brief, context_mode, status,
        provider, started_at
      ) VALUES (
        ${state.fork_id}, ${state.parent_id}, ${state.brief}, ${state.context_mode}, ${state.status},
        ${state.provider}, to_timestamp(${state.started_at} / 1000.0)
      )
      ON CONFLICT (fork_id) DO NOTHING
    `
  } catch (err) {
    logger.warn('forkService: _dbInsert failed (non-fatal)', { error: err.message, fork_id: state.fork_id })
  }
}

async function _dbUpdate(state) {
  try {
    await db`
      UPDATE os_forks SET
        status        = ${state.status},
        position      = ${state.position},
        result        = ${state.result},
        next_step     = ${state.next_step},
        abort_reason  = ${state.abort_reason},
        cc_session_id = ${state.cc_session_id},
        tokens_input  = ${state.tokens_input},
        tokens_output = ${state.tokens_output},
        tool_calls    = ${state.tool_calls},
        current_tool  = ${state.current_tool},
        last_heartbeat = to_timestamp(${state.last_heartbeat} / 1000.0),
        ended_at      = ${state.ended_at ? db`to_timestamp(${state.ended_at} / 1000.0)` : null}
      WHERE fork_id = ${state.fork_id}
    `
  } catch (err) {
    logger.warn('forkService: _dbUpdate failed (non-fatal)', { error: err.message, fork_id: state.fork_id })
  }
}

// ── Cap enforcement (spec §1.5) ─────────────────────────────────────────────
function _activeCount() {
  let n = 0
  for (const s of _forks.values()) {
    if (s.status === 'spawning' || s.status === 'running' || s.status === 'reporting') n++
  }
  return n
}

async function _energyCap() {
  try {
    const e = await usageEnergy.getEnergy()
    const lvl = e?.level || 'healthy'
    if (Object.prototype.hasOwnProperty.call(ENERGY_FORK_CAPS, lvl)) return ENERGY_FORK_CAPS[lvl]
    return ENERGY_FORK_CAPS.healthy
  } catch {
    return ENERGY_FORK_CAPS.healthy
  }
}

// ── MCP loader (mirror of osSessionService logic, scoped) ───────────────────
function _getAllMcpConfigs(cwd) {
  try {
    const p = path.join(cwd, '.mcp.json')
    if (!fs.existsSync(p)) return {}
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    const servers = raw.mcpServers || {}
    const out = {}
    for (const [name, cfg] of Object.entries(servers)) {
      out[name] = {
        type: cfg.type || 'stdio',
        command: cfg.command,
        args: cfg.args || [],
        ...(cfg.env ? { env: cfg.env } : {}),
      }
    }
    return out
  } catch (err) {
    logger.warn('forkService: failed to load .mcp.json', { error: err.message })
    return {}
  }
}

function _conductorMcp(all) {
  const out = {}
  for (const n of FORK_CONDUCTOR_SERVERS) if (all[n]) out[n] = all[n]
  return out
}

function _subagentMcpForDomain(all, names) {
  const specs = []
  for (const n of names) if (all[n]) specs.push({ [n]: all[n] })
  return specs
}

function _buildForkAgents(all) {
  return {
    comms: {
      description: 'Fork-mode comms specialist: email, calendar, CRM, SMS.',
      prompt: 'You are a fork-mode comms specialist. Same rules as the main comms subagent — keep it tight, professional, CRM-aware.',
      model: 'sonnet',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.comms),
      permissionMode: 'bypassPermissions',
      maxTurns: 30,
    },
    finance: {
      description: 'Fork-mode finance officer: bookkeeping, P&L, BAS/GST.',
      prompt: 'You are a fork-mode finance officer. Same rules as the main finance subagent.',
      model: 'sonnet',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.finance),
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
    },
    ops: {
      description: 'Fork-mode ops engineer: VPS, PM2, deployments.',
      prompt: 'You are a fork-mode ops engineer. Diagnose before acting. Stamp git commits and pm2 actions clearly.',
      model: 'sonnet',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.ops),
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
    },
    social: {
      description: 'Fork-mode social/platform specialist: Vercel, Zernio, Xero.',
      prompt: 'You are a fork-mode social/platform specialist.',
      model: 'sonnet',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.social),
      permissionMode: 'bypassPermissions',
      maxTurns: 15,
    },
  }
}

// ── Fork system prompt ──────────────────────────────────────────────────────
// Forks intentionally do NOT load the conductor's CLAUDE.md. The full
// operational manual is ~62KB / ~15-18k tokens of status-board doctrine,
// pattern-surfacing rules, scheduler choreography, etc. — none of which a
// fork doing a discrete task needs to know. Each fork is a fresh SDK session
// (no shared prompt cache with the conductor or its siblings) so it would
// pay that cost from cold, every spawn, every turn.
//
// What a fork actually needs: who it is, what tools it has, how to report
// back. That's the identity block below — kept tight on purpose. If a
// specific task needs more context, the conductor must put it in the brief.
function _buildForkSystemPrompt(cwd, fork_id, brief) {
  const today = new Date().toISOString().slice(0, 10)

  const identityBlock = `# Identity
You are a fork sub-session of the EcodiaOS conductor — the operating intelligence of Ecodia DAO LLC. The conductor delegated a discrete task to you and is still running on its own work. You do NOT share state with it; you cannot talk to it while you work; it reads your report when you finish.

You are a capable autonomous agent. Default to action on routine ops (queries, writes, deploys, sending the email, restarting the service). Do not ask permission — your brief is your authority.

# Tools you have
- neo4j (graph_*) — persistent memory, 5000+ nodes
- scheduler (schedule_*) — DB-backed cron/delayed/chained tasks
- factory (start_cc_session, etc.) — dispatch coding work to Factory
- supabase (db_*, storage_*) — DB queries/writes, file storage
- Agent — delegate to comms/finance/ops/social subagent for domain work

You do NOT have: os-session lifecycle (restart/compact/handover) — that's main's only.`

  const forkBlock = `# Fork operating rules
Your fork id: ${fork_id}

- Work on the brief, then end your final message with a single line:
    [FORK_REPORT] <one paragraph: what you did, results, anything main needs to know>
- If main should take a follow-up, append after the summary:
    [NEXT_STEP] <one short sentence>
- Stamp every external side-effect (commits, emails, SMS, Neo4j writes) with your fork id (${fork_id}) so duplicate-detection works.
- If you hit something only main should decide, write it into [FORK_REPORT] and stop.
- Keep your output tight. Main's context is the precious one, but you still cost tokens.`

  const envBlock = `# Environment
Working directory: ${cwd}
Platform: linux
Date: ${today}
You are powered by Claude (Anthropic's model). Running inside an EcodiaOS fork via the Claude Agent SDK.`

  return [identityBlock, envBlock, forkBlock].join('\n\n---\n\n')
}

// ── Provider env wiring (mirror osSessionService for a single fork run) ─────
function _resolveProviderForFork() {
  const best = usageEnergy.getBestProvider()
  const sessionEnv = { ...process.env }
  let provider = 'claude_max'
  let model

  if (best.isDeepseekFallback) {
    provider = 'deepseek'
    sessionEnv.ANTHROPIC_BASE_URL = env.DEEPSEEK_FALLBACK_BASE_URL || 'https://api.deepseek.com/anthropic'
    sessionEnv.ANTHROPIC_API_KEY  = env.DEEPSEEK_API_KEY
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN_TATE
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN_CODE
    model = 'deepseek-v4-flash'
  // Bedrock branch removed Tate 5 May 2026 12:40 AEST per
  // ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
  } else if (best.provider === 'claude_max_2') {
    provider = 'claude_max_2'
    delete sessionEnv.ANTHROPIC_API_KEY
    if (env.CLAUDE_CODE_OAUTH_TOKEN_CODE) {
      sessionEnv.CLAUDE_CODE_OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      delete sessionEnv.CLAUDE_CONFIG_DIR
    } else if (env.CLAUDE_CONFIG_DIR_2) {
      sessionEnv.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR_2
    }
  } else {
    provider = 'claude_max'
    delete sessionEnv.ANTHROPIC_API_KEY
    if (env.CLAUDE_CODE_OAUTH_TOKEN_TATE) {
      sessionEnv.CLAUDE_CODE_OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN_TATE
      delete sessionEnv.CLAUDE_CONFIG_DIR
    } else if (env.CLAUDE_CONFIG_DIR_1) {
      sessionEnv.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR_1
    }
  }
  return { provider, env: sessionEnv, model, isDeepseek: best.isDeepseekFallback }
}

// ── Core: spawn one fork ────────────────────────────────────────────────────
async function spawnFork({ brief, context_mode = 'recent' } = {}) {
  if (!brief || typeof brief !== 'string' || !brief.trim()) {
    throw Object.assign(new Error('brief is required'), { httpStatus: 400, code: 'invalid_brief' })
  }
  if (!['recent', 'brief'].includes(context_mode)) {
    throw Object.assign(new Error('context_mode must be "recent" or "brief"'), {
      httpStatus: 400, code: 'invalid_context_mode',
    })
  }

  // Atomic cap check + DB insert via pg_advisory_xact_lock.
  // Closes the TOCTOU race: count read + insert in one transaction.
  const fork_id = _newForkId()
  const eCap = await _energyCap()
  await tryReserveForkSlot({
    fork_id,
    brief,
    context_mode,
    parent_id: 'main',
    hard_cap: HARD_FORK_CAP,
    energy_cap: eCap,
  })

  const cwd = env.OS_SESSION_CWD || '/home/tate/ecodiaos'
  const { provider, env: sessionEnv, model, isDeepseek } = _resolveProviderForFork()
  const abort = new AbortController()
  const startedAt = Date.now()

  const state = {
    fork_id,
    parent_id: 'main',
    brief,
    context_mode,
    status: 'spawning',
    position: 'spawning',
    result: null,
    next_step: null,
    abort_reason: null,
    provider,
    cc_session_id: null,
    tokens_input: 0,
    tokens_output: 0,
    // Cache-token visibility (in-memory only — no DB column, surfaces in
    // fork-complete log + per-turn metrics). Forks share BP1+BP2 system-prompt
    // structure with main when systemPrompt is large enough to auto-cache;
    // tracking here lets us see fork-side cache hit ratio rather than
    // pretending it's silently zero.
    tokens_cache_read: 0,
    tokens_cache_creation: 0,
    tool_calls: 0,
    current_tool: null,
    last_heartbeat: startedAt,
    started_at: startedAt,
    ended_at: null,
    abort,
    queryHandle: null,
    transcript: [],
    pendingMessages:  [],
    pendingResolvers: [],
    input_closed:     false,
  }
  _forks.set(fork_id, state)
  _emitForkEvent('spawned', state)

  // Build SDK options. We deliberately reuse main's pattern (custom systemPrompt
  // string, conductor MCP, agents) so behaviour is symmetrical, then layer on
  // the fork-specific brief.
  const allConfigs = _getAllMcpConfigs(cwd)
  const mcpServers = _conductorMcp(allConfigs)
  const systemPrompt = _buildForkSystemPrompt(cwd, fork_id, brief)

  const options = {
    cwd,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    systemPrompt,
    model: model || env.OS_SESSION_MODEL || undefined,
    // DeepSeek thinking blocks carry Anthropic-signed signatures invalid on replay — omit.
    // V4 Pro activates its own native thinking automatically without the SDK option.
    ...(!isDeepseek && { thinking: { type: 'enabled', budget_tokens: 1500 } }),
    mcpServers,
    allowedTools: [
      ...Object.keys(mcpServers).map(n => `mcp__${n}__*`),
      'Agent',
    ],
    agents: _buildForkAgents(allConfigs),
    abortController: abort,
    env: sessionEnv,
  }

  // ── Run loop (background) ────────────────────────────────────────────
  // We do NOT await this — spawnFork returns immediately and the caller
  // (HTTP handler) gets the fork id. The loop runs on its own promise chain.
  ;(async () => {
    try {
      const queryFn = await getQuery()
      const userPrompt = `BRIEF (fork ${fork_id}, context_mode=${context_mode}):\n\n${brief}`
      logger.info('forkService: starting fork', { fork_id, provider, context_mode, brief_chars: brief.length })

      // Build async-iterable prompt source so sendMessageToFork can inject
      // user messages mid-stream without aborting the session (spec §2).
      // The generator closes over `state` (outer spawnFork scope) and
      // `userPrompt` (this IIFE scope) - both are available here.
      async function* _makeForkPromptStream() {
        // First yield: the initial brief.
        yield {
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: userPrompt }] },
          parent_tool_use_id: null,
        }
        // Subsequent yields: injected messages from sendMessageToFork.
        while (true) {
          if (state.pendingMessages.length > 0) {
            // Message already queued - yield it immediately.
            const txt = state.pendingMessages.shift()
            yield {
              type: 'user',
              message: { role: 'user', content: [{ type: 'text', text: txt }] },
              parent_tool_use_id: null,
            }
          } else if (state.input_closed) {
            // Stream closed and queue drained - end the iterable.
            return
          } else {
            // No message queued and not closed - wait for the next push.
            const txt = await new Promise(resolve => state.pendingResolvers.push(resolve))
            if (txt === null) return  // null sentinel = stream closed
            yield {
              type: 'user',
              message: { role: 'user', content: [{ type: 'text', text: txt }] },
              parent_tool_use_id: null,
            }
          }
        }
      }

      const q = queryFn({ prompt: _makeForkPromptStream(), options })
      state.queryHandle = q
      state.status = 'running'
      state.position = 'started'
      state.last_heartbeat = Date.now()
      _emitForkEvent('status', state)
      _emitForkStatus(fork_id, 'streaming', { fork_id })
      await _dbUpdate(state)

      for await (const msg of q) {
        state.last_heartbeat = Date.now()

        switch (msg.type) {
          case 'system': {
            if (msg.subtype === 'init' && msg.session_id) {
              state.cc_session_id = msg.session_id
            }
            break
          }
          case 'assistant': {
            const blocks = msg.message?.content || []
            const textParts = blocks
              .filter(b => b.type === 'text' && b.text)
              .map(b => b.text)
            const text = textParts.join('\n\n')
            if (text) {
              const safe = secretSafety.scrubSecrets(text)
              state.transcript.push(safe)
              // Cap transcript at 80 entries to prevent unbounded growth that hits
              // ecodia-api's max_memory_restart 2G ceiling within ~6min under fork
              // load. Per status_board row f4180a2c quick-win (30 Apr 2026 09:58 AEST).
              if (state.transcript.length > 80) state.transcript.shift()
              // Position = first ~100 chars of latest assistant text.
              state.position = safe.replace(/\s+/g, ' ').slice(0, 140)
              _emitForkOutput(fork_id, { type: 'assistant_text', content: safe, fork_id })
              _emitForkEvent('position', state)
            }
            const toolUses = blocks.filter(b => b.type === 'tool_use')
            if (toolUses.length) {
              state.tool_calls += toolUses.length
              state.current_tool = toolUses[toolUses.length - 1].name
              state.position = `running tool: ${state.current_tool}`
              _emitForkOutput(fork_id, {
                type: 'tool_use',
                tools: toolUses.map(t => ({ name: t.name, id: t.id })),
                fork_id,
              })
              _emitForkEvent('position', state)
            }
            // Defensive both-paths read (mirrors af5d01f / fork_monowdwc_b13eda
             // applied to osSessionService 2 May 2026). The SDK normalises
             // usage onto msg.message.usage on assistant events, but newer
             // shapes occasionally surface usage on msg.usage even within
             // assistant blocks, and cache_creation may nest under
             // cache_creation.ephemeral_5m_input_tokens (or future ephemeral_1h).
             // Reading all paths means a fork's token + cache telemetry stays
             // populated regardless of which shape this turn emitted on,
             // rather than silently going to zero on the next SDK pivot.
             const _u = msg.message?.usage ?? msg.usage
             if (_u) {
              state.tokens_input  += _u.input_tokens  || 0
              state.tokens_output += _u.output_tokens || 0
              state.tokens_cache_read += (
                _u.cache_read_input_tokens
                ?? _u.cache_read?.ephemeral_5m_input_tokens
                ?? _u.cache_read?.ephemeral_1h_input_tokens
              ) || 0
              state.tokens_cache_creation += (
                _u.cache_creation_input_tokens
                ?? _u.cache_creation?.ephemeral_5m_input_tokens
                ?? _u.cache_creation?.ephemeral_1h_input_tokens
              ) || 0
            }
            break
          }
          case 'user': {
            // tool_result blocks — clear current_tool, count nothing.
            const content = msg.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_result') {
                  state.current_tool = null
                  let txt = ''
                  if (typeof block.content === 'string') txt = block.content
                  else if (Array.isArray(block.content)) {
                    txt = block.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
                  }
                  if (txt.length > 1500) txt = txt.slice(0, 1500) + '\n… (truncated)'
                  _emitForkOutput(fork_id, {
                    type: block.is_error ? 'tool_use_error' : 'tool_use_result',
                    tool_use_id: block.tool_use_id,
                    content: txt || '(no output)',
                    fork_id,
                  })
                }
              }
            }
            break
          }
          case 'result': {
            // SDK terminal - fork is wrapping up.
            // Close the prompt stream so the generator yields no further messages.
            state.input_closed = true
            for (const resolve of state.pendingResolvers.splice(0)) resolve(null)
            state.status = 'reporting'
            _emitForkEvent('status', state)
            // Durability: write reporting-state to DB immediately so a memory-restart
            // between here and the for-await loop close still leaves a recoverable row.
            // (fork-persistence Option A, fork_mokpm24w_4daefb)
            await _dbUpdate(state)
            break
          }
        }
      }

      // Stream complete — extract [FORK_REPORT] / [NEXT_STEP] from transcript.
      const fullText = state.transcript.join('\n\n')
      const reportMatch = fullText.match(/\[FORK_REPORT\][^\n]*([\s\S]*?)(?:\[NEXT_STEP\]|$)/i)
      const nextMatch = fullText.match(/\[NEXT_STEP\][^\n]*([\s\S]*?)$/i)
      const report = reportMatch ? reportMatch[1].trim() : null
      const nextStep = nextMatch ? nextMatch[1].trim() : null

      // If fork emitted [FORK_REPORT], use the captured report verbatim. Otherwise
      // fall back to the tail of the transcript. PRE-2026-05-02 the fallback was
      // `slice(-600)` with no marker — that produced 455/555 historical results
      // clustered at exactly 600 chars that the conductor mis-classified as
      // "phantom shipping". The fork was usually doing real work but ran out of
      // budget before emitting the closing tag. Mark fallback explicitly so the
      // conductor can tell `[FORK_REPORT] missing` apart from `report content was
      // 600 chars`. Origin: fork_moo6esm9_565a0e debunk-or-confirm investigation.
      // Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
      if (reportMatch) {
        state.result = report || '(report body empty — FORK_REPORT immediately followed by NEXT_STEP)'
      } else if (fullText.length > 0) {
        const tail = fullText.length > 2000 ? fullText.slice(-2000) : fullText
        state.result = `${FALLBACK_MARKER}; last ${tail.length} chars of transcript follow)\n\n${tail}`
      } else {
        state.result = '(no output)'
      }
      state.next_step = nextStep
      state.status = 'done'
      state.ended_at = Date.now()
      state.position = report ? `done: ${report.slice(0, 100)}` : (reportMatch ? 'done (empty FORK_REPORT body)' : 'done')
      _emitForkEvent('done', state)
      _emitForkStatus(fork_id, 'complete', { fork_id })
      await _dbUpdate(state)
      // Idempotent terminal-state write — guarantees os_forks row converges
      // even if a concurrent process restart is mid-flight. Per Decision 3993
      // commit 1/3 (forkFinalizer.js). Wrapped: a finalizer failure must not
      // flip state.status into the outer catch's error path, since the work
      // itself succeeded.
      try {
        await forkFinalizer.finalize(fork_id, 'done', state.result)
      } catch (err) {
        logger.warn('forkService: finalize() in success path failed (non-fatal)', { fork_id, error: err.message })
      }

      logger.info('forkService: fork complete', {
        fork_id,
        duration_ms: state.ended_at - state.started_at,
        tokens_input: state.tokens_input,
        tokens_output: state.tokens_output,
        // Cache-token visibility for fork-side cache hit ratio analysis.
        // Wave 3 Fork H reported main hit_ratio_50turn=0 post-082; if forks
        // are also at 0 the cache breakpoint structure isn't reaching the
        // SDK; if forks hit but main doesn't, the divergence localises the
        // issue to assembler vs queryFn wiring.
        tokens_cache_read: state.tokens_cache_read,
        tokens_cache_creation: state.tokens_cache_creation,
        cache_hit_ratio: (state.tokens_input > 0)
          ? Number((state.tokens_cache_read / state.tokens_input).toFixed(3))
          : null,
        tool_calls: state.tool_calls,
        had_report: !!report,
        had_next_step: !!nextStep,
      })

      // Post the report back to main via the message queue. Non-interrupting:
      // it lands on main's next turn as a system message.
      //
      // Two emission paths share this enqueue:
      //   (a) clean — fork emitted [FORK_REPORT]; body wraps report verbatim.
      //   (b) phantom_bail — fork transcript ended without [FORK_REPORT] tag;
      //       state.result carries the FALLBACK_MARKER prefix + transcript tail.
      //       Per ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md the
      //       conductor MUST be told this happened. Without an inbox message
      //       the only surface is the 15min forks_rollup window, after which
      //       the fork silently disappears from the conductor's view. Closing
      //       this gap is the second half of the same observability fix as
      //       3 May rotation C / b00f75f (rollup phantom_bail flag).
      //
      // Routed through _enqueueForkReport so the test seam (_messageQueueOverride)
      // applies on the success path too, matching the recoverStaleForks pattern.
      await _enqueueForkReport({
        fork_id,
        brief,
        report,
        nextStep,
        fallbackResult: state.result,
      })
    } catch (err) {
      // Close the prompt stream and drain pending resolvers so the generator
      // does not leak (null sentinel causes the generator to return).
      state.input_closed = true
      for (const resolve of state.pendingResolvers.splice(0)) resolve(null)

      const aborted = err?.name === 'AbortError' || /abort/i.test(err?.message || '')
      state.status = aborted ? 'aborted' : 'error'
      state.abort_reason = state.abort_reason || (aborted ? 'aborted' : err?.message || 'error')
      state.ended_at = Date.now()
      state.position = state.status
      _emitForkEvent(state.status, state)
      _emitForkStatus(fork_id, 'complete', { fork_id, error: state.abort_reason })
      await _dbUpdate(state)
      logger.error('forkService: fork failed', { fork_id, status: state.status, error: err?.message, stack: err?.stack })
    } finally {
      // Guarantor: ensure os_forks row converges to terminal even if an
      // exception escaped the try/catch above (e.g. catch handler itself
      // threw) or the process is mid-shutdown when this finally runs. Per
      // Decision 3993 commit 1/3 — this is the durable terminal-state write
      // the forks-as-primitive bootstrap depends on.
      //
      // Idempotent: if the success/error path already wrote terminal, this
      // call returns alreadyTerminal=true. If state.status is somehow still
      // non-terminal here (uncaught exception path), default to 'error'.
      try {
        const finalStatus = (state.status === 'done' || state.status === 'aborted' || state.status === 'error')
          ? state.status
          : 'error'
        const finalResult = state.result || state.abort_reason || null
        await forkFinalizer.finalize(fork_id, finalStatus, finalResult)
      } catch (err) {
        logger.warn('forkService: finalizer guarantor failed (non-fatal)', { fork_id, error: err.message })
      }
      // Keep the entry for ~1min after termination so the frontend can render
      // its final state, then evict to keep the Map small.
      // Reduced from 5min to 1min per status_board row f4180a2c quick-win (30 Apr
      // 2026 09:58 AEST) to slow ecodia-api memory accumulation under fork load.
      setTimeout(() => { _forks.delete(fork_id) }, 60 * 1000).unref?.()
    }
  })().catch(err => logger.error('forkService: top-level fork loop threw (should never happen)', { fork_id, error: err.message }))

  return _forkSnapshot(state)
}

// ── Public registry helpers ─────────────────────────────────────────────────
function listForks() {
  return Array.from(_forks.values()).map(_forkSnapshot)
}

function getFork(fork_id) {
  const s = _forks.get(fork_id)
  return s ? _forkSnapshot(s) : null
}

async function abortFork(fork_id, reason = 'manual_abort') {
  const s = _forks.get(fork_id)
  if (!s) return { aborted: false, reason: 'not_found' }
  if (s.status === 'done' || s.status === 'aborted' || s.status === 'error') {
    return { aborted: false, reason: `already_${s.status}` }
  }
  s.abort_reason = reason
  try { s.abort?.abort?.(reason) } catch {}
  try { s.queryHandle?.close?.() } catch {}
  return { aborted: true, fork_id }
}

// ── Message injection ───────────────────────────────────────────────────────
// Sends a user message into a running fork's SDK stream without aborting it.
// The fork receives the message on its next SDK turn via the async-iterable
// prompt source built in spawnFork. Returns synchronously.
function sendMessageToFork(fork_id, message) {
  const s = _forks.get(fork_id)
  if (!s) return { accepted: false, reason: 'not_found' }
  if (s.status === 'done' || s.status === 'aborted' || s.status === 'error') {
    return { accepted: false, reason: 'fork_terminal' }
  }
  if (s.status === 'spawning' && !s.queryHandle) {
    return { accepted: false, reason: 'fork_not_running' }
  }

  // Push to queue or resolve a waiting generator promise, whichever applies.
  if (s.pendingResolvers.length > 0) {
    const resolve = s.pendingResolvers.shift()
    resolve(message)
  } else {
    s.pendingMessages.push(message)
  }

  s.last_heartbeat = Date.now()
  s.position = `received message: ${message.slice(0, 80)}`

  const queuedCount = s.pendingMessages.length
  logger.info('forkService: message_injected', { fork_id, message_chars: message.length, queued_count: queuedCount })

  return { accepted: true, fork_id, queued_messages: queuedCount }
}

// ── Conductor rollup (spec §3 of the message follow-up) ─────────────────────
// Bounded summary the conductor sees instead of fork transcripts. Keeps the
// conductor's context as a goals/positions/results/next-steps brain only.
async function forksRollup({ includeRecentDone = true } = {}) {
  const live = listForks()
  if (!live.length) {
    if (!includeRecentDone) return null
    // Pull last 5 finished forks from DB so the conductor can also see "what
    // just finished" if a fork report came in via the queue.
    let recent = []
    try {
      recent = await db`
        SELECT fork_id, brief, status, position, result, next_step, started_at, ended_at
        FROM os_forks
        WHERE ended_at > now() - interval '15 minutes'
        ORDER BY ended_at DESC
        LIMIT 5
      `
    } catch { recent = [] }
    if (!recent.length) return null
    const lines = recent.map(r => {
      // Phantom-bail flag: result starts with FALLBACK_MARKER when the fork's
      // transcript closed without a [FORK_REPORT] tag and state.result fell
      // back to the transcript tail. Surface this so the conductor can treat
      // the fork as needing a probe-then-trust cycle (verify-deployed-state-
      // against-narrated-state) rather than assuming the work didn't happen
      // OR assuming the result is a real report.
      // See ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md.
      const flag = _isPhantomBail(r.result) ? ' phantom_bail' : ''
      const head = `${r.fork_id} [${r.status}${flag}] brief="${(r.brief || '').slice(0, 60)}"`
      const tail = r.next_step ? `  next_step: ${r.next_step}` : ''
      return `- ${head}${tail ? '\n' + tail : ''}`
    })
    return `<forks_rollup>\nNo active forks. Recently finished:\n${lines.join('\n')}\n</forks_rollup>`
  }
  const lines = live.map(f => {
    const ageSec = f.started_at ? Math.round((Date.now() - new Date(f.started_at).getTime()) / 1000) : 0
    return `- ${f.fork_id} [${f.status}] (${ageSec}s, ${f.tool_calls} tools) brief="${(f.brief || '').slice(0, 60)}"`
  })
  return `<forks_rollup>\nActive forks (${live.length}/${HARD_FORK_CAP}):\n${lines.join('\n')}\n</forks_rollup>`
}

// ── Startup recovery (fork-persistence Option A, fork_mokpm24w_4daefb) ──────
// Refactored 2026-05-01 (fork_mom8e913_73a492) to probe disk for fork
// deliverables BEFORE classifying status. The pre-refactor recoverStaleForks
// blanket-flipped every stale row to status='crashed' regardless of whether
// the fork's edits had survived the SIGTERM, were committed, or had been
// pushed. Real-world failing case: fork_mom80wlq_8709d4 was killed mid-flight
// by PM2 max_memory_restart; its work was committed as 1db0c0f and pushed to
// origin/main, but os_forks still showed status='crashed' result=NULL with no
// surfaced commit info. The conductor's <forks_rollup> read "[crashed]" and
// hid the fact that the deliverable shipped.
//
// New behavior — probeForkDeliverables() runs per-row BEFORE the UPDATE:
//   1. git log --all --grep="<fork_id>" since started_at-1min — finds commits
//      that name the fork in a Co-Authored-By or body line.
//   2. For each commit, check origin/main containment via `git branch -r --contains`.
//      If the local main is fast-forward of origin/main, attempt `git push`.
//   3. git status --porcelain — captures dirty working tree.
//
// Then per-row terminal classification:
//   - commits found, all on origin           → status='done', result names SHAs.
//   - commits found, some local-only         → push attempted (FF-only, abort
//                                               on divergence); status='done'
//                                               with push outcome in result.
//   - working tree dirty, no commits         → status='crashed', result names
//                                               dirty files, next_step recommends
//                                               diff review.
//   - clean tree, no commits                 → status='crashed' with redispatch
//                                               recommendation per
//                                               ~/ecodiaos/patterns/continuation-aware-fork-redispatch.md
//
// Probe failures (git command errors) NEVER block the recovery UPDATE — they
// are captured in result.errors[] and the row falls back to the conservative
// 'crashed' classification. See also
// ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md
// (the meta-rule this fix bakes into the recovery code path).
//
// IMPORTANT: this function only processes rows in non-terminal states
// (spawning/running/reporting). Historical rows already at status='crashed'
// are NOT backfilled — that's a separate one-shot script if the conductor
// wants to reconcile pre-refactor state.
//
// Idempotent. Safe to call on every startup. Logs and never throws.

const REPO_ROOT_FOR_PROBE = env.OS_SESSION_CWD || '/home/tate/ecodiaos'

// Shell out to git defensively. Args go through execFile (no shell), forkId
// is sanitised via _isSafeForkIdToken below before it's ever interpolated as
// a --grep value. Returns {stdout, stderr, error?} — never throws.
async function _runGit(args, cwd = REPO_ROOT_FOR_PROBE) {
  if (_execGitOverride) {
    try { return await _execGitOverride(args, cwd) }
    catch (err) { return { stdout: '', stderr: err.message, error: err.message } }
  }
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15_000,
    })
    return { stdout: stdout || '', stderr: stderr || '' }
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      error: err.message,
    }
  }
}

// Defence: the fork_id is read from the DB but a malformed value should never
// reach `git --grep` as anything other than a literal token. Our generator
// (_newForkId) produces fork_<base36>_<hex> which is safe; this guard rejects
// anything else to keep the regex tight.
function _isSafeForkIdToken(forkId) {
  return typeof forkId === 'string' && /^fork_[a-z0-9_-]{4,80}$/i.test(forkId)
}

/**
 * probeForkDeliverables(forkId, startedAt) → {
 *   commits: [{ sha, subject, pushed }],
 *   dirtyFiles: string[],
 *   pushAttempted: boolean,
 *   pushSucceeded: boolean,
 *   pushNote: string|null,
 *   errors: string[],
 * }
 *
 * Probe-only — never throws, captures all errors in `errors[]`. Test seam:
 * inject a fake git via _setExecGitForTest.
 */
async function probeForkDeliverables(forkId, startedAt) {
  const out = {
    commits: [],
    dirtyFiles: [],
    pushAttempted: false,
    pushSucceeded: false,
    pushNote: null,
    errors: [],
  }

  if (!_isSafeForkIdToken(forkId)) {
    out.errors.push(`unsafe-fork-id-token:${String(forkId).slice(0, 32)}`)
    return out
  }

  // Resolve a "since" floor: 60s before startedAt, ISO. Fallback to 7d if the
  // timestamp is missing/malformed so we still get *some* signal.
  let sinceIso
  try {
    const t = startedAt ? new Date(startedAt).getTime() - 60_000 : Date.now() - 7 * 86400_000
    sinceIso = new Date(t).toISOString()
  } catch {
    sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString()
  }

  // 1. Find candidate commits whose body grep-matches the fork id.
  const logRes = await _runGit([
    'log', '--all', `--grep=${forkId}`, `--since=${sinceIso}`, '--format=%H%x09%s',
  ])
  if (logRes.error) out.errors.push(`git-log:${logRes.error}`)

  const candidateLines = (logRes.stdout || '').split('\n').filter(Boolean)
  const candidates = candidateLines.map(line => {
    const tab = line.indexOf('\t')
    if (tab < 0) return { sha: line.trim(), subject: '' }
    return { sha: line.slice(0, tab).trim(), subject: line.slice(tab + 1).trim() }
  }).filter(c => /^[0-9a-f]{7,40}$/i.test(c.sha))

  // 2. Defence vs grep regex mishaps: confirm forkId actually appears in the
  //    commit body before treating it as ours.
  for (const c of candidates) {
    const bodyRes = await _runGit(['log', '--format=%B', '-n', '1', c.sha])
    if (bodyRes.error) {
      out.errors.push(`git-body:${c.sha}:${bodyRes.error}`)
      continue
    }
    if (!bodyRes.stdout || !bodyRes.stdout.includes(forkId)) continue

    // 3. Check origin/main containment.
    const containsRes = await _runGit(['branch', '-r', '--contains', c.sha])
    if (containsRes.error) out.errors.push(`git-contains:${c.sha}:${containsRes.error}`)
    const pushed = (containsRes.stdout || '')
      .split('\n').map(s => s.trim()).filter(Boolean)
      .some(line => line === 'origin/main' || line === 'origin/HEAD' || line.endsWith(' -> origin/main'))

    out.commits.push({ sha: c.sha, subject: c.subject, pushed })
  }

  // 4. Working tree dirty?
  const statusRes = await _runGit(['status', '--porcelain'])
  if (statusRes.error) out.errors.push(`git-status:${statusRes.error}`)
  out.dirtyFiles = (statusRes.stdout || '')
    .split('\n').map(s => s.trim()).filter(Boolean)

  // 5. If we have unpushed commits, attempt a fast-forward push of main.
  const hasUnpushed = out.commits.some(c => !c.pushed)
  if (hasUnpushed) {
    out.pushAttempted = true

    // Are we ahead of origin/main with no divergence?
    const aheadRes = await _runGit(['rev-list', '--count', 'origin/main..main'])
    const behindRes = await _runGit(['rev-list', '--count', 'main..origin/main'])
    const ahead = parseInt((aheadRes.stdout || '0').trim(), 10) || 0
    const behind = parseInt((behindRes.stdout || '0').trim(), 10) || 0
    if (aheadRes.error) out.errors.push(`git-ahead:${aheadRes.error}`)
    if (behindRes.error) out.errors.push(`git-behind:${behindRes.error}`)

    if (ahead > 0 && behind === 0) {
      const pushRes = await _runGit(['push', 'origin', 'main'])
      if (pushRes.error) {
        out.pushSucceeded = false
        out.pushNote = `push-failed: ${pushRes.error.slice(0, 200)}`
        out.errors.push(`git-push:${pushRes.error}`)
      } else {
        out.pushSucceeded = true
        out.pushNote = 'pushed: yes (fork-recovery)'
        // Re-check containment so result accurately reflects post-push state.
        for (const commit of out.commits) {
          if (commit.pushed) continue
          const recheck = await _runGit(['branch', '-r', '--contains', commit.sha])
          if (recheck.error) continue
          if ((recheck.stdout || '').split('\n').some(l => l.trim() === 'origin/main')) {
            commit.pushed = true
          }
        }
      }
    } else if (behind > 0) {
      out.pushSucceeded = false
      out.pushNote = `pushed: NO (local main diverged from origin/main, behind=${behind} ahead=${ahead}, manual reconcile needed)`
    } else {
      // ahead=0 — commits exist somewhere but not on local main; can't push.
      out.pushSucceeded = false
      out.pushNote = `pushed: NO (commits not on local main; ahead=${ahead} behind=${behind})`
    }
  }

  return out
}

// Build the per-row terminal classification {status, result, next_step, body}
// from the probe outcome.
function _classifyFromProbe(row, probe) {
  const forkId = row.fork_id
  const tokens = `tokens=in:${row.tokens_input || 0}/out:${row.tokens_output || 0}/tools:${row.tool_calls || 0}`
  const startedIso = row.started_at?.toISOString?.() || row.started_at || 'unknown'
  const heartbeatIso = row.last_heartbeat?.toISOString?.() || row.last_heartbeat || 'null'

  const commitCount = probe.commits.length
  const allPushed = commitCount > 0 && probe.commits.every(c => c.pushed)
  const someUnpushed = commitCount > 0 && !allPushed
  const dirtyCount = probe.dirtyFiles.length
  const dirtyHead = probe.dirtyFiles.slice(0, 10)

  if (commitCount > 0 && allPushed) {
    const shas = probe.commits.map(c => c.sha.slice(0, 12)).join(',')
    const subjects = probe.commits.map(c => c.subject.slice(0, 80)).join(' | ')
    let result = `Fork crashed mid-flight but work shipped: ${commitCount} commit(s), all on origin/main. SHAs: ${shas}. Subjects: ${subjects}. ${tokens}.`
    if (probe.pushAttempted) result += ` ${probe.pushNote || ''}`.trim()
    if (dirtyCount > 0) {
      result += ` Note: working tree still dirty with ${dirtyCount} uncommitted file(s): ${dirtyHead.join(', ')}. Conductor should review.`
    }
    if (probe.errors.length) result += ` (probe-errors: ${probe.errors.slice(0, 3).join('; ')})`
    const body = [
      `[SYSTEM: fork_done ${forkId}]`,
      `Brief: ${(row.brief || '').slice(0, 240)}`,
      `Outcome: fork was killed mid-flight but work shipped. ${commitCount} commit(s) on origin/main.`,
      `SHAs: ${shas}`,
      `Subjects: ${subjects}`,
      `Started: ${startedIso}, last_heartbeat: ${heartbeatIso}, ${tokens}`,
      '',
      'No action needed. Verified per ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md.',
    ].join('\n')
    return { status: 'done', result, next_step: null, body }
  }

  if (commitCount > 0 && someUnpushed) {
    const shas = probe.commits.map(c => `${c.sha.slice(0, 12)}${c.pushed ? '' : '*'}`).join(',')
    const subjects = probe.commits.map(c => c.subject.slice(0, 80)).join(' | ')
    let result = `Fork crashed mid-flight, work committed locally: ${commitCount} commit(s) (* = local-only). SHAs: ${shas}. Subjects: ${subjects}. ${tokens}.`
    if (probe.pushNote) result += ` ${probe.pushNote}`
    if (dirtyCount > 0) {
      result += ` Note: working tree still dirty with ${dirtyCount} uncommitted file(s): ${dirtyHead.join(', ')}. Conductor should review.`
    }
    if (probe.errors.length) result += ` (probe-errors: ${probe.errors.slice(0, 3).join('; ')})`

    // If push failed for divergence reason, give the conductor a real next_step.
    let next_step = null
    if (probe.pushAttempted && !probe.pushSucceeded) {
      next_step = 'Conductor must reconcile main vs origin/main before fork commits land remotely.'
    }
    const body = [
      `[SYSTEM: fork_done ${forkId}]`,
      `Brief: ${(row.brief || '').slice(0, 240)}`,
      `Outcome: fork was killed mid-flight; ${commitCount} commit(s) committed locally.`,
      `SHAs: ${shas}`,
      `Subjects: ${subjects}`,
      `Push: ${probe.pushNote || 'not attempted'}`,
      `Started: ${startedIso}, last_heartbeat: ${heartbeatIso}, ${tokens}`,
      '',
      next_step
        ? `Next: ${next_step}`
        : 'No further action required if push succeeded; verify per ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md.',
    ].join('\n')
    return { status: 'done', result, next_step, body }
  }

  // No commits attributable to this fork.
  if (dirtyCount > 0) {
    const result = `Fork crashed before commit. Working tree dirty with ${dirtyCount} file(s): ${dirtyHead.join(', ')}${dirtyCount > 10 ? ' (+ more)' : ''}. ${tokens}. Recommend \`git diff\` review then commit-or-discard.${probe.errors.length ? ` (probe-errors: ${probe.errors.slice(0, 3).join('; ')})` : ''}`
    const next_step = 'Review fork worktree changes; commit if intent matches brief, else discard.'
    const body = [
      `[SYSTEM: fork_crashed ${forkId}]`,
      `Brief: ${(row.brief || '').slice(0, 240)}`,
      `Outcome: SIGTERMed before commit. Working tree dirty with ${dirtyCount} file(s).`,
      `Files: ${dirtyHead.join(', ')}${dirtyCount > 10 ? ' (+ more)' : ''}`,
      `Started: ${startedIso}, last_heartbeat: ${heartbeatIso}, ${tokens}`,
      '',
      `Next: ${next_step}`,
    ].join('\n')
    return { status: 'crashed', result, next_step, body }
  }

  const result = `Fork crashed before producing any disk artefact. ${tokens}, last_heartbeat=${heartbeatIso}. Safe to redispatch.${probe.errors.length ? ` (probe-errors: ${probe.errors.slice(0, 3).join('; ')})` : ''}`
  const next_step = 'Continuation-aware redispatch per ~/ecodiaos/patterns/continuation-aware-fork-redispatch.md (probe 5 substrates first; if all-clean, full work).'
  const body = [
    `[SYSTEM: fork_crashed ${forkId}]`,
    `Brief: ${(row.brief || '').slice(0, 240)}`,
    `Outcome: SIGTERMed before any commit or disk artefact.`,
    `Started: ${startedIso}, last_heartbeat: ${heartbeatIso}, ${tokens}`,
    '',
    `Next: ${next_step}`,
  ].join('\n')
  return { status: 'crashed', result, next_step, body }
}

async function recoverStaleForks() {
  // 1. Find stale candidates WITHOUT mutating yet — we need to probe per-row
  //    before deciding the terminal status.
  let candidates = []
  try {
    candidates = await db`
      SELECT fork_id, brief, position, started_at, last_heartbeat,
             tokens_input, tokens_output, tool_calls
      FROM os_forks
      WHERE status IN ('spawning', 'running', 'reporting')
        AND COALESCE(last_heartbeat, started_at) < now() - interval '2 minutes'
      ORDER BY started_at ASC
      LIMIT 100
    `
  } catch (err) {
    logger.warn('forkService.recoverStaleForks: candidate query failed (non-fatal)', { error: err.message })
    return { recovered: 0, error: err.message }
  }

  if (!candidates.length) {
    logger.info('forkService.recoverStaleForks: no stale forks to recover')
    return { recovered: 0 }
  }

  // 2. Lazy-load messageQueue once (override in tests).
  let mq = _messageQueueOverride
  if (!mq) {
    try { mq = require('./messageQueue') }
    catch (err) {
      logger.warn('forkService.recoverStaleForks: messageQueue unavailable, skipping enqueue', { error: err.message })
      mq = null
    }
  }

  // 3. Probe + classify + UPDATE per row.
  const results = []
  let enqueued = 0
  for (const row of candidates) {
    let probe
    try {
      probe = await probeForkDeliverables(row.fork_id, row.started_at)
    } catch (err) {
      // Defensive — probeForkDeliverables shouldn't throw, but if it does, fall
      // back to the legacy crashed classification with the error in result.
      logger.warn('forkService.recoverStaleForks: probe threw (non-fatal)', { fork_id: row.fork_id, error: err.message })
      probe = { commits: [], dirtyFiles: [], pushAttempted: false, pushSucceeded: false, pushNote: null, errors: [`probe-threw:${err.message}`] }
    }

    const cls = _classifyFromProbe(row, probe)

    try {
      await db`
        UPDATE os_forks
        SET status        = ${cls.status},
            result        = COALESCE(result, '') || ${cls.result},
            next_step     = ${cls.next_step},
            abort_reason  = COALESCE(abort_reason, ${cls.status === 'done' ? 'api_memory_restart_work_shipped' : 'api_memory_restart'}),
            ended_at      = COALESCE(ended_at, now()),
            position      = COALESCE(position, '') || ${' :: recovered ' + cls.status + ' (probe-then-flip)'}
        WHERE fork_id = ${row.fork_id}
          AND status IN ('spawning', 'running', 'reporting')
      `
    } catch (err) {
      logger.warn('forkService.recoverStaleForks: per-row UPDATE failed (non-fatal)', { fork_id: row.fork_id, error: err.message })
    }

    if (mq) {
      try {
        await mq.enqueueMessage({ body: cls.body, source: `fork_recovery:${row.fork_id}`, mode: 'queue' })
        enqueued++
      } catch (err) {
        logger.warn('forkService.recoverStaleForks: enqueue failed (non-fatal)', { fork_id: row.fork_id, error: err.message })
      }
    }

    results.push({ fork_id: row.fork_id, status: cls.status, commits: probe.commits.length, dirty: probe.dirtyFiles.length, pushed: probe.pushAttempted ? probe.pushSucceeded : null, errors: probe.errors.length })
  }

  logger.warn('forkService.recoverStaleForks: recovered stale forks (probe-then-flip)', {
    recovered: results.length,
    enqueued,
    by_status: results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {}),
    fork_ids: results.map(r => r.fork_id),
  })

  return {
    recovered: results.length,
    enqueued,
    fork_ids: results.map(r => r.fork_id),
    results,
  }
}

// ── Test hooks ──────────────────────────────────────────────────────────────
function _resetForTest() {
  _forks.clear()
  _execGitOverride = null
  _messageQueueOverride = null
}
function _getForkMapForTest() { return _forks }
function _setQueryForTest(fn) { _queryOverride = fn }
function _setExecGitForTest(fn) { _execGitOverride = fn }
function _setMessageQueueForTest(mq) { _messageQueueOverride = mq }
function _setCleanNoopPatternsForTest(patterns) {
  // Override the CLEAN_NOOP_PATTERNS array for tests (mutate in-place)
  CLEAN_NOOP_PATTERNS.length = 0
  CLEAN_NOOP_PATTERNS.push(...patterns)
}

module.exports = {
  spawnFork,
  abortFork,
  sendMessageToFork,
  listForks,
  getFork,
  forksRollup,
  recoverStaleForks,
  probeForkDeliverables,
  HARD_FORK_CAP,
  ENERGY_FORK_CAPS,
  FALLBACK_MARKER,
  _isPhantomBail,
  _buildForkReportBody,
  _enqueueForkReport,
  _resetForTest,
  _getForkMapForTest,
  _setQueryForTest,
  _setExecGitForTest,
  _setMessageQueueForTest,
  _isCleanNoop,
  _setCleanNoopPatternsForTest,
}

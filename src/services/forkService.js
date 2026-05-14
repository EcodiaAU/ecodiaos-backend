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
const credentialFilter = require('../lib/credentialFilter')
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
// Tate verbatim 7 May 2026 12:21 AEST: "Need to get rid of whatever tf is
// capping us to 2 forks, should be soft 3, hard 4 cap." Floor at 3 even when
// budget is critical, ceiling at 4 when healthy. Trade-off: gives up the 5th
// concurrent slot at full energy in exchange for never falling below 3 under
// budget pressure. Conductor + 4 forks = 5 total parallel streams, still
// substantial parallelism without burning weekly tokens on slot-fill.
const HARD_FORK_CAP = 4
const ENERGY_FORK_CAPS = {
  full:     4,
  healthy:  4,
  conserve: 4,
  low:      3,
  critical: 3,
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

// ── [FORK_REPORT] / [NEXT_STEP] transcript extractor ────────────────────────
// Pure function. Single source of truth for the regex pair, so the live
// stream-complete handler (line ~1068) and the retro-fix script under
// scripts/retro-fix-fork-result-fallback-extraction.js stay in lockstep,
// and tests can lock the contract independently of the SDK loop.
//
// Regex history:
//   pre-2026-05-07 — `\[FORK_REPORT\][^\n]*([\s\S]*?)…`
//     `[^\n]*` greedily consumed same-line body content. When the model
//     emitted the brief-prescribed shape `[FORK_REPORT] <body on same line>`,
//     the capture group started after the first \n and ran to [NEXT_STEP]
//     or end-of-string — body trimmed to '' → falsy → caller fell into the
//     FALLBACK_MARKER path even though a real report had been emitted.
//     127/186 fallback rows in 7 days of pre-fix telemetry came in via this
//     path (status_board "Phantom_bail extraction false-negatives").
//   2026-05-07 (commit 58bb87a) — `\[FORK_REPORT\]\s*([\s\S]*?)…`
//     `\s*` lets same-line body fall through to the lazy capture. Same fix
//     applied to the [NEXT_STEP] regex (also had `[^\n]*`, also lost the
//     one-sentence next-step content).
function _extractForkReport(transcript) {
  const fullText = (transcript || []).join('\n\n')
  const reportMatch = fullText.match(/\[FORK_REPORT\]\s*([\s\S]*?)(?:\[NEXT_STEP\]|$)/i)
  const nextMatch = fullText.match(/\[NEXT_STEP\]\s*([\s\S]*?)$/i)
  const report = reportMatch ? reportMatch[1].trim() : null
  const nextStep = nextMatch ? nextMatch[1].trim() : null
  return { fullText, reportMatch, report, nextMatch, nextStep }
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
function _buildForkReportBody({ fork_id, brief, report, nextStep, fallbackResult, transcriptTail }) {
  // report is null when regex did NOT match (truly no FORK_REPORT).
  // report is '' when regex matched but body was empty
  // (e.g. [FORK_REPORT] all on one line followed by \n\n[NEXT_STEP]).
  // Both cases must be distinguished — empty body is still a valid report.
  if (report !== null) {
    // Non-empty body: render verbatim with no diagnostic tag.
    if (report) {
      return [
        `[SYSTEM: fork_report ${fork_id}]`,
        `Brief: ${brief}`,
        '',
        `Report: ${report}`,
        nextStep ? `\nNext step suggested: ${nextStep}` : '',
      ].filter(Boolean).join('\n')
    }
    // Empty body (report === ''): marker emitted but no content. This is a
    // model-side bug we defend against — surface diagnostic tag + transcript
    // tail (if available) so the conductor has something to anchor probes
    // to. Origin: Tate verbatim 6 May 2026 21:44 AEST "We need to fix the
    // empty fork reports and bail managers once and for all please".
    const tailRaw = typeof transcriptTail === 'string' ? transcriptTail : ''
    let tailRender
    if (!tailRaw.trim()) {
      tailRender = '(no transcript captured)'
    } else if (tailRaw.length > 500) {
      tailRender = `…${tailRaw.slice(-500)}`
    } else {
      tailRender = tailRaw
    }
    return [
      `[SYSTEM: fork_report ${fork_id} empty_body=true]`,
      `Brief: ${brief}`,
      '',
      `Report: (empty body - FORK_REPORT marker emitted but no content; transcript tail surfaced below for diagnosis)`,
      '',
      `Transcript tail (last 500 chars before marker):`,
      tailRender,
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

async function _enqueueForkReport({ fork_id, parent_id, brief, report, nextStep, fallbackResult, transcriptTail, is_cron = false }) {
  // Suppress clean no-op reports from cron-spawned forks — they pollute main chat
  if (_isCleanNoop(report, brief)) {
    logger.debug('forkService: suppressed clean no-op cron fork_report', { fork_id })
    return { enqueued: false, reason: 'suppressed_clean_noop' }
  }

  // Cron-routed forks: substrate-only routing.
  // Tate verbatim 7 May 2026 09:15 AEST: "is it not a deeper problem bro...
  // it should jsut be handled by a fork that you can ignore unless needed."
  // Cron forks (is_cron=true on the os_forks row, set at INSERT by
  // cronForkDispatcher) emit reports into the passive substrate only:
  //   - <forks_rollup> context block (forksRollup() reads os_forks directly,
  //     surfaces last 15 min finished forks on every natural conductor turn)
  //   - status_board P-row (if the fork wrote one - genuine emergencies still
  //     surface via status_board → perception_dispatcher → existing wake path)
  //   - perceptionBus 'fork_complete' event (forkService publishes this for
  //     every successful fork at lines ~979-996, regardless of is_cron)
  // What is suppressed: the messageQueue.enqueueMessage path that drains as
  // a [SYSTEM: fork_report ...] queue message on the next conductor turn.
  // That drain is what forces the conductor into "Idle." reply turns when
  // a cron fires with nothing actionable. The forkComplete listener-side
  // wake suppression is the sibling half of this fix; together they keep
  // cron-fork reports off the conductor turn substrate entirely.
  // Doctrine: ~/ecodiaos/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md
  // Origin: Migration 088, fork_mouofp9r_72cd3a, 7 May 2026.
  if (is_cron) {
    // Audit 2026-05-13 P0 #17: cron forks have no inbox/wake — that's
    // intended for clean cron runs. But a cron fork that PHANTOM-BAILS
    // (closed without [FORK_REPORT]) or otherwise had a degraded outcome
    // previously vanished completely after the 15-min <forks_rollup>
    // window — no substrate landing, no status_board row, no inbox.
    // Land a durable kv_store row for the degraded subset so the
    // conductor can probe `cron.fork_outcome.*` keys instead of relying
    // on the volatile rollup. Clean cron runs (real report present)
    // continue to surface only via the rollup as before.
    const isPhantomBail = report === null || (typeof report === 'string' && _isPhantomBail(report))
    const isEmpty = typeof report === 'string' && report.trim().length === 0
    if (isPhantomBail || isEmpty) {
      try {
        const db = require('../config/db')
        // Encode the cron name from the brief head when possible; fall
        // back to fork_id. The conductor uses this prefix to enumerate
        // recent degraded cron outcomes via kvStore.list.
        const briefHead = String(brief || '').slice(0, 80).replace(/[^\w.-]+/g, '_').slice(0, 64) || 'unknown'
        const key = `cron.fork_outcome.${briefHead}.${fork_id}`
        const payload = JSON.stringify({
          fork_id,
          brief_head: briefHead,
          outcome: isPhantomBail ? 'phantom_bail' : 'empty_report',
          fallback_result: fallbackResult || null,
          transcript_tail: typeof transcriptTail === 'string' ? transcriptTail.slice(0, 1200) : null,
          observed_at: new Date().toISOString(),
        })
        await db`
          INSERT INTO kv_store (key, value, updated_at)
          VALUES (${key}, ${payload}::jsonb, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `
        logger.warn('forkService: cron fork degraded outcome landed in kv_store', {
          key, fork_id, outcome: isPhantomBail ? 'phantom_bail' : 'empty_report',
        })
      } catch (kvErr) {
        logger.warn('forkService: failed to land cron degraded outcome to kv_store', {
          fork_id, error: kvErr.message,
        })
      }
    }
    logger.info('forkService: cron-routed fork_report substrate-only (no messageQueue enqueue)', {
      fork_id, parent_id, had_report: report !== null,
    })
    return { enqueued: false, reason: 'cron_routed_substrate_only' }
  }

  const body = _buildForkReportBody({ fork_id, brief, report, nextStep, fallbackResult, transcriptTail })

  // Sub-fork routing: if parent_id is a live fork (not 'main'), inject the report
  // directly into the parent fork's message stream. The parent aggregates sub-reports
  // and emits its own [FORK_REPORT] to main. This keeps conductor context clean —
  // it only sees the manager's summary, not raw worker output.
  if (parent_id && parent_id !== 'main') {
    const parentFork = _forks.get(parent_id)
    if (parentFork) {
      try {
        sendMessageToFork(parent_id, `[SUB_FORK_REPORT from ${fork_id}]\n${body}`)
        logger.info('forkService: sub-fork report injected to parent', { fork_id, parent_id })
        return { enqueued: true, routed_to_parent: true, had_report: report !== null }
      } catch (err) {
        logger.warn('forkService: sub-fork report injection to parent failed, falling back to main queue', {
          fork_id, parent_id, error: err.message,
        })
        // Fall through to main queue on failure
      }
    } else {
      // Parent fork not live (already finished or crashed). Fall back to main queue
      // so the report isn't lost — conductor can see it even if parent is gone.
      logger.info('forkService: parent fork not live, routing sub-fork report to main queue', { fork_id, parent_id })
    }
  }

  // Clean fork_report duplicate-delivery gate (Tate verbatim 7 May 2026 12:05 AEST:
  // "shouldnt be giving you the body twice, once properly and that 2nd one in the
  // chat, pretending to be my message"). When a fork emits a NON-EMPTY [FORK_REPORT]
  // body, the forkComplete listener's wake_on_done direct-mode POST is the proper
  // delivery path — it carries an excerpt header and the conductor can probe
  // os_forks.${fork_id}.result for the full body. Enqueueing a queue row in addition
  // causes drainIntoDirectMessage (called by the same wake POST handler) to prepend
  // the same body in `[Pending queued messages delivered opportunistically]` framing,
  // producing the duplicate Tate flagged.
  //
  // This skip is the SUCCESS-path mirror of the error-path rule in
  // ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
  // (forkComplete listener never POSTs to /api/os-session/message for terminal
  // failures). The same principle applies to the success path: pick ONE delivery
  // surface, not two.
  //
  // Queue path is RETAINED for cases where the wake_on_done listener stays SILENT
  // (forkComplete.js lines 140-144), so the conductor would otherwise have no
  // inbox surface for the fork:
  //   - report === null  (phantom-bail; FALLBACK_MARKER + transcript tail body)
  //   - report === ''    (empty body; marker emitted but no content + diagnostic)
  //   - cron-routed forks (handled by is_cron return above; substrate-only)
  //   - sub-fork reports  (handled by parent_id !== 'main' route above; -> parent)
  //
  // Doctrine: ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
  // Origin:   fork_mouuhla4_128a27, 7 May 2026, sibling patch to phantom-bail fix 58bb87a.
  const isCleanReport = typeof report === 'string' && report.length > 0
  if (isCleanReport) {
    logger.info('forkService: clean fork_report wake_on_done sufficient - skipping queue enqueue (duplicate-delivery gate)', {
      fork_id, parent_id, report_chars: report.length,
    })
    return { enqueued: false, reason: 'clean_report_wake_on_done_sufficient', had_report: true }
  }

  let mq = _messageQueueOverride
  if (!mq) {
    try { mq = require('./messageQueue') }
    catch (err) {
      logger.warn('forkService: messageQueue unavailable, skipping fork_report enqueue', { fork_id, error: err.message })
      return { enqueued: false, reason: 'mq_unavailable' }
    }
  }
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
    root_fork_id:   state.root_fork_id || state.fork_id,
    is_manager:     !!state.is_manager,
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
    // root_fork_id: the fork hierarchy column added by migration 087.
    // Defaults to fork_id for root-level forks. Defense-in-depth — the
    // primary path is forkCapAtomic.tryReserveForkSlot which already writes
    // this column under advisory lock. _dbInsert is the legacy backup path
    // (ON CONFLICT DO NOTHING) so it must also include root_fork_id or any
    // future code path landing here would leave it null.
    await db`
      INSERT INTO os_forks (
        fork_id, parent_id, root_fork_id, brief, context_mode, status,
        provider, started_at
      ) VALUES (
        ${state.fork_id}, ${state.parent_id}, ${state.root_fork_id || state.fork_id},
        ${state.brief}, ${state.context_mode}, ${state.status},
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
// _activeCount() was the in-memory count used by the pre-atomic-cap path. After
// migration to tryReserveForkSlot (forkCapAtomic.js, FORK_ATOMICITY_SPEC §2),
// cap enforcement reads from the DB inside the same transaction as the INSERT.
// The in-memory Map is now purely cosmetic (frontend rendering linger). This
// function is deleted to prevent future drift between "what the cap thinks" and
// "what the DB knows". If you need a count, call forkCapAtomic.liveForkCount().

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
      model: env.SUBAGENT_MODEL || 'claude-opus-4-7',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.comms),
      permissionMode: 'bypassPermissions',
      maxTurns: 30,
    },
    finance: {
      description: 'Fork-mode finance officer: bookkeeping, P&L, BAS/GST.',
      prompt: 'You are a fork-mode finance officer. Same rules as the main finance subagent.',
      model: env.SUBAGENT_MODEL || 'claude-opus-4-7',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.finance),
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
    },
    ops: {
      description: 'Fork-mode ops engineer: VPS, PM2, deployments.',
      prompt: 'You are a fork-mode ops engineer. Diagnose before acting. Stamp git commits and pm2 actions clearly.',
      model: env.SUBAGENT_MODEL || 'claude-opus-4-7',
      mcpServers: _subagentMcpForDomain(all, FORK_SUBAGENT_DOMAINS.ops),
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
    },
    social: {
      description: 'Fork-mode social/platform specialist: Vercel, Zernio, Xero.',
      prompt: 'You are a fork-mode social/platform specialist.',
      model: env.SUBAGENT_MODEL || 'claude-opus-4-7',
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

- Work on the brief, then end your final message with the FORK_REPORT block.
- Stamp every external side-effect (commits, emails, SMS, Neo4j writes) with your fork id (${fork_id}) so duplicate-detection works.
- If you hit something only main should decide, write it into [FORK_REPORT] and stop.
- Keep your output tight. Main's context is the precious one, but you still cost tokens.

## CRITICAL EXIT PROTOCOL — emit FORK_REPORT or you phantom-bail

The conductor cannot read your transcript. The ONLY signal that main sees is the
FORK_REPORT block in your final assistant message. If you close the fork without
emitting this block (or emit it with an empty body), it counts as a phantom_bail
and the work is invisible to main even if you shipped real artefacts to disk/DB.

REQUIRED SHAPE — emit EXACTLY this block as the final content of your final
assistant message (after all tool calls, before the turn closes):

    [FORK_REPORT] <one paragraph (40-200 words): what you did, what shipped (commits/file paths/row counts), what failed, anything main needs to verify>
    [NEXT_STEP] <one short sentence: what main should do next, or "no action needed">

Rules:
- The body content goes ON THE SAME LINE as [FORK_REPORT], OR on the line(s)
  immediately after — both are parsed correctly. Do NOT leave the body empty.
- [NEXT_STEP] is REQUIRED. If there is genuinely nothing to do, write "no action needed".
- Do NOT emit the block in the middle of your response, then keep working — the
  parser greps the whole transcript but expects the block to be the closing
  artefact. Emit once, at the end.
- Do NOT emit the literal string \`<one paragraph...>\` or any of the angle-bracket
  placeholders verbatim — substitute real content.

Failure modes to avoid:
- Closing the fork after a tool call without any final assistant text → phantom_bail
- Emitting [FORK_REPORT] alone with no body content → empty_body=true
- Emitting only [FORK_REPORT] without [NEXT_STEP] → next_step missing in inbox
- Burying the block 5 paragraphs up in a longer narrative → still parsed but harder
  to read; put it at the end

# Manager forks (only if brief contains MANAGER: true)
If your brief marks you as a MANAGER fork, you are the project manager for your subtree.

**CRITICAL — STAY ALIVE UNTIL SUB-FORKS REPORT.** A manager fork that
spawns sub-forks then emits [FORK_REPORT] immediately is BROKEN. You MUST
stay alive (continue taking turns, polling, reading artefacts) until every
sub-fork you spawned has reached a terminal status. The natural reflex
after dispatching workers is "I'm done, emit FORK_REPORT" — that reflex
is wrong here. Your job is to coordinate and consolidate; that work
happens AFTER the workers finish, not when you spawn them.

## Manager responsibilities:
1. DECOMPOSE: Break the brief into independent worker tasks. Spawn sub-forks for each.
2. COORDINATE: After spawning, call \`mcp__forks__wait_for_sub_forks\` ONCE with the list
   of sub_fork_ids you spawned and \`max_wait_sec: 1800\` (or longer for very slow
   pipelines, cap 3600). This BLOCKS your turn while the workers run — the SDK keeps
   your turn alive structurally because a tool call is in flight, so you cannot
   phantom-bail. When the tool returns, every sub-fork is terminal and you have
   aggregated reports + next_steps in one structured payload. If the wait times out the
   payload includes \`still_pending: [...]\` and you decide whether to call again, abort
   stragglers, or proceed with what shipped. Do NOT use \`list_forks\` or \`db_query
   os_forks\` in a hand-rolled polling loop — that pattern fails because your turn ends
   between polls (root cause of the 37% phantom_bail rate before this tool existed).
3. RETRY: If \`wait_for_sub_forks\` reports a sub-fork as \`error\`/\`aborted\`/\`crashed\`, or
   the result_head shows the FALLBACK_MARKER (no [FORK_REPORT] emitted), probe its
   deliverables (db_query os_forks, git log --grep, ls -la <expected_artefact_path>).
   If work partially landed, spawn a cleanup fork. If it fully failed, re-dispatch with
   a tighter brief. Then call wait_for_sub_forks again with the new sub_fork_ids.
4. VERIFY: After workers terminate, verify their claims match reality. Read each
   sub-fork's durable artefact (the file path it names in its [SUB_FORK_REPORT],
   typically under \`~/ecodiaos/drafts/<artefact>.md\`), then check the actual deployed
   state, committed code, or DB rows before trusting a sub-fork's self-report.
5. CONSOLIDATE: Aggregate the workers' findings, ship any code/commits the work demands,
   write ONE [FORK_REPORT] to the conductor that tells the full story: what shipped,
   what didn't, what the conductor should do next.

## Manager mechanics:
- ALWAYS pass parent_fork_id="${fork_id}" to mcp__forks__spawn_fork when spawning sub-forks.
- Sub-fork [FORK_REPORT]s arrive as [SUB_FORK_REPORT from <id>] messages in YOUR stream (not the conductor's).
- You have a per-tree cap of 5 sub-forks. The conductor's global cap doesn't affect you.
- \`wait_for_sub_forks\` is the only correct way to wait. \`list_forks\` and
  \`db_query os_forks WHERE parent_fork_id = '${fork_id}'\` remain useful for one-off
  status spot-checks (e.g. mid-decomposition, before deciding whether to spawn the next
  sub-fork) but never as a substitute for the blocking wait — a hand-rolled polling
  loop ends your turn between polls and the fork closes silently.
- If a sub-fork phantom-bails (status=done but \`result_head\` carries the FALLBACK_MARKER
  prefix), check db_query os_forks or git log --grep=<fork_id> for the actual work.
- Don't emit your own [FORK_REPORT] until ALL sub-forks have completed (or been given up on). The conductor doesn't want partial reports.

## Manager anti-patterns (avoid):
- **Emitting [FORK_REPORT] right after spawning sub-forks.** This is the #1 manager
  failure mode. You haven't done your job yet — your job is coordinate + consolidate.
- Don't do sub-task work yourself. If it's decomposable, spawn it.
- Don't send the conductor multiple messages. ONE [FORK_REPORT] at the end.
- Don't bail early because one sub-fork failed. Retry it or report what DID work.`

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
    const deepseekProxy = require('./deepseekProxyService')
    sessionEnv.ANTHROPIC_BASE_URL = env.DEEPSEEK_FALLBACK_BASE_URL || deepseekProxy.getBaseUrl()
    sessionEnv.ANTHROPIC_API_KEY  = env.DEEPSEEK_API_KEY
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN_TATE
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN_CODE
    delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN_MONEY
    model = 'deepseek-v4-pro'
  // Bedrock branch removed Tate 5 May 2026 12:40 AEST per
  // ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
  } else if (best.provider === 'claude_max_3') {
    provider = 'claude_max_3'
    delete sessionEnv.ANTHROPIC_API_KEY
    sessionEnv.CLAUDE_CODE_OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
    delete sessionEnv.CLAUDE_CONFIG_DIR
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
// parent_fork_id: 'main' (default) = conductor-level fork.
//   Any other fork_id = sub-fork (manager/worker hierarchy).
//   Sub-forks count against the parent tree's per-tree cap, not the global cap.
//   Sub-fork [FORK_REPORT] messages route to the parent fork's inbox, not main's.
//
// is_cron (default false): true ONLY when called by cronForkDispatcher.
//   Cron-routed forks emit [FORK_REPORT] into the passive substrate
//   (<forks_rollup>, perceptionBus, status_board) but NOT into the
//   conductor's messageQueue and they do NOT trigger the forkComplete
//   listener wake. The conductor sees outcomes via context-stitching on
//   the next natural turn (meta-loop, Tate-typed message, stale-heartbeat).
//   Doctrine: ~/ecodiaos/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md
async function spawnFork({ brief, context_mode = 'recent', parent_fork_id = 'main', is_cron = false } = {}) {
  if (!brief || typeof brief !== 'string' || !brief.trim()) {
    throw Object.assign(new Error('brief is required'), { httpStatus: 400, code: 'invalid_brief' })
  }
  if (!['recent', 'brief'].includes(context_mode)) {
    throw Object.assign(new Error('context_mode must be "recent" or "brief"'), {
      httpStatus: 400, code: 'invalid_context_mode',
    })
  }

  // Resolve root_fork_id for per-tree cap enforcement.
  // For root-level forks (parent='main'): root = this fork itself.
  // For sub-forks: inherit root from parent's DB row.
  let root_fork_id = null
  if (parent_fork_id !== 'main') {
    try {
      const parentRow = await db`
        SELECT root_fork_id FROM os_forks WHERE fork_id = ${parent_fork_id} LIMIT 1
      `
      root_fork_id = parentRow[0]?.root_fork_id || parent_fork_id
    } catch {
      root_fork_id = parent_fork_id
    }
  }

  // Atomic cap check + DB insert via pg_advisory_xact_lock.
  // Closes the TOCTOU race: count read + insert in one transaction.
  const fork_id = _newForkId()
  // root resolves after fork_id is generated (root = fork_id for root-level)
  const effectiveRoot = root_fork_id || fork_id
  const eCap = await _energyCap()
  await tryReserveForkSlot({
    fork_id,
    brief,
    context_mode,
    parent_id: parent_fork_id,
    root_fork_id: effectiveRoot,
    hard_cap: HARD_FORK_CAP,
    energy_cap: eCap,
    is_cron: !!is_cron,
  })

  // Per-fork worktree isolation (FORK_ATOMICITY_SPEC §3, AUTONOMY_AUDIT_2026-05-13).
  // Default: shared cwd (legacy). Activated by FORK_WORKTREE_ISOLATION=true env.
  // If creation fails, fall back to shared cwd so spawn does not break.
  const forkWorktree = require('../lib/forkWorktree')
  let _worktreePath = null
  if (forkWorktree.isEnabled({ is_cron: !!is_cron })) {
    _worktreePath = await forkWorktree.createWorktree(fork_id)
  }
  const cwd = _worktreePath || env.OS_SESSION_CWD || '/home/tate/ecodiaos'
  const { provider, env: sessionEnv, model, isDeepseek } = _resolveProviderForFork()
  const abort = new AbortController()
  const startedAt = Date.now()

  // Manager-fork detection: if the brief contains the literal MANAGER: true
  // sentinel as its own line (case-insensitive), this fork is a manager and
  // the rollup should surface it as such even before sub-forks are spawned.
  // Without this, a manager looks identical to a regular fork in
  // <forks_rollup> until its first sub-fork lands — slow visibility for the
  // conductor.
  //
  // The regex is line-anchored (^\s* ... $) on purpose: a substring match
  // anywhere in the brief produced false positives when worker briefs cited
  // the contract in prose (e.g. "you are not a manager fork; brief does not
  // contain `MANAGER: true`"). The canonical contract requires the marker on
  // its own line — first non-blank line, or anywhere prominent — never
  // embedded in narrative text or inside backticks within prose.
  // See ~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md.
  // Origin: fork_moyczp7o_1dcf2b 2026-05-09 mistakenly tagged
  // [manager, awaiting subs] because its brief contained the contract
  // citation as a negation. Fixed in fork_moyv082w_1c45ac.
  const is_manager = /^\s*MANAGER\s*:\s*true\b/im.test(brief)
  if (is_manager) {
    logger.info('forkService: spawning manager fork', { fork_id, parent_fork_id })
  }

  const state = {
    fork_id,
    parent_id: parent_fork_id,
    root_fork_id: effectiveRoot,
    is_manager,
    is_cron: !!is_cron,
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
    worktree_path: _worktreePath || null,
  }
  _forks.set(fork_id, state)
  _emitForkEvent('spawned', state)

  // Open a working_set thread for this fork. Fire-and-forget: never blocks spawn.
  // Thread ID is stored in artifacts so forkComplete listener can close it on done/error.
  // Brief head = first non-empty line, up to 120 chars.
  ;(async () => {
    try {
      const ws = require('./workingSetService')
      const briefHead = brief.split('\n').map(l => l.trim()).find(l => l.length > 0) || `fork ${fork_id}`
      await ws.openThread({
        topic: briefHead.slice(0, 120),
        intent: `Fork dispatched: ${fork_id}${parent_fork_id !== 'main' ? ` (sub of ${parent_fork_id})` : ''}`,
        artifacts: { fork_id },
      })
    } catch { /* non-fatal */ }
  })()

  // Build SDK options. We deliberately reuse main's pattern (custom systemPrompt
  // string, conductor MCP, agents) so behaviour is symmetrical, then layer on
  // the fork-specific brief.
  const allConfigs = _getAllMcpConfigs(cwd)
  const mcpServers = _conductorMcp(allConfigs)

  // Wire the in-process `forks` MCP server (spawn_fork / list_forks / abort_fork)
  // into this fork's MCP surface, mirroring osSessionService.js (lines 1322-1328).
  // Without this, forkService.spawnFork only loads STDIO subprocess MCP servers
  // from .mcp.json and the manager-fork primitive (a fork dispatching sub-forks)
  // silently degrades — managers can describe sub-fork plans but cannot actually
  // trigger them. Failure here is non-fatal — fork proceeds without fork tools.
  try {
    const { getForkConductorMcpServer } = require('./forkConductorTool')
    const forksServer = await getForkConductorMcpServer()
    if (forksServer) mcpServers.forks = forksServer
  } catch (err) {
    logger.warn('forkService: fork conductor MCP server unavailable for sub-fork', { error: err?.message })
  }

  const systemPrompt = _buildForkSystemPrompt(cwd, fork_id, brief)

  const options = {
    cwd,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    // SDK auto-detect picks the musl variant on Ubuntu (glibc) and 35ms-errors
    // because /lib/ld-musl-x86_64.so.1 doesn't exist. Force the glibc binary.
    // Origin: 8 May 2026 18:30 AEST - musl variant installed at 08:26 broke ALL
    // fork dispatch for 2h until conductor diagnosed + fixed.
    pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude',
    includePartialMessages: true,
    systemPrompt,
    // Conductor stays on OS_SESSION_MODEL (Opus). Forks use Sonnet by default
    // to conserve weekly quota. Override per-tier via FORK_MANAGER_MODEL /
    // FORK_WORKER_MODEL env vars. DeepSeek forks already have model='deepseek-v4-pro'
    // from _resolveProviderForFork() and bypass this branch.
    //
    // 1M-context mode is GONE. Anthropic bills 1M overage separately and the
    // Max accounts blew their weekly quota in seconds with
    // `API Error: Extra usage is required for 1M context`. The previous
    // opt-in gate (FORK_ENABLE_1M_CONTEXT) was the wrong shape — any operator
    // who set FORK_*_MODEL with a `[1m]` suffix would re-trigger the bug.
    // Strip the suffix on every dispatch. Tate, 2026-05-11:
    // "just fucking get rid of the 1m context". Do not reintroduce.
    model: model || (() => {
      const base = is_manager
        ? (env.FORK_MANAGER_MODEL || 'claude-sonnet-4-6')
        : (env.FORK_WORKER_MODEL  || 'claude-sonnet-4-6')
      return base.replace(/\[1m\]$/i, '')
    })(),
    maxTurns: 1000,  // raised from SDK default (~30) so forks can complete substantial multi-step work
    // Adaptive on Claude (avoids thinking round-trip 400s), disabled on DeepSeek.
    thinking: isDeepseek ? { type: 'disabled' } : { type: 'adaptive' },
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
      logger.info('forkService: starting fork', { fork_id, provider, context_mode, brief_chars: brief.length, model: options.model, is_manager })

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

      // eslint-disable-next-line no-labels
      forkLoop: for await (const msg of q) {
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
                  // Pre-broadcast credential redaction (matches osSessionService
                  // line ~2209 main-session path). Without this, fork tool_use_result
                  // content (anything from `Bash env`, db_query, MCP errors, etc.)
                  // can carry raw `sbp_*` Supabase tokens or service_role JWTs into
                  // the WS broadcast envelope. wsManager._redactEnvelope catches it
                  // at the sink, but counting at the source attributes the leak
                  // correctly (and is cheaper than scanning the whole envelope twice).
                  // Origin: fork_moujifrz_fdea76 service_key WS leak investigation.
                  txt = credentialFilter.redact(txt, 'forkService.toolResultEmit')
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
            // FIX (fork_mp41umvg_46586a, 2026-05-13): break out of the for-await loop
            // immediately. The prior `break` here exited only the switch statement, leaving
            // the for-await loop awaiting the SDK generator's natural close — which
            // empirically takes 60-90+ minutes (the SDK does not close its async iterator
            // promptly after yielding the terminal 'result' event). Every fork therefore
            // hung in status='reporting' for up to 94 minutes before the loop exited.
            //
            // `break forkLoop` exits the outer for-await loop directly, advancing to the
            // post-loop block (report extraction + status='done' write) in under 1ms.
            //
            // Cleanup: the SDK generator `q` may still be open. We close it non-blockingly
            // below to release any internal SDK resources/connections. The AbortController
            // (`state.abort`) is NOT signalled here — the fork succeeded, there is nothing
            // to abort. `_forks.delete(fork_id)` runs 60s after termination (setTimeout in
            // finally block), releasing the last reference and allowing GC.
            // eslint-disable-next-line no-labels
            break forkLoop
          }
        }
      }

      // Non-blocking cleanup: if we broke out of the loop early (via `break forkLoop`
      // on the 'result' case), the SDK generator may still be open. Calling .return()
      // signals it to run any internal finally blocks and release connections.
      // We do NOT await — the generator's cleanup is best-effort; a slow/hanging
      // cleanup must not delay the status='done' write. Errors swallowed silently.
      if (q && typeof q.return === 'function') {
        try { Promise.resolve(q.return(undefined)).catch(() => {}) } catch {}
      }

      // Stream complete — extract [FORK_REPORT] / [NEXT_STEP] from transcript.
      // Pure-function helper: see _extractForkReport above for regex history
      // (root-cause patch 7 May 2026 commit 58bb87a, retro-fixer in
      // scripts/retro-fix-fork-result-fallback-extraction.js, contract test
      // in tests/forkReportExtraction.test.js).
      const { fullText, reportMatch, report, nextStep } = _extractForkReport(state.transcript)

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
        // Fix B (parser hardening, 7 May 2026): if regex matched but body
        // is still empty after trim (e.g. model emitted just `[FORK_REPORT]\n
        // [NEXT_STEP]` with no body — itself a model-side bug, but defend
        // against it), synthesise a body from the last 500 chars of transcript
        // BEFORE the [FORK_REPORT] marker. Better than empty: the conductor
        // gets actual work-product context to anchor probes to. Tagged with
        // a distinct marker so the rollup can distinguish synthetic from
        // verbatim bodies.
        if (report) {
          state.result = report
        } else {
          const reportIdx = fullText.search(/\[FORK_REPORT\]/i)
          const preReport = reportIdx > 0 ? fullText.slice(0, reportIdx) : ''
          const synthTail = preReport.length > 500 ? preReport.slice(-500) : preReport
          if (synthTail.trim().length > 0) {
            state.result = `(report body empty — synthesised from transcript tail)\n\n${synthTail.trim()}`
          } else {
            state.result = '(report body empty — FORK_REPORT immediately followed by NEXT_STEP, no transcript context)'
          }
        }
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

      // Publish to perception bus — universal domain-reactive dispatch.
      // Forks get the same intelligence as conductor (finance, CRM, error
      // escalation, status_board tracking) without separate listener chats.
      try {
        const pb = require('./perceptionBus')
        pb.publish({
          source: `fork:${fork_id}`,
          kind: 'fork_complete',
          data: {
            fork_id,
            status: 'done',
            brief_head: (brief || '').slice(0, 120),
            report_head: (report || '').slice(0, 200),
            next_step: nextStep || null,
            tokens_total: state.tokens_input + state.tokens_output,
            tool_calls: state.tool_calls,
            duration_ms: state.ended_at - state.started_at,
            parent_id: state.parent_id,
          },
          confidence: report ? 0.8 : 0.5,
        }).catch(() => {})
      } catch {}

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
      // Compute transcript tail BEFORE the [FORK_REPORT] marker for the
      // empty_body diagnostic body (per _buildForkReportBody empty-body path).
      // When the model emitted the marker but no body, this tail is the only
      // breadcrumb the conductor has to anchor a probe-then-trust verification.
      let _transcriptTail
      if (report === '' && fullText) {
        const _markerIdx = fullText.search(/\[FORK_REPORT\]/i)
        const _pre = _markerIdx > 0 ? fullText.slice(0, _markerIdx) : ''
        _transcriptTail = _pre.length > 500 ? _pre.slice(-500) : _pre
      }
      await _enqueueForkReport({
        fork_id,
        parent_id: state.parent_id,
        brief,
        report,
        nextStep,
        fallbackResult: state.result,
        transcriptTail: _transcriptTail,
        is_cron: state.is_cron,
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
      // Cleanup isolated worktree (if any). Best-effort, non-fatal on failure.
      if (state.worktree_path) {
        forkWorktree.removeWorktree(fork_id, state.worktree_path).catch(err =>
          logger.warn('forkService: worktree cleanup failed (non-fatal)', { fork_id, error: err.message })
        )
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
  // Build tree-aware rollup: group sub-forks under their parent, indent workers.
  const rootForks = live.filter(f => f.parent_id === 'main')
  const subForksByParent = new Map()
  for (const f of live) {
    if (f.parent_id !== 'main') {
      if (!subForksByParent.has(f.parent_id)) subForksByParent.set(f.parent_id, [])
      subForksByParent.get(f.parent_id).push(f)
    }
  }
  const lines = []
  const _forkLine = (f, indent = '') => {
    const ageSec = f.started_at ? Math.round((Date.now() - new Date(f.started_at).getTime()) / 1000) : 0
    const subCount = subForksByParent.has(f.fork_id) ? subForksByParent.get(f.fork_id).length : 0
    // Surface manager status even before sub-forks are spawned. Without this,
    // a manager looks identical to a regular fork until its first worker
    // lands. The is_manager flag is set at spawn time by parsing the brief
    // for the MANAGER: true sentinel.
    let sub = ''
    if (subCount > 0) sub = ` [manager, ${subCount} sub]`
    else if (f.is_manager) sub = ' [manager, awaiting subs]'
    return `${indent}- ${f.fork_id} [${f.status}${sub}] (${ageSec}s, ${f.tool_calls} tools) brief="${(f.brief || '').slice(0, 60)}"`
  }
  for (const f of rootForks) {
    lines.push(_forkLine(f))
    const subs = subForksByParent.get(f.fork_id) || []
    for (const sf of subs) lines.push(_forkLine(sf, '  '))
  }
  // Orphaned sub-forks whose parent isn't in the live list (parent finished mid-way)
  for (const f of live) {
    if (f.parent_id !== 'main' && !rootForks.find(r => r.fork_id === f.root_fork_id)) {
      lines.push(_forkLine(f, '  '))
    }
  }
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

async function recoverStaleForks({ bootMode } = {}) {
  // Auto-detect boot mode: if the in-memory _forks map is empty, the API has
  // just rebooted and EVERY non-terminal os_forks row is orphaned by definition
  // (forks live in-memory only; the Map is rebuilt from zero on every boot).
  // The 2-minute heartbeat filter (used historically) was the bug Tate flagged
  // 5 May 2026: forks killed seconds before a PM2 restart still had warm
  // heartbeats at boot, so they were excluded — left forever stuck in 'running'.
  // Cross-reference: ~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md
  const inferredBoot = bootMode === true || _forks.size === 0

  // 1. Find stale candidates WITHOUT mutating yet — we need to probe per-row
  //    before deciding the terminal status.
  let candidates = []
  try {
    candidates = inferredBoot
      ? await db`
          SELECT fork_id, brief, position, started_at, last_heartbeat,
                 tokens_input, tokens_output, tool_calls
          FROM os_forks
          WHERE status IN ('spawning', 'running', 'reporting')
          ORDER BY started_at ASC
          LIMIT 100
        `
      : await db`
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
  _extractForkReport,
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

/**
 * dispatchEventConsumer.js
 *
 * Phase B (Layer 4) of the Decision Quality Self-Optimization Architecture.
 * See: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *
 * Reads JSONL telemetry events emitted by the four PreToolUse hooks
 * (~/ecodiaos/scripts/hooks/*.sh) into the dispatch_event + surface_event
 * tables. The hooks emit at hot-path (microseconds per event) using
 * append-only JSONL writes to ~/ecodiaos/logs/telemetry/dispatch-events.jsonl.
 * This consumer runs out-of-band (every 15 minutes) and normalises the
 * accumulated events into queryable Postgres rows.
 *
 * Crash safety:
 *   - The JSONL file is RENAMED to processed/<timestamp>-dispatch-events.jsonl
 *     BEFORE inserts, so concurrent hook fires append to a fresh file.
 *   - Each line is parsed and inserted within an individual try/catch -
 *     a single corrupt line cannot poison the whole batch.
 *   - On total failure, the renamed file remains in processed/ for
 *     forensic review and manual replay.
 *   - On success, the renamed file is left in processed/ for 7 days
 *     before cleanup (retention as a safety net for downstream debugging).
 *
 * Idempotency:
 *   - For fork_spawn events: the dispatch_event_fork_id_unique partial index
 *     (migration 109_dispatch_event_dedup.sql) enforces one row per fork_id.
 *     INSERT ON CONFLICT DO NOTHING discards re-processed rows silently.
 *     Non-fork_spawn events without a unique discriminator are still additive
 *     on replay, but the rename-before-insert pattern prevents re-reading
 *     under normal operation. Critique 01 (phase-G-audit-2026-05-12) fixed
 *     the fork_spawn duplication that inflated Layer 4 metrics 2.76x.
 *
 * Invocation:
 *   - PM2-managed standalone: `node src/services/telemetry/dispatchEventConsumer.js --once`
 *     for one-shot CLI use, or with no flag to enter the periodic loop.
 *   - In-process via the scheduler: `mcp__scheduler__schedule_cron` task
 *     "decision-quality-consumer" runs `every 15m` and calls the same
 *     entry point in --once mode.
 *
 * Exits:
 *   - 0 on clean run (or empty queue)
 *   - 1 on unrecoverable error (e.g. cannot rename file, cannot connect to
 *     Postgres)
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Client } = require('pg')

// Lazy require to avoid hard env-load during module import for tests.
let _env = null
function getEnv() {
  if (_env) return _env
  _env = require('../../config/env')
  return _env
}

const TELEMETRY_DIR = process.env.ECODIAOS_TELEMETRY_DIR || '/home/tate/ecodiaos/logs/telemetry'
const TELEMETRY_FILE = process.env.ECODIAOS_TELEMETRY_FILE || path.join(TELEMETRY_DIR, 'dispatch-events.jsonl')
const APPLICATION_EVENT_FILE = process.env.ECODIAOS_APPLICATION_EVENT_FILE || path.join(TELEMETRY_DIR, 'application-events.jsonl')
const PROCESSED_DIR = path.join(TELEMETRY_DIR, 'processed')
const RETENTION_DAYS = 7
const TICK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Classify a brief excerpt as synthetic/test or real conductor decision.
 *
 * Returns 'synthetic_pass' when the brief matches known health-check or
 * smoke-test patterns. Returns null for real conductor decisions (the
 * action_subtype column remains NULL in the DB row, which is the "real
 * decision" sentinel).
 *
 * Pattern rationale:
 *   - SMOKE TEST:  explicit CI/integration smoke-test brief prefix
 *   - ^PONG$:      health-check reply to a PING dispatch — exact match only
 *                  to avoid false-positives on words like "pinging", "PONG response"
 *   - healthcheck: any brief containing this substring (cron health-check forks)
 *   - ^ping$:      exact "ping" dispatch — exact match only to avoid
 *                  false-positives on "dispatching", "pinging", etc.
 *
 * Origin: Phase G critique-04, fork_mp3opd2q_d44cc8, 13 May 2026.
 * Migration: 114_dispatch_event_action_subtype.sql.
 */
function classifySyntheticBrief(ctx) {
  const brief = (ctx && typeof ctx.brief_excerpt === 'string') ? ctx.brief_excerpt : ''
  if (!brief) return null
  if (/SMOKE TEST/i.test(brief)) return 'synthetic_pass'
  if (/^PONG$/i.test(brief.trim())) return 'synthetic_pass'
  if (/healthcheck/i.test(brief)) return 'synthetic_pass'
  if (/^ping$/i.test(brief.trim())) return 'synthetic_pass'
  return null
}

/**
 * Translate a hook name to an action_type value for dispatch_event.
 * Maps the hook firing surface to the upstream tool action shape.
 */
function actionTypeForHook(hookName, toolName) {
  if (toolName === 'mcp__forks__spawn_fork') return 'fork_spawn'
  if (toolName === 'mcp__factory__start_cc_session') return 'factory_dispatch'
  if (toolName === 'cron_fork_spawn') return 'cron_fork_spawn'
  if (toolName === 'mcp__supabase__db_execute') return 'tool_call:db_execute'
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return `tool_call:${toolName.toLowerCase()}`
  }
  if (toolName) return `tool_call:${toolName}`
  return `hook:${hookName}`
}

/**
 * Pull context_keywords from a JSONL line's context object. The hook layer
 * captures brief_excerpt / sql_excerpt / file_path; we extract a small set of
 * keywords for downstream querying.
 */
function extractContextKeywords(ctx) {
  if (!ctx || typeof ctx !== 'object') return []
  const text = [
    ctx.brief_excerpt || '',
    ctx.sql_excerpt || '',
    ctx.file_path || '',
    ctx.tool || '',
  ].join(' ').toLowerCase()
  // Pull dash-or-snake or alphanumeric tokens of length >=4.
  const tokens = text.match(/\b[a-z][a-z0-9_-]{3,40}\b/g) || []
  // Deduplicate and cap.
  return [...new Set(tokens)].slice(0, 30)
}

/**
 * Synthesise an actor for the dispatch_event row. The hook layer doesn't
 * carry actor context, so we use the tool name as a coarse proxy:
 *   - 'main' for primary tool calls
 *   - 'fork' for spawn_fork-emitted events (the fork surface itself)
 *   - 'cron' if the JSONL line carries an explicit actor field (future)
 *
 * The Phase D classifier later refines this based on cross-referencing
 * with the forks table, scheduler_runs, etc.
 */
function deriveActor(line) {
  if (line.actor) return line.actor
  // Best-effort heuristic: spawn_fork dispatches come from main; everything
  // else might be main or a fork. Without tracking the originating session
  // we default to 'main'. Phase D will improve this.
  return 'main'
}

async function consumeFile(filePath, client) {
  const stats = await fs.promises.stat(filePath).catch(() => null)
  if (!stats) {
    return { processed: 0, dispatchInserts: 0, surfaceInserts: 0, lineErrors: 0 }
  }

  const content = await fs.promises.readFile(filePath, 'utf8')
  const lines = content.split('\n').filter(l => l.trim().length > 0)

  let dispatchInserts = 0
  let surfaceInserts = 0
  let lineErrors = 0

  for (const raw of lines) {
    try {
      const line = JSON.parse(raw)
      const ts = line.ts || new Date().toISOString()
      const hookName = line.hook_name || 'unknown'
      const toolName = line.tool_name || null
      const ctx = line.context || {}
      const surfaces = Array.isArray(line.surfaces) ? line.surfaces : []

      const actor = deriveActor(line)
      const actionType = actionTypeForHook(hookName, toolName)
      const keywords = extractContextKeywords(ctx)

      // Layer-D outcome inference (failureClassifier.js, outcomeInference.js)
      // dispatches on metadata.kind. The hook layer now ships kind explicitly
      // at the top level of the JSONL line; fall back to "unknown" sentinel
      // when missing so producer-side regression is queryable rather than
      // silent. Phase-G Critique #5 closure (9 May 2026): without kind plumbed
      // through, the classifier compensated with a fork_id-presence heuristic
      // that worked for fork rows but broke for cron-fire and hook-only
      // dispatches. Plumbed at producer (emit-telemetry.sh + 7 hook callers).
      const kind = (typeof line.kind === 'string' && line.kind.trim().length > 0)
        ? line.kind.trim()
        : 'unknown'

      // For fork_spawn rows, enrich metadata with fork_id by ts-proximity match
      // against os_forks. The PreToolUse hook fires BEFORE the fork is created,
      // so the JSONL line cannot carry fork_id at hot-path write-time. The
      // os_forks row is INSERTed by forkService a few seconds after the hook
      // fires (typical delta ~5s), so by the time the consumer drains the
      // JSONL (every 15 min), the os_forks row is durable and unambiguous.
      // The window allows 5s before the dispatch ts (clock skew) and 60s
      // after (slow spawn). Closest match wins to disambiguate concurrent
      // spawns. Origin: phase-G-audit-2026-05-04 critique #1 - 660/660
      // fork_spawn dispatch_events over 7d had no fork_id, breaking the
      // join key for outcome inference (~/ecodiaos/src/services/telemetry/
      // outcomeInference.js inferForkSpawnOutcome).
      let metadata = { ...ctx, kind }
      if (actionType === 'fork_spawn') {
        try {
          const forkLookup = await client.query(
            `SELECT fork_id FROM os_forks
             WHERE started_at >= $1::timestamptz - INTERVAL '5 seconds'
               AND started_at <= $1::timestamptz + INTERVAL '60 seconds'
             ORDER BY ABS(EXTRACT(EPOCH FROM (started_at - $1::timestamptz)))
             LIMIT 1`,
            [ts]
          )
          if (forkLookup.rows.length > 0 && forkLookup.rows[0].fork_id) {
            metadata = { ...metadata, fork_id: forkLookup.rows[0].fork_id }
          }
        } catch (err) {
          // Lookup failure is non-fatal: fall through to NULL fork_id metadata.
          // The row still gets inserted; outcome inference will fall to the
          // unverified branch for this dispatch (acceptable degradation).
          console.error('[consumer] fork_id proximity lookup failed:', err.message)
        }
      }

      // Insert dispatch_event row.
      // ON CONFLICT DO NOTHING: the dispatch_event_fork_id_unique partial index
      // (action_type='fork_spawn', metadata->>'fork_id' IS NOT NULL) blocks
      // duplicate rows when the consumer replays a processed JSONL file or when
      // the backfill pipeline re-ingests the same batch. If the INSERT conflicts,
      // the row already exists - skip this event and its surfaces entirely.
      // Migration: 109_dispatch_event_dedup.sql.
      // Origin: Critique 01 (phase-G-audit-2026-05-12), fork_mp354iyq_3aef74.

      // Classify brief at insert time: 'synthetic_pass' for SMOKE TEST / PONG /
      // healthcheck / ping patterns; NULL for real conductor decisions.
      // Migration: 114_dispatch_event_action_subtype.sql.
      // Origin: Phase G critique-04, fork_mp3opd2q_d44cc8, 13 May 2026.
      const actionSubtype = classifySyntheticBrief(ctx)

      const dispatchResult = await client.query(
        `INSERT INTO dispatch_event (ts, actor, action_type, tool_name, context_keywords, metadata, action_subtype)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [ts, actor, actionType, toolName, keywords, metadata, actionSubtype]
      )
      if (dispatchResult.rows.length === 0) {
        // Duplicate blocked by unique constraint - skip this event and surfaces.
        continue
      }
      const dispatchId = dispatchResult.rows[0].id
      dispatchInserts += 1

      // Insert one surface_event row per surface entry.
      for (const s of surfaces) {
        if (!s || !s.pattern_path) continue
        try {
          await client.query(
            `INSERT INTO surface_event (dispatch_event_id, ts, source_layer, pattern_path, trigger_keyword, priority, canonical, was_false_positive)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              dispatchId,
              ts,
              s.source_layer || `hook:${hookName}`,
              s.pattern_path,
              s.trigger_keyword || null,
              s.priority || null,
              typeof s.canonical === 'boolean' ? s.canonical : null,
              null, // was_false_positive backfilled by Phase D
            ]
          )
          surfaceInserts += 1
        } catch (err) {
          lineErrors += 1
          // Continue with remaining surfaces - one bad row should not poison
          // the rest of the line.
          console.error('[consumer] surface_event insert failed:', err.message)
        }
      }
    } catch (err) {
      lineErrors += 1
      console.error('[consumer] failed to parse/insert JSONL line:', err.message, 'raw:', raw.slice(0, 200))
    }
  }

  return { processed: lines.length, dispatchInserts, surfaceInserts, lineErrors }
}

/**
 * Classify whether an [APPLIED] / [NOT-APPLIED] explanation reads as a
 * false-positive trip of the keyword-scanner hook (e.g. cred-mention-surface
 * matched on "apple" but the brief touches no Apple/iOS surfaces).
 *
 * Returns:
 *   true   - explanation contains a clear false-positive signal
 *   null   - no FP signal detected (default; we deliberately do not set FALSE
 *            because absence of FP language does not imply the surface was
 *            relevant — it just means the conductor did not name it as FP)
 *
 * Conservative bias: prefer FALSE NEGATIVE (return null) over FALSE POSITIVE
 * (return true). Wrongly-set-true rows would corrupt the Phase D tuning
 * signal by hiding genuine silent-majority drift behind FP exclusions.
 *
 * Higher-confidence path: when applied === false (an explicit [NOT-APPLIED])
 * AND the explanation is short (<200 chars) AND matches the FP lexicon,
 * we have stronger evidence the conductor was rejecting an irrelevant
 * surface rather than ignoring relevant doctrine.
 *
 * Wired by Gap 2 of the Phase C tag-feedback loop (fork_mowv43mg_2a9414,
 * 8 May 2026). See ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 * Layer 3.
 */
function classifyApplicationEventFalsePositive({ reason, applied }) {
  if (!reason || typeof reason !== 'string') return null
  const text = reason.toLowerCase()

  // FP lexicon, ordered by specificity (most specific first).
  // Match patterns are deliberately literal substrings so the classifier is
  // grep-readable and easy to extend. Regex would add complexity without
  // catching meaningfully more cases.
  const fpPhrases = [
    'false positive',
    'false-positive',
    'false-match',
    'false match',
    'keyword scanner',
    'keyword scan',
    'regex matched',
    'regex match',
    'scanner mismatch',
    'irrelevant',
    'unrelated',
    'not applicable',
    'matched on ',
  ]
  for (const phrase of fpPhrases) {
    if (text.includes(phrase)) return true
  }

  // "fork ships" is FP-shaped only when paired with explicit [NOT-APPLIED].
  // When applied=true, "this fork ships X, not symbolic" is the conductor
  // justifying WHY the pattern applies (correct usage of the no-symbolic
  // pattern), not declaring an FP. Conservative: require applied=false to
  // count as FP signal.
  if (applied === false && text.includes('fork ships')) return true

  // "no <X> surfaces" / "no <X> calls" / "no <X> touched" pattern. Captures
  // "no Apple/iOS surfaces", "no Corazon laptop-agent calls", "no iOS keys
  // touched", "no <client> data" etc. These are the dominant false-positive
  // shape when cred-mention-surface trips on a single keyword unrelated to
  // the actual brief scope.
  //
  // Allow up to 4 intervening tokens between `no` and the trailing keyword
  // so multi-word descriptors ("no Corazon laptop-agent calls", "no Apple
  // Developer portal access") still match.
  if (/\bno (?:[a-z0-9/_-]+(?:[ /-][a-z0-9/_-]+){0,4})\s+(surfaces|calls|touched|invoked|involved|access|interaction|present|used|in scope)\b/i.test(reason)) {
    return true
  }

  // "VPS only" / "server-side only" / "runs on VPS" - signals the fork's
  // work is decoupled from the surfaced credential/laptop-agent/client domain.
  if (/\b(vps[ -]only|server[ -]side only|runs on vps|on the vps)\b/i.test(reason)) {
    // Higher confidence when paired with explicit [NOT-APPLIED].
    if (applied === false) return true
    // Standalone "VPS only" without the [NOT-APPLIED] context could appear
    // in [APPLIED] explanations too; treat as FP only when paired with FALSE.
    return null
  }

  return null
}

/**
 * Drain application-events.jsonl into application_event Postgres rows.
 *
 * Each JSONL line carries:
 *   { ts, matched_dispatch_ts, tool_name, pattern_path, trigger_keyword,
 *     source_layer, applied (true|false|null), tagged_silent, reason, hook_name }
 *
 * The dispatch_event_id is resolved by looking up dispatch_event WHERE
 * ts = matched_dispatch_ts::timestamptz AND tool_name matches. If no exact
 * match found, fall back to nearest within +/- 5 minutes for the same tool.
 * If still no match, the line is skipped (orphan) and counted as lineErrors.
 *
 * was_false_positive is classified at write-time from the explanation text
 * via classifyApplicationEventFalsePositive(). NULL when no FP signal,
 * TRUE when the explanation contains FP lexicon. The Phase D classifier
 * (failureClassifier.js) excludes was_false_positive=true rows from the
 * silent-rate / pattern_silent_majority drift detection so genuine silent
 * majorities are not masked by keyword-scanner FP noise.
 *
 * Layer 4 of the Decision Quality Self-Optimization Architecture, second-half
 * (the dispatch-event drainage is the first-half). See Phase C ship spec on
 * status_board row 4c9d8b96.
 */
async function consumeApplicationEventFile(filePath, client) {
  const stats = await fs.promises.stat(filePath).catch(() => null)
  if (!stats) {
    return { processed: 0, applicationInserts: 0, orphanSkips: 0, lineErrors: 0 }
  }

  const content = await fs.promises.readFile(filePath, 'utf8')
  const lines = content.split('\n').filter(l => l.trim().length > 0)

  let applicationInserts = 0
  let orphanSkips = 0
  let lineErrors = 0

  for (const raw of lines) {
    try {
      const line = JSON.parse(raw)
      const ts = line.ts || new Date().toISOString()
      const matchedDispatchTs = line.matched_dispatch_ts || null
      const toolName = line.tool_name || null
      const patternPath = line.pattern_path || null
      const reason = line.reason || ''
      const inferredFrom = line.hook_name || 'post-action-applied-tag-check'
      const applied = (line.applied === true || line.applied === false) ? line.applied : null
      const taggedSilent = line.tagged_silent === true

      if (!patternPath || !matchedDispatchTs || !toolName) {
        lineErrors += 1
        console.error('[consumer] application-event line missing required fields:', raw.slice(0, 200))
        continue
      }

      // Resolve dispatch_event_id. Exact ts+tool match first, then fuzzy +/-5min.
      let dispatchId = null
      const exact = await client.query(
        `SELECT id FROM dispatch_event
         WHERE ts = $1::timestamptz AND tool_name = $2
         ORDER BY id LIMIT 1`,
        [matchedDispatchTs, toolName]
      )
      if (exact.rows.length > 0) {
        dispatchId = exact.rows[0].id
      } else {
        const fuzzy = await client.query(
          `SELECT id FROM dispatch_event
           WHERE tool_name = $2
             AND ts BETWEEN ($1::timestamptz - INTERVAL '5 minutes')
                       AND ($1::timestamptz + INTERVAL '5 minutes')
           ORDER BY ABS(EXTRACT(EPOCH FROM (ts - $1::timestamptz)))
           LIMIT 1`,
          [matchedDispatchTs, toolName]
        )
        if (fuzzy.rows.length > 0) {
          dispatchId = fuzzy.rows[0].id
        }
      }

      if (!dispatchId) {
        // Orphan: dispatch_event for this hook fire was never ingested. Skip.
        orphanSkips += 1
        continue
      }

      // was_false_positive resolution priority (Phase C Gap 2, 8 May 2026):
      //   1. Explicit JSONL field set to true by post-action-applied-tag-check.sh
      //      when conductor used [FALSE-POSITIVE] tag. Honour without further
      //      classification - the conductor named the surface as FP explicitly.
      //   2. Lexicon classification over the [NOT-APPLIED] / [APPLIED] reason
      //      text, conservatively returning TRUE only on FP-shaped phrasing.
      //   3. NULL otherwise (we deliberately do NOT store FALSE because absence
      //      of FP language does not mean the surface was relevant; the Phase D
      //      classifier reads NULL as "unclassified, count toward silent set if
      //      otherwise silent" while TRUE excludes the row from the silent set).
      let wasFalsePositive = null
      if (line.was_false_positive === true) {
        wasFalsePositive = true
      } else {
        wasFalsePositive = classifyApplicationEventFalsePositive({ reason, applied })
      }

      try {
        await client.query(
          `INSERT INTO application_event (dispatch_event_id, ts, pattern_path, reason, inferred_from, applied, tagged_silent, was_false_positive)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [dispatchId, ts, patternPath, reason, inferredFrom, applied, taggedSilent, wasFalsePositive]
        )
        applicationInserts += 1
      } catch (err) {
        lineErrors += 1
        console.error('[consumer] application_event insert failed:', err.message)
      }
    } catch (err) {
      lineErrors += 1
      console.error('[consumer] failed to parse application-event JSONL line:', err.message, 'raw:', raw.slice(0, 200))
    }
  }

  return { processed: lines.length, applicationInserts, orphanSkips, lineErrors }
}

async function pruneOldProcessedFiles() {
  try {
    const entries = await fs.promises.readdir(PROCESSED_DIR).catch(() => [])
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const e of entries) {
      const p = path.join(PROCESSED_DIR, e)
      try {
        const st = await fs.promises.stat(p)
        if (st.mtimeMs < cutoffMs) {
          await fs.promises.unlink(p)
        }
      } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }
}

async function rotateAndConsume() {
  // Ensure processed dir exists.
  await fs.promises.mkdir(PROCESSED_DIR, { recursive: true })

  // Check whether the source file exists. If not, exit early.
  const srcStat = await fs.promises.stat(TELEMETRY_FILE).catch(() => null)
  if (!srcStat) {
    return { ok: true, processed: 0, dispatchInserts: 0, surfaceInserts: 0, lineErrors: 0, note: 'no source file' }
  }
  if (srcStat.size === 0) {
    return { ok: true, processed: 0, dispatchInserts: 0, surfaceInserts: 0, lineErrors: 0, note: 'source file empty' }
  }

  // Rename source -> processed/<timestamp>-dispatch-events.jsonl atomically.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const processedPath = path.join(PROCESSED_DIR, `${stamp}-dispatch-events.jsonl`)
  await fs.promises.rename(TELEMETRY_FILE, processedPath)

  // Connect to Postgres.
  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  try {
    await client.connect()
  } catch (err) {
    console.error('[consumer] cannot connect to Postgres:', err.message)
    // Restore the file by renaming it back so the next run can retry.
    try { await fs.promises.rename(processedPath, TELEMETRY_FILE) } catch { /* ignore */ }
    throw err
  }

  let result
  try {
    result = await consumeFile(processedPath, client)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  // Best-effort cleanup of old processed files.
  await pruneOldProcessedFiles()

  return { ok: true, ...result, processedPath }
}

/**
 * Rotate and drain application-events.jsonl. Same atomic-rename safety as the
 * dispatch-events drain. Looks up dispatch_event_id at insert time. Must run
 * AFTER rotateAndConsume() in the same tick so that dispatch_event rows for
 * this tick are already in DB.
 */
async function rotateAndConsumeApplicationEvents() {
  await fs.promises.mkdir(PROCESSED_DIR, { recursive: true })

  const srcStat = await fs.promises.stat(APPLICATION_EVENT_FILE).catch(() => null)
  if (!srcStat) {
    return { ok: true, processed: 0, applicationInserts: 0, orphanSkips: 0, lineErrors: 0, note: 'no source file' }
  }
  if (srcStat.size === 0) {
    return { ok: true, processed: 0, applicationInserts: 0, orphanSkips: 0, lineErrors: 0, note: 'source file empty' }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const processedPath = path.join(PROCESSED_DIR, `${stamp}-application-events.jsonl`)
  await fs.promises.rename(APPLICATION_EVENT_FILE, processedPath)

  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  try {
    await client.connect()
  } catch (err) {
    console.error('[consumer] cannot connect to Postgres for application events:', err.message)
    try { await fs.promises.rename(processedPath, APPLICATION_EVENT_FILE) } catch { /* ignore */ }
    throw err
  }

  let result
  try {
    result = await consumeApplicationEventFile(processedPath, client)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  return { ok: true, ...result, processedPath }
}

async function runOnce() {
  try {
    const dispatchResult = await rotateAndConsume()
    console.log('[consumer] tick complete:', JSON.stringify(dispatchResult))
    let applicationResult
    try {
      applicationResult = await rotateAndConsumeApplicationEvents()
      console.log('[consumer] application tick complete:', JSON.stringify(applicationResult))
    } catch (err) {
      console.error('[consumer] application tick failed:', err.message)
      applicationResult = { ok: false, error: err.message }
    }
    return { ok: dispatchResult.ok !== false, dispatch: dispatchResult, application: applicationResult }
  } catch (err) {
    console.error('[consumer] tick failed:', err.message)
    return { ok: false, error: err.message }
  }
}

async function runLoop() {
  console.log(`[consumer] starting periodic loop, interval=${TICK_INTERVAL_MS / 1000}s, file=${TELEMETRY_FILE}`)
  // First tick immediately, then on interval.
  await runOnce()
  setInterval(runOnce, TICK_INTERVAL_MS).unref()
  // Keep process alive.
  setInterval(() => {}, 60_000).unref()
}

if (require.main === module) {
  const onceMode = process.argv.includes('--once')
  if (onceMode) {
    runOnce()
      .then(result => process.exit(result && result.ok ? 0 : 1))
      .catch(err => { console.error(err); process.exit(1) })
  } else {
    runLoop().catch(err => { console.error(err); process.exit(1) })
  }
}

module.exports = {
  rotateAndConsume,
  rotateAndConsumeApplicationEvents,
  runOnce,
  consumeFile,
  consumeApplicationEventFile,
  actionTypeForHook,
  extractContextKeywords,
  classifyApplicationEventFalsePositive,
  classifySyntheticBrief,
}

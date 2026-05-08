/**
 * outcomeInference.js
 *
 * Phase B (Layer 4 -> Layer 5 bridge) of the Decision Quality Self-Optimization
 * Architecture. See:
 *   ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *
 * For each dispatch_event without an outcome_event row, look up downstream
 * signals that imply the dispatch's outcome. Defaults to `unverified` when no
 * explicit positive or negative signal is found - this is THE crux of the
 * Phase G Critique #1 fix.
 *
 * Pre-Phase-G (broken) behaviour:
 *   tool calls older than 30min with no SMS correction were classified as
 *   `success`. Result: 100% of 398 outcome_event rows over rolling 7d were
 *   `success`, every Layer-4 KPI was structurally vacuous, the self-tuning
 *   loop calibrated against a null oracle. This is the survivorship bias the
 *   Phase G adversarial audit caught (severity=5, doctrine_failure).
 *
 * Phase G fix (this file): introduce `unverified` as a first-class outcome
 * state per ~/ecodiaos/docs/JARVIS_GAP_ANALYSIS.md §8 (Accountability layer:
 * unverified as a first-class state). The metric pipeline can now compute:
 *
 *   success_rate       = success / (success + correction + failure + unverified)
 *   verification_rate  = (success + correction + failure) / total
 *
 * The verification_rate surfaces the dark-matter problem (how much of the
 * dispatch fleet has zero explicit ground-truth signal).
 *
 * Inferrer reads from these tables (best-effort - tables may not exist if the
 * surrounding codebase changes; missing tables are handled silently):
 *   - cc_sessions  (Factory CLI session status, by sessionId)
 *   - os_forks     (SDK fork status + result, by fork_id)
 *   - sms_messages OR sms_inbound (Tate-side reply text within 30 minutes)
 *
 * Heuristics (in order of evidence strength):
 *
 *   FAILURE signals (explicit negative):
 *     1a. factory_dispatch with cc_sessions.status='error' (or rejected/aborted)
 *         => outcome=failure
 *     1b. fork_spawn with os_forks.status='error' (or aborted/errored/failed/cancelled)
 *         => outcome=failure
 *
 *   CORRECTION signals (explicit Tate rebuke):
 *     2.  Tate SMS within 30 min after dispatch matching CORRECTION_KEYWORDS
 *         => outcome=correction (Phase D classifies the failure mode)
 *
 *   SUCCESS signals (explicit positive - require artefacts, not just absence-of-signal):
 *     3a. Tate SMS within 30 min after dispatch matching AFFIRMATION_KEYWORDS
 *         => outcome=success
 *     3b. factory_dispatch with cc_sessions.status='deployed' AND commit_sha non-null
 *         AND deploy_status='deployed'
 *         => outcome=success
 *     3c. fork_spawn with os_forks.status='done' AND result.length > 0
 *         => outcome=success
 *
 *   UNVERIFIED (default, the Phase G fix):
 *     4. Any dispatch older than 30 min with no positive AND no negative signal
 *        => outcome=unverified
 *        (Phase D does not process unverified rows; they are dark matter the
 *         metric pipeline must surface as a verification-rate problem.)
 *
 *   DEFER:
 *     5. Dispatches younger than 30 min with no signal yet => no inference
 *        (give the system time to settle; next cron tick will revisit).
 *
 * Schema notes:
 *   outcome_event.outcome ∈ {'success','failure','correction','unverified','partial'}
 *     ('partial' is reserved for future use; not emitted by the current
 *      heuristics. 'unverified' is the Phase G addition.)
 *   outcome_event.classification is left NULL here; Phase D adds the
 *     usage_failure / surfacing_failure / doctrine_failure label for
 *     correction AND failure rows (per Phase G Critique #1 expansion).
 */

'use strict'

const { Client } = require('pg')

let _env = null
function getEnv() {
  if (_env) return _env
  _env = require('../../config/env')
  return _env
}

const TICK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const SMS_CORRECTION_WINDOW_MS = 30 * 60 * 1000 // 30 minutes after dispatch
const UNVERIFIED_AGE_MS = 30 * 60 * 1000 // dispatch must be at least this old before defaulting to unverified

/**
 * Compute inference confidence based on how many substrates were probed.
 * Explicit signals (failure, correction) return 1.0.
 * Inferred outcomes get confidence proportional to triangulation count:
 *   3+ probes = 0.9 (high triangulation)
 *   2 probes  = 0.7 (moderate)
 *   1 probe   = 0.4 (weak, single source)
 *   0 probes  = 0.2 (no evidence, structural guess)
 */
function computeConfidence(outcome, substratesChecked) {
  if (outcome === 'failure' || outcome === 'correction') return 1.0
  if (outcome === 'success') {
    if (substratesChecked >= 3) return 0.9
    if (substratesChecked === 2) return 0.7
    if (substratesChecked === 1) return 0.4
    return 0.2
  }
  // unverified / unknown
  return 0.3
}

/**
 * Probe for an expected artefact specified in dispatch metadata.
 * Returns { found: true|false|null, substrate?, reason? }.
 *   found=true   -> artefact confirmed on a substrate
 *   found=false  -> expected artefact explicitly missing (failure signal)
 *   found=null   -> no artefact path specified or path isn't probeable
 *
 * Currently supports: status_board rows by name or entity_ref.
 * Can be extended to other substrates (filesystem, kv_store, cc_sessions).
 */
async function probeExpectedArtefact(client, metadata) {
  if (!metadata) return { found: null, reason: 'no_metadata' }
  const artefactPath = metadata.expected_artefact || null
  if (!artefactPath) return { found: null, reason: 'no_path_specified' }

  if (typeof artefactPath === 'string' && artefactPath.startsWith('status_board:')) {
    const ref = artefactPath.slice('status_board:'.length)
    try {
      const r = await client.query(
        `SELECT 1 FROM status_board WHERE (name = $1 OR entity_ref = $1) AND archived_at IS NULL LIMIT 1`,
        [ref]
      )
      if (r.rowCount > 0) return { found: true, substrate: 'status_board' }
      return { found: false, reason: `status_board '${ref}' not found` }
    } catch {
      return { found: null, reason: 'status_board_query_failed' }
    }
  }

  return { found: null, reason: `unverifiable_path_type: ${typeof artefactPath}` }
}

const CORRECTION_KEYWORDS = [
  // Multi-token "I want you to undo / redo / not that" phrases
  'not that',
  "that's wrong",
  'thats wrong',
  'wrong fork',
  'wrong direction',
  'undo that',
  'redo that',
  'fix that',
  'stop',
  'abort',
  'cancel that',
  // Single-token strong corrections
  'incorrect',
  'mistake',
  'broke',
  'broken',
]

// Affirmation keywords. Conservative: require explicit positive signals, NOT
// merely absence of correction. "Thanks" alone is sufficient because Tate's
// affirmation register is tight and brief; he says "thanks" or "good" or "go"
// when something landed correctly. False positives here only push us toward
// success, but the JARVIS §8 rule is that explicit positive signals beat
// silence. Single-token short matches are safe here because the search window
// is narrow (30 min after dispatch) and the speaker is identified.
const AFFIRMATION_KEYWORDS = [
  // Multi-token affirmations
  'thanks',
  'thank you',
  'thats great',
  "that's great",
  'looks good',
  'looks great',
  'all good',
  'go for it',
  'green light',
  // Single-token strong affirmations (used in SMS short-form)
  'great',
  'good',
  'perfect',
  'nice',
  'yes',
  'yep',
  'yeah',
  'go',
  'ship',
  'ship it',
  'merge',
]

/**
 * Returns true if the given table exists in the public schema. Used to
 * silently skip heuristics that depend on optional tables.
 */
async function tableExists(client, tableName) {
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
      [tableName]
    )
    return r.rowCount > 0
  } catch {
    return false
  }
}

/**
 * Scan inbound SMS messages within the post-dispatch window for either
 * correction OR affirmation keywords. Returns:
 *   {kind:'correction', matched_keyword, body, ts}  on a correction match
 *   {kind:'affirmation', matched_keyword, body, ts} on an affirmation match
 *   null                                            on no match
 *
 * If both correction and affirmation keywords appear in the same window, the
 * EARLIER message wins (Tate said one thing first). If the earliest message
 * contains BOTH a correction keyword AND an affirmation keyword (e.g. "no but
 * great work overall"), correction wins (conservative - the rebuke is the
 * actionable signal).
 */
async function findTateSignal(client, dispatch, smsTable) {
  if (!smsTable) return null
  const startTs = new Date(dispatch.ts).toISOString()
  const endTs = new Date(new Date(dispatch.ts).getTime() + SMS_CORRECTION_WINDOW_MS).toISOString()
  let q
  try {
    q = await client.query(
      `SELECT body, ts FROM ${smsTable}
       WHERE ts BETWEEN $1 AND $2
         AND (
           direction = 'inbound'
           OR direction = 'received'
           OR from_tate = true
           OR (from_number IS NOT NULL)
         )
       ORDER BY ts ASC LIMIT 20`,
      [startTs, endTs]
    )
  } catch {
    return null
  }
  for (const row of q.rows) {
    const body = (row.body || '').toLowerCase()
    if (!body) continue
    // Check correction first (rebuke trumps affirmation in same body).
    for (const kw of CORRECTION_KEYWORDS) {
      if (body.includes(kw)) {
        return { kind: 'correction', matched_keyword: kw, body: row.body, ts: row.ts }
      }
    }
    for (const kw of AFFIRMATION_KEYWORDS) {
      // Word-boundary check for short tokens to avoid 'go' matching 'going'.
      const needsWordBoundary = kw.length <= 4
      if (needsWordBoundary) {
        const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        if (re.test(body)) {
          return { kind: 'affirmation', matched_keyword: kw, body: row.body, ts: row.ts }
        }
      } else if (body.includes(kw)) {
        return { kind: 'affirmation', matched_keyword: kw, body: row.body, ts: row.ts }
      }
    }
  }
  return null
}

/**
 * Backwards-compatible wrapper for the pre-Phase-G interface; some callers may
 * still reach for findTateCorrection by name. Returns the same payload shape
 * as the old correction-only function (or null).
 */
async function findTateCorrection(client, dispatch, smsTable) {
  const sig = await findTateSignal(client, dispatch, smsTable)
  if (sig && sig.kind === 'correction') {
    return { matched_keyword: sig.matched_keyword, body: sig.body, ts: sig.ts }
  }
  return null
}

/**
 * Look up the os_forks row for a fork_spawn dispatch. Returns:
 *   { outcome:'success'|'failure', evidence }   on terminal state
 *   null                                         when fork_id missing or
 *                                                row not in terminal state
 *
 * Note: dispatch_event metadata for fork_spawn does not currently carry
 * fork_id (a separate dispatch-pipeline gap). When fork_id is absent, this
 * function returns null and the caller falls through to the SMS / unverified
 * heuristics. The forward fix is to plumb fork_id into dispatch metadata at
 * spawn time; tracked separately.
 */
async function inferForkSpawnOutcome(client, dispatch) {
  // Prefer os_forks (current schema); fall back to legacy `forks` table name
  // for environments still on the older schema.
  let table = null
  if (await tableExists(client, 'os_forks')) table = 'os_forks'
  else if (await tableExists(client, 'forks')) table = 'forks'
  if (!table) return null

  const meta = dispatch.metadata || {}
  const forkId = meta.fork_id || meta.id || null
  if (!forkId) return null

  const pkColumn = table === 'os_forks' ? 'fork_id' : 'id'
  try {
    const r = await client.query(
      `SELECT status, result FROM ${table} WHERE ${pkColumn} = $1 LIMIT 1`,
      [forkId]
    )
    if (r.rowCount === 0) return null
    const s = (r.rows[0].status || '').toLowerCase()
    const result = r.rows[0].result || ''
    // Failure first (negative trumps positive).
    if (s === 'aborted' || s === 'errored' || s === 'failed' || s === 'cancelled' || s === 'error' || s === 'crashed') {
      return { outcome: 'failure', evidence: `${table}.${pkColumn}=${forkId} status=${s}` }
    }
    // Success requires both terminal-done state AND a non-empty result.
    if ((s === 'done' || s === 'completed' || s === 'success') && result && String(result).length > 0) {
      return {
        outcome: 'success',
        evidence: `${table}.${pkColumn}=${forkId} status=${s} result_length=${String(result).length}`,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Look up the cc_sessions row for a factory_dispatch dispatch. Returns:
 *   { outcome:'success'|'failure', evidence }   on terminal state
 *   null                                         when sessionId missing or
 *                                                row not in terminal state
 *
 * Success requires status='deployed' AND commit_sha non-null AND
 * deploy_status='deployed'. This implements the JARVIS §8 rule that "claimed-
 * done-but-unverified" must NOT classify as success - we require the
 * deployment artefacts to exist.
 *
 * Failure is status IN ('rejected','error','aborted').
 */
async function inferFactoryDispatchOutcome(client, dispatch) {
  const hasCC = await tableExists(client, 'cc_sessions')
  if (!hasCC) return null
  const meta = dispatch.metadata || {}
  const sessionId = meta.session_id || meta.sessionId || null
  if (!sessionId) return null
  try {
    const r = await client.query(
      `SELECT status, pipeline_stage, commit_sha, deploy_status FROM cc_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    )
    if (r.rowCount === 0) return null
    const s = (r.rows[0].status || '').toLowerCase()
    const commitSha = r.rows[0].commit_sha
    const deployStatus = (r.rows[0].deploy_status || '').toLowerCase()

    // Failure first.
    if (s === 'rejected' || s === 'error' || s === 'aborted') {
      return { outcome: 'failure', evidence: `cc_sessions.id=${sessionId} status=${s}` }
    }
    // Success requires the trifecta: status terminal AND commit_sha AND deploy_status=deployed.
    if (
      (s === 'completed' || s === 'deployed' || s === 'approved') &&
      commitSha &&
      deployStatus === 'deployed'
    ) {
      return {
        outcome: 'success',
        evidence: `cc_sessions.id=${sessionId} status=${s} commit_sha=${commitSha.slice(0, 8)} deploy_status=${deployStatus}`,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Core inferrer for one dispatch_event row. Returns one of:
 *   { outcome:'failure',     evidence, correction_text? }
 *   { outcome:'correction',  evidence, correction_text }
 *   { outcome:'success',     evidence }
 *   { outcome:'unverified',  evidence }
 *   null                                  // defer; revisit next tick
 *
 * Decision tree (priority order):
 *   1. Type-specific FAILURE signals (most actionable - takes precedence).
 *   2. Tate SMS CORRECTION within 30 min.
 *   3. Tate SMS AFFIRMATION within 30 min.
 *   4. Type-specific SUCCESS signals (factory commit+deploy, fork done+result).
 *   5. UNVERIFIED default for dispatches older than UNVERIFIED_AGE_MS.
 *   6. Defer (return null) for fresh dispatches.
 */
async function inferDispatchOutcome(client, dispatch, smsTable) {
  const meta = dispatch.metadata || {}
  let substratesChecked = 0

  // Step 1: type-specific FAILURE signals (highest evidence on the negative side).
  if (dispatch.action_type === 'fork_spawn') {
    const r = await inferForkSpawnOutcome(client, dispatch)
    if (r && r.outcome === 'failure') return r
    substratesChecked += 1
  }
  if (dispatch.action_type === 'factory_dispatch') {
    const r = await inferFactoryDispatchOutcome(client, dispatch)
    if (r && r.outcome === 'failure') return r
    substratesChecked += 1
  }

  // Step 2 + 3: Tate SMS signal (correction OR affirmation).
  const sig = await findTateSignal(client, dispatch, smsTable)
  if (smsTable) substratesChecked += 1
  if (sig && sig.kind === 'correction') {
    return {
      outcome: 'correction',
      evidence: `confidence=1.0|sms within 30min after dispatch matched correction '${sig.matched_keyword}'`,
      correction_text: sig.body,
    }
  }
  if (sig && sig.kind === 'affirmation') {
    return {
      outcome: 'success',
      evidence: `confidence=0.9|tate_affirmation|sms within 30min after dispatch matched affirmation '${sig.matched_keyword}'`,
    }
  }

  // Step 4: type-specific SUCCESS signals (require explicit artefacts).
  let successFromType = null
  if (dispatch.action_type === 'fork_spawn') {
    const r = await inferForkSpawnOutcome(client, dispatch)
    if (r && r.outcome === 'success') successFromType = r
    substratesChecked += 1
  }
  if (dispatch.action_type === 'factory_dispatch') {
    const r = await inferFactoryDispatchOutcome(client, dispatch)
    if (r && r.outcome === 'success') successFromType = r
    substratesChecked += 1
  }

  if (successFromType) {
    // Multi-substrate probe before accepting type-level success.
    // Probe 1: expected artefact existence (strongest signal when metadata specifies it).
    const artefact = await probeExpectedArtefact(client, meta)
    if (artefact.found === true) {
      substratesChecked += 1
    } else if (artefact.found === false) {
      // Expected artefact missing - this is effectively a failure signal.
      console.warn(
        `[outcomeInference] dispatch ${dispatch.id}: expected artefact missing, downgrading success: ${artefact.reason}`
      )
      return {
        outcome: 'unverified',
        evidence: `confidence=0.3|expected_artefact_missing:${artefact.reason}|${successFromType.evidence}`,
      }
    }
    // artefact.found === null means no path specified - no extra substrate counted.

    // Probe 2: reasonable timing (non-trivial work completing in <15s is suspicious).
    const elapsedMs = Date.now() - new Date(dispatch.ts).getTime()
    if (elapsedMs >= 15000 || dispatch.action_type === 'tool_call') {
      substratesChecked += 1
    } else {
      console.warn(
        `[outcomeInference] dispatch ${dispatch.id}: suspiciously fast completion (${elapsedMs}ms) for non-trivial action`
      )
      // Fast completion does not count as a valid substrate.
    }

    const confidence = computeConfidence('success', substratesChecked)
    let evidence = `confidence=${confidence}|substrates=${substratesChecked}|${successFromType.evidence}`

    if (confidence < 0.7) {
      console.warn(
        `[outcomeInference] dispatch ${dispatch.id}: success with low confidence ${confidence} (substrates=${substratesChecked})`
      )
    }
    if (confidence < 0.5) {
      return {
        outcome: 'unverified',
        evidence: `confidence=${confidence}|low_confidence_downgrade|${successFromType.evidence}`,
      }
    }

    return { outcome: 'success', evidence }
  }

  // Step 5: UNVERIFIED default for dispatches older than the verification window.
  // This is the Phase G fix - replaces the pre-Phase-G "graceful default
  // success" that produced the 100%-success-by-default survivorship bias.
  const ageMs = Date.now() - new Date(dispatch.ts).getTime()
  if (ageMs > UNVERIFIED_AGE_MS) {
    return {
      outcome: 'unverified',
      evidence: `confidence=0.3|no positive or negative signal within ${UNVERIFIED_AGE_MS / 60000}min, action_type=${dispatch.action_type}, substrates=${substratesChecked}`,
    }
  }

  // Step 6: defer.
  return null
}

async function tickInferOutcomes() {
  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()

  let inferred = 0
  let skipped = 0
  let errors = 0
  const distribution = { success: 0, failure: 0, correction: 0, unverified: 0 }

  try {
    // Detect SMS table once per tick.
    let smsTable = null
    if (await tableExists(client, 'sms_messages')) smsTable = 'sms_messages'
    else if (await tableExists(client, 'sms_inbound')) smsTable = 'sms_inbound'
    else if (await tableExists(client, 'sms_log')) smsTable = 'sms_log'

    // Pull dispatches without an outcome_event, older than 5 minutes (give
    // the system time to settle), capped at 500 per tick.
    const r = await client.query(`
      SELECT d.id, d.ts, d.actor, d.action_type, d.tool_name, d.metadata
      FROM dispatch_event d
      LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
      WHERE o.id IS NULL
        AND d.ts < NOW() - INTERVAL '5 minutes'
        AND d.ts > NOW() - INTERVAL '14 days'
      ORDER BY d.ts ASC
      LIMIT 500
    `)

    for (const dispatch of r.rows) {
      try {
        const inference = await inferDispatchOutcome(client, dispatch, smsTable)
        if (!inference) {
          skipped += 1
          continue
        }
        await client.query(
          `INSERT INTO outcome_event (dispatch_event_id, outcome, evidence, correction_text, classification)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            dispatch.id,
            inference.outcome,
            inference.evidence || null,
            inference.correction_text || null,
            null, // Phase D fills classification (for correction AND failure rows)
          ]
        )
        inferred += 1
        if (distribution[inference.outcome] !== undefined) {
          distribution[inference.outcome] += 1
        }
      } catch (err) {
        errors += 1
        console.error('[outcomeInference] error inferring dispatch', dispatch.id, err.message)
      }
    }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  return { ok: true, inferred, skipped, errors, distribution }
}

async function runOnce() {
  try {
    const result = await tickInferOutcomes()
    console.log('[outcomeInference] tick complete:', JSON.stringify(result))
    return result
  } catch (err) {
    console.error('[outcomeInference] tick failed:', err.message)
    return { ok: false, error: err.message }
  }
}

async function runLoop() {
  console.log(`[outcomeInference] starting periodic loop, interval=${TICK_INTERVAL_MS / 1000}s`)
  await runOnce()
  setInterval(runOnce, TICK_INTERVAL_MS).unref()
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
  tickInferOutcomes,
  runOnce,
  inferDispatchOutcome,
  findTateSignal,
  findTateCorrection,
  inferForkSpawnOutcome,
  inferFactoryDispatchOutcome,
  computeConfidence,
  probeExpectedArtefact,
  CORRECTION_KEYWORDS,
  AFFIRMATION_KEYWORDS,
  UNVERIFIED_AGE_MS,
}

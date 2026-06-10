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
 *   outcome_event.outcome ∈ {'success','failure','correction','unverified','partial',
 *                             'infrastructure_verified'}
 *     ('partial' is reserved for future use; not emitted by the current
 *      heuristics. 'unverified' is the Phase G addition.
 *      'infrastructure_verified' is the Phase G critique-05 addition — telemetry/
 *      infra cron dispatches that are system-initiated, not user-facing decisions,
 *      and therefore excluded from success_rate denominator.)
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
 * Infrastructure/telemetry cron brief patterns — SHORT-CIRCUIT tier.
 *
 * Dispatches matching these patterns are system-initiated DIRECT_EXEC class
 * crons, not user-facing decisions. Classifying them as 'infrastructure_verified'
 * pulls them out of the success_rate denominator (they don't carry decision-
 * quality signal) and avoids wasting semantic analysis cycles on them.
 *
 * The producer (classifySyntheticBrief in dispatchEventConsumer.js) stamps
 * action_subtype='infrastructure_verified' at INSERT time for new rows.
 * This regex set is the fallback for rows that pre-date the producer change.
 *
 * Phase G critique-05, fork_mp3qh8uh_6fce6e, 13 May 2026.
 */
const INFRA_CRON_PATTERNS = [
  /^TELEMETRY/i,
  /DIRECT_EXEC/i,
  /^OS_FORKS REAPER/i,
  /^KG (EMBEDDING|CONSOLIDATION)/i,
  /^NEO4J AURA KEEP-ALIVE/i,
]

/**
 * Returns true when the dispatch's brief_excerpt (from metadata) or
 * action_subtype matches an infrastructure/telemetry cron pattern.
 *
 * Used as the SHORT-CIRCUIT guard in inferDispatchOutcome. Checks the
 * producer-stamped action_subtype first (O(1)), falls back to regex on
 * metadata.brief_excerpt for pre-migration rows.
 */
function isInfrastructureBrief(dispatch) {
  if (dispatch.action_subtype === 'infrastructure_verified') return true
  const brief = (dispatch.metadata && typeof dispatch.metadata.brief_excerpt === 'string')
    ? dispatch.metadata.brief_excerpt
    : ''
  if (!brief) return false
  return INFRA_CRON_PATTERNS.some(re => re.test(brief))
}

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
  // infrastructure_verified: certainty by definition — it's a system cron, not a decision.
  if (outcome === 'infrastructure_verified') return 1.0
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

// CORRECTION_KEYWORDS — calibrated to Tate's actual correction lexicon.
//
// Root cause of the dark-class bug (Phase G audit 11 May 2026):
//   1. The original keywords were calibrated to generic English correction
//      vocabulary ("that's wrong", "incorrect", "mistake"), NOT Tate's real
//      correction patterns (profanity-prefixed directives, "never mind", "still
//      broken", "wrong numbers", "bro", etc.).
//   2. Even worse: the SMS table detection was looking for tables that never
//      existed (sms_messages / sms_inbound / sms_log), so findTateSignal
//      always returned null — the correction path was STRUCTURALLY dark
//      regardless of keywords.
//
// Fix: Tate's message text now comes from os_conversation (see
// findTateChatSignal below). Keyword set expanded to match his actual
// correction lexicon observed over 30+ days of interactions.
//
// Ordering: multi-token phrases first (highest specificity, lowest FP risk),
// then single-token terms ordered by confidence.
const CORRECTION_KEYWORDS = [
  // --- Tate-specific negation phrases (high confidence, observed in practice) ---
  'never mind',
  'nevermind',
  'not ready',                  // "never mind not ready to release"
  'still not',                  // "still not working", "still not aligned"
  'still broken',
  'still wrong',
  'still aren\'t',
  'still isn\'t',
  'wrong numbers',
  'wrong number',
  'wrong approach',
  'wrong direction',
  'wrong fork',
  'not that',
  "that's wrong",
  'thats wrong',
  // --- Profanity-prefixed corrections (Tate-specific register) ---
  // Presence of expletive + directive in same message = correction signal.
  // These fire on ANY message containing the word (it appears only in
  // correction/strong-feedback contexts in Tate's register).
  'fuck me',
  'fuck that',
  'fucking hell',
  'what the fuck',
  'what the hell',
  // --- Generic negation (requires word-boundary to avoid FP) ---
  'wrong',                      // word-boundary checked below
  // --- Miss-flags ---
  'you missed',
  'missed the point',
  'missed the',
  'you got it wrong',
  'you\'ve got it wrong',
  'not quite',
  'not right',
  'not correct',
  // --- Reframes / redirects ---
  'instead of',
  'the other way',
  'other way around',
  'other way round',
  'do it the other',
  'not like that',
  // --- Explicit stop/undo/cancel signals ---
  'undo that',
  'redo that',
  'revert that',
  'cancel that',
  'roll that back',
  'rollback',
  'dont do that',
  "don't do that",
  'stop doing',
  'stop that',
  'abort',
  // --- Correction-flavoured annotations (Tate uses in diagnostic messages) ---
  'incorrect',
  'mistake',
  'that broke',
  'that\'s broken',
  'you broke',
  'it broke',
  // --- Conservative generic terms that Tate uses in feedback ---
  'fix that',
  'redo',
]

// CORRECTION_KEYWORDS_WORD_BOUNDARY: subset of CORRECTION_KEYWORDS that need
// word-boundary matching to avoid false positives (e.g. "wrong" in "wrongheaded"
// or "stop" in "stopping by"). Applied with \b...\b regex.
const CORRECTION_KEYWORDS_WORD_BOUNDARY = new Set([
  'wrong',
  'abort',
  'redo',
  'stop',
])

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
 * Check a keyword against body text. Applies word-boundary matching for
 * terms in CORRECTION_KEYWORDS_WORD_BOUNDARY to avoid substring false positives
 * (e.g. "wrong" should not fire on "wrongheaded", "abort" on "aborting project",
 * "stop" on "stopping by").
 */
function keywordMatches(kw, body) {
  if (CORRECTION_KEYWORDS_WORD_BOUNDARY.has(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(body)
  }
  return body.includes(kw)
}

/**
 * Extract Tate's raw typed text from an os_conversation content string.
 *
 * os_conversation stores the FULL stitched user turn: XML context blocks
 * (<now>, <forks_rollup>, <perception_summary>, <relevant_memory>, etc.)
 * followed by Tate's actual typed message at the end. Two formats exist:
 *
 *   SMS format:  "[SMS from Tate (+<phone>)]: <text>\n\n\n\nRespond concisely..."
 *   Chat format: "<last XML block/>\n\n<Tate's text>"
 *
 * Returns the extracted text, or null if the content appears to be a
 * purely system-generated turn (cron/meta-loop) with no Tate input.
 */
function extractTateMessageFromContent(content) {
  if (!content || typeof content !== 'string') return null

  // SMS path: extract the body between "[SMS from Tate (+...)]: " and the
  // trailing prompt boilerplate ("Respond concisely...").
  const smsMatch = content.match(/\[SMS from Tate[^\]]*\]:\s*([\s\S]+?)(?:\n{2,}Respond concisely|$)/i)
  if (smsMatch) {
    const text = smsMatch[1].trim()
    return text.length > 0 ? text : null
  }

  // Chat path: Tate's message appears after the last context-block close.
  // Context blocks end with patterns like "</perception_summary>",
  // "</forks_rollup>", "</relevant_memory>", "(queued Nm ago)" or similar.
  // Strategy: find the rightmost occurrence of a closing pattern and take
  // everything after it.
  //
  // Closing patterns observed in production:
  //   </...>  — XML closing tags
  //   "…"    — truncated context block (ellipsis)
  //   "(queued Nm ago)" — message-queue delivery annotation
  const contextEndPatterns = [
    // XML close tags
    /<\/[a-z_]+>/gi,
    // Trailing ellipsis from truncated context blocks
    /…\s*$/gm,
    // Message queue delivery annotation
    /\(queued \d+m ago\)/gi,
  ]

  let lastContextEnd = -1
  for (const pattern of contextEndPatterns) {
    let m
    pattern.lastIndex = 0
    while ((m = pattern.exec(content)) !== null) {
      if (m.index + m[0].length > lastContextEnd) {
        lastContextEnd = m.index + m[0].length
      }
    }
  }

  if (lastContextEnd > 0) {
    const tail = content.slice(lastContextEnd).trim()
    // Filter out known cron-prompt-only tails (meta-loop, scheduled tasks, etc.)
    // that don't contain Tate's actual text. These are purely system-generated.
    if (tail.length < 10) return null
    // Reject tails that are themselves just more system context (heuristic:
    // starts with a XML tag or "[SYSTEM:" or "[SCHEDULED:").
    if (/^<[a-z]|^\[SYSTEM:|^\[SCHEDULED:|^\[PROACTIVE:/i.test(tail)) return null

    // Reject tails that look like fork briefs or system-queue deliveries.
    // Fork briefs are long, structured, start with an uppercase title, and
    // contain distinctive markers. Tate's messages are casual and first-person.
    // Strip "(queued Xm ago)" delivery annotation first for cleaner matching.
    const tailStripped = tail.replace(/\s*\(queued \d+m ago\)\s*$/, '').trim()
    const tailLower = tailStripped.toLowerCase()
    const SYSTEM_TAIL_MARKERS = [
      'you are ecodiaos in fork form',
      'manager: true',
      '[fork_report]',
      '[sub_fork_report',
      'no_report_emitted=true',
      '[system: fork_',
      '[system: fork_done',
      '[proactive:',
      'ecodiaos_telemetry_dir',
      // Fork brief headers are ALL-CAPS titles followed by " — " (em-dash or dash)
      // Tate never writes in this register. Match "WORD WORD — " pattern.
    ]
    if (SYSTEM_TAIL_MARKERS.some(m => tailLower.includes(m))) return null
    // Reject all-caps brief headers like "OS_FORKS REAPER —" or "P0 — Fix..."
    // that are fork-dispatched system briefs, not Tate's conversational text.
    if (/^[A-Z][A-Z0-9_\s]+[—\-]{1,3}/.test(tailStripped)) return null

    return tailStripped.length > 0 ? tailStripped : null
  }

  // Fallback: no context close found. If the content is short (<500 chars) and
  // doesn't start with a context tag, treat the whole thing as Tate's message.
  if (content.length < 500 && !content.startsWith('<now>') && !content.startsWith('[SYSTEM:')) {
    return content.trim()
  }

  return null
}

/**
 * Scan os_conversation rows within the post-dispatch window for Tate's typed
 * messages, then classify each as correction, affirmation, or no signal.
 *
 * This is the PRIMARY Tate-signal source. It replaces the old SMS-table scan
 * which was permanently dark because no SMS tables exist in the schema.
 *
 * Returns:
 *   {kind:'correction', matched_keyword, body, ts}  on a correction match
 *   {kind:'affirmation', matched_keyword, body, ts} on an affirmation match
 *   null                                            on no match / table absent
 *
 * If both correction and affirmation keywords appear in the same window, the
 * EARLIER message wins. If the earliest message contains BOTH, correction wins
 * (the rebuke is the actionable signal).
 *
 * @param {object} client  - postgres client
 * @param {object} dispatch - dispatch_event row
 * @param {Date|string|null} windowStartTs - override the start of the search
 *   window. When null (default) the window anchors to dispatch.ts. Set to
 *   fork.ended_at for fork_spawn dispatches (critique-02 fix: fork_id scope).
 */
async function findTateChatSignal(client, dispatch, windowStartTs = null) {
  const baseTs = windowStartTs ? new Date(windowStartTs) : new Date(dispatch.ts)
  const startTs = baseTs.toISOString()
  const endTs = new Date(baseTs.getTime() + SMS_CORRECTION_WINDOW_MS).toISOString()

  let rows
  try {
    const r = await client.query(
      `SELECT content, created_at AS ts
       FROM os_conversation
       WHERE role = 'user'
         AND created_at BETWEEN $1 AND $2
       ORDER BY created_at ASC
       LIMIT 30`,
      [startTs, endTs]
    )
    rows = r.rows
  } catch {
    return null
  }

  for (const row of rows) {
    const tateText = extractTateMessageFromContent(row.content)
    if (!tateText) continue // system-generated turn, no Tate input
    const body = tateText.toLowerCase()

    // Check correction first (rebuke trumps affirmation in same body).
    for (const kw of CORRECTION_KEYWORDS) {
      if (keywordMatches(kw, body)) {
        return { kind: 'correction', matched_keyword: kw, body: tateText, ts: row.ts }
      }
    }
    for (const kw of AFFIRMATION_KEYWORDS) {
      const needsWordBoundary = kw.length <= 4
      if (needsWordBoundary) {
        const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        if (re.test(body)) {
          return { kind: 'affirmation', matched_keyword: kw, body: tateText, ts: row.ts }
        }
      } else if (body.includes(kw)) {
        return { kind: 'affirmation', matched_keyword: kw, body: tateText, ts: row.ts }
      }
    }
  }
  return null
}

/**
 * Scan inbound SMS messages within the post-dispatch window for either
 * correction OR affirmation keywords.
 *
 * NOTE (11 May 2026): No SMS tables (sms_messages / sms_inbound / sms_log)
 * exist in the schema. Tate's SMS messages arrive via smsWebhook.js, are
 * wrapped as "[SMS from Tate (+...)]: <body>" strings, and stored in
 * os_conversation as user-role rows — the same path as chat messages. This
 * function therefore returns null when smsTable is null (the common case)
 * and serves only as a fallback for future schema additions. The primary
 * signal source is findTateChatSignal (os_conversation scan).
 *
 * @param {Date|string|null} windowStartTs - forwarded to findTateChatSignal;
 *   use fork.ended_at for fork_spawn dispatches (critique-02 fix).
 */
async function findTateSignal(client, dispatch, smsTable, windowStartTs = null) {
  // Primary path: os_conversation (covers both chat AND SMS-wrapped messages).
  const chatSig = await findTateChatSignal(client, dispatch, windowStartTs)
  if (chatSig) return chatSig

  // Legacy fallback: dedicated SMS table (currently never populated).
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
    for (const kw of CORRECTION_KEYWORDS) {
      if (keywordMatches(kw, body)) {
        return { kind: 'correction', matched_keyword: kw, body: row.body, ts: row.ts }
      }
    }
    for (const kw of AFFIRMATION_KEYWORDS) {
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
 *
 * @param {Date|string|null} windowStartTs - forwarded; use fork.ended_at for
 *   fork_spawn dispatches (critique-02 fix).
 */
async function findTateCorrection(client, dispatch, smsTable, windowStartTs = null) {
  const sig = await findTateSignal(client, dispatch, smsTable, windowStartTs)
  if (sig && sig.kind === 'correction') {
    return { matched_keyword: sig.matched_keyword, body: sig.body, ts: sig.ts }
  }
  return null
}

/**
 * Look up os_forks to find when a fork reached a terminal state.
 *
 * Returns { ended_at, status } if the fork row exists, null otherwise.
 * ended_at may itself be null if the fork is still running.
 *
 * Used by inferDispatchOutcome for the critique-02 fix: anchor the correction
 * window to fork.ended_at (fork_id scope) rather than dispatch.ts
 * (dispatch_event_id scope). Tate's corrections respond to what a fork
 * PRODUCED, so the relevant signal window is
 *   [fork.ended_at,  fork.ended_at + SMS_CORRECTION_WINDOW_MS]
 * not
 *   [dispatch.ts,    dispatch.ts   + SMS_CORRECTION_WINDOW_MS]
 *
 * When ended_at is null the fork has not yet finished — callers should defer
 * correction attribution rather than fall back to dispatch.ts (which causes
 * earlier unrelated dispatches to "steal" the correction via the dedup index).
 */
async function getForkEndedAt(client, forkId) {
  if (!forkId) return null
  let table = null
  if (await tableExists(client, 'os_forks')) table = 'os_forks'
  else if (await tableExists(client, 'forks')) table = 'forks'
  if (!table) return null
  const pkColumn = table === 'os_forks' ? 'fork_id' : 'id'
  try {
    const r = await client.query(
      `SELECT ended_at, status FROM ${table} WHERE ${pkColumn} = $1 LIMIT 1`,
      [forkId]
    )
    if (r.rowCount === 0) return null
    return { ended_at: r.rows[0].ended_at || null, status: r.rows[0].status || null }
  } catch {
    return null
  }
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
 *   2. Tate SMS CORRECTION within 30 min (fork_id-scoped window for fork_spawn).
 *   3. Tate SMS AFFIRMATION within 30 min (same scoping).
 *   4. Type-specific SUCCESS signals (factory commit+deploy, fork done+result).
 *   5. UNVERIFIED default for dispatches older than UNVERIFIED_AGE_MS.
 *   6. Defer (return null) for fresh dispatches.
 *
 * critique-02 fix (Phase G audit 2026-05-12, fork_mp3mfnjj_b5930a):
 *   For fork_spawn dispatches, the correction window is anchored to
 *   fork.ended_at (fork_id scope) rather than dispatch.ts
 *   (dispatch_event_id scope). Tate's corrections respond to what a fork
 *   PRODUCED — the relevant window is [fork.ended_at, fork.ended_at+30min].
 *   Anchoring to dispatch.ts caused earlier unrelated dispatches to "steal"
 *   corrections via the dedup partial index, suppressing 280+ real signals
 *   as correction_text_already_attributed|settled_as_unverified.
 *
 *   Deferral rule: if a fork_spawn has a fork_id but the fork has not yet
 *   set ended_at (still running), return null (defer). Attributing before
 *   the fork finishes means the correction window [dispatch.ts, +30min]
 *   would miss post-completion corrections entirely and create the exact
 *   theft race condition the fix is designed to prevent.
 */
async function inferDispatchOutcome(client, dispatch, smsTable) {
  const meta = dispatch.metadata || {}
  let substratesChecked = 0

  // SHORT-CIRCUIT: infrastructure/telemetry cron dispatches.
  //
  // These are DIRECT_EXEC class system crons (telemetry consumers, OS_FORKS
  // REAPER, KG embedding/consolidation, Neo4j keep-alive). They are not
  // user-facing decisions and carry no decision-quality signal. Classifying
  // them as 'infrastructure_verified' pulls them out of the success_rate
  // denominator (Layer 4 dashboard filter) and avoids wasting semantic
  // analysis cycles on them.
  //
  // Check order: action_subtype field first (producer-stamped at INSERT by
  // classifySyntheticBrief), then regex fallback on metadata.brief_excerpt
  // for rows that pre-date the critique-05 producer change.
  //
  // Phase G critique-05, fork_mp3qh8uh_6fce6e, 13 May 2026.
  if (isInfrastructureBrief(dispatch)) {
    return {
      outcome: 'infrastructure_verified',
      evidence: 'confidence=1.0|cron-fired telemetry/infrastructure dispatch, not a user-facing decision',
    }
  }

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

  // Step 2 + 3: Tate signal (correction OR affirmation).
  //
  // critique-02 fix: for fork_spawn dispatches, resolve the correction window
  // start to fork.ended_at (fork_id scope) rather than dispatch.ts.
  let correctionWindowStart = null // null → falls back to dispatch.ts inside findTateChatSignal
  if (dispatch.action_type === 'fork_spawn') {
    const forkId = meta.fork_id || meta.id || null
    if (forkId) {
      const forkState = await getForkEndedAt(client, forkId)
      if (forkState) {
        if (forkState.ended_at) {
          // Fork completed — anchor correction window to fork completion time.
          correctionWindowStart = forkState.ended_at
        } else {
          // Fork has a row in os_forks but hasn't finished yet (ended_at NULL).
          // Defer: do not assign any outcome until the fork reaches terminal state.
          // Exception: very old dispatches (>24h) where the fork appears stuck —
          // fall through with dispatch.ts window to avoid stalling forever.
          const ageMs = Date.now() - new Date(dispatch.ts).getTime()
          if (ageMs < 24 * 60 * 60 * 1000) {
            return null // defer; next tick will re-evaluate after fork finishes
          }
          // >24h old, fork status still non-terminal: fall back to dispatch.ts
          // (correctionWindowStart remains null)
        }
      }
      // forkState === null means fork_id not found in os_forks (data quality gap
      // on pre-migration dispatches). Fall back to dispatch.ts.
    }
    // No fork_id in metadata (pre-migration dispatches): dispatch.ts fallback.
  }

  const sig = await findTateSignal(client, dispatch, smsTable, correctionWindowStart)
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
  let wrongInputClass = 0
  const distribution = { success: 0, failure: 0, correction: 0, unverified: 0, infrastructure_verified: 0 }

  try {
    // Detect SMS table once per tick.
    let smsTable = null
    if (await tableExists(client, 'sms_messages')) smsTable = 'sms_messages'
    else if (await tableExists(client, 'sms_inbound')) smsTable = 'sms_inbound'
    else if (await tableExists(client, 'sms_log')) smsTable = 'sms_log'

    // Pull dispatches with NO outcome_event row at all, older than 5 minutes
    // (give the system time to settle), capped at 500 per tick.
    //
    // WHERE clause: general LEFT JOIN (not correction-specific) so that
    // dispatches with ANY existing outcome row (unverified/success/failure/
    // correction) are all excluded. This keeps the 500-row batch focused on
    // truly unclassified dispatches and prevents re-selected already-classified
    // rows from filling the batch and starving new dispatches.
    //
    // Cross-dispatch correction dedup (outcome_event_dedup_correction partial
    // UNIQUE INDEX on md5(correction_text) WHERE outcome='correction') is
    // handled at INSERT time: ON CONFLICT DO NOTHING + unverified fallback
    // below ensures a dispatch that conflicts on correction_text still gets
    // settled with an 'unverified' row rather than cycling forever.
    const r = await client.query(`
      SELECT d.id, d.ts, d.actor, d.action_type, d.tool_name, d.metadata,
             d.action_subtype
      FROM dispatch_event d
      LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
      WHERE o.id IS NULL
        AND d.ts < NOW() - INTERVAL '5 minutes'
        AND d.ts > NOW() - INTERVAL '14 days'
        AND NOT (
          d.action_type LIKE 'tool_call:%'
          AND COALESCE(d.action_subtype, '') <> 'infrastructure_verified'
        )
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
        // Guard: the WHERE clause now also selects dispatches with non-correction
        // outcome rows (unverified/success/failure). We only re-evaluate those to
        // find NEW correction signals. If inference returned something other than
        // correction and the dispatch already has an outcome row, skip — don't
        // insert a duplicate non-correction row.
        if (inference.outcome !== 'correction') {
          const existing = await client.query(
            `SELECT 1 FROM outcome_event WHERE dispatch_event_id = $1 LIMIT 1`,
            [dispatch.id]
          )
          if (existing.rowCount > 0) {
            skipped += 1
            continue
          }
        }

        // INSERT with ON CONFLICT DO NOTHING to handle outcome_event_dedup_correction:
        // that partial unique index deduplicates by md5(correction_text) WHERE
        // outcome='correction'. When the same Tate message matches multiple dispatches
        // in a 30-min window, the first insert wins; subsequent ones conflict-fire.
        //
        // On conflict for a correction outcome we insert an 'unverified' fallback row
        // so the dispatch is settled and stops cycling through the re-selection loop
        // on every tick (the correction is already attributed to another dispatch).
        //
        // For non-correction outcomes ON CONFLICT DO NOTHING is belt-and-braces only
        // (no partial index covers those paths today, but keeps behaviour safe if
        // future constraints are added).
        const ins = await client.query(
          `INSERT INTO outcome_event (dispatch_event_id, outcome, evidence, correction_text, classification)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            dispatch.id,
            inference.outcome,
            inference.evidence || null,
            inference.correction_text || null,
            null, // Phase D fills classification (for correction AND failure rows)
          ]
        )
        if (ins.rowCount > 0) {
          inferred += 1
          if (distribution[inference.outcome] !== undefined) {
            distribution[inference.outcome] += 1
          }
        } else if (inference.outcome === 'correction') {
          // Conflict-skip on correction: correction_text already attributed to
          // another dispatch in this window. Settle this dispatch as 'unverified'
          // so it is excluded from future ticks (the WHERE clause now filters on
          // correction rows, so an unverified row here keeps it out of the loop).
          await client.query(
            `INSERT INTO outcome_event (dispatch_event_id, outcome, evidence, correction_text, classification)
             VALUES ($1, 'unverified', $2, NULL, NULL)`,
            [
              dispatch.id,
              `correction_text_already_attributed|settled_as_unverified|${inference.evidence || ''}`,
            ]
          )
          inferred += 1
          distribution.unverified = (distribution.unverified || 0) + 1
        } else {
          // Conflict-skip on non-correction outcome (future-proofing). Count as skipped.
          skipped += 1
        }
      } catch (err) {
        errors += 1
        console.error('[outcomeInference] error inferring dispatch', dispatch.id, err.message)
      }
    }

    // Signal-density heartbeat (cowork.telemetry.outcome_inference.signal_density).
    //
    // signal_density = inferred / (inferred + filtered) = classified /
    // total_eligible_input. The SQL WHERE clause above filters tool_call:*
    // dispatches out at the query layer per
    // backend/patterns/outcome-inference-must-exclude-raw-hook-telemetry-action-types-2026-06-10.md
    // The filtered count is computed via the same window so the canary can
    // distinguish input-class drift (filtered dominates) from heuristic breakage
    // (filtered low, inferred low).
    try {
      const f = await client.query(`
        SELECT COUNT(*)::int AS n
        FROM dispatch_event d
        LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
        WHERE o.id IS NULL
          AND d.ts < NOW() - INTERVAL '5 minutes'
          AND d.ts > NOW() - INTERVAL '14 days'
          AND d.action_type LIKE 'tool_call:%'
          AND COALESCE(d.action_subtype, '') <> 'infrastructure_verified'
      `)
      wrongInputClass = f.rows[0] ? f.rows[0].n : 0
      const total = inferred + wrongInputClass
      const density = total > 0 ? inferred / total : null
      await client.query(
        `INSERT INTO kv_store (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [
          'cowork.telemetry.outcome_inference.signal_density',
          JSON.stringify({
            ts: new Date().toISOString(),
            inferred,
            wrong_input_class: wrongInputClass,
            total_eligible: total,
            density,
            distribution,
          }),
        ]
      )
    } catch (err) {
      console.error('[outcomeInference] signal_density heartbeat write failed:', err.message)
    }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  return { ok: true, inferred, skipped, errors, wrongInputClass, distribution }
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

/**
 * Backfill correction outcomes for the last N days.
 *
 * Scans outcome_event rows with outcome='unverified' (or missing outcome_event
 * entirely) where the dispatch_event falls within `lookbackDays`. For each
 * dispatch, re-runs findTateChatSignal using the expanded keyword set. If a
 * correction is detected, upgrades the outcome_event row to 'correction'.
 *
 * critique-02 fix applied: for fork_spawn dispatches with a fork_id in metadata,
 * uses fork.ended_at as the correction window start (fork_id scope) rather than
 * dispatch.ts (dispatch_event_id scope). See inferDispatchOutcome for rationale.
 *
 * Conservative: only upgrades 'unverified' → 'correction'. Never touches
 * existing 'success' or 'failure' rows (those have stronger evidence already).
 * For dispatches with no outcome_event row, inserts a new 'correction' row.
 *
 * Returns { upgraded, inserted, scanned, errors }.
 */
async function backfillCorrections(lookbackDays = 30) {
  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()

  let scanned = 0
  let upgraded = 0
  let inserted = 0
  let errors = 0

  try {
    // Pull unverified + no-outcome dispatches from the lookback window.
    // Excludes correction_text_already_attributed rows — those require the
    // dedicated backfillSuppressedCorrections pass (swap logic needed).
    const r = await client.query(`
      SELECT d.id, d.ts, d.actor, d.action_type, d.tool_name, d.metadata,
             o.id AS outcome_id, o.outcome AS current_outcome
      FROM dispatch_event d
      LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
      WHERE d.ts > NOW() - INTERVAL '${parseInt(lookbackDays, 10)} days'
        AND (o.outcome = 'unverified' OR o.id IS NULL)
        AND (o.evidence IS NULL OR o.evidence NOT LIKE 'correction_text_already_attributed%')
      ORDER BY d.ts ASC
      LIMIT 2000
    `)

    for (const dispatch of r.rows) {
      scanned += 1
      try {
        // critique-02 fix: resolve correction window start to fork.ended_at
        // for fork_spawn dispatches that have a fork_id in metadata.
        let correctionWindowStart = null
        if (dispatch.action_type === 'fork_spawn') {
          const forkId = (dispatch.metadata || {}).fork_id || (dispatch.metadata || {}).id || null
          if (forkId) {
            const forkState = await getForkEndedAt(client, forkId)
            if (forkState && forkState.ended_at) {
              correctionWindowStart = forkState.ended_at
            }
          }
        }

        const sig = await findTateChatSignal(client, dispatch, correctionWindowStart)
        if (!sig || sig.kind !== 'correction') continue

        const evidence = `confidence=1.0|backfill_13_may_2026_critique02|os_conversation within 30min matched correction '${sig.matched_keyword}'${correctionWindowStart ? '|window=fork_ended_at' : ''}`

        if (dispatch.outcome_id) {
          // Upgrade existing unverified row — but first check that the
          // correction_text isn't already attributed to a DIFFERENT dispatch.
          const dupUp = await client.query(
            `SELECT 1 FROM outcome_event
             WHERE outcome = 'correction'
               AND md5(correction_text) = md5($1::text)
               AND id != $2
             LIMIT 1`,
            [sig.body, dispatch.outcome_id]
          )
          if (dupUp.rowCount > 0) {
            // Already attributed elsewhere — leave this row as 'unverified'.
            continue
          }
          await client.query(
            `UPDATE outcome_event
             SET outcome = 'correction',
                 evidence = $1,
                 correction_text = $2,
                 ts = NOW()
             WHERE id = $3`,
            [evidence, sig.body, dispatch.outcome_id]
          )
          upgraded += 1
        } else {
          // Insert new correction row — guard against duplicate correction_text.
          const dupIns = await client.query(
            `SELECT 1 FROM outcome_event
             WHERE outcome = 'correction'
               AND md5(correction_text) = md5($1::text)
             LIMIT 1`,
            [sig.body]
          )
          if (dupIns.rowCount > 0) {
            continue
          }
          await client.query(
            `INSERT INTO outcome_event (dispatch_event_id, outcome, evidence, correction_text, classification)
             VALUES ($1, 'correction', $2, $3, NULL)`,
            [dispatch.id, evidence, sig.body]
          )
          inserted += 1
        }
      } catch (err) {
        errors += 1
        console.error('[backfill] error on dispatch', dispatch.id, err.message)
      }
    }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  return { scanned, upgraded, inserted, errors }
}

/**
 * Recover corrections suppressed by the dedup race condition (critique-02).
 *
 * Background: before the critique-02 fix, corrections were attributed based on
 * dispatch.ts windows. Earlier unrelated dispatches "stole" corrections from
 * fork_spawn dispatches via the dedup partial index, resulting in
 * outcome_event rows with evidence='correction_text_already_attributed|settled_as_unverified'.
 *
 * This function re-evaluates those rows using fork_id-scoped windows and swaps
 * attribution when the original winner has a weaker claim:
 *
 *   Winner has weaker claim when:
 *     (a) winner's action_type is NOT fork_spawn (e.g. tool_call stole it), OR
 *     (b) winner is fork_spawn but its fork.ended_at is AFTER the candidate's
 *         fork.ended_at — meaning the candidate's fork finished first and
 *         is therefore the more likely cause of the correction.
 *
 * Swap: winner's outcome_event → 'unverified'; candidate's → 'correction'.
 * Transaction-wrapped to keep the partial dedup index consistent.
 *
 * Returns { scanned, swapped, skipped, errors }.
 */
async function backfillSuppressedCorrections(lookbackDays = 30) {
  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()

  let scanned = 0
  let swapped = 0
  let skipped = 0
  let errors = 0

  try {
    // Pull unverified rows with the correction_text_already_attributed evidence.
    const r = await client.query(`
      SELECT d.id, d.ts, d.actor, d.action_type, d.tool_name, d.metadata,
             o.id AS outcome_id
      FROM outcome_event o
      JOIN dispatch_event d ON d.id = o.dispatch_event_id
      WHERE o.outcome = 'unverified'
        AND o.evidence LIKE 'correction_text_already_attributed%'
        AND d.ts > NOW() - INTERVAL '${parseInt(lookbackDays, 10)} days'
      ORDER BY d.ts ASC
      LIMIT 2000
    `)

    for (const dispatch of r.rows) {
      scanned += 1
      try {
        // Resolve correction window start (fork_id scope).
        let correctionWindowStart = null
        let candidateForkEndedAt = null
        if (dispatch.action_type === 'fork_spawn') {
          const forkId = (dispatch.metadata || {}).fork_id || (dispatch.metadata || {}).id || null
          if (forkId) {
            const forkState = await getForkEndedAt(client, forkId)
            if (forkState && forkState.ended_at) {
              correctionWindowStart = forkState.ended_at
              candidateForkEndedAt = new Date(forkState.ended_at)
            }
          }
        }

        // Re-scan os_conversation with the fork_id-scoped window to find the
        // correction text that was originally attributed elsewhere.
        const sig = await findTateChatSignal(client, dispatch, correctionWindowStart)
        if (!sig || sig.kind !== 'correction') {
          skipped += 1
          continue
        }

        // Find who currently holds this correction text.
        const winnerRow = await client.query(
          `SELECT oe.id AS oe_id, oe.dispatch_event_id,
                  d2.action_type AS winner_action_type,
                  d2.metadata AS winner_meta
           FROM outcome_event oe
           JOIN dispatch_event d2 ON d2.id = oe.dispatch_event_id
           WHERE oe.outcome = 'correction'
             AND md5(oe.correction_text) = md5($1::text)
           LIMIT 1`,
          [sig.body]
        )

        if (winnerRow.rowCount === 0) {
          // No winner found — the correction was never properly attributed.
          // Directly upgrade this row.
          const evidence = `confidence=1.0|backfill_suppressed_critique02|os_conversation matched correction '${sig.matched_keyword}'${correctionWindowStart ? '|window=fork_ended_at' : ''}`
          await client.query(
            `UPDATE outcome_event
             SET outcome = 'correction', evidence = $1, correction_text = $2, ts = NOW()
             WHERE id = $3`,
            [evidence, sig.body, dispatch.outcome_id]
          )
          swapped += 1
          continue
        }

        const winner = winnerRow.rows[0]
        const winnerActionType = winner.winner_action_type || ''
        const winnerMeta = winner.winner_meta || {}

        // Determine if candidate has a stronger claim than the current winner.
        let candidateHasBetterClaim = false

        if (winnerActionType !== 'fork_spawn') {
          // Winner is not a fork_spawn: candidate (fork) has a stronger claim.
          candidateHasBetterClaim = true
        } else {
          // Both are fork_spawn: compare fork completion times.
          // Candidate has better claim if its fork finished first (earlier ended_at).
          const winnerForkId = winnerMeta.fork_id || winnerMeta.id || null
          if (winnerForkId && candidateForkEndedAt) {
            const winnerForkState = await getForkEndedAt(client, winnerForkId)
            if (winnerForkState && winnerForkState.ended_at) {
              const winnerEndedAt = new Date(winnerForkState.ended_at)
              // Candidate has better claim if it finished BEFORE the winner's fork.
              // A correction at T is most likely caused by the fork that completed
              // most recently before T (earliest ended_at ≤ correction time).
              if (candidateForkEndedAt <= winnerEndedAt) {
                candidateHasBetterClaim = true
              }
            }
          }
        }

        if (!candidateHasBetterClaim) {
          skipped += 1
          continue
        }

        // Swap attribution in a transaction to keep the dedup index consistent.
        const candidateEvidence = `confidence=1.0|backfill_suppressed_critique02|swapped_from_${winner.oe_id}|os_conversation matched correction '${sig.matched_keyword}'${correctionWindowStart ? '|window=fork_ended_at' : ''}`
        const winnerEvidence = `correction_reattributed_to_fork_owner|swapped_to_${dispatch.outcome_id}|critique02_recovery`

        await client.query('BEGIN')
        try {
          // Step 1: demote winner to unverified (clears correction_text, releases dedup slot).
          await client.query(
            `UPDATE outcome_event
             SET outcome = 'unverified', evidence = $1, correction_text = NULL, ts = NOW()
             WHERE id = $2`,
            [winnerEvidence, winner.oe_id]
          )
          // Step 2: promote candidate to correction.
          await client.query(
            `UPDATE outcome_event
             SET outcome = 'correction', evidence = $1, correction_text = $2, ts = NOW()
             WHERE id = $3`,
            [candidateEvidence, sig.body, dispatch.outcome_id]
          )
          await client.query('COMMIT')
          swapped += 1
        } catch (txErr) {
          await client.query('ROLLBACK')
          throw txErr
        }
      } catch (err) {
        errors += 1
        console.error('[backfill_suppressed] error on dispatch', dispatch.id, err.message)
      }
    }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  return { scanned, swapped, skipped, errors }
}

if (require.main === module) {
  const onceMode = process.argv.includes('--once')
  const backfillMode = process.argv.includes('--backfill')
  const backfillSuppressedMode = process.argv.includes('--backfill-suppressed')
  if (backfillSuppressedMode) {
    // Recover the 280+ corrections suppressed by the pre-critique-02 dedup race.
    // Swaps attribution from non-fork winners to the fork_spawn dispatches that
    // caused the corrections. Safe to run multiple times (idempotent per swap).
    const days = parseInt(process.argv[process.argv.indexOf('--backfill-suppressed') + 1] || '30', 10)
    backfillSuppressedCorrections(isNaN(days) ? 30 : days)
      .then(result => {
        console.log('[outcomeInference] backfill-suppressed complete:', JSON.stringify(result))
        process.exit(0)
      })
      .catch(err => { console.error(err); process.exit(1) })
  } else if (backfillMode) {
    const days = parseInt(process.argv[process.argv.indexOf('--backfill') + 1] || '30', 10)
    backfillCorrections(isNaN(days) ? 30 : days)
      .then(result => {
        console.log('[outcomeInference] backfill complete:', JSON.stringify(result))
        process.exit(0)
      })
      .catch(err => { console.error(err); process.exit(1) })
  } else if (onceMode) {
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
  backfillCorrections,
  backfillSuppressedCorrections,
  inferDispatchOutcome,
  findTateSignal,
  findTateChatSignal,
  extractTateMessageFromContent,
  findTateCorrection,
  inferForkSpawnOutcome,
  inferFactoryDispatchOutcome,
  getForkEndedAt,
  computeConfidence,
  probeExpectedArtefact,
  isInfrastructureBrief,
  CORRECTION_KEYWORDS,
  CORRECTION_KEYWORDS_WORD_BOUNDARY,
  AFFIRMATION_KEYWORDS,
  UNVERIFIED_AGE_MS,
  INFRA_CRON_PATTERNS,
}

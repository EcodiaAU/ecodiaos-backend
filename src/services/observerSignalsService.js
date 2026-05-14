'use strict'

/**
 * observerSignalsService — substrate for Haiku observer interventions.
 *
 * Observers write here INSTEAD of POSTing to /api/os-session/message.
 * The conductor reads recent unacknowledged signals via a <observer_signals>
 * continuity block at turn-start (ambient context, not chat).
 *
 * Why this exists:
 *   The original _postIntervention path used the same /api/os-session/message
 *   endpoint as Tate's typed input + scheduler wakes. Observer messages
 *   landed in the conductor's user-message stream and frontend rendered
 *   them as "tate\n<observer source=...>" — the conductor then treated
 *   observer interventions as new user input and looped: respond to
 *   observer → observer fires again on the response → loop. Tate flagged
 *   this 13 May 2026 ("all the coherence stuff is coming through main chat
 *   and polluting the os context").
 *
 *   Architectural fix: dedicated substrate with explicit consumer semantics.
 *   Observers are meta-cognition — peer signals, never user input.
 *
 * 5-layer verification:
 *   1. PRODUCER: observerBase._evaluate() now calls writeSignal() instead of
 *      _postIntervention(). Old _postIntervention preserved for one cycle
 *      with deprecation warning then removed.
 *   2. TRIGGER: NONE — direct INSERT, no pg_notify needed (the continuity
 *      block reads via SELECT each turn).
 *   3. BRIDGE: NONE — turn-start injector calls this service directly.
 *   4. CONSUMER: osSessionService._injectObserverSignals() — formats
 *      ambient signals into <observer_signals> XML block.
 *   5. SIDE-EFFECT: conductor flips `acknowledged = true` via mark-ack tool
 *      OR signal auto-expires after 30min.
 *
 * Self-mute discipline:
 *   Same observer + same fingerprint fired 3+ times within 10 minutes =
 *   loop detected. writeSignal() returns { muted: true } without inserting,
 *   inserts an observer_mute_state row (1h cooldown), and writes a P3
 *   status_board row so Tate can inspect/tune the observer's threshold.
 *
 * Conflict resolution:
 *   If two different observers post signals with conflicting intent
 *   (e.g. coherence says "resume task X", actionAudit says "task X is
 *   complete"), neither signal surfaces to conductor; instead a synthetic
 *   conflict signal is written that says "observers disagree, manual
 *   review" + both fingerprints. Conductor reads this as a single ambient
 *   note, not a forced action.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const crypto = require('crypto')

const SELF_MUTE_THRESHOLD = 3
const SELF_MUTE_WINDOW_MS = 10 * 60 * 1000
const SELF_MUTE_DURATION_MS = 60 * 60 * 1000
const SIGNAL_TTL_MS = 30 * 60 * 1000

function _fingerprint({ observer_name, signal_kind, message }) {
  const head = String(message).slice(0, 200)
  return crypto
    .createHash('sha1')
    .update(`${observer_name}|${signal_kind}|${head}`)
    .digest('hex')
    .slice(0, 24)
}

/**
 * Check if observer is currently muted. Returns { muted: bool, until?: Date }.
 */
async function isMuted(observerName) {
  try {
    const rows = await db`
      SELECT muted_until FROM observer_mute_state
      WHERE observer_name = ${observerName}
        AND muted_until > NOW()
      LIMIT 1
    `
    if (rows.length === 0) return { muted: false }
    return { muted: true, until: rows[0].muted_until }
  } catch (err) {
    logger.debug('observerSignalsService.isMuted failed', { observerName, error: err.message })
    return { muted: false }
  }
}

/**
 * Detect if this fingerprint is in a self-loop and should mute the observer.
 * Returns { shouldMute: bool, recentCount: int }.
 */
async function _detectLoop(observerName, fingerprint) {
  try {
    const rows = await db`
      SELECT COUNT(*)::int AS n
      FROM observer_signals
      WHERE observer_name = ${observerName}
        AND fingerprint = ${fingerprint}
        AND created_at > NOW() - INTERVAL '10 minutes'
    `
    const n = rows[0]?.n || 0
    return { shouldMute: n >= SELF_MUTE_THRESHOLD, recentCount: n }
  } catch (err) {
    logger.debug('observerSignalsService._detectLoop failed', { error: err.message })
    return { shouldMute: false, recentCount: 0 }
  }
}

async function _writeSelfMute(observerName, fingerprint, recentCount) {
  try {
    const until = new Date(Date.now() + SELF_MUTE_DURATION_MS)
    const reason = `self-mute: same fingerprint fired ${recentCount}x within ${SELF_MUTE_WINDOW_MS / 60_000}min`
    await db`
      INSERT INTO observer_mute_state (observer_name, muted_until, mute_reason, fingerprint_that_triggered)
      VALUES (${observerName}, ${until}, ${reason}, ${fingerprint})
      ON CONFLICT (observer_name) DO UPDATE
        SET muted_until = EXCLUDED.muted_until,
            mute_reason = EXCLUDED.mute_reason,
            fingerprint_that_triggered = EXCLUDED.fingerprint_that_triggered,
            muted_at = NOW()
    `
    // Surface to status_board for tuning visibility (idempotent)
    const sbName = `observer ${observerName}: self-muted (loop detected)`
    await db`
      INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source)
      SELECT ${sbName}, 'infrastructure', 'self_muted_1h',
             3, 'Review observer threshold / prompt — same fingerprint fired 3x. Auto-clears in 1h.',
             'ecodiaos', 'observer_signals_service'
      WHERE NOT EXISTS (
        SELECT 1 FROM status_board WHERE name = ${sbName} AND archived_at IS NULL
      )
    `
    logger.warn(`observer ${observerName}: SELF-MUTED for 1h`, { fingerprint, recentCount })
  } catch (err) {
    logger.warn('observerSignalsService._writeSelfMute failed', { error: err.message })
  }
}

/**
 * Detect conflict between two observers' recent signals.
 *
 * Audit 2026-05-13 P0 #32: previous version computed Jaccard on raw
 * `[a-z0-9_]+` tokens with no stopword filter and threshold 0.3 — observer
 * messages share enough common vocabulary ("conductor", "user", "action",
 * "next", "the", "should") that ANY two real signals within 5 min collided,
 * producing a meta-`[CONFLICT]` signal instead of either original. Tate
 * never saw the actual observations. Fix: strip stopwords, raise the
 * threshold so real overlap (not just shared structural vocabulary) is
 * required.
 */
const _CONFLICT_STOPWORDS = new Set([
  // Articles / determiners / pronouns
  'the','a','an','this','that','these','those','it','its','they','them','their','i','you','your','we','us','our','my','me',
  // Generic verbs
  'is','was','were','be','being','been','are','will','would','should','could','can','do','did','does','done','have','has','had','make','made','get','got','take','took','use','used',
  // Conjunctions / prepositions
  'and','or','but','if','then','when','while','as','at','by','on','in','of','to','from','for','with','without','about','into','out','over','under','up','down','through','between','before','after','because','since',
  // Generic nouns / fillers the observers share
  'conductor','user','tate','action','actions','observer','observers','signal','signals','turn','turns','context','message','messages','session','sessions','time','data',
  // Common modifiers
  'no','not','yes','any','some','all','more','less','very','too','also','just','only','still','again',
])

function _tokenize(s) {
  const raw = String(s).toLowerCase().match(/[a-z0-9_]+/g) || []
  const out = new Set()
  for (const t of raw) {
    if (t.length < 3) continue
    if (_CONFLICT_STOPWORDS.has(t)) continue
    out.add(t)
  }
  return out
}

const CONFLICT_JACCARD_THRESHOLD = 0.5
const CONFLICT_MIN_OVERLAP_TOKENS = 4

async function _detectConflict(observerName, message) {
  try {
    const rows = await db`
      SELECT observer_name, message
      FROM observer_signals
      WHERE observer_name != ${observerName}
        AND created_at > NOW() - INTERVAL '5 minutes'
        AND acknowledged = FALSE
      ORDER BY created_at DESC
      LIMIT 10
    `
    if (rows.length === 0) return null
    const mine = _tokenize(message)
    if (mine.size < CONFLICT_MIN_OVERLAP_TOKENS) return null
    for (const r of rows) {
      const theirs = _tokenize(r.message)
      if (theirs.size < CONFLICT_MIN_OVERLAP_TOKENS) continue
      const intersectArr = [...mine].filter(t => theirs.has(t))
      const intersect = intersectArr.length
      if (intersect < CONFLICT_MIN_OVERLAP_TOKENS) continue
      const union = new Set([...mine, ...theirs]).size
      const jaccard = intersect / Math.max(union, 1)
      if (jaccard >= CONFLICT_JACCARD_THRESHOLD) {
        return {
          withObserver: r.observer_name,
          jaccard,
          theirMessage: r.message.slice(0, 120),
          overlap: intersectArr.slice(0, 8),
        }
      }
    }
    return null
  } catch (err) {
    logger.debug('observerSignalsService._detectConflict failed', { error: err.message })
    return null
  }
}

/**
 * Write an observer signal to the substrate.
 *
 * Returns one of:
 *   { written: true, id, signal_kind: <input> }
 *   { written: false, reason: 'muted', until: Date }
 *   { written: false, reason: 'self_muted_now', recentCount: int }
 *   { written: 'conflict_resolved', conflictWith: observer_name }
 */
async function writeSignal({ observer_name, signal_kind, message, reason, confidence, priority, correlation_id, evidence_event_ids }) {
  if (!observer_name || !signal_kind || !message) {
    return { written: false, reason: 'invalid_input' }
  }

  // Priority normalisation: 1=critical, 3=normal (default), 5=info.
  // Any caller-supplied value outside {1,3,5} is coerced to 3.
  const _priority = (priority === 1 || priority === 3 || priority === 5) ? priority : 3

  // 1. Mute check
  const muteCheck = await isMuted(observer_name)
  if (muteCheck.muted) {
    return { written: false, reason: 'muted', until: muteCheck.until }
  }

  // 2. Fingerprint + loop detection
  const fp = _fingerprint({ observer_name, signal_kind, message })
  const loop = await _detectLoop(observer_name, fp)
  if (loop.shouldMute) {
    await _writeSelfMute(observer_name, fp, loop.recentCount)
    return { written: false, reason: 'self_muted_now', recentCount: loop.recentCount }
  }

  // 3. Conflict detection (write conflict_resolved signal instead of raw)
  const conflict = await _detectConflict(observer_name, message)
  if (conflict) {
    try {
      const expiresAt = new Date(Date.now() + SIGNAL_TTL_MS)
      const combinedMsg = `[CONFLICT] ${observer_name} vs ${conflict.withObserver} (jaccard=${conflict.jaccard.toFixed(2)}). ` +
        `Mine: "${String(message).slice(0, 100)}". Theirs: "${conflict.theirMessage}". ` +
        `Conductor — pick the right one or note in scratchpad why both are wrong.`
      const rows = await db`
        INSERT INTO observer_signals
          (observer_name, signal_kind, message, reason, confidence, fingerprint, expires_at)
        VALUES
          ('observer_meta', 'conflict_resolved', ${combinedMsg}, 'conflict-suppression', 0.5, ${fp}, ${expiresAt})
        RETURNING id
      `
      logger.info(`observer ${observer_name}: signal suppressed by conflict with ${conflict.withObserver}`)
      return { written: 'conflict_resolved', id: rows[0]?.id, conflictWith: conflict.withObserver }
    } catch (err) {
      logger.warn('observerSignalsService: conflict-resolved insert failed', { error: err.message })
      // fall through to normal insert
    }
  }

  // 4. Normal insert
  try {
    const expiresAt = new Date(Date.now() + SIGNAL_TTL_MS)
    const evidenceArr = Array.isArray(evidence_event_ids) && evidence_event_ids.length > 0
      ? evidence_event_ids
      : null
    const rows = await db`
      INSERT INTO observer_signals
        (observer_name, signal_kind, message, reason, confidence, fingerprint,
         expires_at, priority, correlation_id, evidence_event_ids)
      VALUES
        (${observer_name}, ${signal_kind}, ${message}, ${reason || null},
         ${confidence ?? null}, ${fp}, ${expiresAt},
         ${_priority}, ${correlation_id || null}, ${evidenceArr})
      RETURNING id, priority
    `
    const inserted = rows[0]

    // Observer Framework v2: durable status_board mirror for non-P1 signals.
    // P1 signals get interrupt-injected immediately and don't need durable
    // mirroring (they'll be acted on or expire fast). P3 signals are the
    // ambient ones that benefit from surviving session restarts. Fire-and-
    // forget; we never let a status_board failure block observer signalling.
    if (inserted && (inserted.priority === 3 || _priority === 3)) {
      _mirrorToStatusBoard({
        signal_id: inserted.id,
        observer_name,
        signal_kind,
        message,
        priority: inserted.priority,
      }).catch(err => logger.debug('observerSignals: status_board mirror failed', { error: err.message, signal_id: inserted.id }))
    }

    return { written: true, id: inserted?.id, signal_kind, priority: inserted?.priority }
  } catch (err) {
    logger.warn('observerSignalsService.writeSignal failed', { error: err.message })
    return { written: false, reason: 'db_error' }
  }
}

/**
 * Mirror a P3 observer signal as a low-priority status_board row so it
 * survives session restarts and shows up in the conductor's normal
 * orientation pass. Idempotent by fingerprint via the row name.
 */
async function _mirrorToStatusBoard({ signal_id, observer_name, signal_kind, message }) {
  try {
    const rowName = `observer ${observer_name}: ${signal_kind} (sig=${signal_id})`
    await db`
      INSERT INTO status_board
        (name, entity_type, status, priority, next_action, next_action_by, source)
      SELECT ${rowName}, 'observation', 'ambient', 4,
             ${String(message).slice(0, 280)}, 'ecodiaos', ${`observer:${observer_name}`}
      WHERE NOT EXISTS (
        SELECT 1 FROM status_board
        WHERE name = ${rowName} AND archived_at IS NULL
      )
    `
  } catch (err) {
    logger.debug('observerSignalsService._mirrorToStatusBoard failed', { error: err.message })
  }
}

/**
 * Fetch ambient signals for the next conductor turn.
 * Returns array of compact rows: { id, observer_name, signal_kind, message, confidence, age_min }.
 * Caller (osSessionService._injectObserverSignals) formats into XML block.
 */
async function fetchAmbient({ limit = 6 } = {}) {
  try {
    const rows = await db`
      SELECT id, observer_name, signal_kind, message, confidence,
             EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_sec
      FROM observer_signals
      WHERE acknowledged = FALSE
        AND expires_at > NOW()
      ORDER BY confidence DESC NULLS LAST, created_at DESC
      LIMIT ${limit}
    `
    return rows.map(r => ({
      id: r.id,
      observer_name: r.observer_name,
      signal_kind: r.signal_kind,
      message: r.message,
      confidence: r.confidence,
      age_min: Math.round(r.age_sec / 60),
    }))
  } catch (err) {
    logger.debug('observerSignalsService.fetchAmbient failed', { error: err.message })
    return []
  }
}

/**
 * Mark a signal acknowledged (consumed by a specific conductor turn).
 * Used by the in-process MCP tool the conductor can call to dismiss a
 * signal it has acted on or decided to ignore.
 *
 * Kept for backwards compatibility; new callers should use
 * acknowledgeExplicit() / acknowledgeImplicit() / dismiss() to record
 * ack_mode + ack_reason for the tuning cron.
 */
async function acknowledge(signal_id, turn_id) {
  try {
    await db`
      UPDATE observer_signals
      SET acknowledged = TRUE,
          consumed_at_turn = ${turn_id || null}
      WHERE id = ${signal_id}
    `
    return { acknowledged: true }
  } catch (err) {
    logger.debug('observerSignalsService.acknowledge failed', { error: err.message })
    return { acknowledged: false, error: err.message }
  }
}

/**
 * Explicit acknowledgement via mcp__observer__ack(id, reason).
 * Conductor states what action it took in response.
 */
async function acknowledgeExplicit(signal_id, { turn_id, reason } = {}) {
  try {
    const rows = await db`
      UPDATE observer_signals
      SET acknowledged = TRUE,
          ack_mode = 'explicit',
          ack_reason = ${reason || null},
          ack_turn_id = ${turn_id || null},
          consumed_at_turn = ${turn_id || null}
      WHERE id = ${signal_id} AND acknowledged = FALSE
      RETURNING id
    `
    if (rows.length === 0) return { acknowledged: false, error: 'not_found_or_already_acked' }
    return { acknowledged: true, id: rows[0].id }
  } catch (err) {
    logger.debug('observerSignalsService.acknowledgeExplicit failed', { error: err.message })
    return { acknowledged: false, error: err.message }
  }
}

/**
 * Implicit acknowledgement — called automatically after a turn that took
 * substantive action while a signal was visible in <observer_signals>. The
 * ack_reason captures what the action was; the tuning cron uses this to
 * tell "signal seen + conductor acted" (likely useful) from "signal seen +
 * conductor explicitly dismissed" (likely noise).
 */
async function acknowledgeImplicit(signal_ids, { turn_id, action_summary } = {}) {
  if (!signal_ids || signal_ids.length === 0) return { acknowledged: 0 }
  try {
    const rows = await db`
      UPDATE observer_signals
      SET acknowledged = TRUE,
          ack_mode = 'implicit',
          ack_reason = ${action_summary || 'turn produced substantive tool calls'},
          ack_turn_id = ${turn_id || null},
          consumed_at_turn = ${turn_id || null}
      WHERE id = ANY(${signal_ids}::bigint[]) AND acknowledged = FALSE
      RETURNING id
    `
    return { acknowledged: rows.length, ids: rows.map(r => r.id) }
  } catch (err) {
    logger.debug('observerSignalsService.acknowledgeImplicit failed', { error: err.message })
    return { acknowledged: 0, error: err.message }
  }
}

/**
 * Explicit dismissal via mcp__observer__dismiss(id, reason).
 * Conductor disagrees with the signal — strong tuning signal.
 */
async function dismiss(signal_id, { turn_id, reason } = {}) {
  try {
    const rows = await db`
      UPDATE observer_signals
      SET acknowledged = TRUE,
          ack_mode = 'dismissed',
          ack_reason = ${reason || null},
          ack_turn_id = ${turn_id || null},
          consumed_at_turn = ${turn_id || null}
      WHERE id = ${signal_id} AND acknowledged = FALSE
      RETURNING id
    `
    if (rows.length === 0) return { acknowledged: false, error: 'not_found_or_already_acked' }
    return { acknowledged: true, id: rows[0].id }
  } catch (err) {
    logger.debug('observerSignalsService.dismiss failed', { error: err.message })
    return { acknowledged: false, error: err.message }
  }
}

/**
 * Mark a signal as a factual false positive. Stronger tuning signal than
 * dismiss — the weekly cron uses this to auto-narrow triggers or archive
 * observers with high false-positive rates.
 */
async function markFalsePositive(signal_id, { turn_id, reason } = {}) {
  try {
    const rows = await db`
      UPDATE observer_signals
      SET mark_false_positive = TRUE,
          acknowledged = TRUE,
          ack_mode = COALESCE(ack_mode, 'dismissed'),
          ack_reason = COALESCE(ack_reason, ${reason || 'marked false positive'}),
          ack_turn_id = COALESCE(ack_turn_id, ${turn_id || null}),
          consumed_at_turn = COALESCE(consumed_at_turn, ${turn_id || null})
      WHERE id = ${signal_id}
      RETURNING id
    `
    if (rows.length === 0) return { ok: false, error: 'not_found' }
    return { ok: true, id: rows[0].id }
  } catch (err) {
    logger.debug('observerSignalsService.markFalsePositive failed', { error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * List recent signals on demand (powers mcp__observer__list_recent).
 */
async function listRecent({ observer_name = null, hours = 1, include_acknowledged = false } = {}) {
  try {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000)
    const rows = await db`
      SELECT id, observer_name, signal_kind, message, reason, confidence,
             acknowledged, ack_mode, ack_reason, priority, mark_false_positive,
             created_at
      FROM observer_signals
      WHERE created_at > ${cutoff}
        AND (${observer_name}::text IS NULL OR observer_name = ${observer_name})
        AND (${include_acknowledged} = TRUE OR acknowledged = FALSE)
      ORDER BY created_at DESC
      LIMIT 50
    `
    return rows
  } catch (err) {
    logger.debug('observerSignalsService.listRecent failed', { error: err.message })
    return []
  }
}

/**
 * Fetch unacknowledged P1 (critical) signals for the tool-call-boundary
 * interrupt path. Called from osSessionService between SDK tool blocks.
 * Returns only signals created since turn_start to avoid surfacing stale P1s.
 */
async function fetchPendingP1({ since_ts = null, limit = 3 } = {}) {
  try {
    const cutoff = since_ts ? new Date(since_ts) : new Date(Date.now() - 5 * 60 * 1000)
    const rows = await db`
      SELECT id, observer_name, signal_kind, message, confidence, created_at
      FROM observer_signals
      WHERE priority = 1
        AND acknowledged = FALSE
        AND created_at > ${cutoff}
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return rows
  } catch (err) {
    logger.debug('observerSignalsService.fetchPendingP1 failed', { error: err.message })
    return []
  }
}

/**
 * Periodic prune (call from a low-frequency cron or boot worker).
 * Removes acknowledged + expired rows older than 24h; keeps recent ones for
 * observer-tuning telemetry.
 */
async function prune() {
  try {
    const result = await db`
      DELETE FROM observer_signals
      WHERE (acknowledged = TRUE OR expires_at < NOW())
        AND created_at < NOW() - INTERVAL '24 hours'
      RETURNING id
    `
    if (result.length > 0) {
      logger.info('observerSignalsService.prune: removed stale signals', { count: result.length })
    }
    return result.length
  } catch (err) {
    logger.debug('observerSignalsService.prune failed', { error: err.message })
    return 0
  }
}

module.exports = {
  writeSignal,
  fetchAmbient,
  acknowledge,
  acknowledgeExplicit,
  acknowledgeImplicit,
  dismiss,
  markFalsePositive,
  listRecent,
  fetchPendingP1,
  isMuted,
  prune,
  // exposed for tests
  _fingerprint,
  _detectLoop,
  _detectConflict,
}

'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

const _subscribers = []

function subscribe(fn) {
  if (typeof fn === 'function') _subscribers.push(fn)
}

// ── Per-source rate cap (C3, fork_mosn8o5x_7a0e54) ─────────────────────────
//
// W3 §3.3 / Fix 03 sibling: a runaway publisher (faulty webhook handler,
// pg_notify replay storm, listener loop publishing back into the bus) can
// flood perceptionBus, dragging os_observations INSERT contention and
// burying real signals under noise.
//
// Defence-in-depth: per-source rolling 1h ring buffer. When a source exceeds
// the cap (default 1000 events/hr, configurable via env), publish() returns
// silently after a single warn log per dropped event. Existing publish
// callers see no API shape change on success.
//
// Memory bound: one timestamp array per source; pruned on every publish.
// Worst case at cap=1000: ~16KB per source.
const RATE_CAP_PER_SOURCE_PER_HOUR = (function () {
  const raw = process.env.PERCEPTION_BUS_RATE_CAP_PER_SOURCE_PER_HOUR
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 1000
})()
const RATE_CAP_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const _rateCapBuckets = new Map() // source -> Array<timestamp_ms>

function _checkRateCap(source) {
  const now = Date.now()
  const cutoff = now - RATE_CAP_WINDOW_MS
  let arr = _rateCapBuckets.get(source)
  if (!arr) {
    arr = []
    _rateCapBuckets.set(source, arr)
  }
  // Prune timestamps older than 1h. Source-arrays should be naturally
  // monotonic so we can shift from the front.
  while (arr.length > 0 && arr[0] < cutoff) arr.shift()
  if (arr.length >= RATE_CAP_PER_SOURCE_PER_HOUR) return false
  arr.push(now)
  return true
}

// Belt-and-braces dispatcher self-init.
//
// Origin (5 May 2026, fork_moskfb4a_373983):
// The server.js boot block at lines 660-666 calls perceptionDispatcher.start()
// inside the server.listen() async callback. Empirically (24h window post 11:47
// UTC restart) ZERO `source = 'perception_dispatcher'` rows ever appeared in
// os_observations and ZERO `auto:*` rows ever appeared in status_board, despite
// dozens of fork_complete events and 8+ fork_error events that should have
// fired the error_escalation matcher. Direct node -e require + start works
// fine, so the dispatcher module itself is sound - the boot-block invocation
// is silently failing or being skipped.
//
// Fix: have perceptionBus self-bootstrap the dispatcher on first publish().
// publish() is called from listeners (forkComplete, factorySessionComplete,
// emailArrival, ccSessionsFailure, invoicePaymentState, statusBoardDrift) and
// from forkService directly, so first event after boot guarantees the
// dispatcher gets wired even when server.js boot block doesn't reach it.
//
// start() is idempotent (guarded by _started flag in perceptionDispatcher.js)
// so the explicit call from server.js stays safe; this just ensures
// subscription happens via either path.
// Audit 2026-05-13 P0 #31: this was permanently latched on first call.
// If `require('./perceptionDispatcher').start()` threw, _dispatcherEnsured
// stayed true and no retry was ever attempted — and the comment above
// already documented "ZERO `source = 'perception_dispatcher'` rows ever
// appeared." Now: retry up to N times with exponential backoff, surface a
// perception event when it gives up so the bus self-reports its own
// dispatcher-unwired state.
let _dispatcherStarted = false
let _dispatcherAttempts = 0
const _DISPATCHER_MAX_ATTEMPTS = 5
function _ensureDispatcher() {
  if (_dispatcherStarted) return
  if (_dispatcherAttempts >= _DISPATCHER_MAX_ATTEMPTS) return
  _dispatcherAttempts++
  try {
    require('./perceptionDispatcher').start()
    _dispatcherStarted = true
    if (_dispatcherAttempts > 1) {
      logger.info('perceptionBus: dispatcher autostart succeeded after retries', {
        attempts: _dispatcherAttempts,
      })
    }
  } catch (err) {
    logger.warn('perceptionBus: dispatcher autostart failed (will retry)', {
      attempt: _dispatcherAttempts,
      max: _DISPATCHER_MAX_ATTEMPTS,
      error: err.message,
    })
    if (_dispatcherAttempts >= _DISPATCHER_MAX_ATTEMPTS) {
      logger.error('perceptionBus: dispatcher autostart EXHAUSTED — matchers will not fire', {
        attempts: _dispatcherAttempts,
      })
      // Re-publish ourselves so the bus's own consumers see the broken state.
      // Use setImmediate so we don't recurse synchronously inside publish().
      setImmediate(() => {
        try {
          publish({
            source: 'perception_bus',
            kind: 'dispatcher_autostart_failed',
            data: { attempts: _dispatcherAttempts, last_error: err.message },
            confidence: 1.0,
          }).catch(() => {})
        } catch { /* swallow */ }
      })
    }
  }
}

async function publish({ source, kind, data, ts, confidence = 1.0 }) {
  if (!source || !kind) return

  // Per-source rate cap. Drops events from sources exceeding the rolling
  // 1h cap (default 1000/hr). Logged at warn so a runaway publisher
  // surfaces in the standard log stream + decision-quality telemetry.
  if (!_checkRateCap(source)) {
    logger.warn('perceptionBus: rate cap exceeded for source, dropping event', {
      source,
      kind,
      cap_per_hour: RATE_CAP_PER_SOURCE_PER_HOUR,
    })
    return
  }

  // Lazy-init the in-process dispatcher. First publish wires the matcher
  // subscription before this very event reaches the for-loop below.
  _ensureDispatcher()

  const observed_at = ts ? new Date(ts) : new Date()
  const event = { source, kind, data: data || null, confidence, observed_at }

  try {
    const rows = await db`
      INSERT INTO os_observations (source, kind, data, confidence, observed_at)
      VALUES (${source}, ${kind}, ${JSON.stringify(data || null)}, ${confidence}, ${observed_at})
      RETURNING id
    `
    event.id = rows[0]?.id
  } catch (err) {
    logger.warn('perceptionBus: failed to persist observation', { error: err.message, source, kind })
  }

  // Audit 2026-05-13 P0 #30: previously this catch only handled
  // SYNCHRONOUS throws. perceptionDispatcher._onEvent is async and
  // returned a promise that was detached — async rejections were
  // invisible. Now: also attach a .catch on the return value so async
  // failures surface as debug log lines. Subscribers are not awaited
  // (publish() returns before they finish, by design — we don't want to
  // block ingestion on slow matchers), but their rejections must not
  // float as unhandledPromiseRejection.
  for (const fn of _subscribers) {
    try {
      const ret = fn(event)
      if (ret && typeof ret.then === 'function') {
        ret.catch((err) => {
          logger.debug('perceptionBus: subscriber rejected (async)', { error: err && err.message })
        })
      }
    } catch (err) {
      logger.debug('perceptionBus: subscriber threw (sync)', { error: err.message })
    }
  }

  // Async promotion check - fire-and-forget but with visibility on failure.
  setImmediate(() => _tryPromote(event).catch(err =>
    logger.debug('perceptionBus: _tryPromote failed (non-fatal)', { error: err.message, eventId: event.id })
  ))

  return event
}

// Promotion policy: score 0-1 based on business relevance.
// > 0.6 → promote to Neo4j Episode node
// < 0.3 → ephemeral (auto-cleaned after 7 days by the prune cron)
// 0.3-0.6 → kept in os_observations for 7 days without promotion

function promotionScore(event) {
  let score = 0
  const kind = (event.kind || '').toLowerCase()
  const source = (event.source || '').toLowerCase()
  const data = event.data || {}

  // About a client? +0.4
  if (data.client_id || data.client_name || kind.includes('client') || kind.includes('crm')) {
    score += 0.4
  }

  // About money? +0.3
  if (kind.includes('invoice') || kind.includes('payment') || kind.includes('billing') ||
      kind.includes('transaction') || source === 'bookkeeper') {
    score += 0.3
  }

  // Error or incident? +0.4
  if (kind.includes('error') || kind.includes('incident') || kind.includes('failure') ||
      kind.includes('crash') || kind.includes('alert')) {
    score += 0.4
  }

  // Contradicts known fact? +0.3 (caller sets data.contradicts_known_fact)
  if (data.contradicts_known_fact) {
    score += 0.3
  }

  // Fork completion (routine) - low value
  if (kind === 'fork_complete' && data.status === 'done') {
    score = Math.max(score - 0.2, 0)
  }

  return Math.min(score, 1.0)
}

async function _tryPromote(event) {
  const score = promotionScore(event)
  if (score < 0.6 || !event.id) return

  try {
    const neo4j = require('./knowledgeGraphService')
    if (!neo4j || typeof neo4j.writeEpisode !== 'function') return

    const episodeTitle = `Observation: ${event.source}/${event.kind}`
    const nodeId = await neo4j.writeEpisode({
      title: episodeTitle,
      content: JSON.stringify(event.data || {}),
      source: `perceptionBus:${event.source}`,
      tags: [event.source, event.kind],
    })

    if (nodeId && event.id) {
      await db`
        UPDATE os_observations
        SET promoted_to_kg = true, kg_node_id = ${String(nodeId)}
        WHERE id = ${event.id}
      `.catch(err => logger.warn('perceptionBus: promoted_to_kg flag flip failed', {
        error: err.message, eventId: event.id, nodeId: String(nodeId),
      }))
    }
  } catch (err) {
    logger.debug('perceptionBus: promotion to KG failed (non-fatal)', { error: err.message })
  }
}

async function recentSummary(windowMinutes = 60) {
  try {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000)
    const rows = await db`
      SELECT source, kind, data, confidence, observed_at
      FROM os_observations
      WHERE observed_at > ${cutoff}
      ORDER BY observed_at DESC
      LIMIT 20
    `
    if (rows.length === 0) return null

    const lines = []
    const sourceCounts = {}
    for (const r of rows) {
      const src = r.source || 'unknown'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }

    // Header: source distribution
    const distParts = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s}(${c})`)
      .join(', ')
    lines.push(`Last ${windowMinutes}min: ${rows.length} events - ${distParts}`)

    // Notable events (high confidence or promoted)
    const notable = rows.filter(r => r.confidence >= 0.7 || promotionScore({ kind: r.kind, source: r.source, data: r.data }) >= 0.6)
    for (const r of notable.slice(0, 5)) {
      const ago = Math.round((Date.now() - new Date(r.observed_at).getTime()) / 60000)

      // Special-case rendering for fork_credit_exhaustion_observed: the raw
      // JSON snippet read as "the chain is exhausted" to the conductor, even
      // when the payload's chain_exhausted flag was false. Render lane truth
      // explicitly so the conductor cannot misread it. (12 May 2026 fix.)
      if (r.kind === 'fork_credit_exhaustion_observed' && r.data) {
        const d = r.data
        const exhausted = Array.isArray(d.exhausted_accounts) ? d.exhausted_accounts : []
        const healthy = Array.isArray(d.healthy_accounts) ? d.healthy_accounts : []
        const unknown = Array.isArray(d.unknown_accounts) ? d.unknown_accounts : []
        const active = d.active_provider || null
        if (d.chain_exhausted === true) {
          const resetTxt = d.earliest_reset_at
            ? ` Earliest reset ${new Date(d.earliest_reset_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit' })} AEST.`
            : ''
          lines.push(`  ${ago}m ago: ACCOUNT CHAIN EXHAUSTED — all lanes capped.${resetTxt} You may continue serving via DeepSeek fallback if enabled; defer non-urgent fork work.`)
        } else {
          const exhTxt = exhausted.length > 0 ? exhausted.join(',') : '(none reported capped)'
          const healthyTxt = healthy.length > 0 ? healthy.join(',') : '(none confirmed healthy)'
          const unknownTxt = unknown.length > 0 ? `; lanes with no headers yet: ${unknown.join(',')}` : ''
          const activeTxt = active ? `; you are currently serving via ${active}` : ''
          lines.push(`  ${ago}m ago: fork_credit_exhaustion: lane(s) ${exhTxt} capped, healthy: ${healthyTxt}${unknownTxt}${activeTxt}. NOT a system outage. If you are reading this you are running on a healthy lane.`)
        }
        continue
      }

      const snippet = r.data ? JSON.stringify(r.data).slice(0, 80) : ''
      lines.push(`  ${ago}m ago: ${r.source}/${r.kind} ${snippet}`)
    }

    const summary = lines.join('\n').slice(0, 500)
    return summary
  } catch (err) {
    logger.warn('perceptionBus.recentSummary failed', { error: err.message })
    return null
  }
}

async function prune(retentionDays = 7) {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const result = await db`
      DELETE FROM os_observations
      WHERE observed_at < ${cutoff}
        AND promoted_to_kg = false
      RETURNING id
    `
    const count = result.length
    if (count > 0) {
      logger.info('perceptionBus: pruned stale observations', { count, retention_days: retentionDays })
    }
    return count
  } catch (err) {
    logger.warn('perceptionBus.prune failed', { error: err.message })
    return 0
  }
}

module.exports = {
  publish,
  subscribe,
  recentSummary,
  prune,
  promotionScore,
  // C3 (fork_mosn8o5x_7a0e54): rate cap exposure for tests / observability.
  RATE_CAP_PER_SOURCE_PER_HOUR,
  _rateCapBuckets,
  _checkRateCap,
}

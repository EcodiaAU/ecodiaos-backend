'use strict'

/**
 * perceptionDispatcher - active dispatch layer for the perception bus.
 *
 * The perception bus (perceptionBus.js) records events. This module ACTS on them.
 * Every message flowing through the OS (conductor turns, fork output, cron results)
 * publishes to the bus. This dispatcher subscribes to it and, for events that
 * match a domain pattern, triggers lightweight actions:
 *
 * - Finance mentions → check status_board for financial tasks, update bookkeeping context
 * - Status board references → verify tracking state matches reality
 * - Client/CRM mentions → surface relevant CRM intelligence into next turn
 * - Task completions → auto-archive status_board rows, schedule follow-ups
 * - Error patterns → auto-create status_board P1 rows, fire alerts
 *
 * Design:
 * - ZERO extra token cost: no LLM calls. Pure regex + DB lookups.
 * - Forks get this for free: they publish to the same bus, same dispatcher reacts.
 * - Fire-and-forget: dispatch failures never block the publishing stream.
 * - Dedupe: same event pattern within a 5min window → skip.
 *
 * This replaces the need for N parallel listener chats that each burn a full
 * Claude session per domain. One in-process dispatcher, infinite domains.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const perceptionBus = require('./perceptionBus')

// ── Dedupe window ──────────────────────────────────────────────────────────
// Default per-matcher dedupe window. Each matcher object can override via
// optional `dedupeWindowMs` property. High-volume matchers (fork_phantom_bail)
// shrink to 60s; low-volume cadence-driven matchers (status_board_priority_inversion)
// stretch to 24h. C3 (fork_mosn8o5x_7a0e54) per-matcher dedupe window fix.
const DEFAULT_DEDUPE_WINDOW_MS = 5 * 60 * 1000
// Legacy export retained for callers/tests that still reference DEDUPE_WINDOW_MS.
const DEDUPE_WINDOW_MS = DEFAULT_DEDUPE_WINDOW_MS
const _recentDispatches = new Map() // key → timestamp

// Largest configured dedupe window across MATCHERS - used for prune cutoff.
let _maxDedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS

// Credit-exhaustion abort_reason regex (8 May 2026, fork_moxvsqee_e29694).
// Per ~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md, fork errors
// caused by Claude Max weekly-cap exhaustion are operational events that
// resolve when the cap resets. They are NOT generic fork_error escalations
// and must not auto-create P1 status_board rows. The error_escalation matcher
// dispatch path looks up fork.abort_reason on fork_error/fork_aborted events
// and short-circuits to a P3 telemetry event when this regex matches.
//
// Coverage (sampled from production os_forks rows, 8 May 2026):
//   - "Claude Code returned an error result: You're out of extra usage · resets May 12, 11am (UTC)"
//   - "Claude Code returned an error result: You're out of extra usage · resets 8:10am (UTC)"
//   - "credit exhaust" / "credit_exhaust" / "credit-exhaust" (defensive variants)
const CREDIT_EXHAUSTION_REGEX = /out of extra usage|credit.exhaust|reset.*UTC/i

// Credential-redaction-burst observation-only set (12 May 2026, fork_mp1ko80h_9537fa).
// Per securityIncidentResponse.js §OBSERVATION_ONLY, credential_redaction_burst
// events are the redaction system working correctly: credentials appearing in
// output streams are intercepted and removed. They are NOT security breaches.
// The security_incident matcher receives these because securityIncidentResponse
// publishes to perceptionBus with source='security_incident', which the matcher
// catches on its broad source-based predicate (source === 'security_incident').
// Without this short-circuit, every fork output redaction auto-creates a P1 row.
//
// Unlike the credit_exhaustion short-circuit in error_escalation, no DB lookup is
// needed: event.kind itself is the discriminant - securityIncidentResponse sets
// kind = incident_class = 'credential_redaction_burst' on publish.
const CREDENTIAL_REDACTION_OBSERVATION_KINDS = Object.freeze(['credential_redaction_burst'])

// ── Per-matcher counters (B3: listener-stats endpoint) ─────────────────────
// In-memory since process boot. Surfaced at /api/ops/listener-stats.
// Conductor reads these in BP4 / drift detection: matcher silent for 1h+ =
// publisher gap or matcher logic regression.
const _stats = {
  matcher_fires: new Map(),       // domain → count of dispatch() calls (post-dedupe)
  matcher_test_passes: new Map(), // domain → count of test() === true (pre-dedupe)
  matcher_dedupes: new Map(),     // domain → count of dedupe-suppressed
  matcher_errors: new Map(),      // domain → count of test/dispatch throws
  bus_events_in: 0,                // total _onEvent invocations
}
function _bump(map, key) { map.set(key, (map.get(key) || 0) + 1) }

// Per-matcher dedupe check. windowMs defaults to DEFAULT_DEDUPE_WINDOW_MS.
// Backward-compatible: callers passing only a key still get default window.
function _shouldDispatch(key, windowMs) {
  const w = typeof windowMs === 'number' && windowMs > 0 ? windowMs : DEFAULT_DEDUPE_WINDOW_MS
  const last = _recentDispatches.get(key)
  if (last && Date.now() - last < w) return false
  _recentDispatches.set(key, Date.now())
  // Prune old entries every 100 inserts. Cutoff uses the LARGEST configured
  // matcher window so we never evict an entry still inside its own window.
  if (_recentDispatches.size > 200) {
    const cutoff = Date.now() - _maxDedupeWindowMs
    for (const [k, ts] of _recentDispatches) {
      if (ts < cutoff) _recentDispatches.delete(k)
    }
  }
  return true
}

// ── Domain matchers ────────────────────────────────────────────────────────
// Each matcher: { domain, test(event) → boolean, dispatch(event) → Promise<void> }

const MATCHERS = [
  {
    domain: 'finance',
    // 5 min default - finance events are routine but bursty around invoice cycles.
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const dataStr = (event.data_str || JSON.stringify(event.data || {})).toLowerCase()
      return kind.includes('invoice') || kind.includes('payment') ||
             kind.includes('billing') || kind.includes('transaction') ||
             kind.includes('receipt') || kind.includes('expense') ||
             dataStr.includes('invoice') || dataStr.includes('payment') ||
             dataStr.includes('stripe') || dataStr.includes('xero')
    },
    async dispatch(event) {
      // Surface finance context: check if there's a relevant status_board financial row
      try {
        const rows = await db`
          SELECT id, name, status, next_action FROM status_board
          WHERE entity_type = 'finance'
            AND archived_at IS NULL
            AND (next_action_by = 'ecodiaos' OR next_action_by IS NULL)
          ORDER BY priority ASC
          LIMIT 3
        `
        if (rows.length > 0) {
          // Publish a derived event so the conductor's next turn sees it in perception_summary
          await perceptionBus.publish({
            source: 'perception_dispatcher',
            kind: 'finance_context_surfaced',
            data: {
              trigger_event: `${event.source}/${event.kind}`,
              active_finance_tasks: rows.map(r => ({ id: r.id, name: r.name, status: r.status, next: r.next_action })),
            },
            confidence: 0.8,
          })
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: finance dispatch failed', { error: err.message })
      }
    },
  },

  {
    domain: 'status_board',
    // 5 min default - status_board references are spread across many event sources;
    // dedupe at source/kind grain.
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      const dataStr = (event.data_str || JSON.stringify(event.data || {})).toLowerCase()
      return (event.kind || '').includes('status_board') ||
             dataStr.includes('status_board') ||
             dataStr.includes('shipped') || dataStr.includes('blocked')
    },
    async dispatch(event) {
      // When something references status_board, check for stale rows that might need updating
      try {
        const stale = await db`
          SELECT id, name, status, next_action_due FROM status_board
          WHERE archived_at IS NULL
            AND next_action_due IS NOT NULL
            AND next_action_due < NOW()
          ORDER BY priority ASC
          LIMIT 5
        `
        if (stale.length > 0) {
          await perceptionBus.publish({
            source: 'perception_dispatcher',
            kind: 'overdue_status_board_items',
            data: {
              trigger_event: `${event.source}/${event.kind}`,
              overdue_count: stale.length,
              items: stale.map(r => ({ id: r.id, name: r.name, due: r.next_action_due })),
            },
            confidence: 0.9,
          })
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: status_board dispatch failed', { error: err.message })
      }
    },
  },

  {
    domain: 'crm',
    // 5 min default - client mentions can spike during a delivery push;
    // dedupe per source/kind to avoid surfacing the same intelligence pack repeatedly.
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const dataStr = (event.data_str || JSON.stringify(event.data || {})).toLowerCase()
      return kind.includes('client') || kind.includes('crm') ||
             dataStr.includes('client_id') || dataStr.includes('client_name')
    },
    async dispatch(event) {
      // When a client is mentioned, check CRM for recent activity
      const clientId = event.data?.client_id
      if (!clientId) return
      try {
        const activity = await db`
          SELECT id, type, summary, created_at FROM crm_activities
          WHERE client_id = ${clientId}
          ORDER BY created_at DESC
          LIMIT 3
        `
        if (activity.length > 0) {
          await perceptionBus.publish({
            source: 'perception_dispatcher',
            kind: 'crm_context_surfaced',
            data: {
              client_id: clientId,
              recent_activity: activity.map(a => ({ type: a.type, summary: a.summary, at: a.created_at })),
            },
            confidence: 0.7,
          })
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: crm dispatch failed', { error: err.message })
      }
    },
  },

  {
    domain: 'error_escalation',
    // 5 min default - bursts of errors usually share root cause, dedupe is desirable;
    // error_escalation already does name-based dedupe at the status_board layer.
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      return kind.includes('error') || kind.includes('crash') ||
             kind.includes('failure') || kind.includes('timeout') ||
             event.confidence >= 0.9 && kind.includes('alert')
    },
    async dispatch(event) {
      // Credit-exhaustion short-circuit (8 May 2026, fork_moxvsqee_e29694).
      // Per ~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md, fork
      // errors carrying credit-exhaustion abort_reason text are NOT doctrine
      // failures and must NOT auto-create P1 status_board rows. Look up the
      // fork's abort_reason on fork_error/fork_aborted events and re-route
      // to a P3 telemetry event when the regex matches. On lookup failure or
      // missing abort_reason, fall through to the generic escalation path
      // (preserves existing behaviour for genuine fork errors).
      const kindLc = (event.kind || '').toLowerCase()
      const isForkTerminalFailure = kindLc === 'fork_error' || kindLc === 'fork_aborted'
      if (isForkTerminalFailure) {
        const forkId = event.data?.fork_id
        if (forkId) {
          try {
            const r = await db`
              SELECT abort_reason FROM os_forks WHERE fork_id = ${forkId} LIMIT 1
            `
            const abortReason = r && r[0] && r[0].abort_reason
            if (abortReason && CREDIT_EXHAUSTION_REGEX.test(abortReason)) {
              try {
                await perceptionBus.publish({
                  source: 'perception_dispatcher',
                  kind: 'fork_credit_exhaustion_observed',
                  data: {
                    fork_id: forkId,
                    abort_reason: String(abortReason).slice(0, 200),
                    original_kind: event.kind,
                  },
                  confidence: 0.6,
                })
              } catch (err) {
                logger.debug('perceptionDispatcher: credit_exhaustion publish failed', { error: err.message })
              }
              return // skip P1 status_board insert
            }
          } catch (err) {
            // Lookup failure is non-fatal: fall through to generic escalation.
            logger.debug('perceptionDispatcher: credit_exhaustion lookup failed', { error: err.message })
          }
        }
      }

      // Auto-create or update a status_board P1 row for persistent errors
      const name = `auto: ${event.source}/${event.kind}`
      try {
        const existing = await db`
          SELECT id FROM status_board
          WHERE name = ${name} AND archived_at IS NULL
          LIMIT 1
        `
        if (existing.length === 0) {
          await db`
            INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source)
            VALUES (
              ${name},
              'infrastructure',
              'investigating',
              1,
              ${'Auto-created from perception bus event. Review and resolve.'},
              'ecodiaos',
              'perception_dispatcher'
            )
          `
          logger.info('perceptionDispatcher: auto-created P1 status_board row for error', {
            name, source: event.source, kind: event.kind,
          })
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: error_escalation dispatch failed', { error: err.message })
      }
    },
  },

  {
    domain: 'task_completion',
    // 5 min default - fork_complete events with structured next_step are infrequent.
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      return event.kind === 'fork_complete' && event.data?.status === 'done' && event.data?.next_step
    },
    async dispatch(event) {
      // When a fork completes with a next_step that mentions scheduling, auto-schedule
      const nextStep = event.data.next_step || ''
      if (/schedule|cron|delay|follow.?up|monitor/i.test(nextStep)) {
        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'followup_scheduling_suggested',
          data: {
            fork_id: event.data.fork_id,
            next_step: nextStep,
            suggestion: 'A completed fork suggested a follow-up that may need scheduling',
          },
          confidence: 0.7,
        })
      }
    },
  },

  {
    // 6th matcher (5 May 2026): auth/security incidents auto-create P1
    // status_board rows and fire securityIncidentResponse if the signal is
    // strong. Listens for cred-rotation events, OAuth invalidations, RLS
    // violations, signed-URL leaks, suspicious-login signals, vault-secret
    // mutations, and HMAC verification failures. Same shape as error_escalation
    // (status_board P1 + dedupe), but security gets a dedicated domain so the
    // signals route through the security-incident pipeline if available.
    domain: 'security_incident',
    // 5 min default - security signals are LOW-FREQUENCY but we explicitly do NOT
    // want long suppression windows here: any new security event after 5 min should
    // re-fire the matcher (status_board name-dedupe still prevents row duplicates).
    dedupeWindowMs: 5 * 60 * 1000,
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const source = (event.source || '').toLowerCase()
      const dataStr = (event.data_str || JSON.stringify(event.data || {})).toLowerCase()
      // Source-based: canonical security publishes from securityIncidentResponse
      // (5 May 2026 fix - closes the fireIncident → matcher loop).
      if (source === 'security' || source === 'security_incident') return true
      // Strong-signal kinds first (high precision):
      if (/auth_(fail|denied|invalid)|oauth_(expired|invalid|revoked)|cred(_| )?rotat|rls_violation|hmac_(fail|invalid)|tier3_gate_denied|signature_(fail|invalid)/i.test(kind)) return true
      // Lower-precision data-string match (catches free-form telemetry):
      return /unauthorized|suspicious[_ ]login|leaked[_ ]secret|vault[_ ]secret/i.test(dataStr)
    },
    async dispatch(event) {
      // credential_redaction_burst short-circuit (12 May 2026, fork_mp1ko80h_9537fa).
      // Per securityIncidentResponse.js OBSERVATION_ONLY set, credential_redaction_burst
      // is the redaction system working correctly (credentials in output streams get
      // intercepted before reaching Tate). It must NOT auto-create P1 status_board rows.
      // Unlike credit_exhaustion in error_escalation, no DB lookup is needed: event.kind
      // is the discriminant (securityIncidentResponse publishes kind = incident_class).
      // On publish failure, log debug and return - never fall through to P1 insert.
      const kindLc = (event.kind || '').toLowerCase()
      if (CREDENTIAL_REDACTION_OBSERVATION_KINDS.includes(kindLc)) {
        try {
          await perceptionBus.publish({
            source: 'perception_dispatcher',
            kind: 'credential_redaction_burst_observed',
            data: {
              trigger_source: event.data?.trigger_source,
              incident_id: event.data?.incident_id,
              original_kind: event.kind,
            },
            confidence: 0.4,
          })
        } catch (err) {
          logger.debug('perceptionDispatcher: credential_redaction_burst publish failed', { error: err.message })
        }
        return // skip P1 status_board insert
      }

      const name = `auto: security/${event.source}/${event.kind}`
      try {
        const existing = await db`
          SELECT id FROM status_board
          WHERE name = ${name} AND archived_at IS NULL
          LIMIT 1
        `
        if (existing.length === 0) {
          await db`
            INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
            VALUES (
              ${name},
              'infrastructure',
              'investigating',
              1,
              ${'Auto-created from perception bus security event. Investigate immediately.'},
              'ecodiaos',
              'perception_dispatcher',
              ${JSON.stringify({ event_source: event.source, event_kind: event.kind, confidence: event.confidence }).slice(0, 4000)}
            )
          `
          logger.warn('perceptionDispatcher: auto-created P1 status_board row for security event', {
            name, source: event.source, kind: event.kind, confidence: event.confidence,
          })
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: security_incident dispatch failed', { error: err.message })
      }
    },
  },

  // ── 9 new matchers (Wave B B1, fork_mosmjqi4_20c41a, 5 May 2026) ──────────
  // Per W2 listener gap analysis. Each matcher loaded as a standalone module
  // in src/services/matchers/. Closure-style: each module requires its own
  // db/logger/perceptionBus and exports { domain, test, dispatch }. Three
  // (deploy_event, stripe_event, doctrine_authored) are GATED on Wave C
  // publishers - they registered live but won't fire until Wave C ships
  // their event sources. The other six fire immediately on existing
  // event sources or timer-driven scans.
  require('./matchers/clientMention'),
  require('./matchers/scheduleDrift'),
  require('./matchers/forkPhantomBail'),
  require('./matchers/deployEvent'),                 // GATED on Wave C: vercel webhook publisher
  require('./matchers/stripeEvent'),                 // GATED on Wave C: stripe webhook publisher
  require('./matchers/calendarEventImminent'),
  require('./matchers/doctrineAuthored'),            // GATED on Wave C: fs-watcher publisher
  require('./matchers/statusBoardPriorityInversion'),
  require('./matchers/kvStoreHandoffAged'),
]

// Compute the largest dedupe window across all MATCHERS once at module load.
// Prune cutoff in _shouldDispatch uses this so an entry from the longest-window
// matcher (e.g. status_board_priority_inversion 24h) is never evicted while
// still inside its window.
;(function _computeMaxDedupeWindow() {
  let max = DEFAULT_DEDUPE_WINDOW_MS
  for (const m of MATCHERS) {
    const w = typeof m.dedupeWindowMs === 'number' ? m.dedupeWindowMs : DEFAULT_DEDUPE_WINDOW_MS
    if (w > max) max = w
  }
  _maxDedupeWindowMs = max
})()

// ── Core subscriber ────────────────────────────────────────────────────────

/**
 * safeDispatch - single-matcher trampoline. Wraps test + dedupe + dispatch in
 * try/catch so a slow/throwing matcher never delays or kills its siblings.
 *
 * Dedupe-check happens BEFORE the fire-counter bumps and BEFORE dispatch fires.
 * Returns a Promise that resolves whether the matcher fired, deduped, errored,
 * or was a test-miss; never rejects.
 *
 * C3 (fork_mosn8o5x_7a0e54): per-matcher dedupe window + Promise.all parallelism.
 */
async function safeDispatch(matcher, event) {
  try {
    if (!matcher.test(event)) return
    _bump(_stats.matcher_test_passes, matcher.domain)
    const dedupeKey = `${matcher.domain}:${event.source}:${event.kind}`
    const windowMs = typeof matcher.dedupeWindowMs === 'number'
      ? matcher.dedupeWindowMs
      : DEFAULT_DEDUPE_WINDOW_MS
    if (!_shouldDispatch(dedupeKey, windowMs)) {
      _bump(_stats.matcher_dedupes, matcher.domain)
      return
    }
    _bump(_stats.matcher_fires, matcher.domain)
    try {
      await matcher.dispatch(event)
    } catch (err) {
      _bump(_stats.matcher_errors, matcher.domain)
      logger.debug('perceptionDispatcher: async dispatch error', {
        domain: matcher.domain, error: err.message,
      })
    }
  } catch (err) {
    _bump(_stats.matcher_errors, matcher.domain)
    logger.debug('perceptionDispatcher: matcher error', {
      domain: matcher.domain, error: err.message,
    })
  }
}

function _onEvent(event) {
  _stats.bus_events_in++
  // Pre-tokenise event payload once per event. Matchers that grep over data
  // (finance/status_board/crm/security_incident/client_mention) can read
  // `event.data_str` instead of re-stringifying. W3 §2.7 / Fix 07.
  // Additive: matchers that haven't been adapted still call JSON.stringify
  // themselves and continue to work. data_str is a single canonical
  // (non-lowercased) string - matchers that need lowercase still call
  // .toLowerCase() locally.
  if (!event.data_str) {
    try {
      event.data_str = JSON.stringify(event.data || {})
    } catch {
      event.data_str = ''
    }
  }
  // Promise.all parallelism: a slow matcher only delays its own slot, never
  // its siblings. safeDispatch swallows all errors so Promise.all never
  // rejects and the publishing stream is never blocked.
  // Note: caller does NOT await this - fire-and-forget by design.
  return Promise.all(MATCHERS.map(matcher => safeDispatch(matcher, event)))
}

// ── Init (called once at boot) ─────────────────────────────────────────────

let _started = false

function start() {
  if (_started) return
  perceptionBus.subscribe(_onEvent)
  _started = true
  logger.info('perceptionDispatcher: started', { matchers: MATCHERS.map(m => m.domain) })
}

module.exports = {
  start,
  MATCHERS,
  _onEvent,
  _shouldDispatch,
  _recentDispatches,
  _stats,
  safeDispatch,
  DEFAULT_DEDUPE_WINDOW_MS,
  CREDIT_EXHAUSTION_REGEX,
  CREDENTIAL_REDACTION_OBSERVATION_KINDS,
}

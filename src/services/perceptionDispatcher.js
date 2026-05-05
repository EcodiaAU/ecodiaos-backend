'use strict'

/**
 * perceptionDispatcher — active dispatch layer for the perception bus.
 *
 * The perception bus (perceptionBus.js) records events. This module ACTS on them.
 * Every message flowing through the OS (conductor turns, fork output, cron results)
 * publishes to the bus. This dispatcher subscribes to it and, for events that
 * match a domain pattern, triggers lightweight actions:
 *
 *   - Finance mentions → check status_board for financial tasks, update bookkeeping context
 *   - Status board references → verify tracking state matches reality
 *   - Client/CRM mentions → surface relevant CRM intelligence into next turn
 *   - Task completions → auto-archive status_board rows, schedule follow-ups
 *   - Error patterns → auto-create status_board P1 rows, fire alerts
 *
 * Design:
 *   - ZERO extra token cost: no LLM calls. Pure regex + DB lookups.
 *   - Forks get this for free: they publish to the same bus, same dispatcher reacts.
 *   - Fire-and-forget: dispatch failures never block the publishing stream.
 *   - Dedupe: same event pattern within a 5min window → skip.
 *
 * This replaces the need for N parallel listener chats that each burn a full
 * Claude session per domain. One in-process dispatcher, infinite domains.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const perceptionBus = require('./perceptionBus')

// ── Dedupe window ──────────────────────────────────────────────────────────
const DEDUPE_WINDOW_MS = 5 * 60 * 1000
const _recentDispatches = new Map() // key → timestamp

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

function _shouldDispatch(key) {
  const last = _recentDispatches.get(key)
  if (last && Date.now() - last < DEDUPE_WINDOW_MS) return false
  _recentDispatches.set(key, Date.now())
  // Prune old entries every 100 inserts
  if (_recentDispatches.size > 200) {
    const cutoff = Date.now() - DEDUPE_WINDOW_MS
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
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const dataStr = JSON.stringify(event.data || {}).toLowerCase()
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
    test(event) {
      const dataStr = JSON.stringify(event.data || {}).toLowerCase()
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
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const dataStr = JSON.stringify(event.data || {}).toLowerCase()
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
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      return kind.includes('error') || kind.includes('crash') ||
             kind.includes('failure') || kind.includes('timeout') ||
             event.confidence >= 0.9 && kind.includes('alert')
    },
    async dispatch(event) {
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
    test(event) {
      const kind = (event.kind || '').toLowerCase()
      const source = (event.source || '').toLowerCase()
      const dataStr = JSON.stringify(event.data || {}).toLowerCase()
      // Source-based: canonical security publishes from securityIncidentResponse
      // (5 May 2026 fix — closes the fireIncident → matcher loop).
      if (source === 'security' || source === 'security_incident') return true
      // Strong-signal kinds first (high precision):
      if (/auth_(fail|denied|invalid)|oauth_(expired|invalid|revoked)|cred(_| )?rotat|rls_violation|hmac_(fail|invalid)|tier3_gate_denied|signature_(fail|invalid)/i.test(kind)) return true
      // Lower-precision data-string match (catches free-form telemetry):
      return /unauthorized|suspicious[_ ]login|leaked[_ ]secret|vault[_ ]secret/i.test(dataStr)
    },
    async dispatch(event) {
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
]

// ── Core subscriber ────────────────────────────────────────────────────────

function _onEvent(event) {
  _stats.bus_events_in++
  for (const matcher of MATCHERS) {
    try {
      if (!matcher.test(event)) continue
      _bump(_stats.matcher_test_passes, matcher.domain)
      const dedupeKey = `${matcher.domain}:${event.source}:${event.kind}`
      if (!_shouldDispatch(dedupeKey)) {
        _bump(_stats.matcher_dedupes, matcher.domain)
        continue
      }
      _bump(_stats.matcher_fires, matcher.domain)
      // Fire-and-forget — never block the publishing stream
      matcher.dispatch(event).catch(err => {
        _bump(_stats.matcher_errors, matcher.domain)
        logger.debug('perceptionDispatcher: async dispatch error', {
          domain: matcher.domain, error: err.message,
        })
      })
    } catch (err) {
      _bump(_stats.matcher_errors, matcher.domain)
      logger.debug('perceptionDispatcher: matcher error', {
        domain: matcher.domain, error: err.message,
      })
    }
  }
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
}

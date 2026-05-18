'use strict'

/**
 * perceptionDispatcher matcher: client_mention
 *
 * Source: drafts/proposed-matchers/client_mention.js (W2 listener gap analysis).
 * Adapted to closure-style for ecodiaos perceptionDispatcher convention.
 *
 * Wider net than the existing `crm` matcher: existing one requires
 * data.client_id (structured); this one regex-matches free text + dataStr
 * (unstructured). Surfaces a CRM intelligence pack into the conductor's
 * next-turn context when ANY perception event mentions an active client.
 *
 * Dedupe: per-domain key in dispatcher's _shouldDispatch already includes
 * source+kind. The 5min window prevents floods.
 *
 * Fires immediately on next pm2 restart - depends only on existing event
 * sources (fork output, factory session prompts, email kinds, etc).
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

// Active client patterns. Hardcoded for v1; future iteration loads from
// SELECT slug, name FROM clients WHERE archived_at IS NULL on a 60min cadence.
// [redacted] archived 2026-05-17, swept from matcher 2026-05-18. See pattern:
// archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18.md.
// Wildmountains added 2026-05-18 (verbally locked as Ecodia dev shop).
// Goodreach + Sidequests added 2026-05-18 as active pipeline.
const _activeClients = [
  { slug: 'coexist',       name: 'Co-Exist',       pattern: /\b(co[-_ ]?exist|coexist|kurt(?!\s+vonnegut))\b/i },
  { slug: 'roam',          name: 'Roam',           pattern: /\broam\b/i },
  { slug: 'resonaverde',   name: 'Resonaverde',    pattern: /\b(resonaverde|angelica)\b/i },
  { slug: 'wildmountains', name: 'Wildmountains',  pattern: /\b(wild[-_ ]?mountains?|ACEL|fellowship)\b/i },
  { slug: 'goodreach',     name: 'Goodreach',      pattern: /\bgoodreach\b/i },
  { slug: 'sidequests',    name: 'Sidequests',     pattern: /\bside[-_ ]?quests?\b/i },
  { slug: 'landcare',      name: 'Landcare',       pattern: /\blandcare\b/i },
  { slug: 'cetin',         name: 'CETIN',          pattern: /\bcetin\b/i },
]

module.exports = {
  domain: 'client_mention',

  // 5 min default - same as crm matcher; client mentions can spike during
  // delivery pushes. Per-source/kind dedupe at this grain is appropriate.
  // C3 (fork_mosn8o5x_7a0e54).
  dedupeWindowMs: 5 * 60 * 1000,

  test(event) {
    // Use pre-tokenised event.data_str (set in perceptionDispatcher._onEvent)
    // when available to avoid re-stringifying per matcher. Fallback to inline
    // stringify so the matcher is independently testable.
    const text = `${event.kind || ''} ${event.data_str || JSON.stringify(event.data || {})}`
    return _activeClients.some(c => c.pattern.test(text))
  },

  async dispatch(event) {
    const text = `${event.kind || ''} ${event.data_str || JSON.stringify(event.data || {})}`
    const hit = _activeClients.find(c => c.pattern.test(text))
    if (!hit) return

    try {
      const clientRows = await db`
        SELECT id, name, status, notes
        FROM clients
        WHERE LOWER(name) LIKE ${`%${hit.slug}%`} OR LOWER(slug) = ${hit.slug.toLowerCase()}
        LIMIT 1
      `
      const client = clientRows[0]
      if (!client) return

      const activity = await db`
        SELECT type, summary, created_at
        FROM crm_activities
        WHERE client_id = ${client.id}
        ORDER BY created_at DESC
        LIMIT 3
      `.catch(() => [])

      const openInvoices = await db`
        SELECT invoice_number, total_cents, status
        FROM invoices
        WHERE LOWER(client_name) LIKE ${`%${hit.slug}%`}
          AND status NOT IN ('paid', 'void', 'cancelled')
        LIMIT 5
      `.catch(() => [])

      const statusBoardRows = await db`
        SELECT id, name, status, next_action, next_action_by, priority
        FROM status_board
        WHERE entity_type = 'client'
          AND archived_at IS NULL
          AND LOWER(name) LIKE ${`%${hit.slug}%`}
        ORDER BY priority ASC
        LIMIT 3
      `.catch(() => [])

      await perceptionBus.publish({
        source: 'perception_dispatcher',
        kind: 'client_intelligence_surfaced',
        data: {
          trigger_event: `${event.source}/${event.kind}`,
          client_slug: hit.slug,
          client_name: client.name,
          client_status: client.status,
          recent_activity: activity.map(a => ({ type: a.type, summary: a.summary, at: a.created_at })),
          open_invoices_count: openInvoices.length,
          open_invoices: openInvoices.map(i => ({ num: i.invoice_number, total: i.total_cents, status: i.status })),
          active_board_rows: statusBoardRows.map(r => ({ id: r.id, name: r.name, next: r.next_action, by: r.next_action_by, priority: r.priority })),
        },
        confidence: 0.7,
      })
    } catch (err) {
      logger.debug('perceptionDispatcher: client_mention dispatch failed', { error: err.message })
    }
  },
}

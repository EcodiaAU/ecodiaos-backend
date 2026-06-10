'use strict'

/**
 * Proposed perceptionDispatcher matcher: client_mention
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * When ANY perception event mentions an active client (Ordit/Co-Exist/Roam/etc)
 * by name, surface a CRM intelligence pack into the conductor's next-turn
 * context. Catches free-text mentions in fork output, email kinds, and
 * factory session prompts that the existing `crm` matcher misses (which
 * only fires when data.client_id is present — most events lack that field).
 *
 * Wider net than existing crm matcher:
 *   - existing crm matcher: requires data.client_id (structured)
 *   - this matcher:        regex match against free text + dataStr (unstructured)
 *
 * Refresh interval: dedupe per-client over 15min (DEDUPE_WINDOW already 5min
 * in dispatcher; dedupe key includes client_slug so same client only re-surfaces
 * once per window).
 */

module.exports = {
  domain: 'client_mention',

  // Loaded at start() time from active CRM rows (clients table). Refreshed
  // every 60min by the dispatcher's existing _shouldDispatch sweep cadence.
  // For draft purposes, hardcode the active set; in the live cut, pull from
  // SELECT slug, name FROM clients WHERE archived_at IS NULL AND status NOT
  // IN ('archived', 'lost').
  _activeClients: [
    { slug: 'ordit',     name: 'Ordit',     pattern: /\b(ordit|fireauditors|spatial[-_ ]?compliance|craige|ekerner)\b/i },
    { slug: 'coexist',   name: 'Co-Exist',  pattern: /\b(co[-_ ]?exist|coexist|kurt)\b/i },
    { slug: 'roam',      name: 'Roam',      pattern: /\broam\b/i },
    { slug: 'resonaverde', name: 'Resonaverde', pattern: /\b(resonaverde|angelica)\b/i },
    { slug: 'landcare',  name: 'Landcare',  pattern: /\blandcare\b/i },
    { slug: 'cetin',     name: 'CETIN',     pattern: /\bcetin\b/i },
  ],

  test(event) {
    const text = `${event.kind || ''} ${JSON.stringify(event.data || {})}`
    return this._activeClients.some(c => c.pattern.test(text))
  },

  async dispatch(event, ctx) {
    const text = `${event.kind || ''} ${JSON.stringify(event.data || {})}`
    const hit = this._activeClients.find(c => c.pattern.test(text))
    if (!hit) return

    const db = ctx.db
    const perceptionBus = ctx.perceptionBus

    try {
      // Pull recent CRM activity + open invoices + project status in one shot
      const [client] = await db`
        SELECT id, name, status, notes
        FROM clients
        WHERE LOWER(name) LIKE ${`%${hit.slug}%`} OR LOWER(slug) = ${hit.slug.toLowerCase()}
        LIMIT 1
      `
      if (!client) return

      const activity = await db`
        SELECT type, summary, created_at
        FROM crm_activities
        WHERE client_id = ${client.id}
        ORDER BY created_at DESC
        LIMIT 3
      `
      const openInvoices = await db`
        SELECT invoice_number, total_cents, status
        FROM invoices
        WHERE LOWER(client_name) LIKE ${`%${hit.slug}%`}
          AND status NOT IN ('paid', 'void', 'cancelled')
        LIMIT 5
      `
      const statusBoardRows = await db`
        SELECT id, name, status, next_action, next_action_by, priority
        FROM status_board
        WHERE entity_type = 'client'
          AND archived_at IS NULL
          AND LOWER(name) LIKE ${`%${hit.slug}%`}
        ORDER BY priority ASC
        LIMIT 3
      `

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
      // dispatcher logger handles
    }
  },
}

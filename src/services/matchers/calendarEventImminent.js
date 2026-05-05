'use strict'

/**
 * perceptionDispatcher matcher: calendar_event_imminent
 *
 * Source: drafts/proposed-matchers/calendar_event_imminent.js (W2 gap analysis).
 * Adapted to closure-style.
 *
 * Fires on heartbeat-class events (cron, meta_loop, turn_end). Queries
 * calendar_events for events in next 30min. Surfaces attendees + linked
 * CRM context so Tate doesn't walk into a meeting without prep. Critical
 * for client calls.
 *
 * Cadence: dedupe per event_id over 60min so we don't re-fire every cron tick.
 *
 * Fires immediately on pm2 restart.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

const _surfacedEvents = new Map() // event_id -> ts

module.exports = {
  domain: 'calendar_event_imminent',

  // 60min — fires on heartbeat-class events; per-event in-mem dedupe already
  // enforces 1h quiet windows per calendar event, so dispatcher-level 1h matches.
  // C3 (fork_mosn8o5x_7a0e54).
  dedupeWindowMs: 60 * 60 * 1000,

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind.includes('cron') ||
           kind.includes('heartbeat') ||
           kind.includes('turn_end') ||
           kind === 'meta_loop'
  },

  async dispatch(event) {
    try {
      const upcoming = await db`
        SELECT event_id, summary, start_time, end_time, attendees, location, description
        FROM calendar_events
        WHERE start_time > NOW()
          AND start_time < NOW() + INTERVAL '30 minutes'
          AND status != 'cancelled'
        ORDER BY start_time ASC
        LIMIT 5
      `
      if (upcoming.length === 0) return

      const now = Date.now()
      const ONE_HOUR = 60 * 60 * 1000

      for (const evt of upcoming) {
        const last = _surfacedEvents.get(evt.event_id)
        if (last && (now - last) < ONE_HOUR) continue
        _surfacedEvents.set(evt.event_id, now)

        let correlatedClient = null
        try {
          const attendeeEmails = (evt.attendees || []).map(a => a?.email).filter(Boolean)
          if (attendeeEmails.length > 0) {
            const rows = await db`
              SELECT id, name, status
              FROM clients
              WHERE archived_at IS NULL
                AND (
                  email = ANY(${attendeeEmails})
                  OR contact_email = ANY(${attendeeEmails})
                )
              LIMIT 1
            `
            correlatedClient = rows[0] || null
          }
        } catch (err) {
          logger.debug('perceptionDispatcher: calendar attendee correlation failed', { error: err.message })
        }

        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'calendar_event_imminent',
          data: {
            event_id: evt.event_id,
            summary: evt.summary,
            start_time: evt.start_time,
            end_time: evt.end_time,
            attendees: evt.attendees,
            location: evt.location,
            client_id: correlatedClient?.id,
            client_name: correlatedClient?.name,
            minutes_until: Math.round((new Date(evt.start_time).getTime() - now) / 60000),
          },
          confidence: 0.9,
        })
      }
    } catch (err) {
      logger.debug('perceptionDispatcher: calendar_event_imminent dispatch failed', { error: err.message })
    }
  },
}

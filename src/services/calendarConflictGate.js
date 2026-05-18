'use strict'

/**
 * calendarConflictGate - thin wrapper around calendarService that refuses
 * to create events when the proposed time window collides with a busy
 * block on the attendee's calendar.
 *
 * Exports:
 *   - checkConflicts({start_iso, end_iso, attendee_email})
 *   - createEventSafe({summary, start_iso, end_iso, attendees, force=false, ...})
 *   - ConflictError extends Error - thrown by createEventSafe on collision.
 *
 * Auth: reuses calendarService.getCalendarClient which authenticates a
 * domain-wide-delegated JWT (GOOGLE_SERVICE_ACCOUNT_JSON) impersonating the
 * target subject. We impersonate the attendee email when probing their
 * freebusy. If the JWT lacks delegation for that subject, freebusy.query
 * raises - we treat that as "unknown busy state" and fall back to a local
 * events-window scan against the calendar_events table for any cached
 * overlap. If both probes fail, we surface conflicts=[] (caller can pass
 * force=true to override).
 */

const logger = require('../config/logger')
const db = require('../config/db')
const calendarService = require('./calendarService')

class ConflictError extends Error {
  constructor(message, busy_blocks) {
    super(message)
    this.name = 'ConflictError'
    this.busy_blocks = Array.isArray(busy_blocks) ? busy_blocks : []
    this.code = 'CALENDAR_CONFLICT'
  }
}

function _toIso(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function _probeFreebusy({ start_iso, end_iso, attendee_email }) {
  // Reuse calendarService's JWT impersonation against the attendee.
  // If the SA lacks delegation, the request raises 403 - caller falls back.
  const calendar = calendarService.getCalendarClient(attendee_email)
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: start_iso,
      timeMax: end_iso,
      items: [{ id: attendee_email }],
      timeZone: 'Australia/Brisbane',
    },
  })
  const calendars = res?.data?.calendars || {}
  const entry = calendars[attendee_email] || {}
  if (entry.errors && entry.errors.length > 0) {
    const err = new Error(`freebusy errors: ${JSON.stringify(entry.errors)}`)
    err.code = 'FREEBUSY_PARTIAL'
    err.partial = entry.errors
    throw err
  }
  const busy = Array.isArray(entry.busy) ? entry.busy : []
  return busy.map(b => ({ start: b.start, end: b.end, source: 'freebusy' }))
}

async function _probeLocalEvents({ start_iso, end_iso, attendee_email }) {
  // Fallback: scan our local calendar_events cache for overlap. Useful when
  // the attendee is on a domain we don't have SA-delegation into but their
  // events have synced to our cache via pollCalendars().
  try {
    const rows = await db`
      SELECT start_time, end_time, summary, organizer_email
      FROM calendar_events
      WHERE status = 'confirmed'
        AND start_time < ${end_iso}::timestamptz
        AND end_time > ${start_iso}::timestamptz
        AND (
          organizer_email = ${attendee_email}
          OR attendees::text ILIKE ${`%${attendee_email}%`}
        )
      ORDER BY start_time ASC
      LIMIT 25
    `
    return rows.map(r => ({
      start: r.start_time instanceof Date ? r.start_time.toISOString() : r.start_time,
      end: r.end_time instanceof Date ? r.end_time.toISOString() : r.end_time,
      summary: r.summary || null,
      source: 'local_cache',
    }))
  } catch (err) {
    logger.debug('calendarConflictGate: local-events fallback failed', { error: err.message })
    return []
  }
}

/**
 * checkConflicts - probe the attendee's busy windows in [start_iso, end_iso).
 *
 * Returns { has_conflict, busy_blocks, source } where source is one of
 * 'freebusy', 'local_cache', or 'none' (no probe path returned data).
 */
async function checkConflicts({ start_iso, end_iso, attendee_email } = {}) {
  const startIso = _toIso(start_iso)
  const endIso = _toIso(end_iso)
  if (!startIso || !endIso) {
    throw new Error('checkConflicts: start_iso and end_iso required and must be valid ISO timestamps')
  }
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    throw new Error('checkConflicts: end_iso must be after start_iso')
  }
  if (!attendee_email || typeof attendee_email !== 'string') {
    throw new Error('checkConflicts: attendee_email required')
  }

  let busy = []
  let source = 'none'
  try {
    busy = await _probeFreebusy({ start_iso: startIso, end_iso: endIso, attendee_email })
    source = 'freebusy'
  } catch (err) {
    logger.debug('calendarConflictGate: freebusy probe failed, falling back', {
      attendee_email,
      error: err.message,
    })
    busy = await _probeLocalEvents({ start_iso: startIso, end_iso: endIso, attendee_email })
    source = busy.length > 0 ? 'local_cache' : 'none'
  }

  return {
    has_conflict: busy.length > 0,
    busy_blocks: busy,
    source,
  }
}

/**
 * createEventSafe - call checkConflicts on every attendee. If any has a
 * conflict and !force, throw ConflictError with the merged busy_blocks.
 * Otherwise proxy to calendarService.createEvent on the configured primary
 * calendar (GOOGLE_PRIMARY_ACCOUNT).
 *
 * Accepts both camelCase (startTime/endTime) and snake_case (start_iso/
 * end_iso) for ergonomics; passes calendarService its expected
 * startTime/endTime shape.
 */
async function createEventSafe(opts = {}) {
  const {
    summary,
    description,
    location,
    start_iso, end_iso,
    startTime, endTime,
    attendees,
    force = false,
    organizerEmail,
    conferenceLink,
  } = opts

  const startIso = _toIso(start_iso || startTime)
  const endIso = _toIso(end_iso || endTime)
  if (!startIso || !endIso) {
    throw new Error('createEventSafe: start time and end time required')
  }
  const attendeeList = Array.isArray(attendees)
    ? attendees.filter(a => typeof a === 'string' && a.includes('@'))
    : []

  if (!force && attendeeList.length > 0) {
    const merged = []
    for (const email of attendeeList) {
      try {
        const { has_conflict, busy_blocks } = await checkConflicts({
          start_iso: startIso,
          end_iso: endIso,
          attendee_email: email,
        })
        if (has_conflict) {
          for (const b of busy_blocks) {
            merged.push({ ...b, attendee: email })
          }
        }
      } catch (err) {
        logger.warn('calendarConflictGate: per-attendee probe threw', {
          attendee: email,
          error: err.message,
        })
      }
    }
    if (merged.length > 0) {
      throw new ConflictError(
        `Calendar conflict: ${merged.length} busy block(s) overlap proposed window`,
        merged,
      )
    }
  }

  const env = require('../config/env')
  const calendarEmail = organizerEmail || env.GOOGLE_PRIMARY_ACCOUNT
  return calendarService.createEvent(calendarEmail, {
    summary,
    description,
    location,
    startTime: startIso,
    endTime: endIso,
    attendees: attendeeList,
    conferenceLink,
  })
}

module.exports = {
  checkConflicts,
  createEventSafe,
  ConflictError,
}

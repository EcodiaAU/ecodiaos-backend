'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

// ─── Brisbane (AEST/AEDT-free) local-time helpers ──────────────────────────
//
// Audit 2026-05-13 P2: previously this used a hardcoded `+10` offset. AEST
// is UTC+10 but most of eastern AU observes DST (AEDT = UTC+11) Oct→Apr;
// Tate's locale is Brisbane (QLD) which does NOT observe DST, so AEST=+10
// holds year-round there — but the gate was being applied to *every* user
// of the API and the original comment ("7am-9pm AEST") was the relevant
// rule for Tate's actual local hours. Use Intl.DateTimeFormat with
// `Australia/Brisbane` so the gate is correct both year-round in QLD AND
// would work for any future user-local timezone we wire (TATE_TIMEZONE
// env var lets operators override).
//
// Brisbane is the canonical choice per CLAUDE.md "Output rule - UTC for
// machines, AEST for Tate" — Tate is in QLD; AEST=+10 year-round there.
const TATE_TIMEZONE = process.env.TATE_TIMEZONE || 'Australia/Brisbane'
const _tatePartsFmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: TATE_TIMEZONE,
  weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

function _tateParts(now = new Date()) {
  const parts = {}
  for (const p of _tatePartsFmt.formatToParts(now)) {
    parts[p.type] = p.value
  }
  return parts
}

function _nowAest() {
  // Kept as a back-compat alias for callers that still expect a Date
  // already shifted into the Tate-local wall-clock. Internally we
  // reconstruct from Intl parts so DST/no-DST is correct.
  const p = _tateParts()
  // Construct a Date whose UTC fields equal Tate's wall-clock fields —
  // matches the previous semantics callers rely on (getUTCHours,
  // getUTCDay return Tate-local hour/day).
  return new Date(Date.UTC(
    parseInt(p.year, 10),
    parseInt(p.month, 10) - 1,
    parseInt(p.day, 10),
    parseInt(p.hour, 10),
    parseInt(p.minute, 10),
    parseInt(p.second, 10),
  ))
}

function _aestHour() {
  return parseInt(_tateParts().hour, 10)
}

function _aestDayOfWeek() {
  // Map weekday short name to 0..6 (0=Sun, 6=Sat) to preserve the prior
  // shape that .getUTCDay() returned.
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[_tateParts().weekday] ?? 0
}

// ─── Tempo awareness ────────────────────────────────────────────────────────

function currentTempo() {
  const hour = _aestHour()
  const dow = _aestDayOfWeek()
  const isWeekend = dow === 0 || dow === 6

  if (hour >= 0 && hour < 6) return 'overnight'
  if (hour >= 6 && hour < 9) return isWeekend ? 'quiet' : 'standard'
  if (hour >= 9 && hour < 12) return isWeekend ? 'quiet' : 'peak'
  if (hour >= 12 && hour < 14) return 'standard' // lunch
  if (hour >= 14 && hour < 18) return isWeekend ? 'quiet' : 'peak'
  if (hour >= 18 && hour < 21) return 'standard'
  return 'quiet' // 21-00
}

// ─── Deadline urgency scoring ───────────────────────────────────────────────

function urgencyScore(dueAt) {
  if (!dueAt) return 0
  const due = new Date(dueAt)
  if (isNaN(due.getTime())) return 0

  const hoursUntilDue = (due.getTime() - Date.now()) / 3600000
  if (hoursUntilDue <= 0) return 2.0 // overdue - max urgency
  return 1 / Math.max(1, hoursUntilDue)
}

async function getUrgentGoals(limit = 10) {
  try {
    const rows = await db`
      SELECT id, title, target_date, priority, status
      FROM organism_goals
      WHERE status IN ('active', 'pursuing')
        AND target_date IS NOT NULL
      ORDER BY target_date ASC
      LIMIT ${limit}
    `
    return rows.map(r => ({
      ...r,
      urgency: urgencyScore(r.target_date),
      hours_remaining: Math.max(0, (new Date(r.target_date).getTime() - Date.now()) / 3600000),
      overdue: new Date(r.target_date).getTime() < Date.now(),
    }))
  } catch (err) {
    logger.warn('timeSenseService.getUrgentGoals failed', { error: err.message })
    return []
  }
}

// ─── Calendar gate ──────────────────────────────────────────────────────────
// Checks whether an outbound action should proceed or defer based on:
//   1. Time of day (7am-9pm AEST weekdays)
//   2. Tate's calendar state (Focus/DND events)

async function calendarGate(action = {}) {
  const hour = _aestHour()
  const dow = _aestDayOfWeek()
  const isWeekday = dow >= 1 && dow <= 5
  const urgency = action.urgency || 'normal'

  // Critical actions always proceed
  if (urgency === 'critical') return { proceed: true }

  // Outside 7am-9pm AEST on weekdays → defer
  if (isWeekday && (hour < 7 || hour >= 21)) {
    const nextOpen = _nextOpenWindow(hour, dow)
    return {
      proceed: false,
      defer_until: nextOpen,
      reason: `Outside send window (${hour}:00 AEST, weekday)`,
    }
  }

  // Weekend → defer non-urgent sends to Monday 9am
  if (!isWeekday && urgency !== 'high') {
    const monday9am = _nextMonday9am()
    return {
      proceed: false,
      defer_until: monday9am,
      reason: 'Weekend - deferring non-urgent send to Monday 9am AEST',
    }
  }

  // Check Tate's calendar for Focus/DND events
  try {
    const calendarState = await _checkTateCalendar()
    if (calendarState.focusActive) {
      return {
        proceed: false,
        defer_until: calendarState.focusEndsAt || _nextOpenWindow(hour, dow),
        reason: `Tate has active Focus/DND event until ${calendarState.focusEndsAt?.toISOString() || 'unknown'}`,
      }
    }
  } catch {
    // Calendar unavailable - proceed (fail-open)
  }

  return { proceed: true }
}

async function _checkTateCalendar() {
  // Check kv_store for cached calendar state (refreshed by the calendar sync cron)
  try {
    const rows = await db`
      SELECT value FROM kv_store WHERE key = 'tate.calendar_focus_state'
    `
    if (rows.length > 0) {
      const state = JSON.parse(rows[0].value)
      if (state.focusActive && state.focusEndsAt) {
        const endsAt = new Date(state.focusEndsAt)
        if (endsAt.getTime() > Date.now()) {
          return { focusActive: true, focusEndsAt: endsAt }
        }
      }
    }
  } catch {}
  return { focusActive: false }
}

function _nextOpenWindow(currentHour, currentDow) {
  const aest = _nowAest()
  if (currentHour < 7) {
    // Today at 7am AEST
    aest.setUTCHours(7, 0, 0, 0)
  } else {
    // Tomorrow at 7am AEST
    aest.setUTCDate(aest.getUTCDate() + 1)
    aest.setUTCHours(7, 0, 0, 0)
  }
  // Convert back from AEST to UTC
  return new Date(aest.getTime() - AEST_OFFSET_HOURS * 60 * 60 * 1000)
}

function _nextMonday9am() {
  const aest = _nowAest()
  const dow = aest.getUTCDay()
  const daysUntilMonday = dow === 0 ? 1 : (8 - dow)
  aest.setUTCDate(aest.getUTCDate() + daysUntilMonday)
  aest.setUTCHours(9, 0, 0, 0)
  return new Date(aest.getTime() - AEST_OFFSET_HOURS * 60 * 60 * 1000)
}

// ─── Tempo-modulated polling interval ───────────────────────────────────────
// Returns a multiplier for polling services to adjust their cadence

function tempoMultiplier() {
  const tempo = currentTempo()
  switch (tempo) {
    case 'peak': return 1.0
    case 'standard': return 0.75
    case 'quiet': return 0.5
    case 'overnight': return 0.25
    default: return 1.0
  }
}

module.exports = {
  currentTempo,
  tempoMultiplier,
  urgencyScore,
  getUrgentGoals,
  calendarGate,
  _aestHour,
  _aestDayOfWeek,
}

'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

// ─── AEST time helpers ──────────────────────────────────────────────────────

const AEST_OFFSET_HOURS = 10

function _nowAest() {
  const now = new Date()
  return new Date(now.getTime() + AEST_OFFSET_HOURS * 60 * 60 * 1000)
}

function _aestHour() {
  return _nowAest().getUTCHours()
}

function _aestDayOfWeek() {
  return _nowAest().getUTCDay() // 0=Sun, 6=Sat
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

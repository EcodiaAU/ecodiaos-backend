'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

// ─── Configuration ──────────────────────────────────────────────────────────

const WORK_HOURS_START = 6   // 6am AEST
const WORK_HOURS_END = 22    // 10pm AEST
const WORK_POLL_MS = 60_000  // 60s during work hours
const QUIET_POLL_MS = 15 * 60_000  // 15min overnight
const DAMPING_THRESHOLD = 3  // 3 no-value fires → pause
const DAMPING_PAUSE_MS = 24 * 60 * 60 * 1000  // 24h

// ─── State ──────────────────────────────────────────────────────────────────

let _timer = null
let _running = false

// Per-action-class firing history: { action_class: { fires: number, last_value_at: Date, paused_until: Date|null } }
const _actionHistory = new Map()

// ─── Email sender prefs (deterministic classification) ──────────────────────

const DOMAIN_CLASSIFICATION = {
  'gmail.com': { source_type: 'unknown', urgency: 'normal' },
  'outlook.com': { source_type: 'unknown', urgency: 'normal' },
  'hotmail.com': { source_type: 'unknown', urgency: 'normal' },
  // Legal domains
  'justice.gov.au': { source_type: 'legal', urgency: 'high' },
  'ato.gov.au': { source_type: 'legal', urgency: 'high' },
  'asic.gov.au': { source_type: 'legal', urgency: 'high' },
  // Newsletters
  'substack.com': { source_type: 'newsletter', urgency: 'batch' },
  'mailchimp.com': { source_type: 'newsletter', urgency: 'batch' },
  'sendinblue.com': { source_type: 'newsletter', urgency: 'batch' },
}

const NEWSLETTER_KEYWORDS = ['unsubscribe', 'newsletter', 'digest', 'weekly roundup', 'view in browser']

function classifyEmailSource(from, subject, body) {
  const domain = (from || '').split('@')[1]?.toLowerCase() || ''
  const domainMatch = DOMAIN_CLASSIFICATION[domain]
  if (domainMatch) return domainMatch

  // Gov domains → legal
  if (domain.endsWith('.gov.au') || domain.endsWith('.gov')) {
    return { source_type: 'legal', urgency: 'high' }
  }

  // Newsletter detection via body keywords
  const bodyLower = (body || '').toLowerCase()
  const subjectLower = (subject || '').toLowerCase()
  const isNewsletter = NEWSLETTER_KEYWORDS.some(kw => bodyLower.includes(kw) || subjectLower.includes(kw))
  if (isNewsletter) return { source_type: 'newsletter', urgency: 'batch' }

  // Internal (ecodia domain)
  if (domain.includes('ecodia')) return { source_type: 'internal', urgency: 'normal' }

  return { source_type: 'unknown', urgency: 'normal' }
}

// ─── State gathering ────────────────────────────────────────────────────────

async function _gatherState() {
  const state = {
    work_queue: [],
    energy_level: 'healthy',
    time_of_day: _getAestHour(),
    unverified_claims_count: 0,
    fork_slot_available: true,
    last_tate_interaction_ms: Infinity,
    urgent_goals: [],
  }

  try {
    // Work queue: pending messages
    const msgs = await db`
      SELECT COUNT(*)::int AS n FROM message_queue
      WHERE delivered_at IS NULL AND cancelled_at IS NULL
    `
    state.work_queue_depth = msgs[0]?.n || 0

    // Energy
    try {
      const usageEnergy = require('./usageEnergyService')
      const energy = await usageEnergy.getEnergy()
      state.energy_level = energy?.level || 'healthy'
    } catch {}

    // Unverified claims
    try {
      const claims = await db`
        SELECT COUNT(*)::int AS n FROM conductor_claims
        WHERE verified_at IS NULL AND created_at > NOW() - INTERVAL '7 days'
      `
      state.unverified_claims_count = claims[0]?.n || 0
    } catch {}

    // Fork slots
    try {
      const { liveForkCount } = require('../lib/forkCapAtomic')
      const live = await liveForkCount()
      state.fork_slot_available = live < 5
      state.live_forks = live
    } catch {}

    // Last Tate interaction
    try {
      const tate = await db`
        SELECT MAX(queued_at) AS last_at FROM message_queue
        WHERE source = 'tate'
      `
      if (tate[0]?.last_at) {
        state.last_tate_interaction_ms = Date.now() - new Date(tate[0].last_at).getTime()
      }
    } catch {}

    // Urgent goals (approaching deadline)
    try {
      const goals = await db`
        SELECT id, title, target_date, priority
        FROM organism_goals
        WHERE status IN ('active', 'pursuing')
          AND target_date IS NOT NULL
          AND target_date > NOW()
          AND target_date < NOW() + INTERVAL '48 hours'
        ORDER BY target_date ASC
        LIMIT 5
      `
      state.urgent_goals = goals
    } catch {}
  } catch (err) {
    logger.warn('proactivityEngine: state gathering partial failure', { error: err.message })
  }

  return state
}

// ─── Action policies ────────────────────────────────────────────────────────

function _isWorkHours(aestHour) {
  return aestHour >= WORK_HOURS_START && aestHour < WORK_HOURS_END
}

function _getAestHour() {
  const now = new Date()
  const aestOffset = 10 * 60
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const aestMinutes = utcMinutes + aestOffset
  return Math.floor(((aestMinutes % 1440) + 1440) % 1440 / 60)
}

function _isDamped(actionClass) {
  const history = _actionHistory.get(actionClass)
  if (!history) return false
  if (history.paused_until && Date.now() < history.paused_until.getTime()) return true
  return false
}

function _recordFire(actionClass, producedValue) {
  let history = _actionHistory.get(actionClass)
  if (!history) {
    history = { consecutive_no_value: 0, paused_until: null }
    _actionHistory.set(actionClass, history)
  }

  if (producedValue) {
    history.consecutive_no_value = 0
    history.paused_until = null
  } else {
    history.consecutive_no_value++
    if (history.consecutive_no_value >= DAMPING_THRESHOLD) {
      history.paused_until = new Date(Date.now() + DAMPING_PAUSE_MS)
      logger.info('proactivityEngine: damped action class', {
        action_class: actionClass,
        consecutive_no_value: history.consecutive_no_value,
        paused_until: history.paused_until.toISOString(),
      })
    }
  }
}

// ─── Core: nextAction ───────────────────────────────────────────────────────

async function nextAction(state) {
  if (!state) state = await _gatherState()
  const hour = state.time_of_day ?? _getAestHour()
  const workHours = _isWorkHours(hour)

  // Critical energy → do nothing
  if (state.energy_level === 'critical') return null

  // 1. Urgent goals with approaching deadlines (always, any hour)
  if (state.urgent_goals?.length > 0 && !_isDamped('urgent_goal_push')) {
    const goal = state.urgent_goals[0]
    const hoursLeft = Math.max(1, (new Date(goal.target_date).getTime() - Date.now()) / 3600000)
    return {
      action_class: 'urgent_goal_push',
      action: 'pursue_goal',
      goal_id: goal.id,
      title: goal.title,
      urgency: 1 / hoursLeft,
      reason: `Goal "${goal.title}" due in ${Math.round(hoursLeft)}h`,
    }
  }

  // 2. Unverified claims backlog (work hours only)
  if (workHours && state.unverified_claims_count > 5 && !_isDamped('verify_claims')) {
    return {
      action_class: 'verify_claims',
      action: 'verify_pending_claims',
      count: state.unverified_claims_count,
      reason: `${state.unverified_claims_count} unverified claims pending`,
    }
  }

  // 3. Check email (work hours, not too often)
  if (workHours && !_isDamped('check_email')) {
    return {
      action_class: 'check_email',
      action: 'triage_inbox',
      reason: 'Proactive inbox check',
    }
  }

  // 4. Low energy → skip non-critical during work hours
  if (state.energy_level === 'low' && workHours) return null

  // 5. Overnight: batch-only operations
  if (!workHours && state.fork_slot_available && !_isDamped('overnight_batch')) {
    return {
      action_class: 'overnight_batch',
      action: 'run_batch_maintenance',
      reason: 'Overnight batch window - maintenance tasks',
    }
  }

  // 6. Idle with available fork slot and no recent Tate interaction (>2h)
  if (workHours && state.fork_slot_available &&
      state.last_tate_interaction_ms > 2 * 60 * 60 * 1000 &&
      state.work_queue_depth === 0 &&
      !_isDamped('idle_discovery')) {
    return {
      action_class: 'idle_discovery',
      action: 'discover_work',
      reason: 'Idle >2h since Tate, discovering proactive work',
    }
  }

  return null
}

// ─── Polling loop ───────────────────────────────────────────────────────────

// Pre-execution probes for cheap action classes. Returns:
//   { proceed: true } - enqueue as planned
//   { proceed: false, reason: <str> } - record no-value, skip enqueue
//
// The damper consumes "no-value" signals to pause repeated useless fires
// (3 consecutive → 24h pause). Without a probe the damper never engages
// for `check_email`, because "successfully enqueued" was being conflated
// with "produced value" - see Tate-flagged spam at 11:12 AEST 1 May 2026.
async function _probeAction(action) {
  if (action.action_class === 'check_email') {
    try {
      const gmailService = require('./gmailService')
      const { total, perInbox, gmailDisabled } = await gmailService.countUnread()
      if (gmailDisabled) {
        return { proceed: false, reason: 'gmail_disabled' }
      }
      if (total === 0) {
        return { proceed: false, reason: 'no_unread_in_any_inbox', perInbox }
      }
      // Annotate the action so the conductor's prompt explains what's there.
      action.reason = `Proactive inbox check - ${total} unread (${perInbox.map(p => `${p.inbox}:${p.unread}`).join(', ')})`
      return { proceed: true, unreadCount: total }
    } catch (err) {
      // API failure → conservative: skip enqueue (don't spam) but DON'T damp
      // (we have no signal about real inbox state). Treat as transient.
      logger.warn('proactivityEngine: check_email probe failed', { error: err.message })
      return { proceed: false, reason: 'probe_error', transient: true }
    }
  }
  return { proceed: true }
}

async function _tick() {
  if (_running) return
  _running = true

  try {
    const state = await _gatherState()
    const action = await nextAction(state)

    if (action) {
      // Pre-execution probe: cheap action classes (currently check_email)
      // verify there's actual work to do BEFORE enqueueing. This is what
      // feeds the damper a real "no-value" signal.
      const probe = await _probeAction(action)
      if (!probe.proceed) {
        logger.debug('proactivityEngine: action skipped by probe', {
          action_class: action.action_class,
          reason: probe.reason,
          ...(probe.perInbox ? { perInbox: probe.perInbox } : {}),
        })
        // Only damp on confirmed no-value (not transient errors).
        if (!probe.transient) {
          _recordFire(action.action_class, false)
        }
        return
      }

      logger.info('proactivityEngine: action selected', {
        action_class: action.action_class,
        action: action.action,
        reason: action.reason,
        ...(probe.unreadCount !== undefined ? { unread_count: probe.unreadCount } : {}),
      })

      // Enqueue to OS Session message queue for conductor
      try {
        await db`
          INSERT INTO message_queue (body, source, mode)
          VALUES (
            ${`[PROACTIVE: ${action.action_class}] ${action.reason}. Action: ${action.action}${action.goal_id ? ' (goal_id=' + action.goal_id + ')' : ''}`},
            ${'proactivity_engine'},
            ${'queue'}
          )
        `
        _recordFire(action.action_class, true)
      } catch (err) {
        logger.warn('proactivityEngine: failed to enqueue action', { error: err.message })
        _recordFire(action.action_class, false)
      }
    }
  } catch (err) {
    logger.warn('proactivityEngine: tick failed', { error: err.message })
  } finally {
    _running = false
  }
}

function _scheduleNext() {
  const hour = _getAestHour()
  const delay = _isWorkHours(hour) ? WORK_POLL_MS : QUIET_POLL_MS
  _timer = setTimeout(async () => {
    await _tick()
    _scheduleNext()
  }, delay)
}

function start() {
  if (_timer) return
  logger.info('proactivityEngine: started')
  _scheduleNext()
}

function stop() {
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
  logger.info('proactivityEngine: stopped')
}

module.exports = {
  start,
  stop,
  nextAction,
  classifyEmailSource,
  _gatherState,
  _recordFire,
  _isDamped,
  _actionHistory,
  _probeAction,
  _tick,
}

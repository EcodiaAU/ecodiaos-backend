// failureEscalateService.js
// Layer 8 of the 24/7 autonomy spec
// (backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md).
//
// Problem: when something fails (worker silent-exit, cron silent-fire, deploy
// rejected, account capped, watchdog tripwire), the surface is currently
// inconsistent. Some failures SMS Tate. Some land in status_board only. Some
// fire an observer_signal. Some leak nowhere. The conductor sees different
// failure modes in different shapes and can miss real problems.
//
// This helper is the single routing point. Callers pass { severity, kind,
// message, context } and the helper writes to the right substrate(s) per the
// escalation tier table:
//
//   routine_info         -> observer_signal (P5)
//   action_recommended   -> observer_signal (P3) + status_board (P3)
//   conductor_decision   -> pending_restart_request OR observer_signal (P2)
//   tate_judgement       -> approval_queue insert (per-type)
//   time_critical        -> sms.tate + observer_signal (P1) + status_board (P1)
//   hard_tripwire        -> sms.tate + observer_signal (P1) + status_board (P1)
//   substrate_down       -> sms.tate via corazonWatchdog channel (the watchdog itself, not this helper)
//
// Callers:
//   const escalate = require('./failureEscalateService')
//   await escalate.fire({
//     severity: 'time_critical',
//     kind: 'worker_silent_exit',
//     message: 'fork_xxx exited without signal_done after 10min',
//     context: { fork_id, task_id, last_seen_iso },
//   })
//
// Idempotency: pass `dedupe_key` to suppress duplicate fires within a 1h window.

const db = require('../config/db')
const logger = require('../config/logger')

const VALID_SEVERITY = new Set([
  'routine_info',
  'action_recommended',
  'conductor_decision',
  'tate_judgement',
  'time_critical',
  'hard_tripwire',
])

const SEVERITY_TO_PRIORITY = {
  routine_info: 5,
  action_recommended: 3,
  conductor_decision: 2,
  tate_judgement: 2,
  time_critical: 1,
  hard_tripwire: 1,
}

const DEDUPE_TTL_HOURS = 1

async function _isDuplicate(dedupe_key) {
  if (!dedupe_key) return false
  const rows = await db`
    SELECT 1 FROM kv_store
    WHERE key = ${'escalate:' + dedupe_key}
      AND (value->>'fired_at')::timestamptz > NOW() - INTERVAL '1 hour'
    LIMIT 1
  `
  return rows.length > 0
}

async function _stampDedupe(dedupe_key, severity, kind) {
  if (!dedupe_key) return
  const payload = JSON.stringify({ fired_at: new Date().toISOString(), severity, kind })
  await db`
    INSERT INTO kv_store (key, value)
    VALUES (${'escalate:' + dedupe_key}, ${payload}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `
}

async function _writeObserverSignal({ severity, kind, message, context }) {
  try {
    const observerSignals = require('./observerSignalsService')
    if (!observerSignals || typeof observerSignals.writeSignal !== 'function') return null
    return await observerSignals.writeSignal({
      observer_name: 'failure_escalate',
      signal_kind: kind,
      priority: SEVERITY_TO_PRIORITY[severity] ?? 3,
      message,
      context: context || null,
    })
  } catch (err) {
    logger.debug('failureEscalate: observer signal write failed', { error: err.message })
    return null
  }
}

async function _writeStatusBoard({ severity, kind, message, context }) {
  try {
    const priority = SEVERITY_TO_PRIORITY[severity] ?? 3
    const ctxSnippet = context ? ` :: ${JSON.stringify(context).slice(0, 200)}` : ''
    const name = `escalation:${kind}`.slice(0, 80)
    const nextAction = `${message}${ctxSnippet}`.slice(0, 600)
    const rows = await db`
      INSERT INTO status_board (
        entity_type, entity_ref, name, status, next_action,
        next_action_by, priority, context, last_touched
      ) VALUES (
        'task', ${'escalation-' + kind}, ${name}, 'open', ${nextAction},
        'ecodiaos', ${priority}, ${context ? db.json(context) : null}, NOW()
      )
      RETURNING id
    `
    return rows[0]?.id || null
  } catch (err) {
    logger.debug('failureEscalate: status_board insert failed', { error: err.message })
    return null
  }
}

async function _sendSms({ severity, kind, message }) {
  try {
    const osAlerting = require('./osAlertingService')
    if (!osAlerting || typeof osAlerting.sendSmsToTate !== 'function') return null
    const body = `[ECODIAOS ${severity.toUpperCase()}] ${kind}: ${message}`.slice(0, 320)
    return await osAlerting.sendSmsToTate(body)
  } catch (err) {
    logger.warn('failureEscalate: SMS send failed', { error: err.message })
    return null
  }
}

async function _enqueueApproval({ kind, message, context }) {
  try {
    const queue = require('./approvalQueueService')
    if (!queue || typeof queue.enqueueFreeText !== 'function') return null
    return await queue.enqueueFreeText({
      title: `Decision needed: ${kind}`.slice(0, 200),
      detail: message,
      urgency: 'normal',
      payload: context || {},
      origin: 'failure_escalate',
    })
  } catch (err) {
    logger.debug('failureEscalate: approval enqueue failed', { error: err.message })
    return null
  }
}

async function fire({ severity, kind, message, context, dedupe_key }) {
  if (!VALID_SEVERITY.has(severity)) {
    throw new Error(`invalid severity: ${severity}`)
  }
  if (!kind || !message) {
    throw new Error('kind + message required')
  }

  if (await _isDuplicate(dedupe_key)) {
    logger.debug('failureEscalate: duplicate suppressed', { kind, dedupe_key })
    return { ok: true, deduped: true }
  }

  const surfaces = []

  switch (severity) {
    case 'routine_info':
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      break
    case 'action_recommended':
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      surfaces.push({ surface: 'status_board', result: await _writeStatusBoard({ severity, kind, message, context }) })
      break
    case 'conductor_decision':
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      surfaces.push({ surface: 'status_board', result: await _writeStatusBoard({ severity, kind, message, context }) })
      break
    case 'tate_judgement':
      surfaces.push({ surface: 'approval_queue', result: await _enqueueApproval({ kind, message, context }) })
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      break
    case 'time_critical':
      surfaces.push({ surface: 'sms', result: await _sendSms({ severity, kind, message }) })
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      surfaces.push({ surface: 'status_board', result: await _writeStatusBoard({ severity, kind, message, context }) })
      break
    case 'hard_tripwire':
      surfaces.push({ surface: 'sms', result: await _sendSms({ severity, kind, message }) })
      surfaces.push({ surface: 'observer_signal', result: await _writeObserverSignal({ severity, kind, message, context }) })
      surfaces.push({ surface: 'status_board', result: await _writeStatusBoard({ severity, kind, message, context }) })
      break
  }

  await _stampDedupe(dedupe_key, severity, kind)
  logger.info('failureEscalate: fired', {
    severity,
    kind,
    dedupe_key: dedupe_key || null,
    surfaces: surfaces.map(s => s.surface),
  })
  return { ok: true, severity, kind, surfaces }
}

module.exports = {
  fire,
  VALID_SEVERITY,
  SEVERITY_TO_PRIORITY,
}

'use strict'

/**
 * observerTuningService — daily + weekly rollup of observer telemetry.
 *
 * Daily (runs once per ~24h, idempotent for the same date):
 *   - For each observer, count fired / ack_explicit / ack_implicit /
 *     ack_dismissed / ack_expired / marked_false_positive / p1_fired.
 *   - UPSERT into observer_outcomes (one row per observer per day).
 *
 * Weekly (runs once per ~7d):
 *   - For each observer, sum the last 7 days of outcomes.
 *   - Compute the dismissal+FP rate and the implicit-only-rate.
 *   - Emit a single P3 status_board row with auto-narrow / auto-archive
 *     suggestions for any observer crossing tuning thresholds.
 *
 * Tuning thresholds (configurable via env):
 *   FP rate >= 30% over 7d   → auto-mark observer.config_json.narrow_recommended=true
 *   Dismissal+FP rate >= 70% → auto-mark observer for review (status_board P3)
 *   Zero explicit acks in 30d AND fired > 0 → auto-archive candidate
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 5 * 60 * 1000   // 5 min after boot

let _dailyTimer = null
let _weeklyTimer = null
let _initialDelay = null

async function rollupYesterday() {
  // Compute outcomes for the previous AEST calendar day. The day boundary
  // matters less than consistency — using UTC for the SQL is fine because
  // observer_outcomes.day is just a tag, not a billing window.
  try {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
    const dayStr = yesterday.toISOString().slice(0, 10)
    const dayStart = new Date(dayStr + 'T00:00:00.000Z')
    const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 3600 * 1000)

    const rows = await db`
      SELECT
        observer_name,
        COUNT(*)::int AS fired,
        SUM(CASE WHEN ack_mode = 'explicit'    THEN 1 ELSE 0 END)::int AS ack_explicit,
        SUM(CASE WHEN ack_mode = 'implicit'    THEN 1 ELSE 0 END)::int AS ack_implicit,
        SUM(CASE WHEN ack_mode = 'dismissed'   THEN 1 ELSE 0 END)::int AS ack_dismissed,
        SUM(CASE WHEN ack_mode = 'auto_expired' OR (acknowledged = FALSE AND expires_at < NOW()) THEN 1 ELSE 0 END)::int AS ack_expired,
        SUM(CASE WHEN mark_false_positive = TRUE THEN 1 ELSE 0 END)::int AS marked_false_positive,
        AVG(confidence)::numeric(4,3) AS avg_confidence,
        SUM(CASE WHEN priority = 1 THEN 1 ELSE 0 END)::int AS p1_fired
      FROM observer_signals
      WHERE created_at >= ${dayStart} AND created_at < ${dayEnd}
      GROUP BY observer_name
    `

    let upserted = 0
    for (const r of rows) {
      try {
        await db`
          INSERT INTO observer_outcomes
            (observer_name, day, fired, ack_explicit, ack_implicit, ack_dismissed,
             ack_expired, marked_false_positive, avg_confidence, p1_fired, updated_at)
          VALUES
            (${r.observer_name}, ${dayStr}, ${r.fired}, ${r.ack_explicit}, ${r.ack_implicit},
             ${r.ack_dismissed}, ${r.ack_expired}, ${r.marked_false_positive},
             ${r.avg_confidence}, ${r.p1_fired}, NOW())
          ON CONFLICT (observer_name, day) DO UPDATE SET
            fired = EXCLUDED.fired,
            ack_explicit = EXCLUDED.ack_explicit,
            ack_implicit = EXCLUDED.ack_implicit,
            ack_dismissed = EXCLUDED.ack_dismissed,
            ack_expired = EXCLUDED.ack_expired,
            marked_false_positive = EXCLUDED.marked_false_positive,
            avg_confidence = EXCLUDED.avg_confidence,
            p1_fired = EXCLUDED.p1_fired,
            updated_at = NOW()
        `
        upserted += 1
      } catch (err) {
        logger.debug('observerTuningService.rollupYesterday upsert failed', { observer: r.observer_name, error: err.message })
      }
    }
    logger.info('observerTuningService: daily rollup complete', { day: dayStr, observers: upserted })
    return { day: dayStr, observers: upserted }
  } catch (err) {
    logger.warn('observerTuningService.rollupYesterday failed', { error: err.message })
    return { error: err.message }
  }
}

async function weeklyTuningPass() {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const rows = await db`
      SELECT
        observer_name,
        SUM(fired)::int AS fired,
        SUM(ack_explicit)::int AS ack_explicit,
        SUM(ack_implicit)::int AS ack_implicit,
        SUM(ack_dismissed)::int AS ack_dismissed,
        SUM(ack_expired)::int AS ack_expired,
        SUM(marked_false_positive)::int AS fp,
        SUM(p1_fired)::int AS p1_fired
      FROM observer_outcomes
      WHERE day >= ${since.toISOString().slice(0, 10)}
      GROUP BY observer_name
      ORDER BY fired DESC
    `

    const lines = []
    const narrowCandidates = []
    const archiveCandidates = []
    for (const r of rows) {
      if (r.fired === 0) continue
      const fpRate = r.fp / Math.max(r.fired, 1)
      const dismissRate = (r.ack_dismissed + r.fp) / Math.max(r.fired, 1)
      const explicitAckRate = r.ack_explicit / Math.max(r.fired, 1)

      let tag = ''
      if (fpRate >= 0.30) { tag = ' NARROW (FP)'; narrowCandidates.push({ observer: r.observer_name, fpRate }) }
      else if (dismissRate >= 0.70) { tag = ' NARROW (dismissed)'; narrowCandidates.push({ observer: r.observer_name, dismissRate }) }
      if (r.ack_explicit === 0 && r.fired >= 5) { tag += ' ARCHIVE_CANDIDATE'; archiveCandidates.push({ observer: r.observer_name, fired: r.fired }) }

      lines.push(
        `  ${r.observer_name}: fired=${r.fired} p1=${r.p1_fired} ` +
        `ack_explicit=${r.ack_explicit} (${(explicitAckRate * 100).toFixed(0)}%) ` +
        `ack_implicit=${r.ack_implicit} ack_dismissed=${r.ack_dismissed} ` +
        `expired=${r.ack_expired} fp=${r.fp}${tag}`
      )
    }

    if (lines.length === 0) {
      logger.info('observerTuningService: weekly pass — no observer activity in last 7d')
      return { ok: true, observers: 0 }
    }

    // Apply config recommendations to observer_registry fire-and-forget.
    for (const c of narrowCandidates) {
      try {
        await db`
          UPDATE observer_registry
          SET config_json = config_json || '{"narrow_recommended": true}'::jsonb,
              narrowed_at = NOW(),
              narrowed_reason = ${`weekly tuning: dismiss+fp rate too high`}
          WHERE observer_name = ${c.observer}
        `
      } catch { /* non-fatal */ }
    }

    // Emit one P3 status_board row summarising the tuning pass.
    const summary = `weekly observer tuning report:\n${lines.join('\n')}` +
      (narrowCandidates.length > 0 ? `\nnarrow: ${narrowCandidates.map(c => c.observer).join(', ')}` : '') +
      (archiveCandidates.length > 0 ? `\narchive candidates: ${archiveCandidates.map(c => c.observer).join(', ')}` : '')

    try {
      const rowName = `observer tuning report ${new Date().toISOString().slice(0, 10)}`
      await db`
        INSERT INTO status_board
          (name, entity_type, status, priority, next_action, next_action_by, source, context)
        SELECT ${rowName}, 'infrastructure', 'review_pending', 3,
               ${'Review observer tuning recommendations and apply narrows/archives.'},
               'ecodiaos', 'observer_tuning_service', ${summary.slice(0, 4000)}
        WHERE NOT EXISTS (
          SELECT 1 FROM status_board WHERE name = ${rowName} AND archived_at IS NULL
        )
      `
    } catch (err) {
      logger.debug('observerTuningService: status_board insert failed', { error: err.message })
    }

    logger.info('observerTuningService: weekly tuning pass complete', {
      observers: rows.length,
      narrow_candidates: narrowCandidates.length,
      archive_candidates: archiveCandidates.length,
    })
    return { ok: true, observers: rows.length, narrowCandidates, archiveCandidates }
  } catch (err) {
    logger.warn('observerTuningService.weeklyTuningPass failed', { error: err.message })
    return { error: err.message }
  }
}

function start() {
  if (_initialDelay || _dailyTimer) return
  _initialDelay = setTimeout(() => {
    _initialDelay = null
    rollupYesterday().catch(err => logger.debug('bg task error', { err: err.message }))
    weeklyTuningPass().catch(err => logger.debug('bg task error', { err: err.message }))
    _dailyTimer = setInterval(() => rollupYesterday().catch(err => logger.debug('bg task error', { err: err.message })), DAILY_INTERVAL_MS)
    _weeklyTimer = setInterval(() => weeklyTuningPass().catch(err => logger.debug('bg task error', { err: err.message })), WEEKLY_INTERVAL_MS)
    if (_dailyTimer.unref) _dailyTimer.unref()
    if (_weeklyTimer.unref) _weeklyTimer.unref()
  }, INITIAL_DELAY_MS)
  if (_initialDelay.unref) _initialDelay.unref()
  logger.info('observerTuningService: scheduled (daily rollup + weekly tuning pass)')
}

function stop() {
  if (_initialDelay) { clearTimeout(_initialDelay); _initialDelay = null }
  if (_dailyTimer) { clearInterval(_dailyTimer); _dailyTimer = null }
  if (_weeklyTimer) { clearInterval(_weeklyTimer); _weeklyTimer = null }
}

module.exports = { start, stop, rollupYesterday, weeklyTuningPass }

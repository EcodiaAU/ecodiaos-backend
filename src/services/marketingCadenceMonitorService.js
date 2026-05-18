'use strict'

/**
 * marketingCadenceMonitorService - cron-fireable cadence canary.
 *
 * Reads recent published posts per channel (linkedin, instagram, facebook, x),
 * computes days_since_last_post, and flags breaches against per-channel
 * thresholds by upserting a P2 status_board row + writing a kv_store
 * snapshot at cowork.marketing.cadence_state.
 *
 * Substrate-source-of-truth (today): pending_marketing_artifacts.
 * Future: zernio_list_posts MCP call to read Zernio's authoritative state
 * - see TODO below. Until that integration is wired, the table is
 * canonical for cadence: marking an artifact as published is the
 * substrate-write that resets the cadence clock for its channel.
 *
 * Per backend/patterns/cron-must-be-registered-not-just-documented-
 * 2026-05-18.md: this service is the deliverable behind every
 * marketing-cadence-monitor cron fire. Without it, a "cadence breach
 * detector" claim is doctrine fiction.
 *
 * Per backend/patterns/cron-fire-must-have-deliverable-not-just-narration.md:
 * runOnce() ALWAYS writes the kv_store snapshot. Breach branches additionally
 * write status_board rows. dryRun=true returns the same shape without writes.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const artifactStore = require('./marketingArtifactStore')

const CHANNELS = ['linkedin', 'instagram', 'facebook', 'x']

// Per-channel cadence breach thresholds (days since last post).
// Sourced from marketing-post-primitives-and-generation-doctrine-2026-05-16.md:
// - LinkedIn 4-5 posts/week minimum (5d breach).
// - Instagram secondary (7d breach).
// - Facebook lowest-priority of these four (14d breach).
// - X: very low effort target but if used, 3d breach.
const THRESHOLDS_DAYS = {
  linkedin: 5,
  instagram: 7,
  facebook: 14,
  x: 3,
}

const CADENCE_KV_KEY = 'cowork.marketing.cadence_state'
const RECENT_LOOKBACK_DAYS = 60

// ─── Internal: source-of-truth probe per channel ──────────────────────────────

/**
 * Try Zernio first; fall back to pending_marketing_artifacts.
 *
 * TODO(zernio): wire the zernio_list_posts MCP call here. The MCP surface
 * is exposed via /api/mcp/ecodia-comms zernio_list_posts; this service
 * cannot call MCP tools directly. Options when wiring:
 *   1. Add a thin HTTP wrapper on Zernio's REST API (cleanest).
 *   2. Surface a kv_store mirror keyed by channel that a Zernio-polling
 *      Routine refreshes on a cadence ~hourly.
 *   3. Have the Monday weekly post-batch routine + opportunistic posts
 *      ALWAYS write pending_marketing_artifacts and then publish via
 *      Zernio - which is the substrate discipline we want anyway.
 *
 * Option 3 is the doctrine-aligned choice: pending_marketing_artifacts
 * becomes canonical, Zernio is the publishing pipe. Until then, this
 * function returns whatever the table knows.
 */
async function _recentPublishedForChannel(channel) {
  // Returns array sorted DESC by published_at.
  return await artifactStore.recentByChannel(channel, RECENT_LOOKBACK_DAYS)
}

function _daysSince(ts) {
  if (!ts) return null
  const last = new Date(ts).getTime()
  if (Number.isNaN(last)) return null
  return Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000))
}

// ─── Public: runOnce ──────────────────────────────────────────────────────────

/**
 * Run a single cadence check pass.
 *
 * @param {object} opts
 *   dryRun   default false - if true, no kv_store/status_board writes
 * @returns {Promise<{by_channel: object, flagged: string[]}>}
 */
async function runOnce({ dryRun = false } = {}) {
  const byChannel = {}
  const flagged = []

  for (const channel of CHANNELS) {
    const threshold = THRESHOLDS_DAYS[channel]
    let recent = []
    let probeSource = 'pending_marketing_artifacts'

    try {
      recent = await _recentPublishedForChannel(channel)
    } catch (err) {
      logger.warn('marketingCadenceMonitor: probe failed', { channel, error: err.message })
      recent = []
    }

    const last = recent[0] || null
    const daysSince = last ? _daysSince(last.published_at) : null

    const entry = {
      threshold_days: threshold,
      days_since_last: daysSince,           // null = no record in lookback window
      last_post_id: last ? last.id : null,
      last_post_at: last ? last.published_at : null,
      last_post_source_cron: last ? last.source_cron : null,
      probe_source: probeSource,
      recent_count: recent.length,
    }

    // Breach condition: days_since_last is null (no record) OR exceeds threshold.
    // No-record breach uses a special "no_record_in_lookback" marker so the
    // status_board row reads correctly.
    const breach = (daysSince === null) || (daysSince > threshold)
    entry.breach = breach

    if (breach) {
      flagged.push(channel)
      const breachLabel = daysSince === null
        ? `no record in last ${RECENT_LOOKBACK_DAYS}d`
        : `${daysSince}d silent`
      entry.breach_label = breachLabel

      if (!dryRun) {
        await _upsertBreachRow({ channel, breachLabel, threshold, daysSince })
      }
    }

    byChannel[channel] = entry
  }

  if (!dryRun) {
    await _writeCadenceSnapshot({ byChannel, flagged })
  }

  logger.info('marketingCadenceMonitor.runOnce complete', {
    dryRun,
    flagged_count: flagged.length,
    flagged,
  })

  return { by_channel: byChannel, flagged }
}

// ─── Internal: writes ─────────────────────────────────────────────────────────

async function _upsertBreachRow({ channel, breachLabel, threshold, daysSince }) {
  // Idempotent: one open row per channel breach. If a row already exists
  // for this channel with an unarchived breach, refresh its last_touched +
  // status; do not duplicate.
  const name = `Marketing cadence breach: ${channel} ${breachLabel}`
  const status = daysSince === null ? 'no_recent_record' : 'breached'
  const next_action = 'Draft + queue post via pending_marketing_artifacts.'
  // status_board.context is TEXT; serialise to a bounded JSON string.
  const context = JSON.stringify({
    channel,
    threshold_days: threshold,
    days_since_last: daysSince,
    detector: 'marketingCadenceMonitorService',
  }).slice(0, 4000)

  try {
    // Look for an existing open row matching channel + entity_type.
    const namePrefix = `Marketing cadence breach: ${channel}%`
    const [existing] = await db`
      SELECT id
      FROM status_board
      WHERE entity_type = 'infrastructure'
        AND name LIKE ${namePrefix}
        AND archived_at IS NULL
      LIMIT 1
    `

    if (existing) {
      await db`
        UPDATE status_board
        SET name           = ${name},
            status         = ${status},
            priority       = 2,
            next_action    = ${next_action},
            next_action_by = 'ecodiaos',
            context        = ${context},
            last_touched   = NOW()
        WHERE id = ${existing.id}
      `
      logger.info('marketingCadenceMonitor: refreshed breach row', {
        id: existing.id, channel, breachLabel,
      })
      return
    }

    await db`
      INSERT INTO status_board (
        name, entity_type, status, priority,
        next_action, next_action_by, source, context, last_touched
      ) VALUES (
        ${name}, 'infrastructure', ${status}, 2,
        ${next_action}, 'ecodiaos', 'marketing_cadence_monitor',
        ${context}, NOW()
      )
    `
    logger.info('marketingCadenceMonitor: inserted breach row', { channel, breachLabel })
  } catch (err) {
    logger.warn('marketingCadenceMonitor._upsertBreachRow: failed', {
      channel, error: err.message,
    })
  }
}

async function _writeCadenceSnapshot({ byChannel, flagged }) {
  const snapshot = {
    by_channel: byChannel,
    flagged,
    last_check_at: new Date().toISOString(),
  }
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${CADENCE_KV_KEY}, ${db.json(snapshot)}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = NOW()
    `
    logger.info('marketingCadenceMonitor: snapshot written', {
      key: CADENCE_KV_KEY, flagged_count: flagged.length,
    })
  } catch (err) {
    logger.warn('marketingCadenceMonitor._writeCadenceSnapshot: failed', {
      error: err.message,
    })
  }
}

module.exports = {
  runOnce,
  // exposed for tests + composition
  CHANNELS,
  THRESHOLDS_DAYS,
  CADENCE_KV_KEY,
}

'use strict'

/**
 * marketingArtifactStore - wraps pending_marketing_artifacts (migration 128).
 *
 * This is the producer-loop substrate for marketing posts. Every marketing
 * cron (outreach-engine LinkedIn draft, marketing-outreach LinkedIn post,
 * Monday weekly batch, pattern-of-week, opportunistic ship) writes a row
 * here at status='drafted'. The cadence monitor reads published rows per
 * channel. Tate's review path is status='tate_review'. Zernio publishing
 * flips status='published'.
 *
 * Why this exists:
 *   The cron-must-be-registered audit (2026-05-18) surfaced that the
 *   marketing crons fire symbolically - there is no downstream queue for
 *   their drafts to land in, so even when they fire they leave no artefact
 *   a human or scheduler can act on. This module is the missing queue.
 *
 * Conventions (matched against workingSetService.js):
 *   - Use the postgres.js db helper at config/db.js.
 *   - Never throw on missing id / bad input - log and return.
 *   - Slice user-content fields to bounded length defensively.
 *   - Em-dashes BANNED in every string we write (CLAUDE.md global rule).
 */

const db = require('../config/db')
const logger = require('../config/logger')

const VALID_CHANNELS = new Set([
  'linkedin','instagram','facebook','x',
  'tiktok','youtube','threads','bluesky',
  'reddit','pinterest','newsletter','blog',
])

const VALID_STATUS = new Set([
  'drafted','tate_review','approved',
  'published','rejected','expired',
])

const MAX_TITLE_LEN = 300
const MAX_BODY_LEN  = 20000
const DEFAULT_EXPIRE_AGE_DAYS = 14

// Em-dash sentinel codepoint. Per CLAUDE.md the U+2014 character must not
// appear in source - we build it from the codepoint at module load.
const EMDASH = String.fromCharCode(0x2014)

function _stripEmdash(s) {
  if (typeof s !== 'string') return s
  return s.includes(EMDASH) ? s.split(EMDASH).join('-') : s
}

/**
 * Draft a new marketing artifact.
 *
 * @param {object} fields
 *   channel         (required) - one of VALID_CHANNELS
 *   kind            (required) - free text: post | carousel | reel | story | long_form
 *   body            (required) - the copy
 *   title           optional
 *   media_urls      optional - array of URLs
 *   metadata        optional - free JSON
 *   status          optional - defaults to 'drafted'
 *   scheduled_for   optional - ISO string or Date
 *   source_cron     optional - which cron produced this
 *   source_pattern  optional - pattern slug if derived from one
 * @returns {Promise<{id: string|null}>}
 */
async function draftArtifact(fields = {}) {
  const {
    channel,
    kind,
    body,
    title = null,
    media_urls = [],
    metadata = {},
    status = 'drafted',
    scheduled_for = null,
    source_cron = null,
    source_pattern = null,
  } = fields

  if (!channel || !VALID_CHANNELS.has(channel)) {
    logger.warn('marketingArtifactStore.draftArtifact: invalid channel', { channel })
    return { id: null }
  }
  if (!kind || typeof kind !== 'string') {
    logger.warn('marketingArtifactStore.draftArtifact: kind required', { kind })
    return { id: null }
  }
  if (!body || typeof body !== 'string') {
    logger.warn('marketingArtifactStore.draftArtifact: body required')
    return { id: null }
  }
  if (status && !VALID_STATUS.has(status)) {
    logger.warn('marketingArtifactStore.draftArtifact: invalid status', { status })
    return { id: null }
  }

  const titleSafe = title ? _stripEmdash(String(title).slice(0, MAX_TITLE_LEN)) : null
  const bodySafe  = _stripEmdash(String(body).slice(0, MAX_BODY_LEN))
  const mediaSafe = Array.isArray(media_urls) ? media_urls : []
  const metaSafe  = (metadata && typeof metadata === 'object') ? metadata : {}

  try {
    const [row] = await db`
      INSERT INTO pending_marketing_artifacts (
        channel, kind, title, body, media_urls, metadata,
        status, scheduled_for, source_cron, source_pattern
      ) VALUES (
        ${channel},
        ${kind},
        ${titleSafe},
        ${bodySafe},
        ${db.json(mediaSafe)},
        ${db.json(metaSafe)},
        ${status},
        ${scheduled_for ? new Date(scheduled_for) : null},
        ${source_cron},
        ${source_pattern}
      )
      RETURNING id
    `
    logger.info('marketingArtifactStore: artifact drafted', {
      id: row.id, channel, kind, status, source_cron,
    })
    return { id: row.id }
  } catch (err) {
    logger.warn('marketingArtifactStore.draftArtifact: failed', { error: err.message })
    return { id: null }
  }
}

/**
 * List pending artifacts, optionally filtered by status + channel.
 * "Pending" defaults to status IN ('drafted','tate_review','approved').
 *
 * @param {object} filters
 *   status   optional - one status, or array, or null for default pending set
 *   channel  optional - one channel filter
 * @returns {Promise<Array>}
 */
async function listPending({ status, channel } = {}) {
  try {
    let statusFilter
    if (Array.isArray(status) && status.length > 0) {
      statusFilter = status
    } else if (typeof status === 'string' && status.length > 0) {
      statusFilter = [status]
    } else {
      statusFilter = ['drafted','tate_review','approved']
    }

    if (channel) {
      return await db`
        SELECT id, channel, kind, title, body, media_urls, metadata,
               status, scheduled_for, published_at, zernio_post_id,
               source_cron, source_pattern, created_at, updated_at
        FROM pending_marketing_artifacts
        WHERE status IN ${db(statusFilter)}
          AND channel = ${channel}
        ORDER BY COALESCE(scheduled_for, created_at) ASC
      `
    }
    return await db`
      SELECT id, channel, kind, title, body, media_urls, metadata,
             status, scheduled_for, published_at, zernio_post_id,
             source_cron, source_pattern, created_at, updated_at
      FROM pending_marketing_artifacts
      WHERE status IN ${db(statusFilter)}
      ORDER BY COALESCE(scheduled_for, created_at) ASC
    `
  } catch (err) {
    logger.warn('marketingArtifactStore.listPending: failed', { error: err.message })
    return []
  }
}

/**
 * Mark an artifact as published. Stamps published_at=NOW() and optionally
 * captures the zernio_post_id for back-reference.
 *
 * @param {string} id
 * @param {object} opts
 *   zernio_post_id  optional - returned by zernio_create_post
 * @returns {Promise<boolean>} true on update, false otherwise
 */
async function markPublished(id, { zernio_post_id = null } = {}) {
  if (!id) {
    logger.warn('marketingArtifactStore.markPublished: id required')
    return false
  }
  try {
    const rows = await db`
      UPDATE pending_marketing_artifacts
      SET status         = 'published',
          published_at   = NOW(),
          zernio_post_id = ${zernio_post_id},
          updated_at     = NOW()
      WHERE id = ${id}
        AND status <> 'published'
      RETURNING id
    `
    if (rows.length === 0) {
      logger.warn('marketingArtifactStore.markPublished: no row updated', { id })
      return false
    }
    logger.info('marketingArtifactStore: artifact marked published', { id, zernio_post_id })
    return true
  } catch (err) {
    logger.warn('marketingArtifactStore.markPublished: failed', { id, error: err.message })
    return false
  }
}

/**
 * Expire stale drafts/reviews older than age_days.
 * Sets status='expired' on rows with status IN ('drafted','tate_review')
 * AND created_at older than the cutoff.
 *
 * @param {object} opts
 *   age_days  default 14
 * @returns {Promise<{expired: number}>}
 */
async function expireStale({ age_days = DEFAULT_EXPIRE_AGE_DAYS } = {}) {
  const days = Number.isFinite(age_days) && age_days > 0 ? age_days : DEFAULT_EXPIRE_AGE_DAYS
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const rows = await db`
      UPDATE pending_marketing_artifacts
      SET status     = 'expired',
          updated_at = NOW()
      WHERE status IN ('drafted','tate_review')
        AND created_at < ${cutoff}
      RETURNING id, channel, status
    `
    if (rows.length > 0) {
      logger.info('marketingArtifactStore: expired stale artifacts', {
        count: rows.length, cutoff_days: days,
      })
    }
    return { expired: rows.length }
  } catch (err) {
    logger.warn('marketingArtifactStore.expireStale: failed', { error: err.message })
    return { expired: 0 }
  }
}

/**
 * List recently published artifacts for a channel within the last N days.
 * Used by marketingCadenceMonitorService to compute days_since_last_post.
 *
 * @param {string} channel
 * @param {number} days   default 30
 * @returns {Promise<Array>}
 */
async function recentByChannel(channel, days = 30) {
  if (!channel || !VALID_CHANNELS.has(channel)) {
    logger.warn('marketingArtifactStore.recentByChannel: invalid channel', { channel })
    return []
  }
  const lookback = Number.isFinite(days) && days > 0 ? days : 30
  try {
    const cutoff = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000)
    return await db`
      SELECT id, channel, kind, title, status, published_at, zernio_post_id,
             source_cron, source_pattern, created_at
      FROM pending_marketing_artifacts
      WHERE channel = ${channel}
        AND published_at IS NOT NULL
        AND published_at >= ${cutoff}
      ORDER BY published_at DESC
    `
  } catch (err) {
    logger.warn('marketingArtifactStore.recentByChannel: failed', { channel, error: err.message })
    return []
  }
}

module.exports = {
  draftArtifact,
  listPending,
  markPublished,
  expireStale,
  recentByChannel,
  // exposed for tests
  VALID_CHANNELS,
  VALID_STATUS,
}

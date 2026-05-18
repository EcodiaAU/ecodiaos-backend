'use strict'

/**
 * clientPulseService - per-client ambient pulse continuity block.
 *
 * Renders <client_pulse client="<slug>">...</client_pulse> when the
 * conductor is doing client-adjacent work. Slug is resolved against the
 * clients table by case-insensitive name match (the durable handle that
 * matches ~/ecodiaos/clients/<slug>.md filenames).
 *
 * Active context lookup: kv_store key `cowork.conductor.context_client`
 * holds the current client slug; renderActiveBlock() reads it and emits
 * the matching pulse, or empty string if no context client is set.
 *
 * Block cap: 1500 bytes (matches workingSetService discipline).
 *
 * Origin: continuity-blocks-are-the-os-pulse-2026-05-18.md.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const CONTEXT_KV_KEY = 'cowork.conductor.context_client'
const OUTREACH_TIME_KV_PREFIX = 'cowork.client_pulse.optimal_outreach_time.'
const BLOCK_BYTE_CAP = 1500

// Tiered staleness thresholds (days). Status-keyed; falls through to prospect.
const TIER_THRESHOLDS_DAYS = {
  retainer: 7,
  ongoing:  7,    // alias - 'ongoing' clients are on retainer cadence
  live:     7,
  active:   14,
  contract: 14,
  development: 14,
  proposal: 21,
  prospect: 21,
  lead:     21,
  dormant:  60,
  archived: 60,
}

// Relationship-temperature thresholds (days since contact).
const TEMP_WARMING_MAX = 7   // <7d - actively engaged
const TEMP_STEADY_MAX  = 21  // 7-21d - regular cadence

// ── Helpers ──────────────────────────────────────────────────────────────────

function _daysSince(iso) {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return null
  const ms = Date.now() - ts
  if (ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function _temperatureFromDays(days) {
  if (days === null || days === undefined) return 'unknown'
  if (days < TEMP_WARMING_MAX) return 'warming'
  if (days < TEMP_STEADY_MAX)  return 'steady'
  return 'cooling'
}

function _normaliseHealthScore(raw) {
  // clients.health_score is NUMERIC(3,2) on a 0-1 scale; surface as 0-100 int.
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const clamped = Math.max(0, Math.min(1, n))
  return Math.round(clamped * 100)
}

async function _readContextSlug() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${CONTEXT_KV_KEY}`
    if (!rows.length) return null
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed.slug === 'string') return parsed.slug
    return null
  } catch (err) {
    logger.warn('clientPulseService: failed to read context client', { error: err.message })
    return null
  }
}

async function _readOptimalOutreachTime(slug) {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${OUTREACH_TIME_KV_PREFIX + slug}`
    if (!rows.length) return '09:00 AEST'
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed.time === 'string') return parsed.time
    return '09:00 AEST'
  } catch (err) {
    logger.warn('clientPulseService: failed to read outreach time', { slug, error: err.message })
    return '09:00 AEST'
  }
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * getClientPulse - resolve a client by slug (case-insensitive name match)
 * and return the pulse shape. Returns null when no matching client row exists.
 *
 * Shape:
 *   {
 *     slug, name, status,
 *     health_score (0-100 int or null),
 *     days_since_contact (int or null),
 *     relationship_temperature ('warming'|'steady'|'cooling'|'unknown'),
 *     predicted_next_touch_reason (stub string),
 *     optimal_outreach_time (string),
 *     staleness_threshold_days (int),
 *     is_overdue (bool),
 *   }
 */
async function getClientPulse(clientSlug) {
  if (!clientSlug || typeof clientSlug !== 'string') {
    logger.warn('clientPulseService.getClientPulse: clientSlug required')
    return null
  }
  const slug = clientSlug.trim().toLowerCase()
  if (!slug) return null
  try {
    const [client] = await db`
      SELECT id, name, status, health_score, last_contact_at
      FROM clients
      WHERE archived_at IS NULL
        AND lower(name) = ${slug}
      LIMIT 1
    `
    if (!client) return null

    const daysSinceContact = _daysSince(client.last_contact_at)
    const threshold = TIER_THRESHOLDS_DAYS[client.status] ?? TIER_THRESHOLDS_DAYS.prospect
    const isOverdue = daysSinceContact !== null && daysSinceContact > threshold

    const optimalOutreachTime = await _readOptimalOutreachTime(slug)

    return {
      slug,
      name: client.name,
      status: client.status,
      health_score: _normaliseHealthScore(client.health_score),
      days_since_contact: daysSinceContact,
      relationship_temperature: _temperatureFromDays(daysSinceContact),
      predicted_next_touch_reason: 'TBD - Haiku integration pending',
      optimal_outreach_time: optimalOutreachTime,
      staleness_threshold_days: threshold,
      is_overdue: isOverdue,
    }
  } catch (err) {
    logger.warn('clientPulseService.getClientPulse: failed', { slug, error: err.message })
    return null
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function _renderShape(pulse) {
  const health = pulse.health_score === null || pulse.health_score === undefined
    ? 'n/a'
    : `${pulse.health_score}/100`
  const days = pulse.days_since_contact === null || pulse.days_since_contact === undefined
    ? 'n/a'
    : `${pulse.days_since_contact}d`
  const overdueTag = pulse.is_overdue ? ' OVERDUE' : ''
  const lines = [
    `<client_pulse client="${pulse.slug}">`,
    `  name: ${pulse.name}`,
    `  status: ${pulse.status}`,
    `  health: ${health}`,
    `  days_since_contact: ${days} (threshold ${pulse.staleness_threshold_days}d)${overdueTag}`,
    `  temperature: ${pulse.relationship_temperature}`,
    `  next_touch_reason: ${pulse.predicted_next_touch_reason}`,
    `  optimal_outreach_time: ${pulse.optimal_outreach_time}`,
    '</client_pulse>',
  ]
  return lines.join('\n')
}

/**
 * renderBlock - return the <client_pulse> block for a given slug, or
 * empty string if the client is unresolved. Hard-capped at BLOCK_BYTE_CAP.
 */
async function renderBlock(clientSlug) {
  const pulse = await getClientPulse(clientSlug)
  if (!pulse) return ''
  const block = _renderShape(pulse)
  if (Buffer.byteLength(block, 'utf8') <= BLOCK_BYTE_CAP) return block
  // Fallback: minimal pulse.
  const minimal = [
    `<client_pulse client="${pulse.slug}">`,
    `  status: ${pulse.status}`,
    `  temperature: ${pulse.relationship_temperature}`,
    '</client_pulse>',
  ].join('\n')
  return minimal
}

/**
 * renderActiveBlock - read the conductor's current context client from
 * kv_store and render its pulse. Returns empty string if no context client
 * is set or the slug resolves to nothing.
 */
async function renderActiveBlock() {
  const slug = await _readContextSlug()
  if (!slug) return ''
  return renderBlock(slug)
}

module.exports = {
  getClientPulse,
  renderBlock,
  renderActiveBlock,
}

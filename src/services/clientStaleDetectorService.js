'use strict'

/**
 * clientStaleDetectorService
 *
 * Cron-fireable. For every non-archived client, computes a tier-based
 * silence threshold from clients.status. Over-threshold clients get an
 * idempotent status_board row flagged for the conductor to draft a
 * re-engagement email + present to Tate.
 *
 * Idempotent: dedup is by (entity_type='client', entity_ref=slug, name)
 * match against active (archived_at IS NULL) status_board rows.
 *
 * Tiers (status substring -> days of silence before flag):
 *   retainer / engaged  -> 7d
 *   active / scoping    -> 14d
 *   prospect / pending  -> 21d
 *   else (dormant etc)  -> 60d
 */

const db = require('../config/db')
const logger = require('../config/logger')

function _slugify(name) {
  if (!name) return 'unknown'
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown'
}

function _tierFor(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('retainer') || s.includes('engaged')) return { tier: 'retainer', days: 7 }
  if (s.includes('active') || s.includes('scoping')) return { tier: 'active', days: 14 }
  if (s.includes('prospect') || s.includes('pending')) return { tier: 'prospect', days: 21 }
  return { tier: 'dormant', days: 60 }
}

function _daysSince(ts) {
  if (!ts) return Infinity
  const ms = Date.now() - new Date(ts).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

async function _existingFlag({ entityRef, name }) {
  const rows = await db`
    SELECT id FROM status_board
    WHERE entity_type = 'client'
      AND entity_ref = ${entityRef}
      AND name = ${name}
      AND archived_at IS NULL
    LIMIT 1
  `
  return rows[0] || null
}

async function _flagClient({ client, silenceDays, tier, dryRun }) {
  const slug = _slugify(client.name)
  const name = `Client silence: ${client.name} (${silenceDays}d no contact)`
  const existing = await _existingFlag({ entityRef: slug, name })
  if (existing) return { flagged: false, reason: 'already_flagged', id: existing.id }

  if (dryRun) return { flagged: true, dryRun: true }

  const context = JSON.stringify({
    client_id: client.id,
    tier,
    silence_days: silenceDays,
    last_contact_at: client.last_contact_at,
    detector: 'clientStaleDetectorService',
  }).slice(0, 4000)

  const inserted = await db`
    INSERT INTO status_board
      (entity_type, entity_ref, name, status, next_action, next_action_by, priority, source, context, last_touched)
    VALUES (
      'client',
      ${slug},
      ${name},
      'stale_threshold_breached',
      'Draft re-engagement email and present to Tate',
      'ecodiaos',
      3,
      'client_stale_detector',
      ${context},
      NOW()
    )
    RETURNING id
  `
  return { flagged: true, id: inserted[0]?.id }
}

async function runOnce({ dryRun = false } = {}) {
  const summary = { checked: 0, flagged: 0, errors: 0, dryRun: !!dryRun }
  let clients
  try {
    clients = await db`
      SELECT id, name, status, last_contact_at
      FROM clients
      WHERE archived_at IS NULL
    `
  } catch (err) {
    logger.warn('clientStaleDetectorService: client query failed', { error: err.message })
    summary.errors++
    return summary
  }

  for (const client of clients) {
    summary.checked++
    try {
      const { tier, days } = _tierFor(client.status)
      const silenceDays = _daysSince(client.last_contact_at)
      if (silenceDays < days) continue
      const res = await _flagClient({ client, silenceDays, tier, dryRun })
      if (res.flagged) summary.flagged++
    } catch (err) {
      summary.errors++
      logger.warn('clientStaleDetectorService: per-client failure', {
        client_id: client.id, error: err.message,
      })
    }
  }

  logger.info('clientStaleDetectorService.runOnce complete', summary)
  return summary
}

module.exports = { runOnce, _tierFor, _slugify }

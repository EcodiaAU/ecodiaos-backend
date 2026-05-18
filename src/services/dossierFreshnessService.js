'use strict'

/**
 * dossierFreshnessService
 *
 * For each non-archived client dossier under backend/clients/<slug>.md,
 * detect drift between the dossier's "Last touched:" stamp (or file mtime
 * fallback) and the max(created_at) of crm_activity_log rows for the
 * matching client. Drift > 7 days flags a status_board row pointing at
 * the dossier so a refresh fork can run.
 *
 * Idempotent: dedup by (entity_type='client', entity_ref=slug,
 *   name='Dossier drift: clients/<slug>.md') against active rows.
 */

const fs = require('fs')
const path = require('path')
const db = require('../config/db')
const logger = require('../config/logger')

const CLIENTS_DIR = path.resolve(__dirname, '..', '..', 'clients')
const DRIFT_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

// Files in clients/ that are not actual client dossiers (release flows,
// architecture notes, audits). Skip these - they aren't tied to a row
// in the clients table.
const NON_DOSSIER_PATTERNS = [
  /^INDEX\.md$/i,
  /^app-release-flow/i,
  /^release-candidate-analysis/i,
  /^macincloud-/i,
  /^corazon-/i,
  /-audit-/i,
  /-diagnostic-/i,
  /-setup-/i,
]

function _isDossierCandidate(filename) {
  if (!filename.endsWith('.md')) return false
  return !NON_DOSSIER_PATTERNS.some((re) => re.test(filename))
}

function _slugFromFilename(filename) {
  return filename.replace(/\.md$/i, '').toLowerCase()
}

function _parseLastTouched(content) {
  // Loose match: "Last touched: 2026-05-18" / "Last touched - 2026-05-18T..." etc.
  const m = content.match(/last\s*touched\s*[:\-]\s*([0-9TZ:\-+ .]+)/i)
  if (!m) return null
  const candidate = m[1].trim().slice(0, 40)
  const d = new Date(candidate)
  return Number.isFinite(d.getTime()) ? d : null
}

async function _findClientForSlug(slug) {
  // Match against clients.name -> slugify -> compare; allow common variants.
  const variants = [
    slug,
    slug.replace(/-/g, ' '),
    slug.replace(/-/g, ''),
  ]
  const rows = await db`
    SELECT id, name FROM clients
    WHERE archived_at IS NULL
      AND (
        lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) = ${slug}
        OR lower(name) = ANY(${variants})
      )
    LIMIT 1
  `
  return rows[0] || null
}

async function _maxActivityAt(clientId) {
  const rows = await db`
    SELECT MAX(created_at) AS max_at
    FROM crm_activity_log
    WHERE client_id = ${clientId}
  `
  return rows[0]?.max_at || null
}

async function _existingFlag(slug, name) {
  const rows = await db`
    SELECT id FROM status_board
    WHERE entity_type = 'client'
      AND entity_ref = ${slug}
      AND name = ${name}
      AND archived_at IS NULL
    LIMIT 1
  `
  return rows[0] || null
}

async function _flagDrift({ slug, client, dossierTs, activityTs, driftDays, dryRun }) {
  const name = `Dossier drift: clients/${slug}.md`
  const existing = await _existingFlag(slug, name)
  if (existing) return { flagged: false, reason: 'already_flagged', id: existing.id }

  if (dryRun) return { flagged: true, dryRun: true }

  const context = JSON.stringify({
    client_id: client?.id || null,
    client_name: client?.name || null,
    dossier_path: `clients/${slug}.md`,
    dossier_last_touched: dossierTs,
    crm_max_activity_at: activityTs,
    drift_days: driftDays,
    detector: 'dossierFreshnessService',
  }).slice(0, 4000)

  const inserted = await db`
    INSERT INTO status_board
      (entity_type, entity_ref, name, status, next_action, next_action_by, priority, source, context, last_touched)
    VALUES (
      'client',
      ${slug},
      ${name},
      'dossier_drift',
      'Refresh dossier from CRM intelligence + crm_activities log',
      'ecodiaos',
      4,
      'dossier_freshness',
      ${context},
      NOW()
    )
    RETURNING id
  `
  return { flagged: true, id: inserted[0]?.id }
}

async function runOnce({ dryRun = false } = {}) {
  const summary = { checked: 0, drifted: 0, skipped: 0, errors: 0, dryRun: !!dryRun }

  let entries
  try {
    entries = fs.readdirSync(CLIENTS_DIR)
  } catch (err) {
    logger.warn('dossierFreshnessService: clients dir read failed', { error: err.message, CLIENTS_DIR })
    summary.errors++
    return summary
  }

  for (const filename of entries) {
    if (!_isDossierCandidate(filename)) {
      summary.skipped++
      continue
    }
    const full = path.join(CLIENTS_DIR, filename)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      summary.skipped++
      continue
    }
    if (!stat.isFile()) {
      summary.skipped++
      continue
    }

    summary.checked++
    const slug = _slugFromFilename(filename)

    try {
      const content = fs.readFileSync(full, 'utf8')
      const parsed = _parseLastTouched(content)
      const dossierTs = parsed || stat.mtime
      const client = await _findClientForSlug(slug)
      if (!client) continue

      const activityTs = await _maxActivityAt(client.id)
      if (!activityTs) continue

      const driftMs = new Date(activityTs).getTime() - new Date(dossierTs).getTime()
      const driftDays = Math.floor(driftMs / MS_PER_DAY)
      if (driftDays <= DRIFT_DAYS) continue

      const res = await _flagDrift({
        slug, client, dossierTs, activityTs, driftDays, dryRun,
      })
      if (res.flagged) summary.drifted++
    } catch (err) {
      summary.errors++
      logger.warn('dossierFreshnessService: per-dossier failure', {
        filename, error: err.message,
      })
    }
  }

  logger.info('dossierFreshnessService.runOnce complete', summary)
  return summary
}

module.exports = { runOnce, _parseLastTouched, _isDossierCandidate }

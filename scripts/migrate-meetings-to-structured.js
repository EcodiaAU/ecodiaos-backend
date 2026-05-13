#!/usr/bin/env node
/**
 * migrate-meetings-to-structured.js
 *
 * Phase 1 backfill: maps existing analysis_json + action_items_json blobs
 * into the StructuredAnalysis v1 schema and writes to the structured_analysis
 * column on meeting_recordings.
 *
 * Only processes meetings WHERE analysis_status='done' AND structured_analysis IS NULL.
 * Idempotent: re-running skips already-migrated rows.
 * Malformed/null analysis_json: skip with warning, do not crash.
 *
 * Usage:
 *   node scripts/migrate-meetings-to-structured.js [--dry-run] [--verbose]
 *
 * Flags:
 *   --dry-run    Log what would be written but do not UPDATE any rows.
 *   --verbose    Log the full structured JSON for each meeting.
 *
 * Origin: fork_mp3d5dpn_a2b6b4 (Phase 1 Meeting Analysis Editor, 2026-05-13).
 */

'use strict'

const { Client } = require('pg')

// ---------------------------------------------------------------------------
// ID prefix map (spec §2.2)
// ---------------------------------------------------------------------------
const ID_PREFIXES = {
  actions:                'ai',
  decisions:              'dec',
  deepdive_sections:      'dd',
  open_questions:         'oq',
  commitments:            'com',
  risks:                  'rsk',
  opportunities:          'opp',
  strategic_implications: 'si',
  themes:                 'thm',
  standout_moments:       'sm',
  people_entities:        'pe',
  participants:           'par',
}

function padNum(n) {
  return String(n).padStart(3, '0')
}

function assignId(prefix, index) {
  return `${prefix}-${padNum(index + 1)}`
}

// ---------------------------------------------------------------------------
// Mapping helpers: raw analysis_json shapes -> structured v1 shapes
// ---------------------------------------------------------------------------

function mapActions(actionItemsJson) {
  if (!Array.isArray(actionItemsJson)) return []
  return actionItemsJson.map((item, i) => ({
    id:              item.id || assignId('ai', i),
    action:          item.action || '',
    owner:           item.owner || 'TBD',
    due:             item.due || null,
    priority:        ['P1', 'P2', 'P3'].includes(item.priority) ? item.priority : 'P2',
    context:         item.context || '',
    source:          item.source === 'explicit' ? 'explicit' : 'implicit',
    depends_on:      [],
    blocking_for:    [],
    timestamp_range: item.timestamp_range || null,
    needs_review:    false,
    review_reason:   null,
  }))
}

function mapDecisions(keyDecisions) {
  if (!Array.isArray(keyDecisions)) return []
  return keyDecisions.map((item, i) => ({
    id:           assignId('dec', i),
    decision:     item.decision || '',
    rationale:    item.rationale || null,
    decided_by:   item.owner || item.decided_by || 'Unknown',
    stakeholders: item.stakeholders || [],
    timestamp:    item.timestamp || null,
    depends_on:   [],
    blocks:       [],
    needs_review: false,
    review_reason: null,
  }))
}

function mapThemes(themes) {
  if (!Array.isArray(themes)) return []
  return themes.map((item, i) => ({
    id:              assignId('thm', i),
    theme:           item.theme || '',
    description:     item.description || '',
    timestamp_range: item.timestamp_range || null,
    weight:          item.weight === 'secondary' ? 'secondary' : 'primary',
    key_speakers:    item.key_speakers || [],
    needs_review:    false,
    review_reason:   null,
  }))
}

function mapRisks(risks) {
  if (!Array.isArray(risks)) return []
  return risks.map((item, i) => ({
    id:           assignId('rsk', i),
    risk:         item.risk || item.description || '',
    severity:     ['high', 'medium', 'low'].includes(item.severity) ? item.severity : 'medium',
    context:      item.context || '',
    references:   [],
    needs_review: false,
    review_reason: null,
  }))
}

function mapOpportunities(opps) {
  if (!Array.isArray(opps)) return []
  return opps.map((item, i) => ({
    id:           assignId('opp', i),
    opportunity:  item.opportunity || item.description || '',
    context:      item.context || '',
    timestamp:    item.timestamp || null,
    needs_review: false,
    review_reason: null,
  }))
}

function mapStrategicImplications(sis) {
  if (!Array.isArray(sis)) return []
  return sis.map((item, i) => ({
    id:           assignId('si', i),
    implication:  item.implication || '',
    timeframe:    ['immediate', 'short-term', 'long-term'].includes(item.timeframe) ? item.timeframe : 'immediate',
    rationale:    item.rationale || '',
    references:   [],
    needs_review: false,
    review_reason: null,
  }))
}

function mapOpenQuestions(oqs) {
  if (!Array.isArray(oqs)) return []
  return oqs.map((item, i) => ({
    id:             assignId('oq', i),
    question:       item.question || '',
    context:        item.context || '',
    blocked_on:     item.blocked_on || null,
    who_owns_answer: item.who_owns_answer || null,
    needs_review:   false,
    review_reason:  null,
  }))
}

function mapCommitments(coms) {
  if (!Array.isArray(coms)) return []
  return coms.map((item, i) => ({
    id:           assignId('com', i),
    commitment:   item.commitment || '',
    owner:        item.owner || 'TBD',
    to_whom:      item.to_whom || null,
    deadline:     item.deadline || null,
    timestamp:    item.timestamp || null,
    context:      item.context || null,
    depends_on:   [],
    needs_review: false,
    review_reason: null,
  }))
}

function mapDeepdiveSections(dds) {
  if (!Array.isArray(dds)) return []
  return dds.map((item, i) => ({
    id:           assignId('dd', i),
    heading:      item.heading || item.title || '',
    content:      item.content || item.body || '',
    references:   [],
    needs_review: false,
    review_reason: null,
  }))
}

function mapStandoutMoments(sms) {
  if (!Array.isArray(sms)) return []
  return sms.map((item, i) => ({
    id:           assignId('sm', i),
    quote:        item.quote || '',
    speaker:      item.speaker || '',
    timestamp:    item.timestamp || null,
    significance: item.significance || '',
    needs_review: false,
    review_reason: null,
  }))
}

function mapPeopleEntities(pes) {
  if (!Array.isArray(pes)) return []
  return pes.map((item, i) => ({
    id:           assignId('pe', i),
    name:         item.name || '',
    role:         item.role || '',
    key_interests: item.key_interests || '',
    stance:       item.stance || null,
    needs_review: false,
    review_reason: null,
  }))
}

function mapParticipants(participants) {
  if (!Array.isArray(participants)) return []
  return participants.map((item, i) => ({
    id:           assignId('par', i),
    name:         item.name || '',
    role:         item.role || null,
    speaker_code: item.speaker_code || item.speaker || null,
    present:      item.present !== false,
  }))
}

function mapSummary(analysisJson) {
  const raw = analysisJson.summary || {}
  return {
    one_line:      raw.one_line || raw.brief || '',
    executive:     raw.executive || raw.executive_summary || raw.body || '',
    sentiment_arc: raw.sentiment_arc || raw.sentiment || '',
  }
}

// ---------------------------------------------------------------------------
// Core: build StructuredAnalysis v1 from raw blobs
// ---------------------------------------------------------------------------
function buildStructuredAnalysis(meetingId, analysisJson, actionItemsJson, analysedAt) {
  const a = analysisJson || {}
  return {
    meeting_id:    meetingId,
    schema_version: '1',
    analysed_at:   analysedAt || new Date().toISOString(),
    last_edited_at: null,

    participants:           mapParticipants(a.participants),
    summary:                mapSummary(a),
    actions:                mapActions(actionItemsJson),
    decisions:              mapDecisions(a.key_decisions),
    deepdive_sections:      mapDeepdiveSections(a.deepdive_sections),
    open_questions:         mapOpenQuestions(a.open_questions),
    commitments:            mapCommitments(a.commitments),
    risks:                  mapRisks(a.risks),
    opportunities:          mapOpportunities(a.opportunities),
    strategic_implications: mapStrategicImplications(a.strategic_implications),
    themes:                 mapThemes(a.themes),
    standout_moments:       mapStandoutMoments(a.standout_moments),
    people_entities:        mapPeopleEntities(a.people_entities),

    email_render: {
      subject:          '',
      recipients:       [],
      body_md:          '',
      last_rendered_at: null,
      dirty:            false,
    },
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2)
  const dryRun  = argv.includes('--dry-run')
  const verbose = argv.includes('--verbose')

  require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not set')
    process.exit(1)
  }

  const db = new Client({ connectionString })
  await db.connect()
  console.log(`migrate-meetings-to-structured: connected (dry-run=${dryRun})`)

  // Fetch all meetings that need backfilling
  const { rows: meetings } = await db.query(`
    SELECT id, analysis_json, action_items_json, analysis_completed_at, title
    FROM meeting_recordings
    WHERE analysis_status = 'done'
      AND structured_analysis IS NULL
    ORDER BY created_at ASC
  `)

  console.log(`Found ${meetings.length} meeting(s) to backfill`)

  let processed = 0
  let skipped   = 0
  let errors    = 0

  for (const row of meetings) {
    const { id, analysis_json, action_items_json, analysis_completed_at, title } = row

    // Skip malformed rows
    if (!analysis_json || typeof analysis_json !== 'object' || Array.isArray(analysis_json)) {
      console.warn(`  SKIP ${id} (${title || 'untitled'}): analysis_json is null or not an object`)
      skipped++
      continue
    }

    try {
      const structured = buildStructuredAnalysis(
        id,
        analysis_json,
        action_items_json,
        analysis_completed_at ? analysis_completed_at.toISOString() : null
      )

      if (verbose) {
        console.log(`  [${id}] structured_analysis:`)
        console.log(JSON.stringify(structured, null, 2))
      } else {
        const actionCount   = structured.actions.length
        const decisionCount = structured.decisions.length
        const themeCount    = structured.themes.length
        console.log(`  BACKFILL ${id} (${title || 'untitled'}): ${actionCount} actions, ${decisionCount} decisions, ${themeCount} themes`)
      }

      if (!dryRun) {
        await db.query(`
          UPDATE meeting_recordings
          SET
            structured_analysis            = $1::jsonb,
            structured_analysis_version    = '1',
            structured_analysis_migrated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(structured), id])
      }

      processed++
    } catch (err) {
      console.error(`  ERROR ${id} (${title || 'untitled'}): ${err.message}`)
      errors++
    }
  }

  await db.end()

  console.log(`\nDone. processed=${processed} skipped=${skipped} errors=${errors}${dryRun ? ' (dry-run, no writes)' : ''}`)
  if (errors > 0) process.exit(1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

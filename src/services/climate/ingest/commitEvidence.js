'use strict'

/**
 * commitEvidence - build the next cd_evidence_items row for INSERT (climate-disclosure W5).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 * Row shape: climate-migrations/002_cd_evidence_items.sql
 *
 * The caller fetches the engagement's existing chain (service-role, dedicated
 * ecodia-climate project) and passes it in; this module computes seq + prev_hash +
 * row_hash via evidenceChain and returns a row ready for INSERT. Pure: no DB, no
 * network, no clock (captured_at comes in on the input).
 *
 * Binding design note: the 002 append-only trigger rejects UPDATE for every role, so
 * BOTH fresh commits and confirmations are appends. A fresh commit appends a new
 * content row; a confirmation appends a superseding row (evidenceChain.confirmEvidence,
 * re-exported here) with supersedes_id pointing at the pending row. History is never
 * rewritten.
 */

const { CONTENT_COLUMNS, hashRow, verifyChain, confirmEvidence } = require('../evidenceChain')

const SOURCE_CHANNELS = ['email', 'workbook', 'api', 'manual']
const CONFIRMATION_STATUSES = ['auto', 'pending_confirmation', 'confirmed']

/**
 * buildEvidenceRow(input, priorRows) -> row ready for INSERT into cd_evidence_items.
 *
 * input carries the content fields (engagement_id, doc_sha256, storage_path,
 * source_channel, document_type, facility, period_start, period_end, scope_category,
 * classifier_version, classification_confidence, payload, supersedes_id,
 * confirmation_status, captured_at). seq, prev_hash and row_hash are computed here and
 * must NOT be supplied. priorRows is the engagement's full existing chain ([] for
 * genesis); it is verified first, because appending to a broken chain would extend
 * corruption.
 */
function buildEvidenceRow(input, priorRows) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildEvidenceRow expects the evidence content input object')
  }
  if (!Array.isArray(priorRows)) {
    throw new TypeError('buildEvidenceRow expects priorRows as an array ([] for genesis)')
  }
  if (input.seq !== undefined || input.prev_hash !== undefined || input.row_hash !== undefined) {
    throw new Error('buildEvidenceRow computes seq/prev_hash/row_hash; do not supply them')
  }
  if (!input.engagement_id) {
    throw new Error('buildEvidenceRow requires engagement_id')
  }
  if (!input.doc_sha256) {
    throw new Error('buildEvidenceRow requires doc_sha256 (hash the document before committing)')
  }
  if (!SOURCE_CHANNELS.includes(input.source_channel)) {
    throw new Error(
      `buildEvidenceRow requires source_channel in (${SOURCE_CHANNELS.join(', ')}), got '${input.source_channel}'`
    )
  }
  if (
    input.confirmation_status !== undefined &&
    !CONFIRMATION_STATUSES.includes(input.confirmation_status)
  ) {
    throw new Error(
      `buildEvidenceRow confirmation_status must be one of (${CONFIRMATION_STATUSES.join(', ')})`
    )
  }

  const { valid, brokenAtSeq } = verifyChain(priorRows)
  if (!valid) {
    throw new Error(`buildEvidenceRow refused: prior chain invalid at seq ${brokenAtSeq}`)
  }

  const sorted = [...priorRows].sort((a, b) => Number(a.seq) - Number(b.seq))
  const head = sorted.length > 0 ? sorted[sorted.length - 1] : null
  if (head && head.engagement_id !== input.engagement_id) {
    throw new Error(
      `buildEvidenceRow refused: prior chain belongs to engagement ${head.engagement_id}, ` +
        `input is for ${input.engagement_id}`
    )
  }

  const row = {}
  for (const col of CONTENT_COLUMNS) {
    row[col] = input[col] === undefined ? null : input[col]
  }
  if (row.confirmation_status === null) row.confirmation_status = 'auto'
  row.seq = head ? Number(head.seq) + 1 : 1
  row.prev_hash = head ? head.row_hash : null
  row.row_hash = hashRow(row, row.prev_hash)
  return row
}

module.exports = {
  buildEvidenceRow,
  // confirmation is append-as-supersede; the constructor lives in evidenceChain and is
  // re-exported here so the ingest surface is one require.
  confirmEvidence,
  SOURCE_CHANNELS,
  CONFIRMATION_STATUSES,
}

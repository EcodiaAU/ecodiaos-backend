'use strict'

/**
 * registerExport - evidence-register export, CSV + JSON (climate-disclosure W6).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * (evidenceRows) -> { csv, json }
 *
 * The auditor-facing projection of cd_evidence_items. Byte-deterministic: the
 * same input rows produce byte-identical output regardless of caller row order,
 * key order, Date-vs-string timestamps, or undefined-vs-null. No clock, no DB,
 * no randomness; every timestamp in the output arrived on an input row.
 *
 * CSV is RFC 4180: CRLF record separators, fields containing comma, double
 * quote, CR or LF are quoted, embedded double quotes doubled. Column order is
 * the cd_evidence_items migration order (002_cd_evidence_items.sql) and is
 * frozen here; appending a column is an export-format version bump, never a
 * reorder.
 */

const { stableStringify, normaliseCell, sortRows } = require('./renderCommon')

/**
 * Frozen export column order = cd_evidence_items column order in
 * climate-migrations/002_cd_evidence_items.sql. Hash-chain columns (prev_hash,
 * row_hash) are exported so the register is independently verifiable from the
 * export alone.
 */
const REGISTER_COLUMNS = Object.freeze([
  'id',
  'engagement_id',
  'seq',
  'doc_sha256',
  'storage_path',
  'source_channel',
  'document_type',
  'facility',
  'period_start',
  'period_end',
  'scope_category',
  'classifier_version',
  'classification_confidence',
  'payload',
  'supersedes_id',
  'prev_hash',
  'row_hash',
  'confirmation_status',
  'captured_at',
  'committed_at',
])

/** RFC 4180: quote when the field contains comma, double quote, CR or LF. */
function csvEscape(value) {
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Render one normalised cell value into its CSV field text (null -> empty). */
function csvCell(value) {
  if (value === null) return ''
  if (typeof value === 'object') return csvEscape(stableStringify(value))
  return csvEscape(value)
}

/**
 * registerExport(evidenceRows) -> { csv, json }
 *
 * Rows are sorted by (engagement_id, seq) so caller fetch order never leaks
 * into the bytes. payload (jsonb) serialises as sorted-key JSON in both
 * outputs. json is a 2-space-indented array of objects in REGISTER_COLUMNS
 * key order, newline-terminated, as is the csv.
 */
function registerExport(evidenceRows) {
  if (!Array.isArray(evidenceRows)) {
    throw new TypeError('registerExport expects an array of cd_evidence_items rows')
  }

  const sorted = sortRows(evidenceRows, ['engagement_id', 'seq'])
  const normalised = sorted.map((row) => {
    const out = {}
    for (const col of REGISTER_COLUMNS) {
      out[col] = normaliseCell(row[col])
    }
    return out
  })

  const lines = [REGISTER_COLUMNS.map(csvEscape).join(',')]
  for (const row of normalised) {
    lines.push(REGISTER_COLUMNS.map((col) => csvCell(row[col])).join(','))
  }
  const csv = lines.join('\r\n') + '\r\n'

  const json = JSON.stringify(normalised, null, 2) + '\n'

  return { csv, json }
}

module.exports = { registerExport, REGISTER_COLUMNS }

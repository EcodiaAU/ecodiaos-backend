'use strict'

/**
 * evidenceChain - the hash-chain layer over cd_evidence_items (climate-disclosure W2).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W2)
 * Why:  drafts/climate-disclosure/03-autonomous-delivery-architecture-2026-06-10.md (s3.3)
 *
 * The evidence register is an append-only hash chain per engagement:
 *   row_hash = sha256(canonical JSON of the content columns + prev_hash)
 * Corrections never rewrite rows; they append superseding rows. An anchor digest of the
 * chain head (cd_anchors) lets an auditor verify the trail existed at the claimed time
 * and has not been rewritten since.
 *
 * Pure functions, no DB dependency: the caller fetches rows (service-role, dedicated
 * ecodia-climate project) and passes them in. That keeps every function trivially
 * testable and keeps this module free of any client-data plumbing.
 *
 * Authored 2026-06-10. Zero external dependencies (node:crypto only).
 */

const crypto = require('crypto')

/**
 * The columns that participate in the row hash. Everything an auditor would call the
 * CONTENT of an evidence item. Deliberately excluded:
 *   - id            (surrogate key, assigned by the DB, not content)
 *   - prev_hash     (mixed into the hash input separately, never hashed into itself)
 *   - row_hash      (the output)
 *   - committed_at  (DB-assigned at commit time, unknowable before the hash is computed)
 * Order here is irrelevant; canonicalise() sorts keys.
 */
const CONTENT_COLUMNS = [
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
  'confirmation_status',
  'captured_at',
]

/** Hash input for the first row of a chain (prev_hash is null/absent). */
const GENESIS_PREV_HASH = ''

/**
 * Normalise a single value into its canonical JSON-able form:
 *   - undefined -> null (missing and null must hash identically)
 *   - Date      -> ISO-8601 UTC string
 *   - plain objects -> keys sorted recursively
 *   - arrays    -> element-wise normalisation, order preserved (order is content)
 */
function normaliseValue(value) {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normaliseValue)
  if (typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = normaliseValue(value[key])
    }
    return out
  }
  return value
}

/**
 * canonicalise(row) -> stable sorted-key JSON string over the content columns.
 * Two rows with the same content always canonicalise identically, regardless of key
 * order, extra non-content fields, or undefined-vs-null representation.
 */
function canonicalise(row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('canonicalise expects an evidence row object')
  }
  const picked = {}
  for (const col of [...CONTENT_COLUMNS].sort()) {
    picked[col] = normaliseValue(row[col])
  }
  return JSON.stringify(picked)
}

/**
 * hashRow(row, prevHash) -> sha256 hex of the canonical content plus the previous link.
 * prevHash null/undefined means genesis (first row of the engagement's chain).
 * The prev hash is length-prefixed out of band of the JSON, so no crafted payload can
 * collide content bytes with link bytes.
 */
function hashRow(row, prevHash) {
  const prev = prevHash == null ? GENESIS_PREV_HASH : String(prevHash)
  const canonical = canonicalise(row)
  return crypto
    .createHash('sha256')
    .update(`${prev.length}:${prev}|`)
    .update(canonical)
    .digest('hex')
}

/**
 * verifyChain(rows) -> { valid, brokenAtSeq }
 *
 * Walks the rows in seq order and recomputes EVERY link:
 *   - seq must be strictly increasing with no duplicates (rows are sorted by seq first,
 *     so caller order does not matter; a duplicate or non-numeric seq breaks the chain)
 *   - row.prev_hash must equal the previous row's row_hash (genesis: null/'' accepted)
 *   - row.row_hash must equal the recomputation over the row's content + prev_hash
 *
 * Returns { valid: true, brokenAtSeq: null } or { valid: false, brokenAtSeq: <seq> }
 * where brokenAtSeq is the seq of the FIRST row that fails. Supersession (a row whose
 * supersedes_id points at an earlier row) is ordinary content and never breaks the chain.
 */
function verifyChain(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('verifyChain expects an array of evidence rows')
  }
  if (rows.length === 0) return { valid: true, brokenAtSeq: null }

  const sorted = [...rows].sort((a, b) => Number(a.seq) - Number(b.seq))

  let prevRowHash = null
  let prevSeq = null
  for (const row of sorted) {
    const seq = Number(row.seq)
    if (!Number.isFinite(seq)) {
      return { valid: false, brokenAtSeq: row.seq ?? null }
    }
    if (prevSeq !== null && seq <= prevSeq) {
      // duplicate seq (unique(engagement_id, seq) should make this impossible in-DB,
      // but the verifier trusts nothing it did not recompute)
      return { valid: false, brokenAtSeq: seq }
    }

    const expectedPrev = prevRowHash == null ? GENESIS_PREV_HASH : prevRowHash
    const rowPrev = row.prev_hash == null ? GENESIS_PREV_HASH : String(row.prev_hash)
    if (rowPrev !== expectedPrev) {
      return { valid: false, brokenAtSeq: seq }
    }

    const recomputed = hashRow(row, prevRowHash)
    if (row.row_hash !== recomputed) {
      return { valid: false, brokenAtSeq: seq }
    }

    prevRowHash = row.row_hash
    prevSeq = seq
  }

  return { valid: true, brokenAtSeq: null }
}

/**
 * buildAnchorDigest(rows) -> the chain-head digest payload for a cd_anchors row.
 *
 * Verifies the chain first and throws on an invalid chain: anchoring a broken chain
 * would notarise corruption. Returns:
 *   { chain_head_hash, seq_from, seq_to, row_count, engagement_id }
 * Caller supplies anchored_to / anchor_ref / anchored_at when inserting the cd_anchors
 * row (timestamps stay externalised so the digest is deterministic).
 */
function buildAnchorDigest(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('buildAnchorDigest expects a non-empty array of evidence rows')
  }
  const { valid, brokenAtSeq } = verifyChain(rows)
  if (!valid) {
    throw new Error(`buildAnchorDigest refused: chain invalid at seq ${brokenAtSeq}`)
  }
  const sorted = [...rows].sort((a, b) => Number(a.seq) - Number(b.seq))
  const head = sorted[sorted.length - 1]
  return {
    engagement_id: head.engagement_id ?? null,
    chain_head_hash: head.row_hash,
    seq_from: Number(sorted[0].seq),
    seq_to: Number(head.seq),
    row_count: sorted.length,
  }
}

module.exports = {
  CONTENT_COLUMNS,
  canonicalise,
  hashRow,
  verifyChain,
  buildAnchorDigest,
}

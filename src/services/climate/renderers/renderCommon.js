'use strict'

/**
 * renderCommon - shared deterministic plumbing for the W6 renderers.
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * Byte-reproducibility is THE verify gate for the pack exporter: the same input
 * rows must produce byte-identical output. Everything here is pure: no clock
 * reads of any kind, no DB, no randomness, no locale-sensitive formatting
 * (the purity-guard test bans the offending identifiers across this directory,
 * comments included). Timestamps only ever arrive on input rows and are
 * normalised to ISO-8601 UTC strings.
 */

/** Normalise a scalar cell: undefined -> null, Date -> ISO-8601 UTC string. */
function normaliseCell(value) {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normaliseCell)
  if (typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = normaliseCell(value[key])
    }
    return out
  }
  return value
}

/** Sorted-key JSON over an already-normalised (or normalisable) value. */
function stableStringify(value) {
  return JSON.stringify(normaliseCell(value))
}

/**
 * sortRows(rows, keys) -> new array sorted by the named keys in order.
 * Comparison is type-aware enough for the cd_* shapes: numbers (and bigints)
 * compare numerically, everything else compares as a string; null/undefined
 * sort first. Stable (Array.prototype.sort is stable on Node >= 12), so equal
 * keys preserve input order; callers wanting full determinism include a unique
 * key (id or seq) as the final sort key.
 */
function sortRows(rows, keys) {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const cmp = compareValues(a[key], b[key])
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

function compareValues(a, b) {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return -1
  if (bNull) return 1
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    return a < b ? -1 : a > b ? 1 : 0
  }
  const as = a instanceof Date ? a.toISOString() : String(a)
  const bs = b instanceof Date ? b.toISOString() : String(b)
  return as < bs ? -1 : as > bs ? 1 : 0
}

/** HTML-escape for interpolated client data (draft text, clause summaries). */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escape a value for a markdown table cell: pipes break the table, raw
 * newlines break the row. Used by the memo and coverage renderers.
 */
function mdCell(value) {
  if (value === null || value === undefined) return ''
  const s = value instanceof Date ? value.toISOString() : String(value)
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * percentText(numerator, denominator) -> 'NN.N' with one decimal, computed in
 * integer arithmetic (round half-up on the tenths digit). Never floats: a
 * coverage percentage is a disclosed-adjacent figure.
 */
function percentText(numerator, denominator) {
  if (denominator === 0) return '0.0'
  const tenths = Math.floor((numerator * 1000 + Math.floor(denominator / 2)) / denominator)
  return `${Math.floor(tenths / 10)}.${tenths % 10}`
}

module.exports = { normaliseCell, stableStringify, sortRows, compareValues, escapeHtml, mdCell, percentText }

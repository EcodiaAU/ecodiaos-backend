'use strict'

/**
 * factorLoader - vintage + effective-date selection over cd_factors rows (climate W3).
 *
 * Row shape per climate-migrations/004_cd_factors.sql:
 *   { id, factor_set, vintage, category, unit, value, effective_from, effective_to, source_url }
 *
 * Pure functions over rows the CALLER fetched (service-role, dedicated
 * ecodia-climate project): no DB access here, so every selection rule is testable
 * without a database. Factor values are decimal strings end to end; this module
 * never parses them into Numbers.
 *
 * Selection semantics:
 *   - filter by category (required), and by factor_set / vintage when given
 *   - when onDate (ISO 'YYYY-MM-DD') is given, the row must be effective:
 *     effective_from <= onDate and (effective_to is null or onDate <= effective_to)
 *   - selectFactor narrows to exactly one row: if several remain, the one with the
 *     LATEST effective_from wins (a newer vintage supersedes without editing old
 *     rows in place); a tie on effective_from is ambiguous and throws, because a
 *     silent arbitrary pick on a disclosed figure is unacceptable.
 */

/** ISO date strings compare correctly as strings; keep it that simple. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertIsoDate(value, label) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new TypeError(`factorLoader: ${label} must be an ISO date string (YYYY-MM-DD), got ${String(value)}`)
  }
}

function rowIsEffectiveOn(row, onDate) {
  if (row.effective_from != null && String(row.effective_from).slice(0, 10) > onDate) return false
  if (row.effective_to != null && String(row.effective_to).slice(0, 10) < onDate) return false
  return true
}

/**
 * selectFactors(factorRows, { category, factorSet, vintage, onDate }) -> row[]
 * All provided criteria are applied; omitted criteria do not filter.
 */
function selectFactors(factorRows, criteria = {}) {
  if (!Array.isArray(factorRows)) {
    throw new TypeError('factorLoader.selectFactors expects an array of cd_factors rows')
  }
  const { category, factorSet, vintage, onDate } = criteria
  if (!category) throw new TypeError('factorLoader.selectFactors: category is required')
  if (onDate !== undefined) assertIsoDate(onDate, 'onDate')

  return factorRows.filter((row) => {
    if (row.category !== category) return false
    if (factorSet !== undefined && row.factor_set !== factorSet) return false
    if (vintage !== undefined && row.vintage !== vintage) return false
    if (onDate !== undefined && !rowIsEffectiveOn(row, onDate)) return false
    return true
  })
}

/**
 * selectFactor(factorRows, criteria) -> exactly one row.
 * Throws when nothing matches (a calc must never proceed on a missing factor) and
 * when the latest-effective_from rule still leaves more than one candidate.
 */
function selectFactor(factorRows, criteria = {}) {
  const matches = selectFactors(factorRows, criteria)
  if (matches.length === 0) {
    throw new Error(
      `factorLoader.selectFactor: no factor row matches ${JSON.stringify(criteria)}`
    )
  }
  if (matches.length === 1) return matches[0]

  // Several rows remain (e.g. vintage omitted): the latest effective_from wins.
  let best = []
  let bestFrom = null
  for (const row of matches) {
    const from = row.effective_from == null ? '' : String(row.effective_from).slice(0, 10)
    if (bestFrom === null || from > bestFrom) {
      bestFrom = from
      best = [row]
    } else if (from === bestFrom) {
      best.push(row)
    }
  }
  if (best.length > 1) {
    throw new Error(
      `factorLoader.selectFactor: ambiguous selection (${best.length} rows share effective_from ${bestFrom}) for ${JSON.stringify(criteria)}`
    )
  }
  return best[0]
}

module.exports = {
  selectFactors,
  selectFactor,
}

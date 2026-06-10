'use strict'

/**
 * inputsHash - stable sha256 over canonicalised calculator inputs (climate W3).
 *
 * Mirrors the canonicalisation approach of ../evidenceChain.js (sorted keys
 * recursively, undefined -> null, Date -> ISO-8601, array order preserved) so the
 * same inputs always hash identical regardless of key order or undefined-vs-null
 * representation. BigInt values normalise to their decimal string (JSON has no
 * BigInt; the string form is exact and stable).
 *
 * The hash binds everything that determines a calc result: the calculator name,
 * the activity rows, the factor vintage, the SELECTED factor rows, and the method
 * election. A factor-vintage bump therefore always produces a new inputs_hash on
 * the new cd_calc_runs row.
 */

const crypto = require('crypto')

/** Same normalisation rules as evidenceChain.normaliseValue, plus BigInt. */
function normaliseValue(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'bigint') return value.toString()
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

/** canonicalise(value) -> stable sorted-key JSON string. */
function canonicalise(value) {
  return JSON.stringify(normaliseValue(value))
}

/** sha256 hex over the canonical form. */
function hashCanonical(value) {
  return crypto.createHash('sha256').update(canonicalise(value)).digest('hex')
}

/**
 * computeInputsHash({ calculator, activityRows, factorVintage, selectedFactors,
 * methodElection }) -> sha256 hex. selectedFactors are sorted by (category,
 * factor_set, effective_from) before hashing so the order of the caller's factor
 * array can never change the hash.
 */
function computeInputsHash({ calculator, activityRows, factorVintage, selectedFactors, methodElection }) {
  const sortedFactors = [...(selectedFactors || [])].sort((a, b) => {
    const ka = `${a.category}|${a.factor_set}|${a.effective_from}`
    const kb = `${b.category}|${b.factor_set}|${b.effective_from}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  return hashCanonical({
    calculator,
    activity_rows: activityRows,
    factor_vintage: factorVintage,
    factors: sortedFactors,
    method_election: methodElection ?? null,
  })
}

module.exports = {
  normaliseValue,
  canonicalise,
  hashCanonical,
  computeInputsHash,
}

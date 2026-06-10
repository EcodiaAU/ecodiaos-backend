'use strict'

/**
 * calcCommon - shared plumbing for the four W3 calculators.
 *
 * Holds the contract pieces every calculator shares: factorVintage validation,
 * per-facility method election (GHG Protocol default; NGER Determination methods
 * allowed for NGER-covered facilities per AASB S2025-1, Dec 2025), evidence-id
 * collection, result assembly and deep-freezing.
 *
 * SPEC DEFECT NOTE (04-substrate-build-spec, W3): the spec contract
 * (activityRows, factorVintage, methodElection) cannot be a pure function if
 * factorVintage is a bare vintage string, because the factors would then have to
 * be read from cd_factors inside the calculator. Resolution: factorVintage is an
 * OBJECT { vintage, factors } where factors is the array of cd_factors rows the
 * caller fetched. A bare string throws with a pointer to this note.
 */

const { computeInputsHash } = require('./inputsHash')
const { toMicro, microToDisplay } = require('./microUnits')

/**
 * Method elections supported in v1 and the cd_factors factor_set each one reads.
 * GHG_PROTOCOL reads the NGA workbook factors; the NGER Determination methods
 * read the NGER Measurement Determination factor set (Method 1 is numerically the
 * NGA default because the NGA workbook is drawn from Determination Schedule 1;
 * Methods 2/3 need facility-specific sampling and are not implementable from
 * published tables, so they are refused in v1 rather than silently approximated).
 */
const ELECTION_FACTOR_SET = {
  GHG_PROTOCOL: 'NGA',
  NGER_METHOD_1: 'NGER_MD',
}

const DEFAULT_ELECTION = 'GHG_PROTOCOL'

/** Validate the { vintage, factors } shape (see spec defect note above). */
function assertFactorVintage(factorVintage, calculator) {
  if (typeof factorVintage === 'string') {
    throw new TypeError(
      `${calculator}: factorVintage must be { vintage, factors } (pure functions cannot read cd_factors; see calcCommon.js spec defect note), got bare string '${factorVintage}'`
    )
  }
  if (!factorVintage || typeof factorVintage !== 'object' || typeof factorVintage.vintage !== 'string' || !Array.isArray(factorVintage.factors)) {
    throw new TypeError(`${calculator}: factorVintage must be { vintage: string, factors: cd_factors rows[] }`)
  }
}

/**
 * resolveElection(methodElection, facility) -> election string for the facility.
 * methodElection: undefined | { default?, perFacility?: { [facility]: election } }.
 * Unknown elections throw: a disclosed figure must never carry a method we did
 * not actually apply.
 */
function resolveElection(methodElection, facility) {
  const election =
    (methodElection && methodElection.perFacility && facility != null && methodElection.perFacility[facility]) ||
    (methodElection && methodElection.default) ||
    DEFAULT_ELECTION
  if (!ELECTION_FACTOR_SET[election]) {
    throw new Error(
      `method election '${election}' unsupported in v1 (supported: ${Object.keys(ELECTION_FACTOR_SET).join(', ')})`
    )
  }
  return election
}

/** factor_set a given election reads from cd_factors. */
function electionFactorSet(election) {
  return ELECTION_FACTOR_SET[election]
}

/** Collect unique evidence ids from rows carrying evidence_id and/or evidence_ids. */
function collectEvidenceIds(activityRows) {
  const out = []
  const seen = new Set()
  for (const row of activityRows) {
    const ids = []
    if (row.evidence_id != null) ids.push(row.evidence_id)
    if (Array.isArray(row.evidence_ids)) ids.push(...row.evidence_ids)
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
  }
  return out
}

/** Recursively freeze a result so a prior run's data is physically immutable. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

/**
 * buildResult(...) -> the frozen { tco2e, breakdown, evidenceIds, inputsHash }
 * contract object. exactTonnes is the EXACT scaled-BigInt sum; it is rounded to
 * micro-tonnes exactly once here (the output boundary), then rendered to the
 * display decimal string. breakdownRows/totalsExtra are display-ready plain JSON.
 */
function buildResult({ calculator, activityRows, factorVintage, methodElection, selectedFactors, exactTonnes, breakdownRows, totalsExtra }) {
  const micro = toMicro(exactTonnes)
  const tco2e = microToDisplay(micro)
  const inputsHash = computeInputsHash({
    calculator,
    activityRows,
    factorVintage: factorVintage.vintage,
    selectedFactors,
    methodElection,
  })
  return deepFreeze({
    tco2e,
    breakdown: {
      calculator,
      factor_vintage: factorVintage.vintage,
      method_election: methodElection ?? { default: DEFAULT_ELECTION },
      rows: breakdownRows,
      totals: { tco2e, tco2e_micro: micro.toString(), ...(totalsExtra || {}) },
    },
    evidenceIds: collectEvidenceIds(activityRows),
    inputsHash,
  })
}

module.exports = {
  ELECTION_FACTOR_SET,
  DEFAULT_ELECTION,
  assertFactorVintage,
  resolveElection,
  electionFactorSet,
  collectEvidenceIds,
  deepFreeze,
  buildResult,
}

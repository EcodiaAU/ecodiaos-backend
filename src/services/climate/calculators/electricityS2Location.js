'use strict'

/**
 * electricityS2Location - scope 2 emissions from purchased electricity,
 * location-based method (state/territory grid average factors).
 *
 * Method (NGA Factors 2025, s2.1, Example 1):
 *
 *   E (t CO2e) = Q (kWh) x EF2 (kg CO2e/kWh) / 1000
 *
 * EF2 is the scope 2 location-based factor for the grid the facility draws from
 * (NGA Table 1). Scope 3 (transmission/distribution losses) is OUT of scope here:
 * this calculator discloses scope 2 only.
 *
 * Contract: (activityRows, factorVintage, methodElection) -> { tco2e, breakdown,
 * evidenceIds, inputsHash }. Pure functions, exact scaled-BigInt arithmetic,
 * rounding once at the micro-tonne output boundary.
 *
 * Activity row shape:
 *   { evidence_id | evidence_ids, facility, grid, quantity_kwh,
 *     period_start?, period_end? }
 *   - grid: e.g. 'NSW_ACT', 'VIC', 'QLD', 'SA', 'WA_SWIS', 'WA_NWIS', 'TAS',
 *           'NT_DKIS', 'NATIONAL' (must match the cd_factors category key)
 *
 * Factor category read from cd_factors:
 *   electricity.location.<grid>.scope2   (kg CO2e/kWh)
 */

const { selectFactor } = require('./factorLoader')
const { parseDecimal, mul, add, shiftScale, toMicro, microToDisplay, roundToScale, isNegative, ZERO } = require('./microUnits')
const { assertFactorVintage, resolveElection, electionFactorSet, buildResult } = require('./calcCommon')

const CALCULATOR = 'electricityS2Location'

function displayExact(dec) {
  return microToDisplay(roundToScale(dec, 6))
}

function electricityS2Location(activityRows, factorVintage, methodElection) {
  if (!Array.isArray(activityRows)) {
    throw new TypeError(`${CALCULATOR}: activityRows must be an array`)
  }
  assertFactorVintage(factorVintage, CALCULATOR)

  const selectedFactors = []
  const breakdownRows = []
  let totalTonnes = ZERO

  for (const row of activityRows) {
    if (!row.grid) {
      throw new TypeError(`${CALCULATOR}: activity row needs grid: ${JSON.stringify(row)}`)
    }
    const quantity = parseDecimal(row.quantity_kwh)
    if (isNegative(quantity)) {
      throw new RangeError(`${CALCULATOR}: negative quantity_kwh refused: ${row.quantity_kwh}`)
    }
    const election = resolveElection(methodElection, row.facility)
    const factorSet = electionFactorSet(election)
    const onDate = row.period_end ? String(row.period_end).slice(0, 10) : undefined
    const factor = selectFactor(factorVintage.factors, {
      category: `electricity.location.${row.grid}.scope2`,
      factorSet,
      vintage: factorVintage.vintage,
      onDate,
    })
    selectedFactors.push(factor)

    // kWh x kg CO2e/kWh -> kg CO2e; /1000 -> tonnes (exact scale shift).
    const rowTonnes = shiftScale(mul(quantity, parseDecimal(factor.value)), 3)
    totalTonnes = add(totalTonnes, rowTonnes)

    breakdownRows.push({
      evidence_id: row.evidence_id ?? null,
      facility: row.facility ?? null,
      grid: row.grid,
      method_election: election,
      factor_set: factorSet,
      quantity_kwh: row.quantity_kwh,
      ef_kg_per_kwh: factor.value,
      tco2e: displayExact(rowTonnes),
      tco2e_micro: toMicro(rowTonnes).toString(),
    })
  }

  return buildResult({
    calculator: CALCULATOR,
    activityRows,
    factorVintage,
    methodElection,
    selectedFactors,
    exactTonnes: totalTonnes,
    breakdownRows,
  })
}

module.exports = { electricityS2Location }

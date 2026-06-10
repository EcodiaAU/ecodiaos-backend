'use strict'

/**
 * fuelCombustionS1 - scope 1 emissions from fuel combustion, stationary + transport
 * (liquid fuels and natural gas; the same method covers solid and gaseous fuels).
 *
 * Method (NGA Factors 2025, "Using emission factors" + s2.2/s2.3; identical in form
 * to NGER (Measurement) Determination 2008 Method 1):
 *
 *   E (t CO2e, per gas) = Q x EC x EF_gas / 1000
 *
 * where Q is the fuel quantity (kL, t, m3 ...), EC the energy content factor
 * (GJ per unit; EC = 1 when Q is already in GJ) and EF_gas the scope 1 emission
 * factor (kg CO2e/GJ) for each of CO2, CH4, N2O. Scope 1 total is the sum of the
 * three gases. All arithmetic is exact scaled-BigInt; rounding happens once, at
 * the output boundary, into micro-tonnes CO2e.
 *
 * Contract: (activityRows, factorVintage, methodElection) -> { tco2e, breakdown,
 * evidenceIds, inputsHash }. Pure: factors arrive in factorVintage.factors
 * (cd_factors rows), never from a DB; no Date.now; no randomness.
 *
 * Activity row shape:
 *   { evidence_id | evidence_ids, facility, fuel_key, segment, quantity, unit,
 *     period_start?, period_end? }
 *   - fuel_key: e.g. 'diesel_oil', 'natural_gas_pipeline', 'lng'
 *   - segment:  e.g. 'stationary', 'transport.post_2004' (picks the factor row
 *               family fuel.<fuel_key>.<segment>.*)
 *   - quantity: decimal STRING (floats are refused by microUnits)
 *   - unit:     'GJ' skips the energy-content step (EC = 1); anything else
 *               requires a fuel.<...>.energy_content factor in matching unit
 */

const { selectFactor } = require('./factorLoader')
const { parseDecimal, mul, add, shiftScale, toMicro, microToDisplay, roundToScale, isNegative, ZERO } = require('./microUnits')
const { assertFactorVintage, resolveElection, electionFactorSet, buildResult } = require('./calcCommon')

const CALCULATOR = 'fuelCombustionS1'
const GASES = ['co2', 'ch4', 'n2o']

/** Render any exact decimal at 6dp for breakdown display (half-up via roundToScale). */
function displayExact(dec) {
  return microToDisplay(roundToScale(dec, 6))
}

function fuelCombustionS1(activityRows, factorVintage, methodElection) {
  if (!Array.isArray(activityRows)) {
    throw new TypeError(`${CALCULATOR}: activityRows must be an array`)
  }
  assertFactorVintage(factorVintage, CALCULATOR)

  const selectedFactors = []
  const breakdownRows = []
  let totalTonnes = ZERO

  for (const row of activityRows) {
    if (!row.fuel_key || !row.segment) {
      throw new TypeError(`${CALCULATOR}: activity row needs fuel_key and segment: ${JSON.stringify(row)}`)
    }
    const quantity = parseDecimal(row.quantity)
    if (isNegative(quantity)) {
      throw new RangeError(`${CALCULATOR}: negative fuel quantity refused: ${row.quantity}`)
    }
    const election = resolveElection(methodElection, row.facility)
    const factorSet = electionFactorSet(election)
    const onDate = row.period_end ? String(row.period_end).slice(0, 10) : undefined
    const base = `fuel.${row.fuel_key}.${row.segment}`
    const pick = (component) => {
      const factor = selectFactor(factorVintage.factors, {
        category: `${base}.${component}`,
        factorSet,
        vintage: factorVintage.vintage,
        onDate,
      })
      selectedFactors.push(factor)
      return factor
    }

    // Energy: Q (GJ) directly, or Q x EC via the published energy content factor.
    let energyGj
    let energyContent = null
    if (row.unit === 'GJ') {
      energyGj = quantity
    } else {
      const ecFactor = pick('energy_content')
      energyContent = ecFactor.value
      energyGj = mul(quantity, parseDecimal(ecFactor.value))
    }

    // Per-gas: energy (GJ) x EF (kg CO2e/GJ) -> kg; /1000 -> tonnes (exact scale shift).
    const gasTonnes = {}
    let rowTonnes = ZERO
    for (const gas of GASES) {
      const efFactor = pick(`ef_${gas}`)
      const tonnes = shiftScale(mul(energyGj, parseDecimal(efFactor.value)), 3)
      gasTonnes[gas] = tonnes
      rowTonnes = add(rowTonnes, tonnes)
    }
    totalTonnes = add(totalTonnes, rowTonnes)

    breakdownRows.push({
      evidence_id: row.evidence_id ?? null,
      facility: row.facility ?? null,
      fuel_key: row.fuel_key,
      segment: row.segment,
      method_election: election,
      factor_set: factorSet,
      quantity: row.quantity,
      unit: row.unit,
      energy_content: energyContent,
      energy_gj: displayExact(energyGj),
      co2_tco2e: displayExact(gasTonnes.co2),
      ch4_tco2e: displayExact(gasTonnes.ch4),
      n2o_tco2e: displayExact(gasTonnes.n2o),
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

module.exports = { fuelCombustionS1 }

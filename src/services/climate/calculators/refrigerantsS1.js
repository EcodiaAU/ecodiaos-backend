'use strict'

/**
 * refrigerantsS1 - scope 1 fugitive emissions from refrigerant leakage.
 *
 * Method (NGA Factors 2025, s3.1 "Calculating emissions from refrigerant leakage"):
 *
 *   E (t CO2e) = GWP x charge (kg) x leakage rate / 1000
 *
 * Two activity bases are supported:
 *   - basis 'leakage_rate': charge_kg x published indicative annual leakage rate
 *     (NGA Table 10, percent) x GWP (NGA Table 11, AR5)
 *   - basis 'topup': quantity_kg of refrigerant purchased/topped up x GWP
 *     (the purchase/top-up method; the top-up IS the leaked amount)
 *
 * Contract: (activityRows, factorVintage, methodElection) -> { tco2e, breakdown,
 * evidenceIds, inputsHash }. Pure functions, exact scaled-BigInt arithmetic,
 * rounding only at the micro-tonne output boundary.
 *
 * Activity row shape:
 *   { evidence_id | evidence_ids, facility, refrigerant, basis,
 *     charge_kg + equipment_type   (basis 'leakage_rate')
 *     quantity_kg                  (basis 'topup'),
 *     period_start?, period_end? }
 *
 * Factor categories read from cd_factors:
 *   refrigerant.<refrigerant>.gwp                 (kg CO2e per kg, AR5 GWP)
 *   refrigerant.leakage_rate.<equipment_type>     (percent per year)
 */

const { selectFactor } = require('./factorLoader')
const { parseDecimal, mul, add, shiftScale, toMicro, microToDisplay, roundToScale, isNegative, ZERO } = require('./microUnits')
const { assertFactorVintage, resolveElection, electionFactorSet, buildResult } = require('./calcCommon')

const CALCULATOR = 'refrigerantsS1'

function displayExact(dec) {
  return microToDisplay(roundToScale(dec, 6))
}

function refrigerantsS1(activityRows, factorVintage, methodElection) {
  if (!Array.isArray(activityRows)) {
    throw new TypeError(`${CALCULATOR}: activityRows must be an array`)
  }
  assertFactorVintage(factorVintage, CALCULATOR)

  const selectedFactors = []
  const breakdownRows = []
  let totalTonnes = ZERO

  for (const row of activityRows) {
    if (!row.refrigerant || !row.basis) {
      throw new TypeError(`${CALCULATOR}: activity row needs refrigerant and basis: ${JSON.stringify(row)}`)
    }
    const election = resolveElection(methodElection, row.facility)
    const factorSet = electionFactorSet(election)
    const onDate = row.period_end ? String(row.period_end).slice(0, 10) : undefined
    const pick = (category) => {
      const factor = selectFactor(factorVintage.factors, {
        category,
        factorSet,
        vintage: factorVintage.vintage,
        onDate,
      })
      selectedFactors.push(factor)
      return factor
    }

    const gwpFactor = pick(`refrigerant.${row.refrigerant}.gwp`)
    const gwp = parseDecimal(gwpFactor.value)

    // Leaked kilograms of refrigerant, per the elected basis.
    let leakedKg
    let leakageRate = null
    if (row.basis === 'leakage_rate') {
      const charge = parseDecimal(row.charge_kg)
      if (isNegative(charge)) throw new RangeError(`${CALCULATOR}: negative charge_kg refused`)
      if (!row.equipment_type) {
        throw new TypeError(`${CALCULATOR}: basis 'leakage_rate' needs equipment_type`)
      }
      const rateFactor = pick(`refrigerant.leakage_rate.${row.equipment_type}`)
      leakageRate = rateFactor.value
      // Published rates are percent: divide by 100 = exact scale shift by 2.
      leakedKg = shiftScale(mul(charge, parseDecimal(rateFactor.value)), 2)
    } else if (row.basis === 'topup') {
      const quantity = parseDecimal(row.quantity_kg)
      if (isNegative(quantity)) throw new RangeError(`${CALCULATOR}: negative quantity_kg refused`)
      leakedKg = quantity
    } else {
      throw new TypeError(`${CALCULATOR}: unknown basis '${row.basis}' (leakage_rate | topup)`)
    }

    // kg refrigerant x GWP -> kg CO2e; /1000 -> tonnes (exact scale shift).
    const rowTonnes = shiftScale(mul(leakedKg, gwp), 3)
    totalTonnes = add(totalTonnes, rowTonnes)

    breakdownRows.push({
      evidence_id: row.evidence_id ?? null,
      facility: row.facility ?? null,
      refrigerant: row.refrigerant,
      basis: row.basis,
      method_election: election,
      factor_set: factorSet,
      gwp: gwpFactor.value,
      equipment_type: row.equipment_type ?? null,
      leakage_rate_percent: leakageRate,
      charge_kg: row.charge_kg ?? null,
      quantity_kg: row.quantity_kg ?? null,
      leaked_kg: displayExact(leakedKg),
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

module.exports = { refrigerantsS1 }

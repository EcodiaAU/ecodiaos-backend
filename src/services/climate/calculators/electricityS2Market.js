'use strict'

/**
 * electricityS2Market - scope 2 emissions from purchased electricity,
 * market-based method (residual mix factor + contractual instruments).
 *
 * Method (NGA Factors 2025, s2.1 "market-based method", Example 2):
 *
 *   residual kWh = (Q - Qexempt) x (1 - (RPP + JRPP))
 *                  + Qexempt x (1 - RPP)
 *                  - (RECsurr - REConsite) x 1,000
 *   E (t CO2e)   = residual kWh x RMF1 (kg CO2e/kWh) / 1,000
 *
 * where Q is purchased/acquired kWh, Qexempt the RET-exempt kWh, RPP the RET
 * Renewable Power Percentage (fraction), JRPP the jurisdictional renewable power
 * percentage (fraction; ACT only today), RECsurr the eligible voluntarily
 * surrendered certificates in MWh (LGCs < 36 months old, GreenPower), REConsite
 * the on-site generation certificates in MWh, and RMF1 the scope 2 residual mix
 * factor (NGA Table 2). The residual is floored at zero per facility: surplus
 * instruments never go negative on a disclosed figure.
 *
 * RPP/JRPP/RECs are activity inputs (facility-year contractual/regulatory data,
 * evidenced like any other activity), not emission factors; only the RMF comes
 * from cd_factors.
 *
 * Contract: (activityRows, factorVintage, methodElection) -> { tco2e, breakdown,
 * evidenceIds, inputsHash }. Pure functions, exact scaled-BigInt arithmetic,
 * rounding once at the micro-tonne output boundary.
 *
 * Activity row shape (one row per facility-year):
 *   { evidence_id | evidence_ids, facility, quantity_kwh, exempt_kwh?,
 *     rpp, jrpp?, recs_surrendered_mwh?, recs_onsite_mwh?,
 *     period_start?, period_end? }
 *   All numeric fields are decimal STRINGS (fractions for rpp/jrpp, e.g. '0.18195').
 *
 * Factor category read from cd_factors:
 *   electricity.market.residual_mix.scope2   (kg CO2e/kWh)
 */

const { selectFactor } = require('./factorLoader')
const { parseDecimal, mul, add, sub, shiftScale, toMicro, microToDisplay, roundToScale, isNegative, ZERO } = require('./microUnits')
const { assertFactorVintage, resolveElection, electionFactorSet, buildResult } = require('./calcCommon')

const CALCULATOR = 'electricityS2Market'
const ONE = { units: 1n, scale: 0 }

function displayExact(dec) {
  return microToDisplay(roundToScale(dec, 6))
}

function electricityS2Market(activityRows, factorVintage, methodElection) {
  if (!Array.isArray(activityRows)) {
    throw new TypeError(`${CALCULATOR}: activityRows must be an array`)
  }
  assertFactorVintage(factorVintage, CALCULATOR)

  const selectedFactors = []
  const breakdownRows = []
  let totalTonnes = ZERO

  for (const row of activityRows) {
    const quantity = parseDecimal(row.quantity_kwh)
    if (isNegative(quantity)) {
      throw new RangeError(`${CALCULATOR}: negative quantity_kwh refused: ${row.quantity_kwh}`)
    }
    const exempt = parseDecimal(row.exempt_kwh ?? '0')
    const rpp = parseDecimal(row.rpp ?? '0')
    const jrpp = parseDecimal(row.jrpp ?? '0')
    const recsSurrMwh = parseDecimal(row.recs_surrendered_mwh ?? '0')
    const recsOnsiteMwh = parseDecimal(row.recs_onsite_mwh ?? '0')

    const election = resolveElection(methodElection, row.facility)
    const factorSet = electionFactorSet(election)
    const onDate = row.period_end ? String(row.period_end).slice(0, 10) : undefined
    const rmfFactor = selectFactor(factorVintage.factors, {
      category: 'electricity.market.residual_mix.scope2',
      factorSet,
      vintage: factorVintage.vintage,
      onDate,
    })
    selectedFactors.push(rmfFactor)

    // Residual electricity after RET, jurisdictional surrender and voluntary
    // instruments (all exact; MWh -> kWh is x 1000, an integer multiply).
    const liable = mul(sub(quantity, exempt), sub(ONE, add(rpp, jrpp)))
    const exemptPart = mul(exempt, sub(ONE, rpp))
    const instrumentsKwh = mul(sub(recsSurrMwh, recsOnsiteMwh), { units: 1000n, scale: 0 })
    let residualKwh = sub(add(liable, exemptPart), instrumentsKwh)
    const flooredAtZero = isNegative(residualKwh)
    if (flooredAtZero) residualKwh = ZERO

    // kWh x kg CO2e/kWh -> kg CO2e; /1000 -> tonnes (exact scale shift).
    const rowTonnes = shiftScale(mul(residualKwh, parseDecimal(rmfFactor.value)), 3)
    totalTonnes = add(totalTonnes, rowTonnes)

    breakdownRows.push({
      evidence_id: row.evidence_id ?? null,
      facility: row.facility ?? null,
      method_election: election,
      factor_set: factorSet,
      quantity_kwh: row.quantity_kwh,
      exempt_kwh: row.exempt_kwh ?? '0',
      rpp: row.rpp ?? '0',
      jrpp: row.jrpp ?? '0',
      recs_surrendered_mwh: row.recs_surrendered_mwh ?? '0',
      recs_onsite_mwh: row.recs_onsite_mwh ?? '0',
      residual_kwh: displayExact(residualKwh),
      floored_at_zero: flooredAtZero,
      rmf_kg_per_kwh: rmfFactor.value,
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

module.exports = { electricityS2Market }

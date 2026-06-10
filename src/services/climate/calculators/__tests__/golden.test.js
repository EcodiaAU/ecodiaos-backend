'use strict'

/**
 * Golden suite (climate W3 verify gate): every fixture recomputes its published
 * NGA Factors 2025 / NGER Determination figure EXACTLY, in integer micro-tonnes,
 * and the workbook's own rounded published figures are reproduced by rounding
 * our exact result (never the other way round).
 */

const fixtures = require('./fixtures')
const calculators = require('../index')
const { parseDecimal, mul, shiftScale, toMicro, microToDisplay } = require('../microUnits')

/** exact t CO2e (micro BigInt) of quantity x factor / 1000 (kg -> t). */
function microOf(quantityStr, factorStr) {
  return toMicro(shiftScale(mul(parseDecimal(quantityStr), parseDecimal(factorStr)), 3))
}

describe.each(fixtures)('golden: $name', (fixture) => {
  const run = () =>
    calculators[fixture.calculator](fixture.activityRows, fixture.factorVintage, fixture.methodElection)

  test('recomputes the published figure exactly (micro-tonnes)', () => {
    const result = run()
    expect(result.tco2e).toBe(fixture.expected.tco2e)
    expect(result.breakdown.totals.tco2e_micro).toBe(fixture.expected.tco2eMicro)
    expect(result.breakdown.factor_vintage).toBe(fixture.factorVintage.vintage)
    expect(typeof result.inputsHash).toBe('string')
    expect(result.inputsHash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('breakdown rows match the fixture expectations and echo the election', () => {
    const result = run()
    expect(result.breakdown.rows).toHaveLength(fixture.activityRows.length)
    for (const row of result.breakdown.rows) {
      expect(row.method_election).toBeTruthy()
      expect(row.factor_set).toBeTruthy()
    }
    if (fixture.expected.rows) {
      fixture.expected.rows.forEach((expectedRow, i) => {
        expect(result.breakdown.rows[i]).toMatchObject(expectedRow)
      })
    }
  })

  test('evidence ids flow through', () => {
    const result = run()
    expect(result.evidenceIds).toEqual(fixture.activityRows.map((r) => r.evidence_id))
  })
})

describe('published combined-figure crosschecks (scope 2/1 result + published scope 3 portion reproduces the workbook total)', () => {
  const byName = Object.fromEntries(fixtures.map((f) => [f.name, f]))
  const resultOf = (f) => calculators[f.calculator](f.activityRows, f.factorVintage, f.methodElection)

  test('Example 6: diesel scopes 1+3 combined = published 2,364.3 t (1dp)', () => {
    const f = byName['nga2025-example6-stationary-diesel']
    const r = resultOf(f)
    const s3 = microOf(f.expected.crosscheck.energy_gj, f.expected.crosscheck.scope3_ef_kg_per_gj)
    const combined = BigInt(r.breakdown.totals.tco2e_micro) + s3
    expect(microToDisplay(combined, 1)).toBe(f.expected.crosscheck.published_combined_s1_s3_tco2e_1dp)
  })

  test('Example 4: natural gas scopes 1+3 combined = published 6,463 t', () => {
    const f = byName['nga2025-example4-natural-gas']
    const r = resultOf(f)
    const s3 = microOf(f.expected.crosscheck.energy_gj, f.expected.crosscheck.scope3_ef_kg_per_gj)
    const combined = BigInt(r.breakdown.totals.tco2e_micro) + s3
    expect(microToDisplay(combined, 0)).toBe(f.expected.crosscheck.published_combined_s1_s3_tco2e_0dp)
  })

  test('Example 5: LNG total rounds to the published 1,499 t', () => {
    const f = byName['nga2025-example5-lng']
    const r = resultOf(f)
    expect(microToDisplay(BigInt(r.breakdown.totals.tco2e_micro), 0)).toBe(
      f.expected.crosscheck.published_total_tco2e_0dp
    )
  })

  test('Example 7: transport diesel scopes 1+3 combined = published 33,817 t', () => {
    const f = byName['nga2025-example7-transport-diesel']
    const r = resultOf(f)
    const s3 = microOf(f.expected.crosscheck.energy_gj, f.expected.crosscheck.scope3_ef_kg_per_gj)
    const combined = BigInt(r.breakdown.totals.tco2e_micro) + s3
    expect(microToDisplay(combined, 0)).toBe(f.expected.crosscheck.published_combined_s1_s3_tco2e_0dp)
  })

  test('Example 8: refrigerant result rounds to the published 0.2020 t (4dp)', () => {
    const f = byName['nga2025-example8-refrigerant-r410a']
    const r = resultOf(f)
    expect(microToDisplay(BigInt(r.breakdown.totals.tco2e_micro), 4)).toBe(
      f.expected.crosscheck.published_tco2e_4dp
    )
  })

  test('Example 1: per-grid scope 2 + published scope 3 = published 7,571 / 12,702 / 20,273 t', () => {
    const f = byName['nga2025-example1-electricity-location']
    const r = resultOf(f)
    let combinedTotal = 0n
    f.expected.crosscheck.scope3.forEach((s3spec, i) => {
      const s3 = microOf(s3spec.quantity_kwh, s3spec.ef3_kg_per_kwh)
      const combined = BigInt(r.breakdown.rows[i].tco2e_micro) + s3
      expect(microToDisplay(combined, 0)).toBe(s3spec.published_combined_tco2e)
      combinedTotal += combined
    })
    expect(microToDisplay(combinedTotal, 0)).toBe(f.expected.crosscheck.published_combined_total_tco2e)
  })

  test('Example 2: market-based scope 2 + scope 3 RMF portion = published 7,768.4 t (1dp)', () => {
    const f = byName['nga2025-example2-electricity-market']
    const r = resultOf(f)
    const s3 = microOf(f.expected.crosscheck.residual_kwh, f.expected.crosscheck.scope3_rmf_kg_per_kwh)
    const combined = BigInt(r.breakdown.totals.tco2e_micro) + s3
    expect(microToDisplay(combined, 1)).toBe(f.expected.crosscheck.published_combined_tco2e_1dp)
  })
})

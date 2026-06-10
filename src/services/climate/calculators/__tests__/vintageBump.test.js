'use strict'

/**
 * Factor-vintage bump (climate W3 verify gate): bumping the vintage changes
 * tco2e and the inputsHash, while the ORIGINAL result object stays untouched.
 * In cd_calc_runs terms: a recalc produces a NEW row; the old run's data is
 * immutable (the result objects are deep-frozen, so mutation physically throws
 * in strict mode).
 *
 * The bump is a real published one: NSW/ACT location-based scope 2 moved
 * 0.66 (NGA Factors 2024, Table 1) -> 0.64 (NGA Factors 2025, Table 1).
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2024.xlsx
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 */

const { electricityS2Location } = require('../electricityS2Location')

const SRC_2024 = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2024.xlsx'
const SRC_2025 = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx'

const FACTORS_2024 = [
  { id: 'nsw-2024', factor_set: 'NGA', vintage: '2024', category: 'electricity.location.NSW_ACT.scope2', unit: 'kg CO2-e/kWh', value: '0.66', effective_from: '2024-07-01', effective_to: '2025-06-30', source_url: SRC_2024 },
]
const FACTORS_2025 = [
  { id: 'nsw-2025', factor_set: 'NGA', vintage: '2025', category: 'electricity.location.NSW_ACT.scope2', unit: 'kg CO2-e/kWh', value: '0.64', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: SRC_2025 },
]

// 11,300,000 kWh (the NGA Example 1 NSW quantity), with the activity period
// matching each vintage's effective window.
const rowsFor = (periodStart, periodEnd) => [
  {
    evidence_id: '00000000-0000-0000-0000-0000000000d1',
    facility: 'NSW Operations',
    grid: 'NSW_ACT',
    quantity_kwh: '11300000',
    period_start: periodStart,
    period_end: periodEnd,
  },
]

describe('factor-vintage bump', () => {
  test('bump changes tco2e and inputsHash; the prior result object is untouched and frozen', () => {
    const rows2024 = rowsFor('2024-07-01', '2025-06-30')
    const original = electricityS2Location(rows2024, { vintage: '2024', factors: FACTORS_2024 }, undefined)
    const snapshot = JSON.parse(JSON.stringify(original))

    // 11,300,000 x 0.66 / 1000 = 7,458 t CO2-e under the 2024 vintage
    expect(original.tco2e).toBe('7458.000000')

    const bumped = electricityS2Location(
      rowsFor('2025-07-01', '2026-06-30'),
      { vintage: '2025', factors: FACTORS_2025 },
      undefined
    )

    // 11,300,000 x 0.64 / 1000 = 7,232 t CO2-e under the 2025 vintage
    expect(bumped.tco2e).toBe('7232.000000')
    expect(bumped.tco2e).not.toBe(original.tco2e)
    expect(bumped.inputsHash).not.toBe(original.inputsHash)

    // the original result object is byte-identical to its pre-bump snapshot
    expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot)

    // and physically immutable: results are deep-frozen, so a mutation attempt
    // throws in strict mode rather than silently rewriting a prior run's data
    expect(Object.isFrozen(original)).toBe(true)
    expect(Object.isFrozen(original.breakdown.totals)).toBe(true)
    expect(() => {
      original.tco2e = '0'
    }).toThrow(TypeError)
    expect(() => {
      original.breakdown.totals.tco2e_micro = '0'
    }).toThrow(TypeError)
  })

  test('same vintage re-run reproduces the identical hash (the bump, not time, is the only change agent)', () => {
    const rows = rowsFor('2024-07-01', '2025-06-30')
    const a = electricityS2Location(rows, { vintage: '2024', factors: FACTORS_2024 }, undefined)
    const b = electricityS2Location(rows, { vintage: '2024', factors: FACTORS_2024 }, undefined)
    expect(b.inputsHash).toBe(a.inputsHash)
    expect(b).toEqual(a)
  })
})

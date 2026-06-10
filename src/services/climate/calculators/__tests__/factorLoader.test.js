'use strict'

/**
 * factorLoader effective-date selection tests (climate W3 verify gate).
 *
 * The NSW/ACT location-based scope 2 factor really did move 0.66 -> 0.64 between
 * the 2024 and 2025 NGA vintages, so the vintage rows here are the published ones:
 *   NGA Factors 2024 Table 1: 0.66 kg CO2-e/kWh
 *     https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2024.xlsx
 *   NGA Factors 2025 Table 1: 0.64 kg CO2-e/kWh
 *     https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 */

const { selectFactor, selectFactors } = require('../factorLoader')

const CATEGORY = 'electricity.location.NSW_ACT.scope2'
const NSW_2024 = {
  id: 'nsw-2024',
  factor_set: 'NGA',
  vintage: '2024',
  category: CATEGORY,
  unit: 'kg CO2-e/kWh',
  value: '0.66',
  effective_from: '2024-07-01',
  effective_to: '2025-06-30',
  source_url: 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2024.xlsx',
}
const NSW_2025 = {
  id: 'nsw-2025',
  factor_set: 'NGA',
  vintage: '2025',
  category: CATEGORY,
  unit: 'kg CO2-e/kWh',
  value: '0.64',
  effective_from: '2025-07-01',
  effective_to: '2026-06-30',
  source_url: 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx',
}
const ROWS = [NSW_2024, NSW_2025]

describe('selectFactors', () => {
  test('filters by category', () => {
    expect(selectFactors(ROWS, { category: CATEGORY })).toHaveLength(2)
    expect(selectFactors(ROWS, { category: 'electricity.location.VIC.scope2' })).toHaveLength(0)
  })

  test('filters by vintage and factor_set', () => {
    expect(selectFactors(ROWS, { category: CATEGORY, vintage: '2024' })).toEqual([NSW_2024])
    expect(selectFactors(ROWS, { category: CATEGORY, factorSet: 'NGER_MD' })).toHaveLength(0)
  })

  test('category is required and onDate must be ISO', () => {
    expect(() => selectFactors(ROWS, {})).toThrow(/category is required/)
    expect(() => selectFactors(ROWS, { category: CATEGORY, onDate: 'June 2025' })).toThrow(/ISO date/)
    expect(() => selectFactors('rows', { category: CATEGORY })).toThrow(/array/)
  })
})

describe('selectFactor effective-date selection', () => {
  test('onDate picks the vintage whose effective window covers the date', () => {
    expect(selectFactor(ROWS, { category: CATEGORY, onDate: '2025-03-31' })).toBe(NSW_2024)
    expect(selectFactor(ROWS, { category: CATEGORY, onDate: '2025-07-01' })).toBe(NSW_2025)
    expect(selectFactor(ROWS, { category: CATEGORY, onDate: '2026-06-30' })).toBe(NSW_2025)
  })

  test('window edges are inclusive on both ends', () => {
    expect(selectFactor(ROWS, { category: CATEGORY, onDate: '2024-07-01' })).toBe(NSW_2024)
    expect(selectFactor(ROWS, { category: CATEGORY, onDate: '2025-06-30' })).toBe(NSW_2024)
  })

  test('a date outside every window throws (never a silent fallback)', () => {
    expect(() => selectFactor(ROWS, { category: CATEGORY, onDate: '2023-01-01' })).toThrow(/no factor row/)
    expect(() => selectFactor(ROWS, { category: CATEGORY, onDate: '2027-01-01' })).toThrow(/no factor row/)
  })

  test('open-ended rows: latest effective_from wins when several are effective', () => {
    const openEnded = [
      { ...NSW_2024, id: 'open-2024', effective_to: null },
      { ...NSW_2025, id: 'open-2025', effective_to: null },
    ]
    const picked = selectFactor(openEnded, { category: CATEGORY, onDate: '2025-12-01' })
    expect(picked.id).toBe('open-2025')
    expect(picked.value).toBe('0.64')
  })

  test('a true tie on effective_from is ambiguous and throws', () => {
    const tied = [
      { ...NSW_2025, id: 'dup-a' },
      { ...NSW_2025, id: 'dup-b', value: '0.99' },
    ]
    expect(() => selectFactor(tied, { category: CATEGORY, onDate: '2025-12-01' })).toThrow(/ambiguous/)
  })

  test('no match at all throws with the criteria in the message', () => {
    expect(() => selectFactor(ROWS, { category: 'refrigerant.R32.gwp' })).toThrow(/no factor row matches/)
  })
})

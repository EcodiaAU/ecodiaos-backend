'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 5 Calculation of emissions from liquefied natural gas consumption"
 * and Table 5 (LNG: EC 25.3 GJ/kL, EF CO2 51.4 / CH4 0.1 / N2O 0.03 kg CO2-e/GJ).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: a facility consumes 1,150 kL of LNG (no scope 3
 * factor exists for LNG, so the example is scope 1 only). Published figures:
 *   CO2 1,495 t; CH4 3 t; N2O 1 t; total 1,499 t CO2-e.
 * Exact recomputation: 1,150 x 25.3 x 51.53 / 1000 = 1,499.26535 t CO2-e.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example5-lng',
  calculator: 'fuelCombustionS1',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 5 + Table 5',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex5-ec', factor_set: 'NGA', vintage: '2025', category: 'fuel.lng.stationary.energy_content', unit: 'GJ/kL', value: '25.3', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex5-co2', factor_set: 'NGA', vintage: '2025', category: 'fuel.lng.stationary.ef_co2', unit: 'kg CO2-e/GJ', value: '51.4', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex5-ch4', factor_set: 'NGA', vintage: '2025', category: 'fuel.lng.stationary.ef_ch4', unit: 'kg CO2-e/GJ', value: '0.1', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex5-n2o', factor_set: 'NGA', vintage: '2025', category: 'fuel.lng.stationary.ef_n2o', unit: 'kg CO2-e/GJ', value: '0.03', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000e5',
      facility: 'LNG Site',
      fuel_key: 'lng',
      segment: 'stationary',
      quantity: '1150',
      unit: 'kL',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '1499.265350',
    tco2eMicro: '1499265350',
    rows: [
      { co2_tco2e: '1495.483000', ch4_tco2e: '2.909500', n2o_tco2e: '0.872850' },
    ],
    crosscheck: {
      energy_gj: '29095',
      published_total_tco2e_0dp: '1499',
    },
  },
}

'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 4 Calculation of emissions from natural gas consumption" and Table 5
 * (gaseous fuels: natural gas distributed in a pipeline, EF CO2 51.4 / CH4 0.1 /
 * N2O 0.03 kg CO2-e/GJ, combined 51.53).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: a facility in Sydney NSW consumes 100,000 GJ of
 * pipeline natural gas (Q already in GJ, so EC = 1). Published figures:
 *   CO2 5,140 t; CH4 10 t; N2O 3 t; scope 3 (Table 6 NSW metro, 13.1) 1,310 t;
 *   combined 6,463 t CO2-e.
 * Exact scope 1 recomputation: 100,000 x 51.53 / 1000 = 5,153 t CO2-e exactly.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example4-natural-gas',
  calculator: 'fuelCombustionS1',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 4 + Table 5',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex4-co2', factor_set: 'NGA', vintage: '2025', category: 'fuel.natural_gas_pipeline.stationary.ef_co2', unit: 'kg CO2-e/GJ', value: '51.4', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex4-ch4', factor_set: 'NGA', vintage: '2025', category: 'fuel.natural_gas_pipeline.stationary.ef_ch4', unit: 'kg CO2-e/GJ', value: '0.1', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex4-n2o', factor_set: 'NGA', vintage: '2025', category: 'fuel.natural_gas_pipeline.stationary.ef_n2o', unit: 'kg CO2-e/GJ', value: '0.03', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000e4',
      facility: 'Sydney Plant',
      fuel_key: 'natural_gas_pipeline',
      segment: 'stationary',
      quantity: '100000',
      unit: 'GJ',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '5153.000000',
    tco2eMicro: '5153000000',
    rows: [
      { co2_tco2e: '5140.000000', ch4_tco2e: '10.000000', n2o_tco2e: '3.000000' },
    ],
    crosscheck: {
      energy_gj: '100000',
      scope3_ef_kg_per_gj: '13.1',
      published_combined_s1_s3_tco2e_0dp: '6463',
    },
  },
}

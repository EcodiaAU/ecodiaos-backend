'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW, published
 * for the 2025-26 reporting year), "Example 6 Calculation of emissions from
 * stationary diesel oil consumption" and Table 8 (liquid fuels, stationary).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 *   https://www.dcceew.gov.au/climate-change/publications/national-greenhouse-accounts-factors-2025
 * Factor vintage: NGA Factors 2025 (Table 8: diesel oil EC 38.6 GJ/kL,
 * EF CO2 69.9 / CH4 0.1 / N2O 0.2 kg CO2-e/GJ, scope 3 17.3 kg CO2-e/GJ).
 *
 * Published worked example: a facility consumes 700 kL of diesel oil in an
 * on-site generator. Published figures (rounded to 0.1 t in the workbook):
 *   CO2 1,888.7 t; CH4 2.7 t; N2O 5.4 t; scope 3 467.4 t; combined 2,364.3 t.
 * Exact scope 1 recomputation: 700 x 38.6 x 70.2 / 1000 = 1,896.804 t CO2-e.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example6-stationary-diesel',
  calculator: 'fuelCombustionS1',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 6 + Table 8',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex6-ec', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.stationary.energy_content', unit: 'GJ/kL', value: '38.6', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex6-co2', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_co2', unit: 'kg CO2-e/GJ', value: '69.9', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex6-ch4', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_ch4', unit: 'kg CO2-e/GJ', value: '0.1', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex6-n2o', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_n2o', unit: 'kg CO2-e/GJ', value: '0.2', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000e6',
      facility: 'Generator Site',
      fuel_key: 'diesel_oil',
      segment: 'stationary',
      quantity: '700',
      unit: 'kL',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '1896.804000',
    tco2eMicro: '1896804000',
    rows: [
      { co2_tco2e: '1888.698000', ch4_tco2e: '2.702000', n2o_tco2e: '5.404000' },
    ],
    // Published rounded figures from the workbook (scope 3 EF 17.3 kg CO2-e/GJ,
    // energy 27,020 GJ): combined scopes 1+3 = 2,364.3 t CO2-e.
    crosscheck: {
      energy_gj: '27020',
      scope3_ef_kg_per_gj: '17.3',
      published_combined_s1_s3_tco2e_1dp: '2364.3',
    },
  },
}

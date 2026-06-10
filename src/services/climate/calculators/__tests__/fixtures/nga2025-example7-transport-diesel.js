'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 7 Calculation of emissions from diesel oil consumption for transport"
 * and Table 9 (transport fuels).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: a freight company consumes 10,000 kL of automotive
 * diesel in vehicles manufactured after 2004. Published figures:
 *   CO2 26,981 t; CH4 4 t; N2O 154 t; scope 3 6,677 t; combined 33,817 t CO2-e,
 *   with combined EF printed as 87.61 kg CO2-e/GJ.
 *
 * WORKBOOK-INTERNAL INCONSISTENCY (documented, not invented): the example's
 * narrative line prints "CH4 = 0.1" but its own arithmetic only reconciles with
 * CH4 = 0.01 (386,000 GJ x 0.01 / 1000 = 3.86 -> the published "4 t", and
 * 69.9 + 0.01 + 0.4 + 17.3 = the published combined 87.61). Likewise the example
 * uses N2O = 0.4 while Table 9's current cars/light-commercial diesel row prints
 * N2O 0.5* (the 0.4 matches the pre-2004 footnote). This fixture mirrors the
 * example's own published arithmetic exactly: CO2 69.9, CH4 0.01, N2O 0.4.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example7-transport-diesel',
  calculator: 'fuelCombustionS1',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 7 + Table 9',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex7-ec', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.transport_post_2004.energy_content', unit: 'GJ/kL', value: '38.6', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex7-co2', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.transport_post_2004.ef_co2', unit: 'kg CO2-e/GJ', value: '69.9', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex7-ch4', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.transport_post_2004.ef_ch4', unit: 'kg CO2-e/GJ', value: '0.01', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex7-n2o', factor_set: 'NGA', vintage: '2025', category: 'fuel.diesel_oil.transport_post_2004.ef_n2o', unit: 'kg CO2-e/GJ', value: '0.4', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000e7',
      facility: 'Freight Fleet',
      fuel_key: 'diesel_oil',
      segment: 'transport_post_2004',
      quantity: '10000',
      unit: 'kL',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '27139.660000',
    tco2eMicro: '27139660000',
    rows: [
      { co2_tco2e: '26981.400000', ch4_tco2e: '3.860000', n2o_tco2e: '154.400000' },
    ],
    // Energy 386,000 GJ; scope 3 EF 17.3 -> 6,677.8 t; combined exact 33,817.46,
    // published (rounded to whole tonnes) 33,817 t CO2-e.
    crosscheck: {
      energy_gj: '386000',
      scope3_ef_kg_per_gj: '17.3',
      published_combined_s1_s3_tco2e_0dp: '33817',
    },
  },
}

'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 1 Calculation of scope 2 and 3 emissions from purchased electricity
 * using the location-based method" and Table 1 (location-based factors:
 * NSW/ACT scope 2 = 0.64, scope 3 = 0.03; VIC scope 2 = 0.78, scope 3 = 0.09,
 * all kg CO2-e/kWh).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: NSW operations consume 11,300,000 kWh and Victorian
 * operations 14,600,000 kWh from the NEM grid. Published figures (scopes 2+3
 * combined): NSW 7,571 t; VIC 12,702 t; total 20,273 t CO2-e.
 * This calculator discloses SCOPE 2 ONLY; the exact scope 2 recomputation is
 * NSW 7,232 + VIC 11,388 = 18,620 t CO2-e, and the test cross-checks that adding
 * the published Table 1 scope 3 portions (339 + 1,314) reproduces the published
 * 20,273 exactly.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example1-electricity-location',
  calculator: 'electricityS2Location',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 1 + Table 1',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex1-nsw', factor_set: 'NGA', vintage: '2025', category: 'electricity.location.NSW_ACT.scope2', unit: 'kg CO2-e/kWh', value: '0.64', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex1-vic', factor_set: 'NGA', vintage: '2025', category: 'electricity.location.VIC.scope2', unit: 'kg CO2-e/kWh', value: '0.78', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000a1',
      facility: 'NSW Operations',
      grid: 'NSW_ACT',
      quantity_kwh: '11300000',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
    {
      evidence_id: '00000000-0000-0000-0000-0000000000a2',
      facility: 'VIC Operations',
      grid: 'VIC',
      quantity_kwh: '14600000',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '18620.000000',
    tco2eMicro: '18620000000',
    rows: [
      { tco2e: '7232.000000' },
      { tco2e: '11388.000000' },
    ],
    // Published Table 1 scope 3 factors and the workbook's combined totals.
    crosscheck: {
      scope3: [
        { quantity_kwh: '11300000', ef3_kg_per_kwh: '0.03', published_combined_tco2e: '7571' },
        { quantity_kwh: '14600000', ef3_kg_per_kwh: '0.09', published_combined_tco2e: '12702' },
      ],
      published_combined_total_tco2e: '20273',
    },
  },
}

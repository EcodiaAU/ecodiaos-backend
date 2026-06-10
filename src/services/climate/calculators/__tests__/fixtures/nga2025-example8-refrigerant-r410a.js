'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 8 Calculation of emissions from refrigerant leakage", Table 10
 * (indicative leakage rates: domestic A/C split 3.5%/yr) and Table 11 (GWPs,
 * AR5: R410A = 1,924).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: a split system A/C pre-charged with 3 kg of R410A.
 *   Y = GWP x charge x leakage rate / 1,000 = 1,924 x 3.0 x 0.035 / 1,000
 * Published figure: 0.2020 t CO2-e. Exact recomputation: 0.20202 t CO2-e.
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example8-refrigerant-r410a',
  calculator: 'refrigerantsS1',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 8 + Tables 10/11',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex8-gwp', factor_set: 'NGA', vintage: '2025', category: 'refrigerant.R410A.gwp', unit: 'kg CO2-e/kg', value: '1924', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
      { id: 'f-ex8-rate', factor_set: 'NGA', vintage: '2025', category: 'refrigerant.leakage_rate.domestic_ac_split', unit: 'percent/year', value: '3.5', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000e8',
      facility: 'Office',
      refrigerant: 'R410A',
      basis: 'leakage_rate',
      equipment_type: 'domestic_ac_split',
      charge_kg: '3',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '0.202020',
    tco2eMicro: '202020',
    crosscheck: {
      published_tco2e_4dp: '0.2020',
    },
  },
}

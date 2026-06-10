'use strict'

/**
 * GOLDEN FIXTURE: official-worked-example
 *
 * Source: Australian National Greenhouse Accounts Factors 2025 (DCCEEW),
 * "Example 2 Calculation of scope 2 and 3 emissions from purchased or acquired
 * electricity using the market-based method" and Table 2 (residual mix factors:
 * scope 2 RMF = 0.81, scope 3 RMF = 0.11 kg CO2-e/kWh, national).
 * Source URLs:
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.xlsx
 * Factor vintage: NGA Factors 2025.
 *
 * Published worked example: NSW operations consume 11,300,000 kWh of grid
 * electricity; Qexempt = 0; RPP = 0.18195 (average of published 2024 and 2025
 * calendar-year RPPs); JRPP = 0; 1,000 purchased LGCs + 300 MWh of on-site LGCs
 * voluntarily surrendered (RECsurr = 1,300 MWh); REConsite = 500 MWh.
 *   residual = 11,300,000 x (1 - 0.18195) - (1,300 - 500) x 1,000
 *            = 9,243,965 - 800,000 = 8,443,965 kWh
 * Published figure (scopes 2+3 combined, RMF 0.81 + 0.11 = 0.92): 7,768.4 t CO2-e.
 * This calculator discloses SCOPE 2 ONLY: 8,443,965 x 0.81 / 1,000 =
 * 6,839.61165 t CO2-e exactly; the test cross-checks that adding the scope 3
 * portion (x 0.11) reproduces the published 7,768.4 (1dp).
 */

const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

module.exports = {
  name: 'nga2025-example2-electricity-market',
  calculator: 'electricityS2Market',
  provenance: 'official-worked-example',
  source: {
    title: 'NGA Factors 2025, Example 2 + Table 2',
    urls: [PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      { id: 'f-ex2-rmf', factor_set: 'NGA', vintage: '2025', category: 'electricity.market.residual_mix.scope2', unit: 'kg CO2-e/kWh', value: '0.81', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: PDF_URL },
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000b2',
      facility: 'NSW Operations',
      quantity_kwh: '11300000',
      exempt_kwh: '0',
      rpp: '0.18195',
      jrpp: '0',
      recs_surrendered_mwh: '1300',
      recs_onsite_mwh: '500',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL' },
  expected: {
    tco2e: '6839.611650',
    tco2eMicro: '6839611650',
    rows: [
      { residual_kwh: '8443965.000000' },
    ],
    crosscheck: {
      residual_kwh: '8443965',
      scope3_rmf_kg_per_kwh: '0.11',
      published_combined_tco2e_1dp: '7768.4',
    },
  },
}

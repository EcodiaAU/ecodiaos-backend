'use strict'

/**
 * GOLDEN FIXTURE: derived-from-published-factors
 *
 * No standalone official worked example exists for an NGER method election, so
 * this fixture is CONSTRUCTED from published factor tables (factor value x
 * activity amount), per the W3 fixture rules. No factor value is invented:
 * NGER (Measurement) Determination 2008 Method 1 uses the Schedule 1 fuel
 * combustion factors, and the NGA Factors 2025 workbook states its Table 8 is
 * sourced from that Schedule ("Source: National Greenhouse and Energy Reporting
 * (Measurement) Determination 2008 (Schedule 1)"), so the diesel values below
 * (EC 38.6 GJ/kL, EF CO2 69.9 / CH4 0.1 / N2O 0.2 kg CO2-e/GJ) are the published
 * Schedule 1 / Table 8 values.
 * Source URLs:
 *   https://www.legislation.gov.au/F2008L02309/latest  (NGER Measurement Determination 2008, Method 1 + Schedule 1)
 *   https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf  (Table 8 + its Schedule 1 source note)
 * Factor vintage: 2025 (NGER (Measurement) Amendment (2025 Update) Determination
 * 2025, applying to the 2025-26 NGER year; the NGA 2025 workbook is its mirror).
 *
 * Scenario: 'Plant 1' is an NGER-covered facility electing NGER Method 1
 * (permitted for AASB S2 reporting by AASB S2025-1, Dec 2025); a second
 * non-covered facility stays on the GHG Protocol default. Derived expectation:
 *   Plant 1: 250 x 38.6 x 70.2 / 1000 = 677.43 t CO2-e
 *   Depot:    40 x 38.6 x 70.2 / 1000 = 108.3888 t CO2-e
 *   Total: 785.8188 t CO2-e
 */

const NGER_URL = 'https://www.legislation.gov.au/F2008L02309/latest'
const PDF_URL = 'https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf'

function dieselFactors(factorSet, idPrefix, sourceUrl) {
  return [
    { id: `${idPrefix}-ec`, factor_set: factorSet, vintage: '2025', category: 'fuel.diesel_oil.stationary.energy_content', unit: 'GJ/kL', value: '38.6', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: sourceUrl },
    { id: `${idPrefix}-co2`, factor_set: factorSet, vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_co2', unit: 'kg CO2-e/GJ', value: '69.9', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: sourceUrl },
    { id: `${idPrefix}-ch4`, factor_set: factorSet, vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_ch4', unit: 'kg CO2-e/GJ', value: '0.1', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: sourceUrl },
    { id: `${idPrefix}-n2o`, factor_set: factorSet, vintage: '2025', category: 'fuel.diesel_oil.stationary.ef_n2o', unit: 'kg CO2-e/GJ', value: '0.2', effective_from: '2025-07-01', effective_to: '2026-06-30', source_url: sourceUrl },
  ]
}

module.exports = {
  name: 'nger-method1-diesel-election',
  calculator: 'fuelCombustionS1',
  provenance: 'derived-from-published-factors',
  source: {
    title: 'NGER Measurement Determination 2008 (Method 1, Schedule 1) via NGA Factors 2025 Table 8',
    urls: [NGER_URL, PDF_URL],
    factor_vintage: '2025',
  },
  factorVintage: {
    vintage: '2025',
    factors: [
      ...dieselFactors('NGER_MD', 'f-nger-d', NGER_URL),
      ...dieselFactors('NGA', 'f-nga-d', PDF_URL),
    ],
  },
  activityRows: [
    {
      evidence_id: '00000000-0000-0000-0000-0000000000c1',
      facility: 'Plant 1',
      fuel_key: 'diesel_oil',
      segment: 'stationary',
      quantity: '250',
      unit: 'kL',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
    {
      evidence_id: '00000000-0000-0000-0000-0000000000c2',
      facility: 'Depot',
      fuel_key: 'diesel_oil',
      segment: 'stationary',
      quantity: '40',
      unit: 'kL',
      period_start: '2025-07-01',
      period_end: '2026-06-30',
    },
  ],
  methodElection: { default: 'GHG_PROTOCOL', perFacility: { 'Plant 1': 'NGER_METHOD_1' } },
  expected: {
    tco2e: '785.818800',
    tco2eMicro: '785818800',
    rows: [
      { facility: 'Plant 1', method_election: 'NGER_METHOD_1', factor_set: 'NGER_MD', tco2e: '677.430000' },
      { facility: 'Depot', method_election: 'GHG_PROTOCOL', factor_set: 'NGA', tco2e: '108.388800' },
    ],
  },
}

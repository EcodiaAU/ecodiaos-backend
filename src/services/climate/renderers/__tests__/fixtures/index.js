'use strict'

/**
 * Shared synthetic fixture for the W6 renderer tests.
 *
 * All data invented. Shapes mirror the cd_* migrations in climate-migrations/.
 * Evidence row 2 deliberately carries CSV-hostile content (commas, double
 * quotes, CR/LF newlines) in document_type-adjacent fields to exercise the
 * RFC 4180 escaping path; hashes are synthetic hex, not recomputed chain links
 * (chain verification is W2's job, not the exporter's).
 */

const ENGAGEMENT_ID = '00000000-0000-4000-8000-00000000e001'

/** 3 cd_evidence_items rows (caller order deliberately NOT seq order). */
const evidenceRows = [
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    engagement_id: ENGAGEMENT_ID,
    seq: 2,
    doc_sha256: 'b2'.repeat(32),
    storage_path: `${ENGAGEMENT_ID}/raw/invoice-feb, "final".pdf`,
    source_channel: 'email',
    document_type: 'fuel_invoice, diesel "bulk"',
    facility: 'Site B\nNorthern Depot',
    period_start: '2025-08-01',
    period_end: '2025-08-31',
    scope_category: 'scope1.fuel',
    classifier_version: 'clf-2026-06-01',
    classification_confidence: '0.91',
    payload: { litres: '12000.5', note: 'line2\r\ncontains, comma and "quotes"' },
    supersedes_id: null,
    prev_hash: 'a1'.repeat(32),
    row_hash: 'a2'.repeat(32),
    confirmation_status: 'auto',
    captured_at: '2025-09-02T01:00:00.000Z',
    committed_at: '2025-09-02T01:00:05.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    engagement_id: ENGAGEMENT_ID,
    seq: 1,
    doc_sha256: 'b1'.repeat(32),
    storage_path: `${ENGAGEMENT_ID}/raw/electricity-jul.pdf`,
    source_channel: 'email',
    document_type: 'electricity_bill',
    facility: 'Site A',
    period_start: '2025-07-01',
    period_end: '2025-07-31',
    scope_category: 'scope2.electricity',
    classifier_version: 'clf-2026-06-01',
    classification_confidence: '0.97',
    payload: { kwh: '84211', retailer: 'Synthetic Energy Pty Ltd' },
    supersedes_id: null,
    prev_hash: null,
    row_hash: 'a1'.repeat(32),
    confirmation_status: 'confirmed',
    captured_at: new Date('2025-08-03T00:30:00.000Z'), // Date object on purpose: must serialise identically to the ISO string form
    committed_at: '2025-08-03T00:30:04.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a3',
    engagement_id: ENGAGEMENT_ID,
    seq: 3,
    doc_sha256: 'b3'.repeat(32),
    storage_path: `${ENGAGEMENT_ID}/raw/refrigerant-service.pdf`,
    source_channel: 'manual',
    document_type: 'refrigerant_service_record',
    facility: 'Site A',
    period_start: '2025-07-01',
    period_end: '2026-06-30',
    scope_category: 'scope1.refrigerants',
    classifier_version: 'clf-2026-06-01',
    classification_confidence: '0.74',
    payload: { gas: 'R410A', kg_leaked: '4.2' },
    supersedes_id: '00000000-0000-4000-8000-0000000000a1',
    prev_hash: 'a2'.repeat(32),
    row_hash: 'a3'.repeat(32),
    confirmation_status: 'pending_confirmation',
    captured_at: '2025-09-10T03:00:00.000Z',
    committed_at: '2025-09-10T03:00:02.000Z',
  },
]

/** 2 cd_calc_runs rows: one current, one superseded by it. */
const calcRuns = [
  {
    id: '00000000-0000-4000-8000-0000000000c2',
    engagement_id: ENGAGEMENT_ID,
    calculator: 'fuelCombustionS1',
    code_sha: '1111111111111111111111111111111111111111',
    factor_vintage: 'NGA-2025',
    inputs_hash: 'cc'.repeat(32),
    evidence_ids: ['00000000-0000-4000-8000-0000000000a2'],
    output_tco2e: '32.456789',
    output_breakdown: { calculator: 'fuelCombustionS1', totals: { tco2e_micro: '32456789' } },
    run_at: '2025-10-01T00:00:00.000Z',
    superseded_by: null,
  },
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    engagement_id: ENGAGEMENT_ID,
    calculator: 'fuelCombustionS1',
    code_sha: '0000000000000000000000000000000000000000',
    factor_vintage: 'NGA-2024',
    inputs_hash: 'cb'.repeat(32),
    evidence_ids: ['00000000-0000-4000-8000-0000000000a2'],
    output_tco2e: '32.501122',
    output_breakdown: { calculator: 'fuelCombustionS1', totals: { tco2e_micro: '32501122' } },
    run_at: '2025-09-15T00:00:00.000Z',
    superseded_by: '00000000-0000-4000-8000-0000000000c2',
  },
]

/** cd_factors rows consumed by the runs (factorMeta for the memo). */
const factorMeta = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    factor_set: 'NGA',
    vintage: 'NGA-2025',
    category: 'fuel.diesel_oil.stationary.co2',
    unit: 'kg CO2e/GJ',
    value: '69.9',
    effective_from: '2025-07-01',
    effective_to: null,
    source_url: 'https://example.invalid/nga-2025',
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    factor_set: 'NGA',
    vintage: 'NGA-2025',
    category: 'fuel.diesel_oil.energy_content',
    unit: 'GJ/kL',
    value: '38.6',
    effective_from: '2025-07-01',
    effective_to: null,
    source_url: 'https://example.invalid/nga-2025',
  },
]

const elections = {
  default: 'GHG_PROTOCOL',
  perFacility: { 'Site B': 'NGER_METHOD_1' },
}

/** 2 cd_clause_register rows (W4 seed shape, pillar in applicability_notes). */
const clauseRows = [
  {
    id: '00000000-0000-4000-8000-0000000000d1',
    standard: 'AASB_S2',
    standard_version: 'Sep 2024 (amended by AASB S2025-1 Dec 2025)',
    clause_ref: 'AASB S2 para 6(a)',
    requirement_summary:
      'Identify the governance body (board, committee or equivalent) or individual responsible for oversight of climate-related risks and opportunities.',
    evidence_types: ['committee_charter', 'board_minutes', 'org_chart'],
    applicability_notes: 'pillar=governance. Disclosure objective set by para 5.',
  },
  {
    id: '00000000-0000-4000-8000-0000000000d2',
    standard: 'AASB_S2',
    standard_version: 'Sep 2024 (amended by AASB S2025-1 Dec 2025)',
    clause_ref: 'AASB S2 para 29(a)',
    requirement_summary: 'Disclose absolute gross scope 1 and scope 2 greenhouse gas emissions for the reporting period.',
    evidence_types: ['fuel_invoice', 'electricity_bill', 'calc_run'],
    applicability_notes: 'pillar=metrics_targets.',
  },
]

/** cd_disclosure_drafts rows: a grounded draft (2 versions; v2 must win) and a named gap. */
const draftRows = [
  {
    id: '00000000-0000-4000-8000-0000000000e2',
    engagement_id: ENGAGEMENT_ID,
    clause_ref: 'AASB S2 para 29(a)',
    draft_text:
      'Gross scope 1 emissions for the period were 32.456789 t CO2e, calculated from supplier fuel invoices held in the evidence register.\n\nGross scope 2 (location-based) emissions are pending final electricity data <see gap note>.',
    evidence_citations: ['00000000-0000-4000-8000-0000000000a2'],
    status: 'drafted',
    version: 2,
    created_at: '2025-10-02T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    engagement_id: ENGAGEMENT_ID,
    clause_ref: 'AASB S2 para 29(a)',
    draft_text: 'Earlier draft, superseded by version 2.',
    evidence_citations: ['00000000-0000-4000-8000-0000000000a2'],
    status: 'drafted',
    version: 1,
    created_at: '2025-09-20T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000e3',
    engagement_id: ENGAGEMENT_ID,
    clause_ref: 'AASB S2 para 6(a)',
    draft_text: 'No board charter or committee terms of reference naming climate oversight responsibility has been received.',
    evidence_citations: null,
    status: 'gap',
    version: 1,
    created_at: '2025-10-02T00:00:00.000Z',
  },
]

/** cd_coverage view rows (010_cd_coverage_view.sql column names exactly). */
const coverageRows = [
  {
    engagement_id: ENGAGEMENT_ID,
    expected_document_id: '00000000-0000-4000-8000-0000000000b1',
    facility: 'Site A',
    document_type: 'electricity_bill',
    cadence: 'monthly',
    period_start: '2025-07-01',
    period_end: '2025-07-31',
    due_by: '2025-08-14',
    evidence_id: '00000000-0000-4000-8000-0000000000a1',
    covered: true,
  },
  {
    engagement_id: ENGAGEMENT_ID,
    expected_document_id: '00000000-0000-4000-8000-0000000000b1',
    facility: 'Site A',
    document_type: 'electricity_bill',
    cadence: 'monthly',
    period_start: '2025-08-01',
    period_end: '2025-08-31',
    due_by: '2025-09-14',
    evidence_id: null,
    covered: false,
  },
  {
    engagement_id: ENGAGEMENT_ID,
    expected_document_id: '00000000-0000-4000-8000-0000000000b2',
    facility: 'Site B\nNorthern Depot',
    document_type: 'fuel_invoice, diesel "bulk"',
    cadence: 'monthly',
    period_start: '2025-08-01',
    period_end: '2025-08-31',
    due_by: '2025-09-14',
    evidence_id: '00000000-0000-4000-8000-0000000000a2',
    covered: true,
  },
]

/** Disclosure-level gap rows = the status='gap' subset of draftRows. */
const gapRows = draftRows.filter((r) => r.status === 'gap')

module.exports = {
  ENGAGEMENT_ID,
  evidenceRows,
  calcRuns,
  factorMeta,
  elections,
  clauseRows,
  draftRows,
  coverageRows,
  gapRows,
}

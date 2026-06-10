'use strict'

/**
 * W5.1 classifier contract hardening tests - one per document-zoo pass-1 defect
 * (climate-testing/zoo/results-pass1-2026-06-10.md, "Contract verification" 1-7).
 *
 *  1. document_type validated against the closed DOCUMENT_TYPES vocabulary
 *  2. period_start/period_end must be ISO yyyy-mm-dd full-dates or null
 *  3. scope_category enforced against scope1|scope2|scope3|none
 *  4. STRUCTURAL is_evidence flag; is_evidence:false refused at BOTH commit layers
 *     (commitEvidence.buildEvidenceRow throws; connector cd_evidence_commit 4xx)
 *  5. object/array field values stage with 'malformed_field', never '[object Object]'
 *  6. staged results carry a machine-readable failure_code
 *  7. closed threshold boundary: confidence <= threshold stages
 */

const {
  classifyDocument,
  buildEvidenceRow,
  DOCUMENT_TYPES,
  SCOPE_CATEGORIES,
  FAILURE_CODES,
  DEFAULT_CONFIDENCE_THRESHOLD,
} = require('../index')
// Pure module: tools.js takes its DB injected per-handler, so no mocks needed here.
const { getTool } = require('../../connector/tools')

const docMeta = { filename: 'invoice-site-a-2026-06.pdf', mime_type: 'application/pdf' }
const text = 'Tax invoice. Site A. Billing period 1 June 2026 to 30 June 2026. 12,400 kWh.'
const ENGAGEMENT_ID = '11111111-1111-4111-8111-111111111111'
const SHA = 'a'.repeat(64)

function stub(overrides = {}) {
  return async () => ({
    document_type: 'electricity_invoice',
    facility: 'Site A',
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    scope_category: 'scope2',
    confidence: 0.96,
    ...overrides,
  })
}

describe('defect 1: document_type vocabulary', () => {
  test('unknown document_type stages with failure_code unknown_document_type', async () => {
    // 'electricity_bill' is the exact drift the zoo caught in the renderer fixtures.
    const result = await classifyDocument(docMeta, text, stub({ document_type: 'electricity_bill' }))
    expect(result.staged_for_review).toBe(true)
    expect(result.failure_code).toBe('unknown_document_type')
    expect(result.document_type).toBeNull()
  })

  test('every vocabulary entry classifies cleanly; the vocabulary is the exported closed list', async () => {
    expect(DOCUMENT_TYPES).toEqual([
      'electricity_invoice', 'gas_invoice', 'fuel_invoice', 'fuel_card_statement',
      'refrigerant_service_record', 'water_invoice', 'waste_invoice', 'travel_record',
      'supplier_invoice', 'meter_reading', 'workbook', 'other_evidence', 'not_evidence',
    ])
    for (const type of DOCUMENT_TYPES) {
      const result = await classifyDocument(docMeta, text, stub({ document_type: type }))
      expect(result.staged_for_review).toBe(false)
      expect(result.document_type).toBe(type)
    }
  })
})

describe('defect 2: period full-date validation', () => {
  test('prose and non-calendar periods stage with invalid_period; yyyy-mm-dd or null pass', async () => {
    for (const bad of ['Apr 24 - May 23, 2026', '2026-06', '2026-13-01', '2026-02-30', '20260601']) {
      const result = await classifyDocument(docMeta, text, stub({ period_start: bad }))
      expect(result.staged_for_review).toBe(true)
      expect(result.failure_code).toBe('invalid_period')
    }
    const endBad = await classifyDocument(docMeta, text, stub({ period_end: 'next month' }))
    expect(endBad.failure_code).toBe('invalid_period')

    const ok = await classifyDocument(docMeta, text, stub({ period_start: null, period_end: null }))
    expect(ok.staged_for_review).toBe(false)
    expect(ok.period_start).toBeNull()
  })
})

describe('defect 3: scope_category enum', () => {
  test('out-of-enum scope stages with invalid_scope; the enum and null pass', async () => {
    for (const bad of ['scope4', 'Scope 2', 'upstream']) {
      const result = await classifyDocument(docMeta, text, stub({ scope_category: bad }))
      expect(result.staged_for_review).toBe(true)
      expect(result.failure_code).toBe('invalid_scope')
    }
    expect(SCOPE_CATEGORIES).toEqual(['scope1', 'scope2', 'scope3', 'none'])
    for (const scope of SCOPE_CATEGORIES) {
      const result = await classifyDocument(docMeta, text, stub({ scope_category: scope }))
      expect(result.staged_for_review).toBe(false)
      expect(result.scope_category).toBe(scope)
    }
  })
})

describe('defect 4: structural is_evidence, refused at commit', () => {
  test('classify computes is_evidence structurally (false for not_evidence, true otherwise)', async () => {
    const refusal = await classifyDocument(docMeta, text, stub({ document_type: 'not_evidence', scope_category: 'none' }))
    expect(refusal.staged_for_review).toBe(false) // a confident refusal is a valid classification
    expect(refusal.is_evidence).toBe(false)

    const evidence = await classifyDocument(docMeta, text, stub())
    expect(evidence.is_evidence).toBe(true)
  })

  test('commitEvidence layer: buildEvidenceRow throws on is_evidence:false', () => {
    const base = {
      engagement_id: ENGAGEMENT_ID,
      doc_sha256: SHA,
      storage_path: `${ENGAGEMENT_ID}/raw/doc.pdf`,
      source_channel: 'email',
    }
    expect(() => buildEvidenceRow({ ...base, is_evidence: false }, [])).toThrow(/is_evidence:false/)
    // The sentinel string alone is refused too (defence in depth, mirrors migration 012).
    expect(() => buildEvidenceRow({ ...base, document_type: 'not_evidence' }, [])).toThrow(/never enter the evidence register/)
    // Sanity: the same row WITH is_evidence true commits.
    const row = buildEvidenceRow({ ...base, document_type: 'electricity_invoice', is_evidence: true }, [])
    expect(row.seq).toBe(1)
    expect(row.is_evidence).toBeUndefined() // classify metadata, never a row column
  })

  test('connector layer: cd_evidence_commit refuses is_evidence:false with a 4xx envelope', async () => {
    const db = jest.fn(async () => { throw new Error('db must not be reached on refusal') })
    const handler = getTool('cd_evidence_commit').handler
    await expect(handler({
      args: {
        engagement_id: ENGAGEMENT_ID, doc_sha256: SHA,
        storage_path: `${ENGAGEMENT_ID}/raw/doc.pdf`, source_channel: 'email',
        is_evidence: false,
      },
      db,
    })).rejects.toMatchObject({ code: 'not_evidence_refused', httpStatus: 422 })
    await expect(handler({
      args: {
        engagement_id: ENGAGEMENT_ID, doc_sha256: SHA,
        storage_path: `${ENGAGEMENT_ID}/raw/doc.pdf`, source_channel: 'email',
        document_type: 'not_evidence',
      },
      db,
    })).rejects.toMatchObject({ code: 'not_evidence_refused', httpStatus: 422 })
    expect(db).not.toHaveBeenCalled()
  })
})

describe('defect 5: non-scalar field values', () => {
  test('object/array values stage with malformed_field, never stringify to [object Object]', async () => {
    const cases = [
      { facility: { name: 'HQ' } },
      { document_type: ['electricity_invoice'] },
      { period_start: new Date('2026-06-01') },
    ]
    for (const overrides of cases) {
      const result = await classifyDocument(docMeta, text, stub(overrides))
      expect(result.staged_for_review).toBe(true)
      expect(result.failure_code).toBe('malformed_field')
      expect(JSON.stringify(result)).not.toContain('[object Object]')
    }
  })
})

describe('defect 6: machine-readable failure codes', () => {
  test('every staging path carries a failure_code from the exported set; auto carries null', async () => {
    expect(FAILURE_CODES).toEqual([
      'unknown_document_type', 'invalid_period', 'invalid_scope', 'malformed_field',
      'low_confidence', 'classifier_error', 'empty_input', 'oversize',
    ])

    const byPath = {
      empty_input: await classifyDocument(docMeta, '', stub()),
      oversize: await classifyDocument(docMeta, 'x'.repeat(64), stub(), { maxTextBytes: 16 }),
      classifier_error: await classifyDocument(docMeta, text, async () => { throw new Error('model overloaded') }),
      unknown_document_type: await classifyDocument(docMeta, text, stub({ document_type: 'mystery' })),
      invalid_period: await classifyDocument(docMeta, text, stub({ period_end: 'May 2026' })),
      invalid_scope: await classifyDocument(docMeta, text, stub({ scope_category: 'scope9' })),
      malformed_field: await classifyDocument(docMeta, text, stub({ facility: {} })),
      low_confidence: await classifyDocument(docMeta, text, stub({ confidence: 0.5 })),
    }
    for (const [code, result] of Object.entries(byPath)) {
      expect(result.staged_for_review).toBe(true)
      expect(result.failure_code).toBe(code)
      expect(typeof result.reason).toBe('string') // prose rides alongside, never instead
    }

    const auto = await classifyDocument(docMeta, text, stub())
    expect(auto.staged_for_review).toBe(false)
    expect(auto.failure_code).toBeNull()
  })
})

describe('defect 7: closed threshold boundary', () => {
  test('confidence exactly at threshold stages; strictly above commits', async () => {
    const atDefault = await classifyDocument(docMeta, text, stub({ confidence: DEFAULT_CONFIDENCE_THRESHOLD }))
    expect(atDefault.staged_for_review).toBe(true)
    expect(atDefault.failure_code).toBe('low_confidence')

    const above = await classifyDocument(docMeta, text, stub({ confidence: 0.81 }))
    expect(above.staged_for_review).toBe(false)

    const atCustom = await classifyDocument(docMeta, text, stub({ confidence: 0.9 }), { confidenceThreshold: 0.9 })
    expect(atCustom.staged_for_review).toBe(true)
    expect(atCustom.failure_code).toBe('low_confidence')
  })
})

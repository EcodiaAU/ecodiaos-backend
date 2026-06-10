'use strict'

/**
 * W5 ingest + classification tests (climate-disclosure).
 * Runner: jest (package.json "test": "jest").
 *
 * Gates from the brief:
 *  - fixture MIME email with a small PDF attachment -> staged candidate with the
 *    CORRECT sha256, where the expected hash is PRECOMPUTED in the fixture (a literal
 *    over the known bytes), not derived from whatever the parser emitted
 *  - classifier stub high-confidence auto path and low-confidence staged path
 *  - junk input (empty body, no attachments, corrupt base64) stages with reason,
 *    never throws
 *  - confirmEvidence produces a row that verifyChain accepts appended after the
 *    pending row (append-as-supersede; the 002 trigger forbids UPDATE for every role)
 *  - workbook fixture round-trip
 */

const crypto = require('crypto')

const {
  ingestEmail,
  classifyDocument,
  DEFAULT_CONFIDENCE_THRESHOLD,
  buildEvidenceRow,
  confirmEvidence,
  ingestWorkbook,
} = require('../index')
const { hashRow, verifyChain } = require('../../evidenceChain')
const {
  FIXTURE_PDF_SHA256,
  FIXTURE_PDF_SIZE_BYTES,
  FIXTURE_PDF_BYTES,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_CORRUPT_BASE64,
  FIXTURE_EMAIL_NO_ATTACHMENTS,
  buildFixtureWorkbook,
  buildStoredZip,
} = require('./fixtures')

const ENGAGEMENT_ID = '00000000-0000-0000-0000-00000000c1d0'

describe('emailIngest', () => {
  test('fixture MIME email yields a candidate with the precomputed sha256', () => {
    const result = ingestEmail(FIXTURE_EMAIL)
    expect(result.staged_for_review).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.candidates).toHaveLength(1)

    const c = result.candidates[0]
    expect(c.filename).toBe('invoice-site-a-2026-06.pdf')
    expect(c.mime_type).toBe('application/pdf')
    // The load-bearing assertion: hash precomputed in the fixture, not parser-derived.
    expect(c.sha256).toBe(FIXTURE_PDF_SHA256)
    expect(c.size_bytes).toBe(FIXTURE_PDF_SIZE_BYTES)
    expect(Buffer.isBuffer(c.bytes)).toBe(true)
    expect(c.bytes.equals(FIXTURE_PDF_BYTES)).toBe(true)
  })

  test('fixture sanity: the precomputed literal matches a fresh sha256 of the fixture bytes', () => {
    expect(crypto.createHash('sha256').update(FIXTURE_PDF_BYTES).digest('hex')).toBe(
      FIXTURE_PDF_SHA256
    )
  })

  test('received_meta carries the message headers through', () => {
    const { received_meta: meta, candidates } = ingestEmail(FIXTURE_EMAIL)
    expect(meta.to).toBe('evidence+eng-0001@ecodia.au')
    expect(meta.subject).toBe('Electricity invoice - Site A - June 2026')
    expect(meta.message_id).toBe('<fixture-w5-001@energyretailer.example.com>')
    expect(meta.date).toBe('Wed, 1 Jul 2026 09:15:00 +1000')
    expect(candidates[0].received_meta).toEqual(meta)
  })

  test('accepts a Buffer as well as a string', () => {
    const result = ingestEmail(Buffer.from(FIXTURE_EMAIL, 'binary'))
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].sha256).toBe(FIXTURE_PDF_SHA256)
  })

  test('empty body stages with reason, never throws', () => {
    const result = ingestEmail('')
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons).toEqual(['empty message'])
    expect(result.candidates).toEqual([])
  })

  test('no attachments stages with reason, never throws', () => {
    const result = ingestEmail(FIXTURE_EMAIL_NO_ATTACHMENTS)
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons).toEqual(['no attachments found'])
    expect(result.candidates).toEqual([])
  })

  test('corrupt base64 stages with reason, never throws', () => {
    const result = ingestEmail(FIXTURE_EMAIL_CORRUPT_BASE64)
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons).toEqual(["attachment 'invoice-site-a-2026-06.pdf': corrupt base64 payload"])
    expect(result.candidates).toEqual([])
  })

  test('arbitrary junk bytes stage, never throw', () => {
    for (const junk of ['\x00\x01\x02 not mime at all', 'Subject only no colon line', '   \r\n  ']) {
      const result = ingestEmail(junk)
      expect(result.staged_for_review).toBe(true)
      expect(result.reasons.length).toBeGreaterThan(0)
    }
  })

  test('non-string non-Buffer argument is the one programmer-error throw', () => {
    expect(() => ingestEmail(null)).toThrow(TypeError)
    expect(() => ingestEmail(42)).toThrow(TypeError)
  })
})

describe('classifyDocument', () => {
  const docMeta = { filename: 'invoice-site-a-2026-06.pdf', mime_type: 'application/pdf' }
  const text = 'Tax invoice. Site A. Billing period 1 June 2026 to 30 June 2026. 12,400 kWh.'

  const highConfidenceStub = async () => ({
    document_type: 'electricity_invoice',
    facility: 'Site A',
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    scope_category: 'scope2',
    confidence: 0.96,
  })

  test('high-confidence stub takes the auto path', async () => {
    const result = await classifyDocument(docMeta, text, highConfidenceStub)
    expect(result).toEqual({
      document_type: 'electricity_invoice',
      facility: 'Site A',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      scope_category: 'scope2',
      is_evidence: true,
      confidence: 0.96,
      staged_for_review: false,
      failure_code: null,
      reason: null,
    })
  })

  test('low-confidence stub stages for review instead of auto-commit', async () => {
    const stub = async () => ({ ...(await highConfidenceStub()), confidence: 0.55 })
    const result = await classifyDocument(docMeta, text, stub)
    expect(result.staged_for_review).toBe(true)
    expect(result.reason).toMatch(/at or below threshold 0\.8/)
    // classification is still carried so the review queue sees the best guess
    expect(result.document_type).toBe('electricity_invoice')
    expect(result.confidence).toBe(0.55)
  })

  test('threshold is configurable', async () => {
    const stub = async () => ({ ...(await highConfidenceStub()), confidence: 0.85 })
    const strict = await classifyDocument(docMeta, text, stub, { confidenceThreshold: 0.9 })
    expect(strict.staged_for_review).toBe(true)
    const lax = await classifyDocument(docMeta, text, stub, { confidenceThreshold: 0.8 })
    expect(lax.staged_for_review).toBe(false)
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.8)
  })

  test('empty extracted text stages with reason without calling the classifier', async () => {
    const spy = jest.fn(highConfidenceStub)
    const result = await classifyDocument(docMeta, '', spy)
    expect(result.staged_for_review).toBe(true)
    expect(result.reason).toBe('no extracted text to classify')
    expect(spy).not.toHaveBeenCalled()
  })

  test('classifier throw stages with reason, never propagates', async () => {
    const result = await classifyDocument(docMeta, text, async () => {
      throw new Error('model overloaded')
    })
    expect(result.staged_for_review).toBe(true)
    expect(result.reason).toBe('classifier error: model overloaded')
    expect(result.confidence).toBe(0)
  })

  test('malformed classifier output stages with reason', async () => {
    const cases = [
      [async () => null, /non-object/],
      [async () => 'yes', /non-object/],
      [async () => ({ document_type: 'x', confidence: 7 }), /invalid confidence/],
      [async () => ({ document_type: 'x', confidence: NaN }), /invalid confidence/],
      [async () => ({ confidence: 0.99 }), /no document_type/],
    ]
    for (const [stub, reasonRe] of cases) {
      const result = await classifyDocument(docMeta, text, stub)
      expect(result.staged_for_review).toBe(true)
      expect(result.reason).toMatch(reasonRe)
    }
  })

  test('sync classifierFn is accepted', async () => {
    const result = await classifyDocument(docMeta, text, () => ({
      document_type: 'fuel_card_statement',
      confidence: 0.91,
    }))
    expect(result.staged_for_review).toBe(false)
    expect(result.document_type).toBe('fuel_card_statement')
  })

  test('missing classifierFn is the one programmer-error throw', async () => {
    await expect(classifyDocument(docMeta, text, undefined)).rejects.toThrow(TypeError)
  })
})

describe('commitEvidence', () => {
  function contentInput(overrides = {}) {
    return {
      engagement_id: ENGAGEMENT_ID,
      doc_sha256: FIXTURE_PDF_SHA256,
      storage_path: `${ENGAGEMENT_ID}/raw/invoice-site-a-2026-06.pdf`,
      source_channel: 'email',
      document_type: 'electricity_invoice',
      facility: 'Site A',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      scope_category: 'scope2',
      classifier_version: 'clf-v1',
      classification_confidence: 0.96,
      payload: { kwh: 12400 },
      captured_at: '2026-07-01T00:00:00.000Z',
      ...overrides,
    }
  }

  test('genesis commit: seq 1, null prev_hash, verifies green', () => {
    const row = buildEvidenceRow(contentInput(), [])
    expect(row.seq).toBe(1)
    expect(row.prev_hash).toBeNull()
    expect(row.confirmation_status).toBe('auto')
    expect(row.row_hash).toBe(hashRow(row, null))
    expect(verifyChain([{ id: 'r1', ...row }])).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('appends link onto the head of the prior chain', () => {
    const chain = []
    for (let i = 0; i < 3; i++) {
      const row = buildEvidenceRow(contentInput({ payload: { i } }), chain)
      chain.push({ id: `r${i + 1}`, ...row })
    }
    expect(chain.map((r) => r.seq)).toEqual([1, 2, 3])
    expect(chain[2].prev_hash).toBe(chain[1].row_hash)
    expect(verifyChain(chain)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('refuses to append to a broken prior chain', () => {
    const chain = [
      { id: 'r1', ...buildEvidenceRow(contentInput(), []) },
    ]
    chain[0].doc_sha256 = 'tampered'
    expect(() => buildEvidenceRow(contentInput(), chain)).toThrow(/prior chain invalid/)
  })

  test('refuses caller-supplied seq/prev_hash/row_hash and missing required fields', () => {
    expect(() => buildEvidenceRow(contentInput({ seq: 99 }), [])).toThrow(/do not supply/)
    expect(() => buildEvidenceRow(contentInput({ engagement_id: null }), [])).toThrow(/engagement_id/)
    expect(() => buildEvidenceRow(contentInput({ doc_sha256: null }), [])).toThrow(/doc_sha256/)
    expect(() => buildEvidenceRow(contentInput({ source_channel: 'carrier-pigeon' }), [])).toThrow(
      /source_channel/
    )
  })

  test('refuses a prior chain from a different engagement', () => {
    const otherChain = [
      {
        id: 'r1',
        ...buildEvidenceRow(contentInput({ engagement_id: '00000000-0000-0000-0000-0000000000ff' }), []),
      },
    ]
    expect(() => buildEvidenceRow(contentInput(), otherChain)).toThrow(/belongs to engagement/)
  })

  test('confirmEvidence: confirmed superseding row appends after the pending row and verifies green', () => {
    // Build a chain whose head is a pending_confirmation commit (above materiality).
    const chain = []
    const first = buildEvidenceRow(contentInput(), chain)
    chain.push({ id: 'row-1', ...first })
    const pending = buildEvidenceRow(
      contentInput({
        payload: { kwh: 980000 },
        confirmation_status: 'pending_confirmation',
      }),
      chain
    )
    chain.push({ id: 'row-2-pending', ...pending })
    expect(verifyChain(chain)).toEqual({ valid: true, brokenAtSeq: null })

    // Confirmation is APPEND-AS-SUPERSEDE, never UPDATE (002 trigger rejects UPDATE).
    const confirmed = confirmEvidence(chain[1], chain)
    expect(confirmed.supersedes_id).toBe('row-2-pending')
    expect(confirmed.confirmation_status).toBe('confirmed')
    expect(confirmed.seq).toBe(3)
    expect(confirmed.prev_hash).toBe(chain[1].row_hash)
    // content travels unchanged
    expect(confirmed.doc_sha256).toBe(chain[1].doc_sha256)
    expect(confirmed.payload).toEqual(chain[1].payload)
    expect(confirmed.captured_at).toBe(chain[1].captured_at)

    // The verify gate: verifyChain accepts the confirmed row appended after the pending row.
    const extended = [...chain, { id: 'row-3-confirmed', ...confirmed }]
    expect(verifyChain(extended)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('confirmEvidence refuses misuse', () => {
    const chain = []
    const auto = buildEvidenceRow(contentInput(), chain)
    chain.push({ id: 'row-1', ...auto })
    // not pending
    expect(() => confirmEvidence(chain[0], chain)).toThrow(/expected 'pending_confirmation'/)

    const pending = buildEvidenceRow(
      contentInput({ confirmation_status: 'pending_confirmation' }),
      chain
    )
    const pendingRow = { id: 'row-2', ...pending }
    // pending row not in the supplied chain
    expect(() => confirmEvidence(pendingRow, chain)).toThrow(/not in the supplied prior chain/)
    // broken prior chain
    const fullChain = [...chain, pendingRow]
    const tampered = fullChain.map((r) => ({ ...r }))
    tampered[0].facility = 'Site Z'
    expect(() => confirmEvidence(tampered[1], tampered)).toThrow(/prior chain invalid/)
  })
})

describe('workbookIngest', () => {
  test('fixture workbook round-trips to activity rows', () => {
    const result = ingestWorkbook(buildFixtureWorkbook())
    expect(result.staged_for_review).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].name).toBe('Activity')
    expect(result.activity_rows).toEqual([
      { facility: 'Site A', fuel_type: 'diesel', quantity: 1200.5, unit: 'L' },
      { facility: 'Site B', fuel_type: null, quantity: 350, unit: 'kWh' },
    ])
  })

  test('junk buffer stages with reason, never throws', () => {
    const result = ingestWorkbook(Buffer.from('this is not a zip file at all'))
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons[0]).toMatch(/not a readable workbook/)
    expect(result.activity_rows).toEqual([])
  })

  test('a zip that is not a workbook stages with reason', () => {
    const zip = buildStoredZip({ 'readme.txt': 'hello' })
    const result = ingestWorkbook(zip)
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons[0]).toMatch(/no xl\/worksheets/)
  })

  test('truncated workbook stages with reason, never throws', () => {
    const whole = buildFixtureWorkbook()
    const result = ingestWorkbook(whole.slice(0, Math.floor(whole.length / 3)))
    expect(result.staged_for_review).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  test('non-Buffer argument is the one programmer-error throw', () => {
    expect(() => ingestWorkbook('not-a-buffer')).toThrow(TypeError)
  })
})

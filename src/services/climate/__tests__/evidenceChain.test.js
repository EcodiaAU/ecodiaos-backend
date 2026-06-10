'use strict'

/**
 * evidenceChain tests (climate-disclosure W2 verify gate).
 * Runner: jest (the repo's configured runner, package.json "test": "jest").
 *
 * Gates from the spec:
 *  - tamper test red-then-green: modifying a mid-chain row breaks verification at
 *    exactly that seq; restoring it goes green again
 *  - out-of-order / duplicate seq detected
 *  - supersession does not break the chain
 *  - verifyChain over a 10,000-row synthetic register completes under 30 seconds
 */

const {
  CONTENT_COLUMNS,
  canonicalise,
  hashRow,
  verifyChain,
  buildAnchorDigest,
} = require('../evidenceChain')

const ENGAGEMENT_ID = '00000000-0000-0000-0000-000000000001'

/** Build a valid synthetic chain of n rows. */
function buildChain(n, { engagementId = ENGAGEMENT_ID } = {}) {
  const rows = []
  let prevHash = null
  for (let i = 1; i <= n; i++) {
    const row = {
      id: `row-${i}`,
      engagement_id: engagementId,
      seq: i,
      doc_sha256: `doc-sha-${i}`,
      storage_path: `${engagementId}/raw/doc-${i}.pdf`,
      source_channel: 'email',
      document_type: i % 2 === 0 ? 'electricity_invoice' : 'fuel_card_statement',
      facility: i % 2 === 0 ? 'Site A' : 'Site B',
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      scope_category: i % 2 === 0 ? 'scope2' : 'scope1',
      classifier_version: 'clf-v1',
      classification_confidence: 0.97,
      payload: { amount: i * 100, unit: 'kWh', nested: { a: 1, b: [1, 2, 3] } },
      supersedes_id: null,
      confirmation_status: 'auto',
      captured_at: '2026-07-05T00:00:00.000Z',
      prev_hash: prevHash == null ? '' : prevHash,
    }
    row.row_hash = hashRow(row, prevHash)
    prevHash = row.row_hash
    rows.push(row)
  }
  return rows
}

describe('canonicalise', () => {
  test('is stable under key order, extra fields and undefined-vs-null', () => {
    const base = buildChain(1)[0]
    const reordered = {}
    for (const key of Object.keys(base).reverse()) reordered[key] = base[key]
    reordered.extra_non_content_field = 'ignored'
    reordered.row_hash = 'something else entirely'
    expect(canonicalise(reordered)).toBe(canonicalise(base))

    const withNull = { ...base, facility: null }
    const withUndefined = { ...base }
    delete withUndefined.facility
    expect(canonicalise(withUndefined)).toBe(canonicalise(withNull))
  })

  test('sorts nested payload keys recursively', () => {
    const a = { ...buildChain(1)[0], payload: { b: 2, a: { y: 1, x: 2 } } }
    const b = { ...a, payload: { a: { x: 2, y: 1 }, b: 2 } }
    expect(canonicalise(a)).toBe(canonicalise(b))
  })

  test('covers every content column', () => {
    const json = JSON.parse(canonicalise(buildChain(1)[0]))
    expect(Object.keys(json).sort()).toEqual([...CONTENT_COLUMNS].sort())
  })

  test('changing any content column changes the canonical form', () => {
    const base = buildChain(1)[0]
    for (const col of CONTENT_COLUMNS) {
      const mutated = { ...base, [col]: 'MUTATED-VALUE-FOR-TEST' }
      expect(canonicalise(mutated)).not.toBe(canonicalise(base))
    }
  })
})

describe('hashRow', () => {
  test('returns sha256 hex and is deterministic', () => {
    const row = buildChain(1)[0]
    const h1 = hashRow(row, null)
    const h2 = hashRow(row, null)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).toBe(h2)
  })

  test('depends on prevHash (the chain link)', () => {
    const row = buildChain(1)[0]
    expect(hashRow(row, null)).not.toBe(hashRow(row, 'a'.repeat(64)))
  })
})

describe('verifyChain', () => {
  test('empty register is valid', () => {
    expect(verifyChain([])).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('valid chain verifies green', () => {
    expect(verifyChain(buildChain(50))).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('caller row order does not matter (verifier sorts by seq)', () => {
    const rows = buildChain(20)
    const shuffled = [...rows].sort(() => 0.5 - Math.random())
    expect(verifyChain(shuffled)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('tamper red-then-green: mid-chain content edit breaks at exactly that seq', () => {
    const rows = buildChain(100)
    const original = rows[41].doc_sha256
    rows[41].doc_sha256 = 'tampered-after-the-fact' // seq 42
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAtSeq: 42 })
    rows[41].doc_sha256 = original // restore -> green again
    expect(verifyChain(rows)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('rewriting a mid-chain row_hash breaks at that seq (recompute mismatch)', () => {
    const rows = buildChain(10)
    rows[4].row_hash = 'f'.repeat(64) // seq 5
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAtSeq: 5 })
  })

  test('a forged prev_hash link breaks at that seq', () => {
    const rows = buildChain(10)
    rows[6].prev_hash = 'e'.repeat(64) // seq 7
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAtSeq: 7 })
  })

  test('duplicate seq detected', () => {
    const rows = buildChain(10)
    rows[5].seq = 5 // duplicate of rows[4]
    const result = verifyChain(rows)
    expect(result.valid).toBe(false)
    expect(result.brokenAtSeq).toBe(5)
  })

  test('a deleted (missing) mid-chain row is detected', () => {
    const rows = buildChain(10)
    rows.splice(4, 1) // remove seq 5; seq 6's prev_hash no longer matches seq 4's row_hash
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAtSeq: 6 })
  })

  test('supersession does not break the chain', () => {
    const rows = buildChain(10)
    const head = rows[rows.length - 1]
    const correction = {
      ...rows[2],
      id: 'row-11',
      seq: 11,
      doc_sha256: 'corrected-doc-sha',
      supersedes_id: rows[2].id,
      prev_hash: head.row_hash,
    }
    correction.row_hash = hashRow(correction, head.row_hash)
    rows.push(correction)
    expect(verifyChain(rows)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('10,000-row synthetic register verifies green in under 30 seconds', () => {
    const rows = buildChain(10000)
    const started = Date.now()
    const result = verifyChain(rows)
    const elapsedMs = Date.now() - started
    expect(result).toEqual({ valid: true, brokenAtSeq: null })
    expect(elapsedMs).toBeLessThan(30000)
    // eslint-disable-next-line no-console
    console.log(`verifyChain(10000 rows) took ${elapsedMs}ms`)
  })
})

describe('buildAnchorDigest', () => {
  test('returns the chain-head digest payload for cd_anchors', () => {
    const rows = buildChain(25)
    const digest = buildAnchorDigest(rows)
    expect(digest).toEqual({
      engagement_id: ENGAGEMENT_ID,
      chain_head_hash: rows[24].row_hash,
      seq_from: 1,
      seq_to: 25,
      row_count: 25,
    })
  })

  test('refuses to anchor a broken chain', () => {
    const rows = buildChain(25)
    rows[10].payload = { amount: 999999, note: 'tampered' }
    expect(() => buildAnchorDigest(rows)).toThrow(/chain invalid at seq 11/)
  })

  test('refuses an empty register', () => {
    expect(() => buildAnchorDigest([])).toThrow(/non-empty/)
  })
})

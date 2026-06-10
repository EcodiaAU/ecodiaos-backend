'use strict'
// W2.1 consolidation test (engagement-zero live finding, 2026-06-10): postgres.js
// returns bigint seq and numeric classification_confidence as strings and date
// columns as UTC-midnight Date objects, which broke verifyChain over raw fetched
// rows at seq 1. The single exported normaliser must make driver-shaped rows
// verify green, be idempotent on JS-native rows, and back the connector's alias.
const evidenceChain = require('../evidenceChain')
const { normaliseFetchedRow, hashRow, verifyChain } = evidenceChain
const connectorTools = require('../connector/tools')

function buildChain() {
  const rows = []
  let prev = null
  for (let seq = 1; seq <= 3; seq += 1) {
    const row = {
      engagement_id: 'e0',
      seq,
      doc_sha256: `hash-${seq}`,
      document_type: 'supplier_invoice',
      facility: 'cloud/upstash',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      classification_confidence: 0.71,
      captured_at: '2026-06-10T06:00:00.000Z',
      supersedes_id: null,
      confirmation_status: 'pending_confirmation',
    }
    const row_hash = hashRow(row, prev)
    rows.push({ ...row, prev_hash: prev, row_hash })
    prev = row_hash
  }
  return rows
}

function driverShape(row) {
  return {
    ...row,
    seq: String(row.seq),
    classification_confidence: String(row.classification_confidence),
    period_start: new Date(`${row.period_start}T00:00:00.000Z`),
    period_end: new Date(`${row.period_end}T00:00:00.000Z`),
    captured_at: new Date(row.captured_at),
  }
}

describe('normaliseFetchedRow (W2.1, single canonical implementation)', () => {
  test('raw driver-shaped rows fail verification, normalised rows pass', () => {
    const rows = buildChain()
    const driverRows = rows.map(driverShape)
    expect(verifyChain(driverRows).valid).toBe(false)
    const normalised = driverRows.map(normaliseFetchedRow)
    expect(verifyChain(normalised)).toEqual({ valid: true, brokenAtSeq: null })
  })

  test('idempotent on JS-native rows (byte-identical hashes)', () => {
    const rows = buildChain()
    const once = rows.map(normaliseFetchedRow)
    const twice = once.map(normaliseFetchedRow)
    expect(verifyChain(once).valid).toBe(true)
    expect(twice).toEqual(once)
  })

  test('connector normaliseForChain IS the library export, no divergent copy', () => {
    expect(connectorTools.normaliseForChain).toBe(normaliseFetchedRow)
  })

  test('throws on non-object input', () => {
    expect(() => normaliseFetchedRow(null)).toThrow(TypeError)
  })
})

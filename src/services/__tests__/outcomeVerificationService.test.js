'use strict'

/**
 * Unit tests for outcomeVerificationService - the post-signal_done probe library
 * (Layer 6 of the 24/7 autonomy architecture). Mocks db so the status_board /
 * db_row probes and the spec parser are exercised without a live Postgres.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

jest.mock('../../config/db', () => {
  globalThis.__verifyMock = { statusRow: null }
  const sql = (strings, ...vals) => {
    const s = globalThis.__verifyMock
    const text = strings.join('?').toLowerCase()
    if (text.includes('from status_board')) {
      return Promise.resolve(s.statusRow ? [s.statusRow] : [])
    }
    return Promise.resolve([])
  }
  sql.json = (v) => v
  sql.unsafe = (sqlStr, params) => {
    const s = globalThis.__verifyMock
    return Promise.resolve(s.dbRowExists ? [{ 1: 1 }] : [])
  }
  return sql
})

const verify = require('../outcomeVerificationService')

describe('outcomeVerificationService.parseSpec', () => {
  test('parses a verify: pointer into a spec object', () => {
    const spec = verify.parseSpec('verify:type=status_board;name=My Row;status_contains=shipped')
    expect(spec.type).toBe('status_board')
    expect(spec.name).toBe('My Row')
    expect(spec.status_contains).toBe('shipped')
  })

  test('returns null for non-verify pointers', () => {
    expect(verify.parseSpec('some-file-path.md')).toBeNull()
    expect(verify.parseSpec(null)).toBeNull()
    expect(verify.parseSpec('')).toBeNull()
  })
})

describe('outcomeVerificationService.verify', () => {
  beforeEach(() => { globalThis.__verifyMock = { statusRow: null, dbRowExists: false } })

  test('no spec -> { verified: false, drift_reason: no_spec }', async () => {
    const r = await verify.verify(null)
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toBe('no_spec')
  })

  test('unknown probe type -> drift_reason names it', async () => {
    const r = await verify.verify({ type: 'made_up' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toMatch(/unknown_probe_type:made_up/)
  })

  test('status_board probe verifies when row exists', async () => {
    globalThis.__verifyMock.statusRow = { id: 'r1', name: 'X', status: 'shipped_ok', archived_at: null }
    const r = await verify.verify({ type: 'status_board', name: 'X' })
    expect(r.verified).toBe(true)
    expect(r.probe_type).toBe('status_board')
  })

  test('status_board probe fails when row absent', async () => {
    globalThis.__verifyMock.statusRow = null
    const r = await verify.verify({ type: 'status_board', name: 'missing' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toBe('row_not_found')
  })

  test('status_board probe fails on status_contains mismatch', async () => {
    globalThis.__verifyMock.statusRow = { id: 'r1', name: 'X', status: 'in_progress', archived_at: null }
    const r = await verify.verify({ type: 'status_board', name: 'X', status_contains: 'shipped' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toMatch(/status_mismatch/)
  })

  test('status_board probe needs name or id', async () => {
    const r = await verify.verify({ type: 'status_board' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toBe('spec_missing_name_or_id')
  })

  test('db_row probe verifies when a row matches', async () => {
    globalThis.__verifyMock.dbRowExists = true
    const r = await verify.verify({ type: 'db_row', table: 'kg_episodes', where_column: 'id', where_value: 'e1' })
    expect(r.verified).toBe(true)
  })

  test('db_row probe rejects unsafe identifiers', async () => {
    const r = await verify.verify({ type: 'db_row', table: 'kg; DROP TABLE x', where_column: 'id', where_value: 'e1' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toBe('spec_unsafe_identifier')
  })

  test('file_write probe verifies an existing file', async () => {
    const r = await verify.verify({ type: 'file_write', path: __filename })
    expect(r.verified).toBe(true)
    expect(r.evidence.size).toBeGreaterThan(0)
  })

  test('file_write probe fails on a missing file', async () => {
    const r = await verify.verify({ type: 'file_write', path: 'D:/nope/does-not-exist-xyz.txt' })
    expect(r.verified).toBe(false)
    expect(r.drift_reason).toMatch(/stat_failed/)
  })
})

describe('outcomeVerificationService.verifyFromSignal', () => {
  beforeEach(() => { globalThis.__verifyMock = { statusRow: null, dbRowExists: false } })

  test('no verify spec on signal -> verified: null (no probe ran)', async () => {
    const r = await verify.verifyFromSignal({ result_summary: 'done', result_pointer: 'just-a-file.md' })
    expect(r.verified).toBeNull()
  })

  test('parses verify: pointer from signal.result_pointer', async () => {
    globalThis.__verifyMock.statusRow = { id: 'r1', name: 'X', status: 'ok', archived_at: null }
    const r = await verify.verifyFromSignal({ result_pointer: 'verify:type=status_board;name=X' })
    expect(r.verified).toBe(true)
  })

  test('opts.verify overrides signal pointer', async () => {
    globalThis.__verifyMock.statusRow = { id: 'r1', name: 'Y', status: 'ok', archived_at: null }
    const r = await verify.verifyFromSignal({ result_pointer: null }, { verify: { type: 'status_board', name: 'Y' } })
    expect(r.verified).toBe(true)
  })
})

describe('registerProbe', () => {
  test('a custom probe type becomes callable', async () => {
    verify.registerProbe('always_true', async () => ({ verified: true, evidence: { custom: 1 } }))
    const r = await verify.verify({ type: 'always_true' })
    expect(r.verified).toBe(true)
    expect(r.evidence.custom).toBe(1)
  })

  test('registerProbe validates args', () => {
    expect(() => verify.registerProbe('x', 'not-a-fn')).toThrow()
  })
})

'use strict'

/**
 * Tick-level test: claimVerifierWorker.tick() pulls pending rows, runs
 * per-row verifiers, and issues an UPDATE per row. Proves the SELECT →
 * verify → UPDATE loop actually wires together.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

// Template-tag mock that captures (tag, ...values) and returns queued results.
const _dbCalls = []
const _dbReturns = []
jest.mock('../../config/db', () => {
  return (strings, ...values) => {
    const sql = Array.isArray(strings) ? strings.join('?') : String(strings)
    _dbCalls.push({ sql, values })
    if (_dbReturns.length > 0) {
      const next = _dbReturns.shift()
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next)
    }
    return Promise.resolve([])
  }
})

jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, opts, cb) => cb(null, { stdout: '', stderr: '' })),
}))

const worker = require('../claimVerifierWorker')

function resetMocks() {
  _dbCalls.length = 0
  _dbReturns.length = 0
}

describe('claimVerifierWorker.tick()', () => {
  beforeEach(resetMocks)

  test('no pending rows → no UPDATEs', async () => {
    _dbReturns.push([]) // SELECT returns empty
    await worker.tick()
    // One call (the SELECT) only.
    expect(_dbCalls.length).toBe(1)
    expect(_dbCalls[0].sql).toMatch(/FROM conductor_claims/)
  })

  test('pending rows → one UPDATE per row with correct status', async () => {
    const claimedAt = new Date(Date.now() - 1000).toISOString()
    _dbReturns.push([
      { id: 1, session_id: 's', action: 'deployed', handle_kv: { sha: 'abc1234' }, claimed_at: claimedAt },
      { id: 2, session_id: 's', action: 'danced',   handle_kv: {},                 claimed_at: claimedAt },
    ])
    _dbReturns.push([]) // UPDATE row 1
    _dbReturns.push([]) // UPDATE row 2

    await worker.tick()

    // Expect 1 SELECT + 2 UPDATEs.
    expect(_dbCalls.length).toBe(3)
    expect(_dbCalls[0].sql).toMatch(/SELECT id, session_id, action/)
    expect(_dbCalls[1].sql).toMatch(/UPDATE conductor_claims/)
    expect(_dbCalls[2].sql).toMatch(/UPDATE conductor_claims/)

    // Row 1 is 'deployed' with a valid sha → git verifier mocked to success → 'verified'.
    // Row 2 is 'danced' → 'action_unknown'.
    // The status is interpolated as a values[] entry in the tagged template.
    const row1Values = _dbCalls[1].values.map(String)
    const row2Values = _dbCalls[2].values.map(String)
    expect(row1Values).toContain('verified')
    expect(row2Values).toContain('action_unknown')
  })

  test('SELECT failure is non-fatal (caught + warned)', async () => {
    _dbReturns.push(new Error('DB down'))
    await expect(worker.tick()).resolves.not.toThrow()
  })
})

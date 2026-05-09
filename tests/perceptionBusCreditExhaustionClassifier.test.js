'use strict'

/**
 * perceptionBusCreditExhaustionClassifier.test.js
 *
 * 8 May 2026 - fork_moxvsqee_e29694
 *
 * Guards the producer-side classifier patch on perceptionDispatcher.js
 * `error_escalation` matcher. Per
 * ~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md, fork-error
 * events whose abort_reason matches a credit-exhaustion pattern must NOT
 * auto-create a P1 status_board row. They publish a P3 telemetry event
 * (`fork_credit_exhaustion_observed`) and return.
 *
 * Four guards:
 *   (a) credit-exhaustion abort_reason -> NO P1 INSERT, P3 publish fired
 *   (b) generic fork_error abort_reason -> P1 INSERT proceeds (preserve)
 *   (c) null/missing abort_reason -> P1 INSERT proceeds (preserve)
 *   (d) regex matches the documented variants
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// Mock db: tagged-template fn that returns the next queued result.
const _dbCalls = []
const _dbQueue = []
jest.mock('../src/config/db', () => {
  function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    _dbCalls.push({ sql, values })
    if (_dbQueue.length === 0) return Promise.resolve([])
    const next = _dbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

// Mock perceptionBus.publish so we can observe the P3 emission without
// triggering the real bus subscription chain.
const _publishCalls = []
jest.mock('../src/services/perceptionBus', () => ({
  publish: jest.fn(async (event) => { _publishCalls.push(event); return event }),
  subscribe: jest.fn(),
}))

// Avoid loading the deferred matcher modules under unrelated module paths.
// They each require ../perceptionBus which is mocked above; that's enough.
const dispatcher = require('../src/services/perceptionDispatcher')

const errorEscalation = dispatcher.MATCHERS.find(m => m.domain === 'error_escalation')

beforeEach(() => {
  _dbCalls.length = 0
  _dbQueue.length = 0
  _publishCalls.length = 0
})

describe('CREDIT_EXHAUSTION_REGEX', () => {
  test('(d) matches "out of extra usage" canonical Claude Code message', () => {
    const samples = [
      "Claude Code returned an error result: You're out of extra usage · resets May 12, 11am (UTC)",
      "Claude Code returned an error result: You're out of extra usage · resets 8:10am (UTC)",
      "Claude Code returned an error result: You're out of extra usage · resets 4pm (UTC)",
      "Claude Code returned an error result: You're out of extra usage · resets 2:40am (UTC)",
    ]
    for (const s of samples) {
      expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test(s)).toBe(true)
    }
  })

  test('(d) matches "credit exhaust" / "credit_exhaust" / "credit-exhaust" variants', () => {
    expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test('credit exhausted on tate@ account')).toBe(true)
    expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test('credit_exhaustion fault')).toBe(true)
    expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test('CREDIT-EXHAUSTED')).toBe(true)
  })

  test('(d) matches "reset.*UTC" sub-pattern alone', () => {
    expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test('account resets May 12, 11am (UTC)')).toBe(true)
    expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test('quota reset at 9am UTC')).toBe(true)
  })

  test('(d) does NOT match unrelated fork_error abort_reasons', () => {
    const benign = [
      'Claude Code native binary not found at /home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude.',
      'stale_running_row_runtime_not_active_db_hygiene_30apr_12_19_aest',
      'AbortError: aborted',
      'TypeError: Cannot read property foo of undefined',
      'transport disconnect',
    ]
    for (const s of benign) {
      expect(dispatcher.CREDIT_EXHAUSTION_REGEX.test(s)).toBe(false)
    }
  })
})

describe('error_escalation dispatch credit-exhaustion classifier', () => {
  test('(a) credit_exhaustion abort_reason -> classified credit_exhaustion, NO P1 row inserted', async () => {
    // os_forks lookup returns credit-exhaustion abort_reason
    _dbQueue.push([{
      abort_reason: "Claude Code returned an error result: You're out of extra usage · resets May 12, 11am (UTC)",
    }])

    const event = {
      source: 'fork',
      kind: 'fork_error',
      data: { fork_id: 'fork_test_credit_exhaust', status: 'error' },
      confidence: 1.0,
    }

    await errorEscalation.dispatch(event)

    // Exactly one DB call: the abort_reason lookup. NO status_board SELECT
    // and NO status_board INSERT.
    expect(_dbCalls.length).toBe(1)
    expect(_dbCalls[0].sql).toContain('SELECT abort_reason FROM os_forks')
    const allSql = _dbCalls.map(c => c.sql).join(' | ')
    expect(allSql).not.toMatch(/SELECT id FROM status_board/i)
    expect(allSql).not.toMatch(/INSERT INTO status_board/i)

    // P3 telemetry event published.
    expect(_publishCalls.length).toBe(1)
    expect(_publishCalls[0].kind).toBe('fork_credit_exhaustion_observed')
    expect(_publishCalls[0].source).toBe('perception_dispatcher')
    expect(_publishCalls[0].data.fork_id).toBe('fork_test_credit_exhaust')
    expect(_publishCalls[0].data.original_kind).toBe('fork_error')
  })

  test('(b) generic fork_error abort_reason -> classified fork_error, P1 row inserted as before', async () => {
    // First DB call: abort_reason lookup. Second: status_board existence check.
    // Third: status_board INSERT.
    _dbQueue.push([{
      abort_reason: 'Claude Code native binary not found at /home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude.',
    }])
    _dbQueue.push([])    // status_board existing-row check returns empty
    _dbQueue.push([])    // status_board INSERT (no return rows expected by current code)

    const event = {
      source: 'fork',
      kind: 'fork_error',
      data: { fork_id: 'fork_test_generic_error', status: 'error' },
      confidence: 1.0,
    }

    await errorEscalation.dispatch(event)

    // Three DB calls: abort_reason lookup + status_board SELECT + INSERT.
    expect(_dbCalls.length).toBe(3)
    expect(_dbCalls[0].sql).toContain('SELECT abort_reason FROM os_forks')
    expect(_dbCalls[1].sql).toContain('SELECT id FROM status_board')
    expect(_dbCalls[2].sql).toContain('INSERT INTO status_board')
    expect(_dbCalls[2].sql).toContain('infrastructure')

    // No credit-exhaustion publish.
    const ceCalls = _publishCalls.filter(p => p.kind === 'fork_credit_exhaustion_observed')
    expect(ceCalls.length).toBe(0)
  })

  test('(c) null/missing abort_reason -> falls through to fork_error path (preserve existing behavior)', async () => {
    _dbQueue.push([{ abort_reason: null }]) // lookup returns null
    _dbQueue.push([])                        // status_board existing-row check empty
    _dbQueue.push([])                        // status_board INSERT

    const event = {
      source: 'fork',
      kind: 'fork_error',
      data: { fork_id: 'fork_test_null_reason' },
      confidence: 1.0,
    }

    await errorEscalation.dispatch(event)

    expect(_dbCalls.length).toBe(3)
    expect(_dbCalls[0].sql).toContain('SELECT abort_reason FROM os_forks')
    expect(_dbCalls[1].sql).toContain('SELECT id FROM status_board')
    expect(_dbCalls[2].sql).toContain('INSERT INTO status_board')
    const ceCalls = _publishCalls.filter(p => p.kind === 'fork_credit_exhaustion_observed')
    expect(ceCalls.length).toBe(0)
  })

  test('non-fork-terminal kinds skip the abort_reason lookup entirely', async () => {
    // For e.g. session_failure / generic crash events, the matcher must NOT
    // hit os_forks - it goes straight to the status_board path.
    _dbQueue.push([])  // status_board existing-row check empty
    _dbQueue.push([])  // status_board INSERT

    const event = {
      source: 'factory',
      kind: 'session_failure',
      data: { session_id: 'cc_abc' },
      confidence: 1.0,
    }

    await errorEscalation.dispatch(event)

    expect(_dbCalls.length).toBe(2)
    expect(_dbCalls[0].sql).toContain('SELECT id FROM status_board')
    expect(_dbCalls[1].sql).toContain('INSERT INTO status_board')
  })

  test('lookup failure on abort_reason falls through to generic escalation (defensive)', async () => {
    _dbQueue.push(new Error('db down'))  // abort_reason lookup throws
    _dbQueue.push([])                    // status_board SELECT
    _dbQueue.push([])                    // status_board INSERT

    const event = {
      source: 'fork',
      kind: 'fork_aborted',
      data: { fork_id: 'fork_test_lookup_fail' },
      confidence: 1.0,
    }

    await errorEscalation.dispatch(event)

    expect(_dbCalls.length).toBe(3)
    expect(_dbCalls[2].sql).toContain('INSERT INTO status_board')
    const ceCalls = _publishCalls.filter(p => p.kind === 'fork_credit_exhaustion_observed')
    expect(ceCalls.length).toBe(0)
  })
})

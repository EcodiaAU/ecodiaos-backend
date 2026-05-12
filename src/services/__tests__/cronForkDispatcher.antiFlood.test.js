'use strict'

/**
 * cronForkDispatcher anti-flood gate tests
 *
 * Verifies that the account-chain exhaustion anti-flood gate:
 *   1. Suppresses LOW_PRIORITY dispatch when 3+ credit-exhaustion errors in window
 *   2. Passes HIGH_PRIORITY dispatch through regardless of chain state
 *   3. Respects existing kv_store pause (survives PM2 restart mid-pause)
 *   4. Clears an expired kv_store pause and re-checks live state
 *   5. _parseResetTimeFromAbortReason parses real abort_reason text correctly
 *   6. _checkChainExhaustionState: exhausted=false when below threshold
 *   7. _checkChainExhaustionState: exhausted=true + uses credit_reset_at when set
 *
 * Spec: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md
 */

// ── dependency mocks (declared before any require of the module under test) ──

const mockDbCalls = []
const mockDbQueue = []

jest.mock('../../config/db', () => {
  function dbTag(strings, ...values) {
    // Tagged template: strings is a TemplateStringsArray (array-like with .raw)
    const sql = Array.from(strings).join('?').trim()
    mockDbCalls.push({ sql, values })
    if (mockDbQueue.length === 0) return Promise.resolve([])
    const next = mockDbQueue.shift()
    // Support queuing a rejected promise (Error instance) for error-path tests
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
  return dbTag
})

jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}))

jest.mock('../forkService', () => ({
  spawnFork: jest.fn().mockResolvedValue({ fork_id: 'fork_test_antiflooda1b2c3' }),
}))

// fs mock: existsSync returns false so _runHooksForCronBrief skips all hooks.
// appendFileSync and mkdirSync are no-ops for the perf telemetry writes.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}))

// ── module under test ─────────────────────────────────────────────────────────

const {
  dispatchCronAsFork,
  _isAntiFloodPaused,
  _checkChainExhaustionState,
  _parseResetTimeFromAbortReason,
} = require('../cronForkDispatcher')

const forkService = require('../forkService')

// ── helpers ──────────────────────────────────────────────────────────────────

const FUTURE_ISO = new Date(Date.now() + 60 * 60 * 1000).toISOString()  // +1h
const PAST_ISO   = new Date(Date.now() - 60 * 60 * 1000).toISOString()  // -1h

function makeCreditErrorRow(overrides = {}) {
  return {
    abort_reason: "You're out of extra usage · resets 11am (UTC)",
    ended_at: new Date().toISOString(),
    credit_reset_at: FUTURE_ISO,
    failure_class: 'account_chain_exhausted',
    ...overrides,
  }
}

/** LOW_PRIORITY cron by default (deep-research is in LOW_PRIORITY_FORK_CRONS) */
function makeCronTask(overrides = {}) {
  return {
    id: 'cron-task-anti-flood-test-001',
    name: 'deep-research',
    prompt: 'Run deep research on conservation tech trends.',
    cron_expression: 'every 3h',
    ...overrides,
  }
}

/**
 * Push budget mocks onto the queue (calls 1+2 in dispatchCronAsFork for any fork route).
 */
function pushBudgetMocks(remaining = 80000, max = 100000) {
  mockDbQueue.push([{ value: JSON.stringify({ remaining }) }])  // _readBudget
  mockDbQueue.push([{ value: JSON.stringify({ max }) }])        // _readBudgetMax
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbCalls.length = 0
  mockDbQueue.length = 0
  jest.clearAllMocks()
})

afterAll(async () => {
  // Drain setImmediate callbacks (logger DBErrorTransport constructor pattern)
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('cronForkDispatcher anti-flood gate', () => {

  // ── Core gate-engages test (the one the brief requires) ──────────────────────

  test('suppresses LOW_PRIORITY dispatch when 3+ credit-exhaustion errors in window', async () => {
    pushBudgetMocks()
    // _readFloodPauseUntil → no existing pause
    mockDbQueue.push([])
    // _checkChainExhaustionState → 3 matching error rows (threshold hit)
    mockDbQueue.push([
      makeCreditErrorRow(),
      makeCreditErrorRow(),
      makeCreditErrorRow(),
    ])
    // _writeFloodPauseUntil → INSERT (queue empty after this, mock returns [])

    const result = await dispatchCronAsFork(makeCronTask())

    expect(result.spawned).toBe(false)
    expect(result.reason).toBe('anti_flood_pause')
    expect(result.route).toBe('low_priority_fork')
    expect(result.shouldHandle).toBe(true)
    expect(result.pause_until ?? result.fork_id).toBeFalsy() // fork_id must be null
    expect(result.fork_id).toBeNull()
    // spawnFork must NOT have been called - gate suppressed before spawn
    expect(forkService.spawnFork).not.toHaveBeenCalled()
  })

  // ── HIGH_PRIORITY bypass ──────────────────────────────────────────────────────

  test('HIGH_PRIORITY dispatch proceeds regardless of chain state', async () => {
    // No anti-flood check for high_priority_fork routes - it bypasses the gate
    pushBudgetMocks()
    // No further DB mocks needed for the gate check (not low_priority)
    // budget gate: allow=true at 80% budget
    // _decrementBudget and _stampForkIdOnCron will drain from empty queue → []

    const result = await dispatchCronAsFork(makeCronTask({ name: 'email-triage' }))

    expect(result.spawned).toBe(true)
    expect(result.route).toBe('high_priority_fork')
    expect(forkService.spawnFork).toHaveBeenCalledTimes(1)
  })

  // ── Existing kv_store pause respected ────────────────────────────────────────

  test('existing kv_store pause is respected without querying os_forks', async () => {
    pushBudgetMocks()
    // _readFloodPauseUntil → returns an active future pause
    mockDbQueue.push([{
      value: JSON.stringify({ until: FUTURE_ISO, set_at: new Date().toISOString() }),
    }])
    // os_forks should NOT be queried (kv_store hit short-circuits the live check)

    const result = await dispatchCronAsFork(makeCronTask())

    expect(result.spawned).toBe(false)
    expect(result.reason).toBe('anti_flood_pause')
    expect(forkService.spawnFork).not.toHaveBeenCalled()

    // Verify os_forks was never queried
    const forkErrorQuery = mockDbCalls.find(c => c.sql.includes('os_forks'))
    expect(forkErrorQuery).toBeUndefined()
  })

  // ── Expired kv_store pause clears and allows dispatch ────────────────────────

  test('expired kv_store pause is cleared and dispatch proceeds when chain healthy', async () => {
    pushBudgetMocks()
    // _readFloodPauseUntil → returns an EXPIRED pause
    mockDbQueue.push([{
      value: JSON.stringify({ until: PAST_ISO, set_at: PAST_ISO }),
    }])
    // _clearFloodPauseUntil DELETE → ok
    mockDbQueue.push([])
    // _checkChainExhaustionState → only 1 error (below threshold of 3)
    mockDbQueue.push([makeCreditErrorRow()])
    // dispatch proceeds: _decrementBudget, _stampForkIdOnCron drain from empty queue

    const result = await dispatchCronAsFork(makeCronTask())

    expect(result.spawned).toBe(true)
    expect(result.reason).toBe('spawned')
    expect(forkService.spawnFork).toHaveBeenCalledTimes(1)
  })

  // ── Missing kv_store row on first run ─────────────────────────────────────────

  test('handles missing kv_store row gracefully (first run, chain healthy)', async () => {
    pushBudgetMocks()
    // _readFloodPauseUntil → no row (first run)
    mockDbQueue.push([])
    // _checkChainExhaustionState → 0 errors
    mockDbQueue.push([])

    const result = await dispatchCronAsFork(makeCronTask())

    // Gate should not fire - dispatch proceeds normally
    expect(result.spawned).toBe(true)
    expect(result.reason).toBe('spawned')
    expect(forkService.spawnFork).toHaveBeenCalledTimes(1)
  })

  // ── _parseResetTimeFromAbortReason ────────────────────────────────────────────

  test('_parseResetTimeFromAbortReason parses "resets 11am (UTC)" correctly', () => {
    const result = _parseResetTimeFromAbortReason(
      "You're out of extra usage · resets 11am (UTC)"
    )
    expect(result).not.toBeNull()
    const parsed = new Date(result)
    expect(parsed.getUTCHours()).toBe(11)
    expect(parsed.getUTCMinutes()).toBe(0)
    // Must be in the future (or exactly at 11:00 UTC today if running then)
    expect(parsed.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  test('_parseResetTimeFromAbortReason returns null for unrecognised text', () => {
    expect(_parseResetTimeFromAbortReason('some random error')).toBeNull()
    expect(_parseResetTimeFromAbortReason('')).toBeNull()
    expect(_parseResetTimeFromAbortReason(null)).toBeNull()
  })

  // ── _checkChainExhaustionState ────────────────────────────────────────────────

  test('_checkChainExhaustionState: exhausted=false when < 3 errors in window', async () => {
    // DB returns 2 matching rows (below threshold)
    mockDbQueue.push([makeCreditErrorRow(), makeCreditErrorRow()])

    const result = await _checkChainExhaustionState()

    expect(result.exhausted).toBe(false)
    expect(result.count).toBe(2)
    expect(result.minResetIso).toBeNull()
  })

  test('_checkChainExhaustionState: exhausted=true with minResetIso from credit_reset_at', async () => {
    const soonest = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()  // +2h
    const later1  = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()  // +3h
    const later2  = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()  // +4h

    mockDbQueue.push([
      makeCreditErrorRow({ credit_reset_at: soonest }),
      makeCreditErrorRow({ credit_reset_at: later1 }),
      makeCreditErrorRow({ credit_reset_at: later2 }),
    ])

    const result = await _checkChainExhaustionState()

    expect(result.exhausted).toBe(true)
    expect(result.count).toBe(3)
    // minResetIso must be the EARLIEST reset time
    expect(result.minResetIso).toBe(soonest)
  })

  test('_checkChainExhaustionState: fail-open on DB error (returns exhausted=false)', async () => {
    // Queue a DB error
    mockDbQueue.push(new Error('DB connection refused'))

    const result = await _checkChainExhaustionState()

    // Fail-open: do not suppress dispatch when the check itself fails
    expect(result.exhausted).toBe(false)
    expect(result.count).toBe(0)
  })

  // ── _isAntiFloodPaused integration ───────────────────────────────────────────

  test('_isAntiFloodPaused: returns paused=false when kv empty and 0 errors', async () => {
    mockDbQueue.push([])  // _readFloodPauseUntil → no row
    mockDbQueue.push([])  // _checkChainExhaustionState → 0 rows

    const result = await _isAntiFloodPaused()

    expect(result.paused).toBe(false)
    expect(result.pauseUntilIso).toBeNull()
  })

  test('_isAntiFloodPaused: returns paused=true when kv row is active future', async () => {
    mockDbQueue.push([{
      value: JSON.stringify({ until: FUTURE_ISO, set_at: new Date().toISOString() }),
    }])

    const result = await _isAntiFloodPaused()

    expect(result.paused).toBe(true)
    expect(result.pauseUntilIso).toBe(FUTURE_ISO)
  })

})

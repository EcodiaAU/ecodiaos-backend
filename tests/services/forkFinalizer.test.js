'use strict'

/**
 * forkFinalizer.finalize tests - Jest.
 *
 * Verifies idempotent terminal-state writes for os_forks:
 *   1. finalize() on a non-terminal row -> {updated:true, alreadyTerminal:false, notFound:false}
 *   2. finalize() on an already-terminal row -> {updated:false, alreadyTerminal:true, notFound:false}
 *   3. finalize() on a non-existent fork id -> {updated:false, alreadyTerminal:false, notFound:true}
 *      and warns at logger.warn level.
 *
 * Mocking strategy mirrors tests/services/forkService.sendMessage.test.js:
 * the postgres tagged-template export is a jest.fn() that we override per-test
 * with mockResolvedValueOnce / mockImplementationOnce. The function makes at
 * most 2 db calls per invocation (UPDATE, then probe SELECT only on 0-row
 * UPDATE), so 2 mockResolvedValueOnce calls are sufficient.
 *
 * Refs Decision 3993, Strategic_Direction 3986. fork_mol0k7vp_cb8a60.
 */

// ---- dependency mocks (must be declared before any require of the module under test) ----

jest.mock('../../src/config/db', () => {
  return jest.fn().mockResolvedValue([])
})

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}))

// ---- module under test ----

const db = require('../../src/config/db')
const logger = require('../../src/config/logger')
const { finalize, TERMINAL_STATES } = require('../../src/services/forkFinalizer')

// ---- setup / teardown ----

beforeEach(() => {
  jest.clearAllMocks()
  // Reset the default mock: db calls return [] unless overridden.
  db.mockReset()
  db.mockResolvedValue([])
})

afterAll(async () => {
  // Drain pending setImmediate callbacks (logger's DBErrorTransport constructor
  // schedules a setImmediate to require('./db')). Same pattern as
  // tests/services/forkService.sendMessage.test.js.
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
})

// ---- tests ----

describe('forkFinalizer.finalize', () => {
  test('1. finalize() on non-terminal row -> {updated:true, alreadyTerminal:false, notFound:false}', async () => {
    // First db call (UPDATE … RETURNING) returns 1 row -> the write happened.
    db.mockResolvedValueOnce([{ fork_id: 'fork_test_a', status: 'done' }])

    const result = await finalize('fork_test_a', 'done', 'fork report body')

    expect(result).toEqual({ updated: true, alreadyTerminal: false, notFound: false })
    expect(db).toHaveBeenCalledTimes(1) // No probe needed when UPDATE matched.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test('2. finalize() on already-terminal row -> {updated:false, alreadyTerminal:true, notFound:false}', async () => {
    // UPDATE matches 0 rows (status was already terminal).
    db.mockResolvedValueOnce([])
    // Probe SELECT finds the row.
    db.mockResolvedValueOnce([{ status: 'done' }])

    const result = await finalize('fork_test_b', 'done', 'late result')

    expect(result).toEqual({ updated: false, alreadyTerminal: true, notFound: false })
    expect(db).toHaveBeenCalledTimes(2) // UPDATE + probe.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test('3. finalize() on non-existent fork id -> {updated:false, alreadyTerminal:false, notFound:true} + warn logged', async () => {
    // UPDATE matches 0 rows.
    db.mockResolvedValueOnce([])
    // Probe SELECT finds nothing.
    db.mockResolvedValueOnce([])

    const result = await finalize('fork_test_missing', 'error', null)

    expect(result).toEqual({ updated: false, alreadyTerminal: false, notFound: true })
    expect(db).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('truly missing'),
      expect.objectContaining({ fork_id: 'fork_test_missing', terminalStatus: 'error' })
    )
  })

  test('rejects invalid terminalStatus values', async () => {
    await expect(finalize('fork_x', 'spawning', null)).rejects.toThrow(/invalid terminalStatus/)
    await expect(finalize('fork_x', 'running', null)).rejects.toThrow(/invalid terminalStatus/)
    await expect(finalize('fork_x', 'crashed', null)).rejects.toThrow(/invalid terminalStatus/)
    await expect(finalize('fork_x', '', null)).rejects.toThrow(/invalid terminalStatus/)
    expect(db).not.toHaveBeenCalled() // Never reached the DB.
  })

  test('rejects missing forkId', async () => {
    await expect(finalize(null, 'done', null)).rejects.toThrow(/forkId is required/)
    await expect(finalize('', 'done', null)).rejects.toThrow(/forkId is required/)
    await expect(finalize(undefined, 'done', null)).rejects.toThrow(/forkId is required/)
  })

  test('TERMINAL_STATES set is exported and locked to {done,aborted,error}', () => {
    expect(TERMINAL_STATES).toBeInstanceOf(Set)
    expect(TERMINAL_STATES.size).toBe(3)
    expect(TERMINAL_STATES.has('done')).toBe(true)
    expect(TERMINAL_STATES.has('aborted')).toBe(true)
    expect(TERMINAL_STATES.has('error')).toBe(true)
    expect(TERMINAL_STATES.has('crashed')).toBe(false) // 'crashed' is recoverStaleForks's domain.
  })

  test('preserves ended_at across calls (idempotency contract via COALESCE in SQL)', async () => {
    // This is a contract test: we verify the SQL the finalizer emits uses
    // COALESCE for ended_at and result so the second call cannot clobber the
    // first. The mock captures the tagged-template parts to assert.
    //
    // Postgres-tagged-template signature: db(stringsArray, ...values)
    let capturedSqlParts = null
    db.mockImplementationOnce((strings, ...values) => {
      capturedSqlParts = strings.join('?')
      return Promise.resolve([{ fork_id: 'fork_idem', status: 'done' }])
    })

    await finalize('fork_idem', 'done', 'body')

    expect(capturedSqlParts).toMatch(/COALESCE\(ended_at,\s*now\(\)\)/i)
    expect(capturedSqlParts).toMatch(/COALESCE\(result,\s*\?\)/i)
    expect(capturedSqlParts).toMatch(/status NOT IN \('done', 'aborted', 'error'\)/i)
  })

  test('UPDATE failure is propagated (caller decides to swallow or rethrow)', async () => {
    db.mockRejectedValueOnce(new Error('connection lost'))

    await expect(finalize('fork_db_err', 'done', null)).rejects.toThrow(/connection lost/)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE failed'),
      expect.objectContaining({ fork_id: 'fork_db_err' })
    )
  })

  test('probe SELECT failure returns ambiguous {updated:false, alreadyTerminal:false, notFound:false}', async () => {
    // UPDATE matches 0 rows.
    db.mockResolvedValueOnce([])
    // Probe throws.
    db.mockRejectedValueOnce(new Error('probe failed'))

    const result = await finalize('fork_probe_err', 'done', null)

    // Ambiguous result - caller treats as "neither confirmed-terminal nor confirmed-missing".
    expect(result).toEqual({ updated: false, alreadyTerminal: false, notFound: false })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('probe SELECT failed'),
      expect.objectContaining({ fork_id: 'fork_probe_err' })
    )
  })
})

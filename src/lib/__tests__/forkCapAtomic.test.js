'use strict'

/**
 * Tests for src/lib/forkCapAtomic.js. DB mocked.
 *
 * Covers:
 *   - Happy path: cap not reached → row returned
 *   - Cap reached: throws fork_cap_reached with cap_hit tag
 *   - Energy cap below hard cap → cap_hit='energy'
 *   - Input validation
 *   - liveForkCount reads the same status set
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockResults = []
const mockCalls = []
jest.mock('../../config/db', () => function dbTag(strings, ...values) {
  mockCalls.push({ sql: strings.join('?'), values })
  if (mockResults.length === 0) return Promise.resolve([])
  const next = mockResults.shift()
  if (next instanceof Error) return Promise.reject(next)
  return Promise.resolve(next)
})

const fca = require('../forkCapAtomic')

beforeEach(() => {
  mockResults.length = 0
  mockCalls.length = 0
})

describe('forkCapAtomic.tryReserveForkSlot', () => {
  test('happy path: cap not reached, returns inserted row', async () => {
    mockResults.push([{
      live_count_before: 2,
      inserted_row: { fork_id: 'f1', brief: 'do x', status: 'spawning' },
    }])
    const row = await fca.tryReserveForkSlot({
      fork_id: 'f1',
      brief: 'do x',
      hard_cap: 5,
    })
    expect(row.fork_id).toBe('f1')
    expect(row.status).toBe('spawning')
    expect(mockCalls[0].sql).toMatch(/pg_advisory_xact_lock/)
    expect(mockCalls[0].sql).toMatch(/INSERT INTO os_forks/)
  })

  test('cap reached: throws fork_cap_reached with hard cap_hit', async () => {
    mockResults.push([{
      live_count_before: 5,
      inserted_row: null,
    }])
    try {
      await fca.tryReserveForkSlot({
        fork_id: 'f1',
        brief: 'do x',
        hard_cap: 5,
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe('fork_cap_reached')
      expect(err.httpStatus).toBe(429)
      expect(err.details.cap_hit).toBe('hard')
      expect(err.details.live_count).toBe(5)
    }
  })

  test('energy cap below hard cap: cap_hit=energy', async () => {
    mockResults.push([{
      live_count_before: 2,
      inserted_row: null,
    }])
    try {
      await fca.tryReserveForkSlot({
        fork_id: 'f1',
        brief: 'do x',
        hard_cap: 5,
        energy_cap: 2,
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe('fork_cap_reached')
      expect(err.details.cap_hit).toBe('energy')
      expect(err.details.effective_cap).toBe(2)
    }
  })

  test('energy cap above hard cap: effective cap is hard', async () => {
    mockResults.push([{
      live_count_before: 5,
      inserted_row: null,
    }])
    try {
      await fca.tryReserveForkSlot({
        fork_id: 'f1',
        brief: 'do x',
        hard_cap: 5,
        energy_cap: 10,
      })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.details.effective_cap).toBe(5)
      expect(err.details.cap_hit).toBe('hard')
    }
  })

  test('input validation: missing fork_id', async () => {
    await expect(fca.tryReserveForkSlot({
      brief: 'x', hard_cap: 5,
    })).rejects.toThrow(/fork_id required/)
  })

  test('input validation: missing brief', async () => {
    await expect(fca.tryReserveForkSlot({
      fork_id: 'f1', hard_cap: 5,
    })).rejects.toThrow(/brief required/)
  })

  test('input validation: bad hard_cap', async () => {
    await expect(fca.tryReserveForkSlot({
      fork_id: 'f1', brief: 'x', hard_cap: 0,
    })).rejects.toThrow(/hard_cap/)
    await expect(fca.tryReserveForkSlot({
      fork_id: 'f1', brief: 'x', hard_cap: -1,
    })).rejects.toThrow(/hard_cap/)
    await expect(fca.tryReserveForkSlot({
      fork_id: 'f1', brief: 'x',
    })).rejects.toThrow(/hard_cap/)
  })

  test('uses ACTIVE_STATUSES consistently', () => {
    expect(fca.ACTIVE_STATUSES).toEqual(['spawning', 'running', 'reporting'])
    expect(Object.isFrozen(fca.ACTIVE_STATUSES)).toBe(true)
  })
})

describe('forkCapAtomic.liveForkCount', () => {
  test('returns integer count from DB', async () => {
    mockResults.push([{ n: 3 }])
    const n = await fca.liveForkCount()
    expect(n).toBe(3)
    expect(mockCalls[0].sql).toMatch(/COUNT/)
    expect(mockCalls[0].sql).toMatch(/spawning|running|reporting/)
  })

  test('empty DB result returns 0', async () => {
    mockResults.push([])
    const n = await fca.liveForkCount()
    expect(n).toBe(0)
  })
})

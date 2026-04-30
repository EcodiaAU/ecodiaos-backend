'use strict'

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockDbCalls = []
const mockDbQueue = []
jest.mock('../../config/db', () => {
  function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    mockDbCalls.push({ sql, values })
    if (mockDbQueue.length === 0) return Promise.resolve([])
    const next = mockDbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

const { tryReserveForkSlot } = require('../../lib/forkCapAtomic')

beforeEach(() => {
  mockDbCalls.length = 0
  mockDbQueue.length = 0
})

describe('forkCapAtomic per-goal fork budget', () => {
  test('decrements goal budget when goal_id provided and slot succeeds', async () => {
    // Main CTE returns inserted row
    mockDbQueue.push([{ live_count_before: 1, inserted_row: { fork_id: 'f1', brief: 'test' } }])
    // Goal budget decrement succeeds
    mockDbQueue.push([{ fork_budget_remaining: 9 }])

    const result = await tryReserveForkSlot({
      fork_id: 'f1', brief: 'test brief', hard_cap: 5, goal_id: 1,
    })
    expect(result).toEqual({ fork_id: 'f1', brief: 'test' })
    // Should have called DB twice: main CTE + goal budget update
    expect(mockDbCalls.length).toBe(2)
    expect(mockDbCalls[1].sql).toContain('organism_goals')
    expect(mockDbCalls[1].sql).toContain('fork_budget_remaining')
  })

  test('rolls back fork when goal budget exhausted (budget=0)', async () => {
    // Main CTE returns inserted row
    mockDbQueue.push([{ live_count_before: 1, inserted_row: { fork_id: 'f2', brief: 'test' } }])
    // Goal budget decrement returns no rows (budget exhausted)
    mockDbQueue.push([])
    // Rollback DELETE
    mockDbQueue.push([])

    await expect(tryReserveForkSlot({
      fork_id: 'f2', brief: 'test brief', hard_cap: 5, goal_id: 2,
    })).rejects.toMatchObject({ code: 'goal_fork_budget_exhausted' })
  })

  test('set budget to 2, fire 5 fork requests for same goal, assert only 2 succeed', async () => {
    let budget = 2
    const results = { success: 0, rejected: 0 }

    for (let i = 0; i < 5; i++) {
      // Main CTE always succeeds
      mockDbQueue.push([{ live_count_before: i, inserted_row: { fork_id: `f-${i}`, brief: 'test' } }])

      if (budget > 0) {
        budget--
        mockDbQueue.push([{ fork_budget_remaining: budget }])
      } else {
        // Budget exhausted
        mockDbQueue.push([])
        mockDbQueue.push([]) // rollback delete
      }

      try {
        await tryReserveForkSlot({
          fork_id: `f-${i}`, brief: 'test brief', hard_cap: 10, goal_id: 99,
        })
        results.success++
      } catch (err) {
        if (err.code === 'goal_fork_budget_exhausted') results.rejected++
        else throw err
      }
    }

    expect(results.success).toBe(2)
    expect(results.rejected).toBe(3)
  })

  test('skips goal budget check when no goal_id provided', async () => {
    mockDbQueue.push([{ live_count_before: 0, inserted_row: { fork_id: 'f-no-goal', brief: 'test' } }])

    const result = await tryReserveForkSlot({
      fork_id: 'f-no-goal', brief: 'test brief', hard_cap: 5,
    })
    expect(result).toEqual({ fork_id: 'f-no-goal', brief: 'test' })
    // Only one DB call (main CTE), no goal budget check
    expect(mockDbCalls.length).toBe(1)
  })
})

'use strict'

/**
 * tatePriorityCurator unit tests - exercises set() and refresh() via a
 * fake db (postgres.js-shaped tagged-template + db.begin transaction).
 */

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

let mockSelectRows = []
let mockCaptured = []

jest.mock('../../src/config/db', () => {
  const tag = jest.fn(async (strings, ...vals) => {
    const sql = Array.from(strings).join(' ').toLowerCase()
    mockCaptured.push({ sql, vals })
    if (sql.includes('select') && sql.includes('from status_board')) {
      return mockSelectRows
    }
    return []
  })
  tag.begin = jest.fn(async (cb) => cb(tag))
  return tag
})

const curator = require('../../src/services/tatePriorityCurator')

beforeEach(() => {
  mockCaptured = []
  mockSelectRows = []
  jest.clearAllMocks()
})

describe('set', () => {
  test('rejects non-array ranked_ids', async () => {
    const r = await curator.set({ ranked_ids: 'oops' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/array/)
  })

  test('rejects >3 ranked_ids', async () => {
    const r = await curator.set({ ranked_ids: ['a', 'b', 'c', 'd'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/<= 3/)
  })

  test('empty array clears all pins', async () => {
    const r = await curator.set({ ranked_ids: [] })
    expect(r.ok).toBe(true)
    const clearCall = mockCaptured.find(c => c.sql.includes('update status_board set tate_priority = null'))
    expect(clearCall).toBeTruthy()
  })

  test('3-id array clears then sets each i+1', async () => {
    const r = await curator.set({ ranked_ids: ['id1', 'id2', 'id3'] })
    expect(r.ok).toBe(true)
    expect(r.ranked).toEqual(['id1', 'id2', 'id3'])
    const setCalls = mockCaptured.filter(c => c.sql.includes('set tate_priority =') && !c.sql.includes('null'))
    expect(setCalls).toHaveLength(3)
    // Each set is parameterized: vals[0] = priority, vals[1] = id
    expect(setCalls[0].vals).toEqual([1, 'id1'])
    expect(setCalls[1].vals).toEqual([2, 'id2'])
    expect(setCalls[2].vals).toEqual([3, 'id3'])
  })

  test('column-not-migrated error returns stub flag', async () => {
    const db = require('../../src/config/db')
    db.begin.mockImplementationOnce(async () => {
      throw new Error('column "tate_priority" does not exist')
    })
    const r = await curator.set({ ranked_ids: ['x'] })
    expect(r.ok).toBe(false)
    expect(r.stub).toBe(true)
  })
})

describe('selectTop3', () => {
  test('returns rows mapped to ids', async () => {
    mockSelectRows = [{ id: 'a' }, { id: 'b' }]
    const ids = await curator.selectTop3()
    expect(ids).toEqual(['a', 'b'])
  })

  test('returns [] on error', async () => {
    const db = require('../../src/config/db')
    db.mockImplementationOnce(async () => { throw new Error('schema gone') })
    const ids = await curator.selectTop3()
    expect(ids).toEqual([])
  })
})

describe('refresh', () => {
  test('composes selectTop3 + set', async () => {
    mockSelectRows = [{ id: 'r1' }, { id: 'r2' }]
    const r = await curator.refresh()
    expect(r.ok).toBe(true)
    expect(r.ranked).toEqual(['r1', 'r2'])
  })
})

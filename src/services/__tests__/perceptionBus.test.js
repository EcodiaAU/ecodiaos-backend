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
    return Promise.resolve(mockDbQueue.shift())
  }
  return dbTag
})

jest.mock('../knowledgeGraphService', () => ({
  writeEpisode: jest.fn().mockResolvedValue('neo4j-123'),
}))

const perceptionBus = require('../perceptionBus')

beforeEach(() => {
  mockDbCalls.length = 0
  mockDbQueue.length = 0
})

describe('perceptionBus.publish', () => {
  test('inserts observation into DB', async () => {
    mockDbQueue.push([{ id: 1 }])
    const event = await perceptionBus.publish({
      source: 'email', kind: 'email_arrival', data: { id: 42 }, confidence: 1.0,
    })
    expect(event.id).toBe(1)
    expect(mockDbCalls.length).toBeGreaterThanOrEqual(1)
    expect(mockDbCalls[0].sql).toContain('INSERT INTO os_observations')
  })

  test('returns event with source and kind even if DB fails', async () => {
    mockDbQueue.push(Promise.reject(new Error('db down')))
    const event = await perceptionBus.publish({
      source: 'test', kind: 'test_event',
    })
    expect(event.source).toBe('test')
    expect(event.kind).toBe('test_event')
  })

  test('notifies subscribers', async () => {
    mockDbQueue.push([{ id: 2 }])
    const received = []
    perceptionBus.subscribe(e => received.push(e))
    await perceptionBus.publish({ source: 'fork', kind: 'fork_complete', data: {} })
    expect(received.length).toBe(1)
    expect(received[0].source).toBe('fork')
  })
})

describe('perceptionBus.promotionScore', () => {
  test('client-related events score high', () => {
    const score = perceptionBus.promotionScore({ kind: 'crm_update', source: 'crm', data: { client_id: 'abc' } })
    expect(score).toBeGreaterThanOrEqual(0.4)
  })

  test('money-related events score moderate', () => {
    const score = perceptionBus.promotionScore({ kind: 'invoice_payment_match', source: 'bookkeeper', data: {} })
    expect(score).toBeGreaterThanOrEqual(0.3)
  })

  test('money + client events score high (promotable)', () => {
    const score = perceptionBus.promotionScore({ kind: 'invoice_payment_match', source: 'bookkeeper', data: { client_id: 'c1' } })
    expect(score).toBeGreaterThanOrEqual(0.6)
  })

  test('error events score high', () => {
    const score = perceptionBus.promotionScore({ kind: 'session_failure', source: 'factory', data: {} })
    expect(score).toBeGreaterThanOrEqual(0.4)
  })

  test('routine fork completion scores low', () => {
    const score = perceptionBus.promotionScore({ kind: 'fork_complete', source: 'fork', data: { status: 'done' } })
    expect(score).toBeLessThan(0.3)
  })
})

describe('perceptionBus.recentSummary', () => {
  test('returns null for empty window', async () => {
    mockDbQueue.push([])
    const result = await perceptionBus.recentSummary(60)
    expect(result).toBeNull()
  })

  test('returns summary string under 500 chars', async () => {
    mockDbQueue.push([
      { source: 'email', kind: 'email_arrival', data: { id: 1 }, confidence: 0.9, observed_at: new Date().toISOString() },
      { source: 'fork', kind: 'fork_complete', data: {}, confidence: 1.0, observed_at: new Date().toISOString() },
    ])
    const result = await perceptionBus.recentSummary(60)
    expect(typeof result).toBe('string')
    expect(result.length).toBeLessThanOrEqual(500)
    expect(result).toContain('email')
  })
})

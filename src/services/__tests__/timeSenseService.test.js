'use strict'

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

jest.mock('../../config/db', () => {
  const mockDbQueue = []
  function dbTag(strings, ...values) {
    if (mockDbQueue.length === 0) return Promise.resolve([])
    return Promise.resolve(mockDbQueue.shift())
  }
  dbTag._queue = mockDbQueue
  return dbTag
})

const timeSense = require('../timeSenseService')

describe('timeSenseService.urgencyScore', () => {
  test('returns 0 for null due_at', () => {
    expect(timeSense.urgencyScore(null)).toBe(0)
  })

  test('returns high urgency for overdue items', () => {
    const past = new Date(Date.now() - 3600000).toISOString()
    expect(timeSense.urgencyScore(past)).toBe(2.0)
  })

  test('returns ~1.0 for item due in 1 hour', () => {
    const oneHour = new Date(Date.now() + 3600000).toISOString()
    const score = timeSense.urgencyScore(oneHour)
    expect(score).toBeGreaterThan(0.5)
    expect(score).toBeLessThanOrEqual(1.0)
  })

  test('returns low urgency for item due in 48 hours', () => {
    const twoDays = new Date(Date.now() + 48 * 3600000).toISOString()
    const score = timeSense.urgencyScore(twoDays)
    expect(score).toBeLessThan(0.1)
  })
})

describe('timeSenseService.currentTempo', () => {
  test('returns a valid tempo value', () => {
    const tempo = timeSense.currentTempo()
    expect(['peak', 'standard', 'quiet', 'overnight']).toContain(tempo)
  })
})

describe('timeSenseService.calendarGate', () => {
  test('critical actions always proceed', async () => {
    const result = await timeSense.calendarGate({ urgency: 'critical' })
    expect(result.proceed).toBe(true)
  })

  test('returns proceed or defer_until (never crashes)', async () => {
    const result = await timeSense.calendarGate({ urgency: 'normal' })
    expect(typeof result.proceed).toBe('boolean')
    if (!result.proceed) {
      expect(result.defer_until).toBeDefined()
      expect(result.reason).toBeDefined()
    }
  })
})

describe('timeSenseService.tempoMultiplier', () => {
  test('returns a number between 0.25 and 1.0', () => {
    // Can't control time-of-day in test, but we can verify the return shape
    const mult = timeSense.tempoMultiplier()
    expect(mult).toBeGreaterThanOrEqual(0.25)
    expect(mult).toBeLessThanOrEqual(1.0)
  })
})

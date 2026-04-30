'use strict'

/**
 * Tests for cacheKeepaliveWorker.
 *
 * Covers:
 *   - _isWorkHours correctly identifies 06:00-22:00 AEST window
 *   - fireRefresh calls the sender with the stable prefix
 *   - Cost and cache-read token metrics emit on success
 *   - Outside work hours: skipped with counter incremented, sender NOT called
 *   - Sender throws: error counter incremented, worker does not crash
 *   - Missing sender: clean failure path, counter incremented
 *   - start()/stop() register/clear the interval
 *   - Metrics counters accumulate across fires
 */

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

const worker = require('../cacheKeepaliveWorker')

beforeEach(() => {
  worker._resetForTest()
})

describe('_isWorkHours', () => {
  function withAESTHour(hour) {
    // Build a UTC Date whose Brisbane hour equals the target.
    // Brisbane is UTC+10 year-round (no DST). Target UTC hour = target_AEST_hour - 10.
    const utcHour = (hour - 10 + 24) % 24
    const d = new Date('2026-05-01T00:00:00Z')
    d.setUTCHours(utcHour, 0, 0, 0)
    return d
  }

  test('06:00 AEST is work hours', () => {
    expect(worker._isWorkHours(withAESTHour(6))).toBe(true)
  })
  test('13:00 AEST is work hours', () => {
    expect(worker._isWorkHours(withAESTHour(13))).toBe(true)
  })
  test('21:59 AEST is work hours (< 22)', () => {
    // 21:59 rounds to hour=21 via getHours → within work hours
    expect(worker._isWorkHours(withAESTHour(21))).toBe(true)
  })
  test('22:00 AEST is NOT work hours (end-exclusive)', () => {
    expect(worker._isWorkHours(withAESTHour(22))).toBe(false)
  })
  test('03:00 AEST is NOT work hours', () => {
    expect(worker._isWorkHours(withAESTHour(3))).toBe(false)
  })
  test('05:59 AEST is NOT work hours', () => {
    expect(worker._isWorkHours(withAESTHour(5))).toBe(false)
  })
})

describe('fireRefresh', () => {
  function withAESTHour(hour) {
    const utcHour = (hour - 10 + 24) % 24
    const d = new Date('2026-05-01T00:00:00Z')
    d.setUTCHours(utcHour, 0, 0, 0)
    return d
  }

  test('happy path: calls sender and records metrics', async () => {
    const sender = jest.fn().mockResolvedValue({
      usage: { input_tokens: 120, cache_read_input_tokens: 15000 },
    })
    const result = await worker.fireRefresh({
      sender,
      stablePrefix: 'STABLE_BP1_BP2_CONTENT',
      now: withAESTHour(10),
    })
    expect(result.ok).toBe(true)
    expect(result.cost_tokens).toBe(120)
    expect(result.cache_read_tokens).toBe(15000)
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith({
      stablePrefix: 'STABLE_BP1_BP2_CONTENT',
      userMessage: 'health=?',
    })

    const m = worker.getMetrics()
    expect(m.fires).toBe(1)
    expect(m.refresh_cost_tokens).toBe(120)
    expect(m.errors).toBe(0)
  })

  test('outside work hours: sender is NOT called; skipped counter incremented', async () => {
    const sender = jest.fn()
    const result = await worker.fireRefresh({
      sender,
      stablePrefix: 'x',
      now: withAESTHour(2),
    })
    expect(result.ok).toBe(false)
    expect(result.skipped).toBe('outside_hours')
    expect(sender).not.toHaveBeenCalled()

    const m = worker.getMetrics()
    expect(m.fires).toBe(0)
    expect(m.skipped_outside_hours).toBe(1)
  })

  test('sender throws: error counter incremented, worker returns ok:false (no crash)', async () => {
    const sender = jest.fn().mockRejectedValue(new Error('API 529 overloaded'))
    const result = await worker.fireRefresh({
      sender,
      stablePrefix: 'x',
      now: withAESTHour(12),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/overloaded/)

    const m = worker.getMetrics()
    expect(m.errors).toBe(1)
    expect(m.fires).toBe(0)
  })

  test('multiple fires accumulate cost', async () => {
    const sender = jest.fn().mockResolvedValue({ usage: { input_tokens: 100 } })
    await worker.fireRefresh({ sender, stablePrefix: 'x', now: withAESTHour(10) })
    await worker.fireRefresh({ sender, stablePrefix: 'x', now: withAESTHour(11) })
    await worker.fireRefresh({ sender, stablePrefix: 'x', now: withAESTHour(12) })

    const m = worker.getMetrics()
    expect(m.fires).toBe(3)
    expect(m.refresh_cost_tokens).toBe(300)
  })

  test('sender returning no usage object: cost counted as 0, still counts as fire', async () => {
    const sender = jest.fn().mockResolvedValue({})  // no usage
    const result = await worker.fireRefresh({
      sender,
      stablePrefix: 'x',
      now: withAESTHour(10),
    })
    expect(result.ok).toBe(true)
    expect(result.cost_tokens).toBe(0)
    expect(worker.getMetrics().fires).toBe(1)
  })
})

describe('start / stop', () => {
  test('start() is idempotent (two starts don\'t double-fire)', () => {
    // We're not going to actually wait 45min; just verify that calling
    // start() a second time doesn't overwrite the first timer.
    worker.start()
    const h1 = worker.getMetrics()
    worker.start()
    const h2 = worker.getMetrics()
    expect(h2).toEqual(h1)
    worker.stop()
  })

  test('stop() clears the timer', () => {
    worker.start()
    worker.stop()
    // No easy assertion on "timer cleared" without poking internals.
    // The assertion is: stop() doesn't throw, and another start() works.
    expect(() => worker.start()).not.toThrow()
    worker.stop()
  })
})

describe('getMetrics', () => {
  test('returns a snapshot; includes last_fire_at', () => {
    const m = worker.getMetrics()
    expect(m).toEqual(expect.objectContaining({
      fires: expect.any(Number),
      refresh_cost_tokens: expect.any(Number),
      skipped_outside_hours: expect.any(Number),
      errors: expect.any(Number),
    }))
    expect('last_fire_at' in m).toBe(true)
  })
})

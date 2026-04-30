'use strict'

/**
 * Tests for src/services/outboundEmailDelayQueue.js (§3.4).
 *
 * DB mocked as a tagged-template that returns canned responses per-call.
 * Tests cover known-recipient detection, enqueue shape, decide transitions,
 * and the routeOutbound policy split.
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockResults = []
const mockCalls = []
jest.mock('../../config/db', () => {
  return function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    mockCalls.push({ sql, values })
    if (mockResults.length === 0) return Promise.resolve([])
    const next = mockResults.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
})

const queue = require('../outboundEmailDelayQueue')

beforeEach(() => {
  mockResults.length = 0
  mockCalls.length = 0
})

describe('outboundEmailDelayQueue.isKnownRecipient', () => {
  test('true when email_threads has a hit', async () => {
    mockResults.push([{ '?column?': 1 }])
    const r = await queue.isKnownRecipient('client@ecodia.au')
    expect(r).toBe(true)
  })

  test('false when no match anywhere', async () => {
    mockResults.push([]) // email_threads with participants
    mockResults.push([]) // crm_activities
    const r = await queue.isKnownRecipient('unknown@example.com')
    expect(r).toBe(false)
  })

  test('fallback to no-participants query on err, true if that matches', async () => {
    mockResults.push(new Error('column participants does not exist'))
    mockResults.push([{ '?column?': 1 }]) // fallback query hit
    const r = await queue.isKnownRecipient('client@ecodia.au')
    expect(r).toBe(true)
  })

  test('invalid input returns false', async () => {
    expect(await queue.isKnownRecipient(null)).toBe(false)
    expect(await queue.isKnownRecipient('')).toBe(false)
    expect(await queue.isKnownRecipient(42)).toBe(false)
  })

  test('case-insensitive lookup', async () => {
    mockResults.push([{ '?column?': 1 }])
    const r = await queue.isKnownRecipient('Client@Ecodia.AU')
    expect(r).toBe(true)
    // The query should lowercase on the input side - assert the value
    // bound was lowercased.
    const firstCall = mockCalls[0]
    expect(firstCall.values).toContain('client@ecodia.au')
  })
})

describe('outboundEmailDelayQueue.enqueue', () => {
  test('inserts with correct shape', async () => {
    const row = {
      id: 1,
      to_address: 'unknown@example.com',
      release_at: new Date(Date.now() + 86_400_000),
      status: 'pending',
    }
    mockResults.push([row])
    const result = await queue.enqueue({
      from: 'tom@ecodia.au',
      to: 'unknown@example.com',
      subject: 'intro',
      body: 'hi',
      sessionId: 's1',
    })
    expect(result).toEqual(row)
    expect(mockCalls[0].sql).toMatch(/INSERT INTO outbound_email_delay_queue/)
  })

  test('uses custom delayMs when provided', async () => {
    mockResults.push([{ id: 1, release_at: new Date(), status: 'pending' }])
    const before = Date.now()
    await queue.enqueue({
      to: 'x@y.com',
      subject: 's',
      body: 'b',
      delayMs: 60_000,
    })
    // The release_at we passed in should be ~60s in the future.
    const inserted = mockCalls[0].values
    const releaseAt = inserted.find((v) => v instanceof Date)
    expect(releaseAt.getTime() - before).toBeLessThanOrEqual(60_000 + 1000)
    expect(releaseAt.getTime() - before).toBeGreaterThanOrEqual(60_000 - 1000)
  })

  test('requires to + subject', async () => {
    await expect(queue.enqueue({ to: '', subject: 'x', body: 'y' })).rejects.toThrow(/to \+ subject/)
    await expect(queue.enqueue({ to: 'a@b.com', subject: '', body: 'y' })).rejects.toThrow(/to \+ subject/)
  })

  test('attaches commitment risk/categories', async () => {
    mockResults.push([{ id: 1, commitment_risk: 'high', commitment_categories: ['price_or_dollar_figure'] }])
    await queue.enqueue({
      to: 'x@y.com',
      subject: 'Invoice',
      body: '$500',
      commitment: { risk: 'high', categories: ['price_or_dollar_figure'] },
    })
    const inserted = mockCalls[0].values
    expect(inserted).toContain('high')
  })
})

describe('outboundEmailDelayQueue.decide', () => {
  test('approve transitions pending → approved', async () => {
    mockResults.push([{ id: 1, status: 'approved', tate_decision: 'approve' }])
    const r = await queue.decide({ id: 1, decision: 'approve' })
    expect(r.status).toBe('approved')
    expect(mockCalls[0].sql).toMatch(/UPDATE outbound_email_delay_queue/)
    expect(mockCalls[0].values).toContain('approved')
    expect(mockCalls[0].values).toContain('approve')
  })

  test('discard transitions pending → discarded', async () => {
    mockResults.push([{ id: 1, status: 'discarded', tate_decision: 'discard' }])
    const r = await queue.decide({ id: 1, decision: 'discard' })
    expect(r.status).toBe('discarded')
  })

  test('invalid decision throws', async () => {
    await expect(queue.decide({ id: 1, decision: 'yeet' })).rejects.toThrow(/approve.*discard/)
  })

  test('missing row throws', async () => {
    mockResults.push([]) // UPDATE returns no rows
    await expect(queue.decide({ id: 99, decision: 'approve' })).rejects.toThrow(/not pending/)
  })
})

describe('outboundEmailDelayQueue.routeOutbound', () => {
  test('known recipient: action=send, no queue row', async () => {
    mockResults.push([{ '?column?': 1 }]) // known recipient
    const r = await queue.routeOutbound({
      to: 'client@ecodia.au',
      subject: 's',
      body: 'b',
    })
    expect(r.action).toBe('send')
    expect(r.row).toBeNull()
  })

  test('unknown recipient: action=queued, row returned', async () => {
    mockResults.push([]) // email_threads
    mockResults.push([]) // crm_activities
    mockResults.push([{ id: 7, status: 'pending' }]) // enqueue
    const r = await queue.routeOutbound({
      to: 'unknown@example.com',
      subject: 's',
      body: 'b',
    })
    expect(r.action).toBe('queued')
    expect(r.row.id).toBe(7)
  })

  test('requires to', async () => {
    await expect(queue.routeOutbound({ to: '', subject: 's', body: 'b' })).rejects.toThrow(/to/)
  })
})

describe('outboundEmailDelayQueue.listReadyToSend', () => {
  test('returns approved rows whose release_at has passed', async () => {
    mockResults.push([{ id: 1, status: 'approved' }, { id: 2, status: 'approved' }])
    const r = await queue.listReadyToSend()
    expect(r.length).toBe(2)
    expect(mockCalls[0].sql).toMatch(/status = 'approved'/)
    expect(mockCalls[0].sql).toMatch(/release_at <= NOW/)
  })
})

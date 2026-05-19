'use strict'

/**
 * liveActivityPush unit tests - exercises update() against mocked kv +
 * apnsClient. Verifies the no-active-activity branch, the done -> clear
 * branch, and the expireStale 4h cutoff.
 */

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

let mockKvRows = []
let mockKvWrites = []

jest.mock('../../src/config/db', () => {
  const fn = jest.fn(async (strings, ...vals) => {
    const sql = Array.from(strings).join(' ').toLowerCase()
    if (sql.includes('select') && sql.includes('kv_store')) {
      return mockKvRows
    }
    if (sql.includes('insert into kv_store')) {
      mockKvWrites.push({ sql, vals })
      return []
    }
    return []
  })
  return fn
})

jest.mock('../../src/services/apnsClient', () => ({
  push: jest.fn(),
  buildActivityPayload: jest.fn(({ event, contentState }) => ({ aps: { event, 'content-state': contentState } })),
}))

const apns = require('../../src/services/apnsClient')
const la = require('../../src/services/liveActivityPush')

beforeEach(() => {
  mockKvRows = []
  mockKvWrites = []
  jest.clearAllMocks()
})

describe('update', () => {
  test('no active LA -> returns no_active_activity', async () => {
    mockKvRows = []
    const r = await la.update({ state: 'thinking' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_active_activity')
    expect(apns.push).not.toHaveBeenCalled()
  })

  test('null kv value -> no_active_activity', async () => {
    mockKvRows = [{ value: null }]
    const r = await la.update({ state: 'thinking' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_active_activity')
  })

  test('active LA + apns 200 -> ok, event=update for non-done state', async () => {
    mockKvRows = [{ value: { token: 'TOK', started_at: new Date().toISOString() } }]
    apns.push.mockResolvedValue({ status: 200 })
    const r = await la.update({ state: 'thinking', body: 'thinking' })
    expect(r.ok).toBe(true)
    expect(r.event).toBe('update')
    expect(apns.push).toHaveBeenCalled()
    const pushArg = apns.push.mock.calls[0][0]
    expect(pushArg.pushType).toBe('liveactivity')
    expect(pushArg.priority).toBe(10)
  })

  test('state=done -> event=end, clears kv', async () => {
    mockKvRows = [{ value: { token: 'TOK', started_at: new Date().toISOString() } }]
    apns.push.mockResolvedValue({ status: 200 })
    const r = await la.update({ state: 'done', body: 'done' })
    expect(r.event).toBe('end')
    expect(r.ok).toBe(true)
    // _clearLaState writes 'null'::jsonb
    const writes = mockKvWrites.filter(w => w.sql.includes('insert into kv_store'))
    expect(writes.length).toBeGreaterThan(0)
  })

  test('apns non-200 propagates ok=false', async () => {
    mockKvRows = [{ value: { token: 'TOK', started_at: new Date().toISOString() } }]
    apns.push.mockResolvedValue({ status: 0, error: 'apns_not_provisioned' })
    const r = await la.update({ state: 'progress' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('apns_not_provisioned')
  })
})

describe('expireStale', () => {
  test('no active LA -> no-op expired=0', async () => {
    mockKvRows = []
    const r = await la.expireStale()
    expect(r.ok).toBe(true)
    expect(r.expired).toBe(0)
  })

  test('fresh LA (<4h) -> no-op expired=0', async () => {
    mockKvRows = [{ value: { token: 'TOK', started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() } }]
    const r = await la.expireStale()
    expect(r.expired).toBe(0)
    expect(apns.push).not.toHaveBeenCalled()
  })

  test('stale LA (>4h) -> pushes end + clears + expired=1', async () => {
    mockKvRows = [{ value: { token: 'TOK', started_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() } }]
    apns.push.mockResolvedValue({ status: 200 })
    const r = await la.expireStale()
    expect(r.expired).toBe(1)
    expect(apns.push).toHaveBeenCalled()
  })
})

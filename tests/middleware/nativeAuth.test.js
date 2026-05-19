'use strict'

/**
 * nativeAuth middleware unit tests - exercise the bearer gate against a
 * fake db that returns the cred from kv_store.
 */

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

let mockKvRows = []

jest.mock('../../src/config/db', () => {
  const tag = jest.fn(async () => mockKvRows)
  return tag
})

const { nativeAuth, _resetCache } = require('../../src/middleware/nativeAuth')

function mockRes() {
  const res = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

beforeEach(() => {
  mockKvRows = []
  delete process.env.TEST_NATIVE_BEARER
  _resetCache()
  jest.clearAllMocks()
})

describe('nativeAuth', () => {
  test('missing Authorization -> 401 missing_bearer', async () => {
    mockKvRows = [{ value: 'expected-bearer' }]
    const req = { headers: {} }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'missing_bearer' })
    expect(next).not.toHaveBeenCalled()
  })

  test('non-Bearer scheme -> 401 missing_bearer', async () => {
    mockKvRows = [{ value: 'expected-bearer' }]
    const req = { headers: { authorization: 'Basic abc' } }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'missing_bearer' })
  })

  test('correct bearer -> next()', async () => {
    mockKvRows = [{ value: 'expected-bearer' }]
    const req = { headers: { authorization: 'Bearer expected-bearer' } }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  test('wrong bearer -> 401 invalid_bearer', async () => {
    mockKvRows = [{ value: 'expected-bearer' }]
    const req = { headers: { authorization: 'Bearer wrong-bearer' } }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_bearer' })
  })

  test('TEST_NATIVE_BEARER env override bypasses kv lookup', async () => {
    process.env.TEST_NATIVE_BEARER = 'env-bearer'
    mockKvRows = [] // db empty -> would otherwise 500
    const req = { headers: { authorization: 'Bearer env-bearer' } }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  test('handles object-shaped jsonb {bearer: ...}', async () => {
    mockKvRows = [{ value: { bearer: 'obj-bearer' } }]
    const req = { headers: { authorization: 'Bearer obj-bearer' } }
    const res = mockRes()
    const next = jest.fn()
    await nativeAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

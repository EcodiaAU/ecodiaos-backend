'use strict'

/**
 * Tests for pushApnsService - JWT signing + payload shape + HTTP/2 send.
 *
 * Authored 2026-05-07 by fork_mov3s5fq_a7009b. We never use the real
 * .p8 file in tests; a fixture P-256 EC key is generated at test setup.
 *
 * Coverage:
 *   1. _buildPayload: shorthand → aps shape, full passthrough, defaults.
 *   2. _signJwt: produces ES256 JWT with correct header (kid, alg, typ)
 *      and claims (iss, iat).
 *   3. pushApns: success path returns ok=true with status_code + apns_id.
 *   4. pushApns: error path returns ok=false with parsed reason.
 *   5. pushApns: invalid device_token short-circuits before any send.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
const jwt = require('jsonwebtoken')

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// In-memory db mock; per-test override via __setRows.
const _dbState = { rows: [] }
jest.mock('../../config/db', () => {
  const fn = function () {
    return Promise.resolve(_dbState.rows)
  }
  fn.__setRows = (r) => { _dbState.rows = r }
  return fn
})

const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apns-test-'))
const FIXTURE_P8 = path.join(TMPDIR, 'AuthKey_TESTKEYID.p8')

// Generate a P-256 EC key in PKCS#8 PEM format using openssl. We avoid
// hard-coding a known private key in source even for tests.
beforeAll(() => {
  execSync(`openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out ${FIXTURE_P8} 2>/dev/null`, { stdio: 'ignore' })
  if (!fs.existsSync(FIXTURE_P8)) {
    throw new Error('failed to generate fixture P-256 key for APNs JWT tests')
  }
})

afterAll(() => {
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  jest.resetModules()
  // Reset db rows. Each test sets what it needs.
  const db = require('../../config/db')
  db.__setRows([{
    value: JSON.stringify({
      team_id: 'TESTTEAM01',
      apns_auth_key: {
        key_id: 'TESTKEYID',
        team_id: 'TESTTEAM01',
        p8_path_vps: FIXTURE_P8,
      },
    }),
  }])
})

describe('pushApnsService._buildPayload', () => {
  test('shorthand → aps shape with title/body/sound/badge', () => {
    const svc = require('../pushApnsService')
    const out = svc._buildPayload({ title: 'Hello', body: 'World' })
    expect(out.aps.alert.title).toBe('Hello')
    expect(out.aps.alert.body).toBe('World')
    expect(out.aps.sound).toBe('default')
    expect(out.aps.badge).toBe(1)
  })

  test('full payload passes through unchanged', () => {
    const svc = require('../pushApnsService')
    const full = { aps: { alert: { title: 'X' }, 'content-available': 1 }, deep: { link: 'eos://x' } }
    const out = svc._buildPayload(full)
    expect(out).toBe(full)
  })

  test('shorthand carries data fields alongside aps', () => {
    const svc = require('../pushApnsService')
    const out = svc._buildPayload({ title: 'T', body: 'B', data: { route: 'inbox', id: 42 } })
    expect(out.aps.alert.title).toBe('T')
    expect(out.route).toBe('inbox')
    expect(out.id).toBe(42)
  })

  test('explicit badge:0 is honoured', () => {
    const svc = require('../pushApnsService')
    const out = svc._buildPayload({ title: 'T', body: 'B', badge: 0 })
    expect(out.aps.badge).toBe(0)
  })
})

describe('pushApnsService._signJwt', () => {
  test('signs ES256 JWT with correct header.kid + claims.iss', () => {
    const svc = require('../pushApnsService')
    const token = svc._signJwt({
      key_id: 'TESTKEYID',
      team_id: 'TESTTEAM01',
      p8_path: FIXTURE_P8,
    })
    expect(typeof token).toBe('string')
    const decoded = jwt.decode(token, { complete: true })
    expect(decoded.header.alg).toBe('ES256')
    expect(decoded.header.kid).toBe('TESTKEYID')
    expect(decoded.header.typ).toBe('JWT')
    expect(decoded.payload.iss).toBe('TESTTEAM01')
    expect(typeof decoded.payload.iat).toBe('number')
    // iat within last 5s
    const now = Math.floor(Date.now() / 1000)
    expect(now - decoded.payload.iat).toBeLessThan(5)
  })

  test('signed JWT verifies against the EC public key', () => {
    const svc = require('../pushApnsService')
    const token = svc._signJwt({
      key_id: 'TESTKEYID',
      team_id: 'TESTTEAM01',
      p8_path: FIXTURE_P8,
    })
    // Derive public key from the same .p8.
    const pubKey = execSync(`openssl pkey -in ${FIXTURE_P8} -pubout 2>/dev/null`).toString()
    const verified = jwt.verify(token, pubKey, { algorithms: ['ES256'] })
    expect(verified.iss).toBe('TESTTEAM01')
  })
})

describe('pushApnsService.pushApns - HTTP/2 mocked', () => {
  function mockH2(scenario) {
    // Build a fake http2.connect that returns a client/request pair
    // emitting the events callers depend on.
    return function fakeConnect() {
      const listeners = { error: [] }
      const client = {
        on: (ev, cb) => { (listeners[ev] = listeners[ev] || []).push(cb) },
        close: jest.fn(),
        request: jest.fn(() => {
          const reqListeners = {}
          const req = {
            on: (ev, cb) => { (reqListeners[ev] = reqListeners[ev] || []).push(cb) },
            write: jest.fn(),
            end: () => {
              setImmediate(() => {
                if (scenario.responseHeaders) {
                  (reqListeners.response || []).forEach((cb) => cb(scenario.responseHeaders))
                }
                if (scenario.responseBody) {
                  (reqListeners.data || []).forEach((cb) => cb(Buffer.from(scenario.responseBody)))
                }
                ;(reqListeners.end || []).forEach((cb) => cb())
              })
            },
            close: jest.fn(),
            setTimeout: jest.fn(),
          }
          return req
        }),
      }
      return client
    }
  }

  test('success path returns ok=true, status 200, apns_id', async () => {
    const svc = require('../pushApnsService')
    svc._resetCachesForTest()
    const result = await svc.pushApns({
      device_token: 'a'.repeat(64),
      payload: { title: 'T', body: 'B' },
      _h2override: mockH2({
        responseHeaders: { ':status': '200', 'apns-id': 'apns-id-abc-123' },
        responseBody: '',
      }),
    })
    expect(result.ok).toBe(true)
    expect(result.status_code).toBe(200)
    expect(result.apns_id).toBe('apns-id-abc-123')
  })

  test('error path returns ok=false with parsed reason', async () => {
    const svc = require('../pushApnsService')
    svc._resetCachesForTest()
    const result = await svc.pushApns({
      device_token: 'b'.repeat(64),
      payload: { title: 'T', body: 'B' },
      _h2override: mockH2({
        responseHeaders: { ':status': '400', 'apns-id': 'apns-id-err-1' },
        responseBody: JSON.stringify({ reason: 'BadDeviceToken' }),
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.status_code).toBe(400)
    expect(result.error).toBe('BadDeviceToken')
  })

  test('invalid device_token short-circuits', async () => {
    const svc = require('../pushApnsService')
    svc._resetCachesForTest()
    const r = await svc.pushApns({ device_token: '', payload: { title: 'X', body: 'X' } })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_device_token')
  })

  test('cred missing → returns ok=false with informative error', async () => {
    const db = require('../../config/db')
    db.__setRows([])
    const svc = require('../pushApnsService')
    svc._resetCachesForTest()
    const r = await svc.pushApns({ device_token: 'c'.repeat(64), payload: { title: 'T', body: 'B' } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/apns_cred_missing/)
  })
})

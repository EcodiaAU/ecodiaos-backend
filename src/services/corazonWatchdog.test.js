'use strict'

/**
 * Tests for corazonWatchdog.js
 *
 * All network, DB, and SMS calls are mocked so the suite runs without
 * live infrastructure. Tests verify:
 *   1. After 3 consecutive ping failures, SMS is sent exactly once.
 *      Subsequent failures within the cooldown window do not re-SMS.
 *   2. A successful ping resets the consecutive failure counter.
 *   3. checkQueueBackup returns the count from the SQL result.
 *   4. Anti-spam: same alert kind within 1 hour does not double-fire.
 *   5. Refresh failure alerts include the account name parsed from the key.
 */

// ─── env setup (before any require) ─────────────────────────────────────────
// Set DATABASE_URL so _getDb() does not throw.
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/testdb'

// ─── module mocks ─────────────────────────────────────────────────────────────

// Mock the smsTransport module before requiring the watchdog.
jest.mock('./transports/smsTransport', () => ({
  sendSmsToTate: jest.fn().mockResolvedValue({ ok: true, sid: 'SMtest' }),
}))

// Mock 'postgres' so _getDb() never opens a real connection.
// The factory returns a tagged-template-literal sql function that is also a jest.fn().
jest.mock('postgres', () => {
  // Each time the postgres() constructor is called, return the same mockSql so
  // tests can configure return values on it directly.
  const mockSql = Object.assign(
    jest.fn().mockResolvedValue([]),
    {
      end: jest.fn().mockResolvedValue(undefined),
    },
  )
  const postgresMock = jest.fn(() => mockSql)
  postgresMock.__mockSql = mockSql
  return postgresMock
})

// ─── imports (after mocks) ───────────────────────────────────────────────────

const smsTransport = require('./transports/smsTransport')
// Get a reference to the mockSql so tests can configure it.
const postgres = require('postgres')
const getMockSql = () => postgres.__mockSql

const watchdog = require('./corazonWatchdog')

// ─── helpers ─────────────────────────────────────────────────────────────────

function resetAll() {
  watchdog._resetState()
  smsTransport.sendSmsToTate.mockClear()
  getMockSql().mockReset()
  getMockSql().mockResolvedValue([])
}

// ─── test: pingLaptopAgent ────────────────────────────────────────────────────

describe('pingLaptopAgent', () => {
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
  })

  afterEach(() => {
    if (httpRequestSpy) httpRequestSpy.mockRestore()
  })

  function makeHttpMock(statusCode) {
    return jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const fakeRes = {
        statusCode,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'end') setImmediate(handler)
          return fakeRes
        }),
      }
      const fakeSock = {
        on: jest.fn().mockReturnThis(),
        end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  }

  function makeHttpErrorMock() {
    return jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const errorListeners = {}
      const fakeSock = {
        on: jest.fn().mockImplementation((event, handler) => {
          errorListeners[event] = handler
          return fakeSock
        }),
        end: jest.fn().mockImplementation(() => {
          setImmediate(() => errorListeners.error && errorListeners.error(new Error('ECONNREFUSED')))
        }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  }

  test('returns true when agent responds 200', async () => {
    httpRequestSpy = makeHttpMock(200)
    const result = await watchdog.pingLaptopAgent()
    expect(result).toBe(true)
  })

  test('returns false when agent responds 503', async () => {
    httpRequestSpy = makeHttpMock(503)
    const result = await watchdog.pingLaptopAgent()
    expect(result).toBe(false)
  })

  test('returns false on network error', async () => {
    httpRequestSpy = makeHttpErrorMock()
    const result = await watchdog.pingLaptopAgent()
    expect(result).toBe(false)
  })
})

// ─── test: checkQueueBackup ───────────────────────────────────────────────────

describe('checkQueueBackup', () => {
  beforeEach(() => {
    resetAll()
  })

  test('returns the integer count from the SQL result', async () => {
    getMockSql().mockResolvedValueOnce([{ n: 25 }])
    const count = await watchdog.checkQueueBackup()
    expect(count).toBe(25)
  })

  test('returns 0 when no overdue tasks', async () => {
    getMockSql().mockResolvedValueOnce([{ n: 0 }])
    const count = await watchdog.checkQueueBackup()
    expect(count).toBe(0)
  })
})

// ─── test: checkOrphaned ─────────────────────────────────────────────────────

describe('checkOrphaned', () => {
  beforeEach(() => {
    resetAll()
  })

  test('returns the integer count from the SQL result', async () => {
    getMockSql().mockResolvedValueOnce([{ n: 7 }])
    const count = await watchdog.checkOrphaned()
    expect(count).toBe(7)
  })
})

// ─── test: checkRefreshFailures ───────────────────────────────────────────────

describe('checkRefreshFailures', () => {
  beforeEach(() => {
    resetAll()
  })

  test('returns rows from kv_store', async () => {
    const fakeRows = [
      { key: 'creds.refresh_failure.google_tate', value: '{"error":"token_expired"}' },
    ]
    getMockSql().mockResolvedValueOnce(fakeRows)
    const rows = await watchdog.checkRefreshFailures()
    expect(rows).toEqual(fakeRows)
  })
})

// ─── test 1: 3 consecutive failures trigger SMS exactly once ─────────────────

describe('agent health: 3 consecutive failures -> SMS exactly once', () => {
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
    // DB calls return safe defaults (0 / []).
    getMockSql().mockResolvedValue([{ n: 0 }])
    // All http requests fail by default.
    httpRequestSpy = jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const errorListeners = {}
      const fakeSock = {
        on: jest.fn().mockImplementation((event, handler) => {
          errorListeners[event] = handler
          return fakeSock
        }),
        end: jest.fn().mockImplementation(() => {
          setImmediate(() => errorListeners.error && errorListeners.error(new Error('ECONNREFUSED')))
        }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  })

  afterEach(() => {
    httpRequestSpy.mockRestore()
  })

  test('no SMS after 1 failure', async () => {
    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
    expect(watchdog._getConsecutiveFailures()).toBe(1)
  })

  test('no SMS after 2 failures', async () => {
    await watchdog.pass()
    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
    expect(watchdog._getConsecutiveFailures()).toBe(2)
  })

  test('SMS fires on 3rd failure', async () => {
    await watchdog.pass()
    await watchdog.pass()
    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    expect(smsTransport.sendSmsToTate.mock.calls[0][0].body).toContain('laptop-agent unreachable')
  })

  test('4th failure within cooldown does not re-SMS', async () => {
    await watchdog.pass()
    await watchdog.pass()
    await watchdog.pass()
    smsTransport.sendSmsToTate.mockClear()
    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })

  test('5th failure: still only 1 SMS total', async () => {
    for (let i = 0; i < 5; i++) await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
  })
})

// ─── test 2: successful ping resets counter ───────────────────────────────────

describe('agent health: successful ping resets counter', () => {
  let callCount
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
    callCount = 0
    getMockSql().mockResolvedValue([{ n: 0 }])
  })

  afterEach(() => {
    if (httpRequestSpy) httpRequestSpy.mockRestore()
  })

  function buildHttpMock(outcomes) {
    // outcomes: array of 'ok' | 'fail'
    return jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const outcome = outcomes[callCount++] || 'fail'
      if (outcome === 'ok') {
        const fakeRes = {
          statusCode: 200,
          on: jest.fn().mockImplementation((event, handler) => {
            if (event === 'end') setImmediate(handler)
            return fakeRes
          }),
        }
        const fakeSock = {
          on: jest.fn().mockReturnThis(),
          end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
          destroy: jest.fn(),
        }
        return fakeSock
      }
      // fail
      const errorListeners = {}
      const fakeSock = {
        on: jest.fn().mockImplementation((event, handler) => {
          errorListeners[event] = handler
          return fakeSock
        }),
        end: jest.fn().mockImplementation(() => {
          setImmediate(() => errorListeners.error && errorListeners.error(new Error('ECONNREFUSED')))
        }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  }

  test('counter resets to 0 on successful ping after 2 failures', async () => {
    httpRequestSpy = buildHttpMock(['fail', 'fail', 'ok'])
    await watchdog.pass()
    await watchdog.pass()
    expect(watchdog._getConsecutiveFailures()).toBe(2)
    await watchdog.pass()
    expect(watchdog._getConsecutiveFailures()).toBe(0)
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })

  test('counter resets; fresh 3 failures after recovery still within cooldown - no second SMS', async () => {
    // 3 fails -> SMS, then 1 ok, then 3 more fails; cooldown blocks second SMS.
    httpRequestSpy = buildHttpMock(['fail', 'fail', 'fail', 'ok', 'fail', 'fail', 'fail'])

    await watchdog.pass(); await watchdog.pass(); await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)

    await watchdog.pass() // recovery
    smsTransport.sendSmsToTate.mockClear()

    await watchdog.pass(); await watchdog.pass(); await watchdog.pass()
    // Cooldown still active.
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })
})

// ─── test 4: anti-spam cooldown (isAlertCooled / markAlerted) ────────────────

describe('anti-spam: isAlertCooled + markAlerted', () => {
  beforeEach(() => {
    resetAll()
  })

  test('isAlertCooled returns false for unseen key', () => {
    expect(watchdog.isAlertCooled('some:key')).toBe(false)
  })

  test('isAlertCooled returns true immediately after markAlerted', () => {
    watchdog.markAlerted('some:key')
    expect(watchdog.isAlertCooled('some:key')).toBe(true)
  })

  test('isAlertCooled returns false once ttl expires', () => {
    watchdog.markAlerted('some:key', 1)
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(watchdog.isAlertCooled('some:key')).toBe(false)
        resolve()
      }, 10)
    })
  })

  test('queue backup: same alert does not double-fire within cooldown', async () => {
    let httpRequestSpy
    // All http pings succeed (no agent alert).
    httpRequestSpy = jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const fakeRes = {
        statusCode: 200,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'end') setImmediate(handler)
          return fakeRes
        }),
      }
      const fakeSock = {
        on: jest.fn().mockReturnThis(),
        end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
        destroy: jest.fn(),
      }
      return fakeSock
    })

    // Queue backup > 20.
    getMockSql()
      .mockResolvedValueOnce([{ n: 25 }]) // checkQueueBackup first pass
      .mockResolvedValueOnce([{ n: 0 }])  // checkOrphaned first pass
      .mockResolvedValueOnce([])           // checkRefreshFailures first pass
      .mockResolvedValueOnce([{ n: 25 }]) // checkQueueBackup second pass
      .mockResolvedValueOnce([{ n: 0 }])  // checkOrphaned second pass
      .mockResolvedValueOnce([])           // checkRefreshFailures second pass

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    smsTransport.sendSmsToTate.mockClear()

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()

    httpRequestSpy.mockRestore()
  })
})

// ─── test 5: refresh failure alerts include account name ─────────────────────

describe('checkRefreshFailures: account name parsed from key', () => {
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
    // All http pings succeed.
    httpRequestSpy = jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const fakeRes = {
        statusCode: 200,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'end') setImmediate(handler)
          return fakeRes
        }),
      }
      const fakeSock = {
        on: jest.fn().mockReturnThis(),
        end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  })

  afterEach(() => {
    httpRequestSpy.mockRestore()
  })

  test('SMS body contains account name from key suffix (JSON value)', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])   // checkQueueBackup
      .mockResolvedValueOnce([{ n: 0 }])   // checkOrphaned
      .mockResolvedValueOnce([             // checkRefreshFailures
        { key: 'creds.refresh_failure.google_tate', value: JSON.stringify({ error: 'token_expired' }) },
      ])

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    const body = smsTransport.sendSmsToTate.mock.calls[0][0].body
    expect(body).toContain('google_tate')
    expect(body).toContain('token_expired')
  })

  test('SMS body contains account name even when value is a plain string', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([
        { key: 'creds.refresh_failure.xero_main', value: 'oauth error' },
      ])

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    const body = smsTransport.sendSmsToTate.mock.calls[0][0].body
    expect(body).toContain('xero_main')
    expect(body).toContain('oauth error')
  })

  test('multiple failing accounts each send their own SMS', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([
        { key: 'creds.refresh_failure.account_a', value: JSON.stringify({ error: 'err_a' }) },
        { key: 'creds.refresh_failure.account_b', value: JSON.stringify({ error: 'err_b' }) },
      ])

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(2)
    const bodies = smsTransport.sendSmsToTate.mock.calls.map((c) => c[0].body)
    expect(bodies.some((b) => b.includes('account_a'))).toBe(true)
    expect(bodies.some((b) => b.includes('account_b'))).toBe(true)
  })

  test('same account does not re-SMS within cooldown', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([
        { key: 'creds.refresh_failure.google_tate', value: JSON.stringify({ error: 'token_expired' }) },
      ])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([
        { key: 'creds.refresh_failure.google_tate', value: JSON.stringify({ error: 'token_expired' }) },
      ])

    await watchdog.pass()
    smsTransport.sendSmsToTate.mockClear()
    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })
})

// ─── test 6: orphaned tasks ───────────────────────────────────────────────────

describe('orphaned tasks alert', () => {
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
    httpRequestSpy = jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const fakeRes = {
        statusCode: 200,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'end') setImmediate(handler)
          return fakeRes
        }),
      }
      const fakeSock = {
        on: jest.fn().mockReturnThis(),
        end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  })

  afterEach(() => {
    httpRequestSpy.mockRestore()
  })

  test('SMS fires when orphaned count > 0', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])   // checkQueueBackup
      .mockResolvedValueOnce([{ n: 3 }])   // checkOrphaned
      .mockResolvedValueOnce([])            // checkRefreshFailures

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    expect(smsTransport.sendSmsToTate.mock.calls[0][0].body).toContain('3 orphaned tasks')
  })

  test('no SMS when orphaned count is 0', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([])

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })
})

// ─── test: queue backup SMS content ──────────────────────────────────────────

describe('queue backup SMS content', () => {
  let httpRequestSpy

  beforeEach(() => {
    resetAll()
    httpRequestSpy = jest.spyOn(require('http'), 'request').mockImplementation((opts, callback) => {
      const fakeRes = {
        statusCode: 200,
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'end') setImmediate(handler)
          return fakeRes
        }),
      }
      const fakeSock = {
        on: jest.fn().mockReturnThis(),
        end: jest.fn().mockImplementation(() => { setImmediate(() => callback(fakeRes)) }),
        destroy: jest.fn(),
      }
      return fakeSock
    })
  })

  afterEach(() => {
    httpRequestSpy.mockRestore()
  })

  test('SMS fires when queue backup count > 20', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 21 }])  // checkQueueBackup
      .mockResolvedValueOnce([{ n: 0 }])   // checkOrphaned
      .mockResolvedValueOnce([])            // checkRefreshFailures

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).toHaveBeenCalledTimes(1)
    expect(smsTransport.sendSmsToTate.mock.calls[0][0].body).toContain('21 scheduled tasks overdue')
  })

  test('no SMS when queue backup count <= 20', async () => {
    getMockSql()
      .mockResolvedValueOnce([{ n: 20 }])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([])

    await watchdog.pass()
    expect(smsTransport.sendSmsToTate).not.toHaveBeenCalled()
  })
})

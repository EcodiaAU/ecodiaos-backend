'use strict'

/**
 * Tests for src/services/tier3GateService.js - §3.2 token gate runtime.
 *
 * DB is mocked as a tagged-template proxy that records calls and returns
 * canned rows keyed by the query's first ~60 chars. That lets us assert
 * issue / consume / OTP flows without a live Postgres.
 *
 * Covers:
 *   - hashTarget: deterministic, HMAC-ed, changes when target changes
 *   - canonicalTarget: key-order independent
 *   - Auto-authorized issuance via matcher ($eq, $in, $lte, $gte)
 *   - OTP pending issuance when no matcher hits
 *   - completeOtpChallenge: atomic consume, single-use
 *   - verifyAndConsume: success path, fail on bad token, fail on bad bind,
 *     fail on expiry, fail closed on DB error
 *   - Token hash != raw token (DB never stores plaintext)
 */

process.env.TIER3_TOKEN_HMAC_KEY = 'x'.repeat(64)

// Mock logger so we don't boot winston env.
jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// Mock db as a tagged-template recorder.
const mockDbQueue = []
const mockDbCalls = []
jest.mock('../../config/db', () => {
  function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    mockDbCalls.push({ sql, values })
    if (mockDbQueue.length === 0) {
      return Promise.resolve([])
    }
    return Promise.resolve(mockDbQueue.shift())
  }
  return dbTag
})

const tier3 = require('../tier3GateService')

beforeEach(() => {
  mockDbQueue.length = 0
  mockDbCalls.length = 0
})

describe('tier3GateService.hashTarget', () => {
  test('returns 64-char hex (sha256)', () => {
    const h = tier3.hashTarget({ to: 'x@y.com' })
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  test('deterministic for same input', () => {
    const a = tier3.hashTarget({ to: 'x@y.com', subject: 'hi' })
    const b = tier3.hashTarget({ to: 'x@y.com', subject: 'hi' })
    expect(a).toBe(b)
  })

  test('changes when input changes', () => {
    const a = tier3.hashTarget({ to: 'x@y.com' })
    const b = tier3.hashTarget({ to: 'z@y.com' })
    expect(a).not.toBe(b)
  })

  test('key order independence', () => {
    const a = tier3.hashTarget({ to: 'x@y.com', subject: 'hi' })
    const b = tier3.hashTarget({ subject: 'hi', to: 'x@y.com' })
    expect(a).toBe(b)
  })

  test('empty target is hashable', () => {
    expect(tier3.hashTarget({})).toMatch(/^[a-f0-9]{64}$/)
    expect(tier3.hashTarget(null)).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('tier3GateService._matcherAccepts', () => {
  const m = tier3._internal._matcherAccepts

  test('equality match', () => {
    expect(m({ action: 'send' }, { action: 'send' })).toBe(true)
    expect(m({ action: 'send' }, { action: 'archive' })).toBe(false)
  })

  test('$in match', () => {
    const matcher = { to_domain: { $in: ['ecodia.au', 'ecodia.com.au'] } }
    expect(m(matcher, { to_domain: 'ecodia.au' })).toBe(true)
    expect(m(matcher, { to_domain: 'evil.example' })).toBe(false)
  })

  test('$lte match', () => {
    const matcher = { body_length: { $lte: 500 } }
    expect(m(matcher, { body_length: 200 })).toBe(true)
    expect(m(matcher, { body_length: 500 })).toBe(true)
    expect(m(matcher, { body_length: 501 })).toBe(false)
  })

  test('all fields must match', () => {
    const matcher = { action: 'send', to_domain: 'ecodia.au' }
    expect(m(matcher, { action: 'send', to_domain: 'ecodia.au' })).toBe(true)
    expect(m(matcher, { action: 'send', to_domain: 'evil.example' })).toBe(false)
    expect(m(matcher, { action: 'archive', to_domain: 'ecodia.au' })).toBe(false)
  })

  test('missing target field fails', () => {
    expect(m({ required: 'x' }, {})).toBe(false)
  })
})

describe('tier3GateService.issueToken', () => {
  test('auto-authorized: returns issued status and a token', async () => {
    // First query is the pattern lookup - return a matching pattern.
    mockDbQueue.push([{
      pattern_name: 'known_client_reply',
      matcher_json: { action: 'send', to_domain: 'ecodia.au' },
    }])
    // Second query is the token insert - returns nothing (no RETURNING here).
    mockDbQueue.push([])

    const result = await tier3.issueToken({
      action_type: 'gmail_send',
      target: { action: 'send', to_domain: 'ecodia.au' },
      session_id: 's1',
    })

    expect(result.status).toBe('issued')
    expect(typeof result.token).toBe('string')
    expect(result.token.length).toBeGreaterThan(32)
    expect(result.pattern_name).toBe('known_client_reply')
    expect(mockDbCalls.length).toBe(2)
    expect(mockDbCalls[0].sql).toMatch(/authorized_action_patterns/)
    expect(mockDbCalls[1].sql).toMatch(/tier3_action_tokens/)
  })

  test('no matcher hit: returns pending_otp with a 6-digit code', async () => {
    mockDbQueue.push([]) // no patterns
    mockDbQueue.push([{ id: 42, expires_at: new Date(Date.now() + 600_000) }])

    const result = await tier3.issueToken({
      action_type: 'gmail_send',
      target: { to_domain: 'unknown.example' },
      session_id: 's2',
    })

    expect(result.status).toBe('pending_otp')
    expect(result.otp_id).toBe(42)
    expect(result.otp_code).toMatch(/^\d{6}$/)
    expect(result.target_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('throws if action_type missing', async () => {
    await expect(
      tier3.issueToken({ target: {}, session_id: 's1' }),
    ).rejects.toThrow(/action_type/)
  })

  test('throws if session_id missing', async () => {
    await expect(
      tier3.issueToken({ action_type: 'gmail_send', target: {} }),
    ).rejects.toThrow(/session_id/)
  })

  test('clamps ttl_ms to 1 hour max', async () => {
    mockDbQueue.push([{ pattern_name: 'p', matcher_json: {} }])
    mockDbQueue.push([])
    const before = Date.now()
    const result = await tier3.issueToken({
      action_type: 'gmail_send',
      target: {},
      session_id: 's1',
      ttl_ms: 24 * 60 * 60 * 1000, // 24h - should clamp
    })
    const expiresAt = new Date(result.expires_at).getTime()
    expect(expiresAt - before).toBeLessThanOrEqual(60 * 60 * 1000 + 1000) // 1h + fudge
  })
})

describe('tier3GateService.completeOtpChallenge', () => {
  test('happy path: consumes OTP atomically and issues token', async () => {
    mockDbQueue.push([{ // UPDATE ... RETURNING
      id: 42,
      action_type: 'gmail_send',
      target_hash: 'abc',
      session_id: 's1',
    }])
    mockDbQueue.push([]) // token insert

    const result = await tier3.completeOtpChallenge({ otp_code: '123456' })
    expect(result.status).toBe('issued')
    expect(result.token.length).toBeGreaterThan(32)
    expect(mockDbCalls[0].sql).toMatch(/tier3_otp_pending/)
    expect(mockDbCalls[0].sql).toMatch(/UPDATE/)
    expect(mockDbCalls[0].sql).toMatch(/consumed_at IS NULL/)
  })

  test('missing otp: returns null', async () => {
    const r = await tier3.completeOtpChallenge({ otp_code: null })
    expect(r).toBeNull()
  })

  test('no pending row (expired or already consumed): returns null', async () => {
    mockDbQueue.push([]) // UPDATE returns 0 rows
    const r = await tier3.completeOtpChallenge({ otp_code: '000000' })
    expect(r).toBeNull()
  })
})

describe('tier3GateService.verifyAndConsume', () => {
  test('happy path: returns true on valid token', async () => {
    mockDbQueue.push([{ id: 99 }])
    const ok = await tier3.verifyAndConsume({
      token: 'raw-token-string',
      action_type: 'gmail_send',
      target: { to: 'x@y.com' },
      session_id: 's1',
    })
    expect(ok).toBe(true)
    expect(mockDbCalls[0].sql).toMatch(/UPDATE/)
    expect(mockDbCalls[0].sql).toMatch(/tier3_action_tokens/)
    expect(mockDbCalls[0].sql).toMatch(/consumed_at IS NULL/)
    expect(mockDbCalls[0].sql).toMatch(/expires_at > now/)
  })

  test('no matching token: returns false', async () => {
    mockDbQueue.push([])
    const ok = await tier3.verifyAndConsume({
      token: 'bad',
      action_type: 'gmail_send',
      target: {},
      session_id: 's1',
    })
    expect(ok).toBe(false)
  })

  test('missing token: returns false', async () => {
    const ok = await tier3.verifyAndConsume({
      action_type: 'gmail_send',
      target: {},
      session_id: 's1',
    })
    expect(ok).toBe(false)
    expect(mockDbCalls.length).toBe(0)
  })

  test('missing action_type: returns false', async () => {
    const ok = await tier3.verifyAndConsume({
      token: 'x',
      target: {},
      session_id: 's1',
    })
    expect(ok).toBe(false)
  })

  test('missing session_id: returns false', async () => {
    const ok = await tier3.verifyAndConsume({
      token: 'x',
      action_type: 'gmail_send',
      target: {},
    })
    expect(ok).toBe(false)
  })

  test('DB throws: returns false (fail closed)', async () => {
    // Isolated module graph for this case so we can swap db for a
    // throwing one without polluting the suite's shared mock.
    let ok
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../config/db', () => () => Promise.reject(new Error('DB down')))
      jest.doMock('../../config/logger', () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
      }))
      const tier3Fresh = require('../tier3GateService')
      ok = await tier3Fresh.verifyAndConsume({
        token: 'x',
        action_type: 'gmail_send',
        target: {},
        session_id: 's1',
      })
    })
    expect(ok).toBe(false)
  })

  test('bind mismatch fails: different session_id same token = false', async () => {
    // The DB query itself enforces the bind match (WHERE session_id = ...),
    // so a mismatch returns 0 rows, which we simulate with an empty result.
    mockDbQueue.push([])
    const ok = await tier3.verifyAndConsume({
      token: 'x',
      action_type: 'gmail_send',
      target: {},
      session_id: 's-different',
    })
    expect(ok).toBe(false)
  })
})

describe('tier3GateService - token storage safety (§3.2 single-use)', () => {
  test('token is never stored plaintext in DB', async () => {
    mockDbQueue.push([{ pattern_name: 'p', matcher_json: {} }])
    mockDbQueue.push([])
    const result = await tier3.issueToken({
      action_type: 'gmail_send',
      target: {},
      session_id: 's1',
    })
    // The INSERT call is the second DB call. Its values must NOT include
    // the raw token - only token_hash.
    const insert = mockDbCalls[1]
    const serializedValues = insert.values.map((v) => String(v)).join('|')
    expect(serializedValues).not.toContain(result.token)
    // But the SHA256 of the token should be present.
    const crypto = require('crypto')
    const expectedHash = crypto.createHash('sha256').update(result.token).digest('hex')
    expect(serializedValues).toContain(expectedHash)
  })
})

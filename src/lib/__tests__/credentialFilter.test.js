'use strict'

/**
 * Tests for src/lib/credentialFilter.js (§5.1 pre-emit filter).
 *
 * Covers each pattern class, redaction output shape, counter behaviour,
 * redactDeep on structured payloads, and containsCredential. No DB, no
 * network.
 */

const filter = require('../credentialFilter')

beforeEach(() => {
  filter.resetCounters()
})

describe('credentialFilter.redact - per-pattern coverage', () => {
  test.each([
    ['aws access key', 'user=AKIAIOSFODNN7EXAMPLE done', 'AKIAIOSFODNN7EXAMPLE', 'aws_access_key'],
    ['anthropic key', 'key=sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01', 'sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01', 'anthropic_api_key'],
    ['openai key', 'OPENAI=sk-xyzABCdefGHIjklMNOpqrSTUvwXYZ0123', 'sk-xyzABCdefGHIjklMNOpqrSTUvwXYZ0123', 'openai_or_generic_sk_key'],
    ['github pat', 'token=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789AB', 'github_pat'],
    ['google api key', 'auth=AIzaSyA-abcdefghijklmnopqrstuvwxyz0123456', 'AIzaSyA-abcdefghijklmnopqrstuvwxyz0123456', 'google_api_key'],
    ['supabase', 'key=sbp_0123456789abcdef0123456789abcdef01234567', 'sbp_0123456789abcdef0123456789abcdef01234567', 'supabase_service_key'],
  ])('redacts %s', (_label, input, secret, type) => {
    const out = filter.redact(input, 'test')
    expect(out).not.toContain(secret)
    expect(out).toContain(`[REDACTED:${type}]`)
  })

  test('redacts JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefg_hijklmn'
    const out = filter.redact(`Authorization: Bearer ${jwt}`, 'test')
    expect(out).not.toContain(jwt)
    expect(out).toContain('[REDACTED:jwt]')
  })

  test('redacts slack token', () => {
    const tok = 'xoxb-12345-67890-abcdefghijkl'
    const out = filter.redact(`slack=${tok}`, 'test')
    expect(out).toContain('[REDACTED:slack_token]')
  })

  test('redacts PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBA...\n-----END RSA PRIVATE KEY-----'
    const out = filter.redact(`config=${pem}`, 'test')
    expect(out).toContain('[REDACTED:pem_private_key]')
    expect(out).not.toContain('MIIEpAIBA')
  })

  test('anthropic key takes precedence over generic sk- pattern', () => {
    const input = 'key=sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01'
    const out = filter.redact(input, 'test')
    expect(out).toContain('[REDACTED:anthropic_api_key]')
    expect(out).not.toContain('[REDACTED:openai_or_generic_sk_key]')
  })
})

describe('credentialFilter.redact - input shape handling', () => {
  test('null returns empty string', () => {
    expect(filter.redact(null)).toBe('')
  })

  test('undefined returns empty string', () => {
    expect(filter.redact(undefined)).toBe('')
  })

  test('number coerces to string and passes through', () => {
    expect(filter.redact(42)).toBe('42')
  })

  test('object coerces to string', () => {
    // Object#toString default is "[object Object]" which has no credentials.
    expect(filter.redact({ a: 1 })).toBe('[object Object]')
  })

  test('clean text passes through unchanged', () => {
    const clean = 'The quick brown fox jumps over the lazy dog.'
    expect(filter.redact(clean)).toBe(clean)
  })
})

describe('credentialFilter.redact - counters', () => {
  test('counter increments per redaction with source tag', () => {
    filter.redact('AKIAIOSFODNN7EXAMPLE and AKIAIOSFODNN7EXAMPL2', 'log.turn')
    const c = filter.getCounters()
    expect(c['aws_access_key|log.turn']).toBe(2)
  })

  test('counter tracks per-source', () => {
    filter.redact('AKIAIOSFODNN7EXAMPLE', 'log.turn')
    filter.redact('AKIAIOSFODNN7EXAMPLE', 'wsManager')
    const c = filter.getCounters()
    expect(c['aws_access_key|log.turn']).toBe(1)
    expect(c['aws_access_key|wsManager']).toBe(1)
  })

  test('resetCounters clears all', () => {
    filter.redact('AKIAIOSFODNN7EXAMPLE', 'log.turn')
    expect(Object.keys(filter.getCounters()).length).toBe(1)
    filter.resetCounters()
    expect(Object.keys(filter.getCounters()).length).toBe(0)
  })

  test('default source tag is "unknown"', () => {
    filter.redact('AKIAIOSFODNN7EXAMPLE')
    const c = filter.getCounters()
    expect(c['aws_access_key|unknown']).toBe(1)
  })
})

describe('credentialFilter.redactDeep', () => {
  test('redacts string leaves in nested object', () => {
    const payload = {
      user: 'tate',
      secret_path: {
        key: 'sk-xyzABCdefGHIjklMNOpqrSTUvwXYZ0123',
        note: 'clean text',
      },
      arr: ['AKIAIOSFODNN7EXAMPLE', 'clean'],
    }
    const out = filter.redactDeep(payload, 'test')
    expect(out.user).toBe('tate')
    expect(out.secret_path.key).toContain('[REDACTED:openai_or_generic_sk_key]')
    expect(out.secret_path.note).toBe('clean text')
    expect(out.arr[0]).toContain('[REDACTED:aws_access_key]')
    expect(out.arr[1]).toBe('clean')
  })

  test('non-string leaves pass through unchanged', () => {
    const payload = { n: 42, b: true, x: null }
    const out = filter.redactDeep(payload, 'test')
    expect(out).toEqual(payload)
  })

  test('null / undefined pass through', () => {
    expect(filter.redactDeep(null)).toBeNull()
    expect(filter.redactDeep(undefined)).toBeUndefined()
  })

  test('array of strings redacts each', () => {
    const out = filter.redactDeep(['AKIAIOSFODNN7EXAMPLE', 'clean', 'sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01'], 'test')
    expect(out[0]).toContain('[REDACTED:aws_access_key]')
    expect(out[1]).toBe('clean')
    expect(out[2]).toContain('[REDACTED:anthropic_api_key]')
  })
})

describe('credentialFilter.containsCredential', () => {
  test('true for credential-bearing text', () => {
    expect(filter.containsCredential('auth=AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })

  test('false for clean text', () => {
    expect(filter.containsCredential('The quick brown fox')).toBe(false)
  })

  test('false for null / undefined', () => {
    expect(filter.containsCredential(null)).toBe(false)
    expect(filter.containsCredential(undefined)).toBe(false)
  })

  test('does not bump counters (non-mutating check)', () => {
    filter.resetCounters()
    filter.containsCredential('AKIAIOSFODNN7EXAMPLE')
    expect(Object.keys(filter.getCounters()).length).toBe(0)
  })
})

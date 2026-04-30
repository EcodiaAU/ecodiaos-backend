'use strict'

/**
 * Tests for §7.1 securityAuditLog.
 *
 * DB mocked as a tagged-template. HMAC key set via env for determinism.
 *
 * Covers:
 *   - fingerprintAction: deterministic, key-sensitive
 *   - hashContent: sha256 hex
 *   - append: allowlist enforcement, HMAC attached, fields passed through
 *   - verifyRow: valid row verifies, tampered row fails, missing sig fails
 *   - append throws when DB returns nothing
 */

process.env.AUDIT_LOG_HMAC_KEY = 'x'.repeat(64)

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockResults = []
const mockCalls = []
jest.mock('../../config/db', () => {
  return function dbTag(strings, ...values) {
    mockCalls.push({ sql: strings.join('?'), values })
    if (mockResults.length === 0) return Promise.resolve([])
    const next = mockResults.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
})

const audit = require('../securityAuditLog')

beforeEach(() => {
  mockResults.length = 0
  mockCalls.length = 0
})

describe('securityAuditLog.fingerprintAction / hashContent', () => {
  test('fingerprintAction deterministic', () => {
    const a = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    const b = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  test('fingerprint changes with payload', () => {
    const a = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    const b = audit.fingerprintAction('gmail_send_external', { to: 'z@y.com' })
    expect(a).not.toBe(b)
  })

  test('fingerprint changes with action_type', () => {
    const a = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    const b = audit.fingerprintAction('git_push', { to: 'x@y.com' })
    expect(a).not.toBe(b)
  })

  test('fingerprint key-order independent', () => {
    const a = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com', subject: 'hi' })
    const b = audit.fingerprintAction('gmail_send_external', { subject: 'hi', to: 'x@y.com' })
    expect(a).toBe(b)
  })

  test('hashContent is sha256 hex', () => {
    const h = audit.hashContent('hello world')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('securityAuditLog.append', () => {
  test('allowlist enforced', async () => {
    await expect(audit.append({
      action_type: 'make_coffee',
      target: {},
    })).rejects.toThrow(/allowlist/)
  })

  test('happy path inserts and returns row', async () => {
    const mockRow = {
      id: 1,
      action_type: 'gmail_send_external',
      hmac_signature: 'abc',
    }
    mockResults.push([mockRow])
    const row = await audit.append({
      action_type: 'gmail_send_external',
      target: { to: 'x@y.com', subject: 'hi' },
      session_id: 's1',
      trigger_source: 'tate',
      content: 'hello',
    })
    expect(row.id).toBe(1)
    expect(mockCalls[0].sql).toMatch(/INSERT INTO security_audit_log/)
    // HMAC signature must be present in values.
    const sigValue = mockCalls[0].values.find((v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))
    expect(sigValue).toBeDefined()
  })

  test('throws when DB returns no row', async () => {
    mockResults.push([])
    await expect(audit.append({
      action_type: 'gmail_send_external',
      target: {},
    })).rejects.toThrow(/no row/)
  })

  test('missing content is tolerated (hash null)', async () => {
    mockResults.push([{ id: 2 }])
    await audit.append({
      action_type: 'git_push',
      target: { sha: 'abc123' },
    })
    // content_hash position in values must be null (not undefined).
    const values = mockCalls[0].values
    expect(values).toContain(null)
  })
})

describe('securityAuditLog.verifyRow', () => {
  test('valid row re-verifies true', async () => {
    // Use append to construct a row the same way prod does, then
    // extract values for verifyRow.
    const captured = { row: null }
    mockResults.push([]) // insert returns empty → append throws
    // Instead of going through insert, build the signed fields manually:
    const now = new Date()
    const fingerprint = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    const contentHash = audit.hashContent('hello')
    // Recompute HMAC the same way the module would.
    const crypto = require('crypto')
    const hmac = crypto.createHmac('sha256', 'x'.repeat(64))
    const canonical = [
      `action_fingerprint=${fingerprint}`,
      'action_type=gmail_send_external',
      `content_hash=${contentHash}`,
      'gate_token_id=',
      'session_id=s1',
      `timestamp_utc=${now.toISOString()}`,
      'trigger_source=tate',
    ].join('&')
    hmac.update(canonical)
    const sig = hmac.digest('hex')

    const row = {
      action_type: 'gmail_send_external',
      action_fingerprint: fingerprint,
      session_id: 's1',
      trigger_source: 'tate',
      gate_token_id: null,
      content_hash: contentHash,
      hmac_signature: sig,
      timestamp_utc: now.toISOString(),
    }
    expect(audit.verifyRow(row)).toBe(true)
  })

  test('tampered row fails', async () => {
    const now = new Date()
    const fingerprint = audit.fingerprintAction('gmail_send_external', { to: 'x@y.com' })
    const crypto = require('crypto')
    const hmac = crypto.createHmac('sha256', 'x'.repeat(64))
    const canonical = [
      `action_fingerprint=${fingerprint}`,
      'action_type=gmail_send_external',
      'content_hash=',
      'gate_token_id=',
      'session_id=s1',
      `timestamp_utc=${now.toISOString()}`,
      'trigger_source=tate',
    ].join('&')
    hmac.update(canonical)
    const sig = hmac.digest('hex')

    const row = {
      action_type: 'gmail_send_external',
      action_fingerprint: fingerprint,
      session_id: 's-DIFFERENT', // tampered
      trigger_source: 'tate',
      gate_token_id: null,
      content_hash: null,
      hmac_signature: sig,
      timestamp_utc: now.toISOString(),
    }
    expect(audit.verifyRow(row)).toBe(false)
  })

  test('missing signature fails', () => {
    expect(audit.verifyRow({})).toBe(false)
    expect(audit.verifyRow({ hmac_signature: null })).toBe(false)
  })

  test('malformed signature fails (timing-safe compare)', () => {
    expect(audit.verifyRow({
      action_type: 'x',
      action_fingerprint: 'f',
      session_id: null,
      trigger_source: null,
      gate_token_id: null,
      content_hash: null,
      hmac_signature: 'not-hex',
      timestamp_utc: new Date().toISOString(),
    })).toBe(false)
  })
})

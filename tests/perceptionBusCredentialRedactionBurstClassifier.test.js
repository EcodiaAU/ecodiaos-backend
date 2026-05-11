'use strict'

/**
 * perceptionBusCredentialRedactionBurstClassifier.test.js
 *
 * 12 May 2026 - fork_mp1ko80h_9537fa
 *
 * Guards the short-circuit patch on perceptionDispatcher.js
 * `security_incident` matcher. Per securityIncidentResponse.js
 * §OBSERVATION_ONLY, credential_redaction_burst events are the redaction
 * system working correctly (credentials intercepted before reaching Tate).
 * They must NOT auto-create P1 status_board rows. They publish a P3
 * telemetry event (`credential_redaction_burst_observed`) and return.
 *
 * Mirrors the shape of perceptionBusCreditExhaustionClassifier.test.js
 * (8 May 2026, fork_moxvsqee_e29694).
 *
 * Guards:
 *   (a) credential_redaction_burst kind -> NO P1 INSERT, P3 publish fired
 *   (b) other security incident kinds (e.g. self_mod_denylist_write) -> P1 INSERT proceeds
 *   (c) CREDENTIAL_REDACTION_OBSERVATION_KINDS constant includes 'credential_redaction_burst'
 *   (d) publish failure does not cause fall-through to P1 insert
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// Mock db: tagged-template fn that returns the next queued result.
const _dbCalls = []
const _dbQueue = []
jest.mock('../src/config/db', () => {
  function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    _dbCalls.push({ sql, values })
    if (_dbQueue.length === 0) return Promise.resolve([])
    const next = _dbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

// Mock perceptionBus.publish as a jest.fn() so tests can observe calls and
// override behaviour via mockRejectedValueOnce without factory scope issues.
jest.mock('../src/services/perceptionBus', () => ({
  publish: jest.fn(),
  subscribe: jest.fn(),
}))

const dispatcher = require('../src/services/perceptionDispatcher')
const perceptionBus = require('../src/services/perceptionBus')

const securityMatcher = dispatcher.MATCHERS.find(m => m.domain === 'security_incident')

beforeEach(() => {
  _dbCalls.length = 0
  _dbQueue.length = 0
  perceptionBus.publish.mockReset()
  // Default: publish resolves successfully and records the call
  perceptionBus.publish.mockImplementation(async (event) => event)
})

describe('CREDENTIAL_REDACTION_OBSERVATION_KINDS', () => {
  test('(c) constant includes credential_redaction_burst', () => {
    expect(dispatcher.CREDENTIAL_REDACTION_OBSERVATION_KINDS).toContain('credential_redaction_burst')
  })

  test('(c) constant is frozen (immutable)', () => {
    expect(Object.isFrozen(dispatcher.CREDENTIAL_REDACTION_OBSERVATION_KINDS)).toBe(true)
  })
})

describe('security_incident dispatch credential_redaction_burst classifier', () => {
  test('(a) credential_redaction_burst kind -> NO P1 INSERT, P3 publish fired', async () => {
    const event = {
      source: 'security_incident',
      kind: 'credential_redaction_burst',
      data: {
        trigger_source: 'credentialRedactionMonitor',
        session_id: null,
        details: { count: 3 },
        incident_id: 42,
      },
      confidence: 1.0,
    }

    await securityMatcher.dispatch(event)

    // No DB calls: no status_board SELECT or INSERT
    expect(_dbCalls.length).toBe(0)
    const allSql = _dbCalls.map(c => c.sql).join(' | ')
    expect(allSql).not.toMatch(/SELECT id FROM status_board/i)
    expect(allSql).not.toMatch(/INSERT INTO status_board/i)

    // P3 telemetry event published
    expect(perceptionBus.publish).toHaveBeenCalledTimes(1)
    const published = perceptionBus.publish.mock.calls[0][0]
    expect(published.kind).toBe('credential_redaction_burst_observed')
    expect(published.source).toBe('perception_dispatcher')
    expect(published.confidence).toBe(0.4)
    expect(published.data.original_kind).toBe('credential_redaction_burst')
    expect(published.data.incident_id).toBe(42)
    expect(published.data.trigger_source).toBe('credentialRedactionMonitor')
  })

  test('(a) case-insensitive: CREDENTIAL_REDACTION_BURST also short-circuits', async () => {
    const event = {
      source: 'security_incident',
      kind: 'CREDENTIAL_REDACTION_BURST',
      data: {},
      confidence: 1.0,
    }

    await securityMatcher.dispatch(event)

    expect(_dbCalls.length).toBe(0)
    expect(perceptionBus.publish).toHaveBeenCalledTimes(1)
    expect(perceptionBus.publish.mock.calls[0][0].kind).toBe('credential_redaction_burst_observed')
  })

  test('(b) other security incident kinds -> P1 INSERT proceeds as before', async () => {
    _dbQueue.push([])  // SELECT id FROM status_board -> no existing row
    _dbQueue.push([])  // INSERT INTO status_board

    const event = {
      source: 'security_incident',
      kind: 'self_mod_denylist_write',
      data: { trigger_source: 'factory', session_id: 'cc_abc' },
      confidence: 1.0,
    }

    await securityMatcher.dispatch(event)

    expect(_dbCalls.length).toBe(2)
    expect(_dbCalls[0].sql).toContain('SELECT id FROM status_board')
    expect(_dbCalls[1].sql).toContain('INSERT INTO status_board')
    expect(_dbCalls[1].sql).toContain('infrastructure')

    // No credential_redaction_burst_observed publish
    const crCalls = perceptionBus.publish.mock.calls.filter(
      ([e]) => e.kind === 'credential_redaction_burst_observed',
    )
    expect(crCalls.length).toBe(0)
  })

  test('(b) cypher_label_rejected also creates P1 (preserves existing behavior)', async () => {
    _dbQueue.push([])  // SELECT -> empty
    _dbQueue.push([])  // INSERT

    const event = {
      source: 'security_incident',
      kind: 'cypher_label_rejected',
      data: {},
      confidence: 1.0,
    }

    await securityMatcher.dispatch(event)

    expect(_dbCalls.length).toBe(2)
    expect(_dbCalls[1].sql).toContain('INSERT INTO status_board')
    const crCalls = perceptionBus.publish.mock.calls.filter(
      ([e]) => e.kind === 'credential_redaction_burst_observed',
    )
    expect(crCalls.length).toBe(0)
  })

  test('(d) publish failure does not fall through to P1 insert - returns cleanly', async () => {
    perceptionBus.publish.mockRejectedValueOnce(new Error('bus down'))

    const event = {
      source: 'security_incident',
      kind: 'credential_redaction_burst',
      data: {},
      confidence: 1.0,
    }

    // Must not throw
    await expect(securityMatcher.dispatch(event)).resolves.toBeUndefined()

    // No DB calls despite publish failure
    expect(_dbCalls.length).toBe(0)
    const allSql = _dbCalls.map(c => c.sql).join(' | ')
    expect(allSql).not.toMatch(/INSERT INTO status_board/i)
  })
})

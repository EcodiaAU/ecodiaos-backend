'use strict'

/**
 * Tests for §7.2 securityIncidentResponse.
 *
 * DB mocked; injected services replaced with spies. Covers:
 *   - fireIncident logs row, calls all four response steps in parallel
 *   - Individual service exceptions do not interrupt other steps
 *   - Unknown incident_class throws
 *   - isEmergencyMode reads kv_store (JSON and bare-bool)
 *   - shouldFireCredentialBurst: no-fire during bootstrap, fire after
 */

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

const ir = require('../securityIncidentResponse')

beforeEach(() => {
  mockResults.length = 0
  mockCalls.length = 0
})

describe('securityIncidentResponse.fireIncident', () => {
  test('valid class: logs row + calls all four steps', async () => {
    mockResults.push([{ id: 42, incident_class: 'self_mod_denylist_write' }])

    const setEmergencyMode = jest.fn().mockResolvedValue()
    const pauseCrons = jest.fn().mockResolvedValue()
    const haltForks = jest.fn().mockResolvedValue()
    const smsTate = jest.fn().mockResolvedValue()
    ir.wireServices({ setEmergencyMode, pauseCrons, haltForks, smsTate })

    const row = await ir.fireIncident({
      incident_class: 'self_mod_denylist_write',
      trigger_source: 'factory',
      session_id: 's1',
      details: { path: 'src/services/gmailService.js' },
    })
    expect(row.id).toBe(42)
    expect(setEmergencyMode).toHaveBeenCalledWith(true, 'self_mod_denylist_write')
    expect(pauseCrons).toHaveBeenCalled()
    expect(haltForks).toHaveBeenCalledWith(expect.stringMatching(/security_incident/))
    expect(smsTate).toHaveBeenCalled()
  })

  test('unknown incident_class throws', async () => {
    await expect(ir.fireIncident({ incident_class: 'made_up' })).rejects.toThrow(/unknown incident_class/)
  })

  test('service exception does not stop other services', async () => {
    mockResults.push([{ id: 1 }])
    const setEmergencyMode = jest.fn().mockRejectedValue(new Error('kv_store down'))
    const pauseCrons = jest.fn().mockResolvedValue()
    const haltForks = jest.fn().mockResolvedValue()
    const smsTate = jest.fn().mockResolvedValue()
    ir.wireServices({ setEmergencyMode, pauseCrons, haltForks, smsTate })

    await ir.fireIncident({ incident_class: 'credential_redaction_burst' })
    expect(setEmergencyMode).toHaveBeenCalled()
    expect(pauseCrons).toHaveBeenCalled()
    expect(haltForks).toHaveBeenCalled()
    expect(smsTate).toHaveBeenCalled()
  })

  test('DB failure does not crash response', async () => {
    mockResults.push(new Error('DB down'))
    const smsTate = jest.fn().mockResolvedValue()
    ir.wireServices({ setEmergencyMode: null, pauseCrons: null, haltForks: null, smsTate })
    const row = await ir.fireIncident({ incident_class: 'credential_redaction_burst' })
    expect(row).toBeNull()
    expect(smsTate).toHaveBeenCalled()
  })
})

describe('securityIncidentResponse.isEmergencyMode', () => {
  test('kv absent → false', async () => {
    mockResults.push([])
    expect(await ir.isEmergencyMode()).toBe(false)
  })

  test('kv true (JSON) → true', async () => {
    mockResults.push([{ value: 'true' }])
    expect(await ir.isEmergencyMode()).toBe(true)
  })

  test('kv {active:true} → true', async () => {
    mockResults.push([{ value: JSON.stringify({ active: true }) }])
    expect(await ir.isEmergencyMode()).toBe(true)
  })

  test('kv {active:false} → false', async () => {
    mockResults.push([{ value: JSON.stringify({ active: false }) }])
    expect(await ir.isEmergencyMode()).toBe(false)
  })

  test('DB error → false (non-blocking)', async () => {
    mockResults.push(new Error('DB down'))
    expect(await ir.isEmergencyMode()).toBe(false)
  })
})

describe('securityIncidentResponse.shouldFireCredentialBurst', () => {
  test('bootstrap not done → no fire', () => {
    expect(ir.shouldFireCredentialBurst({
      redactions_since_bootstrap: 5,
      bootstrap_done: false,
    })).toBe(false)
  })

  test('bootstrap done + zero redactions → no fire', () => {
    expect(ir.shouldFireCredentialBurst({
      redactions_since_bootstrap: 0,
      bootstrap_done: true,
    })).toBe(false)
  })

  test('bootstrap done + any redaction → fire', () => {
    expect(ir.shouldFireCredentialBurst({
      redactions_since_bootstrap: 1,
      bootstrap_done: true,
    })).toBe(true)
  })
})

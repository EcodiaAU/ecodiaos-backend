'use strict'

/**
 * Integration test: securityIncidentResponse.fireIncident() with the
 * four-service container wired (mirrors the server.js boot wiring).
 *
 * Confirms that one fire() reaches all four actuators: setEmergencyMode,
 * pauseCrons, haltForks, smsTate. Each is stubbed; the test asserts the
 * stub was called exactly once per fire. Also covers the fail-open
 * contract: one actuator throwing must not prevent the others running.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

// DB mock — the module's _logIncident() INSERTs and RETURNING *; we
// just need to return a row so fire() can move on.
jest.mock('../../config/db', () => {
  return (strings, ...values) => Promise.resolve([{ id: 42 }])
})

const incident = require('../securityIncidentResponse')

describe('securityIncidentResponse wireServices() + fireIncident()', () => {
  beforeEach(() => {
    incident.wireServices({
      setEmergencyMode: null,
      pauseCrons: null,
      haltForks: null,
      smsTate: null,
    })
  })

  test('fireIncident runs all four wired services exactly once', async () => {
    const setEmergencyMode = jest.fn(async () => {})
    const pauseCrons = jest.fn(() => {})
    const haltForks = jest.fn(async () => {})
    const smsTate = jest.fn(async () => true)

    incident.wireServices({ setEmergencyMode, pauseCrons, haltForks, smsTate })

    const row = await incident.fireIncident({
      incident_class: 'credential_redaction_burst',
      trigger_source: 'test',
      session_id: 'sess-1',
      details: { delta: 1 },
    })

    expect(row).toEqual(expect.objectContaining({ id: 42 }))
    expect(setEmergencyMode).toHaveBeenCalledTimes(1)
    expect(setEmergencyMode).toHaveBeenCalledWith(true, 'credential_redaction_burst')
    expect(pauseCrons).toHaveBeenCalledTimes(1)
    expect(haltForks).toHaveBeenCalledTimes(1)
    expect(haltForks).toHaveBeenCalledWith(expect.stringContaining('credential_redaction_burst'))
    expect(smsTate).toHaveBeenCalledTimes(1)
    const smsArg = smsTate.mock.calls[0][0]
    expect(smsArg).toMatch(/\[SECURITY\]/)
    expect(smsArg.length).toBeLessThanOrEqual(160)
  })

  test('one service throwing does not prevent the others from running', async () => {
    const setEmergencyMode = jest.fn(async () => { throw new Error('kv_store down') })
    const pauseCrons = jest.fn(() => {})
    const haltForks = jest.fn(async () => {})
    const smsTate = jest.fn(async () => true)

    incident.wireServices({ setEmergencyMode, pauseCrons, haltForks, smsTate })

    await incident.fireIncident({
      incident_class: 'doctrine_write_burst',
      trigger_source: 'test',
      session_id: 'sess-2',
      details: {},
    })

    // All four were attempted despite the first throwing.
    expect(setEmergencyMode).toHaveBeenCalledTimes(1)
    expect(pauseCrons).toHaveBeenCalledTimes(1)
    expect(haltForks).toHaveBeenCalledTimes(1)
    expect(smsTate).toHaveBeenCalledTimes(1)
  })

  test('SMS is suppressed when emergency mode is already active (no re-spam)', async () => {
    // Mock db to return active emergency-mode row before fireIncident calls
    // isEmergencyMode(). The wiring test's outer db mock returns [{id:42}]
    // for every query; here we override with a per-call mock that returns
    // a real emergency-mode row.
    jest.resetModules()
    jest.doMock('../../config/db', () => {
      // Both _logIncident and isEmergencyMode hit the same db call signature.
      // Track which call this is: first INSERT (returns row), then SELECT
      // emergency_mode (returns active flag).
      let callCount = 0
      return (strings, ...values) => {
        callCount++
        const sql = strings.join('?')
        if (sql.includes('INSERT INTO security_incidents')) {
          return Promise.resolve([{ id: 99 }])
        }
        if (sql.includes('emergency_mode')) {
          return Promise.resolve([{ value: JSON.stringify(true) }])
        }
        return Promise.resolve([{ id: 99 }])
      }
    })
    const incidentReloaded = require('../securityIncidentResponse')

    const setEmergencyMode = jest.fn(async () => {})
    const pauseCrons = jest.fn(() => {})
    const haltForks = jest.fn(async () => {})
    const smsTate = jest.fn(async () => true)

    incidentReloaded.wireServices({ setEmergencyMode, pauseCrons, haltForks, smsTate })

    await incidentReloaded.fireIncident({
      incident_class: 'credential_redaction_burst',
      trigger_source: 'test',
      session_id: 'sess-already-emergency',
      details: { delta: 1 },
    })

    // Other actuators still run (idempotent).
    expect(setEmergencyMode).toHaveBeenCalledTimes(1)
    expect(pauseCrons).toHaveBeenCalledTimes(1)
    expect(haltForks).toHaveBeenCalledTimes(1)
    // SMS is the only one suppressed.
    expect(smsTate).not.toHaveBeenCalled()

    jest.dontMock('../../config/db')
    jest.resetModules()
  })

  test('partial wiring: only provided services are invoked, missing ones silently skipped', async () => {
    const pauseCrons = jest.fn(() => {})
    const smsTate = jest.fn(async () => true)
    // setEmergencyMode + haltForks NOT wired.

    incident.wireServices({ pauseCrons, smsTate })

    await incident.fireIncident({
      incident_class: 'review_b_rejection_burst',
      trigger_source: 'test',
      session_id: 'sess-3',
    })

    expect(pauseCrons).toHaveBeenCalledTimes(1)
    expect(smsTate).toHaveBeenCalledTimes(1)
  })
})

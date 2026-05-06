'use strict'

/**
 * Tests for credentialRedactionMonitor - bootstrap window + burst detection.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

const monitor = require('../credentialRedactionMonitor')
const credentialFilter = require('../credentialFilter')

describe('credentialRedactionMonitor', () => {
  beforeEach(() => {
    monitor._resetForTest()
    credentialFilter.resetCounters()
  })
  afterEach(() => monitor.stop())

  test('does not fire during bootstrap window', async () => {
    const fired = []
    monitor.start({
      fireIncident: async (a) => { fired.push(a) },
      bootstrapMs: 60_000, // long window; we're still in it
      pollMs: 10_000,
    })
    credentialFilter.redact('AKIAIOSFODNN7EXAMPLE', 'test')
    await monitor._tick()
    expect(fired).toEqual([])
  })

  test('fires credential_redaction_burst once bootstrap closed and counter increments', async () => {
    const fired = []
    monitor.start({
      fireIncident: async (a) => { fired.push(a) },
      bootstrapMs: 0, // bootstrap already done
      pollMs: 10_000,
    })
    // No redactions yet: a tick should observe zero and not fire.
    await monitor._tick()
    expect(fired).toEqual([])

    credentialFilter.redact('key=sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01', 'test')
    await monitor._tick()
    expect(fired.length).toBe(1)
    expect(fired[0].incident_class).toBe('credential_redaction_burst')
    expect(fired[0].details.delta).toBeGreaterThanOrEqual(1)
    expect(fired[0].trigger_source).toBe('credentialRedactionMonitor')
  })

  test('does not re-fire on stable counter after burst', async () => {
    const fired = []
    monitor.start({
      fireIncident: async (a) => { fired.push(a) },
      bootstrapMs: 0,
      pollMs: 10_000,
    })
    credentialFilter.redact('ghp_abcdefghijklmnopqrstuvwxyz0123456789AB', 'test')
    await monitor._tick()
    await monitor._tick()
    expect(fired.length).toBe(1)
  })

  test('snapshot() returns bootstrap status + counters', () => {
    monitor.start({ bootstrapMs: 60_000, pollMs: 10_000 })
    credentialFilter.redact('AKIAIOSFODNN7EXAMPLE', 'wsManager.broadcast')
    const snap = monitor.snapshot()
    expect(snap.total_since_boot).toBe(1)
    expect(snap.bootstrap_done).toBe(false)
    expect(snap.counters_by_type_source['aws_access_key|wsManager.broadcast']).toBe(1)
  })

  test('logs error when burst detected but no fireIncident wired', async () => {
    monitor.start({ bootstrapMs: 0, pollMs: 10_000 })
    credentialFilter.redact('AKIAIOSFODNN7EXAMPLE', 'test')
    // No fireIncident provided; tick should not throw.
    await expect(monitor._tick()).resolves.not.toThrow()
  })
})

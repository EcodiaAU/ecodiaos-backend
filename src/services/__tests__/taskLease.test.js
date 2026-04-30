'use strict'

/**
 * Tests for src/services/taskLease.js. DB mocked.
 *
 * Covers:
 *   - hashTaskId: deterministic, stable bigint
 *   - acquireTaskLease: happy path (got lock), contended (null), row insert cleanup on failure
 *   - heartbeat: true when still owned, false when taken over
 *   - releaseTaskLease: idempotent, always releases advisory lock
 *   - sweepExpiredLeases: releases locks + rows
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockResults = []
const mockCalls = []
jest.mock('../../config/db', () => function dbTag(strings, ...values) {
  mockCalls.push({ sql: strings.join('?'), values })
  if (mockResults.length === 0) return Promise.resolve([])
  const next = mockResults.shift()
  if (next instanceof Error) return Promise.reject(next)
  return Promise.resolve(next)
})

const lease = require('../taskLease')

beforeEach(() => {
  mockResults.length = 0
  mockCalls.length = 0
})

describe('taskLease.hashTaskId', () => {
  test('deterministic', () => {
    const a = lease.hashTaskId('task-abc')
    const b = lease.hashTaskId('task-abc')
    expect(a).toBe(b)
    expect(typeof a).toBe('bigint')
  })

  test('different inputs produce different hashes', () => {
    const a = lease.hashTaskId('task-abc')
    const b = lease.hashTaskId('task-xyz')
    expect(a).not.toBe(b)
  })

  test('coerces non-string input', () => {
    const a = lease.hashTaskId(42)
    expect(typeof a).toBe('bigint')
  })
})

describe('taskLease.acquireTaskLease', () => {
  test('happy path: got lock + row inserted', async () => {
    mockResults.push([{ got: true }])       // pg_try_advisory_lock
    mockResults.push([{                      // INSERT ... RETURNING
      task_id: 't1',
      brain_id: 'vps-conductor',
      expires_at: new Date(Date.now() + 120_000),
    }])
    const row = await lease.acquireTaskLease({
      task_id: 't1',
      brain_id: 'vps-conductor',
    })
    expect(row.task_id).toBe('t1')
    expect(mockCalls[0].sql).toMatch(/pg_try_advisory_lock/)
    expect(mockCalls[1].sql).toMatch(/INSERT INTO task_leases/)
  })

  test('contended: returns null without INSERT', async () => {
    mockResults.push([{ got: false }])
    const row = await lease.acquireTaskLease({
      task_id: 't1',
      brain_id: 'vps-conductor',
    })
    expect(row).toBeNull()
    expect(mockCalls.length).toBe(1) // just the lock attempt
  })

  test('INSERT throws: releases advisory lock', async () => {
    mockResults.push([{ got: true }])       // lock acquired
    mockResults.push(new Error('DB down'))  // INSERT fails
    mockResults.push([])                    // pg_advisory_unlock cleanup
    await expect(lease.acquireTaskLease({
      task_id: 't1',
      brain_id: 'vps-conductor',
    })).rejects.toThrow(/DB down/)
    // Lock release must be called on failure.
    const unlockCall = mockCalls.find((c) => /pg_advisory_unlock/.test(c.sql))
    expect(unlockCall).toBeDefined()
  })

  test('input validation', async () => {
    await expect(lease.acquireTaskLease({ brain_id: 'x' })).rejects.toThrow(/task_id required/)
    await expect(lease.acquireTaskLease({ task_id: 't' })).rejects.toThrow(/brain_id required/)
  })
})

describe('taskLease.heartbeat', () => {
  test('still owned: returns true', async () => {
    mockResults.push([{ task_id: 't1', brain_id: 'vps-conductor' }])
    const ok = await lease.heartbeat({ task_id: 't1', brain_id: 'vps-conductor' })
    expect(ok).toBe(true)
    expect(mockCalls[0].sql).toMatch(/UPDATE task_leases/)
    expect(mockCalls[0].sql).toMatch(/heartbeat_at/)
  })

  test('taken over by another brain: returns false', async () => {
    mockResults.push([]) // UPDATE ... WHERE brain_id = 'vps' → no match
    const ok = await lease.heartbeat({ task_id: 't1', brain_id: 'vps-conductor' })
    expect(ok).toBe(false)
  })
})

describe('taskLease.releaseTaskLease', () => {
  test('idempotent: runs both UPDATE and pg_advisory_unlock', async () => {
    mockResults.push([]) // UPDATE
    mockResults.push([]) // pg_advisory_unlock
    await lease.releaseTaskLease({ task_id: 't1', brain_id: 'vps-conductor' })
    expect(mockCalls.length).toBe(2)
    expect(mockCalls[0].sql).toMatch(/UPDATE task_leases/)
    expect(mockCalls[1].sql).toMatch(/pg_advisory_unlock/)
  })

  test('advisory unlock failure swallowed', async () => {
    mockResults.push([])                        // UPDATE
    mockResults.push(new Error('nothing to unlock'))  // unlock
    await expect(
      lease.releaseTaskLease({ task_id: 't1', brain_id: 'vps-conductor' }),
    ).resolves.toBeUndefined()
  })
})

describe('taskLease.sweepExpiredLeases', () => {
  test('releases expired leases and their advisory locks', async () => {
    mockResults.push([
      { task_id: 't1', lock_key: '12345' },
      { task_id: 't2', lock_key: '67890' },
    ])
    mockResults.push([]) // unlock t1
    mockResults.push([]) // unlock t2
    const n = await lease.sweepExpiredLeases()
    expect(n).toBe(2)
    expect(mockCalls[0].sql).toMatch(/UPDATE task_leases/)
    expect(mockCalls[0].sql).toMatch(/expires_at/)
    expect(mockCalls[1].sql).toMatch(/pg_advisory_unlock/)
  })

  test('no expired leases: returns 0 without unlocks', async () => {
    mockResults.push([])
    const n = await lease.sweepExpiredLeases()
    expect(n).toBe(0)
    expect(mockCalls.length).toBe(1) // just the UPDATE
  })
})

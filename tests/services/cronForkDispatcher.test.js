'use strict'

/**
 * cronForkDispatcher.test.js — verify session_mode integration in the
 * dispatch path (src/services/cronForkDispatcher.js).
 *
 * Covers:
 *   - session_mode='brief_fork' → spawn called with context_mode='brief'
 *   - session_mode='inherit_fork' → spawn called with context_mode='recent'
 *   - session_mode='direct_exec' → no spawn (shouldHandle=false, caller
 *     keeps cron on os-session POST path)
 *   - session_mode='conductor_inline' → no spawn (sentinel, shouldHandle=false)
 *   - session_mode='factory_cc_session' → no spawn (warn logged,
 *     manual dispatch only)
 *   - priority='conductor' or 'direct_exec' → no spawn regardless of
 *     session_mode (priority short-circuit unchanged from PR #28)
 *
 * Mocks db (kv_store reads/writes), forkService (spawn), and logger.
 */

// ---- mocks declared before requiring the module under test ----

jest.mock('../../src/config/db', () => {
  // db is called as a tagged template: db`SELECT ...`. Return a jest.fn that
  // resolves to a sensible default; individual tests override per-call.
  return jest.fn(() => Promise.resolve([]))
})

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}))

jest.mock('../../src/services/forkService', () => ({
  spawnFork: jest.fn(),
}))

const db = require('../../src/config/db')
const forkService = require('../../src/services/forkService')
const logger = require('../../src/config/logger')

// Loaded after mocks so the dispatcher picks up the mock instances.
const dispatcher = require('../../src/services/cronForkDispatcher')

// ── helpers ────────────────────────────────────────────────────────────────

function mockBudgetReads({ remaining = 100_000, max = 100_000 } = {}) {
  // The dispatcher's _readBudget / _readBudgetMax do:
  //   db`SELECT value FROM kv_store WHERE key = ${BUDGET_KEY}`
  // Returning [] triggers lazy init → DEFAULT. Returning a single-row
  // value with parseable JSON is the explicit path.
  db.mockImplementation((strings, ...values) => {
    const sql = strings.join(' ')
    if (/SELECT value FROM kv_store/i.test(sql)) {
      const key = values[0]
      if (key === 'cowork.daily_fork_budget_remaining') {
        return Promise.resolve([{ value: JSON.stringify({ remaining }) }])
      }
      if (key === 'cowork.daily_fork_budget_max') {
        return Promise.resolve([{ value: JSON.stringify({ max }) }])
      }
    }
    // Default for INSERT / UPDATE / status_board writes / fork_id stamps
    // → resolve to [] so awaits succeed.
    return Promise.resolve([])
  })
}

function makeCronTask(overrides = {}) {
  return {
    id: 'task-uuid-1',
    name: 'system-health',
    prompt: 'Test brief — placeholder for token cost estimation.',
    ...overrides,
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('cronForkDispatcher.dispatchCronAsFork', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBudgetReads({ remaining: 100_000, max: 100_000 })
    forkService.spawnFork.mockResolvedValue({ fork_id: 'fork_test_abc' })
  })

  describe('session_mode → context_mode wiring', () => {
    test('brief_fork session_mode → spawnFork called with context_mode "brief"', async () => {
      const task = makeCronTask({ name: 'system-health' }) // BRIEF_FORK_CRONS
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(true)
      expect(result.session_mode).toBe('brief_fork')
      expect(forkService.spawnFork).toHaveBeenCalledTimes(1)
      expect(forkService.spawnFork).toHaveBeenCalledWith(
        expect.objectContaining({
          brief: task.prompt,
          context_mode: 'brief',
        })
      )
    })

    test('inherit_fork session_mode → spawnFork called with context_mode "recent"', async () => {
      const task = makeCronTask({ name: 'email-triage' }) // INHERIT_FORK_CRONS
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(true)
      expect(result.session_mode).toBe('inherit_fork')
      expect(forkService.spawnFork).toHaveBeenCalledTimes(1)
      expect(forkService.spawnFork).toHaveBeenCalledWith(
        expect.objectContaining({
          brief: task.prompt,
          context_mode: 'recent',
        })
      )
    })

    test('unknown cron name → defaults to inherit_fork → context_mode "recent"', async () => {
      // Unknown name. Priority classifier defaults to low_priority_fork;
      // session_mode classifier defaults to inherit_fork.
      const task = makeCronTask({ name: 'this-cron-does-not-exist-anywhere' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(true)
      expect(result.session_mode).toBe('inherit_fork')
      expect(forkService.spawnFork).toHaveBeenCalledWith(
        expect.objectContaining({ context_mode: 'recent' })
      )
    })
  })

  describe('priority short-circuits (unchanged from PR #28)', () => {
    test('priority="conductor" (meta-loop) → no spawn, shouldHandle=false', async () => {
      const task = makeCronTask({ name: 'meta-loop' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(false)
      expect(result.route).toBe('conductor')
      expect(result.shouldHandle).toBe(false)
      expect(forkService.spawnFork).not.toHaveBeenCalled()
    })

    test('priority="direct_exec" (neo4j-keepalive) → no spawn, shouldHandle=false', async () => {
      const task = makeCronTask({ name: 'neo4j-keepalive' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(false)
      expect(result.route).toBe('direct_exec')
      expect(result.shouldHandle).toBe(false)
      expect(forkService.spawnFork).not.toHaveBeenCalled()
    })
  })

  describe('session_mode short-circuits (new in this commit)', () => {
    // We need a cron that is NOT priority=conductor/direct_exec but IS
    // session_mode in {direct_exec, conductor_inline, factory_cc_session}.
    // The current classifications keep these aligned (no priority/session
    // mismatch in the live set), so we exercise the branch by mocking the
    // session-mode classifier directly. This validates the branch logic
    // even though no live cron exercises it today.

    test('session_mode="conductor_inline" → no spawn, sentinel reason', async () => {
      const cronSessionMode = require('../../src/config/cronSessionMode')
      const original = cronSessionMode.getCronSessionMode
      // Spy the classifier to force conductor_inline for a fork-priority cron.
      jest.spyOn(cronSessionMode, 'getCronSessionMode').mockImplementation((name) => {
        if (name === 'system-health') return 'conductor_inline'
        return original(name)
      })

      const task = makeCronTask({ name: 'system-health' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(false)
      expect(result.session_mode).toBe('conductor_inline')
      expect(result.shouldHandle).toBe(false)
      expect(result.reason).toMatch(/conductor_inline/)
      expect(forkService.spawnFork).not.toHaveBeenCalled()

      cronSessionMode.getCronSessionMode.mockRestore()
    })

    test('session_mode="factory_cc_session" → no spawn, warn logged', async () => {
      const cronSessionMode = require('../../src/config/cronSessionMode')
      const original = cronSessionMode.getCronSessionMode
      jest.spyOn(cronSessionMode, 'getCronSessionMode').mockImplementation((name) => {
        if (name === 'system-health') return 'factory_cc_session'
        return original(name)
      })

      const task = makeCronTask({ name: 'system-health' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(false)
      expect(result.session_mode).toBe('factory_cc_session')
      expect(result.shouldHandle).toBe(false)
      expect(result.reason).toMatch(/factory_cc_session/)
      expect(forkService.spawnFork).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/factory_cc_session/),
        expect.any(Object)
      )

      cronSessionMode.getCronSessionMode.mockRestore()
    })

    test('session_mode="direct_exec" on a fork-priority cron → no spawn, shouldHandle=false', async () => {
      const cronSessionMode = require('../../src/config/cronSessionMode')
      const original = cronSessionMode.getCronSessionMode
      jest.spyOn(cronSessionMode, 'getCronSessionMode').mockImplementation((name) => {
        if (name === 'system-health') return 'direct_exec'
        return original(name)
      })

      const task = makeCronTask({ name: 'system-health' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result.spawned).toBe(false)
      expect(result.session_mode).toBe('direct_exec')
      expect(result.shouldHandle).toBe(false)
      expect(forkService.spawnFork).not.toHaveBeenCalled()

      cronSessionMode.getCronSessionMode.mockRestore()
    })
  })

  describe('result shape', () => {
    test('successful spawn returns full session-aware shape', async () => {
      const task = makeCronTask({ name: 'system-health' })
      const result = await dispatcher.dispatchCronAsFork(task)

      expect(result).toEqual(
        expect.objectContaining({
          spawned: true,
          route: expect.any(String),
          session_mode: 'brief_fork',
          fork_id: 'fork_test_abc',
          reason: 'spawned',
          budget_remaining: expect.any(Number),
          estimated_cost: expect.any(Number),
          shouldHandle: true,
        })
      )
    })
  })
})

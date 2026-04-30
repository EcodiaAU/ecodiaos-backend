'use strict'

/**
 * Tests for src/workers/claimVerifierWorker.js — per-action verifier dispatch.
 *
 * Covers:
 *   - deployed / committed route to git verifier; invalid sha rejected.
 *   - emailed / scheduled / forked hit the correct DB lookup by handle key.
 *   - Unknown action returns 'action_unknown'.
 *   - _verifyGitSha rejects injection-shaped shas.
 *
 * Mocks DB as a template-tag fn that a test can swap to canned rows or
 * throw; mocks child_process.execFile so the git verifier is deterministic.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

const mockDbTag = jest.fn()
jest.mock('../../config/db', () => (...args) => mockDbTag(...args))

const mockExecFile = jest.fn()
jest.mock('child_process', () => ({ execFile: (...a) => mockExecFile(...a) }))

const worker = require('../claimVerifierWorker')

describe('claimVerifierWorker action dispatch', () => {
  beforeEach(() => {
    mockDbTag.mockReset()
    mockExecFile.mockReset()
  })

  describe('deployed / committed -> git sha verifier', () => {
    test('happy path: valid sha + git exit 0 → verified', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => cb(null, { stdout: '', stderr: '' }))
      const r = await worker._verifyOne({
        action: 'deployed',
        handle_kv: { sha: 'abc1234' },
      })
      expect(r.status).toBe('verified')
    })

    test('git exit non-zero → failed with detail', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) =>
        cb(Object.assign(new Error('unknown ref'), { stderr: 'fatal: bad object' }))
      )
      const r = await worker._verifyOne({
        action: 'committed',
        handle_kv: { sha: 'def5678' },
      })
      expect(r.status).toBe('failed')
      expect(r.detail).toMatch(/bad object/)
    })

    test('rejects injection-shaped sha without calling git', async () => {
      const r = await worker._verifyOne({
        action: 'deployed',
        handle_kv: { sha: 'abc123; rm -rf /' },
      })
      expect(r.status).toBe('failed')
      expect(r.detail).toBe('invalid_sha_shape')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    test('missing sha → failed', async () => {
      const r = await worker._verifyOne({ action: 'deployed', handle_kv: {} })
      expect(r.status).toBe('failed')
      expect(r.detail).toBe('invalid_sha_shape')
    })
  })

  describe('emailed -> email_threads/email_events lookup', () => {
    test('message_id found in email_threads → verified', async () => {
      mockDbTag.mockResolvedValueOnce([{ ok: 1 }])
      const r = await worker._verifyOne({
        action: 'emailed',
        handle_kv: { message_id: 'abc@mail.gmail.com' },
      })
      expect(r.status).toBe('verified')
    })

    test('angle-bracketed message_id is stripped', async () => {
      mockDbTag.mockResolvedValueOnce([{ ok: 1 }])
      const r = await worker._verifyOne({
        action: 'emailed',
        handle_kv: { message_id: '<abc@mail.gmail.com>' },
      })
      expect(r.status).toBe('verified')
    })

    test('not in threads but present in email_events → verified', async () => {
      mockDbTag.mockResolvedValueOnce([]) // email_threads empty
      mockDbTag.mockResolvedValueOnce([{ ok: 1 }]) // email_events hit
      const r = await worker._verifyOne({
        action: 'emailed',
        handle_kv: { message_id: 'xyz@host' },
      })
      expect(r.status).toBe('verified')
    })

    test('not found anywhere → failed', async () => {
      mockDbTag.mockResolvedValueOnce([])
      mockDbTag.mockResolvedValueOnce([])
      const r = await worker._verifyOne({
        action: 'emailed',
        handle_kv: { message_id: 'ghost@nowhere' },
      })
      expect(r.status).toBe('failed')
      expect(r.detail).toBe('message_id_not_found')
    })

    test('missing message_id → failed', async () => {
      const r = await worker._verifyOne({ action: 'emailed', handle_kv: {} })
      expect(r.status).toBe('failed')
      expect(r.detail).toBe('missing_message_id')
    })
  })

  describe('scheduled -> os_scheduled_tasks', () => {
    test('task_id present → verified', async () => {
      mockDbTag.mockResolvedValueOnce([{ ok: 1 }])
      const r = await worker._verifyOne({
        action: 'scheduled',
        handle_kv: { task_id: 'sch_42' },
      })
      expect(r.status).toBe('verified')
    })

    test('not found → failed', async () => {
      mockDbTag.mockResolvedValueOnce([])
      const r = await worker._verifyOne({
        action: 'scheduled',
        handle_kv: { task_id: 'sch_nope' },
      })
      expect(r.status).toBe('failed')
    })

    test('DB throws → failed with db_error detail', async () => {
      mockDbTag.mockRejectedValueOnce(new Error('connection lost'))
      const r = await worker._verifyOne({
        action: 'scheduled',
        handle_kv: { task_id: 'sch_1' },
      })
      expect(r.status).toBe('failed')
      expect(r.detail).toMatch(/^db_error:/)
    })
  })

  describe('forked -> os_forks', () => {
    test('fork_id present → verified', async () => {
      mockDbTag.mockResolvedValueOnce([{ ok: 1 }])
      const r = await worker._verifyOne({
        action: 'forked',
        handle_kv: { fork_id: 'fork_mok123' },
      })
      expect(r.status).toBe('verified')
    })

    test('not found → failed', async () => {
      mockDbTag.mockResolvedValueOnce([])
      const r = await worker._verifyOne({
        action: 'forked',
        handle_kv: { fork_id: 'fork_ghost' },
      })
      expect(r.status).toBe('failed')
    })
  })

  describe('unknown actions', () => {
    test('unknown action → action_unknown', async () => {
      const r = await worker._verifyOne({
        action: 'danced',
        handle_kv: { style: 'polka' },
      })
      expect(r.status).toBe('action_unknown')
      expect(r.detail).toMatch(/no_verifier_for_action:danced/)
    })
  })
})

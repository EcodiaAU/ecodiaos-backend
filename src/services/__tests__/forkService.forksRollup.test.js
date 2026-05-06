'use strict'

// Unit tests for forkService.forksRollup() - specifically the phantom-bail
// signal added 2026-05-03 (fork_mop2fyoz_25425d, SELF-EVOLUTION rotation C).
//
// Background
// ──────────
// Per ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md (2 May 2026
// rotation B), forks that close their transcript without emitting a
// [FORK_REPORT] tag now write state.result with the literal prefix
// `(no [FORK_REPORT] emitted; last N chars of transcript follow)`.
//
// The rollup the conductor sees on every turn is the only durable surface
// the conductor has into recently-finished forks (the message-queue
// fork_report enqueue at forkService.js:712 is gated on `if (report)` - 
// when no report is captured, no system message is delivered). Pre-fix the
// rollup line read `[done]` regardless of whether the fork closed cleanly
// or hit the transcript-tail fallback. The conductor could not distinguish
// "fork shipped clean report" from "fork ran out of budget mid-write".
//
// Post-fix forksRollup() flags such rows as `phantom_bail` so the conductor
// knows to apply probe-then-trust (verify-deployed-state-against-narrated-
// state) rather than treat the result string as a verbatim report.

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockDbQueue = []
jest.mock('../../config/db', () => {
  function dbTag(/* strings, ...values */) {
    if (mockDbQueue.length === 0) return Promise.resolve([])
    const next = mockDbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

jest.mock('../usageEnergyService', () => ({
  getEnergy: jest.fn(async () => ({ level: 'healthy' })),
}))

jest.mock('../../websocket/wsManager', () => ({
  broadcast: jest.fn(),
}))

const forkService = require('../forkService')
const { FALLBACK_MARKER } = forkService

beforeEach(() => {
  mockDbQueue.length = 0
  forkService._resetForTest()
})

describe('forkService._isPhantomBail (helper)', () => {
  test('matches strings that begin with the FALLBACK_MARKER', () => {
    const sample = `${FALLBACK_MARKER}; last 1234 chars of transcript follow)\n\nactual tail content`
    expect(forkService._isPhantomBail(sample)).toBe(true)
  })

  test('does not match real reports', () => {
    expect(forkService._isPhantomBail('Built X. Verified Y. Pushed Z.')).toBe(false)
  })

  test('does not match the substring mid-string (must be prefix)', () => {
    const mid = `Did stuff. Footer: ${FALLBACK_MARKER}`
    expect(forkService._isPhantomBail(mid)).toBe(false)
  })

  test('handles null / undefined / non-string safely', () => {
    expect(forkService._isPhantomBail(null)).toBe(false)
    expect(forkService._isPhantomBail(undefined)).toBe(false)
    expect(forkService._isPhantomBail(123)).toBe(false)
    expect(forkService._isPhantomBail({})).toBe(false)
  })

  test('matches the exact form forkService writes (smoke test against producer)', () => {
    // Mirror the writer at forkService.js (state.result fallback path).
    const tail = 'aaa'.repeat(700) // ~2100 chars, will be sliced to last 2000
    const sliced = tail.length > 2000 ? tail.slice(-2000) : tail
    const result = `${FALLBACK_MARKER}; last ${sliced.length} chars of transcript follow)\n\n${sliced}`
    expect(forkService._isPhantomBail(result)).toBe(true)
  })
})

describe('forkService.forksRollup() - phantom-bail surfacing', () => {
  test('returns null when no live forks AND no recent finished AND includeRecentDone=true', async () => {
    mockDbQueue.push([]) // db query returns empty
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toBeNull()
  })

  test('returns null when no live forks AND includeRecentDone=false (no DB query at all)', async () => {
    const out = await forkService.forksRollup({ includeRecentDone: false })
    expect(out).toBeNull()
  })

  test('flags phantom_bail on recently-finished fork whose result starts with FALLBACK_MARKER', async () => {
    mockDbQueue.push([{
      fork_id: 'fork_test_bail_001',
      brief: 'audit kv_store for stale handoff rows older than 6h',
      status: 'done',
      position: 'done',
      result: `${FALLBACK_MARKER}; last 2000 chars of transcript follow)\n\n[lots of tool-call narration]`,
      next_step: null,
      started_at: new Date('2026-05-03T05:00:00Z'),
      ended_at: new Date('2026-05-03T05:08:00Z'),
    }])
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toMatch(/<forks_rollup>/)
    expect(out).toMatch(/No active forks\. Recently finished:/)
    expect(out).toMatch(/fork_test_bail_001 \[done phantom_bail\]/)
    expect(out).toMatch(/brief="audit kv_store for stale handoff rows older than 6h"/)
  })

  test('does NOT flag phantom_bail on recently-finished fork whose result is a real report', async () => {
    mockDbQueue.push([{
      fork_id: 'fork_test_clean_002',
      brief: 'patched line 137 in routes/osSession.js',
      status: 'done',
      position: 'done',
      result: 'Built and verified the priority:false guard. Tests pass 11/11. Pushed as commit deadbeef.',
      next_step: 'Monitor for queue regression on next 5 turns.',
      started_at: new Date('2026-05-03T05:00:00Z'),
      ended_at: new Date('2026-05-03T05:12:00Z'),
    }])
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toMatch(/fork_test_clean_002 \[done\]/)
    expect(out).not.toMatch(/phantom_bail/)
    expect(out).toMatch(/next_step: Monitor for queue regression/)
  })

  test('flags phantom_bail per row in a mixed batch (some clean, some bailed)', async () => {
    mockDbQueue.push([
      {
        fork_id: 'fork_clean',
        brief: 'short brief',
        status: 'done',
        position: 'done',
        result: 'Real report content here.',
        next_step: null,
        started_at: new Date('2026-05-03T05:00:00Z'),
        ended_at: new Date('2026-05-03T05:05:00Z'),
      },
      {
        fork_id: 'fork_bailed',
        brief: 'another brief',
        status: 'done',
        position: 'done',
        result: `${FALLBACK_MARKER}; last 1500 chars of transcript follow)\n\n... transcript tail ...`,
        next_step: null,
        started_at: new Date('2026-05-03T05:01:00Z'),
        ended_at: new Date('2026-05-03T05:09:00Z'),
      },
      {
        fork_id: 'fork_errored',
        brief: 'brief three',
        status: 'error',
        position: 'error',
        result: 'connect ECONNREFUSED 127.0.0.1:5432',
        next_step: null,
        started_at: new Date('2026-05-03T05:02:00Z'),
        ended_at: new Date('2026-05-03T05:03:00Z'),
      },
    ])
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toMatch(/fork_clean \[done\]/)
    // Make sure the clean-row's status doesn't accidentally pick up phantom_bail.
    expect(out).not.toMatch(/fork_clean \[done phantom_bail\]/)
    expect(out).toMatch(/fork_bailed \[done phantom_bail\]/)
    // Errored fork has a real result string (the error message), not the marker:
    expect(out).toMatch(/fork_errored \[error\]/)
    expect(out).not.toMatch(/fork_errored \[error phantom_bail\]/)
  })

  test('handles null result without crashing (legacy rows)', async () => {
    mockDbQueue.push([{
      fork_id: 'fork_legacy_null',
      brief: 'legacy fork before fallback marker shipped',
      status: 'crashed',
      position: 'crashed',
      result: null,
      next_step: null,
      started_at: new Date('2026-04-30T00:00:00Z'),
      ended_at: new Date('2026-04-30T00:05:00Z'),
    }])
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toMatch(/fork_legacy_null \[crashed\]/)
    expect(out).not.toMatch(/phantom_bail/)
  })

  test('active-forks branch is unaffected by phantom-bail logic (regression guard)', async () => {
    // Drop a live fork directly into the in-memory map via the test-hook map.
    const map = forkService._getForkMapForTest()
    map.set('fork_live_a', {
      fork_id: 'fork_live_a',
      status: 'working',
      brief: 'live brief A',
      tool_calls: 3,
      started_at: Date.now() - 30000, // 30s ago
    })
    const out = await forkService.forksRollup({ includeRecentDone: true })
    expect(out).toMatch(/<forks_rollup>/)
    expect(out).toMatch(/Active forks \(1\/5\):/)
    expect(out).toMatch(/fork_live_a \[working\]/)
    // Phantom-bail flag must NOT appear on live-rollup lines (the flag is a
    // property of the *result*, which only exists post-completion).
    expect(out).not.toMatch(/phantom_bail/)
  })
})

describe('forkService.FALLBACK_MARKER (export contract)', () => {
  test('is exported and is the literal substring forkService writes', () => {
    expect(typeof forkService.FALLBACK_MARKER).toBe('string')
    expect(forkService.FALLBACK_MARKER).toBe('(no [FORK_REPORT] emitted')
  })
})

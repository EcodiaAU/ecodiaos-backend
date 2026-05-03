'use strict'

// Unit tests for forkService._buildForkReportBody and _enqueueForkReport —
// the always-enqueue fork_report path shipped 2026-05-03 (fork_mopb0usj_110087,
// SELF-EVOLUTION rotation A).
//
// Background
// ──────────
// Pre-fix the success-path enqueue at end of spawnFork's stream loop was gated
// `if (report)` — when a fork's transcript closed without emitting a
// [FORK_REPORT] tag, the message-queue enqueue was skipped entirely. The fork
// only surfaced via forks_rollup for ~15min before dropping off the conductor's
// view. Phantom-bail forks could ship real work and the conductor never saw a
// durable inbox record.
//
// Post-fix the enqueue is unconditional. Two body shapes, one path:
//   (a) clean — fork emitted [FORK_REPORT]; body wraps report verbatim.
//   (b) phantom_bail — body explicitly tagged `no_report_emitted=true`,
//       carries state.result (FALLBACK_MARKER prefix + transcript tail) so
//       the conductor can verify-then-act with something to anchor probes to.
//
// Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
//           ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

jest.mock('../../config/db', () => function dbTag() { return Promise.resolve([]) })

jest.mock('../usageEnergyService', () => ({
  getEnergy: jest.fn(async () => ({ level: 'healthy' })),
}))

jest.mock('../../websocket/wsManager', () => ({
  broadcast: jest.fn(),
}))

const forkService = require('../forkService')
const { FALLBACK_MARKER } = forkService

beforeEach(() => {
  forkService._resetForTest()
})

function makeMq() {
  const enqueued = []
  return {
    enqueued,
    enqueueMessage: jest.fn(async (msg) => { enqueued.push(msg) }),
  }
}

// ──────────────────────────────────────────────────────────────────────────────
describe('forkService._buildForkReportBody (pure helper)', () => {
  test('clean path — wraps captured report verbatim with [SYSTEM: fork_report]', () => {
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_clean_001',
      brief: 'fix line 42 in foo.js',
      report: 'Built X. Tests pass 11/11. Pushed deadbeef.',
      nextStep: 'Monitor next 5 turns.',
      fallbackResult: 'irrelevant on clean path',
    })
    expect(body).toMatch(/^\[SYSTEM: fork_report fork_test_clean_001\]$/m)
    expect(body).toMatch(/^Brief: fix line 42 in foo\.js$/m)
    expect(body).toMatch(/^Report: Built X\. Tests pass 11\/11\. Pushed deadbeef\.$/m)
    expect(body).toMatch(/Next step suggested: Monitor next 5 turns\./)
    // Clean body must NOT carry the no_report_emitted=true tag.
    expect(body).not.toMatch(/no_report_emitted=true/)
    // Clean body must NOT include the fallbackResult.
    expect(body).not.toMatch(/irrelevant on clean path/)
  })

  test('clean path — omits Next step line when nextStep is null', () => {
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_clean_002',
      brief: 'docs update',
      report: 'Wrote 3 sections.',
      nextStep: null,
      fallbackResult: null,
    })
    expect(body).toMatch(/Report: Wrote 3 sections\./)
    expect(body).not.toMatch(/Next step suggested/)
  })

  test('phantom_bail path — emits no_report_emitted=true tag', () => {
    const fallback = `${FALLBACK_MARKER}; last 1500 chars of transcript follow)\n\n... lots of tool-call narration ...`
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_001',
      brief: 'audit kv_store for stale rows',
      report: null,
      nextStep: null,
      fallbackResult: fallback,
    })
    expect(body).toMatch(/^\[SYSTEM: fork_report fork_test_bail_001 no_report_emitted=true\]$/m)
    expect(body).toMatch(/^Brief: audit kv_store for stale rows$/m)
    expect(body).toMatch(/No \[FORK_REPORT\] tag was emitted before transcript closed\./)
    // Carries verify-then-act guidance for the conductor.
    expect(body).toMatch(/probe-then-trust/)
    expect(body).toMatch(/verify-deployed-state-against-narrated-state/)
    // Carries the full state.result (FALLBACK_MARKER prefix + tail) verbatim
    // so the conductor has substrate to anchor probes to.
    expect(body).toContain(fallback)
  })

  test('phantom_bail path — handles null fallbackResult without crashing', () => {
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_empty',
      brief: 'brief here',
      report: null,
      nextStep: null,
      fallbackResult: null,
    })
    expect(body).toMatch(/no_report_emitted=true/)
    // When fallbackResult is null, body falls back to literal '(empty)' so the
    // shape stays parseable rather than emitting a stray 'undefined' line.
    expect(body).toMatch(/^\(empty\)$/m)
  })

  test('phantom_bail path — handles empty-string fallbackResult', () => {
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_blank',
      brief: 'brief here',
      report: null,
      nextStep: null,
      fallbackResult: '',
    })
    // Empty string is falsy → falls back to '(empty)' marker.
    expect(body).toMatch(/^\(empty\)$/m)
  })

  test('clean path takes priority when report is non-empty even if fallbackResult is set', () => {
    // Defensive: even if a caller passes both (the success-path always passes
    // both today), the report wins. Phantom_bail body shape only fires when
    // report is falsy.
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_priority',
      brief: 'b',
      report: 'real report',
      nextStep: null,
      fallbackResult: `${FALLBACK_MARKER}; last 100 chars)\n\ntail`,
    })
    expect(body).toMatch(/Report: real report/)
    expect(body).not.toMatch(/no_report_emitted=true/)
    expect(body).not.toMatch(/probe-then-trust/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('forkService._enqueueForkReport (mq integration)', () => {
  test('clean path — enqueues to message queue with fork:<id> source and queue mode', async () => {
    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_001',
      brief: 'b',
      report: 'r',
      nextStep: null,
      fallbackResult: null,
    })

    expect(out).toEqual({ enqueued: true, had_report: true })
    expect(mq.enqueueMessage).toHaveBeenCalledTimes(1)
    expect(mq.enqueued).toHaveLength(1)
    expect(mq.enqueued[0].source).toBe('fork:fork_e_001')
    expect(mq.enqueued[0].mode).toBe('queue')
    expect(mq.enqueued[0].body).toMatch(/\[SYSTEM: fork_report fork_e_001\]/)
    expect(mq.enqueued[0].body).toMatch(/Report: r/)
  })

  test('phantom_bail path — STILL enqueues (the regression guard for the 2026-05-03 fix)', async () => {
    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_bail_002',
      brief: 'audit something',
      report: null,
      nextStep: null,
      fallbackResult: `${FALLBACK_MARKER}; last 800 chars of transcript follow)\n\nthe tail`,
    })

    expect(out).toEqual({ enqueued: true, had_report: false })
    expect(mq.enqueueMessage).toHaveBeenCalledTimes(1)
    expect(mq.enqueued).toHaveLength(1)
    expect(mq.enqueued[0].source).toBe('fork:fork_e_bail_002')
    expect(mq.enqueued[0].body).toMatch(/no_report_emitted=true/)
    expect(mq.enqueued[0].body).toContain('the tail')
  })

  test('mq.enqueueMessage throws — returns enqueued=false but does not throw outward', async () => {
    const mq = {
      enqueueMessage: jest.fn(async () => { throw new Error('db dead') }),
    }
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_throws',
      brief: 'b',
      report: 'r',
      nextStep: null,
      fallbackResult: null,
    })

    expect(out.enqueued).toBe(false)
    expect(out.reason).toBe('enqueue_threw')
    expect(out.error).toBe('db dead')
    // Critical: the success-path caller awaits this and must not see a throw.
    // (The whole point of the success-path enqueue being best-effort is so a
    // queue failure doesn't take the fork into the outer catch error path.)
  })

  test('exports the helpers for downstream callers / tests', () => {
    expect(typeof forkService._buildForkReportBody).toBe('function')
    expect(typeof forkService._enqueueForkReport).toBe('function')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('integration: phantom_bail body matches the FALLBACK_MARKER producer shape', () => {
  // Mirror the writer at forkService.js (state.result fallback path) so that
  // future drift in either the marker constant or the wrapper line is caught
  // by this test, not in production by a conductor that can't parse the body.
  test('phantom_bail body always includes the marker prefix substring', () => {
    const tail = 'aaa'.repeat(700)
    const sliced = tail.length > 2000 ? tail.slice(-2000) : tail
    const fallback = `${FALLBACK_MARKER}; last ${sliced.length} chars of transcript follow)\n\n${sliced}`

    const body = forkService._buildForkReportBody({
      fork_id: 'fork_smoke_001',
      brief: 'b',
      report: null,
      nextStep: null,
      fallbackResult: fallback,
    })

    // The body must carry the marker so any downstream classifier matching
    // _isPhantomBail-style logic on the body content keeps working.
    expect(body).toContain(FALLBACK_MARKER)
    expect(body).toContain('no_report_emitted=true')
  })
})

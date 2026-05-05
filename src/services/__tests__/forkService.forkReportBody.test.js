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

  test('clean path — empty report string (FORK_REPORT + NEXT_STEP on adjacent lines) does NOT phantom_bail', () => {
    // Regression: test for the exact regex extraction bug found 5 May 2026.
    // When a fork writes [FORK_REPORT] all on one line followed by \n\n[NEXT_STEP],
    // the lazy [\s\S]*? captures only the newlines — .trim() gives "".
    //
    // OLD code used `if (report)` which treated "" as falsy → phantom_bail fallback.
    // FIXED code uses `if (report !== null)` so "" is correctly treated as a valid
    // (empty-body) report, not a missing tag.
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_empty_body',
      brief: 'b',
      report: '',
      nextStep: 'Merge the PR.',
      fallbackResult: 'should never be reached',
    })
    // Must NOT carry the phantom-bail tag — FORK_REPORT WAS found, body was just empty.
    expect(body).not.toMatch(/no_report_emitted=true/)
    // Must show the empty-body explanation in the Report line.
    expect(body).toMatch(/Report: \(empty body/)
    // Must still include next step.
    expect(body).toMatch(/Next step suggested: Merge the PR\./)
  })

  test('phantom_bail path — emits no_report_emitted=true tag and tight body (<1KB)', () => {
    const fallback = `${FALLBACK_MARKER}; last 1500 chars of transcript follow)\n\n... lots of tool-call narration ...`
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_001',
      brief: 'audit kv_store for stale rows',
      report: null,
      nextStep: null,
      fallbackResult: fallback,
    })
    expect(body).toMatch(/^\[SYSTEM: fork_report fork_test_bail_001 no_report_emitted=true\]$/m)
    expect(body).toMatch(/^Brief \(head\): audit kv_store for stale rows$/m)
    expect(body).toMatch(/No \[FORK_REPORT\] emitted\. Probe os_forks\/fork_test_bail_001 or git log --grep=fork_test_bail_001/)
    expect(body).toMatch(/Transcript tail \(last 500 chars\):/)
    // Tight body: total under 1024 chars even with non-trivial fallback input.
    expect(body.length).toBeLessThan(1024)
    // Tail body strips the FALLBACK_MARKER wrapper line; only the actual
    // transcript narration survives.
    expect(body).toContain('lots of tool-call narration')
    expect(body).not.toContain(FALLBACK_MARKER)
  })

  test('phantom_bail path — long brief is truncated to first 200 chars with ellipsis', () => {
    const longBrief = 'A'.repeat(2000) + '_TAIL_'
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_long',
      brief: longBrief,
      report: null,
      nextStep: null,
      fallbackResult: `${FALLBACK_MARKER}; last 0 chars)\n\n`,
    })
    // First 200 chars only, with ellipsis suffix.
    expect(body).toMatch(/Brief \(head\): A{200}…/)
    // The trailing portion of the long brief MUST NOT leak.
    expect(body).not.toContain('_TAIL_')
    // Hard size guarantee even with multi-KB brief input.
    expect(body.length).toBeLessThan(1024)
  })

  test('phantom_bail path — long transcript tail is truncated to last 500 chars with ellipsis prefix', () => {
    const longTail = 'X'.repeat(50) + 'Y'.repeat(2000) + '_END_'
    const fallback = `${FALLBACK_MARKER}; last ${longTail.length} chars of transcript follow)\n\n${longTail}`
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_bail_longtail',
      brief: 'b',
      report: null,
      nextStep: null,
      fallbackResult: fallback,
    })
    // Last 500 chars survive; ellipsis prefix indicates truncation.
    expect(body).toContain('_END_')
    expect(body).not.toContain('X'.repeat(50)) // head of original tail dropped
    expect(body).toMatch(/…Y+_END_$/)
    expect(body.length).toBeLessThan(1024)
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
    // When fallbackResult is null, tail line emits literal '(empty)' so the
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
    // Empty string falls back to '(empty)' marker.
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
describe('integration: phantom_bail body shape (5 May 2026 tight version)', () => {
  // Mirror the writer at forkService.js (state.result fallback path) so that
  // future drift in either the marker constant or the wrapper line is caught
  // by this test, not in production by a conductor that can't parse the body.
  //
  // Pre-5 May 2026: the inbox body included the FALLBACK_MARKER prefix
  // verbatim. That made the body 5KB+ per phantom-bail fork. The 5 May fix
  // strips the marker and trims to <1KB; downstream phantom-bail
  // classification now hangs off the SYSTEM-tag line (`no_report_emitted=
  // true`), NOT a substring search for FALLBACK_MARKER on the body.
  // The marker constant is still the single source of truth for state.result
  // (the os_forks column writer) and forksRollup() — both unchanged.
  test('phantom_bail body shape: tight + parseable + bounded under 1KB', () => {
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

    // The SYSTEM tag line carries the canonical phantom-bail signal for the
    // inbox. FALLBACK_MARKER is intentionally stripped from the body to keep
    // it tight (the marker still lives on os_forks.result for forksRollup).
    expect(body).toContain('no_report_emitted=true')
    expect(body).not.toContain(FALLBACK_MARKER)
    expect(body.length).toBeLessThan(1024)
  })
})

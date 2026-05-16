'use strict'

// Unit tests for forkService._buildForkReportBody and _enqueueForkReport - 
// the always-enqueue fork_report path shipped 2026-05-03 (fork_mopb0usj_110087,
// SELF-EVOLUTION rotation A).
//
// Background
// ──────────
// Pre-fix the success-path enqueue at end of spawnFork's stream loop was gated
// `if (report)` - when a fork's transcript closed without emitting a
// [FORK_REPORT] tag, the message-queue enqueue was skipped entirely. The fork
// only surfaced via forks_rollup for ~15min before dropping off the conductor's
// view. Phantom-bail forks could ship real work and the conductor never saw a
// durable inbox record.
//
// Post-fix the enqueue is unconditional. Two body shapes, one path:
//   (a) clean - fork emitted [FORK_REPORT]; body wraps report verbatim.
//   (b) phantom_bail - body explicitly tagged `no_report_emitted=true`,
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
const { FALLBACK_MARKER, SYNTH_MARKER, _isPhantomBail, _isSynthReport } = forkService

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
  test('clean path - wraps captured report verbatim with [SYSTEM: fork_report]', () => {
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

  test('clean path - omits Next step line when nextStep is null', () => {
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

  test('clean path - empty report string (FORK_REPORT + NEXT_STEP on adjacent lines) does NOT phantom_bail', () => {
    // Regression: test for the exact regex extraction bug found 5 May 2026.
    // When a fork writes [FORK_REPORT] all on one line followed by \n\n[NEXT_STEP],
    // the lazy [\s\S]*? captures only the newlines - .trim() gives "".
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
    // Must NOT carry the phantom-bail tag - FORK_REPORT WAS found, body was just empty.
    expect(body).not.toMatch(/no_report_emitted=true/)
    // Empty-body case carries its own diagnostic tag for telemetry.
    expect(body).toMatch(/empty_body=true/)
    // Must show the empty-body explanation in the Report line.
    expect(body).toMatch(/Report: \(empty body/)
    // Must still include next step.
    expect(body).toMatch(/Next step suggested: Merge the PR\./)
  })

  test('clean path - empty report body WITH transcriptTail surfaces tail for diagnosis', () => {
    // Origin: Tate verbatim 6 May 2026 21:44 AEST: "We need to fix the empty
    // fork reports and bail managers once and for all please". Pre-fix the
    // empty-body case rendered just '(empty body - FORK_REPORT immediately
    // followed by NEXT_STEP)' with no diagnostic context, leaving the
    // conductor blind to what the fork was doing right before the bare marker
    // fired. This test locks in the post-fix shape: when report is empty AND
    // transcriptTail is provided, the body includes both the explanation and
    // the tail content.
    const tail = 'final tool call: db_query SELECT count(*) FROM tenants WHERE archived_at IS NULL\nresult: 7'
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_empty_with_tail',
      brief: 'recon tenants',
      report: '',
      nextStep: null,
      fallbackResult: null,
      transcriptTail: tail,
    })
    // Empty-body diagnostic tag fires.
    expect(body).toMatch(/^\[SYSTEM: fork_report fork_test_empty_with_tail empty_body=true\]$/m)
    // Standard "marker emitted but no content" explanation.
    expect(body).toMatch(/Report: \(empty body - FORK_REPORT marker emitted but no content/)
    // Transcript tail section header is present.
    expect(body).toMatch(/Transcript tail \(last 500 chars before marker\):/)
    // Actual tail content surfaces.
    expect(body).toContain('db_query SELECT count(*) FROM tenants')
    expect(body).toContain('result: 7')
    // No phantom-bail tag - this is path (a2), not path (b).
    expect(body).not.toMatch(/no_report_emitted=true/)
  })

  test('clean path - empty body with no transcriptTail uses (no transcript captured) placeholder', () => {
    // When the caller does not pass transcriptTail (older test seams, edge cases
    // where transcript was not captured), the diagnostic body still renders
    // gracefully with a (no transcript captured) placeholder so the parseable
    // shape stays consistent.
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_empty_no_tail',
      brief: 'b',
      report: '',
      nextStep: null,
      fallbackResult: null,
    })
    expect(body).toMatch(/empty_body=true/)
    expect(body).toMatch(/\(no transcript captured\)/)
  })

  test('clean path - empty body with long transcriptTail truncates to last 500 chars', () => {
    const longTail = 'A'.repeat(2000) + '_END_TAIL_'
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_empty_long_tail',
      brief: 'b',
      report: '',
      nextStep: null,
      fallbackResult: null,
      transcriptTail: longTail,
    })
    expect(body).toMatch(/empty_body=true/)
    expect(body).toContain('_END_TAIL_')
    expect(body).toMatch(/…A+_END_TAIL_/)
    // Hard size guarantee - body stays under 2KB even with multi-KB tail input.
    expect(body.length).toBeLessThan(2048)
  })

  test('phantom_bail path - emits no_report_emitted=true tag and tight body (<1KB)', () => {
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

  test('phantom_bail path - long brief is truncated to first 200 chars with ellipsis', () => {
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

  test('phantom_bail path - long transcript tail is truncated to last 500 chars with ellipsis prefix', () => {
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

  test('phantom_bail path - handles null fallbackResult without crashing', () => {
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

  test('phantom_bail path - handles empty-string fallbackResult', () => {
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
  test('clean path - SKIPS queue (duplicate-delivery gate, 7 May 2026 fork_mouuhla4_128a27)', async () => {
    // Pre-7-May-2026: clean reports were enqueued AND woken-on-done via the
    // forkComplete listener, producing the same body twice in one turn (queue
    // drain prepended via drainIntoDirectMessage + wake_on_done excerpt below
    // the separator). The duplicate-delivery gate skips the queue when report
    // is a non-empty string; wake_on_done becomes the sole conductor surface.
    // Tate verbatim 12:05 AEST 7 May 2026: "shouldnt be giving you the body
    // twice, once properly and that 2nd one in the chat, pretending to be my
    // message".
    // Doctrine: ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_001',
      brief: 'b',
      report: 'r',
      nextStep: null,
      fallbackResult: null,
    })

    expect(out).toEqual({
      enqueued: false,
      reason: 'clean_report_wake_on_done_sufficient',
      had_report: true,
    })
    // The mq must NOT have been called - that's the whole point of the gate.
    expect(mq.enqueueMessage).not.toHaveBeenCalled()
    expect(mq.enqueued).toHaveLength(0)
  })

  test('empty-body path - STILL enqueues (listener silent on empty body, queue is sole surface)', async () => {
    // forkComplete listener treats `result === ''` (marker emitted but no body)
    // as silent (forkComplete.js isEmpty branch). The queue path must remain
    // open for this case so the conductor still gets a diagnostic inbox row
    // surfacing the empty_body=true tag and (when available) transcript tail.
    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_empty',
      brief: 'b',
      report: '',
      nextStep: null,
      fallbackResult: null,
    })

    // had_report=true because the FORK_REPORT marker WAS emitted (report !== null).
    // The body was just empty; that is a separate diagnostic case from phantom-bail.
    expect(out).toEqual({ enqueued: true, had_report: true })
    expect(mq.enqueueMessage).toHaveBeenCalledTimes(1)
    expect(mq.enqueued[0].source).toBe('fork:fork_e_empty')
    expect(mq.enqueued[0].body).toMatch(/empty_body=true/)
  })

  test('phantom_bail path - STILL enqueues (the regression guard for the 2026-05-03 fix)', async () => {
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

  test('mq.enqueueMessage throws - returns enqueued=false but does not throw outward', async () => {
    // Uses phantom_bail (report=null) so the duplicate-delivery gate doesn't
    // short-circuit before the mq.enqueueMessage call. The throw-suppression
    // contract still applies: the success-path caller awaits this and must
    // not see a throw bubble out.
    const mq = {
      enqueueMessage: jest.fn(async () => { throw new Error('db dead') }),
    }
    forkService._setMessageQueueForTest(mq)

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_throws',
      brief: 'b',
      report: null,
      nextStep: null,
      fallbackResult: `${FALLBACK_MARKER}; last 0 chars)\n\n`,
    })

    expect(out.enqueued).toBe(false)
    expect(out.reason).toBe('enqueue_threw')
    expect(out.error).toBe('db dead')
    // Critical: the caller awaits this and must not see a throw.
    // (Queue failure must not take the fork into the outer catch error path.)
  })

  test('synth-report path - treated as clean (wake_on_done sufficient, NOT double-enqueued)', async () => {
    // Regression guard for the 14 May 2026 synthesis path (fork_mp529rfj_48564d).
    // A synth report is a non-null, non-empty string starting with SYNTH_MARKER.
    // _enqueueForkReport.isCleanReport = true for synth bodies, so wake_on_done
    // via forkComplete listener is the sole delivery surface. Enqueueing on top
    // would produce the same double-delivery that prompted the clean-report gate
    // in the first place (Tate verbatim 7 May 2026: "shouldnt be giving you the
    // body twice"). Doctrine: fork-error-events-do-not-surface-to-conductor-chat.md
    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const synthReport = `${SYNTH_MARKER} — fork closed without [FORK_REPORT] tag; final assistant turn used as body)\n\nAll 5 PM2 procs online. ecodia-api uptime 132min. No restarts needed.`

    const out = await forkService._enqueueForkReport({
      fork_id: 'fork_e_synth',
      brief: 'audit VPS health',
      report: synthReport,
      nextStep: 'verify fork artefacts on disk/DB — synthesised body may omit detail',
      fallbackResult: null,
    })

    // Synth report is a non-empty string: isCleanReport gate fires, queue skipped.
    expect(out).toEqual({
      enqueued: false,
      reason: 'clean_report_wake_on_done_sufficient',
      had_report: true,
    })
    expect(mq.enqueueMessage).not.toHaveBeenCalled()
    expect(mq.enqueued).toHaveLength(0)
  })

  test('exports the helpers for downstream callers / tests', () => {
    expect(typeof forkService._buildForkReportBody).toBe('function')
    expect(typeof forkService._enqueueForkReport).toBe('function')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('parser regex: same-line body capture (7 May 2026 root-cause fix)', () => {
  // Pure-function test of the regex — the same regex used at forkService.js
  // line ~952 to extract [FORK_REPORT] / [NEXT_STEP] from the assembled
  // transcript. Pre-fix the regex was `/\[FORK_REPORT\][^\n]*([\s\S]*?)…/i`
  // which greedily consumed the rest of the SAME LINE after the marker via
  // `[^\n]*`. The brief instructs the model to emit:
  //   `[FORK_REPORT] <one paragraph: what you did…>`
  // i.e. body content on the same line. The pre-fix parser stripped that
  // body. Phantom_bail rate over 7d at ship time: 246/661 = 37.2%.
  // Origin: Tate verbatim 11:44 AEST 7 May 2026, fork_moutrkyg_044204.
  // Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
  const REPORT_RE = /\[FORK_REPORT\]\s*([\s\S]*?)(?:\[NEXT_STEP\]|$)/i
  const NEXT_RE = /\[NEXT_STEP\]\s*([\s\S]*?)$/i

  function parse(text) {
    const r = text.match(REPORT_RE)
    const n = text.match(NEXT_RE)
    return {
      report: r ? r[1].trim() : null,
      nextStep: n ? n[1].trim() : null,
      reportMatched: !!r,
    }
  }

  test('same-line body: [FORK_REPORT] body content\\n[NEXT_STEP] next', () => {
    const text = '[FORK_REPORT] Built X. Pushed deadbeef. Tests 11/11 pass.\n[NEXT_STEP] Monitor next 5 turns.'
    const out = parse(text)
    expect(out.report).toBe('Built X. Pushed deadbeef. Tests 11/11 pass.')
    expect(out.nextStep).toBe('Monitor next 5 turns.')
  })

  test('multi-line body: marker on its own line, body on following lines', () => {
    const text = '[FORK_REPORT]\nBuilt X.\nPushed deadbeef.\n[NEXT_STEP]\nMerge it.'
    const out = parse(text)
    expect(out.report).toBe('Built X.\nPushed deadbeef.')
    expect(out.nextStep).toBe('Merge it.')
  })

  test('all-on-one-line: [FORK_REPORT] body [NEXT_STEP] next', () => {
    const text = '[FORK_REPORT] short body [NEXT_STEP] do thing'
    const out = parse(text)
    expect(out.report).toBe('short body')
    expect(out.nextStep).toBe('do thing')
  })

  test('body present, no NEXT_STEP', () => {
    const text = 'preamble narration\n[FORK_REPORT] just the body, nothing else.'
    const out = parse(text)
    expect(out.report).toBe('just the body, nothing else.')
    expect(out.nextStep).toBeNull()
  })

  test('marker emitted but truly no body and no NEXT_STEP', () => {
    const text = 'narration\n[FORK_REPORT]'
    const out = parse(text)
    expect(out.reportMatched).toBe(true)
    expect(out.report).toBe('')
  })

  test('marker emitted, body empty, NEXT_STEP present (the empty_body case)', () => {
    const text = '[FORK_REPORT]\n[NEXT_STEP] do thing'
    const out = parse(text)
    expect(out.reportMatched).toBe(true)
    expect(out.report).toBe('')
    expect(out.nextStep).toBe('do thing')
  })

  test('REGRESSION: pre-fix regex would have lost same-line body — confirm post-fix captures it', () => {
    // The exact production failure: model emits body on the same line as
    // marker. Pre-fix regex (`[^\n]*` after marker) consumed the body.
    // Post-fix regex (`\s*` after marker) preserves it.
    const PRE_FIX_RE = /\[FORK_REPORT\][^\n]*([\s\S]*?)(?:\[NEXT_STEP\]|$)/i
    const text = '[FORK_REPORT] real body content here\n[NEXT_STEP] next'

    const preFixMatch = text.match(PRE_FIX_RE)
    const preFixBody = preFixMatch ? preFixMatch[1].trim() : null
    expect(preFixBody).toBe('') // confirms the bug

    const postFixMatch = text.match(REPORT_RE)
    const postFixBody = postFixMatch ? postFixMatch[1].trim() : null
    expect(postFixBody).toBe('real body content here') // confirms the fix
  })

  test('typical real-world fork emission shape with multi-paragraph body', () => {
    const text = [
      'Some narration explaining what I did first.',
      '',
      '[FORK_REPORT] Built the feature. Migration 070 applied. Pushed commit abc123 to main. All 14 tests pass. Inbox 7 -> 3 unread.',
      '[NEXT_STEP] No action needed; verify deploy lands on Vercel.',
    ].join('\n')
    const out = parse(text)
    expect(out.report).toContain('Built the feature.')
    expect(out.report).toContain('commit abc123')
    expect(out.report).toContain('14 tests pass')
    expect(out.nextStep).toBe('No action needed; verify deploy lands on Vercel.')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('synth-report markers (14 May 2026, fork_mp529rfj_48564d)', () => {
  // Synthesis path: when a fork closes WITHOUT a [FORK_REPORT] tag but the final
  // assistant turn was a substantive natural-language summary, the post-loop
  // block in spawnFork now reuses that summary verbatim as the report body and
  // tags it SYNTH_MARKER. Phantom_bail detection (_isPhantomBail) keys off
  // FALLBACK_MARKER and must NOT match synth bodies. Conversely _isSynthReport
  // matches synth bodies and not phantom-bail bodies.
  //
  // Origin: Tate verbatim 15:40 AEST 14 May 2026 "would be great to figure out a
  // way for forks to NEVER phantom bail unless for some reason they should".
  // Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md

  test('SYNTH_MARKER and FALLBACK_MARKER are distinct prefixes', () => {
    expect(SYNTH_MARKER).toBeTruthy()
    expect(FALLBACK_MARKER).toBeTruthy()
    expect(SYNTH_MARKER).not.toBe(FALLBACK_MARKER)
    expect(SYNTH_MARKER.startsWith(FALLBACK_MARKER)).toBe(false)
    expect(FALLBACK_MARKER.startsWith(SYNTH_MARKER)).toBe(false)
  })

  test('_isPhantomBail returns false for synth bodies (key invariant)', () => {
    const synthBody = `${SYNTH_MARKER} — fork closed without [FORK_REPORT] tag; final assistant turn used as body)\n\nAll 5 PM2 procs online, ecodia-api 132min uptime`
    expect(_isPhantomBail(synthBody)).toBe(false)
    // And synth marker check fires.
    expect(_isSynthReport(synthBody)).toBe(true)
  })

  test('_isPhantomBail returns true for FALLBACK_MARKER bodies (unchanged)', () => {
    const fallbackBody = `${FALLBACK_MARKER}; last 500 chars of transcript follow)\n\ntail content`
    expect(_isPhantomBail(fallbackBody)).toBe(true)
    expect(_isSynthReport(fallbackBody)).toBe(false)
  })

  test('_isPhantomBail returns false for clean reports', () => {
    const cleanBody = 'Built X. Tests pass 11/11. Pushed deadbeef.'
    expect(_isPhantomBail(cleanBody)).toBe(false)
    expect(_isSynthReport(cleanBody)).toBe(false)
  })

  test('_buildForkReportBody clean path renders synth body verbatim (no phantom_bail tag)', () => {
    // When the spawnFork post-loop assigns report = `${SYNTH_MARKER}...` and
    // passes it into _buildForkReportBody as the `report` arg, the body shape
    // should look like a clean report (no no_report_emitted=true tag). The
    // synth prefix lives inside the report body itself for telemetry.
    const synthReport = `${SYNTH_MARKER} — fork closed without [FORK_REPORT] tag; final assistant turn used as body)\n\nAll 5 PM2 procs online. Backend at HEAD. FE prod-serves from Vercel.`
    const body = forkService._buildForkReportBody({
      fork_id: 'fork_test_synth_001',
      brief: 'audit VPS',
      report: synthReport,
      nextStep: 'verify fork artefacts on disk/DB — synthesised body may omit detail',
      fallbackResult: null,
    })
    // Must NOT carry phantom-bail tag.
    expect(body).not.toMatch(/no_report_emitted=true/)
    expect(body).not.toMatch(/empty_body=true/)
    // Synth marker survives inside the rendered report body.
    expect(body).toContain('synthesised from final assistant turn')
    // Original transcript content surfaces.
    expect(body).toContain('All 5 PM2 procs online')
    // Next step line renders.
    expect(body).toMatch(/Next step suggested: verify fork artefacts/)
  })

  test('forkPhantomBail.matcher would NOT classify synth as phantom_bail (downstream invariant)', () => {
    // The matcher at src/services/matchers/forkPhantomBail.js checks
    // event.data.report_head.startsWith('(no [FORK_REPORT] emitted'). We
    // simulate the report_head shape spawnFork publishes (see perceptionBus
    // .publish at line ~1309 of forkService.js).
    const synthReport = `${SYNTH_MARKER} — fork closed without [FORK_REPORT] tag; final assistant turn used as body)\n\nWork complete.`
    const reportHead = synthReport.slice(0, 200)
    // Replicate the matcher's gate exactly.
    const wouldClassify = reportHead.startsWith('(no [FORK_REPORT] emitted')
      || reportHead.includes('no_report_emitted=true')
    expect(wouldClassify).toBe(false)
  })

  test('forkPhantomBail.matcher DOES classify FALLBACK_MARKER body as phantom_bail (unchanged)', () => {
    const fallbackBody = `${FALLBACK_MARKER}; last 500 chars of transcript follow)\n\ntail content`
    const reportHead = fallbackBody.slice(0, 200)
    const wouldClassify = reportHead.startsWith('(no [FORK_REPORT] emitted')
      || reportHead.includes('no_report_emitted=true')
    expect(wouldClassify).toBe(true)
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
  // (the os_forks column writer) and forksRollup() - both unchanged.
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

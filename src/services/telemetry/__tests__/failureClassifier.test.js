/**
 * failureClassifier.test.js
 *
 * Phase D classifier unit tests.
 *
 * Test suites:
 *   - operational_failure short-circuit (8 May 2026, fork_mowxgocp_d29fa6)
 *   - success + unverified classification branches (2026-05-12, fork_mp1fxb9p_9c3390)
 *     Covers the Phase G critique #5 expansion: 93% of outcome_event was
 *     permanently NULL because Phase D only ran on failure/correction rows.
 *     Regression: all three new classes (usage_success_with_silent_doctrine,
 *     verified_clean, classification_deficit) must be reachable.
 *   - buildQueryText behaviour
 */

'use strict'

const {
  classifyOutcome,
  classifySuccessOutcome,
  classifyUnverifiedOutcome,
  buildQueryText,
} = require('../failureClassifier')

// Stub neo4jRetrieval so tests don't need a live Neo4j.
jest.mock('../../neo4jRetrieval', () => ({
  semanticSearch: jest.fn(async () => []),
}))
const neo4jRetrieval = require('../../neo4jRetrieval')

// Minimal pgClient stub: getDispatchTagState issues one query; return empty.
function makePgClient() {
  return {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  }
}

describe('failureClassifier - operational_failure short-circuit', () => {
  beforeEach(() => {
    neo4jRetrieval.semanticSearch.mockClear()
  })

  test('os_forks status=error short-circuits to operational_failure', async () => {
    const result = await classifyOutcome({
      outcome: {
        outcome: 'failure',
        evidence: 'os_forks.fork_id=fork_mows51f0_6c2a9b status=error',
        correction_text: null,
        dispatch_event_id: 'd-1',
      },
      dispatch: { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' },
      pgClient: makePgClient(),
    })
    expect(result.classification).toBe('operational_failure')
    expect(result.evidence.reason).toMatch(/operational-substrate/i)
    // Critically: must NOT have run semantic search.
    expect(neo4jRetrieval.semanticSearch).not.toHaveBeenCalled()
  })

  test('os_forks status=crashed short-circuits to operational_failure', async () => {
    const result = await classifyOutcome({
      outcome: {
        outcome: 'failure',
        evidence: 'os_forks.fork_id=fork_mowtlsvo_95bffd status=crashed',
        correction_text: null,
        dispatch_event_id: 'd-2',
      },
      dispatch: { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' },
      pgClient: makePgClient(),
    })
    expect(result.classification).toBe('operational_failure')
  })

  test('cc_sessions status=rejected short-circuits to operational_failure', async () => {
    const result = await classifyOutcome({
      outcome: {
        outcome: 'failure',
        evidence: 'cc_sessions.session_id=84ac1687 status=rejected',
        correction_text: null,
        dispatch_event_id: 'd-3',
      },
      dispatch: { action_type: 'factory_dispatch', tool_name: 'mcp__factory__start_cc_session' },
      pgClient: makePgClient(),
    })
    expect(result.classification).toBe('operational_failure')
  })

  test('outcome=correction with same evidence shape does NOT short-circuit', async () => {
    // Corrections always go through semantic search regardless of evidence.
    neo4jRetrieval.semanticSearch.mockResolvedValueOnce([])
    const result = await classifyOutcome({
      outcome: {
        outcome: 'correction',
        evidence: 'os_forks.fork_id=fork_xxx status=error',
        correction_text: 'You should have run the audit fork first',
        dispatch_event_id: 'd-4',
      },
      dispatch: { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' },
      pgClient: makePgClient(),
    })
    // No semantic match -> doctrine_failure (the existing behaviour).
    expect(result.classification).toBe('doctrine_failure')
    expect(neo4jRetrieval.semanticSearch).toHaveBeenCalled()
  })

  test('outcome=failure without operational evidence falls through to semantic search', async () => {
    // E.g. a hypothetical custom-evidence failure not from infra substrates.
    neo4jRetrieval.semanticSearch.mockResolvedValueOnce([])
    const result = await classifyOutcome({
      outcome: {
        outcome: 'failure',
        evidence: 'expected status_board row "X-completed" not found',
        correction_text: null,
        dispatch_event_id: 'd-5',
      },
      dispatch: { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' },
      pgClient: makePgClient(),
    })
    expect(result.classification).toBe('doctrine_failure')
    expect(neo4jRetrieval.semanticSearch).toHaveBeenCalled()
  })

  test('outcome=failure with correction_text bypasses short-circuit', async () => {
    // If Tate left a correction note on a fork failure, that's a real signal
    // and should run through the full classifier. Operational short-circuit
    // is for noise-only operational rows.
    neo4jRetrieval.semanticSearch.mockResolvedValueOnce([])
    const result = await classifyOutcome({
      outcome: {
        outcome: 'failure',
        evidence: 'os_forks.fork_id=fork_xxx status=error',
        correction_text: 'wrong fork brief, should have been a manager',
        dispatch_event_id: 'd-6',
      },
      dispatch: { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' },
      pgClient: makePgClient(),
    })
    expect(result.classification).toBe('doctrine_failure')
    expect(neo4jRetrieval.semanticSearch).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Phase D expansion: success + unverified classification branches
// (2026-05-12, fork_mp1fxb9p_9c3390)
//
// Regression: all three new classes must be reachable via the new branches.
// These tests use a minimal pgClient stub that controls what
// getDispatchTagState returns so no live Postgres is needed.
// ---------------------------------------------------------------------------

describe('failureClassifier - classifySuccessOutcome (Phase D expansion)', () => {
  /**
   * Build a minimal pgClient stub whose surface_event query returns the given
   * rows. getDispatchTagState issues exactly one query with 4 columns:
   * pattern_path, applied, tagged_silent, was_false_positive, id (app_id).
   */
  function makePgClientWithSurface(surfaceRows) {
    return {
      query: jest.fn(async () => ({
        rows: surfaceRows,
        rowCount: surfaceRows.length,
      })),
    }
  }

  test('success with silently-ignored pattern -> usage_success_with_silent_doctrine', async () => {
    // Surface event exists; no application_event row (app_id=null, tagged_silent defaults null)
    // -> silent set is non-empty -> usage_success_with_silent_doctrine
    const pgClient = makePgClientWithSurface([
      {
        pattern_path: '~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md',
        applied: null,
        tagged_silent: null,
        was_false_positive: false,
        app_id: null, // no application_event row -> silent
      },
    ])
    const result = await classifySuccessOutcome({
      outcome: {
        id: 'o-success-1',
        dispatch_event_id: 'd-success-1',
        outcome: 'success',
        evidence: null,
        correction_text: null,
      },
      pgClient,
    })
    expect(result.classification).toBe('usage_success_with_silent_doctrine')
    expect(result.evidence.silent).toContain(
      '~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md'
    )
    expect(result.evidence.reason).toMatch(/silently-ignored/i)
  })

  test('success with tagged_silent=true on application_event -> usage_success_with_silent_doctrine', async () => {
    const pgClient = makePgClientWithSurface([
      {
        pattern_path: '~/ecodiaos/patterns/decide-do-not-ask.md',
        applied: false,
        tagged_silent: true,
        was_false_positive: false,
        app_id: 'ae-100',
      },
    ])
    const result = await classifySuccessOutcome({
      outcome: {
        id: 'o-success-2',
        dispatch_event_id: 'd-success-2',
        outcome: 'success',
        evidence: null,
        correction_text: null,
      },
      pgClient,
    })
    expect(result.classification).toBe('usage_success_with_silent_doctrine')
  })

  test('success with all patterns explicitly applied -> verified_clean', async () => {
    const pgClient = makePgClientWithSurface([
      {
        pattern_path: '~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md',
        applied: true,
        tagged_silent: false,
        was_false_positive: false,
        app_id: 'ae-200',
      },
    ])
    const result = await classifySuccessOutcome({
      outcome: {
        id: 'o-success-3',
        dispatch_event_id: 'd-success-3',
        outcome: 'success',
        evidence: null,
        correction_text: null,
      },
      pgClient,
    })
    expect(result.classification).toBe('verified_clean')
    expect(result.evidence.silent).toHaveLength(0)
    expect(result.evidence.reason).toMatch(/applied/i)
  })

  test('success with no surfaced patterns at all -> verified_clean', async () => {
    // No surface_event rows for this dispatch -> all sets empty -> verified_clean
    const pgClient = makePgClientWithSurface([])
    const result = await classifySuccessOutcome({
      outcome: {
        id: 'o-success-4',
        dispatch_event_id: null,
        outcome: 'success',
        evidence: null,
        correction_text: null,
      },
      pgClient,
    })
    expect(result.classification).toBe('verified_clean')
    expect(result.evidence.surfaced).toHaveLength(0)
  })

  test('was_false_positive=true row is excluded from silent set -> verified_clean', async () => {
    // was_false_positive=true should NOT count toward silent; surface is FP
    const pgClient = makePgClientWithSurface([
      {
        pattern_path: '~/ecodiaos/patterns/some-pattern.md',
        applied: null,
        tagged_silent: null,
        was_false_positive: true,
        app_id: null,
      },
    ])
    const result = await classifySuccessOutcome({
      outcome: {
        id: 'o-success-5',
        dispatch_event_id: 'd-success-5',
        outcome: 'success',
        evidence: null,
        correction_text: null,
      },
      pgClient,
    })
    // FP row excluded from silent -> no silent doctrine -> verified_clean
    expect(result.classification).toBe('verified_clean')
  })
})

describe('failureClassifier - classifyUnverifiedOutcome (Phase D expansion)', () => {
  test('unverified outcome older than 24h -> classification_deficit', () => {
    const oldTs = new Date(Date.now() - 30 * 3600 * 1000).toISOString() // 30h ago
    const result = classifyUnverifiedOutcome({
      id: 'o-unverified-1',
      dispatch_event_id: 'd-unverified-1',
      outcome: 'unverified',
      evidence: null,
      correction_text: null,
      ts: oldTs,
    })
    expect(result.classification).toBe('classification_deficit')
    expect(result.evidence.reason).toMatch(/unverified/i)
    expect(result.evidence.reason).toMatch(/classification_deficit/i)
  })

  test('classification_deficit has empty surface/applied/silent arrays', () => {
    const result = classifyUnverifiedOutcome({
      id: 'o-unverified-2',
      dispatch_event_id: null,
      outcome: 'unverified',
      evidence: null,
      correction_text: null,
      ts: null,
    })
    expect(result.classification).toBe('classification_deficit')
    expect(result.evidence.surfaced).toEqual([])
    expect(result.evidence.applied).toEqual([])
    expect(result.evidence.silent).toEqual([])
  })
})

describe('failureClassifier - all 3 outcome classes reachable (regression)', () => {
  /**
   * Verify that the three new classes introduced in the Phase D expansion
   * (usage_success_with_silent_doctrine, verified_clean, classification_deficit)
   * are ALL reachable via the exported functions — i.e. no branch is dead code.
   * This is the "synthetic regression test covering all 3 classes" required
   * by the brief (fork_mp1fxb9p_9c3390).
   */
  test('usage_success_with_silent_doctrine is reachable', async () => {
    const pgClient = {
      query: jest.fn(async () => ({
        rows: [{
          pattern_path: '/some/pattern.md',
          applied: null,
          tagged_silent: null,
          was_false_positive: false,
          app_id: null,
        }],
        rowCount: 1,
      })),
    }
    const r = await classifySuccessOutcome({
      outcome: { id: 'x', dispatch_event_id: 'dx', outcome: 'success', ts: new Date().toISOString() },
      pgClient,
    })
    expect(r.classification).toBe('usage_success_with_silent_doctrine')
  })

  test('verified_clean is reachable', async () => {
    const pgClient = {
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    }
    const r = await classifySuccessOutcome({
      outcome: { id: 'y', dispatch_event_id: 'dy', outcome: 'success', ts: new Date().toISOString() },
      pgClient,
    })
    expect(r.classification).toBe('verified_clean')
  })

  test('classification_deficit is reachable', () => {
    const r = classifyUnverifiedOutcome({
      id: 'z',
      dispatch_event_id: 'dz',
      outcome: 'unverified',
      ts: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    })
    expect(r.classification).toBe('classification_deficit')
  })
})

describe('failureClassifier.buildQueryText', () => {
  test('failure rows include evidence as primary semantic signal', () => {
    const q = buildQueryText(
      {
        outcome: 'failure',
        evidence: 'os_forks.fork_id=X status=error',
        correction_text: null,
      },
      {
        action_type: 'fork_spawn',
        tool_name: 'mcp__forks__spawn_fork',
      }
    )
    // Evidence should appear BEFORE the action/tool keys so it dominates.
    expect(q.indexOf('os_forks')).toBeLessThan(q.indexOf('action: fork_spawn'))
  })

  test('correction_text takes precedence over evidence when both present', () => {
    const q = buildQueryText(
      {
        outcome: 'correction',
        evidence: 'os_forks.fork_id=X status=error',
        correction_text: "you should have done X",
      },
      { action_type: 'fork_spawn', tool_name: 'mcp__forks__spawn_fork' }
    )
    expect(q).toMatch(/^you should have done X/)
  })
})

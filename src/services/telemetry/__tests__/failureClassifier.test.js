/**
 * failureClassifier.test.js
 *
 * Phase D classifier unit tests. Focus: 8 May 2026 fix for single-class
 * collapse where every fork-failure outcome was mis-classified as
 * surfacing_failure. The fix introduces an `operational_failure` short-circuit
 * for fork/Factory infra failures BEFORE semantic search.
 *
 * Origin: Phase G adversarial audit critique #2 (fork_mowxgocp_d29fa6).
 */

'use strict'

const { classifyOutcome, buildQueryText } = require('../failureClassifier')

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

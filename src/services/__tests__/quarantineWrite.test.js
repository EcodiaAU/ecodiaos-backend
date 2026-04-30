'use strict'

/**
 * Tests for §2.5 quarantine routing in
 * src/services/knowledgeGraphService.js (writeQuarantined) and
 * src/services/neo4jRetrieval.js (fusedSearch quarantine filter).
 *
 * The Neo4j driver is mocked at the config/neo4j layer so these run
 * without a live DB.
 *
 * Covers:
 *   - writeQuarantined applies the Quarantined* prefix to the label
 *   - writeQuarantined records provenance properties on the node
 *   - writeQuarantined throws when provenance is missing
 *   - writeQuarantined throws when label is not Pattern or Decision
 *   - fusedSearch (semanticSearch leg) injects the quarantine filter
 *     by default
 *   - fusedSearch with includeQuarantined: true does NOT inject the
 *     filter (opt-in)
 *   - keywordSearch quarantine filter
 *   - getRecentHighPriorityNodes quarantine filter
 */

const path = require('path')

// ─── Mock neo4j config ──────────────────────────────────────────────

const _runWriteCalls = []
const _runQueryCalls = []

jest.mock('../../config/neo4j', () => ({
  runWrite: jest.fn((cypher, params) => {
    _runWriteCalls.push({ cypher, params })
    // Return a single record with a `node` accessor so ensureNode's
    // post-processing doesn't blow up.
    return Promise.resolve([{
      get: (key) => {
        if (key === 'n') {
          return {
            properties: {
              ...((params || {}).props || {}),
              name: (params || {}).name,
            },
          }
        }
        return null
      },
    }])
  }),
  runQuery: jest.fn((cypher, params) => {
    _runQueryCalls.push({ cypher, params })
    return Promise.resolve([])
  }),
  healthCheck: jest.fn(() => Promise.resolve(true)),
}))

// neo4jRetrieval imports neo4j-driver for `neo4j.int(...)`. Provide
// a passthrough so tests don't pull in the real driver.
jest.mock('neo4j-driver', () => ({
  int: (n) => n,
}))

// embedText calls OpenAI; stub the env so it short-circuits to null
// (no embedding -> no vector query, but we are testing filter
// composition, not the vector index path).
jest.mock('../../config/env', () => ({
  NEO4J_URI: 'bolt://localhost:7687',
  OPENAI_API_KEY: 'sk-test',
  KG_INGESTION_DEDUP_WINDOW_MS: '600000',
  KG_MAX_INGESTIONS_PER_MIN: '0',
  KG_INGESTION_DEDUP_MAP_SIZE: '500',
  KG_CONTEXT_MAX_SEEDS: '15',
  KG_CONTEXT_MAX_DEPTH: '5',
  KG_CONTEXT_MIN_SIMILARITY: '0.4',
}))

// Mock axios so any embedding call returns a fixed vector quickly.
jest.mock('axios', () => ({
  post: jest.fn(() => Promise.resolve({
    data: { data: [{ embedding: new Array(1536).fill(0.1) }] },
  })),
}))

// ─── SUT ────────────────────────────────────────────────────────────

const { writeQuarantined } = require('../knowledgeGraphService')
const { runWrite, runQuery } = require('../../config/neo4j')
const neo4jRetrieval = require('../neo4jRetrieval')

beforeEach(() => {
  _runWriteCalls.length = 0
  _runQueryCalls.length = 0
  runWrite.mockClear()
  runQuery.mockClear()
})

describe('writeQuarantined', () => {
  const validProvenance = {
    source: 'email',
    session_id: 'sess_abc',
    trigger: 'emailArrival',
    external_actor: 'someone@example.com',
  }

  test('applies the Quarantined prefix to a Pattern label', async () => {
    await writeQuarantined({
      label: 'Pattern',
      name: 'test-pattern',
      provenance: validProvenance,
    })
    expect(_runWriteCalls).toHaveLength(1)
    const { cypher } = _runWriteCalls[0]
    expect(cypher).toContain('`QuarantinedPattern`')
  })

  test('applies the Quarantined prefix to a Decision label', async () => {
    await writeQuarantined({
      label: 'Decision',
      name: 'test-decision',
      provenance: validProvenance,
    })
    const { cypher } = _runWriteCalls[0]
    expect(cypher).toContain('`QuarantinedDecision`')
  })

  test('records provenance properties on the node', async () => {
    await writeQuarantined({
      label: 'Pattern',
      name: 'p1',
      provenance: validProvenance,
    })
    const { params } = _runWriteCalls[0]
    expect(params.props).toMatchObject({
      provenance_source: 'email',
      provenance_session_id: 'sess_abc',
      provenance_trigger: 'emailArrival',
      provenance_external_actor: 'someone@example.com',
    })
  })

  test('records provenance even when external_actor is omitted', async () => {
    const partial = { source: 'cowork_inbox', session_id: 's1', trigger: 'cowork.dispatch' }
    await writeQuarantined({
      label: 'Pattern',
      name: 'p2',
      provenance: partial,
    })
    const { params } = _runWriteCalls[0]
    expect(params.props.provenance_source).toBe('cowork_inbox')
    expect(params.props.provenance_session_id).toBe('s1')
    expect(params.props.provenance_trigger).toBe('cowork.dispatch')
    expect(params.props.provenance_external_actor).toBeUndefined()
  })

  test('throws when provenance is missing entirely', async () => {
    await expect(writeQuarantined({
      label: 'Pattern',
      name: 'p3',
    })).rejects.toThrow(/provenance is required/)
  })

  test('throws when provenance is not an object', async () => {
    await expect(writeQuarantined({
      label: 'Pattern',
      name: 'p4',
      provenance: 'cowork',
    })).rejects.toThrow(/provenance is required/)
  })

  test('throws when provenance is missing source', async () => {
    await expect(writeQuarantined({
      label: 'Pattern',
      name: 'p5',
      provenance: { session_id: 's', trigger: 't' },
    })).rejects.toThrow(/must contain source, session_id, trigger/)
  })

  test('throws when provenance is missing session_id', async () => {
    await expect(writeQuarantined({
      label: 'Pattern',
      name: 'p6',
      provenance: { source: 'email', trigger: 't' },
    })).rejects.toThrow(/must contain source, session_id, trigger/)
  })

  test('throws when provenance is missing trigger', async () => {
    await expect(writeQuarantined({
      label: 'Pattern',
      name: 'p7',
      provenance: { source: 'email', session_id: 's' },
    })).rejects.toThrow(/must contain source, session_id, trigger/)
  })

  test('throws when label is not Pattern or Decision', async () => {
    await expect(writeQuarantined({
      label: 'Episode',
      name: 'ep',
      provenance: validProvenance,
    })).rejects.toThrow(/only Pattern and Decision support quarantine routing/)

    await expect(writeQuarantined({
      label: 'Reflection',
      name: 'r',
      provenance: validProvenance,
    })).rejects.toThrow(/only Pattern and Decision support quarantine routing/)
  })
})

describe('neo4jRetrieval quarantine filter', () => {
  test('semanticSearch injects the quarantine filter by default', async () => {
    await neo4jRetrieval.semanticSearch('test query', { labels: ['Pattern'] })
    expect(_runQueryCalls.length).toBeGreaterThan(0)
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).toMatch(/NOT node:QuarantinedPattern/)
    expect(cypher).toMatch(/NOT node:QuarantinedDecision/)
  })

  test('semanticSearch with includeQuarantined: true does NOT inject the filter', async () => {
    await neo4jRetrieval.semanticSearch('test query', {
      labels: ['Pattern'],
      includeQuarantined: true,
    })
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).not.toMatch(/QuarantinedPattern/)
    expect(cypher).not.toMatch(/QuarantinedDecision/)
  })

  test('keywordSearch via _internal injects the quarantine filter by default', async () => {
    await neo4jRetrieval._internal.keywordSearch('looking for problem stuff', {
      labels: ['Pattern'],
    })
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).toMatch(/NOT n:QuarantinedPattern/)
    expect(cypher).toMatch(/NOT n:QuarantinedDecision/)
  })

  test('keywordSearch with includeQuarantined: true does NOT inject the filter', async () => {
    await neo4jRetrieval._internal.keywordSearch('looking for problem stuff', {
      labels: ['Pattern'],
      includeQuarantined: true,
    })
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).not.toMatch(/QuarantinedPattern/)
    expect(cypher).not.toMatch(/QuarantinedDecision/)
  })

  test('getRecentHighPriorityNodes injects the quarantine filter by default', async () => {
    await neo4jRetrieval.getRecentHighPriorityNodes({ days: 7, labels: ['Pattern'] })
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).toMatch(/NOT n:QuarantinedPattern/)
    expect(cypher).toMatch(/NOT n:QuarantinedDecision/)
  })

  test('getRecentHighPriorityNodes with includeQuarantined: true does NOT inject the filter', async () => {
    await neo4jRetrieval.getRecentHighPriorityNodes({
      days: 7,
      labels: ['Pattern'],
      includeQuarantined: true,
    })
    const { cypher } = _runQueryCalls[_runQueryCalls.length - 1]
    expect(cypher).not.toMatch(/QuarantinedPattern/)
    expect(cypher).not.toMatch(/QuarantinedDecision/)
  })

  test('fusedSearch propagates includeQuarantined down to both legs', async () => {
    await neo4jRetrieval.fusedSearch('test query', {
      labels: ['Pattern'],
      includeQuarantined: true,
    })
    // Look at every Cypher call made during fusedSearch - none should
    // contain the quarantine filter.
    const allCypher = _runQueryCalls.map(c => c.cypher).join('\n')
    expect(allCypher).not.toMatch(/QuarantinedPattern/)
    expect(allCypher).not.toMatch(/QuarantinedDecision/)
  })
})

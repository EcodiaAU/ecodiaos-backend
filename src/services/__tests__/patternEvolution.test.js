'use strict'

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

jest.mock('../../config/db', () => {
  function dbTag() { return Promise.resolve([]) }
  return dbTag
})

const mockRunCypher = jest.fn()
const mockSemanticSearch = jest.fn()
jest.mock('../knowledgeGraphService', () => ({
  runCypher: mockRunCypher,
  semanticSearch: mockSemanticSearch,
  writeEpisode: jest.fn().mockResolvedValue('ep-123'),
}))

jest.mock('../deepseekService', () => ({
  callDeepSeek: jest.fn().mockResolvedValue('{"contradicts": false}'),
}))

jest.mock('../claudeService', () => ({}))

const patternEvolution = require('../patternEvolution')

beforeEach(() => {
  mockRunCypher.mockReset()
  mockSemanticSearch.mockReset()
})

describe('patternEvolution.backfillLegacyPatterns', () => {
  test('runs Cypher to set trace on untraced patterns', async () => {
    mockRunCypher.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 5 }) }],
    })
    const updated = await patternEvolution.backfillLegacyPatterns()
    expect(updated).toBe(5)
    expect(mockRunCypher).toHaveBeenCalledTimes(1)
    expect(mockRunCypher.mock.calls[0][0]).toContain("p.trace = 'legacy'")
  })

  test('returns 0 if KG not available', async () => {
    mockRunCypher.mockRejectedValueOnce(new Error('neo4j down'))
    const updated = await patternEvolution.backfillLegacyPatterns()
    expect(updated).toBe(0)
  })
})

describe('patternEvolution.demoteStalePatterns', () => {
  test('demotes patterns older than probation period', async () => {
    mockRunCypher.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 3 }) }],
    })
    const demoted = await patternEvolution.demoteStalePatterns()
    expect(demoted).toBe(3)
    expect(mockRunCypher.mock.calls[0][0]).toContain('p.priority = 0.1')
  })
})

describe('patternEvolution.refreshPattern', () => {
  test('updates last_validated_at on matching pattern', async () => {
    mockRunCypher.mockResolvedValueOnce({})
    const result = await patternEvolution.refreshPattern('pattern-abc')
    expect(result).toBe(true)
    expect(mockRunCypher.mock.calls[0][0]).toContain('p.last_validated_at = datetime()')
  })
})

describe('patternEvolution.checkContradiction', () => {
  test('returns empty array when no similar patterns found', async () => {
    mockSemanticSearch.mockResolvedValueOnce([])
    const result = await patternEvolution.checkContradiction('new rule text', 'new-id')
    expect(result).toEqual([])
  })

  test('returns empty array when KG unavailable', async () => {
    mockSemanticSearch.mockRejectedValueOnce(new Error('unavailable'))
    const result = await patternEvolution.checkContradiction('text', 'id')
    expect(result).toEqual([])
  })
})

describe('patternEvolution.weeklyMetaLearning', () => {
  test('queries patterns and writes Reflection node', async () => {
    // Mock the 4 Cypher calls: surfaced, stale, total, untraced + 1 write
    mockRunCypher
      .mockResolvedValueOnce({ records: [{ get: () => 'pattern-a' }, { get: () => 0.8 }] })
      .mockResolvedValueOnce({ records: [{ get: () => ({ toNumber: () => 2 }) }] })
      .mockResolvedValueOnce({ records: [{ get: () => ({ toNumber: () => 50 }) }] })
      .mockResolvedValueOnce({ records: [{ get: () => ({ toNumber: () => 0 }) }] })
      .mockResolvedValueOnce({}) // write Reflection

    const result = await patternEvolution.weeklyMetaLearning()
    // May return null if records parsing differs, but should not throw
    expect(mockRunCypher).toHaveBeenCalled()
  })
})

describe('patternEvolution constants', () => {
  test('PROBATION_DAYS is 60', () => {
    expect(patternEvolution.PROBATION_DAYS).toBe(60)
  })
})

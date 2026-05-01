'use strict'

/**
 * Tests for tokenBudget — priority-tiered allocator with per-block caps
 * and FIFO truncation for history-tail blocks.
 *
 * Covers (from PROMPT_ASSEMBLY_SPEC §3.4 + §8.1-8.2):
 *   - estimateTokens uses a ~4-chars/token approximation, over-estimating
 *   - Critical blocks always survive even if they'd push past budget
 *   - High-priority blocks respect per-block caps
 *   - Medium-priority blocks get what's left after high
 *   - Low-priority history shrinks via FIFO truncation
 *   - Block shrinker callbacks are honoured when provided
 *   - Oversized input: total stays under budget; critical sections preserved
 */

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

const {
  PRIORITY,
  CHARS_PER_TOKEN,
  estimateTokens,
  truncateFifo,
  allocate,
} = require('../tokenBudget')

describe('estimateTokens', () => {
  test('empty returns 0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
    expect(estimateTokens(undefined)).toBe(0)
  })
  test('rounds up by CHARS_PER_TOKEN', () => {
    expect(estimateTokens('x'.repeat(1))).toBe(1)
    expect(estimateTokens('x'.repeat(4))).toBe(1)
    expect(estimateTokens('x'.repeat(5))).toBe(2)
    expect(estimateTokens('x'.repeat(1000))).toBe(Math.ceil(1000 / CHARS_PER_TOKEN))
  })
  test('is deliberately an over-estimate vs real tokenizer', () => {
    // Typical English prose is ~4.5 chars/token; using 4 gives us a safety margin.
    // (Not asserted as a measurement; asserting the direction of the rule.)
    const prose = 'The quick brown fox jumps over the lazy dog, repeatedly.'
    const estimate = estimateTokens(prose)
    expect(estimate).toBeGreaterThan(prose.length / 5)  // conservative upper estimate
  })
})

describe('truncateFifo', () => {
  const exchanges = [
    'USER: first\nASSISTANT: reply 1',
    'USER: second\nASSISTANT: reply 2',
    'USER: third\nASSISTANT: reply 3',
  ]
  const wrapped = `<recent_exchanges>\n${exchanges.join('\n\n---\n\n')}\n</recent_exchanges>`

  test('returns original when within budget', () => {
    expect(truncateFifo(wrapped, 10000)).toBe(wrapped)
  })

  test('drops oldest exchanges first', () => {
    // Budget of 25 tokens (100 chars) covers tags (~10 tokens) + the newest
    // exchange (~8 tokens), leaving no room for older ones.
    const result = truncateFifo(wrapped, 25)
    // Oldest (USER: first) should be gone; newest (USER: third) should remain.
    expect(result).not.toMatch(/first/)
    expect(result).toMatch(/third/)
  })

  test('preserves leading/trailing tags', () => {
    const result = truncateFifo(wrapped, 25)
    expect(result.startsWith('<recent_exchanges>')).toBe(true)
    expect(result.endsWith('</recent_exchanges>')).toBe(true)
  })

  test('budget of 0 returns empty wrapped block', () => {
    const result = truncateFifo(wrapped, 0)
    expect(result).toBe('<recent_exchanges></recent_exchanges>')
  })

  test('handles text without tags', () => {
    const bare = exchanges.join('\n\n---\n\n')
    const result = truncateFifo(bare, 15)
    expect(result).not.toMatch(/first/)
    expect(result).toMatch(/third/)
  })

  test('empty input returns empty', () => {
    expect(truncateFifo('', 1000)).toBe('')
    expect(truncateFifo(null, 1000)).toBe('')
  })
})

describe('allocate', () => {
  const kb = (n) => 'x'.repeat(n * 1000)  // n KB of junk text

  test('empty candidates → empty output', () => {
    expect(allocate([])).toEqual({ allocated: [], dropped: [], totalTokens: 0, overflow: false })
  })

  test('everything fits → all emitted in priority order', () => {
    const cands = [
      { name: 'relevant_memory', priority: PRIORITY.MEDIUM, text: 'short mem' },
      { name: 'now', priority: PRIORITY.CRITICAL, text: '<now>t</now>' },
      { name: 'forks_rollup', priority: PRIORITY.HIGH, text: 'forks' },
    ]
    const result = allocate(cands, { budget: 60000 })
    expect(result.allocated.map(a => a.name)).toEqual(['now', 'forks_rollup', 'relevant_memory'])
    expect(result.dropped).toEqual([])
    expect(result.overflow).toBe(false)
  })

  test('critical sections always survive even if they overflow budget', () => {
    const cands = [
      { name: 'now', priority: PRIORITY.CRITICAL, text: kb(20) },  // 5K tokens
      { name: 'restart_recovery', priority: PRIORITY.CRITICAL, text: kb(30) }, // 7.5K tokens
      { name: 'relevant_memory', priority: PRIORITY.MEDIUM, text: kb(10) },
    ]
    const result = allocate(cands, { budget: 5000 })  // smaller than critical combined
    expect(result.allocated.map(a => a.name)).toEqual(expect.arrayContaining(['now', 'restart_recovery']))
    expect(result.overflow).toBe(true)
    // Medium-tier memory should be dropped since critical consumed the whole budget.
    const hasMem = result.allocated.some(a => a.name === 'relevant_memory')
    expect(hasMem).toBe(false)
  })

  test('per-block cap clips oversized high-priority block', () => {
    const cands = [
      { name: 'forks_rollup', priority: PRIORITY.HIGH, text: kb(10) },  // 2500 tokens
    ]
    const result = allocate(cands, { budget: 60000 })
    expect(result.allocated[0].name).toBe('forks_rollup')
    // forks_rollup cap is 1000 tokens → truncated.
    expect(result.allocated[0].tokens).toBeLessThanOrEqual(1000)
  })

  test('relevant_memory respects its 4K cap', () => {
    const cands = [
      { name: 'relevant_memory', priority: PRIORITY.MEDIUM, text: kb(30) },  // 7500 tokens
    ]
    const result = allocate(cands, { budget: 60000 })
    expect(result.allocated[0].tokens).toBeLessThanOrEqual(4000)
  })

  test('recent_exchanges shrinks via FIFO when over budget', () => {
    const exchanges = Array.from({ length: 20 }, (_, i) => `USER: msg${i}\nASSISTANT: reply${i}`)
    const text = `<recent_exchanges>\n${exchanges.join('\n\n---\n\n')}\n</recent_exchanges>`
    const cands = [
      { name: 'recent_exchanges', priority: PRIORITY.LOW, text },
    ]
    const result = allocate(cands, { budget: 50 })
    const keptText = result.allocated[0].text
    // Newest ('msg19') must remain; oldest ('msg0') dropped.
    expect(keptText).toMatch(/msg19/)
    expect(keptText).not.toMatch(/msg0\b/)
  })

  test('custom shrink callback is honoured', () => {
    const shrink = jest.fn((target) => '[SHRUNK TO ' + target + ']')
    const cands = [
      { name: 'doctrine_surface', priority: PRIORITY.HIGH, text: kb(50), shrink },
    ]
    const result = allocate(cands, { budget: 60000 })
    expect(shrink).toHaveBeenCalled()
    expect(result.allocated[0].text).toMatch(/SHRUNK/)
  })

  test('oversized input: total stays under budget; critical preserved', () => {
    const cands = [
      { name: 'now', priority: PRIORITY.CRITICAL, text: '<now>2026-05-01</now>' },  // tiny
      { name: 'doctrine_surface', priority: PRIORITY.HIGH, text: kb(200) },
      { name: 'forks_rollup', priority: PRIORITY.HIGH, text: kb(50) },
      { name: 'relevant_memory', priority: PRIORITY.MEDIUM, text: kb(100) },
      { name: 'recent_exchanges', priority: PRIORITY.LOW, text: kb(500) },
    ]
    const result = allocate(cands, { budget: 30000 })
    // Critical survives
    expect(result.allocated.some(a => a.name === 'now')).toBe(true)
    // Total under budget (or at exactly budget; critical-overflow is a separate path)
    expect(result.totalTokens).toBeLessThanOrEqual(30000)
  })

  test('low-priority blocks dropped when no budget remains', () => {
    const cands = [
      // Critical eats the whole budget
      { name: 'now', priority: PRIORITY.CRITICAL, text: kb(200) },  // 50K tokens
      { name: 'recent_exchanges', priority: PRIORITY.LOW, text: kb(50) },
    ]
    const result = allocate(cands, { budget: 40000 })
    expect(result.overflow).toBe(true)
    expect(result.dropped).toContain('recent_exchanges')
  })

  test('empty / null text candidates are filtered out', () => {
    const cands = [
      { name: 'empty1', priority: PRIORITY.HIGH, text: '' },
      { name: 'empty2', priority: PRIORITY.MEDIUM, text: null },
      { name: 'real', priority: PRIORITY.CRITICAL, text: 'x' },
    ]
    const result = allocate(cands, { budget: 1000 })
    expect(result.allocated.map(a => a.name)).toEqual(['real'])
  })

  test('throws on non-array input', () => {
    expect(() => allocate('not an array')).toThrow(TypeError)
    expect(() => allocate(null)).toThrow(TypeError)
  })

  test('unknown priority treated as low', () => {
    const cands = [
      { name: 'weird', priority: 'urgent', text: 'some text' },
      { name: 'crit', priority: PRIORITY.CRITICAL, text: 'c' },
    ]
    const result = allocate(cands, { budget: 1000 })
    // Critical emits first regardless of input order
    expect(result.allocated[0].name).toBe('crit')
    expect(result.allocated[1].name).toBe('weird')
  })
})

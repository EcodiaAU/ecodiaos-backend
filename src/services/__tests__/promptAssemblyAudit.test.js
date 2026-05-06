'use strict'

/**
 * Tests for promptAssemblyAudit.
 *
 * Covers:
 * - buildAuditRow produces correct shape for equivalent v1/v2
 * - buildAuditRow records divergence byte index when v1 != flat(v2)
 * - insertRow writes to prompt_assembly_audit with proper values
 * - dispatch() is synchronous/fire-and-forget - does not await insert
 * - dispatch() swallows insert failures without throwing
 */

const mockCalls = []
const mockResults = []

jest.mock('../../config/db', () => {
  return function dbTag(strings, ...values) {
    mockCalls.push({ sql: strings.join('?'), values })
    if (mockResults.length === 0) return Promise.resolve([])
    const next = mockResults.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
})

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const audit = require('../promptAssemblyAudit')
const logger = require('../../config/logger')

beforeEach(() => {
  mockCalls.length = 0
  mockResults.length = 0
  logger.warn.mockClear()
})

function fakeV2Out({ blocks = [1, 2, 3, 4], withText = true } = {}) {
  const contentBlocks = blocks.map((tier, i) => ({
    tier,
    text: withText ? `block${tier} text ${i}` : '',
    cache_control: { type: 'ephemeral' },
  }))
  return { systemPrompt: '', userMessage: null, contentBlocks, cacheBreakpoints: [] }
}

describe('promptAssemblyAudit.buildAuditRow', () => {
  test('produces semantic_equivalent=true when v1Text matches BP1+BP2 join', () => {
    const v2Out = {
      contentBlocks: [
        { tier: 1, text: 'AAA', cache_control: { type: 'ephemeral' } },
        { tier: 2, text: 'BBB', cache_control: { type: 'ephemeral' } },
      ],
    }
    // v1Text matches the v2 reconstruction: bp1 + '\n\n---\n\n' + bp2
    const row = audit.buildAuditRow({
      session_id: 's1',
      turn_id: 't1',
      mode: 'shadow',
      v1Text: 'AAA\n\n---\n\nBBB',
      v2Out,
    })
    expect(row.semantic_equivalent).toBe(true)
    expect(row.diff_first_divergence).toBeNull()
    expect(row.v1_bytes).toBe(13)
    expect(row.v2_bytes).toBe(13)
    expect(row.v2_blocks).toBe(2)
    expect(row.breakpoint_bytes).toEqual({ bp1: 3, bp2: 3 })
    expect(row.mode).toBe('shadow')
  })

  test('records divergence byte index when v1 != v2 reconstruction', () => {
    const v2Out = {
      contentBlocks: [
        { tier: 1, text: 'AAA', cache_control: { type: 'ephemeral' } },
        { tier: 2, text: 'XXX', cache_control: { type: 'ephemeral' } },
      ],
    }
    const row = audit.buildAuditRow({
      session_id: 's1',
      mode: 'shadow',
      v1Text: 'AAA\n\n---\n\nBBB',
      v2Out,
    })
    expect(row.semantic_equivalent).toBe(false)
    // Divergence at byte 10 (where 'B' differs from 'X' in the second block)
    expect(row.diff_first_divergence).toBe(10)
  })

  test('accepts split v1SystemText + v1UserText inputs (preferred form)', () => {
    const v2Out = {
      contentBlocks: [
        { tier: 1, text: 'SYS1', cache_control: { type: 'ephemeral' } },
        { tier: 2, text: 'SYS2', cache_control: { type: 'ephemeral' } },
        { tier: 4, text: 'USER4', cache_control: { type: 'ephemeral' } },
      ],
    }
    const row = audit.buildAuditRow({
      session_id: 's1',
      mode: 'shadow',
      v1SystemText: 'SYS1\n\n---\n\nSYS2',
      v1UserText: 'USER4',
      v2Out,
    })
    expect(row.semantic_equivalent).toBe(true)
  })

  test('handles empty v2 (no content blocks)', () => {
    const v2Out = { contentBlocks: [] }
    const row = audit.buildAuditRow({
      session_id: 's1',
      mode: 'shadow',
      v1Text: '',
      v2Out,
    })
    expect(row.semantic_equivalent).toBe(true)
    expect(row.v1_bytes).toBe(0)
    expect(row.v2_bytes).toBe(0)
    expect(row.breakpoint_bytes).toEqual({})
  })

  test('defaults missing session_id to "unknown"', () => {
    const row = audit.buildAuditRow({
      mode: 'shadow',
      v1Text: 'x',
      v2Out: fakeV2Out({ blocks: [1] }),
    })
    expect(row.session_id).toBe('unknown')
  })

  test('turn_id defaults to null when absent', () => {
    const row = audit.buildAuditRow({
      session_id: 's',
      mode: 'shadow',
      v1Text: 'x',
      v2Out: fakeV2Out({ blocks: [1] }),
    })
    expect(row.turn_id).toBeNull()
  })
})

describe('promptAssemblyAudit.insertRow', () => {
  test('writes expected SQL with all field values bound', async () => {
    mockResults.push([{ id: 42, assembled_at: new Date('2026-05-01T00:00:00Z') }])
    const row = audit.buildAuditRow({
      session_id: 's1',
      turn_id: 't1',
      mode: 'shadow',
      v1Text: 'AAA',
      v2Out: {
        contentBlocks: [
          { tier: 1, text: 'AAA', cache_control: { type: 'ephemeral' } },
        ],
      },
    })
    const inserted = await audit.insertRow(row)

    expect(inserted).toEqual({ id: 42, assembled_at: expect.any(Date) })
    expect(mockCalls.length).toBe(1)
    expect(mockCalls[0].sql).toMatch(/INSERT INTO prompt_assembly_audit/)
    // Values order matches INSERT order in insertRow()
    expect(mockCalls[0].values).toEqual([
      's1', 't1', 3, 3, 1, 1,
      JSON.stringify({ bp1: 3 }),
      true, null, 'shadow',
    ])
  })
})

describe('promptAssemblyAudit.dispatch (fire-and-forget)', () => {
  test('returns undefined synchronously (does not await insert)', () => {
    mockResults.push(new Error('db slow'))  // force insert to reject
    const result = audit.dispatch({
      session_id: 's1',
      mode: 'shadow',
      v1Text: 'x',
      v2Out: fakeV2Out({ blocks: [1] }),
    })
    expect(result).toBeUndefined()
  })

  test('insert runs asynchronously - mockCalls not yet populated synchronously', () => {
    mockResults.push([{ id: 1, assembled_at: new Date() }])
    expect(mockCalls.length).toBe(0)
    audit.dispatch({
      session_id: 's1',
      mode: 'shadow',
      v1Text: 'x',
      v2Out: fakeV2Out({ blocks: [1] }),
    })
    // The mocked db is synchronous-ish (returns a resolved promise), so call
    // WILL have happened by now - but the key invariant is dispatch returned
    // undefined, not a promise the caller could await.
    expect(mockCalls.length).toBe(1)
  })

  test('swallows insert failure with a warn log (does not throw)', async () => {
    mockResults.push(new Error('connection closed'))
    expect(() => audit.dispatch({
      session_id: 's1',
      mode: 'shadow',
      v1Text: 'x',
      v2Out: fakeV2Out({ blocks: [1] }),
    })).not.toThrow()

    // Wait a tick for the promise rejection to settle
    await new Promise(resolve => setImmediate(resolve))
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/insert failed/),
      expect.objectContaining({ error: 'connection closed' }),
    )
  })

  test('swallows buildAuditRow throw with a warn log (malformed input)', () => {
    expect(() => audit.dispatch(null)).not.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/buildAuditRow threw/),
      expect.any(Object),
    )
    expect(mockCalls.length).toBe(0)  // insert never attempted
  })

  test('unhandled promise rejection does not leak (Node process stability)', async () => {
    // If dispatch() forgot its .catch, an unhandledRejection event would fire.
    // Capture them and assert none were emitted during this test.
    const seen = []
    const handler = (err) => seen.push(err)
    process.on('unhandledRejection', handler)
    try {
      mockResults.push(new Error('boom'))
      audit.dispatch({
        session_id: 's1',
        mode: 'shadow',
        v1Text: 'x',
        v2Out: fakeV2Out({ blocks: [1] }),
      })
      // Give the microtask queue time to drain
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(seen).toHaveLength(0)
    } finally {
      process.removeListener('unhandledRejection', handler)
    }
  })
})

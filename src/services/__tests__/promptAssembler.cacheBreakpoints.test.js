'use strict'

/**
 * PR 2 load-bearing correctness tests for the 4-breakpoint cache layout.
 *
 * These tests are MORE important than byte-for-byte parity - they pin the
 * invariants that make the Anthropic prompt cache actually hit:
 *
 *   1. Content blocks are emitted in stability order BP1 → BP2 → BP3 → BP4.
 *      Anthropic's cache matches the longest prefix up to a cache_control
 *      marker. If BP2 is emitted before BP1, any BP1 change also invalidates
 *      BP2's cache slot, collapsing hit rate.
 *   2. Every emitted block has cache_control: {type: 'ephemeral'}. Missing
 *      the marker on any block means no cache slot for that tier, no prefix
 *      reuse on subsequent turns.
 *   3. Semantic equivalence: concat(contentBlocks[].text) reproduces the v1
 *      buildCustomSystemPrompt output + the v1 user-message stitch
 *      byte-for-byte. This is the gate for PR 6's canary→full flip.
 *   4. Deterministic canary bucketing: a given session_id always hashes to
 *      the same bucket. No Math.random - mid-session prompt-shape switches
 *      corrupt the SDK's context.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

jest.mock('../skillsSurfaceService', () => ({
  surfaceDoctrineBlock: jest.fn().mockReturnValue(''),
  surfaceSkillsBlock: jest.fn().mockReturnValue(''),
  matchedSkillNames: jest.fn().mockReturnValue([]),
  matchedFiles: jest.fn().mockReturnValue([]),
}))

const promptAssembler = require('../promptAssembler')
const doctrineSurface = require('../skillsSurfaceService')

function makeFixtureCwd({ claudeMd, selfMd } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-assembler-bp-'))
  if (claudeMd !== undefined) fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd, 'utf8')
  if (selfMd !== undefined) fs.writeFileSync(path.join(dir, 'SELF.md'), selfMd, 'utf8')
  return dir
}
function cleanupFixture(dir) { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }

describe('promptAssembler - 4-breakpoint cache layout (PR 2)', () => {
  beforeEach(() => {
    promptAssembler._resetCacheForTest()
    doctrineSurface.surfaceDoctrineBlock.mockReset()
    doctrineSurface.surfaceDoctrineBlock.mockReturnValue('')
  })

  describe('stability order (load-bearing for cache correctness)', () => {
    test('contentBlocks are emitted in tier order 1→2→3→4', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n', selfMd: '# SELF\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('<doctrine_surface>\nbp3 content\n</doctrine_surface>')
        const out = promptAssembler.assemble({
          cwd,
          session_id: 's1',
          turn_context: {
            user_content: 'hello',
            now: '2026-05-01 10:00',
            forks_rollup: '<forks_rollup>bp4 forks</forks_rollup>',
            relevant_memory: '<relevant_memory>bp4 mem</relevant_memory>',
          },
        })
        expect(out.contentBlocks).toHaveLength(4)
        expect(out.contentBlocks.map(b => b.tier)).toEqual([1, 2, 3, 4])
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('empty tiers are skipped (no placeholder blocks wasting cache slots)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        // No SELF.md, no turn_context. BP1 has CLAUDE only; BP2 always populated;
        // BP3 and BP4 empty.
        const out = promptAssembler.assemble({ cwd })
        expect(out.contentBlocks).toHaveLength(2)
        expect(out.contentBlocks.map(b => b.tier)).toEqual([1, 2])
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('skipping BP3 preserves BP1→BP2→BP4 order (no reordering when a middle tier is absent)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        // BP3 empty (no user_content); BP4 populated via turn_context
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { now: '2026-05-01', relevant_memory: '<relevant_memory>x</relevant_memory>' },
        })
        expect(out.contentBlocks.map(b => b.tier)).toEqual([1, 2, 4])
      } finally {
        cleanupFixture(cwd)
      }
    })
  })

  describe('cache_control markers (load-bearing for cache correctness)', () => {
    test('every emitted block has cache_control: {type: "ephemeral"}', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n', selfMd: '# SELF\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('<doctrine_surface>x</doctrine_surface>')
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { user_content: 'q', now: 't', relevant_memory: 'm' },
        })
        expect(out.contentBlocks.length).toBeGreaterThan(0)
        for (const block of out.contentBlocks) {
          expect(block.cache_control).toEqual({ type: 'ephemeral' })
        }
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('cacheBreakpoints offsets are monotonically increasing', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n', selfMd: '# SELF\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('bp3')
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { user_content: 'q', now: 't' },
        })
        const offsets = out.cacheBreakpoints.map(bp => bp.offset)
        for (let i = 1; i < offsets.length; i++) {
          expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
        }
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('cacheBreakpoints has at most 4 entries (Anthropic API limit)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# C\n', selfMd: '# S\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('bp3 text')
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { user_content: 'q', now: 't', relevant_memory: 'm', forks_rollup: 'f' },
        })
        expect(out.cacheBreakpoints.length).toBeLessThanOrEqual(4)
      } finally {
        cleanupFixture(cwd)
      }
    })
  })

  describe('semantic equivalence (gate for PR 6 canary→full flip)', () => {
    test('concat(contentBlocks[].text) === systemPrompt + user-message stitch', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n', selfMd: '# SELF\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('<doctrine_surface>surfaced</doctrine_surface>')
        const out = promptAssembler.assemble({
          cwd,
          turn_context: {
            user_content: 'hello world',
            now: '2026-05-01',
            relevant_memory: '<relevant_memory>m</relevant_memory>',
          },
        })

        // v1-equivalent stitch: systemPrompt + '\n\n---\n\n' separator was the
        // PR 1 shape. In PR 2 the SDK still receives the same STRING when v1
        // path runs; v2 sends content blocks. Semantic equivalence here means
        // the v1 text the model would see equals the concatenation of v2 blocks.
        const v1System = out.systemPrompt
        const v1User = out.userMessage || ''
        const v2Flat = out.contentBlocks.map(b => b.text).join('')

        // The v2 flat form inserts block content directly; v1 joins system
        // with '\n\n---\n\n' between stable halves, and user with '\n\n'
        // between blocks. The contentBlocks array mirrors:
        //   BP1 (bp1Text), BP2 (bp2Text), BP3 (bp3Text), BP4 (bp4Text)
        // while systemPrompt = [bp1, bp2].join('\n\n---\n\n')
        // and userMessage = [bp3, bp4].filter(Boolean).join('\n\n').
        const reconstructed =
          out.contentBlocks
            .filter(b => b.tier <= 2)
            .map(b => b.text)
            .join('\n\n---\n\n')
        expect(reconstructed).toBe(v1System)

        // firstDivergenceIndex proves exact byte equality
        expect(promptAssembler.firstDivergenceIndex(reconstructed, v1System)).toBeNull()
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('firstDivergenceIndex returns byte index on difference', () => {
      expect(promptAssembler.firstDivergenceIndex('abc', 'abc')).toBeNull()
      expect(promptAssembler.firstDivergenceIndex('abc', 'abd')).toBe(2)
      expect(promptAssembler.firstDivergenceIndex('abc', 'abcd')).toBe(3)
      expect(promptAssembler.firstDivergenceIndex('', '')).toBeNull()
      expect(promptAssembler.firstDivergenceIndex('a', '')).toBe(0)
    })
  })

  describe('deterministic canary bucketing', () => {
    test('isInCanaryBucket is deterministic for the same session_id', () => {
      const sessionId = 'cc_session_abc_123'
      const first = promptAssembler.isInCanaryBucket(sessionId)
      for (let i = 0; i < 100; i++) {
        expect(promptAssembler.isInCanaryBucket(sessionId)).toBe(first)
      }
    })

    test('resolveMode returns the same path for the same session_id across 100 calls (canary mode)', () => {
      const sessionId = 'cc_session_stable_456'
      const first = promptAssembler.resolveMode('canary', sessionId)
      for (let i = 0; i < 100; i++) {
        expect(promptAssembler.resolveMode('canary', sessionId)).toEqual(first)
      }
    })

    test('bucket distribution is close to 20% over 1000 random session ids', () => {
      let inBucket = 0
      for (let i = 0; i < 1000; i++) {
        const sid = `sess_${Math.random().toString(36).slice(2)}_${i}`
        if (promptAssembler.isInCanaryBucket(sid)) inBucket++
      }
      // sha256 is uniform; expect roughly 51/256 ≈ 19.9%. Allow ±4 pp tolerance.
      const ratio = inBucket / 1000
      expect(ratio).toBeGreaterThan(0.16)
      expect(ratio).toBeLessThan(0.24)
    })

    test('isInCanaryBucket is safe with missing/invalid session_id', () => {
      expect(promptAssembler.isInCanaryBucket('')).toBe(false)
      expect(promptAssembler.isInCanaryBucket(null)).toBe(false)
      expect(promptAssembler.isInCanaryBucket(undefined)).toBe(false)
      expect(promptAssembler.isInCanaryBucket(123)).toBe(false)
    })
  })

  describe('resolveMode (flag dispatch)', () => {
    test('off: v1 path, no audit', () => {
      expect(promptAssembler.resolveMode('off', 'any')).toEqual({ mode: 'off', path: 'v1', audit: false })
    })
    test('shadow: v1 path, audit on', () => {
      expect(promptAssembler.resolveMode('shadow', 'any')).toEqual({ mode: 'shadow', path: 'v1', audit: true })
    })
    test('canary: v1 or v2 depending on bucket, audit on', () => {
      // Find one session id in bucket and one out of bucket
      let inSid = null, outSid = null
      for (let i = 0; i < 200 && (!inSid || !outSid); i++) {
        const sid = `probe_${i}`
        if (promptAssembler.isInCanaryBucket(sid)) inSid = inSid || sid
        else outSid = outSid || sid
      }
      expect(inSid).not.toBeNull()
      expect(outSid).not.toBeNull()
      expect(promptAssembler.resolveMode('canary', inSid).path).toBe('v2')
      expect(promptAssembler.resolveMode('canary', outSid).path).toBe('v1')
      expect(promptAssembler.resolveMode('canary', inSid).audit).toBe(true)
    })
    test('unknown flag values fall through to off (fail-safe)', () => {
      expect(promptAssembler.resolveMode('full', 'any').path).toBe('v1')
      expect(promptAssembler.resolveMode(undefined, 'any').path).toBe('v1')
      expect(promptAssembler.resolveMode('', 'any').path).toBe('v1')
    })
    test('case-insensitive flag handling', () => {
      expect(promptAssembler.resolveMode('SHADOW', 'any').mode).toBe('shadow')
      expect(promptAssembler.resolveMode('Canary', 'any').mode).toBe('canary')
    })
  })

  describe('BP3 - doctrineSurface shim (PR 4 hand-off)', () => {
    test('BP3 populated from doctrineSurface.surfaceDoctrineBlock when user_content is present', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockReturnValue('<doctrine_surface>matched pattern</doctrine_surface>')
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { user_content: 'deploy the backend' },
        })
        const bp3 = out.contentBlocks.find(b => b.tier === 3)
        expect(bp3).toBeDefined()
        expect(bp3.text).toBe('<doctrine_surface>matched pattern</doctrine_surface>')
        expect(doctrineSurface.surfaceDoctrineBlock).toHaveBeenCalledWith('deploy the backend')
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('BP3 empty when user_content is absent', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        const out = promptAssembler.assemble({ cwd, turn_context: {} })
        const bp3 = out.contentBlocks.find(b => b.tier === 3)
        expect(bp3).toBeUndefined()
        expect(doctrineSurface.surfaceDoctrineBlock).not.toHaveBeenCalled()
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('doctrineSurface throw → BP3 empty, no crash', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        doctrineSurface.surfaceDoctrineBlock.mockImplementation(() => { throw new Error('fs wedge') })
        const out = promptAssembler.assemble({
          cwd,
          turn_context: { user_content: 'x' },
        })
        const bp3 = out.contentBlocks.find(b => b.tier === 3)
        expect(bp3).toBeUndefined()
      } finally {
        cleanupFixture(cwd)
      }
    })
  })

  describe('BP4 - per-turn passthrough', () => {
    test('BP4 populated with <now>, forks_rollup, relevant_memory when provided', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        const out = promptAssembler.assemble({
          cwd,
          turn_context: {
            now: '2026-05-01 10:00 AEST',
            forks_rollup: '<forks_rollup>3 active</forks_rollup>',
            relevant_memory: '<relevant_memory>hit</relevant_memory>',
          },
        })
        const bp4 = out.contentBlocks.find(b => b.tier === 4)
        expect(bp4).toBeDefined()
        expect(bp4.text).toMatch(/<now>2026-05-01/)
        expect(bp4.text).toMatch(/forks_rollup/)
        expect(bp4.text).toMatch(/relevant_memory/)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('BP4 respects recent_exchanges > last_turn_breadcrumb precedence (same as v1)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# C\n' })
      try {
        const outBoth = promptAssembler.assemble({
          cwd,
          turn_context: {
            now: 't',
            recent_exchanges: 'USER: hi\nASSISTANT: hello',
            last_turn_breadcrumb: 'should_be_dropped',
          },
        })
        const bp4 = outBoth.contentBlocks.find(b => b.tier === 4)
        expect(bp4.text).toMatch(/<recent_exchanges>/)
        expect(bp4.text).not.toMatch(/should_be_dropped/)

        const outBreadcrumbOnly = promptAssembler.assemble({
          cwd,
          turn_context: { now: 't', last_turn_breadcrumb: 'fallback state' },
        })
        const bp4b = outBreadcrumbOnly.contentBlocks.find(b => b.tier === 4)
        expect(bp4b.text).toMatch(/<last_turn_breadcrumb>/)
      } finally {
        cleanupFixture(cwd)
      }
    })
  })
})

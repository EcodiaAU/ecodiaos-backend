'use strict'

/**
 * Parity test: promptAssembler.assemble().systemPrompt must equal
 * osSessionService.buildCustomSystemPrompt(cwd) byte-for-byte for the
 * same cwd.
 *
 * PR 1 is skeleton-only — assembler duplicates the current logic in a
 * new module so it can be extended for 4-breakpoint cache layout in
 * PR 2 without touching the live path. This test pins the equivalence
 * so PR 2 (and every later edit) can verify parity before flipping.
 *
 * PR 1 contract additionally asserted:
 *   - userMessage === null (no turn-context envelope yet)
 *   - cacheBreakpoints is an empty array (no cache_control markers yet)
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

// ─── Mocks for osSessionService's heavy deps ──────────────────────────────────
// osSessionService fires side-effects on module load (usageEnergy.refreshAllAccounts
// at line 48) and imports ~10 services. We only care about buildCustomSystemPrompt,
// a pure string-builder, so we stub everything else to cheap no-ops.

jest.mock('../../config/db', () => {
  function mockDbTag() { return Promise.resolve([]) }
  mockDbTag.sql = async () => []
  mockDbTag.begin = async (fn) => fn(mockDbTag)
  return mockDbTag
})

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

jest.mock('../../config/env', () => ({
  OS_SESSION_CWD: '/tmp/test-cwd',
  OS_SESSION_MODEL: undefined,
  CLAUDE_CONFIG_DIR_1: undefined,
  CLAUDE_CONFIG_DIR_2: undefined,
  CLAUDE_CODE_OAUTH_TOKEN_TATE: undefined,
  CLAUDE_CODE_OAUTH_TOKEN_CODE: undefined,
  AWS_ACCESS_KEY_ID: undefined,
  AWS_SECRET_ACCESS_KEY: undefined,
  AWS_REGION: undefined,
  BEDROCK_MODEL: undefined,
  ANTHROPIC_API_KEY: undefined,
}))

jest.mock('../../websocket/wsManager', () => ({
  broadcast: jest.fn(),
  flushDeltasForTurnComplete: jest.fn(),
  resetSessionSeq: jest.fn(),
  broadcastToSession: jest.fn(),
}))

jest.mock('../secretSafetyService', () => ({ scrubSecrets: (x) => x }))

jest.mock('../usageEnergyService', () => ({
  refreshAllAccounts: jest.fn().mockResolvedValue(undefined),
  getEnergy: jest.fn().mockResolvedValue({
    pctUsed: 0, level: 'healthy',
    accounts: { claude_max: {}, claude_max_2: {} },
  }),
  getBestProvider: jest.fn().mockReturnValue({
    provider: 'claude_max', isBedrockFallback: false, reason: 'healthy',
  }),
  setProvider: jest.fn(),
}))

jest.mock('../osIncidentService', () => ({ log: jest.fn() }))
jest.mock('../sessionMemoryService', () => ({
  getSessionMemory: jest.fn().mockResolvedValue(null),
  saveSessionMemory: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../osConversationLog', () => ({
  getNextTurnNumber: jest.fn().mockResolvedValue(0),
  logTurn: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../neo4jRetrieval', () => ({
  fusedSearch: jest.fn().mockResolvedValue([]),
  getRecentHighPriorityNodes: jest.fn().mockResolvedValue([]),
}))
jest.mock('../doctrineSurface', () => ({
  surface: jest.fn().mockResolvedValue(''),
}))

// ─── Modules under test ───────────────────────────────────────────────────────

const osSessionService = require('../osSessionService')
const promptAssembler = require('../promptAssembler')

// ─── Fixture cwd helpers ──────────────────────────────────────────────────────

function makeFixtureCwd({ claudeMd, selfMd, selfMdInClaude } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-assembler-parity-'))
  if (claudeMd !== undefined) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd, 'utf8')
  }
  if (selfMd !== undefined) {
    if (selfMdInClaude) {
      fs.mkdirSync(path.join(dir, '.claude'))
      fs.writeFileSync(path.join(dir, '.claude', 'SELF.md'), selfMd, 'utf8')
    } else {
      fs.writeFileSync(path.join(dir, 'SELF.md'), selfMd, 'utf8')
    }
  }
  return dir
}

function cleanupFixture(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('promptAssembler.assemble (PR 1 skeleton)', () => {
  beforeEach(() => {
    promptAssembler._resetCacheForTest()
  })

  describe('parity with osSessionService.buildCustomSystemPrompt', () => {
    test('both files present at repo root', () => {
      const cwd = makeFixtureCwd({
        claudeMd: '# CLAUDE\nidentity content\n',
        selfMd: '# SELF\nfirst-person content\n',
      })
      try {
        const expected = osSessionService.buildCustomSystemPrompt(cwd)
        const actual = promptAssembler.assemble({ cwd }).systemPrompt
        expect(actual).toBe(expected)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('CLAUDE.md only, no SELF.md', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\nsolo\n' })
      try {
        const expected = osSessionService.buildCustomSystemPrompt(cwd)
        const actual = promptAssembler.assemble({ cwd }).systemPrompt
        expect(actual).toBe(expected)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('SELF.md under .claude/ (legacy layout)', () => {
      const cwd = makeFixtureCwd({
        claudeMd: '# CLAUDE\n',
        selfMd: '# SELF legacy\n',
        selfMdInClaude: true,
      })
      try {
        const expected = osSessionService.buildCustomSystemPrompt(cwd)
        const actual = promptAssembler.assemble({ cwd }).systemPrompt
        expect(actual).toBe(expected)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('root SELF.md wins over .claude/SELF.md when both exist', () => {
      const cwd = makeFixtureCwd({
        claudeMd: '# CLAUDE\n',
        selfMd: '# SELF root wins\n',
      })
      try {
        // also drop a .claude/SELF.md that must be ignored
        fs.mkdirSync(path.join(cwd, '.claude'))
        fs.writeFileSync(path.join(cwd, '.claude', 'SELF.md'), '# SHOULD_NOT_APPEAR\n', 'utf8')

        const expected = osSessionService.buildCustomSystemPrompt(cwd)
        const actual = promptAssembler.assemble({ cwd }).systemPrompt

        expect(actual).toBe(expected)
        expect(actual).not.toMatch(/SHOULD_NOT_APPEAR/)
        expect(actual).toMatch(/SELF root wins/)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('empty cwd (no CLAUDE.md, no SELF.md)', () => {
      const cwd = makeFixtureCwd({})
      try {
        const expected = osSessionService.buildCustomSystemPrompt(cwd)
        const actual = promptAssembler.assemble({ cwd }).systemPrompt
        expect(actual).toBe(expected)
      } finally {
        cleanupFixture(cwd)
      }
    })
  })

  describe('skeleton contract', () => {
    test('returns {systemPrompt, userMessage, cacheBreakpoints}', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        const out = promptAssembler.assemble({ cwd })
        expect(out).toEqual(expect.objectContaining({
          systemPrompt: expect.any(String),
          userMessage: null,
          cacheBreakpoints: [],
        }))
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('cacheBreakpoints is empty array (no cache_control markers in PR 1)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        const out = promptAssembler.assemble({ cwd })
        expect(Array.isArray(out.cacheBreakpoints)).toBe(true)
        expect(out.cacheBreakpoints.length).toBe(0)
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('userMessage is null in PR 1 (no turn-context envelope yet)', () => {
      const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
      try {
        const out = promptAssembler.assemble({ cwd, session_id: 's1', turn_context: { foo: 'bar' } })
        expect(out.userMessage).toBeNull()
      } finally {
        cleanupFixture(cwd)
      }
    })

    test('throws on missing cwd', () => {
      expect(() => promptAssembler.assemble({})).toThrow(/cwd/)
      expect(() => promptAssembler.assemble()).toThrow(/cwd/)
      expect(() => promptAssembler.assemble({ cwd: 123 })).toThrow(/cwd/)
    })

    test('includes all six stable sections joined by \\n\\n---\\n\\n', () => {
      const cwd = makeFixtureCwd({
        claudeMd: '# CLAUDE\n',
        selfMd: '# SELF\n',
      })
      try {
        const out = promptAssembler.assemble({ cwd }).systemPrompt
        // Five '---' separators between six non-empty blocks
        const sepCount = (out.match(/\n\n---\n\n/g) || []).length
        expect(sepCount).toBe(5)
        expect(out).toMatch(/# CLAUDE/)
        expect(out).toMatch(/# SELF/)
        expect(out).toMatch(/# Environment/)
        expect(out).toMatch(/# Behavior/)
        expect(out).toMatch(/# Forks/)
        expect(out).toMatch(/# Security: untrusted-input handling/)
      } finally {
        cleanupFixture(cwd)
      }
    })
  })
})

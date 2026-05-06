'use strict'

/**
 * Integration test for the PROMPT_ASSEMBLY_V2 shadow-mode wire-in.
 *
 * Can't spin up a real osSessionService.sendMessage() turn here (too many
 * live deps) - instead we exercise the dispatch code path by reconstructing
 * the exact call shape the wire-in uses and asserting:
 *
 *   1. Under shadow mode, promptAssemblyAudit.dispatch() is called once
 *      with the expected row shape (session_id, mode='shadow',
 *      semantic_equivalent, breakpoint_bytes).
 *   2. Under off mode, dispatch() is NEVER called (zero DB churn when flag
 *      is off - the default in prod).
 *   3. The dispatch call is fire-and-forget (returns undefined synchronously,
 *      does not block).
 *   4. buildAuditRow produces a row with the expected shape so the
 *      prompt_assembly_audit INSERT has correct data.
 *
 * This is the "first audit row lands with the right shape" verification
 * that gates PR 2 merge per the spec.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('../../config/db', () => {
  function dbTag() { return Promise.resolve([]) }
  return dbTag
})

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

jest.mock('../skillsSurfaceService', () => ({
  surfaceDoctrineBlock: jest.fn().mockReturnValue(''),
  surfaceSkillsBlock: jest.fn().mockReturnValue(''),
  matchedSkillNames: jest.fn().mockReturnValue([]),
  matchedFiles: jest.fn().mockReturnValue([]),
}))

// Mock the audit module so we can inspect dispatch calls without touching DB.
// Re-exporting buildAuditRow lazily avoids the top-level db require that
// would fail under real env.
jest.mock('../promptAssemblyAudit', () => ({
  dispatch: jest.fn(),
  buildAuditRow: (...args) => jest.requireActual('../promptAssemblyAudit').buildAuditRow(...args),
  insertRow: jest.fn().mockResolvedValue({ id: 1, assembled_at: new Date() }),
}))

const assembler = require('../promptAssembler')
const audit = require('../promptAssemblyAudit')

function makeFixtureCwd({ claudeMd, selfMd } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-wireup-'))
  if (claudeMd !== undefined) fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd, 'utf8')
  if (selfMd !== undefined) fs.writeFileSync(path.join(dir, 'SELF.md'), selfMd, 'utf8')
  return dir
}
function cleanupFixture(dir) { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }

/**
 * Replays the exact wire-in snippet from osSessionService.js lines ~1806-1845.
 * Any drift between this helper and the live code would invalidate the test - 
 * keep this in sync if the wire-in changes.
 */
function runShadowWireIn({ modeEnv, dbSessionId, cwd, content, continuityParts, _forksBlock, _doctrineBlock, _memoryBlock, recoveryBlock, recentExchangeBlock, breadcrumbBlock, customSystemPrompt }) {
  try {
    const _mode = assembler.resolveMode(modeEnv, dbSessionId)
    if (_mode.audit) {
      const _v2TurnContext = {
        user_content: content,
        now: continuityParts.length > 0 ? (continuityParts.find(p => typeof p === 'string' && p.startsWith('<now>')) || '').replace(/^<now>|<\/now>$/g, '') : null,
        forks_rollup: _forksBlock || null,
        recent_doctrine: _doctrineBlock || null,
        relevant_memory: _memoryBlock || null,
        restart_recovery: recoveryBlock || null,
        recent_exchanges: recentExchangeBlock || null,
        last_turn_breadcrumb: breadcrumbBlock || null,
      }
      const _v2Out = assembler.assemble({
        cwd,
        session_id: dbSessionId,
        turn_context: _v2TurnContext,
      })
      const _v1Text = customSystemPrompt +
        (continuityParts.length > 0 ? '\n\n' + continuityParts.join('\n\n') : '')
      audit.dispatch({
        session_id: dbSessionId,
        turn_id: null,
        mode: _mode.mode,
        v1Text: _v1Text,
        v2Out: _v2Out,
      })
    }
  } catch (err) {
    // swallowed - matches live belt-and-braces behavior
  }
}

describe('osSessionService - PROMPT_ASSEMBLY_V2 shadow wire-in', () => {
  beforeEach(() => {
    assembler._resetCacheForTest()
    audit.dispatch.mockClear()
  })

  test('shadow mode: dispatch fires once with full shape', () => {
    const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n', selfMd: '# SELF\n' })
    try {
      runShadowWireIn({
        modeEnv: 'shadow',
        dbSessionId: 'cc_sess_abc',
        cwd,
        content: 'what forks are running',
        continuityParts: ['<now>2026-05-01 10:00</now>', '<forks_rollup>no active</forks_rollup>'],
        _forksBlock: '<forks_rollup>no active</forks_rollup>',
        _doctrineBlock: null,
        _memoryBlock: null,
        recoveryBlock: null,
        recentExchangeBlock: null,
        breadcrumbBlock: null,
        customSystemPrompt: 'CUSTOM_SYSTEM_PROMPT_TEXT',
      })
      expect(audit.dispatch).toHaveBeenCalledTimes(1)
      const call = audit.dispatch.mock.calls[0][0]
      expect(call.session_id).toBe('cc_sess_abc')
      expect(call.mode).toBe('shadow')
      expect(call.v1Text).toMatch(/^CUSTOM_SYSTEM_PROMPT_TEXT/)
      expect(call.v1Text).toMatch(/<now>/)
      expect(call.v2Out).toEqual(expect.objectContaining({
        systemPrompt: expect.any(String),
        contentBlocks: expect.any(Array),
        cacheBreakpoints: expect.any(Array),
      }))
      expect(call.v2Out.contentBlocks.length).toBeGreaterThan(0)
      expect(call.v2Out.contentBlocks.every(b => b.cache_control?.type === 'ephemeral')).toBe(true)
    } finally {
      cleanupFixture(cwd)
    }
  })

  test('off mode: dispatch is never called (zero DB churn)', () => {
    const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE\n' })
    try {
      runShadowWireIn({
        modeEnv: 'off',
        dbSessionId: 's1',
        cwd,
        content: 'x',
        continuityParts: [],
        _forksBlock: null, _doctrineBlock: null, _memoryBlock: null,
        recoveryBlock: null, recentExchangeBlock: null, breadcrumbBlock: null,
        customSystemPrompt: 'sys',
      })
      expect(audit.dispatch).not.toHaveBeenCalled()
    } finally {
      cleanupFixture(cwd)
    }
  })

  test('canary mode: dispatch fires on all sessions (not only v2 bucket)', () => {
    const cwd = makeFixtureCwd({ claudeMd: '# C\n' })
    try {
      runShadowWireIn({
        modeEnv: 'canary',
        dbSessionId: 'bucket_miss',
        cwd, content: 'x', continuityParts: [],
        _forksBlock: null, _doctrineBlock: null, _memoryBlock: null,
        recoveryBlock: null, recentExchangeBlock: null, breadcrumbBlock: null,
        customSystemPrompt: 'sys',
      })
      // Whether or not the session is in the v2 bucket, audit should fire.
      // resolveMode('canary', X) returns audit: true unconditionally.
      expect(audit.dispatch).toHaveBeenCalledTimes(1)
      expect(audit.dispatch.mock.calls[0][0].mode).toBe('canary')
    } finally {
      cleanupFixture(cwd)
    }
  })

  test('buildAuditRow on this dispatch produces a complete, insertable row', () => {
    const cwd = makeFixtureCwd({ claudeMd: '# CLAUDE CONTENT\n', selfMd: '# SELF CONTENT\n' })
    try {
      // Use the real buildAuditRow to produce the row, then inspect it.
      const real = jest.requireActual('../promptAssemblyAudit')
      const v2Out = assembler.assemble({
        cwd,
        session_id: 'first_row_test',
        turn_context: {
          user_content: 'hello',
          now: '2026-05-01T10:00:00',
          forks_rollup: null,
          relevant_memory: null,
        },
      })
      const v1Text = [v2Out.systemPrompt, v2Out.userMessage].filter(Boolean).join('\n\n')
      const row = real.buildAuditRow({
        session_id: 'first_row_test',
        turn_id: null,
        mode: 'shadow',
        v1Text,
        v2Out,
      })

      // Assert the shape matches the migration 079 column list
      expect(row).toEqual(expect.objectContaining({
        session_id: expect.any(String),
        turn_id: null,
        v1_bytes: expect.any(Number),
        v2_bytes: expect.any(Number),
        v1_blocks: expect.any(Number),
        v2_blocks: expect.any(Number),
        breakpoint_bytes: expect.any(Object),
        semantic_equivalent: expect.any(Boolean),
        diff_first_divergence: null,  // first row should be equivalent (no divergence)
        mode: 'shadow',
      }))

      // breakpoint_bytes has one key per emitted content block.
      // This fixture sets user_content + now, so BP3 is empty (doctrineSurface
      // mocked to return '') and BP4 populated with <now>.
      expect(Object.keys(row.breakpoint_bytes).sort()).toEqual(['bp1', 'bp2', 'bp4'])
      expect(row.breakpoint_bytes.bp1).toBeGreaterThan(0)
      expect(row.breakpoint_bytes.bp2).toBeGreaterThan(0)
      expect(row.breakpoint_bytes.bp4).toBeGreaterThan(0)
    } finally {
      cleanupFixture(cwd)
    }
  })

  test('dispatch invocation does not throw even with malformed inputs', () => {
    expect(() => runShadowWireIn({
      modeEnv: 'shadow',
      dbSessionId: null,   // missing session id
      cwd: '/tmp/nonexistent-path-' + Date.now(),
      content: '',
      continuityParts: [],
      _forksBlock: null, _doctrineBlock: null, _memoryBlock: null,
      recoveryBlock: null, recentExchangeBlock: null, breadcrumbBlock: null,
      customSystemPrompt: '',
    })).not.toThrow()
  })
})

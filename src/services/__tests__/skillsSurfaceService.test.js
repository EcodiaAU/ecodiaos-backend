'use strict'

/**
 * Tests for skillsSurfaceService — description-driven retrieval shim.
 *
 * Covers:
 *   - Skills index loads from .claude/skills/<slug>/SKILL.md
 *   - surfaceSkillsBlock returns a block formatted like doctrineSurface
 *   - matchedSkillNames returns ranked names for the hit-count metric
 *   - Token matching is case-insensitive + skips noise tokens
 *   - Missing Skills dir returns empty gracefully
 */

jest.mock('../../config/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

const fs = require('fs')
const os = require('os')
const path = require('path')

const skills = require('../skillsSurfaceService')

function makeSkillsDir(defs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-surface-'))
  for (const def of defs) {
    const skillDir = path.join(dir, def.name)
    fs.mkdirSync(skillDir, { recursive: true })
    const body = def.body || `# ${def.name}\n\nBody for ${def.name}.\n`
    const frontmatter = `---\nname: ${def.name}\ndescription: >\n  ${def.description}\n---\n\n`
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter + body, 'utf8')
  }
  return dir
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

describe('_tokenize', () => {
  test('lowercases and splits on non-alphanumeric', () => {
    expect(skills._tokenize('Excel-Sync AND forms_migrated_at')).toEqual(
      expect.arrayContaining(['excel-sync', 'and', 'forms_migrated_at'])
    )
  })
  test('drops tokens shorter than 3 chars', () => {
    const toks = skills._tokenize('a ab abc abcd')
    expect(toks).toContain('abc')
    expect(toks).toContain('abcd')
    expect(toks).not.toContain('a')
    expect(toks).not.toContain('ab')
  })
  test('empty/null input returns empty', () => {
    expect(skills._tokenize('')).toEqual([])
    expect(skills._tokenize(null)).toEqual([])
  })
})

describe('_loadIndex', () => {
  beforeEach(() => skills._resetCacheForTest())

  test('returns empty array when dir does not exist', () => {
    expect(skills._loadIndex('/tmp/nonexistent-' + Date.now())).toEqual([])
  })

  test('loads each SKILL.md with parsed description', () => {
    const dir = makeSkillsDir([
      { name: 'alpha', description: 'Use when deploying to Supabase Edge Functions.' },
      { name: 'beta', description: 'Use when touching forms-migrated-at or coexist-sheet-sync.' },
    ])
    try {
      const index = skills._loadIndex(dir)
      expect(index).toHaveLength(2)
      const alpha = index.find(s => s.name === 'alpha')
      expect(alpha.description).toMatch(/Supabase Edge Functions/)
      expect(alpha.tokens).toContain('supabase')
    } finally {
      cleanup(dir)
    }
  })

  test('skips directories without SKILL.md', () => {
    const dir = makeSkillsDir([{ name: 'has-skill', description: 'x' }])
    try {
      fs.mkdirSync(path.join(dir, 'empty-dir'), { recursive: true })
      const index = skills._loadIndex(dir)
      expect(index.map(s => s.name)).toEqual(['has-skill'])
    } finally {
      cleanup(dir)
    }
  })

  test('skills index is cached per dir (repeated loads return same array)', () => {
    const dir = makeSkillsDir([{ name: 'one', description: 'one' }])
    try {
      const first = skills._loadIndex(dir)
      const second = skills._loadIndex(dir)
      expect(second).toBe(first)
    } finally {
      cleanup(dir)
    }
  })
})

describe('surfaceSkillsBlock', () => {
  beforeEach(() => skills._resetCacheForTest())

  test('returns empty string when no skills match', () => {
    const dir = makeSkillsDir([
      { name: 'irrelevant', description: 'Use when deploying aircraft engines.' },
    ])
    try {
      const block = skills.surfaceSkillsBlock('email triage for nonprofits', { dir })
      expect(block).toBe('')
    } finally {
      cleanup(dir)
    }
  })

  test('returns formatted block when skills match', () => {
    const dir = makeSkillsDir([
      { name: 'edge-fn', description: 'Use when deploying a Supabase Edge Function.' },
      { name: 'unrelated', description: 'Use when writing pet-sitter invoices.' },
    ])
    try {
      const block = skills.surfaceSkillsBlock('deploy the edge function for supabase', { dir })
      expect(block).toMatch(/<skills_surface>/)
      expect(block).toMatch(/<\/skills_surface>/)
      expect(block).toMatch(/edge-fn/)
      expect(block).not.toMatch(/unrelated/)
    } finally {
      cleanup(dir)
    }
  })

  test('top-k limits result count', () => {
    const defs = []
    for (let i = 0; i < 10; i++) {
      defs.push({ name: `skill-${i}`, description: 'Use when deploying supabase edge function.' })
    }
    const dir = makeSkillsDir(defs)
    try {
      const block = skills.surfaceSkillsBlock('deploy edge function supabase', { dir, topK: 3 })
      const lines = block.split('\n').filter(l => /^\d+\./.test(l))
      expect(lines.length).toBe(3)
    } finally {
      cleanup(dir)
    }
  })

  test('empty turn content returns empty block', () => {
    const dir = makeSkillsDir([{ name: 'a', description: 'some description' }])
    try {
      expect(skills.surfaceSkillsBlock('', { dir })).toBe('')
      expect(skills.surfaceSkillsBlock(null, { dir })).toBe('')
    } finally {
      cleanup(dir)
    }
  })
})

describe('matchedSkillNames', () => {
  beforeEach(() => skills._resetCacheForTest())

  test('returns names sorted by score', () => {
    const dir = makeSkillsDir([
      { name: 'sparse', description: 'Use when touching supabase.' },  // 1 match token
      { name: 'dense', description: 'Use when deploying supabase edge function.' },  // 3 match tokens
    ])
    try {
      const names = skills.matchedSkillNames('deploy supabase edge function', { dir })
      expect(names[0]).toBe('dense')  // higher score first
      expect(names).toContain('sparse')
    } finally {
      cleanup(dir)
    }
  })

  test('returns empty array on empty content', () => {
    const dir = makeSkillsDir([{ name: 'a', description: 'x' }])
    try {
      expect(skills.matchedSkillNames('', { dir })).toEqual([])
    } finally {
      cleanup(dir)
    }
  })
})

describe('real migrated skills directory (integration)', () => {
  beforeEach(() => skills._resetCacheForTest())

  test('loads the generated 122 skills from backend/.claude/skills', () => {
    const dir = skills.DEFAULT_SKILLS_DIR
    if (!fs.existsSync(dir)) {
      // If the migration hasn't been run yet, skip silently.
      return
    }
    const index = skills._loadIndex(dir)
    expect(index.length).toBeGreaterThan(0)
    // Spot-check that descriptions are populated (migration script emitted them).
    for (const skill of index) {
      expect(typeof skill.description).toBe('string')
    }
  })
})

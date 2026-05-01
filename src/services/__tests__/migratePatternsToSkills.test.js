'use strict'

/**
 * Tests for scripts/migrate-patterns-to-skills.js parsing logic.
 * The script itself has CLI side-effects; here we unit-test the two pure
 * helpers it exports (parsePattern, makeSkillContent) so the migration
 * is covered by tests in CI.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const { parsePattern, makeSkillContent } = require('../../../scripts/migrate-patterns-to-skills')

function write(dir, name, content) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

describe('migrate-patterns-to-skills: parsePattern', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-patterns-'))
  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {} })

  test('parses triggers and title from a canonical pattern file', () => {
    const file = write(tmp, 'canonical.md',
`---
triggers: alpha-trigger, beta-trigger, third trigger with spaces
---

# The canonical pattern

## Body

This is the body content.
`)
    const parsed = parsePattern(file)
    expect(parsed.triggers).toEqual(['alpha-trigger', 'beta-trigger', 'third trigger with spaces'])
    expect(parsed.title).toBe('The canonical pattern')
    expect(parsed.body).toMatch(/## Body/)
    // Frontmatter should be stripped from body
    expect(parsed.body).not.toMatch(/^---/)
  })

  test('normalises CRLF to LF so Windows-written files parse correctly', () => {
    const file = write(tmp, 'crlf.md',
      `---\r\ntriggers: a, b\r\n---\r\n\r\n# CRLF title\r\n\r\nBody.\r\n`)
    const parsed = parsePattern(file)
    expect(parsed.triggers).toEqual(['a', 'b'])
    expect(parsed.title).toBe('CRLF title')
  })

  test('pattern without frontmatter falls back to filename-as-title', () => {
    const file = write(tmp, 'no-frontmatter.md', '# Real title\n\nBody\n')
    const parsed = parsePattern(file)
    expect(parsed.triggers).toEqual([])
    expect(parsed.title).toBe('Real title')
  })

  test('pattern without H1 uses filename (minus .md) as title', () => {
    const file = write(tmp, 'no-h1.md', '---\ntriggers: x\n---\n\nJust body.\n')
    const parsed = parsePattern(file)
    expect(parsed.title).toBe('no-h1')
  })
})

describe('migrate-patterns-to-skills: makeSkillContent', () => {
  test('emits Anthropic Skills frontmatter with name + description + body', () => {
    const content = makeSkillContent({
      slug: 'my-skill',
      title: 'My Skill Title',
      triggers: ['one', 'two', 'three'],
      body: '# My Skill Title\n\nOriginal body.\n',
    })
    expect(content).toMatch(/^---\nname: my-skill\ndescription: >\n  Use when the turn involves one, two, three\. Pattern: My Skill Title\./)
    expect(content).toMatch(/^---[\s\S]*---\n\n# My Skill Title\n\nOriginal body/m)
  })

  test('zero triggers → description falls back to semantic-match hint', () => {
    const content = makeSkillContent({
      slug: 'no-triggers',
      title: 'No Triggers',
      triggers: [],
      body: '',
    })
    expect(content).toMatch(/no explicit triggers/)
  })
})

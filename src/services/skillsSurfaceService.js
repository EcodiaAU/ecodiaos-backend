'use strict'

/**
 * skillsSurfaceService — parallel retrieval shim that reads from
 * .claude/skills/<slug>/SKILL.md and returns a matched-patterns block
 * in the same format doctrineSurface.surfaceDoctrineBlock produces.
 *
 * ANTHROPIC_NATIVE_LEVERAGE §1.4-1.6. Swaps into the assembler's BP3
 * slot under USE_SKILLS_SURFACE=1. Runs alongside doctrineSurface for
 * the 3-day comparison metric skills_vs_doctrine_surface_hit_count;
 * once parity-or-better is confirmed, PR 6 deletes doctrineSurface.
 *
 * Retrieval logic (keyword-match on Skill descriptions):
 *   - Parse each SKILL.md's description frontmatter at load time.
 *   - Tokenise description into lowercased words.
 *   - For an incoming turn content, score each skill by the number of
 *     description tokens that appear (as substrings) in the content.
 *   - Return top-k by score, formatted as <skills_surface>...</skills_surface>.
 *
 * This is a deliberate keyword-match shim, NOT a semantic retrieval layer.
 * §1.6 of ANTHROPIC_NATIVE_LEVERAGE describes a skillRanker with pgvector
 * embeddings; that's a separate PR. The shim is a drop-in replacement for
 * doctrineSurface's keyword grep — comparable semantics, comparable signal,
 * same shape block so shadow comparison is meaningful.
 */

const fs = require('fs')
const path = require('path')
const logger = require('../config/logger')

// Skills directory. Default is backend/.claude/skills (shadow location).
// Post-flip (PR 6) this could move to ../../.claude/skills if SDK consumes it.
const DEFAULT_SKILLS_DIR = path.resolve(__dirname, '..', '..', '.claude', 'skills')

let _cachedIndex = null
let _cachedIndexDir = null

function _tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(t => t.length >= 3)  // skip noise tokens
}

function _loadIndex(dir) {
  if (_cachedIndex && _cachedIndexDir === dir) return _cachedIndex

  const skills = []
  if (!fs.existsSync(dir)) {
    logger.warn('skillsSurfaceService: skills dir not found; surface will return empty', { dir })
    _cachedIndex = skills
    _cachedIndexDir = dir
    return skills
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillFile = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue
    try {
      const raw = fs.readFileSync(skillFile, 'utf8').replace(/\r\n/g, '\n')
      const m = raw.match(/^---\n([\s\S]*?)\n---\n+/)
      let description = ''
      let name = entry.name
      if (m) {
        const front = m[1]
        const nameMatch = front.match(/^name:\s*(.+)$/m)
        if (nameMatch) name = nameMatch[1].trim()
        const descMatch = front.match(/^description:\s*>\n((?:  .+\n?)+)/m)
        if (descMatch) {
          description = descMatch[1].split('\n').map(l => l.replace(/^  /, '')).join(' ').trim()
        } else {
          const descLine = front.match(/^description:\s*(.+)$/m)
          if (descLine) description = descLine[1].trim()
        }
      }
      skills.push({
        name,
        file: skillFile,
        description,
        tokens: _tokenize(description),
      })
    } catch (err) {
      logger.debug('skillsSurfaceService: failed to load skill', { entry: entry.name, error: err.message })
    }
  }

  _cachedIndex = skills
  _cachedIndexDir = dir
  logger.info('skillsSurfaceService: loaded skills index', { count: skills.length, dir })
  return skills
}

/**
 * Surface top-k skills whose description tokens match the turn content.
 *
 * Returns a '<skills_surface>...</skills_surface>' block identical in shape
 * to doctrineSurface's output, so the assembler's BP3 slot receives the
 * same thing either way (swap is transparent to downstream consumers).
 *
 * @param {string} turnContent - the user turn text to match against
 * @param {Object} [options]
 * @param {string} [options.dir=DEFAULT_SKILLS_DIR]
 * @param {number} [options.topK=5]
 * @returns {string} formatted block, or '' if no matches
 */
function surfaceSkillsBlock(turnContent, options = {}) {
  const dir = options.dir || DEFAULT_SKILLS_DIR
  const topK = options.topK || 5

  const contentTokens = new Set(_tokenize(turnContent))
  if (contentTokens.size === 0) return ''

  const index = _loadIndex(dir)
  if (index.length === 0) return ''

  const scored = index
    .map(skill => {
      let score = 0
      for (const tok of skill.tokens) {
        if (contentTokens.has(tok)) score++
      }
      return { skill, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  if (scored.length === 0) return ''

  const lines = scored.map((s, i) => `${i + 1}. [skill] ${s.skill.name}: ${s.skill.description}`)
  return `<skills_surface>\n${lines.join('\n')}\n</skills_surface>`
}

/**
 * Report which skills matched the turn content for the 3-day comparison
 * metric vs doctrineSurface. Does not produce a formatted block — just
 * the matched names. Called in shadow mode alongside doctrineSurface to
 * populate skills_vs_doctrine_surface_hit_count.
 */
function matchedSkillNames(turnContent, options = {}) {
  const dir = options.dir || DEFAULT_SKILLS_DIR
  const topK = options.topK || 10

  const contentTokens = new Set(_tokenize(turnContent))
  if (contentTokens.size === 0) return []

  const index = _loadIndex(dir)
  return index
    .map(skill => {
      let score = 0
      for (const tok of skill.tokens) {
        if (contentTokens.has(tok)) score++
      }
      return { name: skill.name, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.name)
}

function _resetCacheForTest() {
  _cachedIndex = null
  _cachedIndexDir = null
}

module.exports = {
  surfaceSkillsBlock,
  surfaceDoctrineBlock: surfaceSkillsBlock,
  matchedSkillNames,
  matchedFiles: matchedSkillNames,
  _loadIndex,
  _tokenize,
  _resetCacheForTest,
  DEFAULT_SKILLS_DIR,
}

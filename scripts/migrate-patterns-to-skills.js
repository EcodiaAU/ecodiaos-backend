#!/usr/bin/env node
'use strict'

/**
 * migrate-patterns-to-skills.js
 *
 * ANTHROPIC_NATIVE_LEVERAGE §1.3 — translate backend/patterns/*.md into
 * Anthropic Skills frontmatter at backend/.claude/skills/<slug>/SKILL.md.
 *
 * PR 4 ships this as a shadow migration: generated Skills files sit
 * alongside the live doctrineSurface path and are read by
 * skillsSurfaceService under USE_SKILLS_SURFACE=1 for parallel-path
 * comparison. When shadow metrics confirm Skills retrieval is parity-
 * or-better after 3 days, PR 6 deletes doctrineSurface.
 *
 * Pattern file format (input):
 *   ---
 *   triggers: keyword1, keyword2, keyword3
 *   ---
 *
 *   # <title>
 *
 *   <body>
 *
 * Skill file format (output):
 *   ---
 *   name: <slug (from filename)>
 *   description: >
 *     <title>. Surfaces when turn content matches any of:
 *     keyword1, keyword2, keyword3.
 *   ---
 *
 *   # <title>
 *
 *   <body>
 *
 * Usage:
 *   node scripts/migrate-patterns-to-skills.js [--src=PATH] [--out=PATH] [--dry-run]
 *
 *   --src      Source directory (default: backend/patterns)
 *   --out      Output directory (default: backend/.claude/skills)
 *   --dry-run  Print planned outputs, don't write files
 */

const fs = require('fs')
const path = require('path')

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.join('=') || true]
    })
)

const SRC = args.src || path.resolve(__dirname, '..', 'patterns')
const OUT = args.out || path.resolve(__dirname, '..', '.claude', 'skills')
const DRY = !!args['dry-run']

function parsePattern(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  // Normalise line endings so CRLF files parse the same as LF.
  const normalised = raw.replace(/\r\n/g, '\n')
  const m = normalised.match(/^---\n([\s\S]*?)\n---\n+/)
  let triggers = []
  let body = normalised
  if (m) {
    const front = m[1]
    const trigLine = front.split('\n').find(l => l.startsWith('triggers:'))
    if (trigLine) {
      triggers = trigLine.replace(/^triggers:\s*/, '')
        .split(/,\s*/)
        .map(t => t.trim())
        .filter(Boolean)
    }
    body = normalised.slice(m[0].length)
  }
  // Extract first H1 as title
  const h1 = body.match(/^#\s+(.+)$/m)
  const title = h1 ? h1[1].trim() : path.basename(filePath, '.md')
  return { triggers, title, body, raw }
}

function makeSkillContent({ slug, title, triggers, body }) {
  const trigList = triggers.length > 0
    ? triggers.join(', ')
    : '(no explicit triggers — surfaces via semantic match on title)'
  // Keep description to a single line per ANTHROPIC_NATIVE_LEVERAGE §1.3.
  // Anthropic's SDK reads this to decide whether to load the skill body.
  // "Use when..." framing per the spec.
  const description = `Use when the turn involves ${trigList}. Pattern: ${title}.`
  return `---\nname: ${slug}\ndescription: >\n  ${description}\n---\n\n${body}`
}

function migrate() {
  if (!fs.existsSync(SRC)) {
    console.error(`migrate-patterns-to-skills: source dir not found: ${SRC}`)
    process.exit(2)
  }

  const files = fs.readdirSync(SRC)
    .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    .map(f => path.join(SRC, f))

  if (!DRY) {
    fs.mkdirSync(OUT, { recursive: true })
  }

  let created = 0
  let skipped = 0
  const report = []

  for (const filePath of files) {
    const slug = path.basename(filePath, '.md')
    try {
      const { triggers, title, body } = parsePattern(filePath)
      const content = makeSkillContent({ slug, title, triggers, body })
      const outDir = path.join(OUT, slug)
      const outFile = path.join(outDir, 'SKILL.md')
      if (DRY) {
        report.push({ slug, triggers: triggers.length, title, out: outFile })
      } else {
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(outFile, content, 'utf8')
        created++
      }
    } catch (err) {
      console.error(`migrate-patterns-to-skills: ${slug} failed: ${err.message}`)
      skipped++
    }
  }

  const summary = {
    src: SRC,
    out: OUT,
    files_scanned: files.length,
    created: DRY ? 0 : created,
    skipped,
    dry_run: DRY,
  }
  if (DRY) {
    console.log(JSON.stringify({ ...summary, report }, null, 2))
  } else {
    console.log(JSON.stringify(summary, null, 2))
  }
}

if (require.main === module) {
  migrate()
}

module.exports = { parsePattern, makeSkillContent }

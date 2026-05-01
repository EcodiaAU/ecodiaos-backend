#!/usr/bin/env node
'use strict'

/**
 * compare-prompt-assembly.js
 *
 * Developer / CI utility for proving v1↔v2 semantic equivalence without
 * running a live turn. Feeds a synthetic turn_context into the assembler
 * and prints a compact diff. Intended use:
 *
 *   1. Local sanity: `node scripts/compare-prompt-assembly.js` — uses
 *      defaults (d:/.code/EcodiaOS CWD + empty turn_context).
 *   2. CI gate: exit 1 on semantic_equivalent=false.
 *   3. Post-shadow-mode analysis: pull a real turn's inputs from
 *      prompt_assembly_audit and replay here to inspect which block
 *      diverged.
 *
 * Does NOT hit the DB. Does NOT call Claude. Pure string diff.
 *
 * Prerequisites:
 *   Must be run from a tree with node_modules installed (npm install).
 *   The assembler requires ../config/logger which pulls in winston.
 *
 * Usage:
 *   node scripts/compare-prompt-assembly.js [--cwd=PATH] [--fixture=FILE]
 *
 *   --cwd      Path to the directory containing CLAUDE.md (+ optional SELF.md).
 *              Defaults to the first ancestor of this script that contains
 *              CLAUDE.md (so running from backend/scripts just works).
 *   --fixture  JSON file with { session_id, turn_context, v1Text }. If
 *              omitted, a built-in synthetic fixture is used.
 *
 * Exit codes:
 *   0 - semantic_equivalent = true
 *   1 - semantic_equivalent = false (divergence detected)
 *   2 - runtime error (fixture load failure, etc.)
 */

const fs = require('fs')
const path = require('path')

// Arg parsing
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.join('=') || true]
    })
)

function findDefaultCwd() {
  let dir = path.resolve(__dirname, '..')
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) return dir
    dir = path.dirname(dir)
  }
  // Fallback: the script's grandparent (d:/.code/EcodiaOS typically)
  return path.resolve(__dirname, '..', '..')
}

const cwd = args.cwd || findDefaultCwd()

let fixture
if (args.fixture) {
  try {
    fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'))
  } catch (err) {
    console.error(`compare-prompt-assembly: failed to load fixture ${args.fixture}: ${err.message}`)
    process.exit(2)
  }
} else {
  fixture = {
    session_id: 'cmp_synthetic_' + Date.now(),
    turn_context: {
      user_content: 'list open forks',
      now: new Date().toISOString().slice(0, 19),
      forks_rollup: '<forks_rollup>no active forks</forks_rollup>',
      relevant_memory: null,
      recent_doctrine: null,
      restart_recovery: null,
      recent_exchanges: null,
      last_turn_breadcrumb: null,
    },
    // Synthetic v1Text baseline: what the live path would have built.
    // In a real comparison you'd pull this from prompt_assembly_audit.
    v1Text: null,  // computed below from v2 if absent
  }
}

// Require the assembler relative to the backend src tree.
const assembler = require(path.resolve(__dirname, '..', 'src', 'services', 'promptAssembler'))

const v2Out = assembler.assemble({
  cwd,
  session_id: fixture.session_id,
  turn_context: fixture.turn_context,
})

const v2Flat = v2Out.contentBlocks.map(b => b.text).join('')

// If no real v1Text supplied, synthesise it the way PR 2's shadow wire-in does:
//   v1Text = systemPrompt + '\n\n' + userMessage (blocks joined with '\n\n')
// This tests that the assembler's own structured form flattens back to a
// string that matches the assembler's own systemPrompt + userMessage
// concatenation — a weaker assertion than comparing to live-path output,
// but useful as a quick sanity check.
const v1Text = fixture.v1Text || (
  v2Out.systemPrompt +
  (v2Out.userMessage ? '\n\n' + v2Out.userMessage : '')
)

const divergenceIdx = assembler.firstDivergenceIndex(v1Text, v2Flat)
const equivalent = divergenceIdx === null

const summary = {
  cwd,
  session_id: fixture.session_id,
  v1_bytes: v1Text.length,
  v2_bytes: v2Flat.length,
  v2_blocks: v2Out.contentBlocks.length,
  block_sizes: v2Out.contentBlocks.reduce((acc, b) => {
    acc[`bp${b.tier}`] = b.text.length
    return acc
  }, {}),
  cache_control_present: v2Out.contentBlocks.every(b => b.cache_control && b.cache_control.type === 'ephemeral'),
  tier_order: v2Out.contentBlocks.map(b => b.tier),
  semantic_equivalent: equivalent,
  diff_first_divergence: divergenceIdx,
}

console.log(JSON.stringify(summary, null, 2))

if (!equivalent) {
  console.error('')
  console.error(`DIVERGENCE at byte ${divergenceIdx}:`)
  const start = Math.max(0, divergenceIdx - 40)
  const end = Math.min(v1Text.length, divergenceIdx + 40)
  console.error(`  v1: ${JSON.stringify(v1Text.slice(start, end))}`)
  console.error(`  v2: ${JSON.stringify(v2Flat.slice(start, end))}`)
  process.exit(1)
}

process.exit(0)

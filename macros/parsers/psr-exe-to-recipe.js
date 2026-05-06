#!/usr/bin/env node
// psr-exe-to-recipe.js
// Glue: parse a psr.exe MHTML capture, emit a 10-section recipe markdown,
// write to ~/ecodiaos/macros/captures/<flow-slug>-<YYYY-MM-DD-HHMM>.md
//
// Usage:
//   node psr-exe-to-recipe.js <path-to-mhtml> <flow-slug>
//
// Origin: Tate verbatim 6 May 2026 15:32 AEST.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseMhtmlFile } = require('./psr-exe-parser');
const { emitRecipe, timestampSuffix } = require('../lib/recipe-emitter');

function main(argv) {
  const args = argv.slice(2);
  if (args.length < 2) {
    process.stderr.write('Usage: node psr-exe-to-recipe.js <path-to-mhtml> <flow-slug>\n');
    process.exit(2);
  }
  const mhtPath = path.resolve(args[0]);
  const flowSlug = args[1];

  if (!fs.existsSync(mhtPath)) {
    process.stderr.write(`error: file not found: ${mhtPath}\n`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseMhtmlFile(mhtPath);
  } catch (err) {
    process.stderr.write(`parser error: ${err.stack || err.message}\n`);
    process.exit(1);
  }

  if (parsed.parse_warnings && parsed.parse_warnings.length > 0) {
    process.stderr.write('parser warnings:\n');
    for (const w of parsed.parse_warnings) {
      process.stderr.write(`  - ${w}\n`);
    }
  }

  const capturedAt = new Date();
  const md = emitRecipe({
    method: 'psr-exe',
    flow_slug: flowSlug,
    captured_at: capturedAt.toISOString(),
    events: parsed.events,
    window_metadata: parsed.window_metadata,
    extra: {
      raw_step_count: parsed.raw_step_count,
      source_capture: path.basename(mhtPath),
    },
  });

  const outDir = path.join(os.homedir(), 'ecodiaos', 'macros', 'captures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${flowSlug}-${timestampSuffix(capturedAt)}.md`);
  fs.writeFileSync(outPath, md, 'utf8');

  process.stdout.write(`emitted: ${outPath}\n`);
  process.stdout.write(`raw_step_count: ${parsed.raw_step_count}\n`);
  process.stdout.write(`events_parsed: ${parsed.events.length}\n`);
  process.stdout.write(`warnings: ${(parsed.parse_warnings || []).length}\n`);
  process.exit(0);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { main };

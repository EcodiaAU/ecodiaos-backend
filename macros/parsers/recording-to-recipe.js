#!/usr/bin/env node
// recording-to-recipe.js
//
// CLI glue: turn a B1+B2 OS-hook-recorder session directory into a
// 10-section markdown recipe via:
//
//   1. event-joiner.js    - merge events.jsonl + uia-enrichments.jsonl + manifest
//   2. vision-enrich.js   - per-event semantic_description via Claude Sonnet
//   3. recipe-emitter.js  - render the canonical 10-section markdown
//
// Usage:
//   node recording-to-recipe.js <session-dir> <flow-slug> [--no-vision]
//
// Vision auth: routes through the canonical OS Anthropic client
// (~/ecodiaos/src/services/anthropicMessagesClient.js) which uses the
// long-lived OAuth bearer chain (claude_max -> claude_max_2 -> deepseek)
// the same way osSessionService / forkService do for agent loops. No
// ANTHROPIC_API_KEY env var is required - tokens come from
// CLAUDE_CODE_OAUTH_TOKEN_TATE / CLAUDE_CODE_OAUTH_TOKEN_CODE / file-based
// .credentials.json. DeepSeek does not support multimodal images, so if
// the chain falls to deepseek the events get
// vision_skipped_reason=deepseek_no_vision_support and the recipe still
// emits cleanly.
//
// Origin: Worker B3 brief, fork-spawned 6 May 2026 ~05:50 AEST.
// Provider-chain refactor: fork_motuvu0q_de7349, 6 May 2026 ~19:25 AEST.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { joinSession } = require('../lib/event-joiner');
const { enrichWithVision } = require('../lib/vision-enrich');
const { emitRecipe, timestampSuffix } = require('../lib/recipe-emitter');

function usage() {
  process.stderr.write(
    'Usage: node recording-to-recipe.js <session-dir> <flow-slug> [--no-vision]\n',
  );
  process.exit(2);
}

/**
 * Build window_metadata from manifest + observed foreground window titles.
 */
function buildWindowMetadata(manifest, events) {
  const seen = new Map();

  if (manifest && Array.isArray(manifest.observed_windows)) {
    for (const w of manifest.observed_windows) {
      if (w && w.window_title) seen.set(w.window_title, { window_title: w.window_title, program: w.program || null });
    }
  }

  for (const ev of events) {
    const title = ev.window_title;
    if (!title) continue;
    if (!seen.has(title)) {
      seen.set(title, { window_title: title, program: ev.foreground_app_exe || null });
    } else if (!seen.get(title).program && ev.foreground_app_exe) {
      seen.get(title).program = ev.foreground_app_exe;
    }
  }

  return [...seen.values()];
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length < 2) usage();

  const sessionDir = path.resolve(args[0]);
  const flowSlug = args[1];
  const flags = new Set(args.slice(2));
  const noVision = flags.has('--no-vision');

  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    process.stderr.write(`error: not a directory: ${sessionDir}\n`);
    process.exit(1);
  }

  // 1. Join
  const { events, manifest, warnings } = joinSession({ sessionDir });
  for (const w of warnings) process.stderr.write(`joiner-warning: ${w}\n`);

  // 2. Vision (optional). Auth is handled by the canonical OS Anthropic
  //    client - no anthropicKey arg required. If the OS provider chain
  //    falls to deepseek, vision-enrich marks events
  //    vision_skipped_reason=deepseek_no_vision_support automatically.
  let visionStats = { enriched: 0, skipped: 0, errored: 0, total: events.length, aborted: true, abort_reason: 'flag_no_vision' };
  let visionAuthSource = 'skipped';
  if (!noVision) {
    visionAuthSource = 'os_oauth_chain';
    visionStats = await enrichWithVision({
      events,
      sessionDir,
      model: process.env.ANTHROPIC_VISION_MODEL || undefined,
    });
  } else {
    for (const ev of events) ev.vision_skipped_reason = 'flag_no_vision';
  }

  // 3. Emit
  const capturedAt = manifest && manifest.start_ts ? new Date(manifest.start_ts) : new Date();
  const windowMetadata = buildWindowMetadata(manifest, events);

  const md = emitRecipe({
    method: 'os-hook-recorder',
    flow_slug: flowSlug,
    captured_at: capturedAt.toISOString(),
    events,
    window_metadata: windowMetadata,
    extra: {
      raw_event_count: (manifest && manifest.raw_event_count) || events.length,
      vision_enriched_count: visionStats.enriched,
      vision_errored_count: visionStats.errored,
      vision_skipped_count: visionStats.skipped,
      vision_auth_source: visionAuthSource,
      session_id: (manifest && manifest.session_id) || path.basename(sessionDir),
    },
  });

  const outDir = path.join(os.homedir(), 'ecodiaos', 'macros', 'captures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${flowSlug}-${timestampSuffix(capturedAt)}.md`);
  fs.writeFileSync(outPath, md, 'utf8');

  const bytes = fs.statSync(outPath).size;
  process.stdout.write(`emitted: ${outPath}\n`);
  process.stdout.write(`bytes: ${bytes}\n`);
  process.stdout.write(`events_total: ${events.length}\n`);
  process.stdout.write(`vision_enriched: ${visionStats.enriched}\n`);
  process.stdout.write(`vision_errored: ${visionStats.errored}\n`);
  process.stdout.write(`vision_skipped: ${visionStats.skipped}\n`);
  process.stdout.write(`vision_aborted: ${visionStats.aborted ? `yes (${visionStats.abort_reason})` : 'no'}\n`);
  process.stdout.write(`vision_auth_source: ${visionAuthSource}\n`);
  process.stdout.write(`warnings: ${warnings.length}\n`);
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    process.stderr.write(`fatal: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

module.exports = { main, buildWindowMetadata };

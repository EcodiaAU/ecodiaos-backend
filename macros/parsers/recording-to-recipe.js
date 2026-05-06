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
// Anthropic key resolution order:
//   1. kv_store.creds.anthropic.api_key (read via VPS_API_BASE if available)
//   2. env ANTHROPIC_API_KEY
//   3. else: vision skipped gracefully, recipe still emitted
//
// Origin: Worker B3 brief, fork-spawned 6 May 2026 ~05:50 AEST.

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
 * Best-effort kv_store.creds.anthropic.api_key resolution by shelling out to
 * the local supabase psql via the env-injected DATABASE_URL or a CURL to the
 * VPS API. We avoid a hard dep by reading from env first; kv_store is only
 * tried when ANTHROPIC_API_KEY is absent.
 */
function resolveAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
  }
  // No kv_store route from a plain Node CLI without bringing in supabase
  // client. Caller (conductor / fork brief) is expected to inject
  // ANTHROPIC_API_KEY via env when running this CLI. Document the gap.
  return { key: null, source: 'missing' };
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

  // 2. Vision (optional)
  let visionStats = { enriched: 0, skipped: 0, errored: 0, total: events.length, aborted: true, abort_reason: 'flag_no_vision' };
  let keySource = 'skipped';
  if (!noVision) {
    const { key, source } = resolveAnthropicKey();
    keySource = source;
    visionStats = await enrichWithVision({
      events,
      sessionDir,
      anthropicKey: key,
      model: process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-4-7-20251022',
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
      anthropic_key_source: keySource,
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
  process.stdout.write(`anthropic_key_source: ${keySource}\n`);
  process.stdout.write(`warnings: ${warnings.length}\n`);
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    process.stderr.write(`fatal: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

module.exports = { main, buildWindowMetadata, resolveAnthropicKey };

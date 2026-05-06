// vision-enrich.js
//
// Adds a one-sentence `semantic_description` to each click event in a
// joined-event stream by sending pre + post screenshots through the
// canonical OS Anthropic client (see ~/ecodiaos/src/services/anthropicMessagesClient.js).
//
// Provider chain (mirrors osSessionService / forkService for one-shot calls):
//   claude_max -> claude_max_2 -> deepseek (text-only; vision skipped here)
// Per ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md.
//
// Refactor 6 May 2026 (fork_motuvu0q_de7349): replaced the local raw
// `x-api-key` /v1/messages POST + ANTHROPIC_API_KEY surface with
// anthropicMessagesClient.createMessage, which uses the long-lived OAuth
// bearer + `anthropic-beta: oauth-2025-04-20` header and falls back across
// claude_max -> claude_max_2 -> deepseek. Per
// ~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md
// the local single-vendor postMessages was parallel infrastructure to the
// OS provider chain - this rewires through the canonical client.
//
// Public API:
//   await enrichWithVision({events, sessionDir, model?, maxConcurrency?,
//                          messagesClient?})
//     -> mutates `events[i].semantic_description` (or .vision_error /
//        .vision_skipped_reason)
//     -> returns { enriched, skipped, errored, total, aborted?, abort_reason? }
//
// Cost guard:
//   - Hard abort with `vision_skipped_reason = "event_count_exceeded_100"`
//     when click events > 100. Manager retunes.
//
// Concurrency:
//   - Default 4 in-flight requests at once.
//
// Vision-on-deepseek:
//   - DeepSeek's Anthropic-compat proxy returns "[Unsupported Image]" for
//     image content blocks (verified empirically 2026-05-06). When the
//     canonical client has fallen to deepseek, createMessage returns
//     { vision_unsupported: true } and we mark events
//     `vision_skipped_reason = "deepseek_no_vision_support"`.
//
// Origin: Worker B3 brief, fork-spawned 6 May 2026 ~05:50 AEST.
// Provider-chain refactor: fork_motuvu0q_de7349, 6 May 2026 ~19:25 AEST,
// codifies the OS provider chain for vision rather than carrying its own
// API-key surface.

'use strict';

const fs = require('fs');
const path = require('path');

// Default sonnet model on the OAuth chain. Verified live 2026-05-06 via
// /v1/models: claude-sonnet-4-7-20251022 returns 404 on the OAuth chain;
// claude-sonnet-4-6 is the current sonnet ID. Override via
// ANTHROPIC_VISION_MODEL env or `model` arg if a newer ID rolls out.
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_CONCURRENCY = 4;
const HARD_EVENT_CAP = 100;

const SYSTEM_PROMPT =
  'You analyze GUI recordings. Given a pre-state screenshot, post-state ' +
  'screenshot, click coordinates, foreground window, and UIA selector, ' +
  'describe in ONE sentence what the user did and what changed. Do not ' +
  'speculate beyond visible evidence. Format: "<verb> the <semantic role of ' +
  'click target>; <observed UI change>". Example: "Clicked the File menu; ' +
  'submenu opened with New, Open, Save".';

/**
 * Read a screenshot file as base64. Returns null if missing.
 */
function readImageBase64(absPath) {
  if (!absPath) return null;
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath).toString('base64');
}

/**
 * Resolve a screenshot path against sessionDir if it's relative.
 */
function resolveScreenshotPath(sessionDir, ssPath) {
  if (!ssPath) return null;
  if (path.isAbsolute(ssPath)) return ssPath;
  return path.join(sessionDir, ssPath);
}

/**
 * Build the user message content blocks for a single event.
 */
function buildUserContent({ event, sessionDir }) {
  const parts = [];

  const meta = {
    timestamp: event.timestamp || null,
    coords: { x: event.x, y: event.y },
    window: event.window_title || null,
    app_exe: event.foreground_app_exe || null,
    uia_selector: event.target_uia_selector || null,
    event_type: event.raw_event_type || event.type,
  };

  parts.push({
    type: 'text',
    text:
      'Event metadata:\n' +
      JSON.stringify(meta, null, 2) +
      '\n\nPre-state screenshot: image #1\nPost-state screenshot: image #2',
  });

  const preB64 = readImageBase64(resolveScreenshotPath(sessionDir, event.screenshot_pre_path));
  const postB64 = readImageBase64(resolveScreenshotPath(sessionDir, event.screenshot_post_path));

  if (preB64) {
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: preB64 },
    });
  }
  if (postB64) {
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: postB64 },
    });
  }

  return parts;
}

/**
 * Extract the assistant text from an Anthropic /v1/messages response.
 */
function extractText(json) {
  if (!json || !Array.isArray(json.content)) return null;
  const textBlock = json.content.find(b => b.type === 'text');
  return textBlock ? (textBlock.text || '').trim() : null;
}

/**
 * Process one event via the canonical messages client. Mutates
 * event.semantic_description / event.vision_error / event.vision_skipped_reason
 * in place.
 *
 * Special-case: if the canonical client returns { vision_unsupported: true }
 * (the chain fell through to deepseek), mark a skip reason rather than an
 * error - the recipe is still useful without per-event vision.
 */
async function processOne({ event, sessionDir, model, messagesClient }) {
  const hasPre = event.screenshot_pre_path && fs.existsSync(resolveScreenshotPath(sessionDir, event.screenshot_pre_path));
  const hasPost = event.screenshot_post_path && fs.existsSync(resolveScreenshotPath(sessionDir, event.screenshot_post_path));
  if (!hasPre && !hasPost) {
    event.vision_skipped_reason = 'no_screenshots_available';
    return { skipped: true };
  }

  const messages = [{ role: 'user', content: buildUserContent({ event, sessionDir }) }];

  try {
    const result = await messagesClient.createMessage({
      messages,
      system: SYSTEM_PROMPT,
      model,
      max_tokens: 200,
      allowVision: true,
    });

    if (result.vision_unsupported) {
      event.vision_skipped_reason = 'deepseek_no_vision_support';
      return { skipped: true, deepseekFallback: true };
    }

    const text = extractText(result.json);
    if (text) {
      event.semantic_description = text;
      event.vision_provider_used = result.providerUsed;
      return { ok: true };
    }
    event.vision_error = 'empty_response';
    return { errored: true };
  } catch (err) {
    event.vision_error = err && err.message ? err.message : String(err);
    return { errored: true };
  }
}

/**
 * Run a bounded-concurrency worker pool over an array of tasks.
 */
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIdx = 0;
  async function runner() {
    while (true) {
      const i = nextIdx;
      nextIdx += 1;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (err) { results[i] = { errored: true, error: err }; }
    }
  }
  const runnerCount = Math.max(1, concurrency);
  const runners = [];
  for (let n = 0; n < runnerCount; n += 1) runners.push(runner());
  await Promise.all(runners);
  return results;
}

/**
 * Public: enrich joined events in-place with semantic_description.
 *
 * Mutates event objects. Returns counters.
 *
 * messagesClient is injectable for tests; defaults to the canonical OS
 * client at ~/ecodiaos/src/services/anthropicMessagesClient.js.
 */
async function enrichWithVision({
  events,
  sessionDir,
  model = DEFAULT_MODEL,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  messagesClient = null,
}) {
  if (!Array.isArray(events)) throw new Error('enrichWithVision: events array required');
  if (!sessionDir) throw new Error('enrichWithVision: sessionDir required');

  // Late-require so tests can stub before any module init side-effect.
  const client = messagesClient || require('../../src/services/anthropicMessagesClient');

  const out = { enriched: 0, skipped: 0, errored: 0, total: events.length, aborted: false };

  // Only click-shaped events benefit from vision pre/post diffing
  const visualisable = events.filter(ev => ['click', 'rightclick', 'doubleclick'].includes(ev.type));
  if (visualisable.length > HARD_EVENT_CAP) {
    for (const ev of events) ev.vision_skipped_reason = 'event_count_exceeded_100';
    out.skipped = events.length;
    out.aborted = true;
    out.abort_reason = 'event_count_exceeded_100';
    return out;
  }

  const results = await runPool(
    visualisable,
    (ev) => processOne({ event: ev, sessionDir, model, messagesClient: client }),
    maxConcurrency,
  );

  for (const r of results) {
    if (!r) continue;
    if (r.ok) out.enriched += 1;
    else if (r.skipped) out.skipped += 1;
    else if (r.errored) out.errored += 1;
  }
  // Non-click events are implicitly skipped from vision
  const nonVisualSkipped = events.length - visualisable.length;
  out.skipped += nonVisualSkipped;
  for (const ev of events) {
    if (!['click', 'rightclick', 'doubleclick'].includes(ev.type) && !ev.vision_skipped_reason) {
      ev.vision_skipped_reason = 'event_not_click_type';
    }
  }

  return out;
}

module.exports = {
  enrichWithVision,
  // exposed for tests
  DEFAULT_MODEL,
  HARD_EVENT_CAP,
  _internal: { buildUserContent, extractText, runPool, resolveScreenshotPath },
};

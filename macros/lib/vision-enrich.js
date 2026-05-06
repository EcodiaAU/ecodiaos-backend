// vision-enrich.js
//
// Adds a one-sentence `semantic_description` to each click event in a
// joined-event stream by sending pre + post screenshots through the Anthropic
// vision API (Claude Sonnet 4.7). Per
// ~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md
// we hit api.anthropic.com directly: no proxy, no custom vision shim.
//
// Public API:
//   await enrichWithVision({events, sessionDir, anthropicKey, model?, maxConcurrency?})
//     -> mutates `events[i].semantic_description` (or .vision_error / .vision_skipped_reason)
//     -> returns { enriched, skipped, errored, total }
//
// Cost guard:
//   - Hard abort with `vision_skipped_reason = "event_count_exceeded_100"`
//     when click events > 100. Manager retunes.
//
// Concurrency:
//   - Default 4 in-flight requests at once.
//
// Retry:
//   - 3 attempts with exponential backoff on 429 / 5xx / network errors.
//
// Origin: Worker B3 brief, fork-spawned 6 May 2026 ~05:50 AEST.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_MODEL = 'claude-sonnet-4-7-20251022';
const DEFAULT_MAX_CONCURRENCY = 4;
const HARD_EVENT_CAP = 100;
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT =
  'You analyze GUI recordings. Given a pre-state screenshot, post-state ' +
  'screenshot, click coordinates, foreground window, and UIA selector, ' +
  'describe in ONE sentence what the user did and what changed. Do not ' +
  'speculate beyond visible evidence. Format: "<verb> the <semantic role of ' +
  'click target>; <observed UI change>". Example: "Clicked the File menu; ' +
  'submenu opened with New, Open, Save".';

/**
 * POST a JSON payload to api.anthropic.com /v1/messages.
 * Returns the parsed JSON response on 2xx, or throws an Error tagged with
 * .status / .retryable for the caller's retry loop.
 */
function postMessages({ apiKey, payload }) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status >= 200 && status < 300) {
          try { resolve({ status, json: JSON.parse(data) }); }
          catch (err) {
            const e = new Error(`json parse failed: ${err.message}`);
            e.status = status;
            e.retryable = false;
            reject(e);
          }
          return;
        }
        const err = new Error(`anthropic api ${status}: ${data.slice(0, 500)}`);
        err.status = status;
        err.retryable = status === 429 || status >= 500;
        reject(err);
      });
    });
    req.on('error', (err) => {
      err.retryable = true;
      reject(err);
    });
    // 60s timeout per request
    req.setTimeout(60_000, () => {
      req.destroy(Object.assign(new Error('anthropic api request timeout'), { retryable: true }));
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
 * Process one event with retry. Mutates event.semantic_description /
 * event.vision_error in place.
 */
async function processOne({ event, sessionDir, apiKey, model }) {
  // Skip events without any screenshot; vision adds nothing.
  const hasPre = event.screenshot_pre_path && fs.existsSync(resolveScreenshotPath(sessionDir, event.screenshot_pre_path));
  const hasPost = event.screenshot_post_path && fs.existsSync(resolveScreenshotPath(sessionDir, event.screenshot_post_path));
  if (!hasPre && !hasPost) {
    event.vision_skipped_reason = 'no_screenshots_available';
    return { skipped: true };
  }

  const payload = {
    model,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent({ event, sessionDir }) }],
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { json } = await postMessages({ apiKey, payload });
      const text = extractText(json);
      if (text) {
        event.semantic_description = text;
        return { ok: true };
      }
      event.vision_error = 'empty_response';
      return { errored: true };
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === MAX_ATTEMPTS) break;
      const backoffMs = 500 * Math.pow(2, attempt - 1);
      await sleep(backoffMs);
    }
  }

  event.vision_error = lastErr ? (lastErr.message || String(lastErr)) : 'unknown_error';
  return { errored: true };
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
  const runners = Array.from({ length: Math.max(1, concurrency) }, runner);
  await Promise.all(runners.map(r => r()));
  return results;
}

/**
 * Public: enrich joined events in-place with semantic_description.
 *
 * Mutates event objects. Returns counters.
 */
async function enrichWithVision({
  events,
  sessionDir,
  anthropicKey,
  model = DEFAULT_MODEL,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
}) {
  if (!Array.isArray(events)) throw new Error('enrichWithVision: events array required');
  if (!sessionDir) throw new Error('enrichWithVision: sessionDir required');

  const out = { enriched: 0, skipped: 0, errored: 0, total: events.length, aborted: false };

  if (!anthropicKey) {
    for (const ev of events) ev.vision_skipped_reason = 'no_anthropic_key';
    out.skipped = events.length;
    out.aborted = true;
    out.abort_reason = 'no_anthropic_key';
    return out;
  }

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
    (ev) => processOne({ event: ev, sessionDir, apiKey: anthropicKey, model }),
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
  _internal: { postMessages, buildUserContent, extractText, runPool, resolveScreenshotPath },
};

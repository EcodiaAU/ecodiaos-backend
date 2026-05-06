// event-joiner.js
//
// Joins B1's events.jsonl + B2's uia-enrichments.jsonl + manifest.json into a
// single enriched events array, normalised for consumption by:
//   - vision-enrich.js  (adds semantic_description per event via Claude vision)
//   - recipe-emitter.js (emits the 10-section markdown recipe)
//
// Input contracts (from the B1 + B2 capture pipeline):
//   events.jsonl       - one JSON per line, schema in worker brief
//   uia-enrichments.jsonl - one JSON per line, schema in worker brief
//   manifest.json      - session metadata
//
// Output contract:
//   { events: [...], manifest: {...}, warnings: [...] }
//
//   Each event in `events` is normalised to the recipe-emitter event shape so
//   downstream emitter calls just work:
//     {
//       step_number, type, x, y, target_text, uia_selector_hint,
//       window_title, timestamp, raw_timestamp, raw_step_text,
//       screenshot_pre_path, screenshot_post_path,
//       target_uia_selector,
//       foreground_app_exe,
//       semantic_description, vision_error, vision_skipped_reason
//     }
//
// Filters out internal meta events (record_start, record_stop, hotkey_press)
// so they don't pollute the recipe step list. `denylist_skip` and
// `post_capture` are also filtered (post_capture is folded into its parent
// click event's `screenshot_post_path`).
//
// Origin: Worker B3 brief, fork-spawned 6 May 2026 ~05:50 AEST.

'use strict';

const fs = require('fs');
const path = require('path');

const INTERNAL_META_TYPES = new Set([
  'record_start',
  'record_stop',
  'hotkey_press',
  'denylist_skip',
]);

/**
 * Read a JSONL file and return an array of parsed objects. Skips blank lines
 * and pushes a warning for any line that fails to parse.
 *
 * @param {string} filePath
 * @param {Array<string>} warnings  mutated
 * @returns {Array<Object>}
 */
function readJsonl(filePath, warnings) {
  if (!fs.existsSync(filePath)) {
    warnings.push(`missing file: ${filePath}`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = [];
  const lines = raw.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      out.push(JSON.parse(trimmed));
    } catch (err) {
      warnings.push(`parse error in ${path.basename(filePath)} line ${idx + 1}: ${err.message}`);
    }
  });
  return out;
}

/**
 * Read manifest.json. Returns {} on missing/invalid.
 */
function readManifest(filePath, warnings) {
  if (!fs.existsSync(filePath)) {
    warnings.push(`missing manifest: ${filePath}`);
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    warnings.push(`manifest parse error: ${err.message}`);
    return {};
  }
}

/**
 * Map B1 event_type to the canonical recipe-emitter `type` field.
 */
function normaliseType(eventType) {
  switch (eventType) {
    case 'click_left': return 'click';
    case 'click_right': return 'rightclick';
    case 'click_middle': return 'click';
    case 'doubleclick': return 'doubleclick';
    case 'key_down':
    case 'key_combo':
    case 'key_press':
      return 'keypress';
    case 'drag': return 'drag';
    default: return null; // meta events filter below
  }
}

/**
 * Build a short UIA selector hint string from a B2 enrichment selector blob.
 */
function selectorHint(sel) {
  if (!sel) return null;
  const parts = [];
  if (sel.control_type) parts.push(`type=${sel.control_type}`);
  if (sel.name) parts.push(`name="${sel.name}"`);
  if (sel.automation_id) parts.push(`automation_id=${sel.automation_id}`);
  if (sel.class_name && !sel.automation_id) parts.push(`class=${sel.class_name}`);
  return parts.length ? parts.join(' ') : null;
}

/**
 * Best-effort target text from selector + raw event.
 */
function targetText(sel, ev) {
  if (sel && sel.name) return sel.name;
  if (ev.key) return ev.key;
  return null;
}

/**
 * Public API: join a session directory into a normalised events array.
 *
 * @param {Object} opts
 * @param {string} opts.sessionDir  absolute path to recording session dir
 * @returns {{events: Array, manifest: Object, warnings: Array<string>}}
 */
function joinSession({ sessionDir }) {
  if (!sessionDir) throw new Error('joinSession: sessionDir is required');
  const warnings = [];

  const eventsPath = path.join(sessionDir, 'events.jsonl');
  const uiaPath = path.join(sessionDir, 'uia-enrichments.jsonl');
  const manifestPath = path.join(sessionDir, 'manifest.json');

  const rawEvents = readJsonl(eventsPath, warnings);
  const enrichments = readJsonl(uiaPath, warnings);
  const manifest = readManifest(manifestPath, warnings);

  // Index UIA enrichments by event_index
  const enrichmentByIdx = new Map();
  for (const enr of enrichments) {
    if (typeof enr.event_index === 'number') {
      enrichmentByIdx.set(enr.event_index, enr);
    }
  }

  // Index post_capture meta events by parent_event_index so we can stitch
  // post-screenshots onto their parent clicks.
  const postCaptureByParentIdx = new Map();
  for (const ev of rawEvents) {
    if (ev.event_type === 'meta' && ev.meta_type === 'post_capture') {
      const parent = ev.parent_event_index;
      if (typeof parent === 'number') {
        postCaptureByParentIdx.set(parent, ev);
      }
    }
  }

  // Normalise events
  const out = [];
  let stepNumber = 0;
  for (const ev of rawEvents) {
    // Filter meta events that should not appear in recipe steps
    if (ev.event_type === 'meta') {
      if (INTERNAL_META_TYPES.has(ev.meta_type)) continue;
      if (ev.meta_type === 'post_capture') continue; // folded into parent
      // Other meta types (e.g. unknown) - log but skip
      warnings.push(`unrecognised meta_type "${ev.meta_type}" at event_index ${ev.event_index}`);
      continue;
    }

    const type = normaliseType(ev.event_type);
    if (!type) {
      warnings.push(`unrecognised event_type "${ev.event_type}" at event_index ${ev.event_index}`);
      continue;
    }

    stepNumber += 1;
    const enr = enrichmentByIdx.get(ev.event_index) || null;
    const sel = enr ? enr.target_uia_selector : null;
    const post = postCaptureByParentIdx.get(ev.event_index) || null;

    const screenshotPostPath = (post && post.screenshot_path)
      ? post.screenshot_path
      : (ev.screenshot_post_path || null);

    const normalised = {
      step_number: stepNumber,
      event_index: ev.event_index,
      type,
      raw_event_type: ev.event_type,
      x: (ev.x === undefined) ? null : ev.x,
      y: (ev.y === undefined) ? null : ev.y,
      button: ev.button || null,
      key: ev.key || null,
      keyboard_input: ev.key || null,
      target_text: targetText(sel, ev),
      uia_selector_hint: selectorHint(sel),
      target_uia_selector: sel,
      uia_query_status: enr ? enr.uia_query_status : 'absent',
      uia_query_duration_ms: enr ? enr.uia_query_duration_ms : null,
      window_title: ev.foreground_window_title || null,
      foreground_app_exe: ev.foreground_app_exe || null,
      timestamp: ev.timestamp || null,
      raw_timestamp: ev.timestamp || null,
      raw_step_text: null,
      screenshot_pre_path: ev.screenshot_pre_path || null,
      screenshot_post_path: screenshotPostPath,
      screenshot_cid: null,
      // Filled in by vision-enrich.js
      semantic_description: null,
      vision_error: null,
      vision_skipped_reason: null,
    };

    out.push(normalised);
  }

  return { events: out, manifest, warnings };
}

module.exports = {
  joinSession,
  // exposed for tests
  _internal: { readJsonl, normaliseType, selectorHint, targetText },
};

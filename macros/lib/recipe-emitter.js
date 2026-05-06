// recipe-emitter.js
// Shared library for emitting GUI-recipe markdown files from a captured
// event stream. Used by:
//   - psr-exe-to-recipe.js           (Worker A, Win Problem Steps Recorder)
//   - os-hook-recorder-to-recipe.js  (Worker B, custom hook recorder)
//
// Output conforms to the 10-section recipe anatomy from
// ~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md
//
// All emitted recipes carry frontmatter `status: untested_spec` until a real
// replay run flips them to `validated_v1` per
// ~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md
//
// Origin: Tate verbatim 6 May 2026 15:32 AEST.

'use strict';

/**
 * The canonical 10-section anatomy. Workers MUST emit recipes with these
 * sections in this order, even when content is a TODO placeholder.
 */
const ANATOMY_SECTIONS = [
  'Origin',
  'When to use this',
  'Pre-flight',
  'Verified coordinates table',
  'Step-by-step procedure',
  'Verification protocol',
  'Fast-path checklist',
  'Speed wins identified',
  'Failure modes',
  'Anti-patterns',
];

/**
 * Build a kebab-case keyword list suitable for the `triggers:` frontmatter.
 *
 * Combines flow_slug words with words extracted from window titles. Workers B
 * can reuse this to keep trigger sets consistent across capture methods.
 *
 * @param {string} flowSlug e.g. "puppeteer-test-flow"
 * @param {Array<{window_title: string}>} windowMetadata
 * @returns {string} comma-separated kebab-case keywords
 */
function buildTriggers(flowSlug, windowMetadata = []) {
  const out = new Set();
  out.add('macro-recipe');
  out.add('captured-recipe');

  if (flowSlug) {
    out.add(slugify(flowSlug));
    flowSlug.split(/[-_\s]+/).filter(Boolean).forEach(w => out.add(slugify(w)));
  }

  for (const w of windowMetadata) {
    if (w && w.window_title) {
      // window titles like "Untitled - Notepad" or "DuckDuckGo - Mozilla Firefox"
      const words = w.window_title
        .split(/[-–|·•:]/)
        .flatMap(s => s.split(/\s+/))
        .map(s => slugify(s))
        .filter(s => s && s.length >= 3 && !STOPWORDS.has(s));
      words.forEach(s => out.add(s));
    }
    if (w && w.program) {
      const p = slugify(w.program);
      if (p) out.add(p);
    }
  }

  // Drop excessively short / generic tokens
  return [...out].filter(t => t.length >= 3).join(', ');
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'this', 'that',
  'untitled', 'window', 'page', 'tab', 'app', 'application',
]);

/**
 * Produce a kebab-case slug.
 */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Format an ISO timestamp for filename suffixes (YYYY-MM-DD-HHMM, UTC).
 */
function timestampSuffix(date = new Date()) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

/**
 * Emit a 10-section markdown recipe.
 *
 * @param {Object} input
 * @param {string} input.method                  capture method: 'psr-exe' | 'os-hook-recorder'
 * @param {string} input.flow_slug               kebab-case flow name
 * @param {string|Date} input.captured_at        ISO timestamp
 * @param {Array} input.events                   normalised events from the parser
 * @param {Array} input.window_metadata          [{window_title, program}]
 * @param {Object} [input.extra]                 optional extra metadata to inject as frontmatter
 * @returns {string} markdown body
 */
function emitRecipe({
  method,
  flow_slug,
  captured_at,
  events = [],
  window_metadata = [],
  extra = {},
}) {
  if (!method) throw new Error('emitRecipe: method is required');
  if (!flow_slug) throw new Error('emitRecipe: flow_slug is required');

  const capturedIso = (captured_at instanceof Date)
    ? captured_at.toISOString()
    : (captured_at || new Date().toISOString());

  const triggers = buildTriggers(flow_slug, window_metadata);

  // ---- Frontmatter ----------------------------------------------------
  const frontmatterLines = [
    '---',
    `triggers: ${triggers}`,
    `capture_method: ${method}`,
    `captured_at: ${capturedIso}`,
    `flow_slug: ${flow_slug}`,
    'status: untested_spec',
  ];
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      frontmatterLines.push(`${k}: ${v}`);
    }
  }
  frontmatterLines.push('---', '');

  // ---- H1 Title -------------------------------------------------------
  const title = `# ${humaniseSlug(flow_slug)} (captured via ${method})`;

  // ---- Section 1: Origin ----------------------------------------------
  const sec1 = sectionHeader('Origin') +
    `Auto-emitted from a ${method} capture run on ${capturedIso}.\n\n` +
    `<!-- TODO: replace with the Tate-verbatim Origin quote + date + initial event that produced this recipe. -->\n`;

  // ---- Section 2: When to use this ------------------------------------
  const sec2 = sectionHeader('When to use this') +
    '<!-- TODO: state the trigger condition for invoking this recipe vs an alternative. -->\n' +
    `Inferred destination(s): ${formatWindowList(window_metadata) || '(no window metadata captured)'}\n`;

  // ---- Section 3: Pre-flight ------------------------------------------
  const sec3 = sectionHeader('Pre-flight') +
    '<!-- TODO: list kv_store creds, state assumptions, prerequisite tools, foreground requirements (cowork-no-focus-collision check). -->\n' +
    '\nProgram(s) involved:\n' +
    (window_metadata.length === 0
      ? '- (none captured)\n'
      : window_metadata.map(w => `- ${w.window_title || '(unknown window)'}${w.program ? ` (program: ${w.program})` : ''}`).join('\n') + '\n');

  // ---- Section 4: Verified coordinates table --------------------------
  const sec4 = sectionHeader('Verified coordinates table') +
    coordsTable(events) +
    '\n<!-- Coordinates above were captured at recording time. Re-verify against the live UI before codifying as `validated_v1`. -->\n';

  // ---- Section 5: Step-by-step procedure ------------------------------
  const sec5 = sectionHeader('Step-by-step procedure') +
    stepByStepProcedure(events);

  // ---- Section 6: Verification protocol -------------------------------
  const sec6 = sectionHeader('Verification protocol') +
    '<!-- TODO: per-step pre/post-verify probes (see ~/ecodiaos/patterns/gui-step-verify-protocol.md). -->\n\n' +
    '| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |\n' +
    '|---|---|---|---|---|\n' +
    perStepVerifyTable(events);

  // ---- Section 7: Fast-path checklist ---------------------------------
  const sec7 = sectionHeader('Fast-path checklist') +
    '<!-- TODO: optimised cmd-by-cmd run with verified end-to-end target timing. After validation, replace this stub with the codified fast path. -->\n\n' +
    '```\n' +
    fastPathStub(events) +
    '```\n';

  // ---- Section 8: Speed wins identified -------------------------------
  const sec8 = sectionHeader('Speed wins identified') +
    '<!-- TODO: annotated TODOs for the next optimisation pass. -->\n\n' +
    '- [ ] Batch consecutive `input.*` calls into a single `shell.shell` PowerShell SendInput to remove per-call Tailscale RTT.\n' +
    '- [ ] Replace any fixed-sleep with a UIA state-probe loop where the next-step element exposes a queryable property.\n' +
    '- [ ] Walk the UI tree at replay time to upgrade pixel-clicks to programmatic UIA pattern mutation where supported.\n';

  // ---- Section 9: Failure modes ---------------------------------------
  const sec9 = sectionHeader('Failure modes') +
    '<!-- TODO: capture symptom + cause + fix as you encounter them during replay. -->\n\n' +
    '- Symptom: <fill in>. Cause: <fill in>. Fix: <fill in>\n';

  // ---- Section 10: Anti-patterns --------------------------------------
  const sec10 = sectionHeader('Anti-patterns') +
    '- Pixel-click first when UI Automation works on the target. Walk the tree, prefer `InvokePattern`/`ValuePattern`/`TogglePattern` mutation.\n' +
    '- Authoring coords from imagination - this recipe was captured from a real run; do NOT amend coords without a fresh recording or live UIA enumeration.\n' +
    '- Marking this recipe `validated_v1` without a real replay. The capture proves the flow happened once; it does NOT prove the codified replay path works.\n';

  // ---- Cross-references ----------------------------------------------
  const crossRefs = '\n## Cross-references\n\n' +
    '- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the meta-doctrine this recipe instantiates.\n' +
    '- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - status flips to `validated_v1` only after a real replay run.\n' +
    `- \`~/ecodiaos/patterns/macro-capture-via-${method}.md\` - capture-method-specific doctrine.\n` +
    '- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - the per-step pre/post-verify protocol all recipes implement.\n';

  return [
    frontmatterLines.join('\n'),
    title,
    '',
    sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10,
    crossRefs,
  ].join('\n');
}

/**
 * Render an H2 heading with consistent spacing.
 */
function sectionHeader(name) {
  return `\n## ${name}\n\n`;
}

/**
 * Format a window-list as a comma-joined human-readable string.
 */
function formatWindowList(windowMetadata) {
  if (!windowMetadata || windowMetadata.length === 0) return '';
  return windowMetadata.map(w => w.window_title || '(unknown)').join(', ');
}

/**
 * Build the verified-coordinates markdown table from events.
 *
 * Each click event with x/y produces one row. Events without coords get a
 * UIA-selector row so they're still discoverable for replay.
 */
function coordsTable(events) {
  const head = '\n| Step | Action | X | Y | Target text | UIA selector hint | Window | Captured-at |\n' +
               '|---|---|---|---|---|---|---|---|\n';
  if (!events || events.length === 0) {
    return head + '| (no events captured) | | | | | | | |\n';
  }
  const rows = events.map(ev => {
    const x = (ev.x === null || ev.x === undefined) ? '-' : ev.x;
    const y = (ev.y === null || ev.y === undefined) ? '-' : ev.y;
    return `| ${ev.step_number} | ${ev.type || 'unknown'} | ${x} | ${y} | ${escapeMd(ev.target_text)} | ${escapeMd(ev.uia_selector_hint)} | ${escapeMd(ev.window_title)} | ${ev.timestamp || ev.raw_timestamp || '-'} |`;
  }).join('\n');
  return head + rows + '\n';
}

/**
 * Build the descriptive step-by-step procedure section.
 */
function stepByStepProcedure(events) {
  if (!events || events.length === 0) {
    return '_(no events captured - this recipe is structural only until re-recorded)_\n';
  }
  return events.map(ev => {
    const tsBit = ev.timestamp ? ` (\`${ev.timestamp}\`)` : '';
    const winBit = ev.window_title ? ` in **${ev.window_title}**` : '';
    let actionDesc;
    switch (ev.type) {
      case 'click':
        actionDesc = `Left-click on **${ev.target_text || '(unknown target)'}**${winBit}`;
        break;
      case 'doubleclick':
        actionDesc = `Double-click on **${ev.target_text || '(unknown target)'}**${winBit}`;
        break;
      case 'rightclick':
        actionDesc = `Right-click on **${ev.target_text || '(unknown target)'}**${winBit}`;
        break;
      case 'keypress':
        actionDesc = `Keyboard input${winBit}${ev.keyboard_input ? ` - typed: \`${ev.keyboard_input}\`` : ''}`;
        break;
      case 'drag':
        actionDesc = `Drag${winBit}`;
        break;
      default:
        actionDesc = `Action${winBit}: ${escapeMd(ev.raw_step_text || '')}`;
    }
    let extras = '';
    if (ev.uia_selector_hint) extras += `\n  - UIA: \`${ev.uia_selector_hint}\``;
    if (ev.x !== null && ev.x !== undefined) extras += `\n  - Pixel coords (fallback): \`(${ev.x}, ${ev.y})\``;
    if (ev.screenshot_cid) extras += `\n  - Screenshot CID: \`${ev.screenshot_cid}\``;
    return `${ev.step_number}. ${actionDesc}${tsBit}${extras}`;
  }).join('\n\n') + '\n';
}

/**
 * Build a per-step pre/post-verify table stub. One row per event.
 * Operator fills in the verify probes during recipe authoring.
 */
function perStepVerifyTable(events) {
  if (!events || events.length === 0) {
    return '| (none) | | | | |\n';
  }
  return events.map(ev => {
    const action = describeActionShort(ev);
    return `| ${ev.step_number} | <!-- TODO --> | ${action} | <!-- TODO --> | <!-- TODO --> |`;
  }).join('\n') + '\n';
}

/**
 * Generate a fast-path stub that names each step as a one-liner.
 * Operator replaces with the actual batched/optimised commands during
 * the optimisation pass.
 */
function fastPathStub(events) {
  if (!events || events.length === 0) {
    return '# (no events captured - regenerate after a real recording)\n';
  }
  return events.map(ev => {
    return `# Step ${ev.step_number}: ${describeActionShort(ev)}`;
  }).join('\n') + '\n';
}

/**
 * Short single-line description of an action for tables/checklists.
 */
function describeActionShort(ev) {
  const win = ev.window_title ? ` in "${ev.window_title}"` : '';
  switch (ev.type) {
    case 'click': return `click "${ev.target_text || '?'}"${win}`;
    case 'doubleclick': return `double-click "${ev.target_text || '?'}"${win}`;
    case 'rightclick': return `right-click "${ev.target_text || '?'}"${win}`;
    case 'keypress': return `type${win}${ev.keyboard_input ? ` "${ev.keyboard_input}"` : ''}`;
    case 'drag': return `drag${win}`;
    default: return `unknown${win}`;
  }
}

/**
 * Escape characters that would break a markdown table cell.
 */
function escapeMd(v) {
  if (v === null || v === undefined) return '-';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Convert a kebab-slug to a Title Case string for the H1.
 */
function humaniseSlug(slug) {
  return String(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = {
  emitRecipe,
  ANATOMY_SECTIONS,
  // helpers exposed for Worker B reuse
  buildTriggers,
  slugify,
  timestampSuffix,
  humaniseSlug,
  // exposed for unit-style introspection
  _internal: {
    coordsTable,
    stepByStepProcedure,
    perStepVerifyTable,
    fastPathStub,
    describeActionShort,
    escapeMd,
  },
};

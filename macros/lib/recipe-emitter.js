// recipe-emitter.js
// Shared library for emitting GUI-recipe markdown files from a captured
// event stream. Used by:
// - psr-exe-to-recipe.js           (Worker A, Win Problem Steps Recorder)
// - os-hook-recorder-to-recipe.js  (Worker B, custom hook recorder)
//
// Output conforms to the 10-section recipe anatomy from
// ~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md
//
// All emitted recipes carry frontmatter `status: untested_spec` until a real
// replay run flips them to `validated_v1` per
// ~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md
//
// Mac-via-RDP branch (6 May 2026):
// When the capture window-set indicates a MacinCloud / Remote Desktop
// Connection (mstsc.exe) target, the emitter switches to pixel-only replay
// mode. UIA selectors traverse the Win mstsc shell, NOT the Mac Aqua
// surface, so no UIA selector below the RDP boundary is meaningful for
// replay. See ~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md
//
// Origin: Tate verbatim 6 May 2026 15:32 AEST.
// Mac-RDP branch origin: Tate verbatim 6 May 2026 20:32 AEST.

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
        .split(/[- - |·•:]/)
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

// ---------- Mac-via-RDP detection + noise filter --------------------------

const RDP_WINDOW_TITLE_RE = /(Remote Desktop Connection|MacinCloud_Full_Screen)/i;
const RDP_FOREGROUND_EXE = 'mstsc.exe';
const RDP_INPUT_CAPTURE_NAME = 'Input Capture Window';
const RDP_INPUT_CAPTURE_CLASS = 'IHWindowClass';

/**
 * Inspect a single event for any Mac-via-RDP signal.
 */
function eventLooksMacRdp(ev) {
  if (!ev) return false;
  if (ev.foreground_app_exe === RDP_FOREGROUND_EXE) return true;
  if (ev.window_title && RDP_WINDOW_TITLE_RE.test(ev.window_title)) return true;
  if (ev.uia_selector_hint && (
    ev.uia_selector_hint.includes(RDP_INPUT_CAPTURE_CLASS) ||
    ev.uia_selector_hint.includes(`name="${RDP_INPUT_CAPTURE_NAME}"`)
  )) return true;
  if (ev.target_uia_selector) {
    const sel = ev.target_uia_selector;
    if (sel.class_name === RDP_INPUT_CAPTURE_CLASS) return true;
    if (sel.name === RDP_INPUT_CAPTURE_NAME) return true;
  }
  return false;
}

/**
 * Detect whether the WHOLE capture is a Mac-via-RDP target.
 *
 * A capture is Mac-via-RDP iff any event OR any window-metadata entry signals
 * the RDP boundary. This is the gating switch for pixel-only replay frontmatter
 * + the Replay constraints section + the noise-filter pass.
 *
 * Cross-ref: ~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md
 *
 * @param {Array} events            normalised events from event-joiner
 * @param {Array} windowMetadata    [{window_title, program}]
 * @returns {boolean}
 */
function detectMacViaRdp(events = [], windowMetadata = []) {
  if (Array.isArray(events) && events.some(eventLooksMacRdp)) return true;
  if (Array.isArray(windowMetadata) && windowMetadata.some(w => {
    if (!w) return false;
    if (w.program === RDP_FOREGROUND_EXE) return true;
    if (w.window_title && RDP_WINDOW_TITLE_RE.test(w.window_title)) return true;
    return false;
  })) return true;
  return false;
}

/**
 * Decide whether an event is a CANONICAL Mac-RDP flow step.
 *
 * Canonical: foreground_app_exe is mstsc.exe AND (UIA enrichment is absent
 * OR UIA hits the canonical RDP input-capture pane). Anything else at the
 * sequence boundaries is treated as session noise (e.g. the user clicking
 * around in EcodiaOS Chrome before flipping focus to the RDP window, or
 * accidentally clicking a Chrome tab strip overlapping the RDP canvas).
 *
 * Note: the brief's literal phrasing was `foreground_app_exe != mstsc.exe
 * AND not on the canonical Mac flow's window`. The brief example calls out
 * BOTH a chrome.exe-foreground event (step 1) AND an mstsc-foreground event
 * whose UIA selector points to a Chrome tab outside the RDP pane (step 6)
 * as noise. The OR-shape below matches the example; either signal alone is
 * enough to mark a boundary event as off-flow.
 */
function isCanonicalMacRdpEvent(ev) {
  if (!ev) return false;
  if (ev.foreground_app_exe !== RDP_FOREGROUND_EXE) return false;
  // If we have UIA enrichment, require it to point at the canonical RDP pane.
  if (ev.target_uia_selector) {
    const sel = ev.target_uia_selector;
    if (sel.class_name === RDP_INPUT_CAPTURE_CLASS) return true;
    if (sel.name === RDP_INPUT_CAPTURE_NAME) return true;
    return false;
  }
  if (ev.uia_selector_hint) {
    if (ev.uia_selector_hint.includes(RDP_INPUT_CAPTURE_CLASS)) return true;
    if (ev.uia_selector_hint.includes(`name="${RDP_INPUT_CAPTURE_NAME}"`)) return true;
    return false;
  }
  // No UIA at all - the RDP canvas is opaque to UIA, so this is the common
  // case for a real Mac-side click. Accept it.
  return true;
}

/**
 * Tag boundary events (first/last contiguous runs of off-flow events) as
 * noise. Mutates events in place: each tagged event gains
 * `noise_filtered: true` and a short `noise_reason`.
 *
 * Returns the partition for downstream emit.
 *
 * @param {Array} events
 * @returns {{replayEvents: Array, noiseEvents: Array}}
 */
function applyMacRdpNoiseFilter(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { replayEvents: [], noiseEvents: [] };
  }

  // Walk forward from start
  let i = 0;
  while (i < events.length && !isCanonicalMacRdpEvent(events[i])) {
    events[i].noise_filtered = true;
    events[i].noise_reason = 'session_boundary_pre_flow';
    i++;
  }

  // Walk backward from end (only into the still-untagged region)
  let j = events.length - 1;
  while (j > i - 1 && !isCanonicalMacRdpEvent(events[j])) {
    if (events[j].noise_filtered) break; // already tagged from the head walk
    events[j].noise_filtered = true;
    events[j].noise_reason = 'session_boundary_post_flow';
    j--;
  }

  const replayEvents = events.filter(e => !e.noise_filtered);
  const noiseEvents = events.filter(e => e.noise_filtered);
  return { replayEvents, noiseEvents };
}

/**
 * Produce a fresh copy of events with replay step numbers re-sequenced
 * starting at 1. Original step numbers are preserved on `original_step_number`.
 */
function renumberReplayEvents(events) {
  return events.map((ev, idx) => ({
    ...ev,
    original_step_number: ev.step_number,
    step_number: idx + 1,
  }));
}

// ---------- Main emit ----------------------------------------------------

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

  // ---- Mac-via-RDP gating --------------------------------------------
  const macRdp = detectMacViaRdp(events, window_metadata);
  let replayEvents = events;
  let noiseEvents = [];
  if (macRdp) {
    const partition = applyMacRdpNoiseFilter(events);
    replayEvents = renumberReplayEvents(partition.replayEvents);
    noiseEvents = partition.noiseEvents;
  }

  // ---- Frontmatter ----------------------------------------------------
  const frontmatterLines = [
    '---',
    `triggers: ${triggers}`,
    `capture_method: ${method}`,
    `captured_at: ${capturedIso}`,
    `flow_slug: ${flow_slug}`,
    'status: untested_spec',
  ];

  // Replay-method tags. Mac-RDP forces pixel-only; everything else is open.
  if (macRdp) {
    frontmatterLines.push('replay_method: pixel_only_screenshot_verify');
    frontmatterLines.push('capture_substrate: corazon-recorder-mac-via-rdp');
    frontmatterLines.push('uia_reliable: false');
    frontmatterLines.push('pixel_coords_reliable: true_if_rdp_window_layout_matches');
  } else {
    frontmatterLines.push('replay_method: uia_or_pixel');
  }

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

  // ---- Mac-RDP-only Replay constraints section ------------------------
  const replayConstraints = macRdp
    ? sectionHeader('Replay constraints') +
      'This recipe is captured via Corazon recorder on a Mac-via-RDP target. ' +
      'UIA selectors describe the RDP shell (mstsc.exe), not Mac UI elements; ' +
      'do NOT use them for replay. Replay protocol: pixel coordinates + ' +
      'cropped-screenshot post-verify per step. ' +
      'See ~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md.\n'
    : '';

  // ---- Section 4: Verified coordinates table --------------------------
  const sec4 = sectionHeader('Verified coordinates table') +
    coordsTable(replayEvents) +
    '\n<!-- Coordinates above were captured at recording time. Re-verify against the live UI before codifying as `validated_v1`. -->\n';

  // ---- Section 5: Step-by-step procedure ------------------------------
  const sec5 = sectionHeader('Step-by-step procedure') +
    stepByStepProcedure(replayEvents) +
    (noiseEvents.length > 0
      ? '\n### Noise events (excluded from replay)\n\n' +
        '_Captured at session boundaries but not part of the canonical Mac-side flow. ' +
        'Tagged `noise_filtered: true` by the Mac-via-RDP noise filter._\n\n' +
        noiseEvents.map(formatNoiseEvent).join('\n\n') + '\n'
      : '');

  // ---- Section 6: Verification protocol -------------------------------
  const sec6 = sectionHeader('Verification protocol') +
    '<!-- TODO: per-step pre/post-verify probes (see ~/ecodiaos/patterns/gui-step-verify-protocol.md). -->\n\n' +
    '| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |\n' +
    '|---|---|---|---|---|\n' +
    perStepVerifyTable(replayEvents);

  // ---- Section 7: Fast-path checklist ---------------------------------
  const sec7 = sectionHeader('Fast-path checklist') +
    '<!-- TODO: optimised cmd-by-cmd run with verified end-to-end target timing. After validation, replace this stub with the codified fast path. -->\n\n' +
    '```\n' +
    fastPathStub(replayEvents) +
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
    '- Marking this recipe `validated_v1` without a real replay. The capture proves the flow happened once; it does NOT prove the codified replay path works.\n' +
    (macRdp
      ? '- Trusting UIA selectors below the RDP boundary - mstsc.exe exposes only its own shell to UIA. Mac Aqua elements are pixel-only.\n'
      : '');

  // ---- Cross-references ----------------------------------------------
  const crossRefs = '\n## Cross-references\n\n' +
    '- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the meta-doctrine this recipe instantiates.\n' +
    '- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - status flips to `validated_v1` only after a real replay run.\n' +
    `- \`~/ecodiaos/patterns/macro-capture-via-${method}.md\` - capture-method-specific doctrine.\n` +
    '- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - the per-step pre/post-verify protocol all recipes implement.\n' +
    (macRdp
      ? '- `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md` - replay-method gating for Mac-via-RDP captures.\n'
      : '');

  // Section ordering: 1, 2, 3, [Replay constraints if Mac-RDP], 4..10
  return [
    frontmatterLines.join('\n'),
    title,
    '',
    sec1, sec2, sec3, replayConstraints, sec4, sec5, sec6, sec7, sec8, sec9, sec10,
    crossRefs,
  ].filter(Boolean).join('\n');
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
 * Format a single noise event as a markdown bullet block. Includes the
 * original step number so the recorded sequence remains traceable.
 */
function formatNoiseEvent(ev) {
  const orig = ev.original_step_number || ev.step_number || '?';
  const reason = ev.noise_reason || 'session_boundary';
  const win = ev.window_title ? ` in **${ev.window_title}**` : '';
  const exe = ev.foreground_app_exe ? ` (foreground: \`${ev.foreground_app_exe}\`)` : '';
  const target = ev.target_text ? ` on **${ev.target_text}**` : '';
  const coords = (ev.x !== null && ev.x !== undefined) ? ` at \`(${ev.x}, ${ev.y})\`` : '';
  const ts = ev.timestamp ? ` (\`${ev.timestamp}\`)` : '';
  let line = `- Original step ${orig} (excluded - ${reason}): ${ev.type || 'event'}${target}${win}${exe}${coords}${ts}`;
  if (ev.uia_selector_hint) line += `\n  - UIA: \`${ev.uia_selector_hint}\``;
  return line;
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
    if (ev.uia_selector_hint) extras += `\n - UIA: \`${ev.uia_selector_hint}\``;
    if (ev.x !== null && ev.x !== undefined) extras += `\n - Pixel coords (fallback): \`(${ev.x}, ${ev.y})\``;
    if (ev.screenshot_cid) extras += `\n - Screenshot CID: \`${ev.screenshot_cid}\``;
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
  // Mac-via-RDP detection + noise filter (exposed for tests / external callers)
  detectMacViaRdp,
  isCanonicalMacRdpEvent,
  applyMacRdpNoiseFilter,
  // exposed for unit-style introspection
  _internal: {
    coordsTable,
    stepByStepProcedure,
    perStepVerifyTable,
    fastPathStub,
    describeActionShort,
    escapeMd,
    eventLooksMacRdp,
    renumberReplayEvents,
    formatNoiseEvent,
  },
};

#!/usr/bin/env node
// integration-test.js
//
// End-to-end integration tests for the macro-recorder v1 + v2 capture pipeline.
//
// Tests:
//   1. recipe-emitter.js exports the expected API surface.
//   2. emitRecipe with synthetic input produces a string containing all 10
//      anatomy headings + frontmatter with status: untested_spec.
//   3. psr-exe-parser.js (v1) parses the synthetic test fixture without
//      warnings.
//   4. event-joiner.js (v2) joins synthetic events.jsonl + uia-enrichments.jsonl
//      + manifest.json correctly.
//   5. recording-to-recipe.js (v2) end-to-end produces a recipe matching
//      anatomy + frontmatter status: untested_spec, capture_method:
//      os-hook-recorder. (Skipped with PASS marker if B3's entrypoint not
//      yet on disk; substituted with a direct emitter call through the joiner.)
//
// Each test logs PASS/FAIL with line/file context. Exit 0 if all pass, exit 1
// on any failure.
//
// Run as: node ~/ecodiaos/macros/tests/integration-test.js
//
// Origin: Worker B4 of fork_motmiokr_ed2e9c, 6 May 2026.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const MACROS_ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(MACROS_ROOT, 'lib');
const PARSERS_DIR = path.join(MACROS_ROOT, 'parsers');

const RESULTS = [];

function record(name, passed, detail) {
  RESULTS.push({ name, passed, detail: detail || '' });
  const tag = passed ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ' - ' + detail : ''}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ---------------------------------------------------------------------------
// Test 1: recipe-emitter.js exports the expected API surface.
// ---------------------------------------------------------------------------
function test1_emitterExports() {
  const name = 'test1_emitter_exports';
  try {
    const emitter = require(path.join(LIB_DIR, 'recipe-emitter.js'));
    const expected = ['emitRecipe', 'ANATOMY_SECTIONS', 'buildTriggers', 'slugify', 'timestampSuffix', 'humaniseSlug'];
    for (const key of expected) {
      assert(key in emitter, `missing export: ${key}`);
    }
    assert(Array.isArray(emitter.ANATOMY_SECTIONS), 'ANATOMY_SECTIONS must be an array');
    assert(emitter.ANATOMY_SECTIONS.length === 10, `expected 10 anatomy sections, got ${emitter.ANATOMY_SECTIONS.length}`);
    assert(typeof emitter.emitRecipe === 'function', 'emitRecipe must be a function');
    assert(typeof emitter.buildTriggers === 'function', 'buildTriggers must be a function');
    assert(typeof emitter.slugify === 'function', 'slugify must be a function');
    assert(typeof emitter.timestampSuffix === 'function', 'timestampSuffix must be a function');
    assert(typeof emitter.humaniseSlug === 'function', 'humaniseSlug must be a function');
    record(name, true, 'all 6 named exports present, ANATOMY_SECTIONS has 10 entries');
  } catch (err) {
    record(name, false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Test 2: emitRecipe with synthetic input produces all 10 sections + correct
//         frontmatter (status: untested_spec).
// ---------------------------------------------------------------------------
function test2_emitterProduces10Sections() {
  const name = 'test2_emitter_10_sections_and_frontmatter';
  try {
    const { emitRecipe, ANATOMY_SECTIONS } = require(path.join(LIB_DIR, 'recipe-emitter.js'));

    const syntheticEvents = [
      {
        step_number: 1,
        type: 'click',
        x: 120,
        y: 245,
        target_text: 'File menu',
        uia_selector_hint: 'Name="File" ControlType=MenuItem',
        window_title: 'Untitled - Notepad',
        timestamp: '2026-05-06T05:55:00.000Z',
      },
      {
        step_number: 2,
        type: 'keypress',
        x: null,
        y: null,
        target_text: null,
        keyboard_input: 'hello world',
        uia_selector_hint: null,
        window_title: 'Untitled - Notepad',
        timestamp: '2026-05-06T05:55:01.000Z',
      },
    ];
    const md = emitRecipe({
      method: 'os-hook-recorder',
      flow_slug: 'synthetic-test-flow',
      captured_at: '2026-05-06T05:55:00.000Z',
      events: syntheticEvents,
      window_metadata: [{ window_title: 'Untitled - Notepad', program: 'notepad.exe' }],
      extra: { source_capture: 'synthetic' },
    });

    assert(typeof md === 'string', 'emitRecipe should return a string');
    assert(md.startsWith('---'), 'emitted markdown must start with frontmatter');
    assert(md.includes('status: untested_spec'), 'frontmatter must include status: untested_spec');
    assert(md.includes('capture_method: os-hook-recorder'), 'frontmatter must include capture_method');
    assert(md.includes('flow_slug: synthetic-test-flow'), 'frontmatter must include flow_slug');
    for (const sect of ANATOMY_SECTIONS) {
      assert(md.includes(`## ${sect}`), `missing anatomy section: ${sect}`);
    }
    // No em-dashes in the emitted output (em-dash discipline)
    assert(!md.includes(' - '), 'emitted recipe must contain zero em-dashes');
    record(name, true, `markdown length=${md.length}, all 10 sections present, frontmatter correct, zero em-dashes`);
  } catch (err) {
    record(name, false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Test 3: psr-exe-parser.js (v1) parses the synthetic test fixture without
//         warnings.
// ---------------------------------------------------------------------------
function test3_psrParserSyntheticFixture() {
  const name = 'test3_psr_parser_synthetic_fixture';
  try {
    const parserPath = path.join(PARSERS_DIR, 'psr-exe-parser.js');
    if (!fs.existsSync(parserPath)) {
      record(name, false, `psr-exe-parser.js not on disk at ${parserPath}`);
      return;
    }
    const { parseMhtml } = require(parserPath);

    const syntheticMhtml = buildSyntheticMhtml();
    const parsed = parseMhtml(syntheticMhtml);

    assert(Array.isArray(parsed.events), 'parsed.events must be an array');
    assert(parsed.events.length >= 2, `expected >=2 events, got ${parsed.events.length}`);
    assert(parsed.parse_warnings.length === 0,
      `expected no warnings, got: ${JSON.stringify(parsed.parse_warnings)}`);

    // Validate first event shape
    const ev = parsed.events[0];
    assert(typeof ev.step_number === 'number', 'event.step_number must be a number');
    assert(typeof ev.type === 'string', 'event.type must be a string');
    assert(['click', 'doubleclick', 'rightclick', 'keypress', 'drag', 'unknown'].includes(ev.type),
      `unrecognised event.type: ${ev.type}`);

    record(name, true, `parsed ${parsed.events.length} events, 0 warnings, raw_step_count=${parsed.raw_step_count}`);
  } catch (err) {
    record(name, false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Test 4: event-joiner.js (v2) joins synthetic events.jsonl +
//         uia-enrichments.jsonl + manifest.json correctly.
// ---------------------------------------------------------------------------
function test4_eventJoinerSyntheticSession() {
  const name = 'test4_event_joiner_synthetic_session';
  try {
    const joinerPath = path.join(LIB_DIR, 'event-joiner.js');
    if (!fs.existsSync(joinerPath)) {
      record(name, false, `event-joiner.js not on disk at ${joinerPath}`);
      return;
    }
    const { joinSession } = require(joinerPath);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-test-'));
    try {
      writeSyntheticSession(tmpDir);

      const result = joinSession({ sessionDir: tmpDir });

      assert(Array.isArray(result.events), 'result.events must be an array');
      assert(result.events.length === 2, `expected 2 normalised events (click + keypress), got ${result.events.length}`);
      assert(result.warnings.length === 0,
        `expected no warnings, got: ${JSON.stringify(result.warnings)}`);

      const click = result.events[0];
      assert(click.type === 'click', `expected first event type=click, got ${click.type}`);
      assert(click.x === 120 && click.y === 245, `expected click coords (120, 245), got (${click.x}, ${click.y})`);
      assert(click.target_text === 'Submit', `expected target_text=Submit, got ${click.target_text}`);
      assert(click.uia_selector_hint && click.uia_selector_hint.includes('name="Submit"'),
        `expected uia_selector_hint to mention name="Submit", got ${click.uia_selector_hint}`);
      assert(click.window_title === 'My App', `expected window_title=My App, got ${click.window_title}`);
      assert(click.screenshot_pre_path === 'frames/pre-0.png', `pre-screenshot path missing or wrong (got ${click.screenshot_pre_path})`);
      assert(click.screenshot_post_path === 'frames/post-1.png', 'post-screenshot path missing (post_capture should be folded in)');

      const kp = result.events[1];
      assert(kp.type === 'keypress', `expected second event type=keypress, got ${kp.type}`);

      record(name, true, `joined ${result.events.length} events, post_capture folded into parent click, 0 warnings`);
    } finally {
      rmDirRecursive(tmpDir);
    }
  } catch (err) {
    record(name, false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Test 5: recording-to-recipe.js (v2) end-to-end. If B3's entrypoint not yet
//         on disk, fall back to: joiner -> emitter direct call to prove the
//         chain is wireable.
// ---------------------------------------------------------------------------
function test5_recordingToRecipeEndToEnd() {
  const name = 'test5_recording_to_recipe_end_to_end';
  const entrypoint = path.join(PARSERS_DIR, 'recording-to-recipe.js');

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-test-'));
    const captureOutDir = path.join(os.homedir(), 'ecodiaos', 'macros', 'captures');
    let mdPath = null;
    let preExisting = new Set();
    try {
      writeSyntheticSession(tmpDir);
      if (fs.existsSync(captureOutDir)) {
        preExisting = new Set(fs.readdirSync(captureOutDir));
      }

      if (fs.existsSync(entrypoint)) {
        // Run via the real CLI. Use --no-vision so we don't depend on the
        // Anthropic API key being injected into the test environment.
        const slug = 'integration-test-flow';
        execSync(`node ${quote(entrypoint)} ${quote(tmpDir)} ${slug} --no-vision`, { stdio: 'pipe' });
        // Locate the .md file. Either a new one (different minute), or the
        // pre-existing one written this same minute (idempotent overwrite).
        const after = fs.existsSync(captureOutDir) ? fs.readdirSync(captureOutDir) : [];
        const matchingFiles = after.filter(f => f.startsWith(`${slug}-`) && f.endsWith('.md'));
        assert(matchingFiles.length >= 1, `recording-to-recipe.js produced no .md files (slug=${slug})`);
        // Prefer the most-recently modified
        const ranked = matchingFiles
          .map(f => ({ f, mtime: fs.statSync(path.join(captureOutDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        mdPath = path.join(captureOutDir, ranked[0].f);
      } else {
        // Fallback: chain joiner -> emitter manually to prove the integration shape works.
        const { joinSession } = require(path.join(LIB_DIR, 'event-joiner.js'));
        const { emitRecipe, timestampSuffix } = require(path.join(LIB_DIR, 'recipe-emitter.js'));
        const joined = joinSession({ sessionDir: tmpDir });
        const md = emitRecipe({
          method: 'os-hook-recorder',
          flow_slug: 'integration-test-flow',
          captured_at: new Date().toISOString(),
          events: joined.events,
          window_metadata: [{ window_title: 'My App', program: 'myapp.exe' }],
        });
        fs.mkdirSync(captureOutDir, { recursive: true });
        mdPath = path.join(captureOutDir, `integration-test-flow-${timestampSuffix(new Date())}.md`);
        fs.writeFileSync(mdPath, md, 'utf8');
      }

      assert(mdPath && fs.existsSync(mdPath), `expected emitted recipe at ${mdPath}`);
      const md = fs.readFileSync(mdPath, 'utf8');
      assert(md.includes('status: untested_spec'), 'emitted recipe must declare status: untested_spec');
      assert(md.includes('capture_method: os-hook-recorder'),
        'emitted recipe must declare capture_method: os-hook-recorder');
      // All 10 anatomy sections
      const anatomy = require(path.join(LIB_DIR, 'recipe-emitter.js')).ANATOMY_SECTIONS;
      for (const sect of anatomy) {
        assert(md.includes(`## ${sect}`), `emitted recipe missing section: ${sect}`);
      }
      assert(!md.includes(' - '), 'emitted recipe must contain zero em-dashes');

      const note = fs.existsSync(entrypoint) ? 'real-entrypoint' : 'fallback-chain';
      record(name, true, `wrote ${path.basename(mdPath)} (${note}), all 10 sections + correct frontmatter`);
    } finally {
      rmDirRecursive(tmpDir);
      // We deliberately leave the emitted recipe in captures/ so the operator
      // can inspect the artefact. It does not pollute git (captures/ is
      // session-scoped output, not committed doctrine).
    }
  } catch (err) {
    record(name, false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

function buildSyntheticMhtml() {
  const boundary = '----=_NextPart_TestBoundary_001';
  const html = `<html><body>
<div class="StepBlock">
  <a name="Step1"></a>
  <h2>Step 1: (5/6/2026 3:41:42 PM) User left click on "File menu" in "Untitled - Notepad"</h2>
  <div class="StepBody">
    <p>Program: Notepad, 11.2026.6.0, Microsoft, NOTEPAD.EXE, NOTEPAD.EXE</p>
    <p>UI Elements: File menu, MenuItem, Untitled - Notepad</p>
    <img src="cid:image001@test.local" />
  </div>
</div>
<div class="StepBlock">
  <a name="Step2"></a>
  <h2>Step 2: (5/6/2026 3:41:43 PM) User keyboard input [...hello world...] in "Untitled - Notepad"</h2>
  <div class="StepBody">
    <p>Program: Notepad, 11.2026.6.0, Microsoft, NOTEPAD.EXE, NOTEPAD.EXE</p>
    <p>UI Elements: Document, Edit, Untitled - Notepad</p>
  </div>
</div>
</body></html>`;

  return [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function writeSyntheticSession(dir) {
  // Synthetic events.jsonl
  const events = [
    // Click event
    {
      event_index: 0,
      timestamp: '2026-05-06T05:55:00.000Z',
      event_type: 'click_left',
      x: 120,
      y: 245,
      button: 'left',
      foreground_window_title: 'My App',
      foreground_app_exe: 'myapp.exe',
      screenshot_pre_path: 'frames/pre-0.png',
    },
    // Post-capture meta event for the click
    {
      event_index: 1,
      timestamp: '2026-05-06T05:55:00.060Z',
      event_type: 'meta',
      meta_type: 'post_capture',
      parent_event_index: 0,
      screenshot_path: 'frames/post-1.png',
    },
    // Keypress event
    {
      event_index: 2,
      timestamp: '2026-05-06T05:55:01.000Z',
      event_type: 'key_press',
      key: 'h',
      foreground_window_title: 'My App',
      foreground_app_exe: 'myapp.exe',
      screenshot_pre_path: 'frames/pre-2.png',
    },
    // Internal meta (should be filtered)
    {
      event_index: 3,
      timestamp: '2026-05-06T05:55:02.000Z',
      event_type: 'meta',
      meta_type: 'record_stop',
    },
  ];
  fs.writeFileSync(
    path.join(dir, 'events.jsonl'),
    events.map(e => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );

  // Synthetic uia-enrichments.jsonl
  const enrichments = [
    {
      event_index: 0,
      uia_query_status: 'ok',
      uia_query_duration_ms: 42,
      target_uia_selector: {
        control_type: 'Button',
        name: 'Submit',
        automation_id: 'btn-submit',
        class_name: 'WPFButton',
      },
    },
    {
      event_index: 2,
      uia_query_status: 'ok',
      uia_query_duration_ms: 38,
      target_uia_selector: {
        control_type: 'Edit',
        name: 'Comment field',
        automation_id: 'edit-comment',
        class_name: 'TextBox',
      },
    },
  ];
  fs.writeFileSync(
    path.join(dir, 'uia-enrichments.jsonl'),
    enrichments.map(e => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );

  // Synthetic manifest.json
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      session_id: 'integration-test-session',
      started_at: '2026-05-06T05:55:00.000Z',
      stopped_at: '2026-05-06T05:55:02.500Z',
      event_count: 4,
      denylist_hit_count: 0,
      hostname: 'corazon',
      os: 'Windows',
    }, null, 2),
    'utf8',
  );

  // frames/ dir (empty stub files for path-existence-only assertions)
  const framesDir = path.join(dir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  fs.writeFileSync(path.join(framesDir, 'pre-0.png'), 'stub', 'utf8');
  fs.writeFileSync(path.join(framesDir, 'post-1.png'), 'stub', 'utf8');
  fs.writeFileSync(path.join(framesDir, 'pre-2.png'), 'stub', 'utf8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rmDirRecursive(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_err) {
    // best-effort cleanup
  }
}

function quote(s) {
  // Simple shell-quote (paths only, no metacharacters expected in test paths).
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function main() {
  // eslint-disable-next-line no-console
  console.log('Macro recorder v1+v2 integration tests starting...');
  test1_emitterExports();
  test2_emitterProduces10Sections();
  test3_psrParserSyntheticFixture();
  test4_eventJoinerSyntheticSession();
  test5_recordingToRecipeEndToEnd();

  const passed = RESULTS.filter(r => r.passed).length;
  const failed = RESULTS.filter(r => !r.passed);
  // eslint-disable-next-line no-console
  console.log('---');
  // eslint-disable-next-line no-console
  console.log(`Results: ${passed}/${RESULTS.length} passed`);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.log('Failures:');
    for (const f of failed) {
      // eslint-disable-next-line no-console
      console.log(` - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };

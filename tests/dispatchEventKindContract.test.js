'use strict'

/**
 * Contract test for dispatch_event.metadata.kind plumbing.
 *
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *           Layer 4 (Usage Telemetry) + Layer D (Outcome Inference).
 *
 * Origin: Phase-G adversarial self-audit 2026-05-08, Critique #5 (sev=4).
 *   See ~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-08-triage-addendum.md.
 *   903 dispatch_event rows over 7 days carried ZERO metadata.kind. Layer-D
 *   outcome inferrer compensated with a fork_id-presence heuristic that worked
 *   for fork_spawn rows but broke for cron-fire and hook-only dispatches.
 *   Plumbed at the producer (emit-telemetry.sh + 7 hook callers) and merged
 *   into metadata at consumer-time. This test guards the plumbing.
 *
 * What this test guards (5 guards):
 *   1. Detection sanity: emitter file (emit-telemetry.sh) exists and accepts
 *      a 5th arg `kind`, defaults to "unknown" when caller omits, writes
 *      `kind` at the top level of the JSONL line.
 *   2. Producer-side coverage: every emit_telemetry_safe call in
 *      ~/ecodiaos/scripts/hooks/*.sh passes 5 args (kind explicit). A 4-arg
 *      call would silently fall back to "unknown" and pollute Layer-D's
 *      classifier with phantom-unknown rows.
 *   3. Consumer-side merge: dispatchEventConsumer.js extracts `line.kind`
 *      from JSONL and merges into metadata JSONB at INSERT time.
 *   4. Live emit: source the lib in a temp dir, fire emit_telemetry_safe with
 *      explicit kind, parse the JSONL line, assert `kind` field present and
 *      not "unknown" when caller passed a value.
 *   5. Sentinel default: same as guard 4 but with no kind passed; assert
 *      `kind === "unknown"`.
 *
 * Negative-test verification (manual, performed by author 9 May 2026):
 *   Removed the 5th arg from one emit_telemetry_safe call (cred-mention-surface.sh)
 *   and re-ran `npm run test:dispatch-kind`. Guard 2 failed with the expected
 *   missing-args message. Restored the kind arg and re-ran; test passed.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const REPO_ROOT = path.join(__dirname, '..')
const HOOKS_DIR = path.join(REPO_ROOT, 'scripts', 'hooks')
const LIB_PATH = path.join(HOOKS_DIR, 'lib', 'emit-telemetry.sh')
const CONSUMER_PATH = path.join(REPO_ROOT, 'src', 'services', 'telemetry', 'dispatchEventConsumer.js')

/**
 * Walk hooks dir non-recursively and return the .sh files that contain at
 * least one emit_telemetry_safe call. lib/* is excluded - that's the emitter
 * itself, not a caller.
 */
function findHookCallSites() {
  const entries = fs.readdirSync(HOOKS_DIR, { withFileTypes: true })
  const out = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.sh')) continue
    const fp = path.join(HOOKS_DIR, e.name)
    const content = fs.readFileSync(fp, 'utf8')
    if (content.includes('emit_telemetry_safe ')) {
      out.push({ file: fp, content, name: e.name })
    }
  }
  return out
}

/**
 * Count positional args passed to a `emit_telemetry_safe` call. Returns the
 * count of quoted args. Bash positional args are quoted strings; we count
 * by parsing the call line up through the closing of the last `"..."` group.
 *
 * Heuristic: capture the contents from `emit_telemetry_safe` to end-of-line
 * (or until the next `;` / `&&`), tokenise on whitespace, count tokens that
 * start with `"`. This is robust to multi-line calls being on a single line
 * (which is the convention in our hooks).
 */
function countEmitArgs(line) {
  const idx = line.indexOf('emit_telemetry_safe')
  if (idx < 0) return 0
  // Get everything after emit_telemetry_safe up to the end of this logical
  // statement. Hooks invoke it as a single-line call.
  const tail = line.slice(idx + 'emit_telemetry_safe'.length).trim()
  // Match "..."-quoted segments. Each is one positional arg.
  const matches = tail.match(/"(?:[^"\\]|\\.)*"/g) || []
  return matches.length
}

describe('dispatch_event.metadata.kind contract (Origin: Phase-G Critique #5, 9 May 2026)', () => {
  test('Guard 1 (detection sanity): emit-telemetry.sh accepts kind as 5th arg with default "unknown" and writes top-level kind field', () => {
    const lib = fs.readFileSync(LIB_PATH, 'utf8')
    expect(lib).toMatch(/local kind="\${5:-}"/)
    // Default sentinel must be "unknown" so missing-kind producers are queryable.
    expect(lib).toMatch(/kind="unknown"/)
    // Top-level JSONL field must be `kind` so the consumer can pull it without
    // digging into context.kind.
    expect(lib).toMatch(/--arg kind/)
    expect(lib).toMatch(/kind:\s*\$kind/)
  })

  test('Guard 2 (producer coverage): every emit_telemetry_safe call in scripts/hooks/*.sh passes 5 positional args', () => {
    const sites = findHookCallSites()
    expect(sites.length).toBeGreaterThanOrEqual(7)

    const failures = []
    for (const site of sites) {
      const lines = site.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip definitions / comments / function-body references.
        if (!line.includes('emit_telemetry_safe ')) continue
        // Skip comments.
        if (/^\s*#/.test(line)) continue
        // Skip the `declare -f` guard line in cowork-first-check.
        if (line.includes('declare -f emit_telemetry_safe')) continue

        const argCount = countEmitArgs(line)
        if (argCount < 5) {
          failures.push(
            `${path.relative(REPO_ROOT, site.file)}:${i + 1} - emit_telemetry_safe called with ${argCount} args, expected 5 (hook_name, tool_name, ctx, surfaces, kind). ` +
            `Missing kind = silent "unknown" sentinel = Layer-D classifier pollution.`
          )
        }
      }
    }
    if (failures.length > 0) {
      throw new Error('emit_telemetry_safe missing kind arg:\n  ' + failures.join('\n  '))
    }
  })

  test('Guard 3 (consumer merge): dispatchEventConsumer.js extracts line.kind and merges into metadata', () => {
    const consumer = fs.readFileSync(CONSUMER_PATH, 'utf8')
    // Must read line.kind (not buried in line.context.kind).
    expect(consumer).toMatch(/line\.kind/)
    // Must default to "unknown" when missing - matches producer-side default
    // so query-by-kind never has to handle null vs "unknown" disjunction.
    expect(consumer).toMatch(/['"]unknown['"]/)
    // Must merge into metadata, not just stash on the variable.
    expect(consumer).toMatch(/metadata\s*=\s*\{\s*\.\.\.ctx,\s*kind\s*\}/)
  })

  test('Guard 4 (live emit with explicit kind): JSONL line carries kind at top level', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-kind-test-'))
    const tmpFile = path.join(tmpDir, 'dispatch-events.jsonl')
    try {
      execFileSync('bash', [
        '-c',
        `source "${LIB_PATH}"; emit_telemetry_safe "test-hook" "mcp__forks__spawn_fork" "{}" "[]" "fork_spawn"`,
      ], {
        env: {
          ...process.env,
          ECODIAOS_TELEMETRY_DIR: tmpDir,
          ECODIAOS_TELEMETRY_FILE: tmpFile,
        },
        timeout: 5000,
      })

      const content = fs.readFileSync(tmpFile, 'utf8').trim()
      expect(content.length).toBeGreaterThan(0)
      const parsed = JSON.parse(content)
      expect(parsed.kind).toBe('fork_spawn')
      expect(parsed.hook_name).toBe('test-hook')
      expect(parsed.tool_name).toBe('mcp__forks__spawn_fork')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('Guard 5 (sentinel default): omitted kind defaults to "unknown" so missing producers are queryable, not silent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-kind-test-'))
    const tmpFile = path.join(tmpDir, 'dispatch-events.jsonl')
    try {
      // 4-arg call: kind omitted, must default to "unknown" sentinel.
      execFileSync('bash', [
        '-c',
        `source "${LIB_PATH}"; emit_telemetry_safe "test-hook" "Write" "{}" "[]"`,
      ], {
        env: {
          ...process.env,
          ECODIAOS_TELEMETRY_DIR: tmpDir,
          ECODIAOS_TELEMETRY_FILE: tmpFile,
        },
        timeout: 5000,
      })

      const content = fs.readFileSync(tmpFile, 'utf8').trim()
      const parsed = JSON.parse(content)
      expect(parsed.kind).toBe('unknown')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

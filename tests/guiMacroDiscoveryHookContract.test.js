'use strict'

/**
 * Contract test for gui-macro-discovery-surface.sh trigger narrowing.
 *
 * Doctrine: ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md
 *           ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *           Layer 3 (Phase C Gap 4 close, 9 May 2026, fork_moy03kw6_1b803a).
 *           ~/ecodiaos/patterns/gui-macro-discovery-protocol.md
 *
 * Origin: 9 May 2026 cred-mention + gui-macro-discovery hook group-audit
 *   close. Three live false-positive instances captured today on the same
 *   arc (16:08, 16:22, ~17:00 AEST). The gui-macro-discovery hook was
 *   firing GUI-MACRO HINT on bare "corazon" / "macincloud" mentions even
 *   when the brief listed them as ONE OPTION among non-GUI mechanics or
 *   merely as doctrine cross-refs.
 *
 * Fix: gui-target-recipes.json restructured to keywords_high (single hit
 *   fires) + keywords_broad (requires >=2 hits) per target. Hook updated
 *   with backward-compat (legacy "keywords" array still works as HIGH-only).
 *
 * What this test guards (6 guards):
 *
 *   Guard A1 (NEGATIVE): bare "corazon" alone does NOT emit corazon-peer
 *     [GUI-MACRO HINT]. Pre-fix bare-noun match fired in doctrine cross-ref
 *     contexts.
 *
 *   Guard A2 (POSITIVE): "drive corazon" emits corazon-peer HINT. Explicit
 *     driving verb is the canonical fire condition.
 *
 *   Guard A3 (NEGATIVE): bare "macincloud" alone does NOT emit
 *     macincloud-rdp HINT. Same false-positive class.
 *
 *   Guard A4 (POSITIVE): "macincloud_full_screen.rdp" emits macincloud-rdp
 *     HINT. Explicit RDP-driving filename is HIGH.
 *
 *   Guard A5 (NEGATIVE): "Corazon screenshot is one of 3 visual-verify
 *     mechanics (alongside DevTools viewport emulation + curl)" does NOT
 *     emit corazon-peer HINT. The 16:22 AEST 9 May 2026 cortex-ambient
 *     polish brief origin failure case.
 *
 *   Guard A6 (BACKWARD COMPAT): legacy targets that retain a single
 *     `keywords` array continue to fire on any single match (e.g.
 *     "drive chrome" emits drive-chrome HINT). Ensures un-narrowed targets
 *     keep current behaviour after the schema change.
 *
 * Negative-test verification (manual, performed by author 9 May 2026):
 *   Reverted the corazon-peer HIGH/BROAD restructure to the legacy
 *   `keywords` array containing bare "corazon", re-ran Guard A1 with the
 *   bare-noun "Corazon" payload, and verified the test FAILED (as expected,
 *   with the HINT firing). Restored the narrowing; test passed. The
 *   conductor confirmed the narrowing actually enforces the bare-noun
 *   negative case.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const REPO_ROOT = path.join(__dirname, '..')
const HOOK_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'gui-macro-discovery-surface.sh')
const REGISTRY_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'lib', 'gui-target-recipes.json')

/**
 * Run the gui-macro-discovery-surface.sh hook with a synthetic spawn_fork
 * brief. Returns { stdout, stderr, code }. The hook's stderr carries the
 * [GUI-MACRO HINT] lines; stdout carries the hookSpecificOutput JSON.
 *
 * Optional `registryOverride` allows pointing the hook at a temp registry
 * for backward-compat tests (Guard A6).
 */
function runHook(brief, opts = {}) {
  const payload = JSON.stringify({
    tool_name: 'mcp__forks__spawn_fork',
    tool_input: { brief },
  })
  const env = { ...process.env }
  if (opts.registryOverride) {
    env.GUI_TARGET_REGISTRY = opts.registryOverride
  }
  const result = spawnSync('bash', [HOOK_PATH], {
    input: payload,
    env,
    encoding: 'utf8',
    timeout: 5000,
  })
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status,
  }
}

/**
 * Returns true iff the hook output contains a [GUI-MACRO HINT] line for the
 * given target label. Matches against both stderr and stdout.
 */
function firedHintForTarget(result, targetLabel) {
  const re = new RegExp(`\\[GUI-MACRO HINT\\]\\s+target=${targetLabel}\\b`)
  return re.test(result.stderr) || re.test(result.stdout)
}

describe('gui-macro-discovery-surface trigger narrowing (Phase C Gap 4, 9 May 2026)', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-macro-discovery-test-'))
  })

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('Guard A1 (NEGATIVE): bare "corazon" mention as cross-ref does NOT emit corazon-peer HINT', () => {
    const brief = `Audit doctrine cross-references. Pattern files mention corazon as the windows host
running the laptop-agent. This fork only walks pattern markdown - no driving, no
input.* calls, no screenshot.* calls, just file reads.`
    const result = runHook(brief)
    if (firedHintForTarget(result, 'corazon-peer')) {
      throw new Error(
        'Guard A1 failed: bare-noun "corazon" + "laptop-agent" cross-ref fired ' +
        '[GUI-MACRO HINT] target=corazon-peer. Phase C Gap 4 narrowing should ' +
        'suppress unless explicit driving HIGH triggers (drive corazon / 100.114.219.69 / etc) ' +
        'OR >=2 BROAD hits in driving context. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard A2 (POSITIVE): "drive corazon" emits corazon-peer HINT', () => {
    const brief = 'Drive corazon to navigate to the Stripe dashboard tab and screenshot it.'
    const result = runHook(brief)
    if (!firedHintForTarget(result, 'corazon-peer')) {
      throw new Error(
        'Guard A2 failed: explicit "drive corazon" did not emit corazon-peer HINT. ' +
        'HIGH keyword "drive corazon" MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard A3 (NEGATIVE): bare "macincloud" / "sy094" cross-ref does NOT emit macincloud-rdp HINT', () => {
    const brief = `Inspect SY094 macincloud doctrine. Verify substrate-selection rule references in
~/ecodiaos/patterns/. No RDP open, no GUI driving, no mstsc invocation - pure doc grep.`
    const result = runHook(brief)
    if (firedHintForTarget(result, 'macincloud-rdp')) {
      throw new Error(
        'Guard A3 failed: bare "macincloud" + "sy094" cross-ref fired ' +
        '[GUI-MACRO HINT] target=macincloud-rdp. Phase C Gap 4 narrowing should ' +
        'suppress unless explicit RDP-driving HIGH triggers OR >=2 BROAD hits ' +
        'in same-arc context. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard A4 (POSITIVE): "macincloud_full_screen.rdp" emits macincloud-rdp HINT', () => {
    const brief = 'Open macincloud_full_screen.rdp on Corazon to start the SY094 GUI session.'
    const result = runHook(brief)
    if (!firedHintForTarget(result, 'macincloud-rdp')) {
      throw new Error(
        'Guard A4 failed: explicit RDP filename did not emit macincloud-rdp HINT. ' +
        'HIGH keyword "macincloud_full_screen.rdp" MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard A5 (NEGATIVE): "Corazon screenshot is one of 3 visual-verify mechanics" does NOT emit corazon-peer HINT', () => {
    // Origin false-positive: 16:22 AEST 9 May 2026 cortex-ambient polish
    // brief listed Corazon as one of 3 visual-verify mechanisms (alongside
    // DevTools viewport emulation + curl). Pre-fix bare-noun match fired
    // GUI-MACRO HINT despite the brief shipping pure FE source edits.
    const brief = `Cortex-ambient polish: ship FE source edits to the cortex-ambient component.
Visual verify options listed for completeness:
  1. Curl the deployed page HTML for content checks.
  2. DevTools viewport emulation for mobile breakpoint check.
  3. Corazon screenshot is one of 3 visual-verify mechanics.
This fork ships pure FE source edits only - no driving in scope.`
    const result = runHook(brief)
    if (firedHintForTarget(result, 'corazon-peer')) {
      throw new Error(
        'Guard A5 failed: cortex-ambient brief listing Corazon as one of 3 ' +
        'visual-verify mechanics fired corazon-peer HINT. Phase C Gap 4 narrowing ' +
        'should suppress when only bare BROAD keyword is present and no HIGH ' +
        'driving verb. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard A6 (BACKWARD COMPAT): legacy "keywords" array still fires on any single match', () => {
    // The drive-chrome target retains a single legacy `keywords` array (no
    // HIGH/BROAD split shipped today). Verify the backward-compat path in
    // the hook still emits HINT on any single match.
    const brief = 'Drive chrome to vercel.com/dashboard and screenshot the deployments list.'
    const result = runHook(brief)
    if (!firedHintForTarget(result, 'drive-chrome')) {
      throw new Error(
        'Guard A6 failed: legacy `keywords` array path did not emit drive-chrome HINT ' +
        'on "drive chrome" match. Backward-compat path is broken. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Registry shape: corazon-peer and macincloud-rdp use HIGH/BROAD split', () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
    const targets = registry.targets || []
    const corazon = targets.find((t) => t.label === 'corazon-peer')
    const macincloud = targets.find((t) => t.label === 'macincloud-rdp')

    expect(corazon).toBeDefined()
    expect(Array.isArray(corazon.keywords_high)).toBe(true)
    expect(Array.isArray(corazon.keywords_broad)).toBe(true)
    expect(corazon.keywords_high.length).toBeGreaterThan(0)
    expect(corazon.keywords_broad.length).toBeGreaterThan(0)
    // Bare "corazon" must be in BROAD, not HIGH.
    expect(corazon.keywords_high).not.toContain('corazon')
    expect(corazon.keywords_broad).toContain('corazon')

    expect(macincloud).toBeDefined()
    expect(Array.isArray(macincloud.keywords_high)).toBe(true)
    expect(Array.isArray(macincloud.keywords_broad)).toBe(true)
    expect(macincloud.keywords_high.length).toBeGreaterThan(0)
    expect(macincloud.keywords_broad.length).toBeGreaterThan(0)
    // Bare "macincloud" and "sy094" must be in BROAD, not HIGH.
    expect(macincloud.keywords_high).not.toContain('macincloud')
    expect(macincloud.keywords_high).not.toContain('sy094')
    expect(macincloud.keywords_broad).toContain('macincloud')
    expect(macincloud.keywords_broad).toContain('sy094')
  })
})

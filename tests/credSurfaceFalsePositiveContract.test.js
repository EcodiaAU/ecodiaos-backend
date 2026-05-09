'use strict'

/**
 * Contract test for cred-mention-surface.sh trigger narrowing AND the
 * [FALSE-POSITIVE] tag class plumbing through post-action-applied-tag-check.sh
 * + dispatchEventConsumer.js.
 *
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *           Layer 3 (Phase C Gaps 2 + 3 close, 8 May 2026, fork_moxiyab8_aa35ce).
 *           ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md
 *
 * Origin: Phase C tag-feedback Gaps 2 + 3 closure (status_board row
 *   18f02513-b12d-4d69-9628-98ae6f62db6b). The cred-mention-surface hook was
 *   firing on bare nouns ("iOS", "Apple", "Microsoft", "Corazon", "Bitbucket")
 *   without checking whether the brief actually mutated or invoked any
 *   credential-bound surface. Two false positives this morning (8 May 2026)
 *   on dispatch_event.kind plumbing fork + zernio cron fork triggered the
 *   tightening.
 *
 * What this test guards (5 guards):
 *
 *   Guard 1 (Gap 3 NEGATIVE): bare "iOS" / "Apple" / "Microsoft" mention in
 *     unrelated context does NOT fire [CRED-SURFACE WARN]. The pre-fix hook
 *     fired on `\biOS\b` alone, polluting telemetry with FP rows.
 *
 *   Guard 2 (Gap 3 POSITIVE high-keyword): "rotate APPLE_DEVELOPER_PROGRAM_KEY"
 *     DOES fire. Explicit credential-mutation context is the canonical fire
 *     condition.
 *
 *   Guard 3 (Gap 3 POSITIVE creds.* path): "kv_store.creds.foo" or "creds.x"
 *     DOES fire. Brief-spec calls this out as the canonical credential-context
 *     signal. Always fires unless [NOT-APPLIED] / [FALSE-POSITIVE] tagged.
 *
 *   Guard 4 (Gap 3 acknowledgement suppression): brief with explicit
 *     [NOT-APPLIED] tag for laptop-agent.md AND a casual mention of "Corazon"
 *     elsewhere does NOT re-fire on the laptop-agent surface. The conductor
 *     already explicitly acknowledged.
 *
 *   Guard 5 (Gap 2 plumbing): the post-action-applied-tag-check.sh recognises
 *     the [FALSE-POSITIVE] tag class AND writes was_false_positive=true into
 *     the application-events.jsonl line; the dispatch consumer honours
 *     line.was_false_positive=true ahead of the lexicon classifier.
 *
 * Negative-test verification (manual, performed by author 8 May 2026):
 *   Reverted the bitbucket compound-keyword tightening so bare "bitbucket"
 *   alone fired again, re-ran Guard 1 with the bare-noun "Bitbucket" payload,
 *   and verified the test FAILED (as expected, with the warn-fire). Restored
 *   the tightening; test passed. The conductor confirmed the tightening
 *   actually enforces the bare-noun negative case.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, spawnSync } = require('child_process')

const REPO_ROOT = path.join(__dirname, '..')
const HOOK_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'cred-mention-surface.sh')
const POST_HOOK_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'post-action-applied-tag-check.sh')
const CONSUMER_PATH = path.join(REPO_ROOT, 'src', 'services', 'telemetry', 'dispatchEventConsumer.js')

/**
 * Run the cred-mention-surface.sh hook with a synthetic spawn_fork brief.
 * Returns { stdout, stderr, code } from the bash invocation. The hook's
 * stderr carries the [CRED-SURFACE WARN] lines; stdout carries the
 * hookSpecificOutput JSON.
 *
 * Telemetry side-effects are routed to a temp dir so the test never pollutes
 * the live ~/ecodiaos/logs/telemetry/dispatch-events.jsonl.
 */
function runCredHook(brief, tmpDir) {
  const payload = JSON.stringify({
    tool_name: 'mcp__forks__spawn_fork',
    tool_input: { brief },
  })
  const result = spawnSync('bash', [HOOK_PATH], {
    input: payload,
    env: {
      ...process.env,
      ECODIAOS_TELEMETRY_DIR: tmpDir,
      ECODIAOS_TELEMETRY_FILE: path.join(tmpDir, 'dispatch-events.jsonl'),
    },
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
 * True iff the hook output contains a [CRED-SURFACE WARN] for any cred-class.
 * Used by Guards 1, 2, 3, 4 to assert presence/absence of the warning.
 */
function firedCredWarn(result) {
  return /\[CRED-SURFACE WARN\]/.test(result.stderr) || /\[CRED-SURFACE WARN\]/.test(result.stdout)
}

describe('cred-mention-surface trigger narrowing + FALSE-POSITIVE tag plumbing (Phase C Gaps 2+3, 8 May 2026)', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-surface-fp-test-'))
  })

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  test('Guard 1 (Gap 3 NEGATIVE): bare iOS / Apple / Microsoft mention in unrelated context does NOT fire', () => {
    const brief = `Audit the dispatch_event telemetry pipeline. The doctrine references iOS and Apple
deployment patterns historically, and Microsoft RDP into SY094 is mentioned in cross-refs,
but this fork only walks the application_event JSONL on the VPS - no credential mutation,
no vendor API calls, no kv_store reads. Just SQL queries against application_event and
file reads on /home/tate/ecodiaos/logs/telemetry/.`
    const result = runCredHook(brief, tmpDir)
    if (firedCredWarn(result)) {
      throw new Error(
        'Guard 1 failed: bare-noun mention fired [CRED-SURFACE WARN]. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 2 (Gap 3 POSITIVE high-keyword): "rotate APPLE_DEVELOPER_PROGRAM_KEY" DOES fire', () => {
    const brief = 'Rotate APPLE_DEVELOPER_PROGRAM_KEY in kv_store and verify altool xcrun --apiKey accepts the new value.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 2 failed: rotate APPLE_DEVELOPER_PROGRAM_KEY did not fire [CRED-SURFACE WARN]. ' +
        'High-keyword compound-context credential mutation MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 3 (Gap 3 POSITIVE creds.* path): kv_store.creds.foo DOES fire', () => {
    const brief = 'Read kv_store.creds.bitbucket_api_token and use it to push to [redacted]/[redacted].'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 3 failed: kv_store.creds.* reference did not fire [CRED-SURFACE WARN]. ' +
        'Direct creds.* path is the canonical credential-context signal. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 4 (Gap 3 acknowledgement suppression): brief with explicit [NOT-APPLIED] tag for laptop-agent.md suppresses re-fire on later "Corazon" mention', () => {
    // Brief includes: (a) high-keyword Corazon trigger via input.click reference
    // AND (b) explicit [NOT-APPLIED] tag for laptop-agent.md. Without the
    // suppression, the hook would re-fire on the input.click mention even
    // though the conductor already named the surface in the [NOT-APPLIED] tag.
    const brief = `[NOT-APPLIED] /home/tate/ecodiaos/docs/secrets/laptop-agent.md because this fork runs entirely on VPS - no Corazon laptop-agent calls.

Recon the application_event drift. Reference: cross-pattern grep notes mention input.click and screenshot.screenshot tooling, but no actual driving here.`
    const result = runCredHook(brief, tmpDir)
    // The Corazon surface should NOT re-fire because already_acked() returns
    // true for the laptop-agent.md basename.
    const corazonWarnFired = /laptop-agent\.md|laptop[- ]?agent/.test(result.stderr) ||
                             /laptop-agent\.md|laptop[- ]?agent/.test(result.stdout)
    if (corazonWarnFired) {
      throw new Error(
        'Guard 4 failed: explicit [NOT-APPLIED] tag for laptop-agent.md did not suppress re-fire on later Corazon-driving mention. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 6 (Gap 4 NEGATIVE): DeepSeek RCA brief mentioning kv_store.creds.deepseek as precondition probe does NOT fire', () => {
    // Origin false-positive: 16:08 AEST 9 May 2026 DeepSeek RCA brief
    // mentioned kv_store.creds.deepseek once as a precondition probe (not
    // a credential mutation). Pre-fix the generic creds.* catch-all + the
    // missing DeepSeek group both fired on bare reference.
    const brief = `Run DeepSeek RCA on the 18-event 400-storm in cc_session a427439a.
Precondition probe: confirm kv_store.creds.deepseek is set (read-only, no mutation).
Walk the application_event JSONL for thinking-block strip events. No external API calls.`
    const result = runCredHook(brief, tmpDir)
    if (firedCredWarn(result)) {
      throw new Error(
        'Guard 6 failed: bare-noun DeepSeek + bare creds.deepseek precondition probe ' +
        'fired [CRED-SURFACE WARN]. Phase C Gap 4 narrowing should suppress unless ' +
        'mutation context or 2+ distinct creds.* paths present. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 7 (Gap 4 POSITIVE): rotate DEEPSEEK_API_KEY DOES fire', () => {
    const brief = 'Rotate DEEPSEEK_API_KEY in kv_store and verify the proxy strips Anthropic thinking blocks at the wire boundary.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 7 failed: rotate DEEPSEEK_API_KEY did not fire [CRED-SURFACE WARN]. ' +
        'High-keyword DeepSeek credential mutation MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 8 (Gap 4 POSITIVE): kv_store.creds.deepseek = {api_key: sk-...} (value mutation) DOES fire', () => {
    const brief = 'After Tate provides the new key, set kv_store.creds.deepseek = {api_key: sk-abcd1234}, then restart ecodia-api.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 8 failed: kv_store.creds.deepseek = {...} value mutation did not fire ' +
        '[CRED-SURFACE WARN]. Either the deepseek_high (creds.deepseek = ) or the ' +
        'generic_creds_high mutation regex MUST match. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 9 (Gap 4 NEGATIVE): bare Corazon mention as one of N visual-verify mechanics does NOT fire from cred-mention-surface', () => {
    // Origin false-positive: 16:22 AEST 9 May 2026 cortex-ambient polish
    // brief listed Corazon as one of 3 visual-verify mechanisms (alongside
    // DevTools viewport emulation + curl). Pre-fix the cred-mention Corazon
    // group fired despite being narrowed (HIGH includes "screenshot" call
    // forms). Bare "Corazon screenshot" without an explicit driving call is
    // BROAD only.
    const brief = `Cortex-ambient polish: ship FE source edits to the cortex-ambient component.
Visual verify options:
  1. Curl the deployed page HTML for content checks.
  2. DevTools viewport emulation for mobile breakpoint check.
  3. Corazon screenshot is one of 3 visual-verify mechanics.
This fork ships pure FE source edits, no Corazon driving in scope.`
    const result = runCredHook(brief, tmpDir)
    if (firedCredWarn(result)) {
      throw new Error(
        'Guard 9 failed: bare Corazon mention as listed option fired [CRED-SURFACE WARN]. ' +
        'Phase C Gap 4 narrowing should suppress unless an actual driving call ' +
        '(input.click / input.type / drive corazon / 100.114.219.69) is present. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 10 (Gap 4 POSITIVE): rotating kv_store.creds.laptop_agent DOES fire from cred-mention-surface', () => {
    // Phase C Gap 4 (9 May 2026 evening pass): the original Guard 10 brief
    // was "Drive Corazon via input.click ... screenshot.screenshot ...
    // input.type the cred into the rotation form." That brief was the
    // canonical false-positive class - GUI driving on Corazon for some
    // OTHER cred (Stripe rotation in this case) was firing the
    // laptop-agent.md surface despite laptop-agent itself not being the
    // cred in scope. With the silent-rate evidence (114 surfaces / 7d at
    // 93.9% silent on laptop-agent.md) the GUI-driving primitives were
    // dropped from Corazon HIGH and the test brief is rewritten to a true
    // laptop-agent CRED-MUTATION case.
    const brief = 'Rotate the laptop_agent bearer token. Update kv_store.creds.laptop_agent.agent_token in the registry, restart eos-laptop-agent on Corazon, verify via /api/info.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 10 failed: explicit kv_store.creds.laptop_agent.agent_token rotation did not fire ' +
        '[CRED-SURFACE WARN]. The laptop_agent (underscored kv-key name) MUST be in HIGH. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 11 (Gap 4 NEGATIVE): bare Canva mention as design-doctrine cross-ref does NOT fire', () => {
    const brief = `Self-evolution sweep: doctrine cross-ref to canva from the brand-asset doctrine.
No Canva API calls, no Connect API, no token rotation. Pure doctrine grep over patterns/.`
    const result = runCredHook(brief, tmpDir)
    if (firedCredWarn(result)) {
      throw new Error(
        'Guard 11 failed: bare-noun "canva" mention without compound HIGH context fired ' +
        '[CRED-SURFACE WARN]. Phase C Gap 4 narrowing should require canva_high>=1 OR ' +
        'canva_broad>=2. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 12 (Gap 4 POSITIVE): "rotate CANVA_TOKEN" DOES fire', () => {
    const brief = 'Rotate CANVA_TOKEN per the canva-connect-api credential rotation cadence and verify in canva dashboard.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 12 failed: rotate CANVA_TOKEN did not fire [CRED-SURFACE WARN]. ' +
        'High-keyword Canva credential mutation MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 13 (Gap 4 NEGATIVE): bare RevenueCat mention as cross-ref does NOT fire', () => {
    const brief = `Audit Roam IAP architecture references. Sees revenuecat as the SDK provider per pattern cross-refs.
No SDK integration, no API key, no rotation - just a pattern grep across docs/.`
    const result = runCredHook(brief, tmpDir)
    if (firedCredWarn(result)) {
      throw new Error(
        'Guard 13 failed: bare-noun "revenuecat" mention without compound HIGH context fired ' +
        '[CRED-SURFACE WARN]. Phase C Gap 4 narrowing should suppress. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 14 (Gap 4 POSITIVE): "rotate REVENUECAT_API_KEY" DOES fire', () => {
    const brief = 'Rotate REVENUECAT_API_KEY in kv_store and re-verify the SDK integration on roam-iap.'
    const result = runCredHook(brief, tmpDir)
    if (!firedCredWarn(result)) {
      throw new Error(
        'Guard 14 failed: rotate REVENUECAT_API_KEY did not fire [CRED-SURFACE WARN]. ' +
        'High-keyword RevenueCat credential mutation MUST fire. ' +
        `stderr=${result.stderr.slice(0, 500)}`
      )
    }
  })

  test('Guard 5 (Gap 2 plumbing): post-action hook recognises [FALSE-POSITIVE] AND consumer honours explicit was_false_positive=true', () => {
    // Sub-guard 5a: post-action-applied-tag-check.sh source must include
    // [FALSE-POSITIVE] tag-class detection AND set was_false_positive in JSONL.
    const postHook = fs.readFileSync(POST_HOOK_PATH, 'utf8')
    expect(postHook).toMatch(/\[FALSE-POSITIVE\]/)
    expect(postHook).toMatch(/false_positive_present=true/)
    expect(postHook).toMatch(/was_false_positive_jsonval/)
    expect(postHook).toMatch(/--argjson was_false_positive/)

    // Sub-guard 5b: dispatchEventConsumer.js must read line.was_false_positive
    // BEFORE running the lexicon classifier. The explicit signal wins.
    const consumer = fs.readFileSync(CONSUMER_PATH, 'utf8')
    expect(consumer).toMatch(/line\.was_false_positive\s*===\s*true/)
    // The honour-explicit branch must come BEFORE the lexicon fallback.
    // Use lastIndexOf for classifyIdx so we find the CALL site, not the
    // function definition (which appears earlier in the file at line ~262).
    const honourIdx = consumer.indexOf('line.was_false_positive')
    const classifyIdx = consumer.lastIndexOf('classifyApplicationEventFalsePositive({ reason, applied })')
    if (honourIdx < 0 || classifyIdx < 0 || honourIdx >= classifyIdx) {
      throw new Error(
        'Guard 5 failed: consumer must check explicit line.was_false_positive ' +
        'BEFORE the lexicon classifier. Order observed: ' +
        `honourIdx=${honourIdx}, classifyIdx=${classifyIdx}`
      )
    }

    // Sub-guard 5c: strip-tag-lines.sh must mask [FALSE-POSITIVE] so the
    // tag itself never feeds keyword-scanning hooks (anti-self-fire rule).
    const stripPath = path.join(REPO_ROOT, 'scripts', 'hooks', 'lib', 'strip-tag-lines.sh')
    const stripContent = fs.readFileSync(stripPath, 'utf8')
    expect(stripContent).toMatch(/FALSE-POSITIVE/)
  })
})

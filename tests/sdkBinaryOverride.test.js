'use strict'

/**
 * Regression test for the SDK musl-vs-glibc binary auto-detect trap.
 *
 * Doctrine: ~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md
 * Origin incident: 8 May 2026 ~08:24-08:39 AEST. Every fork dispatch aborted
 * in ~35ms because the SDK's B7() resolver tried `linux-x64-musl` first and
 * found no `/lib/ld-musl-x86_64.so.1`. Fixed in commit 2980601 by passing
 * `pathToClaudeCodeExecutable` on every SDK options object.
 *
 * What this test guards:
 *   1. Every SDK `query()` options object in src/ MUST carry
 *      `pathToClaudeCodeExecutable`. If a future call site forgets it, the
 *      SDK silently picks the broken musl binary and forks die in 35ms.
 *   2. No override may point at the musl variant. If someone "fixes" the
 *      override by copy-pasting the wrong package name, this catches it.
 *   3. The known set of SDK call sites must remain present. If one is
 *      deleted (or renamed), the diff must explicitly update this list.
 *
 * Detection heuristic: an SDK top-level `query()` options object is uniquely
 * fingerprinted by `allowDangerouslySkipPermissions: true`. Subagent configs
 * (passed in the `agents:` field of the parent options) carry their own
 * `permissionMode: 'bypassPermissions'` but inherit the binary path from the
 * parent process, so they do NOT need their own `pathToClaudeCodeExecutable`.
 * The `allowDangerouslySkipPermissions` flag only appears at the top level
 * because the SDK rejects it on subagent configs.
 *
 * The test walks src/ recursively, strips comments to avoid false positives
 * from commented-out blocks, then asserts the override count >=
 * allowDangerouslySkipPermissions count per file.
 */

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(REPO_ROOT, 'src')

/** Recursively list all .js files under dir, skipping node_modules and .git. */
function walkJsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkJsFiles(full, acc)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      acc.push(full)
    }
  }
  return acc
}

/** Strip /* ... *\/ and // ... comments. Keeps line count similar but defangs commented-out code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * Scan the repo for top-level SDK query() options blocks. A top-level options
 * block is fingerprinted by `allowDangerouslySkipPermissions: true` - subagent
 * configs in the `agents:` field of the parent options do NOT carry this flag
 * (the SDK rejects it on subagents), so the count is unambiguous.
 *
 * We also collect `pathToClaudeCodeExecutable` and musl-variant references
 * for the assertions below.
 */
function scanSdkSites() {
  const sites = []
  for (const fp of walkJsFiles(SRC_DIR)) {
    const raw = fs.readFileSync(fp, 'utf8')
    const stripped = stripComments(raw)

    const topLevelBlocks = (stripped.match(/allowDangerouslySkipPermissions\s*:\s*true/g) || []).length
    const subagentBlocks = (stripped.match(/permissionMode\s*:\s*['"]bypassPermissions['"]/g) || []).length - topLevelBlocks
    const overrideHits = (stripped.match(/pathToClaudeCodeExecutable/g) || []).length
    const muslHits = (stripped.match(/claude-agent-sdk-linux-x64-musl/g) || []).length

    if (topLevelBlocks > 0 || overrideHits > 0) {
      sites.push({
        file: path.relative(REPO_ROOT, fp),
        topLevelBlocks,
        subagentBlocks: Math.max(0, subagentBlocks),
        overrideHits,
        muslHits,
      })
    }
  }
  return sites
}

const sites = scanSdkSites()

describe('SDK musl-vs-glibc binary override (Origin: 8 May 2026 commit 2980601)', () => {
  test('detection found at least one SDK call site (sanity check)', () => {
    // If this fails, either the codebase has zero SDK call sites (improbable)
    // or the heuristic stopped matching - investigate before adjusting.
    expect(sites.length).toBeGreaterThan(0)
  })

  test('every top-level SDK options object passes pathToClaudeCodeExecutable', () => {
    const failures = []
    for (const site of sites) {
      if (site.topLevelBlocks > site.overrideHits) {
        failures.push(
          `${site.file}: ${site.topLevelBlocks} top-level SDK options block(s) but only ` +
          `${site.overrideHits} pathToClaudeCodeExecutable override(s). ` +
          `Each query() options object must pass the override or the SDK's ` +
          `B7() resolver picks the musl binary on glibc Linux and forks die in 35ms. ` +
          `Doctrine: ~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md`
        )
      }
    }
    if (failures.length > 0) {
      throw new Error('SDK binary override missing:\n  ' + failures.join('\n  '))
    }
  })

  test('no override points at the musl variant package', () => {
    // Catches the "fix by copy-paste with the wrong package name" failure mode.
    const failures = []
    for (const site of sites) {
      if (site.muslHits > 0) {
        failures.push(
          `${site.file}: references claude-agent-sdk-linux-x64-musl. ` +
          `The override MUST point at the glibc variant (no -musl suffix). ` +
          `Doctrine: ~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md`
        )
      }
    }
    if (failures.length > 0) {
      throw new Error('Musl override detected:\n  ' + failures.join('\n  '))
    }
  })

  test('known SDK call sites are still present (no silent deletion)', () => {
    // Pinned set as of commit 2980601 (8 May 2026). If a site is deleted,
    // the diff that deletes it must also update this list - forces a deliberate
    // decision rather than silent regression.
    const expected = [
      'src/rescue/rescueRunner.js',
      'src/routes/voiceRelay.js',
      'src/services/forkService.js',
      'src/services/osSessionService.js',
    ]
    const present = new Set(sites.filter(s => s.topLevelBlocks > 0).map(s => s.file))
    for (const fp of expected) {
      expect(present.has(fp)).toBe(true)
    }
  })

  test('every override uses the canonical glibc path or env var fallback', () => {
    // Catches typos and divergent paths. The canonical pattern is:
    //   pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'
    const failures = []
    for (const site of sites) {
      if (site.overrideHits === 0) continue
      const raw = fs.readFileSync(path.join(REPO_ROOT, site.file), 'utf8')
      const stripped = stripComments(raw)
      // Each override line must reference either the env var OR the glibc package path.
      const overrideLines = stripped
        .split('\n')
        .filter(l => l.includes('pathToClaudeCodeExecutable'))
      for (const line of overrideLines) {
        const usesEnv = line.includes('CLAUDE_CODE_EXECUTABLE')
        const usesGlibcPath = line.includes('claude-agent-sdk-linux-x64/claude') &&
                              !line.includes('claude-agent-sdk-linux-x64-musl')
        // Also accept passing a function call (e.g. resolveCliBinary()) so we
        // don't lock the codebase into the inline string forever - just refuse
        // a literal that's clearly wrong.
        const hasIdentifier = /pathToClaudeCodeExecutable\s*:\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[,)]/.test(line)
        if (!usesEnv && !usesGlibcPath && !hasIdentifier) {
          failures.push(`${site.file}: override line does not reference env var, glibc path, or identifier:\n    ${line.trim()}`)
        }
      }
    }
    if (failures.length > 0) {
      throw new Error('Non-canonical SDK override:\n  ' + failures.join('\n  '))
    }
  })
})

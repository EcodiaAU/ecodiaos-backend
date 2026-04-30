'use strict'

/**
 * selfModAllowlist - hard-deny list for paths Factory CC sessions cannot touch.
 *
 * Implements section 2.3 of ~/ecodiaos/docs/SECURITY_HARDENING.md.
 *
 * Three enforcement points compose to defend the factory self-modification
 * chain:
 *   1. Server-side check in deploymentService.deploySession() rejects before
 *      git commit if any modified file matches a DENY pattern.
 *   2. Server-side check in factoryOversightService.processSession() before
 *      the auto-deploy gate prevents the deploy decision from even being
 *      reached when denied paths are touched.
 *   3. Pre-commit hook in the factory worktree
 *      (scripts/factory-precommit-allowlist.sh) fires the same check at
 *      git-commit time as defense in depth.
 *
 * If a Factory session attempts to modify any DENY path, the deploy is
 * blocked regardless of review approval, confidence score, or any other
 * gate. This is the last line of defense against the prompt-injection
 * self-RCE chain documented in section 1 of SECURITY_HARDENING.md.
 *
 * Path matching: minimatch glob patterns against repo-relative paths.
 *   - Leading './' stripped before matching.
 *   - Absolute paths denied (defense in depth).
 *   - Paths containing '..' segments denied (defense in depth).
 *   - null/undefined/empty paths denied (defense in depth).
 *   - dot: true so hidden files (.env, .github, .claude) are matched.
 *
 * The deny patterns are sourced verbatim from section 2.3 of the spec but
 * with the leading 'backend/' prefix stripped because this repo is not laid
 * out as a monorepo - paths here are repo-relative from the backend root.
 */

// minimatch v3 default-exports the function itself; v5+ exports as named.
// Probe both shapes so the module works against either resolution.
const minimatchModule = require('minimatch')
const minimatch = typeof minimatchModule === 'function'
  ? minimatchModule
  : minimatchModule.minimatch

const DENY_PATHS = Object.freeze([
  // Self-mod critical: the agent's own machinery
  'src/services/forkService.js',
  'src/services/factoryOversightService.js',
  'src/services/secretSafetyService.js',
  'src/services/gmailService.js',
  'src/services/deploymentService.js',
  'src/services/tateActiveGate.js',
  // MCP servers - any change to MCP scope alters tool surface
  'src/mcp/**',
  // The hardening spec itself
  'docs/SECURITY_HARDENING.md',
  // Credentials and credential-shaped paths
  '**/.env*',
  '**/*secret*',
  '**/*credential*',
  // CI infrastructure
  '.github/workflows/**',
  // Agent settings
  '.claude/settings*.json',
])

/**
 * Normalize a relative path for matching.
 *
 * Returns null if the path should be denied for input-shape reasons
 * (absolute, contains '..' segment, empty, or non-string). Returns the
 * cleaned path otherwise.
 */
function _normalize(p) {
  if (typeof p !== 'string' || p.length === 0) return null
  if (p.startsWith('/')) return null
  // Reject path-traversal markers anywhere in the string. A single '.' is
  // fine ('./foo' is handled below); '..' as its own segment is suspicious.
  if (p.split('/').some(seg => seg === '..')) return null
  return p.startsWith('./') ? p.slice(2) : p
}

/**
 * Test whether a single relative path matches any DENY pattern.
 *
 * Returns true if the path is denied. Returns true on null/invalid input
 * as defense in depth - a malformed path should never sneak through.
 */
function isDenied(relativePath) {
  const normalized = _normalize(relativePath)
  if (normalized === null) return true
  return DENY_PATHS.some(pattern =>
    minimatch(normalized, pattern, { dot: true })
  )
}

/**
 * Check an array of file paths against the deny list.
 *
 * Returns:
 *   { allowed: boolean, deniedFiles: string[] }
 *
 * Behaviour:
 *   - Empty array returns { allowed: true, deniedFiles: [] }.
 *   - Any single denied path returns allowed: false with all denied files
 *     listed in deniedFiles (preserves input order).
 *   - Non-array input returns { allowed: false, deniedFiles: ['<invalid-input>'] }
 *     so callers cannot accidentally pass undefined/null/object and have
 *     it short-circuit to allowed.
 */
function checkDiff(filesChanged) {
  if (!Array.isArray(filesChanged)) {
    return { allowed: false, deniedFiles: ['<invalid-input>'] }
  }
  if (filesChanged.length === 0) {
    return { allowed: true, deniedFiles: [] }
  }
  const denied = filesChanged.filter(isDenied)
  return {
    allowed: denied.length === 0,
    deniedFiles: denied,
  }
}

module.exports = {
  DENY_PATHS,
  isDenied,
  checkDiff,
}

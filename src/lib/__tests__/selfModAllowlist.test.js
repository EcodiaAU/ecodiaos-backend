'use strict'

/**
 * Tests for src/lib/selfModAllowlist.js
 *
 * Covers:
 *   - DENY_PATHS exports a frozen array containing all section 2.3 patterns
 *   - isDenied returns true for every exact path and every glob class
 *   - isDenied returns false for paths not matching any pattern
 *   - isDenied rejects invalid input shapes (null/undefined/empty/absolute/..)
 *   - checkDiff returns the right shape for empty/single/mix/all-denied/non-array
 *   - Path normalization (leading './' stripped)
 *   - Glob expansion across all DENY_PATHS classes (mcp, env, secret,
 *     credential, github workflows, claude settings)
 */

const {
  DENY_PATHS,
  isDenied,
  checkDiff,
} = require('../selfModAllowlist')

describe('selfModAllowlist.DENY_PATHS', () => {
  test('exports an array', () => {
    expect(Array.isArray(DENY_PATHS)).toBe(true)
    expect(DENY_PATHS.length).toBeGreaterThan(0)
  })

  test('is frozen', () => {
    expect(Object.isFrozen(DENY_PATHS)).toBe(true)
  })

  test('includes every section 2.3 path verbatim', () => {
    const required = [
      'src/services/forkService.js',
      'src/services/factoryOversightService.js',
      'src/services/secretSafetyService.js',
      'src/services/gmailService.js',
      'src/services/deploymentService.js',
      'src/services/tateActiveGate.js',
      'src/mcp/**',
      'docs/SECURITY_HARDENING.md',
      '**/.env*',
      '**/*secret*',
      '**/*credential*',
      '.github/workflows/**',
      '.claude/settings*.json',
    ]
    for (const p of required) {
      expect(DENY_PATHS).toContain(p)
    }
  })
})

describe('selfModAllowlist.isDenied - exact path matches', () => {
  test.each([
    ['src/services/forkService.js'],
    ['src/services/factoryOversightService.js'],
    ['src/services/secretSafetyService.js'],
    ['src/services/gmailService.js'],
    ['src/services/deploymentService.js'],
    ['src/services/tateActiveGate.js'],
    ['docs/SECURITY_HARDENING.md'],
  ])('denies exact path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })
})

describe('selfModAllowlist.isDenied - src/mcp glob', () => {
  test.each([
    ['src/mcp/index.js'],
    ['src/mcp/gmail/index.js'],
    ['src/mcp/factory/server.js'],
    ['src/mcp/deeply/nested/file.js'],
  ])('denies src/mcp path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })

  test('does NOT deny src/services/foo.js (not under mcp)', () => {
    expect(isDenied('src/services/foo.js')).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - dot env glob', () => {
  test.each([
    ['.env'],
    ['.env.local'],
    ['.env.production'],
    ['.env.test'],
    ['.envrc'],
    ['src/.env'],
    ['src/services/.env.local'],
    ['deeply/nested/path/.env.test'],
  ])('denies env path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })

  test('does NOT deny envsettings.txt (no leading dot)', () => {
    expect(isDenied('envsettings.txt')).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - secret glob', () => {
  test.each([
    ['secret.txt'],
    ['my-secret-file.json'],
    ['config/secrets.js'],
    ['src/db/secret-keys.ts'],
    ['secrets.yaml'],
  ])('denies secret path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })
})

describe('selfModAllowlist.isDenied - credential glob', () => {
  test.each([
    ['credentials.json'],
    ['src/db/credential-store.ts'],
    ['anything-with-credential-in-name.md'],
    ['config/aws-credentials'],
  ])('denies credential path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })
})

describe('selfModAllowlist.isDenied - github workflows glob', () => {
  test.each([
    ['.github/workflows/ci.yml'],
    ['.github/workflows/deploy.yaml'],
    ['.github/workflows/nested/sub.yml'],
  ])('denies workflow path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })

  test('does NOT deny .github/CODEOWNERS (not in workflows)', () => {
    expect(isDenied('.github/CODEOWNERS')).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - claude settings glob', () => {
  test.each([
    ['.claude/settings.json'],
    ['.claude/settings.local.json'],
    ['.claude/settings_v2.json'],
  ])('denies claude settings path: %s', (p) => {
    expect(isDenied(p)).toBe(true)
  })

  test('does NOT deny .claude/other.json', () => {
    expect(isDenied('.claude/other.json')).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - allowed paths', () => {
  test.each([
    ['src/routes/api.js'],
    ['src/services/codeRequestService.js'],
    ['src/lib/util.js'],
    ['src/lib/selfModAllowlist.js'], // ironic - allowlist itself can be modified
    ['package.json'],
    ['README.md'],
    ['docs/OTHER.md'],
    ['frontend/components/Page.tsx'],
    ['tests/lib/something.test.js'],
  ])('allows non-denied path: %s', (p) => {
    expect(isDenied(p)).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - defense-in-depth on bad input', () => {
  test('rejects null', () => {
    expect(isDenied(null)).toBe(true)
  })

  test('rejects undefined', () => {
    expect(isDenied(undefined)).toBe(true)
  })

  test('rejects empty string', () => {
    expect(isDenied('')).toBe(true)
  })

  test('rejects non-string types', () => {
    expect(isDenied(123)).toBe(true)
    expect(isDenied({})).toBe(true)
    expect(isDenied([])).toBe(true)
  })

  test('rejects absolute paths', () => {
    expect(isDenied('/etc/passwd')).toBe(true)
    expect(isDenied('/home/tate/ecodiaos/src/lib/util.js')).toBe(true)
  })

  test('rejects paths containing path-traversal markers', () => {
    expect(isDenied('../../../etc/passwd')).toBe(true)
    expect(isDenied('src/../etc/secrets')).toBe(true)
    expect(isDenied('foo/..')).toBe(true)
  })

  test('does NOT reject paths with dots that are not traversal markers', () => {
    expect(isDenied('foo.js')).toBe(false)
    expect(isDenied('src/lib/util.test.js')).toBe(false)
    expect(isDenied('a.b.c.js')).toBe(false)
  })
})

describe('selfModAllowlist.isDenied - leading "./" normalization', () => {
  test('normalizes ./src/services/forkService.js to denied', () => {
    expect(isDenied('./src/services/forkService.js')).toBe(true)
  })

  test('normalizes ./package.json to allowed', () => {
    expect(isDenied('./package.json')).toBe(false)
  })
})

describe('selfModAllowlist.checkDiff', () => {
  test('empty array returns allowed: true', () => {
    expect(checkDiff([])).toEqual({ allowed: true, deniedFiles: [] })
  })

  test('single allowed path returns allowed: true', () => {
    expect(checkDiff(['src/routes/api.js'])).toEqual({
      allowed: true,
      deniedFiles: [],
    })
  })

  test('single denied path returns allowed: false', () => {
    expect(checkDiff(['src/services/forkService.js'])).toEqual({
      allowed: false,
      deniedFiles: ['src/services/forkService.js'],
    })
  })

  test('mix returns only the denied subset, in input order', () => {
    const result = checkDiff([
      'src/routes/api.js',
      'src/services/forkService.js',
      'README.md',
      'src/mcp/gmail/index.js',
    ])
    expect(result.allowed).toBe(false)
    expect(result.deniedFiles).toEqual([
      'src/services/forkService.js',
      'src/mcp/gmail/index.js',
    ])
  })

  test('all-denied input returns all denied files', () => {
    const denied = [
      'src/services/forkService.js',
      '.env',
      'docs/SECURITY_HARDENING.md',
    ]
    const result = checkDiff(denied)
    expect(result.allowed).toBe(false)
    expect(result.deniedFiles).toEqual(denied)
  })

  test('non-array null returns allowed: false sentinel', () => {
    expect(checkDiff(null)).toEqual({
      allowed: false,
      deniedFiles: ['<invalid-input>'],
    })
  })

  test('non-array undefined returns allowed: false sentinel', () => {
    expect(checkDiff(undefined)).toEqual({
      allowed: false,
      deniedFiles: ['<invalid-input>'],
    })
  })

  test('non-array string returns allowed: false sentinel', () => {
    expect(checkDiff('not an array')).toEqual({
      allowed: false,
      deniedFiles: ['<invalid-input>'],
    })
  })

  test('non-array object returns allowed: false sentinel', () => {
    expect(checkDiff({ files: ['x'] })).toEqual({
      allowed: false,
      deniedFiles: ['<invalid-input>'],
    })
  })
})

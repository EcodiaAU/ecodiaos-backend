'use strict'

/**
 * Tests for src/lib/securityGate.js - the §2.2 dual-reviewer policy layer.
 *
 * Covers:
 *   - Sensitive-path detection across the SECURITY_SENSITIVE_PREFIXES list
 *   - shouldRunReviewB logic (self-mod OR sensitive-path OR feature-disabled)
 *   - Feature-flag defaults (enabled by default, enforce off by default)
 *   - Status transitions between shadow and enforce mode
 *
 * Env is mutated per-describe to exercise the flag combinations. Jest's
 * module cache is reset between flag flips so env.js re-parses each time.
 */

function freshRequire() {
  jest.resetModules()
  return require('../securityGate')
}

describe('securityGate.touchesSensitivePath', () => {
  const gate = require('../securityGate')

  test.each([
    ['src/services/factoryOversightService.js'],
    ['src/services/deploymentService.js'],
    ['src/services/gmailService.js'],
    ['src/services/forkService.js'],
    ['src/services/secretSafetyService.js'],
    ['src/services/tateActiveGate.js'],
    ['src/services/securityReviewerService.js'],
    ['src/lib/selfModAllowlist.js'],
    ['src/lib/untrustedInput.js'],
    ['src/lib/securityGate.js'],
    ['src/mcp/gmail/index.js'],
  ])('flags sensitive path: %s', (p) => {
    expect(gate.touchesSensitivePath([p])).toBe(true)
  })

  test.each([
    ['src/routes/api.js'],
    ['src/services/crmService.js'],
    ['src/services/gmailDraft.js'],
    ['README.md'],
    ['docs/OTHER.md'],
    ['package.json'],
  ])('does not flag ordinary path: %s', (p) => {
    expect(gate.touchesSensitivePath([p])).toBe(false)
  })

  test('handles ./ prefix', () => {
    expect(gate.touchesSensitivePath(['./src/services/gmailService.js'])).toBe(true)
  })

  test('non-array input returns false', () => {
    expect(gate.touchesSensitivePath(null)).toBe(false)
    expect(gate.touchesSensitivePath(undefined)).toBe(false)
    expect(gate.touchesSensitivePath('not an array')).toBe(false)
  })

  test('empty array returns false', () => {
    expect(gate.touchesSensitivePath([])).toBe(false)
  })

  test('mix with at least one sensitive path returns true', () => {
    expect(
      gate.touchesSensitivePath([
        'README.md',
        'src/routes/api.js',
        'src/mcp/factory/index.js',
      ]),
    ).toBe(true)
  })
})

describe('securityGate.shouldRunReviewB - feature flag defaults', () => {
  const ORIGINAL_ENV = process.env
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })
  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.resetModules()
  })

  test('default: enabled, not enforced', () => {
    delete process.env.SECURITY_DUAL_REVIEWER
    delete process.env.SECURITY_DUAL_REVIEWER_ENFORCE
    const gate = freshRequire()
    expect(gate.isDualReviewerEnabled()).toBe(true)
    expect(gate.isEnforceMode()).toBe(false)
  })

  test('SECURITY_DUAL_REVIEWER=0 disables the gate', () => {
    process.env.SECURITY_DUAL_REVIEWER = '0'
    const gate = freshRequire()
    expect(gate.isDualReviewerEnabled()).toBe(false)
  })

  test('SECURITY_DUAL_REVIEWER_ENFORCE=1 enables enforce', () => {
    process.env.SECURITY_DUAL_REVIEWER_ENFORCE = '1'
    const gate = freshRequire()
    expect(gate.isEnforceMode()).toBe(true)
  })

  test('shouldRunReviewB=true when self-mod and enabled', () => {
    const gate = freshRequire()
    expect(
      gate.shouldRunReviewB({ isSelfMod: true, filesChanged: ['README.md'] }),
    ).toBe(true)
  })

  test('shouldRunReviewB=true when sensitive path and enabled', () => {
    const gate = freshRequire()
    expect(
      gate.shouldRunReviewB({
        isSelfMod: false,
        filesChanged: ['src/services/gmailService.js'],
      }),
    ).toBe(true)
  })

  test('shouldRunReviewB=false when disabled regardless of inputs', () => {
    process.env.SECURITY_DUAL_REVIEWER = '0'
    const gate = freshRequire()
    expect(
      gate.shouldRunReviewB({
        isSelfMod: true,
        filesChanged: ['src/mcp/gmail/index.js'],
      }),
    ).toBe(false)
  })

  test('shouldRunReviewB=false for ordinary non-self-mod diff', () => {
    const gate = freshRequire()
    expect(
      gate.shouldRunReviewB({
        isSelfMod: false,
        filesChanged: ['src/routes/api.js'],
      }),
    ).toBe(false)
  })
})

describe('securityGate.reviewApprovalToStatus / status helpers', () => {
  const ORIGINAL_ENV = process.env
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL = 'postgres://fake'
    process.env.JWT_SECRET = 'x'.repeat(32)
    process.env.DASHBOARD_PASSWORD_HASH = 'x'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })
  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.resetModules()
  })

  test('shadow mode: approval becomes shadow_approved', () => {
    const gate = freshRequire()
    expect(gate.reviewApprovalToStatus(true)).toBe('shadow_approved')
    expect(gate.reviewApprovalToStatus(false)).toBe('shadow_rejected')
  })

  test('enforce mode: approval becomes approved / rejected', () => {
    process.env.SECURITY_DUAL_REVIEWER_ENFORCE = '1'
    const gate = freshRequire()
    expect(gate.reviewApprovalToStatus(true)).toBe('approved')
    expect(gate.reviewApprovalToStatus(false)).toBe('rejected')
  })

  test('isApprovedStatus: only "approved" authorises deploy', () => {
    const gate = freshRequire()
    expect(gate.isApprovedStatus('approved')).toBe(true)
    expect(gate.isApprovedStatus('shadow_approved')).toBe(false)
    expect(gate.isApprovedStatus('rejected')).toBe(false)
    expect(gate.isApprovedStatus('shadow_rejected')).toBe(false)
    expect(gate.isApprovedStatus(null)).toBe(false)
    expect(gate.isApprovedStatus(undefined)).toBe(false)
  })

  test('isHardRejectStatus: only "rejected" is a hard reject', () => {
    const gate = freshRequire()
    expect(gate.isHardRejectStatus('rejected')).toBe(true)
    expect(gate.isHardRejectStatus('shadow_rejected')).toBe(false)
    expect(gate.isHardRejectStatus('approved')).toBe(false)
    expect(gate.isHardRejectStatus(null)).toBe(false)
  })
})

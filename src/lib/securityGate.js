'use strict'

/**
 * securityGate — shared helpers for the §2.2 dual-reviewer gate.
 *
 * The §2.3 allowlist (selfModAllowlist.js) is a HARD deny — diffs touching
 * those paths are blocked outright. Review B (§2.2) fires one ring wider:
 * whenever a CC session is flagged as self-modification OR whenever the
 * diff touches a file inside a security-sensitive directory. That catches
 * changes that don't trip the hard allowlist (e.g. a new helper under
 * src/services/ that touches a gate indirectly) but still warrant an
 * isolated second look before auto-deploy.
 *
 * Two flags gate the behaviour:
 *   SECURITY_DUAL_REVIEWER        ("1" to run the gate at all; default "1")
 *   SECURITY_DUAL_REVIEWER_ENFORCE ("1" to block deploy on rejection;
 *                                   default "0" for shadow mode)
 *
 * Shadow mode writes 'shadow_approved' / 'shadow_rejected' so we can
 * measure false-reject rate over 24-48h before flipping to enforce.
 */

// Read process.env directly (not the zod-validated ../config/env module)
// so this helper is usable from tests without the full env bootstrap.

// Paths that widen the §2.3 hard deny list for Review B trigger purposes.
// These do NOT block deploy on their own — they just tell the oversight
// service "this diff deserves Review B even if the session isn't flagged
// self_modification". Keep this list conservative: it's a prompt-for-review,
// not a block.
const SECURITY_SENSITIVE_PREFIXES = Object.freeze([
  'src/services/factoryOversightService',
  'src/services/deploymentService',
  'src/services/gmailService',
  'src/services/forkService',
  'src/services/secretSafetyService',
  'src/services/tateActiveGate',
  'src/services/securityReviewerService',
  'src/lib/selfModAllowlist',
  'src/lib/untrustedInput',
  'src/lib/securityGate',
  'src/mcp/',
])

function touchesSensitivePath(filesChanged) {
  if (!Array.isArray(filesChanged)) return false
  return filesChanged.some((raw) => {
    if (typeof raw !== 'string' || !raw) return false
    const p = raw.startsWith('./') ? raw.slice(2) : raw
    return SECURITY_SENSITIVE_PREFIXES.some((prefix) => p.startsWith(prefix))
  })
}

function shouldRunReviewB({ isSelfMod, filesChanged }) {
  if (!isDualReviewerEnabled()) return false
  if (isSelfMod) return true
  return touchesSensitivePath(filesChanged)
}

function isDualReviewerEnabled() {
  // Default ON — opt-out via explicit '0'. The gate is cheap (one Claude
  // call per self-mod, which is already a rare event) and fails closed,
  // so the default should protect.
  const raw = process.env.SECURITY_DUAL_REVIEWER
  if (raw === undefined || raw === null || raw === '') return true
  return String(raw) === '1' || String(raw).toLowerCase() === 'true'
}

function isEnforceMode() {
  // Enforce is opt-in. When off, verdicts are recorded as shadow_* and the
  // deploy proceeds regardless. This lets us observe the gate's behaviour
  // in production for 24-48h before turning it load-bearing.
  const raw = process.env.SECURITY_DUAL_REVIEWER_ENFORCE
  return String(raw) === '1' || String(raw).toLowerCase() === 'true'
}

function reviewApprovalToStatus(approved) {
  const enforce = isEnforceMode()
  if (approved) return enforce ? 'approved' : 'shadow_approved'
  return enforce ? 'rejected' : 'shadow_rejected'
}

function isHardRejectStatus(status) {
  return status === 'rejected'
}

function isApprovedStatus(status) {
  // 'approved' is the only status that authorises a self-mod deploy when
  // enforce is on. Shadow verdicts do not gate.
  return status === 'approved'
}

module.exports = {
  SECURITY_SENSITIVE_PREFIXES,
  touchesSensitivePath,
  shouldRunReviewB,
  isDualReviewerEnabled,
  isEnforceMode,
  reviewApprovalToStatus,
  isHardRejectStatus,
  isApprovedStatus,
}

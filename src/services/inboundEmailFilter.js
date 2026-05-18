'use strict'

/**
 * inboundEmailFilter - static-rule auto-archive gate for inbound email.
 *
 * Exports shouldAutoArchive(email) which returns { auto_archive, reason }.
 * When auto_archive=true, the caller is expected to mark the email read
 * + archived without waking the conductor. The deny-list is intentionally
 * narrow: vendor noise that never carries a human signal worth a wake.
 *
 * Caller contract:
 *   - `email.from` (or `email.from_address`) is the RFC822 sender envelope.
 *   - `email.subject` is the raw subject string (optional).
 *   - Returned `reason` is a short string explaining the matching rule;
 *     useful for telemetry.
 *
 * Rule philosophy:
 *   - Match conservatively. Any rule that catches a real signal once is
 *     too broad and gets pulled.
 *   - Apple is special: only auto-archive when the subject is App Store
 *     Connect noise (build processed / TestFlight etc); real customer
 *     mail from @apple.com domains is rare but should not be silenced.
 */

// Each rule is { test(email) -> bool, reason }.
// Order matters only for which `reason` surfaces first; rules are independent.
const RULES = [
  {
    reason: 'vercel_noreply',
    test: (e) => /@vercel\.com$/i.test(e._fromLower),
  },
  {
    reason: 'stripe_noreply',
    test: (e) => /@stripe\.com$/i.test(e._fromLower),
  },
  {
    reason: 'github_noreply',
    test: (e) =>
      /^noreply@github\.com$/i.test(e._fromLower) ||
      /^notifications@github\.com$/i.test(e._fromLower),
  },
  {
    reason: 'generic_noreply',
    test: (e) => /(^|<|\s)no[-_]?reply@/i.test(e._fromLower),
  },
  {
    reason: 'do_not_reply',
    test: (e) => /(^|<|\s)do[-_]?not[-_]?reply@/i.test(e._fromLower),
  },
  {
    reason: 'supabase_noreply',
    test: (e) => /@supabase\.io$/i.test(e._fromLower),
  },
  {
    reason: 'apple_asc_processing',
    test: (e) =>
      /@apple\.com$/i.test(e._fromLower) &&
      /app store connect/i.test(e._subject),
  },
]

function _extractEmailAddress(raw) {
  if (!raw || typeof raw !== 'string') return ''
  // RFC822 senders can be "Name <addr@host>" or bare "addr@host".
  const angle = raw.match(/<([^>]+)>/)
  if (angle && angle[1]) return angle[1].trim().toLowerCase()
  return raw.trim().toLowerCase()
}

function shouldAutoArchive(email) {
  if (!email || typeof email !== 'object') {
    return { auto_archive: false, reason: 'no_email' }
  }
  const rawFrom = email.from || email.from_address || email.sender || ''
  const fromLower = _extractEmailAddress(rawFrom)
  const subject = typeof email.subject === 'string' ? email.subject : ''

  if (!fromLower) {
    return { auto_archive: false, reason: 'no_sender' }
  }

  const ctx = { _fromLower: fromLower, _subject: subject }
  for (const rule of RULES) {
    try {
      if (rule.test(ctx)) {
        return { auto_archive: true, reason: rule.reason }
      }
    } catch {
      // Defensive: a broken rule never sinks the whole filter.
    }
  }
  return { auto_archive: false, reason: 'no_match' }
}

module.exports = {
  shouldAutoArchive,
  // Exported for tests and potential introspection.
  _RULES: RULES,
  _extractEmailAddress,
}

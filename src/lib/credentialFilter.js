'use strict'

/**
 * credentialFilter - pre-emit redactor per §5.1 of SECURITY_HARDENING.md.
 *
 * A credential that lands in the transcript, log, or WS broadcast is
 * effectively leaked even if its original source is secure. The rule:
 * filter at the emit point, never at the sink.
 *
 * This module exports a fast, best-effort redactor for the coarse-tier
 * patterns listed in §5.1:
 *   AKIA[0-9A-Z]{16}
 *   sk-[A-Za-z0-9]{32,} and sk-ant-[...]
 *   ghp_ / ghs_ / gho_ / ghu_ / ghr_ [A-Za-z0-9]{36+}
 *   JWT (eyJhbGciOi...)
 *   xox[baprs]-... (Slack)
 *   -----BEGIN [...] PRIVATE KEY-----
 *   High-entropy 40+ char strings inside token/secret/key contexts
 *
 * Matches are replaced with `[REDACTED:<type>]` and a counter gauge is
 * bumped per type+source. Call sites increment via `countRedaction`.
 *
 * This is intentionally redundant with src/services/secretSafetyService.js
 * scrubSecrets - that service is the heavy-duty (file content, outbound
 * source repo) scrubber with wide pattern coverage and DB blocklist
 * integration. credentialFilter is the lightweight always-on pre-emit
 * filter that must be safe to call on every log line.
 *
 * Performance: the regex set is precompiled and run in sequence. For a
 * typical log line (<1KB) this is sub-millisecond.
 */

const CREDENTIAL_PATTERNS = Object.freeze([
  {
    type: 'aws_access_key',
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    type: 'anthropic_api_key',
    regex: /sk-ant-[A-Za-z0-9\-_]{32,}/g,
  },
  {
    type: 'openai_or_generic_sk_key',
    // Intentionally runs AFTER anthropic_api_key so sk-ant-* is caught first.
    regex: /sk-[A-Za-z0-9]{32,}/g,
  },
  {
    type: 'github_pat',
    regex: /gh[pousr]_[A-Za-z0-9]{36,}/g,
  },
  {
    type: 'jwt',
    regex: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-.+/=]+/g,
  },
  {
    type: 'slack_token',
    regex: /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
  },
  {
    type: 'pem_private_key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: 'google_api_key',
    regex: /AIza[0-9A-Za-z\-_]{35}/g,
  },
  {
    type: 'supabase_service_key',
    regex: /sbp_[a-f0-9]{40}/g,
  },
])

// In-process counters. Flushed externally by a Prometheus exporter or
// an /ops endpoint when either is wired. Keeping the map small and
// resetting monthly is the cleanup path.
const _counters = new Map()

function countRedaction(type, source) {
  const key = `${type}|${source || 'unknown'}`
  _counters.set(key, (_counters.get(key) || 0) + 1)
}

function getCounters() {
  return Object.fromEntries(_counters.entries())
}

function resetCounters() {
  _counters.clear()
}

/**
 * Redact credential-shaped strings in arbitrary text.
 *
 * Returns the redacted string. If input is not a string, coerces via
 * String() first - callers should not rely on the redactor to reject
 * non-string input (that's a log-site bug, not a secret leak).
 *
 * @param {any} input - text to scan
 * @param {string} [source='unknown'] - source tag for the counter
 *   (e.g. 'osConversationLog.logTurn', 'wsManager.broadcast')
 * @returns {string}
 */
function redact(input, source = 'unknown') {
  if (input === null || input === undefined) return ''
  const text = typeof input === 'string' ? input : String(input)
  let out = text
  for (const { type, regex } of CREDENTIAL_PATTERNS) {
    // Clone regex each call so lastIndex state is never shared across
    // concurrent awaits - cheap given the small count.
    const r = new RegExp(regex.source, regex.flags)
    out = out.replace(r, (match) => {
      countRedaction(type, source)
      return `[REDACTED:${type}]`
    })
  }
  return out
}

/**
 * Deep-redact a JSON-serializable value. Walks objects/arrays and
 * redacts string leaves. Non-string leaves pass through unchanged.
 *
 * Use at emit points where the payload is structured (tool results, WS
 * envelopes, DB notification metadata).
 */
function redactDeep(value, source = 'unknown') {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redact(value, source)
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, source))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactDeep(v, source)
    }
    return out
  }
  return value
}

/**
 * Does the input contain a credential pattern? Useful for gating /
 * alerting without mutating the text.
 */
function containsCredential(input) {
  if (input === null || input === undefined) return false
  const text = typeof input === 'string' ? input : String(input)
  for (const { regex } of CREDENTIAL_PATTERNS) {
    const r = new RegExp(regex.source, regex.flags)
    if (r.test(text)) return true
  }
  return false
}

module.exports = {
  redact,
  redactDeep,
  containsCredential,
  countRedaction,
  getCounters,
  resetCounters,
  CREDENTIAL_PATTERNS,
}

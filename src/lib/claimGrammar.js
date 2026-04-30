'use strict'

/**
 * claimGrammar - parser for the §3.1 conductor claim grammar.
 *
 * Conductor output is expected to include claims in the form:
 *   [CLAIM:<action> key1=val1 key2=val2 ...]
 *
 * Examples per OBSERVABILITY_SPEC §3.1:
 *   [CLAIM:deployed sha=abc123 pm2_uptime=4s]
 *   [CLAIM:emailed to=tom@example.com message_id=<abc@mail.gmail.com>]
 *   [CLAIM:committed sha=def456 branch=main]
 *   [CLAIM:scheduled task_id=sch_42 fires_at=2026-05-01T09:00:00Z]
 *
 * Design:
 *   - Values may be bare tokens (no whitespace), or "double-quoted" with
 *     escaped backslashes for embedded whitespace or `=`.
 *   - Angle brackets in values are allowed (message-ids: <abc@host>).
 *   - A claim MUST have an action (first token); keys are optional.
 *   - A claim without any key=value is still valid but has no handle.
 *
 * This module is side-effect-free: no DB writes, no logger. Callers
 * (osSessionService post-turn hook, test harnesses) handle persistence.
 */

// Match the outer [CLAIM: ... ] envelope. Non-greedy body so two claims
// on the same line don't fuse into one.
//
// Uses [^\]]* to forbid ] inside the body - that's the delimiter. If a
// value legitimately contains `]`, it must be double-quoted.
const CLAIM_ENVELOPE_RE = /\[CLAIM:\s*([^\]]+?)\]/g

/**
 * Parse all [CLAIM:...] envelopes from a text blob.
 *
 * @param {string} text
 * @returns {Array<{action: string, handle: object, raw: string}>}
 *   handle is a plain object of key/value pairs (string values).
 */
function parseClaims(text) {
  if (typeof text !== 'string' || !text) return []
  const out = []
  for (const match of text.matchAll(CLAIM_ENVELOPE_RE)) {
    const inner = match[1].trim()
    if (!inner) continue
    const parsed = _parseClaimBody(inner)
    if (!parsed) continue
    out.push({
      action: parsed.action,
      handle: parsed.handle,
      raw: match[0],
    })
  }
  return out
}

function _parseClaimBody(body) {
  // Tokeniser: a token is either a double-quoted string (with \" and \\
  // escapes) or a run of non-whitespace characters. The first token is
  // the action; subsequent tokens are expected to be key=value pairs.
  const tokens = _tokenise(body)
  if (tokens.length === 0) return null
  const action = tokens.shift()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(action)) {
    // action must be an identifier - guards against [CLAIM: sha=abc]
    // style garbage.
    return null
  }
  const handle = {}
  for (const tok of tokens) {
    const eq = tok.indexOf('=')
    if (eq <= 0) continue // skip malformed tokens silently
    const key = tok.slice(0, eq)
    const value = tok.slice(eq + 1)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue
    handle[key] = value
  }
  return { action, handle }
}

function _tokenise(body) {
  // A token continues until unquoted whitespace. Inside a "..." quoted
  // span, whitespace is part of the token. Quotes can appear mid-token
  // as in  key="some value" - the quotes are preserved as markers for
  // the value, then stripped by the caller when splitting key=value.
  //
  // This is a small state machine: two states (outside-quote,
  // inside-quote) with \ escape inside quotes.
  const tokens = []
  let i = 0
  while (i < body.length) {
    // Skip leading unquoted whitespace.
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    let buf = ''
    let inQuote = false
    while (i < body.length) {
      const ch = body[i]
      if (!inQuote && /\s/.test(ch)) break
      if (ch === '"') {
        inQuote = !inQuote
        i++
        continue
      }
      if (inQuote && ch === '\\' && i + 1 < body.length) {
        buf += body[i + 1]
        i += 2
        continue
      }
      buf += ch
      i++
    }
    if (buf) tokens.push(buf)
  }
  return tokens
}

/**
 * Classify whether the claim has a verifiable handle for its action.
 * Per §3.3, each known action has a required set of keys; missing them
 * means the claim is "stated but not proof-bearing" - still valid, but
 * the verifier will mark it action_unknown or pending forever.
 *
 * Returns { has_handle: boolean, missing_keys: string[] }.
 */
const ACTION_REQUIRED_KEYS = Object.freeze({
  deployed: ['sha'],
  committed: ['sha'],
  emailed: ['message_id'],
  scheduled: ['task_id'],
  forked: ['fork_id'],
  decided: ['decision_id'],
  // extend as verifiers grow
})

function classifyHandle({ action, handle }) {
  const required = ACTION_REQUIRED_KEYS[action]
  if (!required) {
    return {
      has_handle: Object.keys(handle || {}).length > 0,
      missing_keys: [],
    }
  }
  const missing = required.filter((k) => !handle || !handle[k])
  return {
    has_handle: missing.length === 0,
    missing_keys: missing,
  }
}

/**
 * Render a claim back into its canonical string form. Round-trip: parse
 * then render should yield a structurally-equivalent claim.
 */
function renderClaim({ action, handle }) {
  const parts = [action]
  for (const [k, v] of Object.entries(handle || {})) {
    if (/\s/.test(v) || v.includes('=') || v.includes(']') || v.includes('"')) {
      const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      parts.push(`${k}="${escaped}"`)
    } else {
      parts.push(`${k}=${v}`)
    }
  }
  return `[CLAIM:${parts.join(' ')}]`
}

module.exports = {
  parseClaims,
  classifyHandle,
  renderClaim,
  ACTION_REQUIRED_KEYS,
  CLAIM_ENVELOPE_RE,
}

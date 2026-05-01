'use strict'

/**
 * commitmentDetector - §3.3 of SECURITY_HARDENING.md.
 *
 * Runs a lightweight classifier over an outbound email draft before it
 * is sent (or before it is auto-approved under a Tier-3 pattern). Flags
 * price/deadline/legal/fault-admission language so the gate can force
 * manual SMS-OTP Tier-3 regardless of auto-authorization.
 *
 * Design:
 *   - Hybrid: fast deterministic rules first (price/date/keyword regexes).
 *     If any trip, return a medium/high risk without calling Claude.
 *   - If deterministic rules are clean, optionally dispatch to Claude for
 *     the full §3.3 prompt.
 *   - The deterministic layer is the safety net: if Claude is down or
 *     slow, every outbound email still gets checked.
 *
 * Output contract (mirrors §3.3 exactly):
 *   {
 *     contains_commitment: boolean,
 *     categories: string[],
 *     risk: 'low' | 'medium' | 'high',
 *     source: 'deterministic' | 'claude',
 *   }
 *
 * No network calls, no DB. Callers wire Claude themselves via `callClaudeJSON`
 * so this module stays testable in isolation.
 */

const CATEGORIES = Object.freeze({
  PRICE: 'price_or_dollar_figure',
  DEADLINE: 'deadline_or_date_commitment',
  LEGAL: 'legal_or_contractual_language',
  FAULT: 'apology_or_fault_admission',
})

// Deterministic rule regexes. Each is intentionally narrow to minimise
// false positives; Claude's broader reading is the escalation path.
const RULES = Object.freeze([
  {
    category: CATEGORIES.PRICE,
    // Dollar or AUD/USD/GBP/EUR/NZD figures with at least one digit.
    regex: /(\$|AU\$|USD|AUD|GBP|EUR|NZD|€|£)\s?[0-9][0-9,.]*/i,
  },
  {
    category: CATEGORIES.PRICE,
    // "X per hour/day/week/month/year" amounts.
    regex: /\b[0-9][0-9,.]*\s?(per|\/)\s?(hour|day|week|month|year|hr|d|wk|mo|yr)\b/i,
  },
  {
    category: CATEGORIES.DEADLINE,
    // Due/by/before/deadline with a date-ish or weekday near it.
    regex: /\b(by|before|due|deadline|no later than|eod|eob|cob)\b.{0,40}(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[/\-]\d{1,2}|\d{4}-\d{2}-\d{2}|tomorrow|next week|end of )/i,
  },
  {
    category: CATEGORIES.DEADLINE,
    // Explicit "within N days/hours" or "in N business days".
    regex: /\b(within|in)\s+\d+\s+(business\s+)?(day|hour|week|month)s?\b/i,
  },
  {
    category: CATEGORIES.LEGAL,
    regex: /\b(agree|agreement|accept|acceptance|warrant|warranty|guarantee|guaranteed|indemnif(?:y|ies|ied)|liabilit(?:y|ies)|binding|contract|terms and conditions|non[- ]disclosure|nda|sla|mou)\b/i,
  },
  {
    category: CATEGORIES.FAULT,
    // \b does not match before ' or "re" so patterns like "we're sorry"
    // need explicit alternations. The overall regex is matched case-
    // insensitively.
    regex: /(i am sorry|i'm sorry|we are sorry|we're sorry|sincere apolog(?:y|ies)|my fault|our fault|we made an? (mistake|error)|we failed|we were wrong|we (take|accept) responsibilit(?:y|ies))/i,
  },
])

function _runDeterministic(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { hit: false, categories: [] }
  }
  const hits = new Set()
  for (const rule of RULES) {
    if (rule.regex.test(text)) {
      hits.add(rule.category)
    }
  }
  return { hit: hits.size > 0, categories: [...hits] }
}

function _deterministicRisk(categories) {
  if (categories.length === 0) return 'low'
  // Price OR legal OR fault-admission alone is already high risk.
  if (
    categories.includes(CATEGORIES.PRICE) ||
    categories.includes(CATEGORIES.LEGAL) ||
    categories.includes(CATEGORIES.FAULT)
  ) {
    return 'high'
  }
  // Deadline-only is medium.
  if (categories.includes(CATEGORIES.DEADLINE)) {
    return 'medium'
  }
  return 'low'
}

/**
 * Fast synchronous check. Returns the §3.3 shape using ONLY
 * deterministic rules. No Claude call, no DB, no network.
 */
function analyzeDeterministic(text) {
  const { categories } = _runDeterministic(text)
  return {
    contains_commitment: categories.length > 0,
    categories,
    risk: _deterministicRisk(categories),
    source: 'deterministic',
  }
}

/**
 * Full analyze: runs deterministic first, escalates to Claude only if
 * deterministic found nothing. If the Claude call fails, falls back to
 * the deterministic result (fail-safe: a Claude outage never downgrades
 * risk below what deterministic already caught).
 *
 * @param {string} text
 * @param {object} opts
 * @param {Function} [opts.callClaudeJSON] - async function matching the
 *   signature from src/services/claudeService. Pass in at call site so
 *   this module stays decoupled / testable.
 * @returns {Promise<{contains_commitment, categories, risk, source}>}
 */
async function analyze(text, opts = {}) {
  const det = analyzeDeterministic(text)
  if (det.contains_commitment) return det
  if (typeof opts.callClaudeJSON !== 'function') return det

  const systemPrompt = [
    'You classify outbound emails for a commitment-detector security gate.',
    'You never write emails. You never suggest changes. You only classify.',
    'Given a draft, return strict JSON with this shape:',
    '  { "contains_commitment": boolean, "categories": string[], "risk": "low"|"medium"|"high" }',
    'Categories must be a subset of:',
    `  ${Object.values(CATEGORIES).join(', ')}`,
    'Rules for the risk field:',
    '  - "low" only if there is no commitment and no risky language.',
    '  - "medium" for soft/implicit commitments (tentative dates, "we aim to").',
    '  - "high" for dollar figures, legal/contractual words, or fault admissions.',
  ].join('\n')

  try {
    const result = await opts.callClaudeJSON(
      [{ role: 'user', content: `Classify the following draft:\n\n"""\n${text}\n"""` }],
      { module: 'commitment-detector', system: systemPrompt },
    )
    if (!result || typeof result !== 'object' || Array.isArray(result)) return det
    const risk = ['low', 'medium', 'high'].includes(result.risk) ? result.risk : 'low'
    const categories = Array.isArray(result.categories)
      ? result.categories.filter((c) => typeof c === 'string')
      : []
    const contains = typeof result.contains_commitment === 'boolean'
      ? result.contains_commitment
      : categories.length > 0 || risk !== 'low'
    return {
      contains_commitment: contains,
      categories,
      risk,
      source: 'claude',
    }
  } catch {
    return det
  }
}

/**
 * Policy helper: given an analyze() result, return whether the outbound
 * send should be auto-approved (low risk, no commitment) or whether it
 * MUST be manual Tier-3 SMS-OTP regardless of pre-authorization.
 */
function requiresManualTier3(result) {
  if (!result) return true
  if (result.risk !== 'low') return true
  if (result.contains_commitment) return true
  return false
}

module.exports = {
  CATEGORIES,
  RULES,
  analyze,
  analyzeDeterministic,
  requiresManualTier3,
}

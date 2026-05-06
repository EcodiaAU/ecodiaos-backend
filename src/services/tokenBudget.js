'use strict'

/**
 * TokenBudget - allocates tokens across context blocks by priority tier.
 *
 * docs/PROMPT_ASSEMBLY_SPEC.md §3.4. Fixes the "8 independent injectors
 * each decide their own truncation" problem by making budget decisions
 * globally instead of locally. PR 3 ships the allocator; PR 6 wires it
 * into the live path once shadow parity is proven.
 *
 * Priority tiers (from PROMPT_ASSEMBLY_SPEC §3.4):
 *   critical (never truncated, never dropped):
 * - <now>
 * - <restart_recovery>
 * - <untrusted_input>  (when a turn has external text)
 * - the current user message
 *   high (>=70% of remainder, can shrink to elasticity floor):
 * - doctrine (keyword-surfaced patterns / Skills)
 * - state (forks_rollup, goals_rollup) - cap 1K tokens for forks
 *   medium (>=20% of remainder):
 * - relevant_memory - cap 4K tokens
 *   low (whatever's left):
 * - history / recent_exchanges - FIFO drop oldest first
 *
 * Tokens are approximated as floor(bytes / CHARS_PER_TOKEN). Good enough
 * for budget enforcement; the actual tokenizer is inside the Claude API.
 * When we're close to the budget edge we're conservative (over-estimate
 * token count) so real-API truncation won't surprise us.
 *
 * Not yet wired into the live path - assembler's existing per-block timeouts
 * + shrinkers keep working. This module is testable in isolation and will
 * be wired in PR 6 when PROMPT_ASSEMBLY_V2 flips to canary/full.
 */

// ~4 chars per token is the rule-of-thumb for English text with Claude's
// tokenizer. It's loose - code and XML can be denser (~3), natural prose
// looser (~5). Using 4 gives us a slight over-estimate for most prompts
// which is the right direction for budget safety.
const CHARS_PER_TOKEN = 4

const PRIORITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

// Per-block hard caps in tokens. null/undefined = no cap (honour only the
// global budget after critical/high allocations).
const DEFAULT_BLOCK_CAPS = {
  relevant_memory: 4000,
  forks_rollup: 1000,
  recent_doctrine: 6000,
  doctrine_surface: 7000,
  // recent_exchanges has no per-block cap - it's the "whatever's left"
  // fallback and shrinks via FIFO truncation instead.
  recent_exchanges: null,
}

/**
 * Estimate tokens from a string. Deliberate over-estimate.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * FIFO-truncate a multi-exchange transcript to fit a token budget.
 * Assumes the text is split by the exchange delimiter '\n\n---\n\n'
 * (what session_memory serializes recent_exchanges as).
 * Drops oldest exchanges first; keeps newest full-resolution.
 *
 * @param {string} text - the full recent_exchanges block
 * @param {number} tokenBudget
 * @returns {string} truncated text
 */
function truncateFifo(text, tokenBudget) {
  if (!text) return ''
  if (estimateTokens(text) <= tokenBudget) return text

  // Split on the exchange separator. Preserve the structure: the original
  // text may have an opening '<recent_exchanges>' tag that we must keep
  // at the front and a closing tag at the back.
  const openTag = text.match(/^<[a-z_]+>/)
  const closeTag = text.match(/<\/[a-z_]+>$/)
  let body = text
  if (openTag) body = body.slice(openTag[0].length)
  if (closeTag) body = body.slice(0, -closeTag[0].length)

  const exchanges = body.split(/\n\n---\n\n/)
  // Keep newest (end of array); drop oldest (start of array) until we fit.
  while (exchanges.length > 0) {
    const joined = exchanges.join('\n\n---\n\n')
    const wrapped = (openTag ? openTag[0] : '') + joined + (closeTag ? closeTag[0] : '')
    if (estimateTokens(wrapped) <= tokenBudget) return wrapped
    exchanges.shift()
  }
  // Even a single exchange doesn't fit - return an empty wrapped block.
  return (openTag ? openTag[0] : '') + (closeTag ? closeTag[0] : '')
}

/**
 * Allocate tokens across candidate blocks by priority tier.
 *
 * Algorithm:
 *   1. Sort candidates by priority (critical first).
 *   2. Reserve space for all critical blocks at full size (cannot truncate).
 *      If critical already exceeds budget, emit them anyway and note
 *      overflow - the model will hit its own limit later, but we must
 *      not drop a restart_recovery or untrusted_input.
 *   3. Allocate remaining budget to high tier up to per-block caps.
 *   4. Allocate leftover to medium tier up to per-block caps.
 *   5. Allocate leftover to low tier; truncate via shrink() if the candidate
 *      provides one, else via truncateFifo if the candidate name matches
 *      a FIFO pattern, else drop.
 *
 * @param {Array<Object>} candidates - [{ name, priority, text, shrink?(target) }]
 * @param {Object} options
 * @param {number} [options.budget=60000] - token budget for the dynamic portion
 * @param {Object} [options.caps=DEFAULT_BLOCK_CAPS] - override per-block caps
 * @returns {Object} { allocated: Array<{name, text, tokens}>, dropped: Array<string>, totalTokens, overflow }
 */
function allocate(candidates, options = {}) {
  const budget = typeof options.budget === 'number' ? options.budget : 60000
  const caps = options.caps || DEFAULT_BLOCK_CAPS

  if (!Array.isArray(candidates)) throw new TypeError('allocate: candidates must be an array')

  // Normalise + sort by priority then by input order.
  const sorted = candidates
    .map((c, idx) => ({ ...c, _idx: idx }))
    .filter(c => c.text)
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? PRIORITY_RANK.low
      const pb = PRIORITY_RANK[b.priority] ?? PRIORITY_RANK.low
      if (pa !== pb) return pa - pb
      return a._idx - b._idx
    })

  const allocated = []
  const dropped = []
  let spent = 0
  let overflow = false

  for (const cand of sorted) {
    const candTokens = estimateTokens(cand.text)
    const blockCap = caps[cand.name]
    const remaining = Math.max(0, budget - spent)

    if (cand.priority === PRIORITY.CRITICAL) {
      // Critical blocks are emitted at full size. If that pushes us over
      // budget, we emit anyway and mark overflow - the model's own context
      // limit will kick in and that's the right place for the hard stop.
      allocated.push({ name: cand.name, text: cand.text, tokens: candTokens })
      spent += candTokens
      if (spent > budget) overflow = true
      continue
    }

    // Per-block cap: clip the desired size down to cap before budget check.
    let desired = candTokens
    if (typeof blockCap === 'number' && blockCap > 0) {
      desired = Math.min(desired, blockCap)
    }

    if (remaining <= 0) {
      dropped.push(cand.name)
      continue
    }

    // Fits fully within both the per-block cap and the remaining global budget.
    if (desired <= remaining && desired === candTokens) {
      allocated.push({ name: cand.name, text: cand.text, tokens: candTokens })
      spent += candTokens
      continue
    }

    // Need to truncate. Target = min(desired, remaining).
    const target = Math.min(desired, remaining)
    let truncated
    if (typeof cand.shrink === 'function') {
      truncated = cand.shrink(target)
    } else if (cand.name === 'recent_exchanges') {
      truncated = truncateFifo(cand.text, target)
    } else {
      // Fallback: hard byte-slice. Preserves leading tag if present.
      const charBudget = target * CHARS_PER_TOKEN
      truncated = cand.text.slice(0, charBudget)
    }
    const tTokens = estimateTokens(truncated)
    if (tTokens === 0 || !truncated) {
      dropped.push(cand.name)
      continue
    }
    allocated.push({ name: cand.name, text: truncated, tokens: tTokens })
    spent += tTokens
  }

  return {
    allocated,
    dropped,
    totalTokens: spent,
    overflow,
  }
}

module.exports = {
  PRIORITY,
  CHARS_PER_TOKEN,
  DEFAULT_BLOCK_CAPS,
  estimateTokens,
  truncateFifo,
  allocate,
}

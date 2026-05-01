'use strict'

/**
 * Anthropic Claude API pricing constants per million tokens (USD).
 *
 * Source: https://www.anthropic.com/pricing (Claude API row).
 * Updated 2026-05-01 (fork_mom9j8g9_5ab468 audit Tier A remediation).
 *
 * Used by usageEnergyService.logUsage to populate claude_usage.cost_usd
 * per turn so the /ops dashboard can surface cost_per_turn_usd. Cost is
 * an estimate (Claude Max subscription is the primary spend, not metered
 * API), but the per-turn USD figure is the right unit of comparison for
 * tuning prompt assembly + compaction thresholds.
 *
 * Cache pricing: cache_creation costs ~25% MORE than base input (one-time
 * write). cache_read costs ~10% of base input (every hit). The whole
 * point of prompt-caching is the read discount.
 *
 * If a model name is not in the table we return null cost (graceful
 * degradation - the row still gets logged with cost_usd=NULL).
 */

const PRICING = {
  // Claude Opus 4.7 (current default for OS sessions).
  'claude-opus-4-7-20251024': {
    input_per_mtok: 15.00,
    output_per_mtok: 75.00,
    cache_write_per_mtok: 18.75,   // 1.25x input
    cache_read_per_mtok: 1.50,     // 0.10x input
  },
  // Claude Sonnet 4.5 (used by some sub-agent paths).
  'claude-sonnet-4-5-20250929': {
    input_per_mtok: 3.00,
    output_per_mtok: 15.00,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.30,
  },
  // Claude Sonnet 4.6 (newer Sonnet revision).
  'claude-sonnet-4-6-20251015': {
    input_per_mtok: 3.00,
    output_per_mtok: 15.00,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.30,
  },
  // Claude Haiku 4.5 (cheap-and-fast tier).
  'claude-haiku-4-5-20250915': {
    input_per_mtok: 0.80,
    output_per_mtok: 4.00,
    cache_write_per_mtok: 1.00,
    cache_read_per_mtok: 0.08,
  },
}

/**
 * Aliases / family fallbacks. If exact model id not in PRICING, walk these
 * substrings in order. Lets us survive minor model id revisions (e.g.
 * 'claude-opus-4-7-20251201' picks up 'claude-opus-4-7' fallback).
 */
const FAMILY_FALLBACKS = [
  ['claude-opus-4-7',   PRICING['claude-opus-4-7-20251024']],
  ['claude-opus',       PRICING['claude-opus-4-7-20251024']],
  ['claude-sonnet-4-6', PRICING['claude-sonnet-4-6-20251015']],
  ['claude-sonnet-4-5', PRICING['claude-sonnet-4-5-20250929']],
  ['claude-sonnet',     PRICING['claude-sonnet-4-5-20250929']],
  ['claude-haiku',      PRICING['claude-haiku-4-5-20250915']],
]

function resolveRates(model) {
  if (!model) return null
  if (PRICING[model]) return PRICING[model]
  for (const [substr, rates] of FAMILY_FALLBACKS) {
    if (model.includes(substr)) return rates
  }
  return null
}

/**
 * Compute estimated USD cost for one turn given the Anthropic usage object.
 *
 * usage = {
 *   input_tokens,
 *   output_tokens,
 *   cache_creation_input_tokens?,
 *   cache_read_input_tokens?,
 * }
 *
 * Returns a number (USD, six-decimal precision) or null if the model is
 * unrecognised. Caller should persist null cost rather than fabricating one.
 */
function estimateCostUsd({ model, inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0 } = {}) {
  const rates = resolveRates(model)
  if (!rates) return null
  // Standard input tokens are reduced by cache_read + cache_creation (the
  // SDK reports them as separate fields but they are mutually exclusive
  // slices of the same prompt). Compute the residual non-cached input.
  const cachedSum = (cacheReadTokens || 0) + (cacheCreationTokens || 0)
  const residualInput = Math.max(0, (inputTokens || 0) - cachedSum)
  const cost =
      (residualInput        / 1_000_000) * rates.input_per_mtok
    + (outputTokens         / 1_000_000) * rates.output_per_mtok
    + (cacheCreationTokens  / 1_000_000) * rates.cache_write_per_mtok
    + (cacheReadTokens      / 1_000_000) * rates.cache_read_per_mtok
  // 6-decimal precision matches claude_usage.cost_usd NUMERIC(12,6) shape.
  return Math.round(cost * 1_000_000) / 1_000_000
}

module.exports = {
  PRICING,
  resolveRates,
  estimateCostUsd,
}

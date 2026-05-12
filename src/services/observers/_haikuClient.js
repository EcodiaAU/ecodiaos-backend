'use strict'

/**
 * _haikuClient - thin Anthropic API wrapper for cheap Haiku calls.
 *
 * Uses the same OAuth bearer + anthropic-beta header pattern as
 * anthropicMessagesClient.js. Provider chain: TATE → CODE → MONEY.
 *
 * Always returns a parsed JSON object, or { intervene: false, reason: 'haiku_error' }
 * on any error — never throws.
 *
 * Sets cache_control: { type: 'ephemeral' } on the systemPrompt block so
 * repeated fires with the same prompt hit the Anthropic prompt cache.
 *
 * Cost telemetry: increments kv_store key observers.cost_<name>_24h after
 * each successful call (fire-and-forget, data loss on race is acceptable).
 *
 * Origin: fork_mp27tdp1_eaa05e, 12 May 2026. Part of Haiku Observer Trio.
 */

const logger = require('../../config/logger')

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 400
const REQUEST_TIMEOUT_MS = 15_000

// Energy-aware token resolution. The naive
//   TATE || CODE || MONEY
// chain always returned TATE if configured, which 429'd every observer
// call whenever TATE was capped. usageEnergyService.getBestProvider()
// already scores all three accounts on real headers — use it.
// Fallback to the static chain when energy state is unknown (e.g. boot
// before first SDK turn populated headers).
function _resolveBearer() {
  try {
    const usageEnergy = require('../usageEnergyService')
    const best = usageEnergy.getBestProvider && usageEnergy.getBestProvider()
    if (best && best.provider && !best.isDeepseekFallback) {
      if (best.provider === 'claude_max' && process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE) {
        return process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
      }
      if (best.provider === 'claude_max_2' && process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE) {
        return process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      }
      if (best.provider === 'claude_max_3' && process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY) {
        return process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
      }
    }
  } catch { /* fall through to static chain */ }
  return process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
    || process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
    || process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
    || null
}

// Mark account capped on 429 so subsequent observer calls route to a
// healthy lane immediately (without waiting for the cache TTL).
function _markCappedFromBearer(bearer) {
  try {
    const usageEnergy = require('../usageEnergyService')
    if (!bearer || !usageEnergy.markAccountRejected) return
    if (bearer === process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE) {
      usageEnergy.markAccountRejected('claude_max', 'observer_429')
    } else if (bearer === process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE) {
      usageEnergy.markAccountRejected('claude_max_2', 'observer_429')
    } else if (bearer === process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY) {
      usageEnergy.markAccountRejected('claude_max_3', 'observer_429')
    }
  } catch { /* non-fatal */ }
}

async function _incrementCostTelemetry(observerName, usage) {
  if (!usage) return
  try {
    const db = require('../../config/db')
    const key = `observers.cost_${observerName}_24h`
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    const current = rows[0]
      ? JSON.parse(rows[0].value)
      : { calls: 0, input_tokens: 0, output_tokens: 0, since: new Date().toISOString() }
    current.calls += 1
    current.input_tokens += usage.input_tokens || 0
    current.output_tokens += usage.output_tokens || 0
    current.last_at = new Date().toISOString()
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(current)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch { /* fire-and-forget: data loss is acceptable */ }
}

/**
 * Call Haiku with a system prompt and user message.
 *
 * @param {string} systemPrompt  - Cached system prompt (cache_control: ephemeral)
 * @param {string} userMessage   - Variable per-call user content
 * @param {string} observerName  - For logging and telemetry
 * @returns {Promise<object>} Parsed JSON object, or { intervene: false, reason: 'haiku_error' }
 */
async function call({ systemPrompt, userMessage, observerName }) {
  const bearer = _resolveBearer()
  if (!bearer) {
    logger.warn(`haikuClient (${observerName}): no OAuth bearer token available`)
    return { intervene: false, reason: 'haiku_error' }
  }

  const payload = {
    model: HAIKU_MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: userMessage },
    ],
  }

  const ctl = new AbortController()
  const timeoutId = setTimeout(
    () => ctl.abort(new Error('haiku request timeout')),
    REQUEST_TIMEOUT_MS,
  )

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20,prompt-caching-2024-07-31',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      logger.warn(`haikuClient (${observerName}): API ${res.status}`, {
        body: errText.slice(0, 200),
      })
      // On 429, mark the bearer's account capped so the next call routes elsewhere.
      if (res.status === 429) {
        _markCappedFromBearer(bearer)
      }
      return { intervene: false, reason: `haiku_error_${res.status}` }
    }

    const json = await res.json()
    const text = json?.content?.[0]?.text || ''

    // Extract first JSON object from the model response
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      logger.warn(`haikuClient (${observerName}): no JSON object in response`, {
        preview: text.slice(0, 100),
      })
      return { intervene: false, reason: 'haiku_error' }
    }

    try {
      const parsed = JSON.parse(match[0])
      // Fire-and-forget cost telemetry — never let this block the result
      _incrementCostTelemetry(observerName, json?.usage).catch(() => {})
      return parsed
    } catch {
      logger.warn(`haikuClient (${observerName}): JSON.parse failed`, {
        preview: text.slice(0, 100),
      })
      return { intervene: false, reason: 'haiku_error' }
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timeout')
    if (isTimeout) {
      logger.warn(`haikuClient (${observerName}): request timed out after ${REQUEST_TIMEOUT_MS}ms`)
    } else {
      logger.warn(`haikuClient (${observerName}): fetch error`, { error: err?.message })
    }
    return { intervene: false, reason: 'haiku_error' }
  }
}

module.exports = { call }

'use strict'

/**
 * Anthropic Messages Client - canonical OS provider chain for raw /v1/messages.
 *
 * One-shot multimodal /v1/messages POSTs (vision-enrich, future single-shot
 * vision/text helpers) route through this module. The Claude Agent SDK
 * (osSessionService, forkService) covers the agent-loop case; this is the
 * non-loop case.
 *
 * Provider chain mirrors usageEnergyService.getBestProvider() per
 * ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md:
 *   1. claude_max  (CLAUDE_CODE_OAUTH_TOKEN_TATE long-lived bearer)
 *   2. claude_max_2 (CLAUDE_CODE_OAUTH_TOKEN_CODE long-lived bearer)
 *   3. deepseek    (https://api.deepseek.com/anthropic, DEEPSEEK_API_KEY)
 *
 * Bearer auth uses the OAuth-beta header. Verified empirically 2026-05-06:
 * long-lived `claude setup-token` tokens DO succeed against /v1/messages
 * when sent with `anthropic-beta: oauth-2025-04-20`. The comment in
 * usageEnergyService claiming long-lived tokens 401 was true before the
 * beta header was added.
 *
 * Vision support:
 *   - claude_max + claude_max_2: full multimodal (image content blocks).
 *   - deepseek: text-only. If `allowVision: true` and the chain falls to
 *     deepseek, the call returns { vision_unsupported: true } so the caller
 *     can mark `vision_skipped_reason=deepseek_no_vision_support` instead
 *     of issuing a request that returns "[Unsupported Image]".
 *
 * Public API:
 *   await createMessage({ messages, system?, model?, max_tokens?, allowVision?,
 *                         signal?, maxAttemptsPerProvider? })
 *     -> { json, providerUsed, vision_unsupported? }
 *
 * Origin: fork_motuvu0q_de7349, 6 May 2026, codifies the OS provider chain
 * for one-shot calls so vision-enrich.js can stop carrying its own raw API
 * key surface.
 */

const fs = require('fs')
const path = require('path')
const logger = require('../config/logger')
const usageEnergy = require('./usageEnergyService')

// Default model. Verified live against /v1/models 2026-05-06: sonnet-4-7
// does not exist on the OAuth chain; sonnet-4-6 is current. Callers may
// override via the `model` arg.
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000
const DEFAULT_MAX_ATTEMPTS_PER_PROVIDER = 3

const ANTHROPIC_HOST = 'https://api.anthropic.com'
const DEEPSEEK_PROXY_HOST = 'https://api.deepseek.com/anthropic'
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat'

// Provider order considered when an explicit best-provider is unavailable
// or has been exhausted. claude_max (tate), claude_max_2 (code), claude_max_3 (money), then deepseek.
const FALLBACK_ORDER = ['claude_max', 'claude_max_2', 'claude_max_3', 'deepseek']

function _readFileTokenForAccount(account) {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const dir = account === 'claude_max_2'
    ? process.env.CLAUDE_CONFIG_DIR_2
    : (process.env.CLAUDE_CONFIG_DIR_1 || path.join(home, '.claude'))
  if (!dir) return null
  for (const fn of ['.credentials.json', 'credentials.json']) {
    const p = path.join(dir, fn)
    if (!fs.existsSync(p)) continue
    try {
      const cred = JSON.parse(fs.readFileSync(p, 'utf8'))
      const token = cred?.claudeAiOauth?.accessToken
        || cred?.oauthAccount?.accessToken
        || cred?.accessToken
      if (token) return token
    } catch { /* ignore parse errors, try next */ }
  }
  return null
}

function _resolveBearer(account) {
  if (account === 'claude_max') {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
      || _readFileTokenForAccount('claude_max')
      || null
  }
  if (account === 'claude_max_2') {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      || _readFileTokenForAccount('claude_max_2')
      || null
  }
  if (account === 'claude_max_3') {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY || null
  }
  return null
}

function _isAvailable(account) {
  if (account === 'claude_max') {
    return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
      || process.env.CLAUDE_CONFIG_DIR_1
      || _readFileTokenForAccount('claude_max'))
  }
  if (account === 'claude_max_2') {
    return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      || process.env.CLAUDE_CONFIG_DIR_2
      || _readFileTokenForAccount('claude_max_2'))
  }
  if (account === 'claude_max_3') {
    return !!process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
  }
  if (account === 'deepseek') {
    return process.env.DEEPSEEK_FALLBACK_ENABLED === 'true'
      && !!process.env.DEEPSEEK_API_KEY
  }
  return false
}

function _hasVisionContent(messages) {
  if (!Array.isArray(messages)) return false
  for (const m of messages) {
    if (!m || !Array.isArray(m.content)) continue
    for (const block of m.content) {
      if (block && block.type === 'image') return true
    }
  }
  return false
}

function _buildProviderChain({ allowVision, requireVision }) {
  // Start from getBestProvider's recommendation, then de-dup the rest of
  // FALLBACK_ORDER behind it. If vision is required and the only remaining
  // option is deepseek, signal `vision_unsupported` to the caller.
  let preferred = 'claude_max'
  try {
    const best = usageEnergy.getBestProvider()
    if (best && best.provider) preferred = best.provider
  } catch (err) {
    logger.debug('anthropicMessagesClient: getBestProvider failed, using default chain', { error: err.message })
  }

  const chain = []
  const seen = new Set()
  const consider = (p) => {
    if (seen.has(p)) return
    if (!_isAvailable(p)) return
    if (p === 'deepseek' && requireVision) return
    chain.push(p)
    seen.add(p)
  }
  consider(preferred)
  for (const p of FALLBACK_ORDER) consider(p)
  return chain
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/**
 * One POST attempt against one provider. Returns { ok, status, json, headers,
 * retryable, errorMessage } - never throws on HTTP failure (only on caller
 * abort or fundamental fetch error).
 */
async function _postOnce({ provider, payload, signal, requestTimeoutMs }) {
  const url = provider === 'deepseek'
    ? `${DEEPSEEK_PROXY_HOST}/v1/messages`
    : `${ANTHROPIC_HOST}/v1/messages`

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  if (provider === 'deepseek') {
    headers['Authorization'] = `Bearer ${process.env.DEEPSEEK_API_KEY}`
  } else {
    const bearer = _resolveBearer(provider)
    if (!bearer) {
      return {
        ok: false,
        status: 0,
        retryable: false,
        errorMessage: `no bearer token resolved for provider ${provider}`,
      }
    }
    headers['Authorization'] = `Bearer ${bearer}`
    headers['anthropic-beta'] = 'oauth-2025-04-20'
  }

  // Per-attempt timeout. Caller signal still wins if aborted earlier.
  const innerCtl = new AbortController()
  const timeoutId = setTimeout(() => innerCtl.abort(new Error('request timeout')), requestTimeoutMs)
  const onCallerAbort = () => innerCtl.abort(new Error('caller aborted'))
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      const err = new Error('caller aborted before send')
      err.aborted = true
      throw err
    }
    signal.addEventListener('abort', onCallerAbort, { once: true })
  }

  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: innerCtl.signal,
    })
  } catch (err) {
    if (signal?.aborted) {
      const e = new Error('caller aborted')
      e.aborted = true
      throw e
    }
    return {
      ok: false,
      status: 0,
      retryable: true,
      errorMessage: `fetch failed: ${err.message}`,
    }
  } finally {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener('abort', onCallerAbort)
  }

  // Update OS energy state from real response headers (for claude accounts).
  if (provider === 'claude_max' || provider === 'claude_max_2' || provider === 'claude_max_3') {
    try { usageEnergy.updateFromHeaders(resp.headers, provider) } catch { /* non-fatal */ }
  }

  const status = resp.status
  let bodyText
  try { bodyText = await resp.text() } catch { bodyText = '' }

  if (status >= 200 && status < 300) {
    let json
    try { json = JSON.parse(bodyText) }
    catch (err) {
      return {
        ok: false,
        status,
        retryable: false,
        errorMessage: `json parse failed: ${err.message}`,
      }
    }
    return { ok: true, status, json, headers: resp.headers }
  }

  const retryable = status === 429 || status >= 500
  return {
    ok: false,
    status,
    retryable,
    errorMessage: `${provider} api ${status}: ${bodyText.slice(0, 500)}`,
  }
}

/**
 * Public: send one /v1/messages call through the canonical OS provider chain.
 *
 * Args:
 *   messages          (required) Anthropic-shape messages array.
 *   system            (optional) system prompt string.
 *   model             (optional) model id; default DEFAULT_MODEL. DeepSeek
 *                                attempts substitute deepseek-chat.
 *   max_tokens        (optional) default 1024.
 *   allowVision       (optional) caller is OK with vision-capable providers
 *                                only. Defaults to auto-detect from messages.
 *                                If true and only deepseek remains, returns
 *                                { vision_unsupported: true } without firing.
 *   signal            (optional) AbortSignal passed through.
 *   maxAttemptsPerProvider (optional) default 3. Backoff is exponential
 *                                500ms, 1000ms, 2000ms.
 *   requestTimeoutMs  (optional) default 60000.
 *
 * Returns: { json, providerUsed } on success.
 *          { vision_unsupported: true, providersConsidered } if vision was
 *          required and only deepseek remained.
 *
 * Throws: Error with .lastStatus / .providersTried / .errorsByProvider if
 *         every provider exhausted retries.
 */
async function createMessage({
  messages,
  system = null,
  model = null,
  max_tokens = DEFAULT_MAX_TOKENS,
  allowVision = null,
  signal = null,
  maxAttemptsPerProvider = DEFAULT_MAX_ATTEMPTS_PER_PROVIDER,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('createMessage: messages array required')
  }

  // Vision detection - if caller didn't say, sniff the messages.
  const hasVision = _hasVisionContent(messages)
  const requireVision = allowVision === true ? true : hasVision

  const chain = _buildProviderChain({ allowVision, requireVision })

  if (chain.length === 0 && requireVision) {
    return {
      vision_unsupported: true,
      providersConsidered: ['deepseek'],
      reason: 'only deepseek remains and deepseek does not support image content blocks',
    }
  }

  if (chain.length === 0) {
    const err = new Error('createMessage: no providers available')
    err.providersTried = []
    throw err
  }

  const errorsByProvider = {}
  let lastStatus = 0

  for (const provider of chain) {
    const useModel = provider === 'deepseek'
      ? (model && model.startsWith('deepseek') ? model : DEEPSEEK_DEFAULT_MODEL)
      : (model || DEFAULT_MODEL)

    const payload = {
      model: useModel,
      max_tokens,
      messages,
    }
    if (system) payload.system = system

    let perProviderError = null
    for (let attempt = 1; attempt <= maxAttemptsPerProvider; attempt += 1) {
      const result = await _postOnce({ provider, payload, signal, requestTimeoutMs })

      if (result.ok) {
        if (attempt > 1 || provider !== chain[0]) {
          logger.info('anthropicMessagesClient: succeeded after fallback', {
            providerUsed: provider, attempt, providersConsidered: chain,
          })
        }
        return { json: result.json, providerUsed: provider }
      }

      perProviderError = result.errorMessage
      lastStatus = result.status

      // 401 / 403: dead bearer for this provider, no retries help, jump to next provider.
      if (result.status === 401 || result.status === 403) {
        logger.warn('anthropicMessagesClient: provider auth rejected, advancing chain', {
          provider, status: result.status,
        })
        break
      }

      // Non-retryable: jump to next provider.
      if (!result.retryable) break

      // Retryable: backoff + retry on same provider unless we're out of attempts.
      if (attempt < maxAttemptsPerProvider) {
        const backoffMs = 500 * Math.pow(2, attempt - 1)
        await _sleep(backoffMs)
      }
    }

    errorsByProvider[provider] = perProviderError || 'unknown'
    logger.info('anthropicMessagesClient: exhausted attempts for provider, advancing', {
      provider, error: perProviderError, lastStatus,
    })
  }

  // If vision was required and only deepseek would have remained (which we
  // skipped pre-flight because it can't do images), surface that gracefully
  // so the caller marks events as deepseek_no_vision_support rather than
  // generic vision_error - the recipe is still useful without per-event
  // vision and the conductor needs to know the chain shape that ran out.
  if (requireVision && _isAvailable('deepseek') && !chain.includes('deepseek')) {
    logger.info('anthropicMessagesClient: claude chain exhausted with vision required, deepseek would remain (no vision support)', {
      providersTried: chain, errorsByProvider, lastStatus,
    })
    return {
      vision_unsupported: true,
      providersConsidered: [...chain, 'deepseek'],
      reason: `claude chain exhausted (last status ${lastStatus}); deepseek does not support image content blocks`,
      errorsByProvider,
    }
  }

  const err = new Error(`createMessage: all providers exhausted (last status ${lastStatus})`)
  err.lastStatus = lastStatus
  err.providersTried = chain
  err.errorsByProvider = errorsByProvider
  throw err
}

module.exports = {
  createMessage,
  // exposed for tests / introspection
  DEFAULT_MODEL,
  _internal: {
    _resolveBearer,
    _isAvailable,
    _buildProviderChain,
    _hasVisionContent,
    _postOnce,
  },
}

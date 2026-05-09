'use strict'

// ─── DeepSeek Anthropic-compat proxy ────────────────────────────────────────
//
// Sits between the CC Agent SDK and https://api.deepseek.com/anthropic.
// Strips `thinking` content blocks from DeepSeek V4 Pro responses so the SDK
// never sees them - avoids 400 "Invalid signature in thinking block" errors
// that occur when the SDK echoes thinking blocks back in subsequent turns.
//
// Usage: ANTHROPIC_BASE_URL=http://localhost:<PORT>/anthropic
// The proxy forwards all requests verbatim, only mutating the response body.

const http  = require('http')
const https = require('https')
const logger = require('../config/logger')

const PROXY_PORT  = parseInt(process.env.DEEPSEEK_PROXY_PORT || '19721', 10)
const TARGET_HOST = 'api.deepseek.com'
const TARGET_PORT = 443

let _server = null

// ─── SSE line transformer - strips thinking blocks from streamed responses ──
// DeepSeek SSE format mirrors Anthropic: each line is `data: <json>` or empty.
// We strip:
//   content_block_start  where block.type === 'thinking'
//   content_block_delta  where delta.type === 'thinking_delta'
//   content_block_stop   for the index that was a thinking block
//
// TCP chunks can split a single SSE line across multiple `data` events.
// We buffer incomplete trailing lines and prepend them to the next chunk.
function _transformSSEChunk(chunk, state) {
  const text = (state.partialLine || '') + chunk.toString('utf8')
  state.partialLine = ''

  const lines = text.split('\n')

  // If the chunk doesn't end with \n, the last element is an incomplete line
  if (!text.endsWith('\n')) {
    state.partialLine = lines.pop()
  }

  const out = []

  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      out.push(line)
      continue
    }
    const jsonStr = line.slice(6).trim()
    if (jsonStr === '[DONE]') { out.push(line); continue }

    let ev
    try { ev = JSON.parse(jsonStr) } catch { out.push(line); continue }

    // Track which content block indices are thinking blocks
    if (ev.type === 'content_block_start') {
      const blockType = ev.content_block?.type
      if (blockType === 'thinking') {
        state.thinkingIndices.add(ev.index)
        continue  // drop this event
      }
    }
    if (ev.type === 'content_block_delta') {
      if (state.thinkingIndices.has(ev.index)) continue
    }
    if (ev.type === 'content_block_stop') {
      if (state.thinkingIndices.has(ev.index)) {
        state.thinkingIndices.delete(ev.index)
        continue
      }
    }

    out.push(line)
  }

  return Buffer.from(out.join('\n'), 'utf8')
}

// ─── Non-streaming response transformer ──────────────────────────────────────
function _transformJSON(body) {
  try {
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed.content)) {
      parsed.content = parsed.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking')
    }
    return JSON.stringify(parsed)
  } catch {
    return body
  }
}

// ─── Outgoing request body transformer ───────────────────────────────────────
// Sanitise an Anthropic-shaped request before forwarding to DeepSeek.
//
// This proxy targets api.deepseek.com exclusively (TARGET_HOST), so every
// outbound request is DeepSeek-bound. The transform forces thinking mode
// OFF and removes any Anthropic-shaped thinking residue.
//
// Three coupled mutations are required for cross-provider compatibility:
//
//   (1) Top-level `thinking` parameter — FORCE-WRITE to `{type:'disabled'}`.
//       Original v1 (commit 68a5da9, 7 May 2026 05:14 UTC) blanket-DELETED
//       this param to fix the 7 May 03:51 UTC storm where the SDK sent
//       `thinking: {type:'enabled', budget_tokens: 1500}`. That worked at
//       the time because the SDK used `enabled`, and stripping it left an
//       absent param which (it was assumed) defaulted DeepSeek to off.
//
//       The 8 May 08:56 UTC commit (26c9d59) intentionally set the SDK to
//       send `thinking: {type:'disabled'}` for DeepSeek — based on the
//       observation that `delete options.thinking` left the CLI's
//       `alwaysThinkingEnabled=true` default in play, and DeepSeek's
//       Anthropic-compat endpoint AUTO-ENABLES thinking mode when the
//       request carries no `thinking` param. Once auto-enabled, DeepSeek
//       validates that thinking blocks from the prior turn are round-
//       tripped — but the proxy strips them on the response side, so the
//       second turn 400s with: "The `content[].thinking` in the thinking
//       mode must be passed back to the API."
//
//       That was the 7 May 23:13/23:24/23:49 UTC failure mode (3 forks:
//       fork_mow3qoaq_79296a, fork_mow44x4a_5b3f15, fork_mow51olw_ee9ec0).
//       Root cause: the v1 proxy strip and the SDK's explicit-disable were
//       working AGAINST each other. The proxy deleted the very param the
//       SDK was sending to fix the bug.
//
//       v2 (this commit, 9 May 2026): always-write `thinking:{type:'disabled'}`
//       at the wire boundary, regardless of what the SDK sent. This is the
//       only shape that reliably keeps DeepSeek out of thinking mode for
//       multi-turn tool loops. status_board row 8834dd85.
//
//   (2) `thinking` / `redacted_thinking` content blocks on assistant messages.
//       The Claude Agent SDK echoes prior assistant messages verbatim,
//       including thinking blocks that carry Anthropic signatures. DeepSeek
//       cannot validate those signatures and rejects with 400 "Invalid
//       signature in thinking block". Strip them.
//
//   (3) `cache_control` markers. Anthropic prompt caching uses
//       `cache_control: { type: "ephemeral" }` on individual content blocks
//       and on the system prompt. DeepSeek does not implement prompt caching;
//       leaving the markers is best-case ignored, worst-case a schema
//       rejection. Cheap defensive strip.
//
// IMPORTANT: each provider call may flow back to Anthropic on a future turn
// (when claude_max_2 token wedge resolves and the chain returns to claude_max).
// The Claude Agent SDK owns its own state in its child process — this proxy
// only mutates the in-flight HTTP body. The SDK's internal message store is
// untouched. So Anthropic still receives properly-rounded thinking blocks
// when the chain switches back. Cross-ref:
// ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md,
// ~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md.
function _stripThinkingFromRequest(body) {
  try {
    const parsed = JSON.parse(body)
    let mutated = false

    // (1) Top-level thinking parameter — force-write to {type:'disabled'}.
    // Always mutate: the wire-side guarantee is that DeepSeek receives a
    // request with thinking explicitly off. We do not trust upstream
    // (SDK / CLI / call site) to preserve this invariant.
    const desiredThinking = { type: 'disabled' }
    const currentThinking = parsed.thinking
    const isAlreadyDisabled = currentThinking
      && typeof currentThinking === 'object'
      && currentThinking.type === 'disabled'
      && Object.keys(currentThinking).length === 1
    if (!isAlreadyDisabled) {
      parsed.thinking = desiredThinking
      mutated = true
    }

    // (3a) cache_control on the system prompt (string OR array form).
    if (Array.isArray(parsed.system)) {
      const cleanedSystem = parsed.system.map(part => {
        if (part && typeof part === 'object' && part.cache_control !== undefined) {
          mutated = true
          const { cache_control, ...rest } = part
          return rest
        }
        return part
      })
      parsed.system = cleanedSystem
    }

    if (Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map(msg => {
        if (!msg || typeof msg !== 'object') return msg
        if (!Array.isArray(msg.content)) return msg

        // (2) thinking/redacted_thinking blocks - assistant role only.
        // (3b) cache_control on any content block - all roles.
        let msgMutated = false
        const filtered = []
        for (const block of msg.content) {
          if (!block || typeof block !== 'object') {
            filtered.push(block)
            continue
          }
          if (msg.role === 'assistant' && (block.type === 'thinking' || block.type === 'redacted_thinking')) {
            msgMutated = true
            continue
          }
          if (block.cache_control !== undefined) {
            msgMutated = true
            const { cache_control, ...rest } = block
            filtered.push(rest)
            continue
          }
          filtered.push(block)
        }
        if (!msgMutated) return msg
        mutated = true
        return { ...msg, content: filtered }
      })
    }

    return mutated ? JSON.stringify(parsed) : body
  } catch {
    return body
  }
}

// ─── Server ──────────────────────────────────────────────────────────────────
function start() {
  if (_server) return

  _server = http.createServer((req, res) => {
    // SDK sends /v1/messages; DeepSeek Anthropic-compat lives at /anthropic/v1/messages.
    const upstreamPath = req.url.startsWith('/anthropic') ? req.url : `/anthropic${req.url}`
    // Strip accept-encoding so DeepSeek sends gzip/identity - Node's https
    // handles those natively. Brotli is not supported by the built-in http module
    // and causes BrotliDecompressionError in the CC SDK.
    const upstreamHeaders = { ...req.headers, host: TARGET_HOST }
    delete upstreamHeaders['accept-encoding']

    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: upstreamPath,
      method: req.method,
      headers: upstreamHeaders,
    }

    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks)
      const bodyStr = rawBody.length ? _stripThinkingFromRequest(rawBody.toString('utf8')) : ''
      const body = bodyStr.length ? Buffer.from(bodyStr, 'utf8') : rawBody
      if (body.length) options.headers['content-length'] = body.length

      const proxyReq = https.request(options, proxyRes => {
        const isStream = (proxyRes.headers['content-type'] || '').includes('text/event-stream')

        // Forward response headers but strip content-encoding - we're passing
        // the decompressed (or never-compressed) body straight through.
        const responseHeaders = { ...proxyRes.headers }
        delete responseHeaders['content-encoding']
        res.writeHead(proxyRes.statusCode, responseHeaders)

        if (isStream) {
          const state = { thinkingIndices: new Set(), partialLine: '' }
          proxyRes.on('data', chunk => {
            try {
              res.write(_transformSSEChunk(chunk, state))
            } catch {
              res.write(chunk)
            }
          })
          proxyRes.on('end', () => res.end())
        } else {
          const bodyChunks = []
          proxyRes.on('data', c => bodyChunks.push(c))
          proxyRes.on('end', () => {
            const raw = Buffer.concat(bodyChunks).toString('utf8')
            const transformed = _transformJSON(raw)
            res.end(transformed)
          })
        }
      })

      proxyReq.on('error', err => {
        logger.warn('DeepSeek proxy: upstream error', { error: err.message })
        if (!res.headersSent) res.writeHead(502)
        res.end(JSON.stringify({ error: 'proxy upstream error', detail: err.message }))
      })

      if (body.length) proxyReq.write(body)
      proxyReq.end()
    })
  })

  _server.listen(PROXY_PORT, '127.0.0.1', () => {
    logger.info('DeepSeek proxy started', { port: PROXY_PORT, target: TARGET_HOST })
  })

  _server.on('error', err => {
    logger.error('DeepSeek proxy server error', { error: err.message })
    _server = null
  })
}

function stop() {
  if (_server) { _server.close(); _server = null }
}

function getBaseUrl() {
  return `http://127.0.0.1:${PROXY_PORT}`
}

module.exports = {
  start,
  stop,
  getBaseUrl,
  // Exposed for unit tests so the sanitiser logic can be verified without
  // standing up the HTTP server. Treat as private to this module.
  _internal: {
    _stripThinkingFromRequest,
    _transformJSON,
    _transformSSEChunk,
  },
}

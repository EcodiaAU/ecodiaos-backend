'use strict'

// ─── DeepSeek Anthropic-compat proxy ────────────────────────────────────────
//
// Sits between the CC Agent SDK and https://api.deepseek.com/anthropic.
// Strips `thinking` content blocks from DeepSeek V4 Pro responses so the SDK
// never sees them — avoids 400 "Invalid signature in thinking block" errors
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

// ─── SSE line transformer — strips thinking blocks from streamed responses ──
// DeepSeek SSE format mirrors Anthropic: each line is `data: <json>` or empty.
// We strip:
//   content_block_start  where block.type === 'thinking'
//   content_block_delta  where delta.type === 'thinking_delta'
//   content_block_stop   for the index that was a thinking block
function _transformSSEChunk(chunk, state) {
  const text = chunk.toString('utf8')
  const lines = text.split('\n')
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

// ─── Server ──────────────────────────────────────────────────────────────────
function start() {
  if (_server) return

  _server = http.createServer((req, res) => {
    // SDK sends /v1/messages; DeepSeek Anthropic-compat lives at /anthropic/v1/messages.
    const upstreamPath = req.url.startsWith('/anthropic') ? req.url : `/anthropic${req.url}`
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: upstreamPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
      },
    }

    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (body.length) options.headers['content-length'] = body.length

      const proxyReq = https.request(options, proxyRes => {
        const isStream = (proxyRes.headers['content-type'] || '').includes('text/event-stream')

        res.writeHead(proxyRes.statusCode, proxyRes.headers)

        if (isStream) {
          const state = { thinkingIndices: new Set() }
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

module.exports = { start, stop, getBaseUrl }

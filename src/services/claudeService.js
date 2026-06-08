const logger = require('../config/logger')
const db = require('../config/db')
const anthropicMessagesClient = require('./anthropicMessagesClient')

// ═══════════════════════════════════════════════════════════════════════
// CLAUDE SERVICE - background LLM calls for non-agent-loop work.
//
// Routes through anthropicMessagesClient (the canonical OS provider chain:
// claude_max tate -> code -> money -> deepseek fallback) via long-lived
// OAuth bearers. The old factoryBridge -> ecodia-factory subprocess path
// is dead since the factory was decommissioned 2026-06-08; this service
// now goes direct via /v1/messages with the OAuth credentials ecodia-api
// already manages for the user chat surface (no cred-rotation races
// because the bearers loaded by anthropicMessagesClient are read once
// per request from the same .credentials.json files cred-refresher.js
// keeps fresh).
//
// Signature kept identical: callClaude returns a string; callClaudeJSON
// returns a parsed object; cacheKeepalivePing unchanged.
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_MAX_TOKENS = 4096

function _splitSystemAndConversation(messages, systemArg) {
  const systemParts = []
  if (systemArg) systemParts.push(systemArg)
  const conversation = []
  for (const m of messages) {
    if (!m) continue
    if (m.role === 'system') systemParts.push(m.content)
    else if (m.role === 'user') conversation.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') conversation.push({ role: 'assistant', content: m.content })
  }
  if (conversation.length === 0) {
    // anthropicMessagesClient requires non-empty messages. Old factoryBridge
    // path accepted a system-only flat prompt; synthesize a minimal user
    // turn so callers that only pass system content keep working.
    conversation.push({ role: 'user', content: 'continue' })
  }
  return { systemParts, conversation }
}

function _extractText(json) {
  const blocks = (json && json.content) || []
  return blocks.filter(b => b && b.type === 'text').map(b => b.text).join('')
}

async function callClaude(messages, { module: mod = 'general', system = null } = {}) {
  const start = Date.now()
  const { systemParts, conversation } = _splitSystemAndConversation(messages, system)

  const result = await anthropicMessagesClient.createMessage({
    messages: conversation,
    system: systemParts.length ? systemParts.join('\n\n') : null,
    model: 'claude-sonnet-4-6',
    max_tokens: DEFAULT_MAX_TOKENS,
  })

  const content = _extractText(result && result.json)
  const durationMs = Date.now() - start
  logger.debug(`callClaude via anthropicMessagesClient (${mod})`, {
    durationMs,
    contentLength: content.length,
    providerUsed: result && result.providerUsed,
  })

  const usage = (result && result.json && result.json.usage) || {}
  const inputApprox = systemParts.join('').length + conversation.map(m => m.content || '').join('').length
  db`
    INSERT INTO claude_usage (source, provider, model, input_tokens, output_tokens, week_start)
    VALUES (
      ${mod},
      ${(result && result.providerUsed) || 'unknown'},
      ${(result && result.json && result.json.model) || 'claude-sonnet-4-6'},
      ${usage.input_tokens || Math.ceil(inputApprox / 4)},
      ${usage.output_tokens || Math.ceil(content.length / 4)},
      date_trunc('week', now())
    )
    ON CONFLICT DO NOTHING
  `.catch(() => {})

  return content
}

// ─── JSON helper - parses response, retries once on parse failure ─────

async function callClaudeJSON(messages, opts = {}) {
  const augmentedMessages = [...messages]
  const lastIdx = augmentedMessages.length - 1
  if (lastIdx >= 0 && augmentedMessages[lastIdx].role === 'user') {
    augmentedMessages[lastIdx] = {
      ...augmentedMessages[lastIdx],
      content: augmentedMessages[lastIdx].content + '\n\nRespond with valid JSON only. No markdown, no explanation.',
    }
  }

  const raw = await callClaude(augmentedMessages, opts)
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]) } catch {}
    }
    logger.debug(`Claude JSON parse failed (module: ${opts.module || 'general'})`, { raw: raw.slice(0, 200) })
    throw new Error(`Claude returned non-JSON response for module ${opts.module || 'general'}`)
  }
}

// ─── cache keepalive - minimal ping to refresh Anthropic prompt cache TTL ──
// docs/PROMPT_ASSEMBLY_SPEC.md §4.3. Called by workers/cacheKeepaliveWorker
// every 45 minutes during work hours. Sends the stable BP1+BP2 prefix +
// "health=?" user message via the existing callClaude path so the upstream
// cache (whether factory-bg-subprocess or direct SDK) sees the same content
// and extends its 1h TTL. Returns { usage: { input_tokens, cache_read_input_tokens } }
// or the best approximation the underlying transport returns.
async function cacheKeepalivePing({ stablePrefix, userMessage = 'health=?' } = {}) {
  const start = Date.now()
  const messages = [
    { role: 'user', content: userMessage },
  ]
  const { conversation } = _splitSystemAndConversation(messages, null)
  const result = await anthropicMessagesClient.createMessage({
    messages: conversation,
    system: stablePrefix,
    model: 'claude-sonnet-4-6',
    max_tokens: 32,
  })
  const content = _extractText(result && result.json)
  const durationMs = Date.now() - start
  const usage = (result && result.json && result.json.usage) || {}
  return {
    usage: {
      input_tokens: usage.input_tokens || Math.ceil((stablePrefix.length + userMessage.length) / 4),
      output_tokens: usage.output_tokens || Math.ceil((content || '').length / 4),
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
    },
    duration_ms: durationMs,
  }
}

module.exports = { callClaude, callClaudeJSON, cacheKeepalivePing }

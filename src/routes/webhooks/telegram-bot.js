'use strict'

/**
 * Telegram Bot webhook -> Corazon reflex (new Claude Code chat tab).
 *
 * POST /api/webhooks/telegram/:secret
 *
 * The :secret in the URL is checked against TELEGRAM_WEBHOOK_SECRET (env
 * with kv_store.creds.telegram_bot.webhook_secret fallback). Telegram's
 * setWebhook API supports passing this in the URL path for shared-secret
 * auth without needing HMAC. We also check the optional
 * X-Telegram-Bot-Api-Secret-Token header if present, for defence in depth.
 *
 * Allowlist: only accept messages where update.message.from.id is in the
 * TELEGRAM_ALLOWED_USER_IDS env (comma-separated) or kv_store fallback.
 * Tate's Telegram user ID is configured there.
 *
 * Each Telegram update becomes a reflex fire on Corazon. The chat tab that
 * opens receives:
 *   - the message body
 *   - chat_id for replying
 *   - prior thread context (kv_store.cowork.telegram_thread.<chat_id>)
 *   - explicit instruction to reply via the Telegram Bot API sendMessage
 *
 * Threading uses the Telegram-native chat_id (one chat per user / per group).
 * Unlike SMS this means Telegram itself preserves the visual thread; our
 * prompt-prepending is a context-loading aid for the chat session, not a UI
 * substitute. Same Option 1 mechanic, different scope key.
 *
 * Architecture rationale: replaces (or runs alongside) the Twilio SMS path
 * to cut $30/mo carrier costs and gain media support + native threading.
 * Tate sets up the bot via @BotFather (one-time, 2 min) - we just need the
 * bot token + the user ID of his Telegram account.
 *
 * Authored 2026-05-16 evening (Tate's nap window).
 */

const express = require('express')

const db = require('../../config/db')
const logger = require('../../config/logger')

const router = express.Router()

const SOURCE = 'telegram-bot'
const REFLEX_TOOL_NAME = 'reflex.append_to_master'
const DEFAULT_REFLEX_URL = 'http://100.114.219.69:7456/api/tool'

const TELEGRAM_THREAD_KEY_PREFIX = 'cowork.telegram_thread.'
const TELEGRAM_THREAD_MAX_EXCHANGES = 10
const TELEGRAM_THREAD_STALE_HOURS = 24 // Telegram threads stay warm longer than SMS - bot UX is true conversation
const MAX_BODY_CHARS = 4000

let _credCache = { value: null, expiresAt: 0 }

async function loadTelegramCreds() {
  const now = Date.now()
  if (_credCache.expiresAt > now && _credCache.value) return _credCache.value
  let creds = {
    bot_token: process.env.TELEGRAM_BOT_TOKEN || null,
    webhook_secret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
    allowed_user_ids: (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  }
  if (!creds.bot_token || !creds.webhook_secret || creds.allowed_user_ids.length === 0) {
    try {
      const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.telegram_bot' LIMIT 1`
      const raw = rows?.[0]?.value
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed) {
        creds.bot_token = creds.bot_token || parsed.bot_token || null
        creds.webhook_secret = creds.webhook_secret || parsed.webhook_secret || null
        if (creds.allowed_user_ids.length === 0 && Array.isArray(parsed.allowed_user_ids)) {
          creds.allowed_user_ids = parsed.allowed_user_ids.map(String)
        }
      }
    } catch (err) {
      logger.warn('telegram-bot: kv_store cred load failed (non-fatal if env vars are set)', { error: err.message })
    }
  }
  _credCache = { value: creds, expiresAt: now + 5 * 60 * 1000 }
  return creds
}

let _agentTokenCache = { value: null, expiresAt: 0 }

async function loadAgentToken() {
  if (process.env.REFLEX_AGENT_TOKEN) return process.env.REFLEX_AGENT_TOKEN
  const now = Date.now()
  if (_agentTokenCache.expiresAt > now && _agentTokenCache.value) return _agentTokenCache.value
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.laptop_agent' LIMIT 1`
  const raw = rows?.[0]?.value
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const token = parsed?.agent_token || null
  _agentTokenCache = { value: token, expiresAt: now + 5 * 60 * 1000 }
  return token
}

async function loadTelegramThread(chatId) {
  const key = `${TELEGRAM_THREAD_KEY_PREFIX}${chatId}`
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${key} LIMIT 1`
    if (rows.length === 0) return { exchanges: [], cold_start: true, key }
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    const lastAtIso = parsed?.last_at || rows[0].updated_at
    const lastAtMs = lastAtIso ? new Date(lastAtIso).getTime() : 0
    const ageHours = (Date.now() - lastAtMs) / 3600000
    if (ageHours > TELEGRAM_THREAD_STALE_HOURS) {
      return { exchanges: [], cold_start: true, prior_ended_at: lastAtIso, prior_age_hours: ageHours, key }
    }
    return { exchanges: exchanges.slice(-TELEGRAM_THREAD_MAX_EXCHANGES), cold_start: false, last_at: lastAtIso, key }
  } catch (err) {
    logger.warn('telegram-bot: thread load failed (cold-start fallback)', { error: err.message })
    return { exchanges: [], cold_start: true, error: err.message, key }
  }
}

async function appendInboundToTelegramThread(chatId, body, at, senderName) {
  const key = `${TELEGRAM_THREAD_KEY_PREFIX}${chatId}`
  try {
    const current = await loadTelegramThread(chatId)
    const newEntry = { from: 'tate', sender_name: senderName, body: String(body || '').slice(0, 1000), at }
    const exchanges = (current.exchanges || []).concat([newEntry]).slice(-TELEGRAM_THREAD_MAX_EXCHANGES)
    const value = JSON.stringify({ exchanges, last_at: at, chat_id: chatId })
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('telegram-bot: thread append failed (non-fatal)', { error: err.message })
  }
}

function formatPriorThread(thread) {
  if (!thread || !Array.isArray(thread.exchanges) || thread.exchanges.length === 0) {
    if (thread?.cold_start && thread?.prior_ended_at) {
      const hrs = Math.round(thread.prior_age_hours || 0)
      return `\n[Thread state: cold start - prior thread last touched ${hrs}h ago (>${TELEGRAM_THREAD_STALE_HOURS}h stale).]\n`
    }
    return '\n[Thread state: first message in a new Telegram conversation.]\n'
  }
  const lines = ['', '[Prior thread (newest last; this is what you said + what Tate said before this message):']
  for (const e of thread.exchanges) {
    const who = e.from === 'tate' ? 'Tate' : 'You'
    const when = e.at ? new Date(e.at).toISOString().slice(11, 16) + 'Z' : '?'
    lines.push(`  ${when} ${who}: ${String(e.body || '').slice(0, 300)}`)
  }
  lines.push(']', '')
  return lines.join('\n')
}

/**
 * Short-form prompt for the APPEND path - this lands as a continuation turn
 * in an existing Claude Code chat that already has its own native history
 * + the workspace CLAUDE.md briefing loaded. We do NOT re-paste the prior
 * thread / reply curl / tate policy - that's all in the chat's context
 * already. Just the new inbound message header + body.
 */
function buildAppendPrompt({ chatId, fromUserId, senderName, body, receivedAt, updateId }) {
  const safeBody = String(body || '').slice(0, MAX_BODY_CHARS)
  const hhmm = (() => {
    try {
      const d = new Date(receivedAt)
      return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) + ' AEST'
    } catch {
      return receivedAt
    }
  })()
  return `[Telegram from ${senderName} at ${hhmm} | chat_id=${chatId} | user_id=${fromUserId} | update_id=${updateId}]
${safeBody}`
}

/**
 * Long-form seed prompt for the SEED path - used when the master chat tab
 * is being bootstrapped (first ever, or after window/mouth went away). The
 * fresh chat has no native history yet, so we paste in the kv_store thread
 * mirror as bootstrap context plus the new inbound message.
 */
function buildSeedPrompt({ chatId, fromUserId, senderName, body, receivedAt, updateId, thread, botTokenForReply }) {
  const safeBody = String(body || '').slice(0, MAX_BODY_CHARS)
  const priorThreadBlock = formatPriorThread(thread)
  const seedHeader = `[Telegram conductor SEED - this is a fresh chat bootstrapped because no master tab was alive. The workspace CLAUDE.md at D:/.code/telegram-conductor/CLAUDE.md briefs your role. Subsequent Telegram inbounds will arrive as new turns in THIS chat - your native history is your memory from here on.]
${priorThreadBlock}
[New inbound Telegram from ${senderName} at ${receivedAt} | chat_id=${chatId} | user_id=${fromUserId} | update_id=${updateId}]
${safeBody}

---
Bot token for replies (also at kv_store.creds.telegram_bot.bot_token): ${botTokenForReply}
Reply via curl POST to https://api.telegram.org/bot<token>/sendMessage with {chat_id, text, parse_mode:"Markdown"}.
After sending the reply, append it to kv_store.cowork.telegram_thread.${chatId} (full SQL pattern in CLAUDE.md).`
  return seedHeader
}

async function fireReflex({ prompt, seedPrompt, idempotencyKey }) {
  const url = process.env.REFLEX_AGENT_URL || DEFAULT_REFLEX_URL
  const token = await loadAgentToken()
  if (!token) {
    return { ok: false, status: 0, error: 'kv_store.creds.laptop_agent.agent_token missing' }
  }
  const body = JSON.stringify({
    tool: REFLEX_TOOL_NAME,
    params: { prompt, seed_prompt: seedPrompt, source: SOURCE, idempotency_key: idempotencyKey },
  })
  const controller = new AbortController()
  // Seed path may include launching VS Code from cold -> longer timeout.
  const timer = setTimeout(() => controller.abort(), 40000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
    const text = await resp.text().catch(() => '')
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    if (resp.status >= 200 && resp.status < 300 && parsed?.ok) {
      return { ok: true, status: resp.status, result: parsed.result }
    }
    return { ok: false, status: resp.status, error: parsed?.error || text.slice(0, 200) }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

router.post('/:secret', express.json({ limit: '2mb' }), async (req, res) => {
  // Quick 200 OK to Telegram so it doesn't retry. Reflex fire is async.
  const respondOk = () => { if (!res.headersSent) res.status(200).json({ ok: true }) }

  try {
    const creds = await loadTelegramCreds()
    if (!creds.webhook_secret || !creds.bot_token) {
      logger.error('telegram-bot: creds not provisioned')
      res.status(503).json({ error: 'creds_not_provisioned', hint: 'set kv_store.creds.telegram_bot = {bot_token, webhook_secret, allowed_user_ids}' })
      return
    }

    // URL-path secret check (Telegram passes via setWebhook url).
    if (req.params.secret !== creds.webhook_secret) {
      logger.warn('telegram-bot: secret mismatch in URL path', { ip: req.ip })
      res.status(403).json({ error: 'secret_invalid' })
      return
    }

    // Optional header check (Telegram passes if secret_token configured at setWebhook).
    const headerSecret = req.get('x-telegram-bot-api-secret-token')
    if (headerSecret && headerSecret !== creds.webhook_secret) {
      logger.warn('telegram-bot: header secret mismatch', { ip: req.ip })
      res.status(403).json({ error: 'header_secret_invalid' })
      return
    }

    const update = req.body
    const msg = update?.message || update?.edited_message
    if (!msg) {
      // No message in update (could be callback_query, inline_query, etc - ignored for V1)
      respondOk()
      return
    }

    const fromUserId = String(msg.from?.id || '')
    const chatId = String(msg.chat?.id || '')
    const senderName = msg.from?.first_name || msg.from?.username || `user-${fromUserId}`
    const body = msg.text || msg.caption || ''
    const updateId = String(update.update_id || '')
    const receivedAt = new Date().toISOString()

    // Allowlist
    if (creds.allowed_user_ids.length > 0 && !creds.allowed_user_ids.includes(fromUserId)) {
      logger.info('telegram-bot: rejected non-allowlisted user', { fromUserId, senderName })
      respondOk()
      return
    }

    if (!body) {
      // Empty body (e.g. sticker-only, photo without caption). V1 ignores.
      logger.info('telegram-bot: ignored body-less message', { msgKeys: Object.keys(msg), fromUserId })
      respondOk()
      return
    }

    console.log(`[Telegram Webhook] from=${senderName}(${fromUserId}) chat=${chatId} update=${updateId} body=${body.slice(0, 80)}`)
    respondOk()

    const idempotencyKey = `tg-${updateId}-${chatId}`

    console.log(`[Telegram TRACE] step=1 loadTelegramThread chat=${chatId}`)
    const thread = await loadTelegramThread(chatId)
    console.log(`[Telegram TRACE] step=1.thread cold_start=${thread.cold_start} prior_exchanges=${(thread.exchanges || []).length}`)

    console.log(`[Telegram TRACE] step=2 buildAppendPrompt + buildSeedPrompt`)
    const appendPrompt = buildAppendPrompt({ chatId, fromUserId, senderName, body, receivedAt, updateId })
    const seedPrompt = buildSeedPrompt({ chatId, fromUserId, senderName, body, receivedAt, updateId, thread, botTokenForReply: creds.bot_token })

    console.log(`[Telegram TRACE] step=3 appendInboundToTelegramThread`)
    await appendInboundToTelegramThread(chatId, body, receivedAt, senderName)

    // 2026-05-18 session-subscription: probe for active conductor first.
    // If registered with fresh heartbeat (<30min), route the message into
    // its coord inbox - wake substrate flashes/toasts the existing tab. Only
    // falls back to reflex.append_to_master / seed (new tab spawn) when no
    // active conductor. See backend/patterns/session-subscription-via-coord-
    // inbox-routing-2026-05-18.md.
    let routedViaCoord = false
    try {
      const bridge = require('../../services/inboundChannelBridge')
      const bridgeResult = await bridge.routeInbound({
        channel: 'telegram',
        from: fromUserId,
        sender_name: senderName,
        thread_id: chatId,
        body,
        extra: { update_id: updateId, idempotency_key: idempotencyKey },
      })
      console.log(`[Telegram TRACE] step=3.5 bridge routed=${bridgeResult.routed} reason=${bridgeResult.reason || 'ok'}`)
      if (bridgeResult.routed) {
        routedViaCoord = true
        logger.info('telegram routed via coord to active conductor', {
          idempotencyKey, senderName, conductor_tab_id: bridgeResult.conductor?.tab_id || null,
        })
      }
    } catch (bridgeErr) {
      logger.warn('inbound bridge threw, falling back to reflex', { error: bridgeErr.message })
    }

    if (!routedViaCoord) {
      console.log(`[Telegram TRACE] step=4 fireReflex append_chars=${appendPrompt.length} seed_chars=${seedPrompt.length}`)
      const result = await fireReflex({ prompt: appendPrompt, seedPrompt, idempotencyKey })
      console.log(`[Telegram TRACE] step=5 fireReflex ok=${result.ok} status=${result.status} error=${result.error || 'none'}`)
      if (!result.ok) {
        logger.error('telegram reflex fire failed', { idempotencyKey, status: result.status, error: result.error })
      } else {
        logger.info('telegram reflex fired', { idempotencyKey, senderName, chatId, cold_start: thread.cold_start, prior_exchanges: (thread.exchanges || []).length })
      }
    }
  } catch (err) {
    console.log(`[Telegram TRACE] step=err ${err.message}`)
    logger.error('telegram webhook: unhandled error', { error: err.message, stack: err.stack })
    if (!res.headersSent) res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

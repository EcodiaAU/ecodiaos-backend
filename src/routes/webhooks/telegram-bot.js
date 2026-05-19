'use strict'

/**
 * Telegram Bot webhook -> one-conductor-many-channels router.
 *
 * POST /api/webhooks/telegram/:secret
 *
 * Builds canonical envelope from Telegram update + hands off to
 * inboundConductorRouter. Same router as SMS; same conductor; one chat.
 *
 * Per backend/patterns/one-conductor-many-channels-2026-05-19.md.
 *
 * Allowlist via kv_store.creds.telegram_bot.allowed_user_ids.
 * Webhook secret validated via :secret URL path + optional
 * X-Telegram-Bot-Api-Secret-Token header.
 *
 * Media support: photo / voice / audio / document / video are resolved via
 * Telegram getFile API into direct URLs included in envelope.attachments.
 * The conductor's prompt header instructs which MCP to use (Deepgram for
 * voice/audio, vision/multimodal for images).
 */

const express = require('express')
const db = require('../../config/db')
const logger = require('../../config/logger')
const {
  routeEnvelopeToConductor,
  persistRawProviderPayload,
  appendInboundToThreadMirror,
} = require('../../services/inboundConductorRouter')

const router = express.Router()

const MAX_BODY_CHARS = 4000

let _credCache = { value: null, expiresAt: 0 }

async function loadTelegramCreds() {
  const now = Date.now()
  if (_credCache.expiresAt > now && _credCache.value) return _credCache.value
  const creds = {
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
      logger.warn('telegram-bot: kv_store cred load failed (non-fatal if env set)', { error: err.message })
    }
  }
  _credCache = { value: creds, expiresAt: now + 5 * 60 * 1000 }
  return creds
}

/**
 * Resolve a Telegram file_id to a direct download URL via the Bot API.
 * Returns null on any failure (envelope still flows; conductor sees the
 * missing-media note).
 */
async function resolveTelegramFile(botToken, fileId) {
  if (!botToken || !fileId) return null
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)
    if (!resp.ok) return null
    const data = await resp.json()
    const filePath = data?.result?.file_path
    const fileSize = data?.result?.file_size || null
    if (!filePath) return null
    return {
      url: `https://api.telegram.org/file/bot${botToken}/${filePath}`,
      bytes: fileSize,
    }
  } catch (err) {
    logger.warn('telegram getFile failed', { error: err.message, fileId })
    return null
  }
}

async function extractAttachments(botToken, msg) {
  // Canonical attachments[] shape: {kind, url, content_type, bytes?, auth_hint, ...extras}
  const out = []
  // Photos arrive as an array of size variants; use the largest.
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1]
    const resolved = await resolveTelegramFile(botToken, largest.file_id)
    if (resolved) out.push({ kind: 'image', ...resolved, content_type: 'image/jpeg', auth_hint: 'telegram_public_url' })
  }
  if (msg.voice) {
    const resolved = await resolveTelegramFile(botToken, msg.voice.file_id)
    if (resolved) out.push({ kind: 'audio', ...resolved, content_type: msg.voice.mime_type || 'audio/ogg', auth_hint: 'telegram_public_url', duration_s: msg.voice.duration })
  }
  if (msg.audio) {
    const resolved = await resolveTelegramFile(botToken, msg.audio.file_id)
    if (resolved) out.push({ kind: 'audio', ...resolved, content_type: msg.audio.mime_type || 'audio/mpeg', auth_hint: 'telegram_public_url', duration_s: msg.audio.duration })
  }
  if (msg.document) {
    const resolved = await resolveTelegramFile(botToken, msg.document.file_id)
    if (resolved) out.push({ kind: 'file', ...resolved, content_type: msg.document.mime_type || 'application/octet-stream', auth_hint: 'telegram_public_url', file_name: msg.document.file_name })
  }
  if (msg.video) {
    const resolved = await resolveTelegramFile(botToken, msg.video.file_id)
    if (resolved) out.push({ kind: 'video', ...resolved, content_type: msg.video.mime_type || 'video/mp4', auth_hint: 'telegram_public_url' })
  }
  return out
}

function buildReplyTo(msg) {
  const rt = msg.reply_to_message
  if (!rt) return null
  return {
    message_id: rt.message_id,
    snippet: String(rt.text || rt.caption || '').slice(0, 240),
    from: rt.from?.first_name || rt.from?.username || null,
  }
}

router.post('/:secret', express.json({ limit: '2mb' }), async (req, res) => {
  const respondOk = () => { if (!res.headersSent) res.status(200).json({ ok: true }) }

  try {
    const creds = await loadTelegramCreds()
    if (!creds.webhook_secret || !creds.bot_token) {
      logger.error('telegram-bot: creds not provisioned')
      res.status(503).json({ error: 'creds_not_provisioned' })
      return
    }
    if (req.params.secret !== creds.webhook_secret) {
      logger.warn('telegram-bot: secret mismatch', { ip: req.ip })
      res.status(403).json({ error: 'secret_invalid' })
      return
    }
    const headerSecret = req.get('x-telegram-bot-api-secret-token')
    if (headerSecret && headerSecret !== creds.webhook_secret) {
      logger.warn('telegram-bot: header secret mismatch', { ip: req.ip })
      res.status(403).json({ error: 'header_secret_invalid' })
      return
    }

    const update = req.body
    const msg = update?.message || update?.edited_message
    if (!msg) { respondOk(); return }

    const fromUserId = String(msg.from?.id || '')
    const chatId = String(msg.chat?.id || '')
    const senderName = msg.from?.first_name || msg.from?.username || `user-${fromUserId}`
    const body = msg.text || msg.caption || ''
    const updateId = String(update.update_id || '')

    if (creds.allowed_user_ids.length > 0 && !creds.allowed_user_ids.includes(fromUserId)) {
      logger.info('telegram-bot: rejected non-allowlisted user', { fromUserId, senderName })
      respondOk()
      return
    }

    respondOk()

    const attachments = await extractAttachments(creds.bot_token, msg)
    const replyTo = buildReplyTo(msg)
    const receivedAt = new Date().toISOString()
    const idempotencyKey = `tg-${updateId}-${chatId}`

    const envelope = {
      channel: 'telegram',
      from: fromUserId,
      from_kind: 'tate',  // Telegram allowlist == tate-only by design; future per-user mapping via crm_contacts.telegram_user_id
      sender_name: senderName,
      thread_id: chatId,
      body: String(body || '').slice(0, MAX_BODY_CHARS),
      attachments,
      reply_to: replyTo,
      received_at: receivedAt,
      idempotency_key: idempotencyKey,
      raw_provider_payload_ref: `kv:cowork.inbound_raw.${idempotencyKey}`,
      telegram_chat_id: chatId,
    }

    await Promise.all([
      persistRawProviderPayload(idempotencyKey, update),
      appendInboundToThreadMirror({
        channel: 'telegram',
        thread_id: chatId,
        body: body || '(attachment-only)',
        sender_name: senderName,
        received_at: receivedAt,
      }),
    ])

    const result = await routeEnvelopeToConductor({ envelope, source: 'telegram-webhook' })
    if (!result.ok) {
      logger.error('telegram route to conductor failed; envelope in coord inbox for fallback', {
        idempotency_key: idempotencyKey, mode: result.mode, error: result.error,
      })
    } else {
      logger.info('telegram routed', { idempotency_key: idempotencyKey, mode: result.mode })
    }
  } catch (err) {
    logger.error('telegram webhook: unhandled error', { error: err.message, stack: err.stack })
    if (!res.headersSent) res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

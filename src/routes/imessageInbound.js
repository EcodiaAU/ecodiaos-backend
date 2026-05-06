'use strict'

/**
 * iMessage Inbound Webhook - SY094 Messages.app → ecodia-api → conductor.
 *
 * Architecture (Option B per fork_moum5ry1_25c72b brief 2026-05-06 22:11 AEST):
 *
 *   Tate types iMessage on his phone
 *      ↓
 *   Apple Push delivery → SY094 Messages.app (signed in as code@ecodia.au)
 *      ↓
 *   Messages.app fires AppleScript handler "active chat message received"
 *   (registered via Messages.app preferences → Settings → General → Run AppleScript)
 *      ↓
 *   AppleScript handler `sy094-imessage-watcher.applescript`:
 *     - filters out is_from_me=true (own outbound messages)
 *     - filters non-Tate-buddy senders
 *     - HMAC-signs payload with secret from ~/.imessage-webhook-secret
 *     - POSTs https://api.admin.ecodia.au/api/imessage/inbound
 *      ↓
 *   This route:
 *     - HMAC-validated by ../middleware/validateImessageSignature
 *     - records inbound in kv_store.ceo.tate.last_imessage_seen
 *     - upserts a P1 status_board row (so cold-start sessions see it)
 *     - posts a brief to /api/os-session/message (priority:false, queues
 *       behind active turn per Turn Completion Discipline doctrine)
 *      ↓
 *   Conductor (or a fork it dispatches) reads the brief, decides response,
 *   sends iMessage reply via existing `skills/tate-msg/index.js` outbound
 *   path. Round-trip target <60s end-to-end.
 *
 * Why webhook not poll: SY094 is NOT on Tailscale (only ecodia-vps + corazon
 * are) and the eos-laptop-agent on SY094 binds to localhost:7456. From the
 * VPS there is no inbound path to chat.db. SSH-on-SY094 is forbidden per
 * ~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md. The clean
 * substrate is outbound-from-SY094 to the VPS public HTTPS endpoint,
 * which works without any infrastructure changes on the SY094 side beyond
 * one-time AppleScript registration via RDP.
 *
 * Idempotency: SY094 includes `message_id` (sqlite ROWID + chat guid) in
 * the payload. We dedupe via kv_store key
 * `imessage.inbound.seen.<message_id>` with 24h TTL semantics (the row
 * stays but after 24h subsequent inserts overwrite). Replay attack window
 * is bounded to 5min by HMAC-validator's timestamp check.
 *
 * Status_board row strategy: ONE rolling row keyed by entity_ref
 * 'imessage_tate_inbound_unread'. Upsert each inbound; archive after
 * conductor sends reply (reply path responsibility, separate piece of work).
 * This avoids row-pollution while keeping cold-start visibility.
 *
 * Authored 6 May 2026 by fork_moum5ry1_25c72b. Status_board row
 * f5589865-6199-49df-8fbb-3f034c5565f1.
 */

const express = require('express')
const router = express.Router()
const validateImessageSignature = require('../middleware/validateImessageSignature')
const osSession = require('../services/osSessionService')
const db = require('../config/db')
const logger = require('../config/logger')

// Tate's known iMessage handles. The AppleScript already filters by
// buddy, but we keep a defence-in-depth allowlist here in case the watcher
// is ever misconfigured. E.164 + apple ID forms are both common in Apple's
// internal handle space.
const TATE_HANDLES = new Set([
  '+61404247153',
  'tate@ecodia.au',
  'tatedonohoe@gmail.com',
  'tatedonohoe@me.com',
  'tatedonohoe@icloud.com',
])

const STATUS_BOARD_ENTITY_REF = 'imessage_tate_inbound_unread'
const KV_LAST_SEEN = 'ceo.tate.last_imessage_seen'

// raw body parser must run BEFORE the HMAC middleware so the bytes signed
// are exactly the bytes we hash. Limit to 64KB - iMessage practical limit
// is far smaller, this caps abuse.
router.use(express.raw({ type: '*/*', limit: '64kb' }))
router.use(validateImessageSignature)

router.post('/inbound', async (req, res) => {
  const body = req.body || {}
  const messageId = String(body.message_id || '').slice(0, 200)
  const sender = String(body.sender || '').trim().toLowerCase()
  const text = String(body.text || '').trim()
  const senderTs = String(body.timestamp || '').trim()
  const chatGuid = String(body.chat_guid || '').trim()
  const isFromMe = !!body.is_from_me

  if (!messageId || !sender || !text) {
    logger.warn('imessage-inbound: missing required fields', {
      hasId: !!messageId, hasSender: !!sender, hasText: !!text,
    })
    return res.status(400).json({ ok: false, error: 'missing_fields' })
  }

  // Skip our own outbound (defence in depth - watcher should already filter).
  if (isFromMe) {
    return res.status(200).json({ ok: true, skipped: 'is_from_me' })
  }

  // Allowlist filter - reject non-Tate handles immediately, no quota burn.
  if (!TATE_HANDLES.has(sender)) {
    logger.warn('imessage-inbound: non-Tate sender rejected', { sender })
    return res.status(403).json({ ok: false, error: 'sender_not_allowed' })
  }

  // Idempotency: skip if message_id already seen.
  try {
    const seenKey = `imessage.inbound.seen.${messageId}`
    const seenRows = await db`SELECT key FROM kv_store WHERE key = ${seenKey} LIMIT 1`
    if (seenRows.length) {
      return res.status(200).json({ ok: true, skipped: 'duplicate', message_id: messageId })
    }
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${seenKey}, ${JSON.stringify({ at: new Date().toISOString() })}, NOW())
      ON CONFLICT (key) DO UPDATE SET updated_at = NOW()
    `
  } catch (err) {
    logger.warn('imessage-inbound: idempotency check failed', { error: err.message })
    // continue - false-duplicate is safer than dropped message
  }

  // Record last-seen for handoff visibility. Mirrors what fork_mouly6nb
  // wrote at 22:10 AEST on Tate's prior message.
  const lastSeen = {
    channel: 'iMessage',
    direction: 'inbound',
    sender,
    text: text.slice(0, 1500), // hard cap to avoid kv_store bloat
    message_id: messageId,
    chat_guid: chatGuid,
    timestamp: senderTs || new Date().toISOString(),
    received_at: new Date().toISOString(),
    via: 'sy094_applescript_watcher',
    fork_id_handler: 'imessage_inbound_route',
  }
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${KV_LAST_SEEN}, ${JSON.stringify(lastSeen)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('imessage-inbound: kv_store last-seen write failed', { error: err.message })
  }

  // Upsert rolling P1 status_board row so cold-starts see it immediately.
  try {
    const ctx = JSON.stringify({
      sender,
      text_preview: text.slice(0, 200),
      message_id: messageId,
      chat_guid: chatGuid,
      received_at: lastSeen.received_at,
      via: lastSeen.via,
      reply_path: 'skills/tate-msg/index.js sendImessage()',
    })
    const existing = await db`
      SELECT id FROM status_board
      WHERE entity_ref = ${STATUS_BOARD_ENTITY_REF} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length) {
      await db`
        UPDATE status_board
        SET status = 'unread',
            next_action = ${`Reply to Tate iMessage: "${text.slice(0, 120)}"`},
            next_action_by = 'ecodiaos',
            priority = 1,
            last_touched = NOW(),
            context = ${ctx}
        WHERE id = ${existing[0].id}
      `
    } else {
      await db`
        INSERT INTO status_board
          (entity_type, entity_ref, name, status, next_action, next_action_by, priority, context, last_touched)
        VALUES
          ('thread', ${STATUS_BOARD_ENTITY_REF},
           'Tate iMessage inbound (unread)',
           'unread',
           ${`Reply to Tate iMessage: "${text.slice(0, 120)}"`},
           'ecodiaos', 1, ${ctx}, NOW())
      `
    }
  } catch (err) {
    logger.warn('imessage-inbound: status_board upsert failed', { error: err.message })
  }

  // Post a brief to the conductor. Mirrors smsWebhook.js shape: priority:
  // false to queue behind active turn (Turn Completion Discipline). A
  // failure here is non-fatal - status_board still has the message and
  // the next session-start orientation will surface it.
  const prompt =
    `[iMessage from Tate (${sender})]: ${text}\n\n` +
    `Reply via skills/tate-msg/index.js sendImessage(). iMessage is the absolute primary contact channel ` +
    `(Tate verbatim 2026-05-06 08:08 AEST). Twilio SMS is fallback only. ` +
    `Keep replies concise per ~/ecodiaos/patterns/sms-segment-economics.md (still applies to iMessage cost-discipline mindset). ` +
    `If conversational: respond directly. If directive: act, then ack. ` +
    `status_board entity_ref=${STATUS_BOARD_ENTITY_REF} - archive after reply sent.`

  osSession.sendMessage(prompt, { priority: false }).catch((err) => {
    logger.error('imessage-inbound: os-session enqueue failed', { error: err.message })
  })

  logger.info('imessage-inbound: enqueued', {
    sender, message_id: messageId, length: text.length,
  })
  return res.status(200).json({ ok: true, message_id: messageId, enqueued: true })
})

// Liveness probe for the AppleScript watcher to ping. Lets the watcher
// confirm its outbound path works during one-time RDP setup. Auth-gate is
// the same HMAC validator (the route mount applies it to ALL methods on
// /inbound, so this probe is a separate path). Body should be `{}`.
router.post('/health-ping', async (req, res) => {
  const body = req.body || {}
  const watcherVersion = String(body.watcher_version || 'unknown').slice(0, 50)
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES ('imessage.watcher.last_heartbeat',
              ${JSON.stringify({ at: new Date().toISOString(), watcher_version: watcherVersion })},
              NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('imessage-inbound: heartbeat write failed', { error: err.message })
  }
  return res.status(200).json({ ok: true, server_time: new Date().toISOString() })
})

module.exports = router

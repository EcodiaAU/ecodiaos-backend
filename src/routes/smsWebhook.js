/**
 * SMS Webhook - Twilio inbound SMS -> one-conductor-many-channels router.
 *
 * Builds a canonical envelope from the Twilio payload + hands off to
 * inboundConductorRouter, which decides between append (paste to active
 * conductor) and seed (cold-start fresh conductor).
 *
 * Per backend/patterns/one-conductor-many-channels-2026-05-19.md.
 *
 * Allowlist: TATE_MOBILE env var + crm_contacts.phone where clients.can_sms = true.
 * All numbers normalized to E.164 before comparison.
 *
 * MMS support: NumMedia + MediaUrl0..N are captured into envelope.attachments
 * with Twilio basic-auth hint so the conductor can fetch within the turn.
 * (Field renamed from `media` to `attachments` 2026-05-19 evening to align
 * with the native-iOS channel's share-extension schema.)
 */

const express = require('express')
const router = express.Router()
const db = require('../config/db')
const logger = require('../config/logger')
const validateTwilioSignature = require('../middleware/twilioValidation')
const {
  routeEnvelopeToConductor,
  persistRawProviderPayload,
  appendInboundToThreadMirror,
} = require('../services/inboundConductorRouter')

const E164 = /^\+[1-9]\d{7,14}$/

function normalizePhone(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[\s()\-.]/g, '').replace(/['"]/g, '')
  return E164.test(cleaned) ? cleaned : null
}

const TATE_MOBILE = normalizePhone(process.env.TATE_MOBILE || '')
if (!TATE_MOBILE) {
  console.warn('[SMS Webhook] TATE_MOBILE missing or not E.164')
}

async function lookupContact(phone) {
  try {
    const rows = await db`
      SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
      FROM crm_contacts c
      INNER JOIN clients cl ON cl.id = c.client_id
      WHERE c.phone = ${phone}
        AND cl.can_sms = true
      LIMIT 1
    `
    return rows[0] || null
  } catch (err) {
    if (/column.*can_sms.*does not exist/i.test(err.message || '')) {
      try {
        const rows = await db`
          SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
          FROM crm_contacts c LEFT JOIN clients cl ON cl.id = c.client_id
          WHERE c.phone = ${phone} LIMIT 1
        `
        return rows[0] || null
      } catch (err2) {
        logger.warn('SMS contact lookup fallback failed', { error: err2.message })
        return null
      }
    }
    logger.warn('SMS contact lookup failed', { error: err.message })
    return null
  }
}

function buildEnvelope({ from, body, isTate, senderName, contact, messageSid, mediaUrls, mediaContentTypes }) {
  // attachments[] is the canonical multi-channel field. Map Twilio MediaUrl/
  // MediaContentType pairs into the {kind, url, content_type, auth_hint} shape.
  const attachments = []
  for (let i = 0; i < mediaUrls.length; i++) {
    if (mediaUrls[i]) {
      const ct = mediaContentTypes[i] || 'application/octet-stream'
      const kind = ct.startsWith('image/') ? 'image'
        : ct.startsWith('audio/') ? 'audio'
        : ct.startsWith('video/') ? 'video'
        : 'file'
      attachments.push({
        kind,
        url: mediaUrls[i],
        content_type: ct,
        auth_hint: 'twilio_basic_auth',
      })
    }
  }
  return {
    channel: 'sms',
    from,
    from_kind: isTate ? 'tate' : (contact ? 'client' : 'unknown'),
    sender_name: senderName,
    thread_id: from,
    body: String(body || '').slice(0, 4000),
    attachments,
    reply_to: null,
    received_at: new Date().toISOString(),
    idempotency_key: messageSid || `nosid-${from}-${Date.now()}`,
    raw_provider_payload_ref: messageSid ? `kv:cowork.inbound_raw.${messageSid}` : null,
    contact_meta: contact || null,
  }
}

router.post('/incoming', validateTwilioSignature, async (req, res) => {
  const respondOk = () => {
    if (!res.headersSent) {
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
    }
  }

  const { From, Body, MessageSid, NumMedia } = req.body
  const from = normalizePhone(From)

  if (!from) {
    logger.warn('SMS rejected non-E.164 sender', { raw: From })
    respondOk()
    return
  }

  const isTate = !!TATE_MOBILE && from === TATE_MOBILE
  const contact = isTate ? null : await lookupContact(from)
  const isKnown = isTate || !!contact
  const senderName = isTate ? 'Tate' : (contact?.name || 'Unknown')

  logger.info('SMS inbound', { from, isTate, senderName, messageSid: MessageSid, bodyPreview: (Body || '').slice(0, 80) })

  if (!isKnown) {
    logger.info('SMS rejected unknown number', { from })
    respondOk()
    return
  }

  // Respond OK to Twilio immediately. Reflex fire is async.
  respondOk()

  try {
    const mediaCount = parseInt(NumMedia, 10) || 0
    const mediaUrls = []
    const mediaContentTypes = []
    for (let i = 0; i < mediaCount; i++) {
      mediaUrls.push(req.body[`MediaUrl${i}`] || null)
      mediaContentTypes.push(req.body[`MediaContentType${i}`] || null)
    }

    const envelope = buildEnvelope({
      from, body: Body, isTate, senderName, contact,
      messageSid: MessageSid, mediaUrls, mediaContentTypes,
    })

    // Persist raw + thread mirror first (these are durable; if conductor route
    // fails, the conductor still sees the message via heartbeat inbox peek).
    await Promise.all([
      persistRawProviderPayload(envelope.idempotency_key, req.body),
      appendInboundToThreadMirror({
        channel: 'sms',
        thread_id: from,
        body: Body,
        sender_name: senderName,
        received_at: envelope.received_at,
      }),
    ])

    const result = await routeEnvelopeToConductor({ envelope, source: 'sms-webhook' })
    if (!result.ok) {
      logger.error('SMS route to conductor failed; envelope in coord inbox for fallback', {
        idempotency_key: envelope.idempotency_key, mode: result.mode, error: result.error,
      })
    } else {
      logger.info('SMS routed', { idempotency_key: envelope.idempotency_key, mode: result.mode })
    }
  } catch (err) {
    logger.error('SMS webhook: unhandled error', { error: err.message, stack: err.stack })
  }
})

module.exports = router

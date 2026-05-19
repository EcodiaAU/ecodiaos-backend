'use strict'

/**
 * native.js - /api/native/* routes for the ecodia-native iOS app.
 *
 * Endpoints (all under nativeAuth bearer gate):
 *   POST /inbound           - Tate -> EcodiaOS canonical envelope ingest
 *   POST /devices/register  - register/refresh APNs device token
 *   GET  /recent            - thread mirror catch-up for the chat UI
 *   POST /messages/:id/ack  - mark a thread mirror message acked
 *   GET  /tate-priority     - top-3 pinned status_board rows (widget)
 *   POST /tate-priority/set - explicit pin set (rare; usually conductor)
 *   POST /attachments/sign  - presigned PUT URL for Share Extension image uploads
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const express = require('express')
const router = express.Router()
const db = require('../config/db')
const env = require('../config/env')
const logger = require('../config/logger')
const { nativeAuth } = require('../middleware/nativeAuth')
const {
  routeEnvelopeToConductor,
  persistRawProviderPayload,
  appendInboundToThreadMirror,
} = require('../services/inboundConductorRouter')
const deviceState = require('../services/deviceState')
const tatePriorityCurator = require('../services/tatePriorityCurator')

// Lazy Supabase client for storage signing
let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null
  const { createClient } = require('@supabase/supabase-js')
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  return _supabase
}

const ATTACHMENT_BUCKET = 'documents'
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024 // 25MB cap
const SIGNED_READ_TTL_SECONDS = 86400 // 24h

router.use(express.json({ limit: '5mb' }))
router.use(nativeAuth)

const NATIVE_MIRROR_KEY = 'cowork.message_thread.native.tate'
const LA_TOKEN_KEY = 'cowork.native.live_activity_token.tate'

// ---------- POST /inbound ----------

router.post('/inbound', async (req, res) => {
  try {
    const {
      body,
      source,
      attachments,
      idempotency_key,
      live_activity_push_token,
      metadata,
    } = req.body || {}

    if (!idempotency_key) {
      return res.status(400).json({ error: 'idempotency_key_required' })
    }

    const envelope = {
      channel: 'native',
      from: 'tate',
      from_kind: 'tate',
      sender_name: 'Tate',
      thread_id: 'tate',
      body: String(body || '').slice(0, 4000),
      attachments: Array.isArray(attachments) ? attachments : [],
      reply_to: null,
      received_at: new Date().toISOString(),
      idempotency_key,
      raw_provider_payload_ref: `kv:cowork.inbound_raw.${idempotency_key}`,
      source: source || 'chat',
      metadata: metadata || {},
    }

    // If iOS started a Live Activity, capture the LA push token so the
    // headless conductor's live_activity_update tool can reach it.
    if (live_activity_push_token) {
      const laState = JSON.stringify({
        token: live_activity_push_token,
        started_at: envelope.received_at,
        envelope_idempotency_key: idempotency_key,
      })
      try {
        await db`
          INSERT INTO kv_store (key, value, updated_at)
          VALUES (${LA_TOKEN_KEY}, ${laState}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `
      } catch (err) {
        logger.warn('native /inbound: LA token persist failed (non-fatal)', { error: err.message })
      }
    }

    // Respond 200 immediately - downstream work is async.
    res.status(200).json({ ok: true, idempotency_key })

    // Background: persist raw + mirror, record inbound, then route to conductor.
    Promise.all([
      persistRawProviderPayload(idempotency_key, req.body),
      appendInboundToThreadMirror({
        channel: 'native',
        thread_id: 'tate',
        body: envelope.body,
        sender_name: 'Tate',
        received_at: envelope.received_at,
      }),
      deviceState.recordInbound({ channel: 'native', at: envelope.received_at }),
    ])
      .catch((err) => logger.warn('native /inbound: pre-route persist failed', { error: err.message }))
      .then(() => routeEnvelopeToConductor({ envelope, source: 'native-webhook' }))
      .then((result) => {
        if (!result?.ok) {
          logger.error('native /inbound: route to conductor failed', {
            idempotency_key, mode: result?.mode, error: result?.error,
          })
        } else {
          logger.info('native /inbound routed', { idempotency_key, mode: result.mode })
        }
      })
      .catch((err) => logger.error('native /inbound: unhandled async error', { error: err.message, stack: err.stack }))
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'internal_error', detail: err.message })
    logger.error('native /inbound: handler error', { error: err.message, stack: err.stack })
  }
})

// ---------- POST /devices/register ----------

router.post('/devices/register', async (req, res) => {
  try {
    const { apns_token, app_version, ios_version } = req.body || {}
    if (!apns_token) return res.status(400).json({ error: 'apns_token_required' })
    const r = await deviceState.registerApnsToken({ token: apns_token, app_version, ios_version })
    if (!r.ok) return res.status(500).json({ error: r.error || 'register_failed' })
    return res.json({ ok: true })
  } catch (err) {
    logger.error('native /devices/register: error', { error: err.message })
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---------- GET /recent ----------
// Thread mirror stores exchanges in channel-agnostic shape: {from, sender_name?, body, at}.
// iOS expects canonical Message shape: {id, direction, text, ts, source?, acked?}.
// from='tate'   -> direction='out' (sent from phone)
// from='ecodia' -> direction='in'  (reply received on phone)

function _toCanonicalMessage(exchange, idx) {
  if (!exchange || typeof exchange !== 'object') return null
  const id = exchange.id || exchange.at || `msg_${idx}`
  const direction = exchange.from === 'ecodia' ? 'in' : 'out'
  return {
    id,
    direction,
    text: String(exchange.body || ''),
    ts: exchange.at || new Date().toISOString(),
    source: exchange.source || 'chat',
    acked: exchange.acked === true,
  }
}

router.get('/recent', async (req, res) => {
  try {
    const since = req.query.since ? String(req.query.since) : null
    const rows = await db`SELECT value FROM kv_store WHERE key = ${NATIVE_MIRROR_KEY} LIMIT 1`
    if (!rows[0]) return res.json({ messages: [], next_cursor: null })
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    let messages = exchanges.map(_toCanonicalMessage).filter(Boolean)
    if (since) {
      const idx = messages.findIndex((m) => m.id === since)
      if (idx >= 0) messages = messages.slice(idx + 1)
    }
    const next_cursor = messages.length ? messages[messages.length - 1].id : null
    return res.json({ messages, next_cursor })
  } catch (err) {
    logger.error('native /recent: error', { error: err.message })
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---------- POST /messages/:id/ack ----------

router.post('/messages/:id/ack', async (req, res) => {
  try {
    const id = req.params.id
    const rows = await db`SELECT value FROM kv_store WHERE key = ${NATIVE_MIRROR_KEY} LIMIT 1`
    if (!rows[0]) return res.status(404).json({ error: 'no_thread' })
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    let found = false
    for (let i = 0; i < exchanges.length; i++) {
      const m = exchanges[i]
      const mid = m.id || m.at || `msg_${i}`
      if (mid === id) {
        exchanges[i] = { ...m, acked: true, acked_at: new Date().toISOString() }
        found = true
        break
      }
    }
    if (!found) return res.status(404).json({ error: 'message_not_found' })
    const value = JSON.stringify({ ...parsed, exchanges })
    await db`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${NATIVE_MIRROR_KEY}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    return res.json({ ok: true })
  } catch (err) {
    logger.error('native /messages/:id/ack: error', { error: err.message })
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---------- GET /tate-priority ----------

router.get('/tate-priority', async (_req, res) => {
  try {
    const rows = await db`
      SELECT id, name, status, next_action, next_action_by, last_touched
      FROM status_board
      WHERE tate_priority IS NOT NULL AND archived_at IS NULL
      ORDER BY tate_priority ASC
      LIMIT 3
    `
    return res.json({ items: rows })
  } catch (err) {
    if (/tate_priority/.test(err.message) || /column.*does not exist/i.test(err.message)) {
      return res.json({ items: [], stub: 'tate_priority column not yet migrated' })
    }
    logger.error('native /tate-priority: error', { error: err.message })
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---------- POST /tate-priority/set ----------

router.post('/tate-priority/set', async (req, res) => {
  try {
    const { ranked_ids } = req.body || {}
    const r = await tatePriorityCurator.set({ ranked_ids })
    if (!r.ok) return res.status(400).json(r)
    return res.json(r)
  } catch (err) {
    logger.error('native /tate-priority/set: error', { error: err.message })
    return res.status(500).json({ error: 'internal_error' })
  }
})

// ---------- POST /attachments/sign ----------
// Body: { filename: string, content_type: string, bytes: number }
// Returns: { put_url, signed_url, path, bytes }
// iOS Share Extension flow: client gets put_url, PUTs the file body to it with
// Content-Type matching content_type, then attaches signed_url to the envelope.

function _sanitizeFilename(name) {
  const base = String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return base || 'file'
}

router.post('/attachments/sign', async (req, res) => {
  try {
    const { filename, content_type, bytes } = req.body || {}
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename_required' })
    }
    if (!content_type || typeof content_type !== 'string') {
      return res.status(400).json({ error: 'content_type_required' })
    }
    const sizeNum = Number(bytes)
    if (!Number.isFinite(sizeNum) || sizeNum < 0 || sizeNum > ATTACHMENT_MAX_BYTES) {
      return res.status(400).json({ error: 'bytes_out_of_range', max: ATTACHMENT_MAX_BYTES })
    }

    const sb = getSupabase()
    if (!sb) {
      return res.status(503).json({ error: 'storage_unconfigured' })
    }

    const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const safeName = _sanitizeFilename(filename)
    const path = `native/${day}/${Date.now()}-${safeName}`

    // Ensure bucket exists (idempotent). Documents bucket already exists and is
    // public-read in prod (see src/routes/documents.js).
    await sb.storage.createBucket(ATTACHMENT_BUCKET, { public: true }).catch(() => {})

    const { data: putData, error: putErr } = await sb.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path)
    if (putErr || !putData?.signedUrl) {
      logger.error('native /attachments/sign: put url failed', { error: putErr?.message })
      return res.status(500).json({ error: 'put_url_failed', detail: putErr?.message })
    }

    // Bucket is public-read so getPublicUrl returns a URL that resolves once the
    // PUT lands. createSignedUrl is rejected pre-upload (object_not_found) so we
    // can't pre-sign a read URL; the public URL is the cleanest 1-roundtrip flow.
    const { data: pubData } = sb.storage
      .from(ATTACHMENT_BUCKET)
      .getPublicUrl(path)
    const readUrl = pubData?.publicUrl
    if (!readUrl) {
      logger.error('native /attachments/sign: public url derivation failed')
      return res.status(500).json({ error: 'signed_url_failed' })
    }

    return res.json({
      put_url: putData.signedUrl,
      signed_url: readUrl,
      path,
      bytes: sizeNum,
      ttl_seconds: SIGNED_READ_TTL_SECONDS,
    })
  } catch (err) {
    logger.error('native /attachments/sign: error', { error: err.message, stack: err.stack })
    return res.status(500).json({ error: 'internal_error', detail: err.message })
  }
})

module.exports = router

'use strict'

/**
 * POST /internal/ws-broadcast — accept a pre-built WS envelope from
 * ecodia-conductor and re-broadcast it to api's local WS clients.
 *
 * Why: in CONDUCTOR_DETACHED=true mode the SDK stream + osSessionService
 * + forkService all run in ecodia-conductor. They call wsManager.broadcast
 * locally, but the only connected FE WebSocket clients live in ecodia-api.
 * Without this bridge, every text_delta / fork status / os-session:complete
 * event in conductor is broadcast to zero local clients and silently lost.
 *
 * The envelope is already sequence-stamped, ts-stamped, redacted by the
 * conductor's wsManager. This endpoint trusts the envelope as-is and pumps
 * it directly into clients.send() via _deliverForwardedEnvelope().
 *
 * Auth: bearer using CONDUCTOR_LOOPBACK_SECRET (kv_store.creds.conductor_
 * loopback_secret). Same secret as the existing api → conductor proxy
 * direction — both processes already have it cached.
 *
 * Origin: fork_mp384bbz_f727f0 commit ebde29b shipped the read-side proxy
 * for /forks but the write-side fan-out for streaming events was never
 * wired. This is the missing half. 13 May 2026.
 */

const { Router } = require('express')
const crypto = require('crypto')
const logger = require('../config/logger')

const router = Router()

let _secretCache = null

async function _getSecret() {
  if (_secretCache) return _secretCache
  if (process.env.CONDUCTOR_LOOPBACK_SECRET) {
    _secretCache = process.env.CONDUCTOR_LOOPBACK_SECRET
    return _secretCache
  }
  const db = require('../config/db')
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.conductor_loopback_secret'`
  if (!rows.length) {
    throw new Error('CONDUCTOR_LOOPBACK_SECRET not found in kv_store')
  }
  const raw = rows[0].value
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = raw }
  _secretCache = typeof parsed === 'string' ? parsed : parsed?.value
  if (!_secretCache) throw new Error('CONDUCTOR_LOOPBACK_SECRET kv_store value missing .value')
  return _secretCache
}

function _checkBearer(authHeader, secret) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (token.length !== secret.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(secret, 'utf8'))
  } catch {
    return false
  }
}

router.post('/', async (req, res) => {
  let secret
  try {
    secret = await _getSecret()
  } catch (err) {
    logger.error('internalWsBroadcast: secret load failed', { error: err.message })
    return res.status(500).json({ error: 'secret_unavailable' })
  }

  if (!_checkBearer(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const envelope = req.body?.envelope
  if (!envelope || typeof envelope !== 'object' || !envelope.type) {
    return res.status(400).json({ error: 'envelope_required' })
  }

  try {
    const wsManager = require('../websocket/wsManager')
    if (typeof wsManager._deliverForwardedEnvelope !== 'function') {
      return res.status(500).json({ error: 'wsManager_missing_deliver' })
    }
    wsManager._deliverForwardedEnvelope(envelope)
    return res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('internalWsBroadcast: deliver failed', { error: err.message, type: envelope.type })
    return res.status(500).json({ error: 'deliver_failed', message: err.message })
  }
})

module.exports = router

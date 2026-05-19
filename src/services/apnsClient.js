'use strict'

/**
 * apnsClient.js
 *
 * Apple Push Notification service HTTP/2 client + ES256 JWT minting.
 * Used by notifyTate (alert payloads) and liveActivityPush (Live Activity
 * update payloads) for the ecodia-native iOS app.
 *
 * - Reuses ONE HTTP/2 client connection per process (api.push.apple.com).
 * - Caches the ES256 JWT for 50 minutes (Apple allows 60-min lifetime).
 * - Reads p8 + key_id + team_id from kv_store on first push; caches 10 min.
 * - Fail-soft: if APNs creds aren't provisioned yet, returns
 *   {status: 0, error: 'apns_not_provisioned'} so caller can fall back to SMS.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const http2 = require('node:http2')
const jwt = require('jsonwebtoken')
const db = require('../config/db')
const logger = require('../config/logger')

const APNS_HOST = 'https://api.push.apple.com'
const DEFAULT_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'au.ecodia.native'

let _client = null
let _clientHost = null

let _jwt = null
let _jwtIssuedAt = 0
const JWT_TTL_MS = 50 * 60 * 1000

let _credCache = null
let _credCacheAt = 0
const CRED_TTL_MS = 10 * 60 * 1000

async function _loadApnsCreds() {
  const now = Date.now()
  if (_credCache && now - _credCacheAt < CRED_TTL_MS) return _credCache
  try {
    const rows = await db`
      SELECT key, value FROM kv_store
      WHERE key IN ('creds.apple_apns_auth_key', 'creds.apple_apns_key_id', 'creds.apple_apns_team_id')
    `
    const map = {}
    for (const r of rows) {
      const raw = r.value
      map[r.key] = typeof raw === 'string' ? raw : (raw?.value || raw)
    }
    const authKeyB64 = map['creds.apple_apns_auth_key']
    const keyId = map['creds.apple_apns_key_id']
    const teamId = map['creds.apple_apns_team_id']
    if (!authKeyB64 || !keyId || !teamId) {
      _credCache = null
      _credCacheAt = now
      return null
    }
    const p8Pem = Buffer.from(authKeyB64, 'base64').toString('utf8')
    _credCache = { p8Pem, keyId, teamId }
    _credCacheAt = now
    return _credCache
  } catch (err) {
    logger.warn('apnsClient: cred load failed', { error: err.message })
    return null
  }
}

function buildJwt({ p8Pem, keyId, teamId }) {
  return jwt.sign({}, p8Pem, {
    algorithm: 'ES256',
    issuer: teamId,
    expiresIn: '50m',
    header: { alg: 'ES256', kid: keyId },
  })
}

async function _getJwt(creds) {
  const now = Date.now()
  if (_jwt && now - _jwtIssuedAt < JWT_TTL_MS) return _jwt
  _jwt = buildJwt({ p8Pem: creds.p8Pem, keyId: creds.keyId, teamId: creds.teamId })
  _jwtIssuedAt = now
  return _jwt
}

function _getClient(host = APNS_HOST) {
  if (_client && _clientHost === host && !_client.closed && !_client.destroyed) return _client
  if (_client) {
    try { _client.close() } catch {}
  }
  _client = http2.connect(host)
  _clientHost = host
  _client.on('error', (err) => {
    logger.warn('apnsClient: http2 error', { error: err.message })
  })
  _client.on('close', () => {
    _client = null
  })
  return _client
}

function urgencyToInterruptionLevel(u) {
  if (u === 'critical') return 'time-sensitive'
  if (u === 'alert') return 'active'
  return 'passive'
}

function buildAlertPayload({ body, urgency, message_id, deep_link }) {
  const level = urgencyToInterruptionLevel(urgency)
  const aps = {
    alert: { body: String(body || '') },
    'interruption-level': level,
  }
  if (urgency === 'critical' || urgency === 'alert') {
    aps.sound = 'default'
  }
  const payload = { aps }
  if (message_id) payload.message_id = message_id
  if (deep_link) payload.deep_link = deep_link
  return payload
}

function buildBackgroundPayload({ payload }) {
  return {
    aps: { 'content-available': 1 },
    payload: payload || {},
  }
}

function buildActivityPayload({ event, contentState, body, dismissalDate }) {
  const aps = {
    event,
    'content-state': contentState || {},
    timestamp: Math.floor(Date.now() / 1000),
  }
  if (body) aps.alert = { body: String(body) }
  if (dismissalDate) aps['dismissal-date'] = dismissalDate
  return { aps }
}

/**
 * Push a payload to APNs.
 *
 * @param {Object} args
 * @param {string} args.deviceToken - hex APNs device token
 * @param {Object} args.payload - APNs payload object
 * @param {string} [args.topic] - apns-topic (defaults to bundle id)
 * @param {string} [args.pushType] - apns-push-type: alert | background | liveactivity | voip
 * @param {number} [args.priority] - apns-priority: 5 | 10
 * @param {number} [args.expiration] - apns-expiration (unix seconds, 0 = no store)
 * @returns {Promise<{status: number, body?: any, error?: string}>}
 */
async function push({ deviceToken, payload, topic, pushType, priority, expiration }) {
  if (!deviceToken) return { status: 0, error: 'missing_device_token' }
  const creds = await _loadApnsCreds()
  if (!creds) return { status: 0, error: 'apns_not_provisioned' }

  const token = await _getJwt(creds)
  const client = _getClient()
  const path = `/3/device/${deviceToken}`
  const body = Buffer.from(JSON.stringify(payload || {}))

  const headers = {
    ':method': 'POST',
    ':path': path,
    'authorization': `bearer ${token}`,
    'content-type': 'application/json',
    'content-length': body.length,
    'apns-topic': topic || DEFAULT_BUNDLE_ID,
  }
  if (pushType) headers['apns-push-type'] = pushType
  if (typeof priority === 'number') headers['apns-priority'] = String(priority)
  if (typeof expiration === 'number') headers['apns-expiration'] = String(expiration)

  return new Promise((resolve) => {
    let settled = false
    const settle = (v) => { if (!settled) { settled = true; resolve(v) } }
    let stream
    try {
      stream = client.request(headers)
    } catch (err) {
      return settle({ status: 0, error: err.message })
    }
    stream.setTimeout(15000, () => {
      try { stream.close(http2.constants.NGHTTP2_CANCEL) } catch {}
      settle({ status: 0, error: 'timeout' })
    })
    let status = 0
    const chunks = []
    stream.on('response', (h) => { status = h[':status'] })
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      let parsed = null
      try { parsed = JSON.parse(text) } catch {}
      settle({ status, body: parsed || text })
    })
    stream.on('error', (err) => settle({ status: 0, error: err.message }))
    stream.write(body)
    stream.end()
  })
}

function _resetCachesForTest() {
  _jwt = null
  _jwtIssuedAt = 0
  _credCache = null
  _credCacheAt = 0
  if (_client) {
    try { _client.close() } catch {}
    _client = null
  }
}

module.exports = {
  push,
  buildAlertPayload,
  buildBackgroundPayload,
  buildActivityPayload,
  urgencyToInterruptionLevel,
  buildJwt,
  _resetCachesForTest,
}

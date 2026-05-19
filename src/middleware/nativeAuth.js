'use strict'

/**
 * nativeAuth.js
 *
 * Bearer gate for /api/native/* endpoints. Single shared bearer for Tate's
 * ecodia-native iOS app (single-user surface). Loaded from
 * kv_store.creds.tate_native_app_bearer with 5min in-memory cache.
 *
 * For local/test override, set TEST_NATIVE_BEARER env var.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const db = require('../config/db')

let cachedBearer = null
let cachedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function getBearer() {
  if (process.env.TEST_NATIVE_BEARER) return process.env.TEST_NATIVE_BEARER
  const now = Date.now()
  if (cachedBearer && now - cachedAt < CACHE_TTL_MS) return cachedBearer
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.tate_native_app_bearer' LIMIT 1`
  const raw = rows?.[0]?.value
  // kv_store.value is text; may be a raw string or a JSON-stringified value.
  let parsed = null
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
  } else if (raw && typeof raw === 'object') {
    parsed = raw
  }
  const v = typeof parsed === 'string' ? parsed : (parsed?.bearer || null)
  cachedBearer = v
  cachedAt = now
  return v
}

async function nativeAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_bearer' })
    const presented = auth.slice(7).trim()
    const expected = await getBearer()
    if (!expected || presented !== expected) return res.status(401).json({ error: 'invalid_bearer' })
    return next()
  } catch (err) {
    return res.status(500).json({ error: 'auth_internal_error' })
  }
}

// Test hook: reset cache between test cases.
function _resetCache() {
  cachedBearer = null
  cachedAt = 0
}

module.exports = { nativeAuth, _resetCache }

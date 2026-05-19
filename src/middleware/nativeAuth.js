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
  const now = Date.now()
  if (cachedBearer && now - cachedAt < CACHE_TTL_MS) return cachedBearer
  if (process.env.TEST_NATIVE_BEARER) return process.env.TEST_NATIVE_BEARER
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.tate_native_app_bearer' LIMIT 1`
  const raw = rows?.[0]?.value
  // jsonb decode: string -> raw string; object -> {bearer: '...'}; fallback identity
  const v = typeof raw === 'string' ? raw : (raw?.bearer || raw)
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

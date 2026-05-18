/**
 * ecodia-full MCP - bearer auth middleware.
 *
 * Reads `Authorization: Bearer <token>`, looks up the canonical token in
 * `kv_store.creds.ecodia_full_mcp_bearer.token`, constant-time compares, and
 * attaches `req.ecodiaFullScopes` (array) on success. 401 on miss.
 *
 * Parallel to coworkAuth - separate kv_store key + separate scope namespace.
 * The cowork bearer continues to work against /api/mcp/cowork unchanged.
 *
 * Spec: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §2 + §6.
 * Authored: 15 May 2026 (Lane E of VPS-to-local migration).
 */
'use strict'

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const CACHE_TTL_MS = 60_000

let _cached = null
let _cachedAt = 0

async function _fetchBearerRow() {
  if (_cached && Date.now() - _cachedAt < CACHE_TTL_MS) return _cached
  try {
    const [row] = await db`
      SELECT value FROM kv_store WHERE key = 'creds.ecodia_full_mcp_bearer'
    `
    let parsed = null
    if (row?.value) {
      if (typeof row.value === 'string') {
        try { parsed = JSON.parse(row.value) }
        catch (parseErr) {
          logger.warn('ecodiaFullAuth: bearer row value not parseable JSON', { error: parseErr.message })
          parsed = null
        }
      } else {
        parsed = row.value
      }
    }
    _cached = parsed
    _cachedAt = Date.now()
    return _cached
  } catch (err) {
    logger.warn('ecodiaFullAuth: kv_store fetch failed', { error: err.message })
    return null
  }
}

function _clearCache() {
  _cached = null
  _cachedAt = 0
}

function _safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

function bearerFingerprint(token) {
  if (typeof token !== 'string' || !token) return null
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)
}

async function ecodiaFullAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_bearer', message: 'Authorization: Bearer <token> required' })
  }
  const token = header.slice(7)

  const row = await _fetchBearerRow()
  if (!row || !row.token) {
    logger.warn('ecodiaFullAuth: bearer row missing or malformed in kv_store')
    return res.status(401).json({ error: 'bearer_unconfigured', message: 'ecodia-full bearer not provisioned' })
  }

  if (!_safeEq(token, row.token)) {
    return res.status(401).json({ error: 'invalid_bearer', message: 'token does not match' })
  }

  req.ecodiaFullScopes = Array.isArray(row.scopes) ? row.scopes : []
  req.ecodiaFullBearerFingerprint = bearerFingerprint(token)
  req.ecodiaFullBearerRow = row
  next()
}

module.exports = ecodiaFullAuth
module.exports.bearerFingerprint = bearerFingerprint
module.exports._clearCache = _clearCache
module.exports._safeEq = _safeEq

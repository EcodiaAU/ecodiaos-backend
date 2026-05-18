/**
 * Domain-scoped MCP connector - bearer auth middleware factory.
 *
 * Returns a middleware bound to a specific connector that reads
 * `Authorization: Bearer <token>` and constant-time compares against the
 * connector's bearer row at kv_store.<connector.bearerKey>. On success,
 * attaches:
 *   req.connectorName       = connector.name (e.g. 'ecodia-core')
 *   req.connectorScopes     = scopes array from the bearer row
 *   req.connectorBearerFingerprint
 *   req.connectorBearerRow  = the full bearer row
 *   req.ecodiaFullScopes    = (mirror) so reused cowork-router synthetic
 *                             dispatch passes scope checks transparently
 *   req.ecodiaFullBearerFingerprint = (mirror) for audit symmetry
 *
 * Mirrors ecodiaFullAuth's shape so cowork V2 tool dispatch via the
 * existing ecodiaFullMcpShim._dispatchCoworkTool path is a drop-in.
 *
 * Spec: migration-lanes/phase2/10-domain-scoped-mcp-connectors.md §10.2.
 * Authored: 15 May 2026.
 */
'use strict'

const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

const CACHE_TTL_MS = 60_000

// Per-bearerKey cache so each connector has its own slot
const _cache = new Map() // bearerKey -> { row, fetchedAt }

async function _fetchBearerRow(bearerKey) {
  const slot = _cache.get(bearerKey)
  if (slot && Date.now() - slot.fetchedAt < CACHE_TTL_MS) return slot.row
  try {
    const [row] = await db`SELECT value FROM kv_store WHERE key = ${bearerKey}`
    let parsed = null
    if (row?.value) {
      if (typeof row.value === 'string') {
        try { parsed = JSON.parse(row.value) }
        catch (parseErr) {
          logger.warn('connectorAuth: bearer row not parseable JSON', { bearerKey, error: parseErr.message })
        }
      } else {
        parsed = row.value
      }
    }
    _cache.set(bearerKey, { row: parsed, fetchedAt: Date.now() })
    return parsed
  } catch (err) {
    logger.warn('connectorAuth: kv_store fetch failed', { bearerKey, error: err.message })
    return null
  }
}

function _clearCache(bearerKey) {
  if (bearerKey) _cache.delete(bearerKey)
  else _cache.clear()
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

function makeConnectorAuth(connector) {
  if (!connector || !connector.bearerKey || !connector.name) {
    throw new Error('makeConnectorAuth: connector must have { name, bearerKey }')
  }
  return async function connectorAuth(req, res, next) {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_bearer',
        message: `Authorization: Bearer <token> required for ${connector.name}`,
      })
    }
    const token = header.slice(7)
    const row = await _fetchBearerRow(connector.bearerKey)
    if (!row || !row.token) {
      return res.status(401).json({
        error: 'bearer_unconfigured',
        message: `${connector.name} bearer not provisioned at kv_store.${connector.bearerKey}`,
      })
    }
    if (!_safeEq(token, row.token)) {
      return res.status(401).json({
        error: 'invalid_bearer',
        message: `token does not match ${connector.name}`,
      })
    }
    const scopes = Array.isArray(row.scopes) ? row.scopes : []
    const fp = bearerFingerprint(token)
    req.connectorName = connector.name
    req.connectorScopes = scopes
    req.connectorBearerFingerprint = fp
    req.connectorBearerRow = row
    // Mirror onto ecodia-full shape so reused dispatch helpers stay happy.
    req.ecodiaFullScopes = scopes
    req.ecodiaFullBearerFingerprint = fp
    req.ecodiaFullBearerRow = row
    next()
  }
}

module.exports = makeConnectorAuth
module.exports.bearerFingerprint = bearerFingerprint
module.exports._clearCache = _clearCache
module.exports._safeEq = _safeEq

const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const env = require('../config/env')

function _constTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' })
  }

  const token = header.slice(7)

  // Internal MCP servers use a static long-lived token (MCP_INTERNAL_TOKEN
  // env var). Compared via timingSafeEqual to avoid theoretical timing
  // disclosure of the bearer (audit 2026-05-13 H-2).
  if (env.MCP_INTERNAL_TOKEN && _constTimeEqual(token, env.MCP_INTERNAL_TOKEN)) {
    req.user = { id: 'internal', role: 'internal' }
    return next()
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    // Audit 2026-05-13 H-6: refresh tokens were verifying fine on every
    // endpoint because no caller distinguished them from access tokens.
    // Refuse any token that explicitly marks itself as a refresh token at
    // the access-token chokepoint. /api/auth/refresh validates this flag
    // itself and is the only place refresh tokens are accepted.
    if (decoded && decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Refresh token cannot be used for access' })
    }
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = authMiddleware

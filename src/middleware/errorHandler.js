const logger = require('../config/logger')

// Credential pre-emit filter — wired into log surfaces (osConversationLog,
// wsManager) per SECURITY_HARDENING §5.1. Audit 2026-05-13 P0 H-4 flagged
// errorHandler as the missing surface: full err.message + err.response.data
// (upstream payload) was being returned to clients. Combined with the
// unauthenticated route surface (now closed in Batch 1), this leaked DB
// schema info and partial Anthropic / Supabase / Twilio 401 bodies which
// sometimes echo auth headers. Filter the body before emit.
let _redactor = null
function _redact(s) {
  if (typeof s !== 'string') return s
  if (!_redactor) {
    try { _redactor = require('../lib/credentialFilter') } catch { _redactor = { redact: (x) => x } }
  }
  try { return _redactor.redact(s) } catch { return s }
}

// Recursively redact strings inside an object. Bounded depth, bounded
// per-string length (a single upstream stack trace can be 100K+; trim).
function _scrubObject(value, depth = 0) {
  if (depth > 4 || value == null) return value
  if (typeof value === 'string') {
    const trimmed = value.length > 1000 ? value.slice(0, 1000) + '… (truncated)' : value
    return _redact(trimmed)
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => _scrubObject(v, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).slice(0, 50)) out[k] = _scrubObject(value[k], depth + 1)
    return out
  }
  return value
}

function errorHandler(err, req, res, _next) {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method })

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation error', details: err.flatten().fieldErrors })
  }

  const status = err.status || err.statusCode || 500

  // Single-user admin system; we want useful errors back. But:
  //   1. Run the message + upstream payload through the credential filter.
  //   2. Trim large strings (upstream stack dumps).
  //   3. Never echo Authorization-class headers (axios includes them on
  //      err.config.headers — we don't expose err.config at all).
  const message = _redact(err.message || 'Internal server error')
  const body = { error: message }
  if (err.response?.data !== undefined) {
    body.upstream = _scrubObject(err.response.data)
  }
  res.status(status).json(body)
}

module.exports = errorHandler

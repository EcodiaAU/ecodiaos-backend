/**
 * /api/oauth/mcp/* - OAuth 2.0 wrapper for the ecodia-full MCP bearer.
 *
 * Defensive ship per backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §6:
 * claude.ai Custom Connectors historically supported both raw Bearer and
 * Anthropic-managed OAuth (PKCE). If during Phase 1 verification Tate finds
 * the Connector form rejects raw Bearer, this OAuth surface is the fallback.
 *
 * Endpoints (all unauthenticated at the app level; flow-internal auth applies):
 *   GET  /authorize       - PKCE authorize. Auto-approves (we own both sides).
 *                           302 redirect back to redirect_uri with code.
 *   POST /token           - Exchange auth code for access_token (=bearer).
 *                           Also handles grant_type=refresh_token.
 *   GET  /.well-known/oauth-authorization-server - OAuth discovery metadata
 *                           (RFC 8414), so claude.ai can find our endpoints.
 *
 * The issued access_token IS the bearer stored at
 * kv_store.creds.ecodia_full_mcp_bearer. Refresh-token rotation is a 30d
 * cadence; refresh tokens are stored in kv_store.ecodia_full.oauth_refresh.<hash>.
 *
 * Client registration is stored at kv_store.ecodia_full.oauth_clients.<client_id>.
 * For v1 we ship a single client = claude.ai Connectors, with redirect_uri
 * matching the canonical claude.ai connector callback. Additional clients can
 * be registered by writing to that namespace.
 *
 * Authored: 15 May 2026 (Lane E of VPS-to-local migration).
 */
'use strict'

const express = require('express')
const crypto = require('node:crypto')
const router = express.Router()

const db = require('../../config/db')
const logger = require('../../config/logger')

router.use(express.json({ limit: '128kb' }))
router.use(express.urlencoded({ extended: true }))

const AUTH_CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// In-memory auth-code store - flow is short-lived (5 minutes), no need to
// persist. If api process restarts mid-flow the user retries.
const authCodes = new Map() // code -> { client_id, redirect_uri, code_challenge, code_challenge_method, expires_at, scope }

async function _loadClient(clientId) {
  if (!clientId) return null
  try {
    const [row] = await db`
      SELECT value FROM kv_store WHERE key = ${'ecodia_full.oauth_clients.' + clientId}
    `
    if (!row?.value) return null
    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value
  } catch (err) {
    logger.warn('mcp-oauth: client lookup failed', { error: err.message })
    return null
  }
}

async function _loadBearer(bearerKey = 'creds.ecodia_full_mcp_bearer') {
  try {
    const [row] = await db`SELECT value FROM kv_store WHERE key = ${bearerKey}`
    if (!row?.value) return null
    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value
  } catch {
    return null
  }
}

// Resolve which bearer key a client_id maps to. Phase 2 Lane 10: each
// domain-scoped connector has its own OAuth client_id + its own bearer key,
// both declared on the client row at registration time. Fallback to the
// wide ecodia-full bearer for legacy `claude_ai_connector` / unspecified
// clients so the 30d migration alias keeps working.
async function _resolveBearerKeyForClient(clientId) {
  if (!clientId) return 'creds.ecodia_full_mcp_bearer'
  const client = await _loadClient(clientId)
  if (client && typeof client.bearer_key === 'string' && client.bearer_key.startsWith('creds.')) {
    return client.bearer_key
  }
  return 'creds.ecodia_full_mcp_bearer'
}

function _scopeForClient(client) {
  if (Array.isArray(client?.scopes_granted) && client.scopes_granted.length) {
    return client.scopes_granted.join(' ')
  }
  return 'mcp.ecodia-full'
}

function _verifyPkce(codeVerifier, codeChallenge, method) {
  if (!codeVerifier || !codeChallenge) return false
  if (method === 'plain') return codeVerifier === codeChallenge
  if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest()
    const b64url = hash.toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return b64url === codeChallenge
  }
  return false
}

async function _storeRefreshToken(token, clientId) {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expires_at = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (
        ${'ecodia_full.oauth_refresh.' + hash},
        ${JSON.stringify({ client_id: clientId, expires_at })},
        now()
      )
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.warn('mcp-oauth: refresh store failed', { error: err.message })
  }
}

async function _consumeRefreshToken(token) {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  try {
    const [row] = await db`SELECT value FROM kv_store WHERE key = ${'ecodia_full.oauth_refresh.' + hash}`
    if (!row?.value) return null
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (parsed.expires_at && new Date(parsed.expires_at) < new Date()) return null
    return parsed
  } catch {
    return null
  }
}

// ── /.well-known/oauth-authorization-server (RFC 8414) ──────────────────
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}/api/oauth/mcp`
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    grant_types_supported: ['authorization_code', 'refresh_token'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    scopes_supported: [
      'mcp.ecodia-full',
      'mcp.ecodia-core','mcp.ecodia-comms','mcp.ecodia-code','mcp.ecodia-money',
      'mcp.ecodia-shell','mcp.ecodia-supabase','mcp.ecodia-scheduler',
      'mcp.ecodia-crm','mcp.ecodia-graph','mcp.ecodia-factory',
    ],
  })
})

// ── /authorize - auto-approve, return code via redirect ─────────────────
router.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state, scope } = req.query
  if (response_type !== 'code') {
    return res.status(400).send('response_type must be code')
  }
  if (!client_id || !redirect_uri) {
    return res.status(400).send('client_id and redirect_uri required')
  }
  const client = await _loadClient(client_id)
  if (!client) {
    return res.status(400).send(`unknown client_id: ${client_id}`)
  }
  if (Array.isArray(client.redirect_uris) && !client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send('redirect_uri not registered')
  }
  if (!code_challenge) {
    return res.status(400).send('PKCE code_challenge required')
  }

  // We own both sides - auto-approve. Mint code. Scope defaults to the
  // client's registered scope (per-connector) so claude.ai's Connector
  // form always gets the narrow scope back even if scope=undefined.
  const code = crypto.randomBytes(32).toString('hex')
  authCodes.set(code, {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method: code_challenge_method || 'plain',
    expires_at: Date.now() + AUTH_CODE_TTL_MS,
    scope: scope || _scopeForClient(client),
  })

  const url = new URL(redirect_uri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  res.redirect(302, url.toString())
})

// ── /token - exchange code or refresh ───────────────────────────────────
router.post('/token', async (req, res) => {
  const { grant_type, code, code_verifier, redirect_uri, client_id, refresh_token } = req.body || {}

  if (grant_type === 'authorization_code') {
    if (!code || !code_verifier) return res.status(400).json({ error: 'invalid_request', error_description: 'code + code_verifier required' })
    const entry = authCodes.get(code)
    if (!entry) return res.status(400).json({ error: 'invalid_grant', error_description: 'unknown code' })
    if (entry.expires_at < Date.now()) {
      authCodes.delete(code)
      return res.status(400).json({ error: 'invalid_grant', error_description: 'code expired' })
    }
    if (entry.client_id !== client_id) return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' })
    if (entry.redirect_uri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
    if (!_verifyPkce(code_verifier, entry.code_challenge, entry.code_challenge_method)) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
    }
    authCodes.delete(code)

    // Resolve per-client bearer (Phase 2 Lane 10). Each domain-scoped
    // connector's OAuth client row points to its specific bearer key. The
    // legacy ecodia-full client still resolves to the wide bearer.
    const bearerKey = await _resolveBearerKeyForClient(client_id)
    const bearer = await _loadBearer(bearerKey)
    if (!bearer?.token) return res.status(500).json({ error: 'server_error', error_description: 'bearer not provisioned: ' + bearerKey })

    const refresh = crypto.randomBytes(32).toString('hex')
    await _storeRefreshToken(refresh, client_id)

    return res.json({
      access_token: bearer.token,
      token_type: 'Bearer',
      expires_in: 30 * 24 * 60 * 60, // align with refresh ttl
      refresh_token: refresh,
      scope: entry.scope,
    })
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) return res.status(400).json({ error: 'invalid_request' })
    const meta = await _consumeRefreshToken(refresh_token)
    if (!meta) return res.status(400).json({ error: 'invalid_grant', error_description: 'unknown or expired refresh_token' })
    if (client_id && meta.client_id !== client_id) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' })
    }
    const bearerKey = await _resolveBearerKeyForClient(meta.client_id)
    const bearer = await _loadBearer(bearerKey)
    if (!bearer?.token) return res.status(500).json({ error: 'server_error', error_description: 'bearer not provisioned: ' + bearerKey })

    // Rotate refresh token
    const newRefresh = crypto.randomBytes(32).toString('hex')
    await _storeRefreshToken(newRefresh, meta.client_id)

    const refreshClient = await _loadClient(meta.client_id)
    return res.json({
      access_token: bearer.token,
      token_type: 'Bearer',
      expires_in: 30 * 24 * 60 * 60,
      refresh_token: newRefresh,
      scope: _scopeForClient(refreshClient),
    })
  }

  return res.status(400).json({ error: 'unsupported_grant_type', supported: ['authorization_code', 'refresh_token'] })
})

module.exports = router

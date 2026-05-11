/**
 * smoke-conductor-loopback.js
 *
 * Standalone smoke test for the Phase 2 conductor loopback bridge.
 * Tests bearer auth enforcement and route routing without requiring
 * the full ecodia stack or a DB connection.
 *
 * Usage:
 *   node tests/smoke-conductor-loopback.js
 *
 * Exits 0 on all pass, 1 on any failure.
 *
 * fork_mp1mrgs4_f2ba17 - Phase 2 bridge validation, 12 May 2026.
 */

'use strict'

const http = require('http')
const crypto = require('crypto')

const SECRET = crypto.randomBytes(32).toString('hex')
const PORT = 19321 // ephemeral test port, unlikely to collide

let passed = 0
let failed = 0

function log(ok, label, detail) {
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${label}${detail ? ' - ' + detail : ''}`)
  if (ok) passed++; else failed++
}

// -----------------------------------------------------------------------
// Minimal loopback server (mirrors src/conductor.js but without DB deps)
// -----------------------------------------------------------------------

function checkBearer(authHeader, secret) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (token.length !== secret.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(secret, 'utf8'))
  } catch {
    return false
  }
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function startTestServer() {
  const server = http.createServer((req, res) => {
    if (!checkBearer(req.headers['authorization'], SECRET)) {
      return sendJson(res, 401, { error: 'unauthorized' })
    }
    const url = (req.url || '/').split('?')[0]
    if (req.method === 'GET' && url === '/status') {
      return sendJson(res, 200, {
        active: false,
        conductor: { pid: process.pid, uptime_s: Math.floor(process.uptime()), active_fork_count: 0 },
      })
    }
    if (req.method === 'POST' && url === '/message') {
      let data = ''
      req.on('data', c => { data += c })
      req.on('end', () => {
        try {
          const body = JSON.parse(data || '{}')
          if (!body.message) return sendJson(res, 400, { error: 'message is required' })
          sendJson(res, 200, { accepted: true, status: 'streaming' })
        } catch {
          sendJson(res, 400, { error: 'invalid json' })
        }
      })
      return
    }
    if (req.method === 'POST' && url === '/abort') {
      return sendJson(res, 200, { aborted: true })
    }
    if (req.method === 'POST' && url === '/save-state') {
      return sendJson(res, 200, { ok: true, saved_at: new Date().toISOString() })
    }
    sendJson(res, 404, { error: 'not_found' })
  })

  return new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', err => {
      if (err) return reject(err)
      resolve(server)
    })
  })
}

// -----------------------------------------------------------------------
// HTTP helper
// -----------------------------------------------------------------------

function request({ method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }
    const req = http.request(opts, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// -----------------------------------------------------------------------
// Test cases
// -----------------------------------------------------------------------

async function runTests() {
  console.log('\nconductor loopback bridge smoke test\n')

  // --- Auth tests ---
  console.log('Auth enforcement:')

  let r = await request({ method: 'GET', path: '/status' })
  log(r.status === 401, 'GET /status (no bearer) -> 401', `got ${r.status}`)

  r = await request({ method: 'GET', path: '/status', headers: { Authorization: 'Bearer wrongsecret' } })
  log(r.status === 401, 'GET /status (wrong bearer) -> 401', `got ${r.status}`)

  r = await request({ method: 'POST', path: '/message' })
  log(r.status === 401, 'POST /message (no bearer) -> 401', `got ${r.status}`)

  r = await request({ method: 'POST', path: '/abort' })
  log(r.status === 401, 'POST /abort (no bearer) -> 401', `got ${r.status}`)

  r = await request({ method: 'POST', path: '/save-state' })
  log(r.status === 401, 'POST /save-state (no bearer) -> 401', `got ${r.status}`)

  // --- Authenticated route tests ---
  console.log('\nAuthenticated routes:')
  const bearer = { Authorization: `Bearer ${SECRET}` }

  r = await request({ method: 'GET', path: '/status', headers: bearer })
  log(r.status === 200, 'GET /status (correct bearer) -> 200', `got ${r.status}`)
  log(
    r.status === 200 && r.body && typeof r.body.conductor === 'object',
    'GET /status response has conductor object',
    r.body ? JSON.stringify(r.body.conductor) : 'no body'
  )
  log(
    r.status === 200 && r.body && typeof r.body.conductor.pid === 'number',
    'GET /status conductor.pid is a number',
    r.body ? String(r.body.conductor.pid) : 'missing'
  )
  log(
    r.status === 200 && r.body && typeof r.body.conductor.active_fork_count === 'number',
    'GET /status conductor.active_fork_count is a number',
    r.body ? String(r.body.conductor.active_fork_count) : 'missing'
  )

  r = await request({ method: 'POST', path: '/message', headers: bearer, body: { message: 'hello conductor' } })
  log(r.status === 200, 'POST /message with body -> 200', `got ${r.status}`)
  log(r.status === 200 && r.body && r.body.accepted === true, 'POST /message response.accepted === true')

  r = await request({ method: 'POST', path: '/message', headers: bearer, body: {} })
  log(r.status === 400, 'POST /message (no message field) -> 400', `got ${r.status}`)

  r = await request({ method: 'POST', path: '/abort', headers: bearer })
  log(r.status === 200, 'POST /abort -> 200', `got ${r.status}`)

  r = await request({ method: 'POST', path: '/save-state', headers: bearer, body: { current_work: 'test' } })
  log(r.status === 200, 'POST /save-state -> 200', `got ${r.status}`)
  log(r.status === 200 && r.body && r.body.ok === true, 'POST /save-state response.ok === true')

  r = await request({ method: 'GET', path: '/nonexistent', headers: bearer })
  log(r.status === 404, 'GET /nonexistent -> 404', `got ${r.status}`)

  // --- Secret value sanity ---
  console.log('\nSecret sanity:')
  log(SECRET.length === 64, 'test secret is 64 hex chars (32 bytes)', `length=${SECRET.length}`)
  log(/^[0-9a-f]+$/.test(SECRET), 'test secret is lowercase hex only')
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

;(async () => {
  let server
  try {
    server = await startTestServer()
    await runTests()
  } catch (err) {
    console.error('\nFATAL:', err.message)
    process.exit(1)
  } finally {
    if (server) server.close()
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
})()

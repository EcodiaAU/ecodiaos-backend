'use strict'

/**
 * resident-brain-server.js (2026-05-24)
 *
 * Long-lived `claude` subprocess driven via stream-json stdin/stdout. Replaces
 * the per-turn `claude --print` spawn that gave the away-conductor its 60-120s
 * latency. With the persistent subprocess, warm-turn latency drops to ~10-17s.
 *
 * Empirically verified 2026-05-24 (drafts/test-persistent-claude.js):
 *   - Multi-message protocol works: subprocess accepts prompts on stdin
 *     continuously, returns responses on stdout JSON-Lines.
 *   - Session continuity works: model remembers prior turns within the
 *     subprocess lifetime.
 *   - Cold start: ~58s (hook + MCP + doctrine load + first cache create)
 *   - Warm turn: ~17s for haiku (longer for larger context, but no respawn)
 *
 * Per spec backend/drafts/voice-fast-and-intelligent-2026-05-24.md §3.2
 * + research backend/drafts/persistent-claude-session-feasibility-2026-05-24.md.
 *
 * Architecture:
 *   - One subprocess per resident-brain instance
 *   - HTTP /prompt endpoint accepts {body, thread_id, source, idempotency_key?}
 *   - Sends formatted prompt via stdin JSON message
 *   - Reads stdout JSON-Lines, accumulates assistant message content
 *   - Returns extracted <REPLY> block
 *   - Serializes requests (subprocess is single-threaded)
 *   - Resets subprocess every 24h OR after 50 turns to prevent context bloat
 *   - Auth selectable: AUTH=oauth (default, subscription rate) or AUTH=paid (ANTHROPIC_API_KEY)
 */

const express = require('express')
const { spawn } = require('child_process')
const readline = require('readline')
const { randomUUID } = require('crypto')

const PORT = parseInt(process.env.RESIDENT_BRAIN_PORT || '7463', 10)
const CWD = process.env.RESIDENT_BRAIN_CWD || 'D:/.code/EcodiaOS/backend'
const CLAUDE_BIN = process.env.RESIDENT_BRAIN_CLAUDE || 'D:/SSD_Turbo/node-global/claude.cmd'
const MODEL = process.env.RESIDENT_BRAIN_MODEL || 'sonnet'
const AUTH_MODE = process.env.RESIDENT_BRAIN_AUTH || 'oauth'  // 'oauth' | 'paid'
const SESSION_RESET_HOURS = parseFloat(process.env.RESIDENT_BRAIN_SESSION_HOURS || '24')
const SESSION_RESET_TURNS = parseInt(process.env.RESIDENT_BRAIN_SESSION_TURNS || '50', 10)
const TURN_TIMEOUT_MS = parseInt(process.env.RESIDENT_BRAIN_TURN_TIMEOUT_MS || '180000', 10)
const TOKEN = process.env.RESIDENT_BRAIN_TOKEN || null

function log(...a) { console.log(`[resident-brain ${new Date().toISOString()}]`, ...a) }

// ===== Subprocess state =====

let _child = null
let _rl = null
let _sessionId = null
let _sessionStartedAt = 0
let _turnsThisSession = 0
let _booting = false
let _bootReady = null  // resolves when subprocess is ready for first prompt

// Per-turn state
let _activeTurn = null  // { resolve, reject, assistantText, startedAt, idempotency_key }
const _queue = []
let _draining = false

// Per-request idempotency cache (10 min TTL)
const _idemCache = new Map()
const IDEM_TTL_MS = 10 * 60 * 1000
function _idemGet(k) {
  if (!k) return null
  const e = _idemCache.get(k)
  if (!e) return null
  if (Date.now() - e.at > IDEM_TTL_MS) { _idemCache.delete(k); return null }
  return e.result
}
function _idemSet(k, result) {
  if (!k) return
  _idemCache.set(k, { at: Date.now(), result })
  if (_idemCache.size > 500) { _idemCache.delete(_idemCache.keys().next().value) }
}

// ===== Subprocess lifecycle =====

function _shouldReset() {
  if (!_child) return true
  const ageHours = (Date.now() - _sessionStartedAt) / 3600000
  return ageHours >= SESSION_RESET_HOURS || _turnsThisSession >= SESSION_RESET_TURNS
}

async function _bootSubprocess() {
  if (_booting) return _bootReady
  _booting = true
  _bootReady = new Promise((resolveReady) => {
    _sessionId = randomUUID()
    _sessionStartedAt = Date.now()
    _turnsThisSession = 0
    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--replay-user-messages',
      '--model', MODEL,
      '--dangerously-skip-permissions',
      '--session-id', _sessionId,
    ]
    const env = { ...process.env }
    // For OAuth path: rely on existing CLAUDE_CODE_OAUTH_TOKEN_* in env.
    // For paid path: ensure ANTHROPIC_API_KEY is set; strip OAuth so claude uses API key.
    if (AUTH_MODE === 'paid') {
      delete env.CLAUDE_CODE_OAUTH_TOKEN
      delete env.CLAUDE_CODE_OAUTH_TOKEN_TATE
      delete env.CLAUDE_CODE_OAUTH_TOKEN_CODE
      delete env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
      if (!env.ANTHROPIC_API_KEY) log('WARN: AUTH=paid but ANTHROPIC_API_KEY not set; subprocess will fail')
    } else {
      delete env.ANTHROPIC_API_KEY
    }
    log(`booting subprocess: model=${MODEL} auth=${AUTH_MODE} session=${_sessionId}`)
    _child = spawn(CLAUDE_BIN, args, {
      cwd: CWD,
      env,
      shell: process.platform === 'win32',
    })
    _rl = readline.createInterface({ input: _child.stdout })
    _rl.on('line', _onStdoutLine)
    _child.stderr.on('data', (d) => log('STDERR:', d.toString().slice(0, 300)))
    _child.on('error', (err) => log('subprocess error:', err.message))
    _child.on('exit', (code, signal) => {
      log(`subprocess exited code=${code} signal=${signal} after ${_turnsThisSession} turns`)
      _child = null
      _rl = null
      if (_activeTurn) {
        _activeTurn.reject(new Error(`subprocess died mid-turn (code=${code})`))
        _activeTurn = null
      }
    })
    // Resolve when we see the first 'system init' message, meaning claude is ready
    const initListener = (msg) => {
      if (msg.type === 'system' && msg.subtype === 'init') {
        log('subprocess ready for first prompt')
        resolveReady()
        _removeInitListener = null
      }
    }
    _removeInitListener = initListener
    _booting = false
  })
  return _bootReady
}

let _removeInitListener = null

function _onStdoutLine(line) {
  if (!line.trim()) return
  let m
  try { m = JSON.parse(line) } catch { return }

  if (_removeInitListener) _removeInitListener(m)

  if (!_activeTurn) {
    // Stray message between turns; ignore
    return
  }

  if (m.type === 'assistant' && m.message) {
    const blocks = Array.isArray(m.message.content) ? m.message.content : []
    for (const b of blocks) {
      if (b.type === 'text' && b.text) {
        _activeTurn.assistantText += b.text
      }
    }
  } else if (m.type === 'result') {
    // Turn complete. Extract <REPLY> from accumulated assistant text.
    const reply = _extractReply(_activeTurn.assistantText)
    const dur = Date.now() - _activeTurn.startedAt
    _turnsThisSession++
    log(`turn ${_turnsThisSession} done dur=${dur}ms reply_chars=${reply ? reply.length : 0} cost=${m.cost_usd || '?'}`)
    const turn = _activeTurn
    _activeTurn = null
    turn.resolve({
      ok: !!reply,
      reply,
      duration_ms: dur,
      usage: m.usage || null,
      cost_usd: m.cost_usd || null,
      turn_count: _turnsThisSession,
    })
  } else if (m.type === 'rate_limit_event' || (m.type === 'system' && m.subtype === 'rate_limit')) {
    log('rate_limit event:', JSON.stringify(m).slice(0, 200))
  }
}

function _extractReply(text) {
  if (!text) return null
  const m = String(text).match(/<REPLY>([\s\S]*?)<\/REPLY>/i)
  if (m && m[1]) {
    const t = m[1].trim()
    return t.length ? t : null
  }
  return null
}

function _killSubprocess() {
  if (_child) {
    try { _child.kill() } catch {}
    _child = null
    _rl = null
  }
}

// ===== Prompt build =====

function _buildPrompt({ body, thread_id, source, thread_context, case_id, voice_call_id }) {
  const ch = source || 'native'
  const ctxBlock = thread_context
    ? `\nRECENT CONVERSATION ACROSS ALL CHANNELS (oldest first, most recent last):\n${thread_context}\n`
    : ''
  const caseBlock = case_id
    ? `\nCASE ${case_id}: in-flight case being resolved. When you finish, your <REPLY> IS the answer. The parent process handles state writes.\n`
    : ''
  return `You are EcodiaOS handling an inbound from Tate over the ${ch} channel. Full CLAUDE.md doctrine + local repo + MCP loaded. Do the work using any tool you have. If you change code, commit + push to origin.
${ctxBlock}${caseBlock}
INBOUND (channel=${ch}, thread_id=${thread_id || 'tate'}):
"""
${body}
"""

Your ONLY reply channel is the <REPLY> block. Wrap your final reply as <REPLY>your-tight-reply</REPLY>. Tight, Tate's voice, no filler, no internal narration ("episode logged" banned), no emojis, no em-dashes.`
}

// ===== Turn dispatch =====

async function dispatchTurn(req) {
  if (req.idempotency_key) {
    const cached = _idemGet(req.idempotency_key)
    if (cached) return { ...cached, idempotent_replay: true }
  }
  return new Promise((resolve, reject) => {
    _queue.push({ req, resolve, reject })
    _drain()
  })
}

async function _drain() {
  if (_draining) return
  _draining = true
  try {
    while (_queue.length) {
      const item = _queue.shift()
      try {
        const result = await _runTurn(item.req)
        if (item.req.idempotency_key) _idemSet(item.req.idempotency_key, result)
        item.resolve(result)
      } catch (err) {
        item.reject(err)
      }
    }
  } finally {
    _draining = false
  }
}

async function _runTurn(req) {
  if (_shouldReset()) {
    log('session reset triggered')
    _killSubprocess()
  }
  if (!_child) await _bootSubprocess()
  if (!_child) throw new Error('subprocess not running')

  const prompt = _buildPrompt(req)
  const stdinMsg = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: prompt },
  }) + '\n'

  const turnP = new Promise((resolve, reject) => {
    _activeTurn = {
      resolve, reject,
      assistantText: '',
      startedAt: Date.now(),
      idempotency_key: req.idempotency_key || null,
    }
  })

  try { _child.stdin.write(stdinMsg) }
  catch (err) {
    _activeTurn = null
    throw new Error(`stdin write failed: ${err.message}`)
  }

  const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('turn timeout')), TURN_TIMEOUT_MS))
  return Promise.race([turnP, timeoutP])
}

// ===== HTTP server =====

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'resident-brain',
    port: PORT,
    cwd: CWD,
    model: MODEL,
    auth_mode: AUTH_MODE,
    subprocess_alive: !!_child,
    session_id: _sessionId,
    session_age_hours: _sessionStartedAt ? ((Date.now() - _sessionStartedAt) / 3600000).toFixed(2) : null,
    turns_this_session: _turnsThisSession,
    queue_depth: _queue.length,
  })
})

app.post('/prompt', async (req, res) => {
  if (TOKEN) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'unauthorized' })
  }
  const { body, thread_id, source, thread_context, case_id, voice_call_id, idempotency_key } = req.body || {}
  if (!body || typeof body !== 'string') return res.status(400).json({ error: 'body_required' })

  log(`turn start key=${idempotency_key || '-'} source=${source || '?'} case=${case_id || '-'} body="${String(body).slice(0, 60)}"`)
  try {
    const result = await dispatchTurn({ body, thread_id, source, thread_context, case_id, voice_call_id, idempotency_key })
    res.json(result)
  } catch (err) {
    log(`turn failed: ${err.message}`)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.listen(PORT, () => {
  log(`listening on :${PORT} cwd=${CWD} model=${MODEL} auth=${AUTH_MODE}`)
  // Boot subprocess eagerly on startup so first turn is faster
  _bootSubprocess().catch((err) => log('eager boot failed:', err.message))
})

// Graceful shutdown
process.on('SIGTERM', () => { _killSubprocess(); process.exit(0) })
process.on('SIGINT', () => { _killSubprocess(); process.exit(0) })

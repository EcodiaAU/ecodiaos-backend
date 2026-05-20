'use strict'

/**
 * away-conductor-server.js (2026-05-20)
 *
 * The Corazon AWAY-CONDUCTOR. Solves the "inject a verbatim prompt into the
 * live IDE chat" brittleness (find the IDE, find the right chat, steal focus,
 * keystroke a paste - fragile) by NOT touching the IDE at all.
 *
 * When Tate is away, the VPS (pure transport) POSTs the inbound message here
 * over Tailscale. This is a headless process on Corazon that runs the LOCAL
 * `claude` CLI with cwd = the local repo, so it loads the SAME context the
 * interactive conductor has (CLAUDE.md doctrine, patterns, MCP tools via the
 * repo .mcp.json, the live local working tree). It is the same brain - same
 * files, same repo - reachable by a plain HTTP call instead of a keystroke.
 *
 * Verified 2026-05-20: `claude --print` on Corazon in this repo loads full
 * CLAUDE.md context and auths headlessly off the Max login.
 *
 * Code discipline: it edits the LOCAL repo and pushes to origin (the single
 * source of truth). The VPS is deploy-only and pulls. One writer -> no
 * divergence (the bug Tate flagged with the VPS Opus path).
 *
 * Per backend/drafts/one-brain-architecture-app-routes-to-conductor-2026-05-20.md
 * and Neo4j Decision 1111.
 */

const express = require('express')
const { spawn } = require('child_process')
const fs = require('fs')

const REPO_CWD = process.env.AWAY_CONDUCTOR_CWD || 'D:/.code/EcodiaOS/backend'
const PORT = parseInt(process.env.AWAY_CONDUCTOR_PORT || '7460', 10)
const CLAUDE_BIN = process.env.AWAY_CONDUCTOR_CLAUDE || 'claude'
const MODEL = process.env.AWAY_CONDUCTOR_MODEL || 'opus'
const TIMEOUT_MS = parseInt(process.env.AWAY_CONDUCTOR_TIMEOUT_MS || '300000', 10)
const TOKEN = process.env.AWAY_CONDUCTOR_TOKEN || null

// ---- Concurrency + IDE-conductor coordination (the "never two writers" lock) -
// 1. Serialize: only one conductor turn runs at a time, so two rapid app
//    messages never spawn concurrent claudes that fight over the local repo.
// 2. Defer to the interactive IDE conductor: if Tate is actively in a turn at
//    the keyboard, wait until it goes idle before we touch the working tree. He
//    does not text the app while at the keyboard, so this is an edge guard, but
//    it guarantees the away-conductor is never the second concurrent writer.
const HEARTBEAT_PATH = process.env.CONDUCTOR_HEARTBEAT_PATH
  || 'D:/.code/EcodiaOS/coordination/conductors/current.json'
const IDE_TURN_FRESH_MS = parseInt(process.env.AWAY_CONDUCTOR_IDE_FRESH_MS || '300000', 10)
const IDE_WAIT_MAX_MS = parseInt(process.env.AWAY_CONDUCTOR_IDE_WAIT_MS || '90000', 10)

let _chain = Promise.resolve()
function runSerialized(fn) {
  const next = _chain.then(fn, fn)
  _chain = next.then(() => {}, () => {}) // never let a failed turn poison the chain
  return next
}

function ideInTurn() {
  try {
    const j = JSON.parse(fs.readFileSync(HEARTBEAT_PATH, 'utf8'))
    if (!j.in_turn) return false
    // in_turn can get stuck true if a Stop hook is missed; treat a stale flag as
    // idle so we never block forever.
    const setAt = j.in_turn_set_at ? Date.parse(j.in_turn_set_at)
      : (j.last_seen_at ? Date.parse(j.last_seen_at) : 0)
    return Number.isFinite(setAt) && (Date.now() - setAt < IDE_TURN_FRESH_MS)
  } catch {
    return false // no/unreadable heartbeat => assume no active IDE conductor
  }
}

async function waitForIdeIdle() {
  const start = Date.now()
  let deferred = false
  while (ideInTurn()) {
    deferred = true
    if (Date.now() - start >= IDE_WAIT_MAX_MS) {
      return { deferred, waited_ms: Date.now() - start, timed_out: true }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return { deferred, waited_ms: Date.now() - start }
}

function buildPrompt({ body, thread_id, source }) {
  const ch = source || 'native'
  return `You are EcodiaOS handling an inbound message from Tate over the ${ch} channel while he is away from the keyboard. You are NOT a degraded fallback - this is the live local repo at ${REPO_CWD} with your full CLAUDE.md doctrine, patterns, MCP tools and memory loaded. You are the same conductor, just reached over the wire.

Do the work the message asks for using whatever tools you have. If you change code: commit and push to origin (origin is the single source of truth; never leave the working tree dirty, never edit-in-place-and-leave-it). If it is a question, answer it from real context/tools, not guesses.

INBOUND (channel=${ch}, thread_id=${thread_id || 'tate'}):
"""
${body}
"""

When done, write your reply to Tate as the FINAL block of stdout wrapped in <REPLY> and </REPLY>. Tight, his voice, no filler, no internal narration ("episode logged" etc banned), no emojis, no em-dashes. Example: ...work... <REPLY>done, pushed build 11</REPLY>`
}

function extractReply(stdout) {
  const m = String(stdout).match(/<REPLY>([\s\S]*?)<\/REPLY>/i)
  if (m && m[1]) return m[1].trim()
  // Fallback: last short non-empty paragraph (covers replies missing the tags).
  const paras = String(stdout).trim().split(/\n\s*\n/)
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i].trim()
    if (p && p.length < 800) return p
  }
  return null
}

function runConductor({ body, thread_id, source }) {
  return new Promise((resolve) => {
    const prompt = buildPrompt({ body, thread_id, source })
    // Prompt goes via STDIN, not as a CLI arg. A multiline/quoted prompt passed
    // as an arg through shell:true on Windows gets mangled (claude then sees no
    // task and just orients). `claude --print` reads the prompt from stdin.
    const args = ['--print', '--model', MODEL, '--dangerously-skip-permissions', '--output-format', 'text']
    let stdout = '', stderr = ''
    let child
    try {
      child = spawn(CLAUDE_BIN, args, {
        cwd: REPO_CWD,
        env: { ...process.env },
        timeout: TIMEOUT_MS,
        shell: process.platform === 'win32', // resolve claude.cmd on Windows PATH
      })
    } catch (err) {
      return resolve({ ok: false, error: `spawn threw: ${err.message}` })
    }
    try {
      child.stdin.write(prompt)
      child.stdin.end()
    } catch (err) {
      return resolve({ ok: false, error: `stdin write failed: ${err.message}` })
    }
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => resolve({ ok: false, error: `spawn failed: ${err.message}` }))
    child.on('close', (code, signal) => {
      resolve({
        ok: code === 0,
        exit_code: code,
        signal: signal || null,
        timed_out: signal === 'SIGTERM' && code === null,
        reply: extractReply(stdout),
        stdout_tail: stdout.slice(-4000),
        stderr_tail: stderr.slice(-1200),
      })
    })
  })
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'away-conductor', cwd: REPO_CWD, model: MODEL, port: PORT, auth: !!TOKEN })
})

app.post('/message', async (req, res) => {
  if (TOKEN) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'unauthorized' })
  }
  const { body, thread_id, source, reply_via } = req.body || {}
  if (!body || typeof body !== 'string') return res.status(400).json({ error: 'body_required' })

  const started = Date.now()
  // Serialize + defer to an active IDE conductor before touching the repo.
  const result = await runSerialized(async () => {
    const lock = await waitForIdeIdle()
    const r = await runConductor({ body, thread_id, source })
    r.lock = lock
    return r
  })

  // Optionally deliver the reply straight from Corazon via APNs (VPS becomes
  // pure transport). reply_via omitted -> just return the reply to the caller.
  if (reply_via === 'native' && result.ok && result.reply) {
    try {
      const { notifyTate } = require('../src/services/notifyTate')
      const nr = await notifyTate({ body: result.reply.slice(0, 1500), channel: 'native', urgency: 'alert' })
      result.delivered = { sent: !!nr && nr.ok !== false, transport: nr && nr.transport }
    } catch (err) {
      result.delivered = { sent: false, error: err.message }
    }
  }

  result.duration_ms = Date.now() - started
  res.json(result)
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[away-conductor] listening on :${PORT} cwd=${REPO_CWD} model=${MODEL} auth=${!!TOKEN}`)
})

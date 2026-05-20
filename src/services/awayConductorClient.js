'use strict'

/**
 * awayConductorClient.js (2026-05-20)
 *
 * VPS-side client for the Corazon AWAY-CONDUCTOR (scripts/away-conductor-server.js
 * running on Corazon, reachable over Tailscale at AWAY_CONDUCTOR_URL).
 *
 * When the native channel escalates to real work, the VPS prefers routing it to
 * the Corazon away-conductor (same brain: full CLAUDE.md context + the live
 * local repo) instead of spawning a context-poor VPS Opus that diverges from
 * local/main. If Corazon is unreachable, the caller falls back to the VPS Opus
 * path so Tate is never left silent.
 *
 * This is the clean replacement for the brittle "inject a prompt into the live
 * IDE chat" path: no IDE, no chat-picking, no keystroke, no focus theft - just
 * an HTTP POST over Tailscale.
 *
 * Per Neo4j Decision 1111 + backend/drafts/one-brain-architecture-app-routes-to-conductor-2026-05-20.md.
 */

const logger = require('../config/logger')
const db = require('../config/db')

function isEnabled() {
  return !!process.env.AWAY_CONDUCTOR_URL
}

// Fetch the last N exchanges from a channel thread mirror so the away-conductor
// has conversational continuity (it spawns a fresh claude per message, which has
// the repo + doctrine but not the recent back-and-forth). Returns a compact
// transcript string, or '' on any miss (best-effort - never block the turn).
async function _recentThreadContext(channel, threadId, limit = 10) {
  try {
    const key = `cowork.message_thread.${channel || 'native'}.${threadId || 'tate'}`
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    if (!rows[0]) return ''
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    if (!exchanges.length) return ''
    const recent = exchanges.slice(-limit)
    return recent
      .map((e) => {
        const who = e.from === 'ecodia' ? 'You (Ecodia)' : 'Tate'
        return `${who}: ${String(e.body || '').slice(0, 500)}`
      })
      .join('\n')
  } catch (err) {
    logger.warn('awayConductorClient: thread context fetch failed (non-fatal)', { error: err.message })
    return ''
  }
}

/**
 * Route an escalated turn to the Corazon away-conductor.
 *
 * @param {object} p
 * @param {object} p.envelope      inbound envelope (channel/body/thread_id/source)
 * @param {string} p.triageReason  why triage escalated (context for the conductor)
 * @returns {Promise<{ok, reply?, error?, duration_ms, status?}>}
 */
async function routeToAwayConductor({ envelope, triageReason }) {
  const base = process.env.AWAY_CONDUCTOR_URL
  if (!base) return { ok: false, error: 'AWAY_CONDUCTOR_URL not set' }
  const url = base.replace(/\/$/, '') + '/message'
  const token = process.env.AWAY_CONDUCTOR_TOKEN || null
  const timeoutMs = parseInt(process.env.AWAY_CONDUCTOR_CLIENT_TIMEOUT_MS || '300000', 10)

  const started = Date.now()
  const threadContext = await _recentThreadContext(envelope.channel, envelope.thread_id)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // No reply_via: the away-conductor returns the reply; the VPS delivers
        // it via the existing notifyTate APNs path (one delivery code path).
        body: triageReason ? `${envelope.body}\n\n[triage note: ${triageReason}]` : envelope.body,
        thread_id: envelope.thread_id || 'tate',
        source: envelope.source || envelope.channel || 'native',
        thread_context: threadContext || undefined,
        idempotency_key: envelope.idempotency_key || undefined,
      }),
      signal: controller.signal,
    })
    const status = res.status
    let data = null
    try { data = await res.json() } catch { data = null }
    if (!res.ok) {
      logger.warn('awayConductorClient: non-2xx from away-conductor', { status })
      return { ok: false, error: `away-conductor http ${status}`, status, duration_ms: Date.now() - started }
    }
    const reply = data && typeof data.reply === 'string' ? data.reply.trim() : null
    return {
      ok: !!(data && data.ok) && !!reply,
      reply,
      raw_ok: !!(data && data.ok),
      status,
      duration_ms: Date.now() - started,
    }
  } catch (err) {
    const aborted = err.name === 'AbortError'
    logger.warn('awayConductorClient: request failed', { error: err.message, aborted })
    return { ok: false, error: aborted ? 'timeout' : err.message, duration_ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { routeToAwayConductor, isEnabled }

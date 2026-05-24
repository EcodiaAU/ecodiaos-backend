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
const tl = require('./threadLog')

function isEnabled() {
  return !!process.env.AWAY_CONDUCTOR_URL || !!process.env.RESIDENT_BRAIN_URL
}

/**
 * Build the conversational context the away-conductor needs. Replaces the old
 * per-channel mirror fetch with a unified thread_log tail. If thread_log read
 * fails (substrate down, table missing), falls back to the per-channel mirror
 * so we degrade gracefully.
 *
 * Per spec one-brain-stateful-coordination-2026-05-21 §3.4.
 */
async function _buildAwayContext(channel, threadId, limit = 30) {
  // Primary: unified thread_log tail across ALL channels.
  try {
    const t = await tl.tailThreadLog({ thread_id: threadId || 'tate', limit })
    if (t.entries && t.entries.length) {
      return tl.formatTailForPrompt(t.entries, { maxLineChars: 240 })
    }
  } catch (err) {
    logger.warn('awayConductorClient: thread_log tail failed, falling back', { error: err.message })
  }
  // Fallback: per-channel mirror (today's behavior). Keeps the system live if
  // the migration hasn't propagated or thread_log writes haven't caught up yet.
  try {
    const key = `cowork.message_thread.${channel || 'native'}.${threadId || 'tate'}`
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    if (!rows[0]) return ''
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    if (!exchanges.length) return ''
    return exchanges
      .slice(-10)
      .map((e) => {
        const who = e.from === 'ecodia' ? 'You (Ecodia)' : 'Tate'
        return `${who}: ${String(e.body || '').slice(0, 500)}`
      })
      .join('\n')
  } catch (err) {
    logger.warn('awayConductorClient: mirror fallback also failed', { error: err.message })
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
  // Prefer the resident brain (persistent claude session, ~10-17s) when set.
  // Falls back to the legacy away-conductor (fresh subprocess per turn, ~60-120s)
  // if resident brain unavailable or errors.
  // Per spec backend/drafts/voice-fast-and-intelligent-2026-05-24.md §3.2.
  const residentUrl = process.env.RESIDENT_BRAIN_URL
  if (residentUrl) {
    const r = await _routeToResidentBrain({ envelope, triageReason, residentUrl })
    if (r.ok || r.error !== 'fetch failed') return r
    logger.warn('awayConductorClient: resident brain unreachable, falling back to away-conductor', { error: r.error })
  }
  const base = process.env.AWAY_CONDUCTOR_URL
  if (!base) return { ok: false, error: 'neither RESIDENT_BRAIN_URL nor AWAY_CONDUCTOR_URL set' }
  const url = base.replace(/\/$/, '') + '/message'
  const token = process.env.AWAY_CONDUCTOR_TOKEN || null
  const timeoutMs = parseInt(process.env.AWAY_CONDUCTOR_CLIENT_TIMEOUT_MS || '300000', 10)

  const started = Date.now()
  const threadContext = await _buildAwayContext(envelope.channel, envelope.thread_id)
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
        // Case tracking (spec one-brain-stateful-coordination §3.2). When the
        // caller opens a case_file before dispatching, pass it through so the
        // away-conductor resolves it on REPLY extract.
        case_id: envelope.case_id || undefined,
        voice_call_id: envelope.voice_call_id || undefined,
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

async function _routeToResidentBrain({ envelope, triageReason, residentUrl }) {
  const url = residentUrl.replace(/\/$/, '') + '/prompt'
  const token = process.env.RESIDENT_BRAIN_TOKEN || null
  const timeoutMs = parseInt(process.env.RESIDENT_BRAIN_CLIENT_TIMEOUT_MS || '180000', 10)
  const started = Date.now()
  const threadContext = await _buildAwayContext(envelope.channel, envelope.thread_id)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        body: triageReason ? `${envelope.body}\n\n[triage note: ${triageReason}]` : envelope.body,
        thread_id: envelope.thread_id || 'tate',
        source: envelope.source || envelope.channel || 'native',
        thread_context: threadContext || undefined,
        idempotency_key: envelope.idempotency_key || undefined,
        case_id: envelope.case_id || undefined,
        voice_call_id: envelope.voice_call_id || undefined,
      }),
      signal: controller.signal,
    })
    const status = res.status
    let data = null
    try { data = await res.json() } catch { data = null }
    if (!res.ok) {
      logger.warn('awayConductorClient: resident-brain non-2xx', { status })
      return { ok: false, error: `resident-brain http ${status}`, status, duration_ms: Date.now() - started }
    }
    const reply = data && typeof data.reply === 'string' ? data.reply.trim() : null
    return {
      ok: !!(data && data.ok) && !!reply,
      reply,
      via: 'resident_brain',
      raw_ok: !!(data && data.ok),
      cost_usd: data && data.cost_usd,
      turn_count: data && data.turn_count,
      status, duration_ms: Date.now() - started,
    }
  } catch (err) {
    const aborted = err.name === 'AbortError'
    logger.warn('awayConductorClient: resident-brain request failed', { error: err.message, aborted })
    return { ok: false, error: aborted ? 'timeout' : 'fetch failed', duration_ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { routeToAwayConductor, isEnabled }

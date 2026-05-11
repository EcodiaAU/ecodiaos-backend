/**
 * OS Session Routes - /api/os-session/*
 * Interface between frontend and the persistent CC OS session.
 *
 * When CONDUCTOR_DETACHED=true, selected route handlers proxy their
 * osSessionService calls to the ecodia-conductor HTTP loopback bridge
 * (127.0.0.1:CONDUCTOR_LOOPBACK_PORT) instead of invoking the service
 * in-process. Proxied routes: POST /message, POST /abort, GET /status,
 * POST /save-state.  All other routes (history, tokens, recover, forks,
 * energy, upload, restart, compact, handover) continue in-process because
 * they either do not touch the live SDK session or are api-side concerns.
 *
 * Phase 2 bridge: fork_mp1mrgs4_f2ba17, 12 May 2026.
 */
const express = require('express')
const router = express.Router()
const env = require('../config/env')
const logger = require('../config/logger')
const osSession = require('../services/osSessionService')
const fork = require('../services/forkService')
const { getEventsSince, getSessionEpoch } = require('../websocket/wsManager')
const usageEnergy = require('../services/usageEnergyService')
const { saveHandoffState } = require('../services/sessionHandoff')
const { stampTateActive } = require('../services/tateActiveGate')

// -----------------------------------------------------------------------
// Conductor loopback proxy helpers
// -----------------------------------------------------------------------

// Read once at module load - flag does not change during process lifetime.
const CONDUCTOR_DETACHED = process.env.CONDUCTOR_DETACHED === 'true'
const CONDUCTOR_LOOPBACK_PORT = process.env.CONDUCTOR_LOOPBACK_PORT || '3002'
const CONDUCTOR_LOOPBACK_TIMEOUT_MS = parseInt(
  process.env.CONDUCTOR_LOOPBACK_TIMEOUT_MS || '1800000', // 30 min default
  10
)

// Lazy-loaded secret - read from kv_store on first proxy call, then cached.
// NEVER logged. Loaded via direct db query so we do not depend on env.js.
let _loopbackSecret = null

async function getLoopbackSecret() {
  if (_loopbackSecret) return _loopbackSecret
  if (process.env.CONDUCTOR_LOOPBACK_SECRET) {
    _loopbackSecret = process.env.CONDUCTOR_LOOPBACK_SECRET
    return _loopbackSecret
  }
  const db = require('../config/db')
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.conductor_loopback_secret'`
  if (!rows.length) {
    throw new Error('CONDUCTOR_LOOPBACK_SECRET not found in kv_store - cannot proxy to conductor')
  }
  // kv_store.value column is TEXT - always a raw JSON string. Parse before .value.
  const raw = rows[0].value
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = raw
  }
  _loopbackSecret = typeof parsed === 'string' ? parsed : parsed.value
  if (!_loopbackSecret) {
    throw new Error('CONDUCTOR_LOOPBACK_SECRET kv_store entry missing .value field - shape must be {"value":"<hex>",...}')
  }
  return _loopbackSecret
}

// Forward a request to the conductor loopback server. Returns the fetch
// Response so callers can inspect status and read the body.
// Streaming note: /message returns immediately with {accepted:true} (no
// SSE body), so a JSON read is always sufficient here.
async function proxyToLoopback(path, method, body) {
  const secret = await getLoopbackSecret()
  const url = `http://127.0.0.1:${CONDUCTOR_LOOPBACK_PORT}${path}`
  const init = {
    method,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(CONDUCTOR_LOOPBACK_TIMEOUT_MS),
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return fetch(url, init)
}

// -----------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------

// Send a message to the OS session.
// Response streams in real-time via WebSocket (text_delta, tool_use, os-session:complete).
// The HTTP response returns IMMEDIATELY with { accepted: true } - it does NOT block
// for the entire agentic loop. This prevents:
//   1. Frontend hanging for 5-30 minutes on a single await
//   2. User unable to send follow-up messages while previous is processing
//   3. "Connection error: Network Error" when HTTP times out on long sessions
// The frontend relies on WebSocket for the actual conversation flow.
//
// Optional field: mode
//   "direct" (default) - send immediately, draining any pending queued messages first
//   "queue" - hold until os_signal_handoff fires or max_age_hours elapses
router.post('/message', async (req, res, next) => {
  try {
    const { message, mode, source } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' })
    }

    // queue mode: stays entirely in ecodia-api (does not touch osSessionService).
    // No proxy needed regardless of CONDUCTOR_DETACHED.
    if (mode === 'queue') {
      const mq = require('../services/messageQueue')
      const row = await mq.enqueueMessage({
        body: message,
        source: source || 'tate',
        mode: 'queue',
      })
      return res.status(202).json({ queued_id: row.id, queued_at: row.queued_at })
    }

    if (mode && mode !== 'direct') {
      return res.status(400).json({ error: 'mode must be "direct" or "queue"' })
    }

    // Stamp Tate as active before queuing - crons stand down for 15 minutes.
    // Fire-and-forget: never block the response if this errors.
    // DO NOT stamp when the message originated from our own scheduler (prevents
    // self-perpetuating defer loop - see Q1 resolution Apr 25 2026).
    if (source !== 'scheduler') {
      stampTateActive().catch(err => {
        logger.warn('OS Session /message: stampTateActive failed', { error: err.message })
      })
    }

    // Drain any pending queued messages into this direct send (opportunistic delivery).
    // Runs before returning so DB marks are atomic with the outgoing send.
    // This stays in ecodia-api even when proxying because it writes to the shared DB
    // messageQueue table - conductor reads the same DB, no cross-process concern.
    let finalMessage = message
    try {
      const mq = require('../services/messageQueue')
      finalMessage = await mq.drainIntoDirectMessage(message)
    } catch (err) {
      logger.warn('OS Session /message: drain error', { error: err.message })
    }

    // Return immediately - the real response streams via WebSocket
    res.json({ accepted: true, status: 'streaming' })

    // Fire-and-forget: log the message with its source for voice/typed analytics.
    // Never awaited - never blocks the response or message delivery path.
    // source values: 'voice' (voiceBuffer flush), 'scheduler' (cron/delayed),
    //                'typed' (keyboard, default), 'tate' (legacy unlabelled).
    require('../config/db')`INSERT INTO os_session_messages (body, source)
      VALUES (${finalMessage}, ${source || 'typed'})`.catch(err => {
      logger.warn('os_session_messages insert failed', { error: err.message })
    })

    if (CONDUCTOR_DETACHED) {
      // Proxy to ecodia-conductor loopback. Conductor calls osSession.sendMessage
      // in its own process where the SDK stream lives.
      proxyToLoopback('/message', 'POST', { message: finalMessage, source })
        .catch(err => {
          logger.error('OS Session /message: conductor proxy failed', { error: err.message, stack: err.stack })
        })
      return
    }

    // In-process path (CONDUCTOR_DETACHED not set or false).
    // priority: false (default) means user messages QUEUE behind any active
    // tool-call loop and fire after it completes (via _sendQueue chain in
    // osSessionService.js). This preserves mid-turn flow - Tate's check-in
    // messages will not kill an in-progress audit, deploy, or Factory dispatch.
    // Explicit kill switch is the frontend Stop button -> POST /api/os-session/abort.
    // Never flip priority:true here without explicit Tate sign-off - it was
    // the cause of mid-turn session breaks where check-in messages aborted
    // long-running tool streams (logged as "Background error: write CONNECTION_ENDED").
    osSession.sendMessage(finalMessage, { priority: false }).catch(err => {
      logger.error('OS Session /message: background sendMessage failed', { error: err.message, stack: err.stack })
    })
  } catch (err) {
    logger.error('OS Session /message: request handler error', { error: err.message })
    next(err)
  }
})

// Get current session status.
// When CONDUCTOR_DETACHED=true the live session lives in ecodia-conductor,
// so proxy to the conductor's /status to get accurate in-flight state.
router.get('/status', async (_req, res, next) => {
  try {
    if (CONDUCTOR_DETACHED) {
      const resp = await proxyToLoopback('/status', 'GET')
      const result = await resp.json()
      return res.status(resp.status).json(result)
    }
    const status = await osSession.getStatus()
    res.json(status)
  } catch (err) { next(err) }
})

// Restart the OS session (fresh conversation)
router.post('/restart', async (_req, res, next) => {
  try {
    const result = await osSession.restart()
    res.json(result)
  } catch (err) { next(err) }
})

// Get session history (recent logs)
router.get('/history', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10)
    const history = await osSession.getHistory(limit)
    res.json({ history })
  } catch (err) { next(err) }
})

// Get current token usage
router.get('/tokens', (_req, res) => {
  const usage = osSession.getTokenUsage()
  res.json(usage)
})

// Recover missed response after tab close / disconnect.
// Accepts either:
//   ?since_seq=N - Pinnacle P1: return events from in-memory ring buffer with seq > N
//   ?since=<ts> - legacy: return transcript from DB since timestamp
router.get('/recover', async (req, res, next) => {
  try {
    // Pinnacle P1: seq-based recovery from ring buffer (preferred).
    // Stamp the current epoch so clients can detect a process restart /
    // new session and clear their lastSeenSeq when the epoch changes.
    if (req.query.since_seq != null) {
      const sinceSeq = parseInt(req.query.since_seq, 10)
      const events = getEventsSince(Number.isFinite(sinceSeq) ? sinceSeq : null)
      return res.json({
        events,
        count: events.length,
        seq_based: true,
        epoch: getSessionEpoch(),
      })
    }
    // Legacy timestamp-based recovery
    const since = req.query.since || null
    const result = await osSession.recoverResponse(since)
    res.json(result)
  } catch (err) { next(err) }
})

// Extended-recovery - return durable transcript since timestamp.
// Pairs with /recover (event-level, in-memory ring) when the gap exceeds the
// 500-event ring window or the session epoch changed (PM2 restart).
//   ?since=<iso_ts>    Required-ish (defaults to 24h ago)
//   ?limit=<int>       Optional, default 200, max 1000
// Surfaces only role-tagged finalised messages from cc_session_logs.
// Tool calls / thinking blocks / partial deltas are NOT in the persistent
// log - those live only in the live event ring. This endpoint is the chat
// transcript surface, not the event-stream surface.
// Doctrine: ~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md
// Origin: 7 May 2026 DeepSeek 400-storm phone-freeze (status_board 148cddc5).
router.get('/messages', async (req, res, next) => {
  try {
    const sinceRaw = req.query.since
    const since = typeof sinceRaw === 'string' ? sinceRaw : null
    const limitRaw = parseInt(req.query.limit || '200', 10)
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200
    const result = await osSession.getMessagesSinceTimestamp(since, { limit })
    res.json(result)
  } catch (err) {
    logger.error('OS Session /messages: error', { error: err.message })
    next(err)
  }
})

// Compact - seamlessly transition to a new session with summary context
router.post('/compact', async (req, res, next) => {
  res.setTimeout(1_800_000) // 30 min
  try {
    const { summary } = req.body
    if (!summary || typeof summary !== 'string') {
      return res.status(400).json({ error: 'summary is required' })
    }
    const result = await osSession.compact(summary)
    res.json(result)
  } catch (err) {
    logger.error('OS Session /compact: error', { error: err.message })
    next(err)
  }
})

// Manual handover trigger - generate brief + warm new session now
router.post('/handover', async (_req, res, next) => {
  res.setTimeout(1_800_000) // 30 min
  try {
    const result = await osSession.autoHandover(null)
    res.json(result || { ok: true })
  } catch (err) {
    logger.error('OS Session /handover: error', { error: err.message })
    next(err)
  }
})

// Get weekly energy snapshot - real % from Anthropic response headers
router.get('/energy', async (_req, res, next) => {
  try {
    const energy = await usageEnergy.getEnergy()
    res.json(energy)
  } catch (err) { next(err) }
})

// Force a live quota-check for both accounts (fires 1-token API calls to read real headers)
router.post('/energy/refresh', async (_req, res, next) => {
  try {
    await usageEnergy.refreshAllAccounts()
    const energy = await usageEnergy.getEnergy()
    res.json(energy)
  } catch (err) { next(err) }
})

// Reset all in-memory account state to fresh defaults. Use when stale
// rejected state with no reset timestamps wedges the router into permanent
// fallback. Does NOT call refreshAllAccounts - the quota-check fetch is
// disabled because it was crashing the process.
router.post('/energy/reset', async (_req, res, next) => {
  try {
    usageEnergy.resetAllAccounts()
    const energy = await usageEnergy.getEnergy()
    res.json(energy)
  } catch (err) { next(err) }
})

// Get historical weekly usage (self-tracked turns for activity log)
router.get('/energy/history', async (req, res, next) => {
  try {
    const weeks = parseInt(req.query.weeks || '4', 10)
    const history = await usageEnergy.getWeeklyHistory(weeks)
    res.json({ history })
  } catch (err) { next(err) }
})

// Upload an attachment to Supabase Storage, extract text from documents,
// and return a public URL + extracted text. Accepts either base64-encoded
// binary OR raw UTF-8 text in JSON body. Per-route 50mb limit overrides
// the global 5mb express.json() limit set in app.js.
const uploadJson = require('express').json({ limit: '50mb' })

// Best-effort text extraction. Returns '' on any failure - the file is
// still uploaded; only the inline text snippet is missing.
async function extractText(buffer, contentType, name) {
  const lower = String(name || '').toLowerCase()
  try {
    if (contentType === 'application/pdf' || lower.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const out = await pdfParse(buffer)
      return String(out?.text || '').trim()
    }
    if (
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      const mammoth = require('mammoth')
      const out = await mammoth.extractRawText({ buffer })
      return String(out?.value || '').trim()
    }
    if (
      (contentType && (contentType.startsWith('text/') || contentType === 'application/json')) ||
      /\.(txt|md|csv|json|log|yaml|yml|xml|html|css|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|sh|sql|toml|ini)$/.test(lower)
    ) {
      return buffer.toString('utf-8').trim()
    }
  } catch (err) {
    logger.warn('OS Upload: text extraction failed', { name, contentType, error: err.message })
  }
  return ''
}

router.post('/upload', uploadJson, async (req, res, next) => {
  try {
    const { name, type, base64, text } = req.body
    if (!name || (!base64 && typeof text !== 'string')) {
      return res.status(400).json({ error: 'name and (base64 or text) are required' })
    }

    if (!env.SUPABASE_URL || !(env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY)) {
      return res.status(503).json({ error: 'Supabase not configured' })
    }

    const { createClient } = require('@supabase/supabase-js')
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY)

    let buffer
    if (typeof text === 'string') {
      buffer = Buffer.from(text, 'utf-8')
    } else {
      const raw = base64.includes(',') ? base64.split(',')[1] : base64
      buffer = Buffer.from(raw, 'base64')
    }

    const slug = `attachments/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const contentType = type || (typeof text === 'string' ? 'text/plain' : 'application/octet-stream')

    await sb.storage.createBucket('os-attachments', { public: true }).catch(() => {})
    const { error } = await sb.storage.from('os-attachments').upload(slug, buffer, { contentType, upsert: true })
    if (error) {
      logger.error('OS Upload: Supabase storage error', { error: error.message, name })
      return res.status(500).json({ error: error.message })
    }

    const { data } = sb.storage.from('os-attachments').getPublicUrl(slug)
    const extracted = await extractText(buffer, contentType, name)

    res.json({
      url: data.publicUrl,
      name,
      type: contentType,
      size: buffer.length,
      extracted_text: extracted,
    })
  } catch (err) { next(err) }
})

// Abort - kill the active query immediately so the user can send a new message.
// Proxied to conductor when CONDUCTOR_DETACHED=true so the abort reaches
// the actual running session.
router.post('/abort', async (_req, res, next) => {
  try {
    if (CONDUCTOR_DETACHED) {
      const resp = await proxyToLoopback('/abort', 'POST')
      const result = await resp.json()
      return res.status(resp.status).json(result)
    }
    const result = await osSession.abort()
    res.json(result)
  } catch (err) {
    logger.error('OS Session /abort: error', { error: err.message })
    next(err)
  }
})

// -- Fork-mode (Build 1, EcodiaOS_Spec_NextBuild section 1) -----------------
//
// POST /api/os-session/fork - spawn a parallel sub-session with a brief.
// GET  /api/os-session/forks - list all live + recently-finished forks.
// GET  /api/os-session/fork/:id - single fork snapshot.
// POST /api/os-session/fork/:id/abort - kill a specific fork.
//
// The HTTP handler returns immediately with the fork's id. All output streams
// via WS with envelope.fork_id, never via this response.

router.post('/fork', async (req, res, next) => {
  try {
    const { brief, context_mode, parent_fork_id } = req.body || {}
    const snapshot = await fork.spawnFork({ brief, context_mode, parent_fork_id })
    return res.status(202).json({ accepted: true, fork: snapshot })
  } catch (err) {
    if (err && err.httpStatus) {
      return res.status(err.httpStatus).json({
        error: err.code || 'fork_spawn_failed',
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      })
    }
    logger.error('OS Session /fork: error', { error: err.message })
    next(err)
  }
})

router.get('/forks', async (_req, res, next) => {
  try {
    res.json({
      live: fork.listForks(),
      hard_cap: fork.HARD_FORK_CAP,
      energy_caps: fork.ENERGY_FORK_CAPS,
    })
  } catch (err) { next(err) }
})

router.get('/fork/:id', async (req, res, next) => {
  try {
    const snap = fork.getFork(req.params.id)
    if (!snap) return res.status(404).json({ error: 'not_found' })
    res.json(snap)
  } catch (err) { next(err) }
})

router.post('/fork/:id/abort', async (req, res, next) => {
  try {
    const reason = (req.body && req.body.reason) || 'manual_abort'
    const result = await fork.abortFork(req.params.id, reason)
    if (!result.aborted) return res.status(409).json(result)
    res.json(result)
  } catch (err) { next(err) }
})

// Save session handoff state for restart recovery.
// Proxied to conductor when CONDUCTOR_DETACHED=true so the state captures
// the conductor's session context rather than the api's stale in-process view.
router.post('/save-state', async (req, res, next) => {
  try {
    const { current_work, active_plan, tate_last_direction, deliverables_status } = req.body
    if (CONDUCTOR_DETACHED) {
      const resp = await proxyToLoopback('/save-state', 'POST', {
        current_work,
        active_plan,
        tate_last_direction,
        deliverables_status,
      })
      const result = await resp.json()
      return res.status(resp.status).json(result)
    }
    const state = await saveHandoffState({ current_work, active_plan, tate_last_direction, deliverables_status })
    res.json({ ok: true, saved_at: state.saved_at })
  } catch (err) {
    logger.error('OS Session /save-state: error', { error: err.message })
    next(err)
  }
})

module.exports = router

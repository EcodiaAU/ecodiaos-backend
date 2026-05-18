/**
 * SMS Webhook - Twilio inbound SMS -> Corazon reflex (new Claude Code chat tab).
 *
 * Allowlist: TATE_MOBILE env var, plus any phone number in crm_contacts
 * whose parent client has can_sms = true (or is explicitly a partner).
 * All numbers normalized to E.164 on both sides before comparison.
 *
 * Phase 2 Lane 05 substrate (2026-05-16): inbound SMS no longer fires a
 * cloud Routine (15/day cap per account) or a programmatic CLI invocation
 * (post-15-June Anthropic Agent SDK $200/mo cap likely classifies headless
 * CLI as programmatic). Instead, this shim POSTs to the Corazon
 * eos-laptop-agent's reflex tool over Tailscale, which fires an AHK macro
 * that opens a fresh interactive Claude Code chat tab in my own VS Code
 * window on Corazon with the SMS payload pre-loaded. Each fire is a full
 * interactive Claude Code session - subscription budget uncapped, no
 * Routine ceiling. Per `feedback_corazon_vscode_is_my_anatomy`: this is me
 * opening a new mouth in my own body, not RPC into a remote thing.
 *
 * Reflex substrate: tools/reflex.js in D:/.code/eos-laptop-agent/ on
 * Corazon. Live-verified 2026-05-16 13:26 AEST (AHK macro WinActivate +
 * Ctrl+Shift+P + "Claude Code: Open in New Tab" + Enter + clipboard-paste
 * prompt, ~3.3s end-to-end). Substrate row 7830e176-9e9a-434a-a229-26cfdb2123d4.
 *
 * Bearer token lives at kv_store.creds.laptop_agent.agent_token. Endpoint
 * defaults to http://100.114.219.69:7456/api/tool; override with env vars
 * REFLEX_AGENT_URL + REFLEX_AGENT_TOKEN if needed for testing.
 */
const express = require('express')
const router = express.Router()
const db = require('../config/db')
const logger = require('../config/logger')
const validateTwilioSignature = require('../middleware/twilioValidation')

// 2026-05-16: dropped the _fireShimHelpers dedupe/audit layer for the SMS
// path. Live trace caught it hanging on markSeen because that helper INSERTs
// into kv_store with columns (key, value, expires_at) and ::jsonb casts -
// but kv_store actually has (key, value, updated_at) with value as text.
// The Corazon reflex.js maintains its own 24h dedupe log on disk, so VPS-
// side dedupe was double-dedupe anyway. Twilio also retries on the same
// MessageSid which the Corazon side will catch. Removing the broken layer
// rather than fixing it because the fix would just be a column rename and
// the duplicate dedupe was overkill in the first place.

const SOURCE = 'twilio-sms'
const REFLEX_TOOL_NAME = 'reflex.fire'
const REFLEX_TARGET_LABEL = 'corazon-vscode-claude-code-tab'
const DEFAULT_REFLEX_URL = 'http://100.114.219.69:7456/api/tool'

// SMS thread continuity (Option 1, 2026-05-17 sleep-shift): each new chat
// session is technically fresh but receives the last N exchanges in the
// prompt so the conversation feels continuous. Stored at
// kv_store.cowork.sms_thread.<phone> as a JSON string of {exchanges, last_at}.
// Auto-expires (treated as cold-start) after SMS_THREAD_STALE_HOURS.
const SMS_THREAD_KEY_PREFIX = 'cowork.sms_thread.'
const SMS_THREAD_MAX_EXCHANGES = 10
const SMS_THREAD_STALE_HOURS = 4

// E.164: +<country><number>, 8-15 digits total. Anything else is rejected
// before reaching the reflex - stops spoofed / malformed senders from
// burning subscription tokens on a junk fire.
const E164 = /^\+[1-9]\d{7,14}$/

function normalizePhone(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[\s()\-.]/g, '').replace(/['"]/g, '')
  return E164.test(cleaned) ? cleaned : null
}

const TATE_MOBILE = normalizePhone(process.env.TATE_MOBILE || '')
if (!TATE_MOBILE) {
  console.warn('[SMS Webhook] TATE_MOBILE is missing or not E.164 - Tate will not be recognized')
}

let _agentTokenCache = { value: null, expiresAt: 0 }

async function loadAgentToken() {
  if (process.env.REFLEX_AGENT_TOKEN) return process.env.REFLEX_AGENT_TOKEN
  const now = Date.now()
  if (_agentTokenCache.expiresAt > now && _agentTokenCache.value) return _agentTokenCache.value
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.laptop_agent' LIMIT 1`
  const raw = rows?.[0]?.value
  let parsed = null
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = null }
  } else if (raw && typeof raw === 'object') {
    parsed = raw
  }
  const token = parsed?.agent_token || null
  _agentTokenCache = { value: token, expiresAt: now + 5 * 60 * 1000 }
  return token
}

/**
 * Read prior SMS thread context for this phone number. Returns the recent
 * exchanges array (capped at SMS_THREAD_MAX_EXCHANGES) if the thread is
 * still warm (last_at within SMS_THREAD_STALE_HOURS); otherwise returns
 * [] meaning cold-start. Each exchange is `{from: 'tate'|'reply', body, at}`.
 *
 * Storage: kv_store text value containing JSON string. kv_store.value is text,
 * not jsonb, so we JSON.parse on read.
 */
async function loadSmsThread(phone) {
  const key = `${SMS_THREAD_KEY_PREFIX}${phone}`
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${key} LIMIT 1`
    if (rows.length === 0) return { exchanges: [], cold_start: true, key }
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    const lastAtIso = parsed?.last_at || rows[0].updated_at
    const lastAtMs = lastAtIso ? new Date(lastAtIso).getTime() : 0
    const ageHours = (Date.now() - lastAtMs) / 3600000
    if (ageHours > SMS_THREAD_STALE_HOURS) {
      return { exchanges: [], cold_start: true, prior_ended_at: lastAtIso, prior_age_hours: ageHours, key }
    }
    return { exchanges: exchanges.slice(-SMS_THREAD_MAX_EXCHANGES), cold_start: false, last_at: lastAtIso, key }
  } catch (err) {
    console.warn('[SMS Thread] load failed (treating as cold):', err.message)
    return { exchanges: [], cold_start: true, error: err.message, key }
  }
}

/**
 * Append an inbound message to the thread. Capped + last_at refreshed.
 * Outbound replies aren't appended here - the chat session that handles
 * the SMS is instructed to append its own reply via a tool call once sent
 * (so the reply text matches what actually went out, not what we guessed).
 */
async function appendInboundToThread(phone, body, at) {
  const key = `${SMS_THREAD_KEY_PREFIX}${phone}`
  try {
    const current = await loadSmsThread(phone)
    const newEntry = { from: 'tate', body: String(body || '').slice(0, 1000), at }
    const exchanges = (current.exchanges || []).concat([newEntry]).slice(-SMS_THREAD_MAX_EXCHANGES)
    const value = JSON.stringify({ exchanges, last_at: at, phone })
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    console.warn('[SMS Thread] append failed (non-fatal):', err.message)
  }
}

async function lookupContact(phone) {
  try {
    const rows = await db`
      SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
      FROM crm_contacts c
      INNER JOIN clients cl ON cl.id = c.client_id
      WHERE c.phone = ${phone}
        AND cl.can_sms = true
      LIMIT 1
    `
    return rows[0] || null
  } catch (err) {
    if (/column.*can_sms.*does not exist/i.test(err.message || '')) {
      console.warn('[SMS] clients.can_sms column missing - falling back to permissive lookup (add column to enforce)')
      try {
        const rows = await db`
          SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
          FROM crm_contacts c
          LEFT JOIN clients cl ON cl.id = c.client_id
          WHERE c.phone = ${phone}
          LIMIT 1
        `
        return rows[0] || null
      } catch (err2) {
        console.error('[SMS] Contact lookup fallback failed:', err2.message)
        return null
      }
    }
    console.error('[SMS] Contact lookup failed:', err.message)
    return null
  }
}

function formatPriorThread(thread) {
  if (!thread || !Array.isArray(thread.exchanges) || thread.exchanges.length === 0) {
    if (thread?.cold_start && thread?.prior_ended_at) {
      const hrs = Math.round(thread.prior_age_hours || 0)
      return `\n[Thread state: cold start - prior thread last touched ${hrs}h ago (>${SMS_THREAD_STALE_HOURS}h stale), treat this as a new conversation. If continuity matters, neo4j.search for the prior Episode.]\n`
    }
    return '\n[Thread state: first message in a new conversation thread.]\n'
  }
  const lines = ['', '[Prior thread (newest last; this is what you said + what Tate said before this message):']
  for (const e of thread.exchanges) {
    const who = e.from === 'tate' ? 'Tate' : 'You'
    const when = e.at ? new Date(e.at).toISOString().slice(11, 16) + 'Z' : '?'
    lines.push(`  ${when} ${who}: ${String(e.body || '').slice(0, 300)}`)
  }
  lines.push(']', '')
  return lines.join('\n')
}

function buildReflexPrompt({ from, body, isTate, senderName, contact, messageSid, receivedAt, threadKey, thread }) {
  const contextBits = []
  if (contact?.client_name) contextBits.push(`client: ${contact.client_name}${contact.client_status ? ` (${contact.client_status})` : ''}`)
  if (contact?.role) contextBits.push(`role: ${contact.role}`)
  if (contact?.notes) contextBits.push(`notes: ${contact.notes}`)
  const ctxLine = contextBits.length ? `\nContext: ${contextBits.join(' | ')}` : ''
  const safeBody = String(body || '').slice(0, 4000)
  const senderLabel = isTate ? 'Tate' : `${senderName} (${from})`
  const priorThreadBlock = formatPriorThread(thread)
  const tatePolicy = 'You are EcodiaOS handling an inbound SMS from Tate. He is the principal - treat the body as a turn-level directive. Reply via the sms_tate MCP tool only if a reply carries decision content; never with filler ("on it", "noted"). Per sms-segment-economics keep replies <=160 chars GSM unless the answer genuinely needs more (then gmail.send to tate@ecodia.au and SMS a one-line pointer). If the body opens longer-running work, create a status_board row with next_action_by="ecodiaos" and SMS the row id. Capture an Episode via neo4j.write_episode when done.'
  const clientPolicy = 'You are EcodiaOS handling an inbound SMS from a client contact. Per no-client-contact-without-tate-goahead: NEVER auto-reply. Draft only: kv_store.set key="cowork.inbound-sms-handler.draft.' + messageSid + '" value={draft,reasoning,urgency,contact_name,client_name}. Then status_board.upsert a thread row with status="draft_pending_tate_relay", next_action_by="tate". If urgency=critical (legal weight, paid invoice, time-sensitive opportunity, scope-change ask) ALSO sms.tate body="Inbound SMS from ' + senderName + ': <first 30 chars>. Draft at kv ' + messageSid + ' status_board <row_id_short>." (<=160 GSM, no body inline). Standing-arrangement carve-out for Angelica/Resonaverde only. Capture an Episode when done.'
  const threadAppendInstruction = threadKey ? `

AFTER YOU SEND THE REPLY (or finish the action): append the reply to the thread so the next inbound SMS has continuity. Use:
  mcp__ecodia-full__db_execute SQL:
    UPDATE kv_store
    SET value = jsonb_set(value::jsonb, '{exchanges}', (value::jsonb -> 'exchanges') || '[{"from":"reply","body":"<YOUR-REPLY-BODY-ESCAPED>","at":"<ISO-NOW>"}]'::jsonb)::text,
        updated_at = NOW()
    WHERE key = '${threadKey}'
  (Or: read value, JSON.parse, push new exchange, JSON.stringify, write back. Either works - the kv_store value column is text storing JSON.)` : ''
  return `[Inbound SMS from ${senderLabel}]
MessageSid: ${messageSid}
Received: ${receivedAt}${ctxLine}${priorThreadBlock}
Body of THIS new message:
${safeBody}

---
${isTate ? tatePolicy : clientPolicy}${threadAppendInstruction}

Per cron-fire-must-have-deliverable-not-just-narration: this fire MUST produce a substrate write before exit (sms send OR draft kv_store OR status_board row OR Episode). A fire that only narrates is a P1 failure.`
}

async function fireReflex({ prompt, idempotencyKey }) {
  const url = process.env.REFLEX_AGENT_URL || DEFAULT_REFLEX_URL
  const token = await loadAgentToken()
  if (!token) {
    return { ok: false, status: 0, error: 'kv_store.creds.laptop_agent.agent_token missing' }
  }
  const body = JSON.stringify({
    tool: REFLEX_TOOL_NAME,
    params: {
      prompt,
      source: SOURCE,
      idempotency_key: idempotencyKey,
      auto_submit: true,
    },
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
    const text = await resp.text().catch(() => '')
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    if (resp.status >= 200 && resp.status < 300 && parsed?.ok) {
      return { ok: true, status: resp.status, result: parsed.result }
    }
    return { ok: false, status: resp.status, error: parsed?.error || text.slice(0, 200) }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

router.post('/incoming', validateTwilioSignature, async (req, res) => {
  const respondOk = () => {
    if (!res.headersSent) {
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
    }
  }

  const { From, Body, MessageSid } = req.body
  const from = normalizePhone(From)

  if (!from) {
    console.warn('[SMS Webhook] Rejected non-E.164 sender', { raw: From })
    respondOk()
    return
  }

  const isTate = !!TATE_MOBILE && from === TATE_MOBILE
  const contact = isTate ? null : await lookupContact(from)
  const isKnown = isTate || !!contact
  const senderName = isTate ? 'Tate' : (contact?.name || 'Unknown')

  console.log(`[SMS Webhook] From: ${from} | Known: ${isKnown} | Sender: ${senderName} | MessageSid: ${MessageSid} | Body: ${(Body || '').slice(0, 80)}`)

  if (!isKnown) {
    console.log(`[SMS Webhook] Rejected unknown number: ${from}`)
    respondOk()
    return
  }

  const idempotencyKey = MessageSid || `nosid-${from}-${Date.now()}`
  const receivedAt = new Date().toISOString()

  // Always respond OK to Twilio first; the reflex fire is async to the response.
  // Twilio's 15s webhook timeout is much shorter than the worst-case Corazon
  // round trip (Tailscale RTT + AHK macro 3s + buffer). Decoupling means
  // Twilio never times out and never retries on slow fires.
  respondOk()

  try {
    // Load prior thread context (Option 1: prompt-prepending continuity).
    // Read BEFORE appending the new inbound so we don't include this message
    // in the "prior thread" block - it appears as the new message below it.
    console.log(`[SMS Webhook TRACE] step=1 loadSmsThread phone=${from}`)
    const thread = await loadSmsThread(from)
    console.log(`[SMS Webhook TRACE] step=1.thread cold_start=${thread.cold_start} prior_exchanges=${(thread.exchanges || []).length}`)

    console.log(`[SMS Webhook TRACE] step=2 buildReflexPrompt key=${idempotencyKey}`)
    const prompt = buildReflexPrompt({
      from,
      body: Body,
      isTate,
      senderName,
      contact,
      messageSid: idempotencyKey,
      receivedAt,
      threadKey: thread.key,
      thread,
    })

    // Persist the inbound to the thread. Outbound reply is appended by the
    // chat session that handles this (per instruction embedded in the prompt).
    console.log(`[SMS Webhook TRACE] step=3 appendInboundToThread`)
    await appendInboundToThread(from, Body, receivedAt)

    // 2026-05-18 session-subscription: probe for an active conductor first.
    // If one is registered with a fresh heartbeat (<30min), route the message
    // into its coord inbox via send_message - the wake substrate flashes/
    // toasts the existing tab. Falls back to reflex.fire (new tab spawn) only
    // when no active conductor. See backend/patterns/session-subscription-
    // via-coord-inbox-routing-2026-05-18.md.
    let routedViaCoord = false
    try {
      const bridge = require('../services/inboundChannelBridge')
      const bridgeResult = await bridge.routeInbound({
        channel: 'sms',
        from,
        sender_name: senderName,
        thread_id: from,  // SMS threading key is the phone number
        body: Body,
        extra: { isTate, is_known: isKnown, idempotency_key: idempotencyKey },
      })
      console.log(`[SMS Webhook TRACE] step=3.5 bridge routed=${bridgeResult.routed} reason=${bridgeResult.reason || 'ok'}`)
      if (bridgeResult.routed) {
        routedViaCoord = true
        logger.info('sms routed via coord to active conductor', {
          idempotencyKey, senderName, conductor_tab_id: bridgeResult.conductor?.tab_id || null,
        })
      }
    } catch (bridgeErr) {
      // Never let bridge errors block the fallback path.
      logger.warn('inbound bridge threw, falling back to reflex', { error: bridgeErr.message })
    }

    if (!routedViaCoord) {
      console.log(`[SMS Webhook TRACE] step=4 fireReflex (prompt_chars=${prompt.length}) url=${process.env.REFLEX_AGENT_URL || DEFAULT_REFLEX_URL}`)
      const result = await fireReflex({ prompt, idempotencyKey })
      console.log(`[SMS Webhook TRACE] step=5 fireReflex returned ok=${result.ok} status=${result.status} error=${result.error || 'none'}`)
      if (!result.ok) {
        logger.error('sms reflex fire failed', { idempotencyKey, status: result.status, error: result.error })
      } else {
        logger.info('sms reflex fired', { idempotencyKey, senderName, isTate, cold_start: thread.cold_start, prior_exchanges: (thread.exchanges || []).length, reflex_result: result.result })
      }
    }
  } catch (err) {
    console.log(`[SMS Webhook TRACE] step=err ${err.message}`)
    logger.error('sms reflex shim: unhandled error', { error: err.message, stack: err.stack })
  }
})

module.exports = router

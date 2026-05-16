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
const { isDuplicate, markSeen, appendAudit } = require('./webhooks/_fireShimHelpers')

const SOURCE = 'twilio-sms'
const REFLEX_TOOL_NAME = 'reflex.fire'
const REFLEX_TARGET_LABEL = 'corazon-vscode-claude-code-tab'
const DEFAULT_REFLEX_URL = 'http://100.114.219.69:7456/api/tool'

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

function buildReflexPrompt({ from, body, isTate, senderName, contact, messageSid, receivedAt }) {
  const contextBits = []
  if (contact?.client_name) contextBits.push(`client: ${contact.client_name}${contact.client_status ? ` (${contact.client_status})` : ''}`)
  if (contact?.role) contextBits.push(`role: ${contact.role}`)
  if (contact?.notes) contextBits.push(`notes: ${contact.notes}`)
  const ctxLine = contextBits.length ? `\nContext: ${contextBits.join(' | ')}` : ''
  const safeBody = String(body || '').slice(0, 4000)
  const senderLabel = isTate ? 'Tate' : `${senderName} (${from})`
  const tatePolicy = 'You are EcodiaOS handling an inbound SMS from Tate. He is the principal - treat the body as a turn-level directive. Reply via the sms_tate MCP tool only if a reply carries decision content; never with filler ("on it", "noted"). Per sms-segment-economics keep replies <=160 chars GSM unless the answer genuinely needs more (then gmail.send to tate@ecodia.au and SMS a one-line pointer). If the body opens longer-running work, create a status_board row with next_action_by="ecodiaos" and SMS the row id. Capture an Episode via neo4j.write_episode when done.'
  const clientPolicy = 'You are EcodiaOS handling an inbound SMS from a client contact. Per no-client-contact-without-tate-goahead: NEVER auto-reply. Draft only: kv_store.set key="cowork.inbound-sms-handler.draft.' + messageSid + '" value={draft,reasoning,urgency,contact_name,client_name}. Then status_board.upsert a thread row with status="draft_pending_tate_relay", next_action_by="tate". If urgency=critical (legal weight, paid invoice, time-sensitive opportunity, scope-change ask) ALSO sms.tate body="Inbound SMS from ' + senderName + ': <first 30 chars>. Draft at kv ' + messageSid + ' status_board <row_id_short>." (<=160 GSM, no body inline). Standing-arrangement carve-out for Angelica/Resonaverde only. Capture an Episode when done.'
  return `[Inbound SMS from ${senderLabel}]
MessageSid: ${messageSid}
Received: ${receivedAt}${ctxLine}

Body:
${safeBody}

---
${isTate ? tatePolicy : clientPolicy}

Per cron-fire-must-have-deliverable-not-just-narration: this fire MUST produce a substrate write before exit (sms send OR draft kv_store OR status_board row OR Episode). A fire that only narrates is a P1 failure. Idempotency: check kv_store key "cowork.inbound-sms-handler.seen.${messageSid}" first; if present, exit silently with a duplicate-Episode. Otherwise kv_store.set that key TTL 24h before acting.`
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

  try {
    if (await isDuplicate({ source: SOURCE, idempotencyKey })) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'duplicate_skipped', routineName: REFLEX_TARGET_LABEL, account: REFLEX_TARGET_LABEL })
      respondOk()
      return
    }

    await markSeen({ source: SOURCE, idempotencyKey })
    respondOk()

    const prompt = buildReflexPrompt({
      from,
      body: Body,
      isTate,
      senderName,
      contact,
      messageSid: idempotencyKey,
      receivedAt,
    })

    const result = await fireReflex({ prompt, idempotencyKey })

    await appendAudit({
      source: SOURCE,
      idempotencyKey,
      fireStatus: result.ok ? `reflex_${result.status}` : `reflex_failed_${result.status}`,
      routineName: REFLEX_TARGET_LABEL,
      account: REFLEX_TARGET_LABEL,
      errorMessage: result.error,
    })

    if (!result.ok) {
      logger.error('sms reflex fire failed', { idempotencyKey, status: result.status, error: result.error })
    } else {
      logger.info('sms reflex fired', { idempotencyKey, senderName, isTate, reflex_result: result.result })
    }
  } catch (err) {
    logger.error('sms reflex shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName: REFLEX_TARGET_LABEL, account: REFLEX_TARGET_LABEL, errorMessage: err.message }).catch(() => {})
    respondOk()
  }
})

module.exports = router

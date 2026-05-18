'use strict'

/**
 * inboundChannelBridge.js - route inbound chat messages (SMS, Telegram) into
 * the active conductor's coord inbox instead of spawning a fresh CC tab.
 *
 * Per Tate verbatim 2026-05-18: "a chat is opened on the first text i send
 * per session then subscribes to further texts, then maybe unsubscribes at
 * the end once its done everything." This is the substrate that implements
 * "subscribes to further texts".
 *
 * Flow:
 *   1. Webhook (smsWebhook / telegram-bot) calls routeInbound(...).
 *   2. Bridge probes laptop-agent /api/mcp/coord get_conductor_state.
 *   3. If is_active=true (conductor heartbeat fresh, default 30min window),
 *      bridge calls coord.send_message {to: chat.conductor.inbox,
 *      body: {type: 'inbound_sms' | 'inbound_telegram', from, body, ...}}.
 *      The wake substrate (already shipped) flashes/toasts the conductor's
 *      tab so the message surfaces in the existing chat.
 *   4. If is_active=false (no conductor or stale heartbeat), bridge returns
 *      {routed:false} and the caller falls back to its existing path
 *      (reflex.fire / reflex.append_to_master).
 *
 * Conductor "subscribes" implicitly: any tab that calls coord.register_conductor
 * and then heartbeats via coord.conductor_heartbeat (UserPromptSubmit hook on
 * Corazon) becomes the active inbox. When that tab is closed or idle >30min,
 * the registration goes stale, the bridge returns false, and the next inbound
 * cold-spawns a fresh tab (which auto-registers on its first turn).
 *
 * Doctrine: backend/patterns/session-subscription-via-coord-inbox-routing-2026-05-18.md
 */

const logger = require('../config/logger')

const COORD_URL = process.env.COORD_MCP_URL || 'http://localhost:7456/api/mcp/coord'
const COORD_BEARER = process.env.COORD_MCP_BEARER || null
const COORD_PROBE_TIMEOUT_MS = 3000
const COORD_SEND_TIMEOUT_MS = 4000

async function _coordCall(method, params) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now() + Math.floor(Math.random() * 10000),
    method: 'tools/call',
    params: { name: method, arguments: params || {} },
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), COORD_SEND_TIMEOUT_MS)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (COORD_BEARER) headers.Authorization = `Bearer ${COORD_BEARER}`
    const resp = await fetch(COORD_URL, {
      method: 'POST', headers, body, signal: controller.signal,
    })
    const text = await resp.text().catch(() => '')
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    if (resp.status >= 200 && resp.status < 300 && parsed) {
      // MCP wraps tool results in {result: {content: [...]}}
      const inner = parsed.result?.content?.[0]?.text
      let unwrapped = null
      if (inner) { try { unwrapped = JSON.parse(inner) } catch { unwrapped = inner } }
      return { ok: true, raw: parsed, result: unwrapped }
    }
    return { ok: false, status: resp.status, error: parsed?.error?.message || text.slice(0, 200) }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Route an inbound chat message to the active conductor via coord bus.
 *
 * @param {Object} args
 * @param {string} args.channel - 'sms' | 'telegram'
 * @param {string} args.from - sender identifier (phone / telegram chat_id)
 * @param {string} args.body - message body
 * @param {string} [args.sender_name] - display name
 * @param {string} [args.thread_id] - optional thread id (chat_id, sms thread)
 * @param {Object} [args.extra] - extra context fields surfaced to the conductor
 * @returns {Promise<{routed: boolean, reason?: string, conductor?: Object}>}
 */
async function routeInbound({ channel, from, body, sender_name, thread_id, extra }) {
  if (!channel || !body) {
    return { routed: false, reason: 'missing_channel_or_body' }
  }
  const validChannels = ['sms', 'telegram']
  if (!validChannels.includes(channel)) {
    return { routed: false, reason: 'unknown_channel' }
  }

  // Probe conductor state. Fast-fail on any error - caller falls back to reflex.
  const state = await _coordCall('coord.get_conductor_state', {})
  if (!state.ok) {
    logger.warn('inboundChannelBridge: coord probe failed, falling back to reflex', {
      channel, error: state.error,
    })
    return { routed: false, reason: 'coord_probe_failed', error: state.error }
  }
  const probe = state.result
  if (!probe || !probe.is_active) {
    return {
      routed: false,
      reason: probe?.conductor ? 'conductor_stale' : 'no_conductor_registered',
      stale_ms: probe?.stale_ms || null,
    }
  }

  // Active conductor exists. Route the message to its inbox.
  const inboxBody = {
    type: channel === 'sms' ? 'inbound_sms' : 'inbound_telegram',
    from: from || null,
    sender_name: sender_name || null,
    thread_id: thread_id || null,
    body: body,
    received_at: new Date().toISOString(),
    ...(extra || {}),
  }
  const send = await _coordCall('coord.send_message', {
    to: 'chat.conductor.inbox',
    body: inboxBody,
  })
  if (!send.ok) {
    logger.warn('inboundChannelBridge: coord.send_message failed, falling back to reflex', {
      channel, error: send.error,
    })
    return { routed: false, reason: 'coord_send_failed', error: send.error }
  }

  logger.info('inboundChannelBridge: routed inbound via coord', {
    channel, from, conductor_tab_id: probe.conductor?.tab_id, body_chars: body.length,
  })
  return {
    routed: true,
    conductor: probe.conductor || null,
    message_id: send.result?.id || null,
  }
}

module.exports = { routeInbound }

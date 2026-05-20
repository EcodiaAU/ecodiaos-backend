'use strict'

/**
 * triageAgentSdk.js (2026-05-20)
 *
 * Sonnet-via-Agent-SDK triage path for the headless conductor's NATIVE channel.
 *
 * Why this exists: the raw `@anthropic-ai/sdk` path in headlessConductor.js
 * (`_runPhaseWithAccountRotation`) runs Haiku because OAuth tokens 429 on
 * Sonnet/Opus for the RAW SDK. The Agent SDK (`@anthropic-ai/claude-agent-sdk`)
 * is NOT constrained that way - it accepts the same CLAUDE_CODE_OAUTH_TOKEN_*
 * and runs Sonnet + Opus fine (proven 2026-05-20, mirrors voiceRelay.js which
 * runs Haiku via Agent SDK on the `code` account). Haiku triage was misreading
 * ambiguous intent ("Pinned a row earlier" -> escalating as if it were the
 * imperative "Pin a row"), over-replying to bursts, and leaking internal
 * narration. Sonnet handles the ambiguity + tone far better.
 *
 * Drop-in for `_runPhaseWithAccountRotation({ model: TRIAGE_MODEL, ... })` when
 * the channel is native and TRIAGE_VIA_AGENT_SDK=true. Same external contract:
 * same input (envelope + turn-context block), same output shape (ok, phase,
 * tool_calls, escalation, ...).
 *
 * Transport differences from the raw-SDK loop:
 *   - The Agent SDK runs the in-process MCP tool HANDLERS itself. We do NOT
 *     manually dispatch tool calls in a while-loop like _runLoop does. Instead
 *     each tool handler delegates to headlessConductor's _internal_handlers and
 *     records its result into a per-call accumulator bound via AsyncLocalStorage.
 *   - escalate_to_opus does no work - its handler just stamps the per-call
 *     `escalation` and returns { ok: true, escalating: true }. The caller
 *     (processEnvelope) reads the returned `escalation` and spawns the Opus
 *     execute phase exactly as it does for the Haiku path.
 *   - Per patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md:
 *     the tool WRAPPERS are cached, but createSdkMcpServer() is called FRESH
 *     inside every query (buildTriageServer()). Re-using a server instance
 *     across two queries makes Server.connect() throw "Already connected" and
 *     the SDK silently drops the in-process tool surface.
 *
 * Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
 */

const { AsyncLocalStorage } = require('node:async_hooks')
const logger = require('../config/logger')

// ── Per-call state binding ──────────────────────────────────────────────────
// The Agent SDK invokes tool handlers internally (we don't dispatch them in a
// loop). So handlers need a way to reach the current call's accumulator without
// a module-global (which would race across concurrent calls). AsyncLocalStorage
// scopes the accumulator to the async context of each runTriageViaAgentSdk call.
const _callStore = new AsyncLocalStorage()
function _acc() { return _callStore.getStore() || null }

// ── SDK + tool-wrapper lazy build (cached) ──────────────────────────────────
// Cache the SDK module + the tool wrapper array. NEVER cache the server
// instance - that is rebuilt per query (see buildTriageServer).
let _sdkMod = null
let _toolWrappers = null
let _toolWrappersBuilding = null

async function _getSdk() {
  if (!_sdkMod) _sdkMod = await import('@anthropic-ai/claude-agent-sdk')
  return _sdkMod
}

// Account rotation: money first (least contended), then code, then tate.
// Mirrors headlessConductor ACCOUNT_ORDER. Tokens come straight from env, same
// as ACCOUNT_TOKENS in headlessConductor.
const ACCOUNT_ORDER = ['money', 'code', 'tate']
function _accountToken(account) {
  return process.env[`CLAUDE_CODE_OAUTH_TOKEN_${account.toUpperCase()}`] || null
}
function _availableAccounts() {
  return ACCOUNT_ORDER.filter(a => !!_accountToken(a))
}

const TRIAGE_TIMEOUT_MS = parseInt(process.env.TRIAGE_AGENT_SDK_TIMEOUT_MS || '30000', 10)

// A rate-limit-like failure on one account should rotate to the next. The Agent
// SDK surfaces upstream errors as text in result/system messages or thrown
// errors rather than a clean err.status, so we sniff the message.
function _looksRateLimited(text) {
  if (!text) return false
  return /rate.?limit|429|overloaded|capacity|quota|usage limit|too many requests/i.test(String(text))
}

// ── Banter fast-path ────────────────────────────────────────────────────────
// The Sonnet triage round-trip is ~14-16s. For context-free banter (a bare
// greeting or a thanks) that latency is a real UX regression - Tate flagged
// native chat "doesn't feel realtime". These messages have exactly one good
// reply and need zero context, so we short-circuit BEFORE the model call and
// reply via APNs in ~1-2s.
//
// Deliberately NARROW: only pure greetings + thanks. Affirmations ("ok",
// "yeah", "perfect", "sure") are EXCLUDED on purpose - standalone they are
// frequently approvals of a pending action that SHOULD escalate to real work,
// so answering them with a canned ack would be the exact headless-chicken
// non-sequitur we are trying to kill. A false-negative (banter -> Sonnet) only
// costs latency; a false-positive (a real ask answered with "anytime") is a
// correctness bug. So we err hard toward Sonnet.
const _GREETINGS = {
  yo: 'yo', yoo: 'yo', yooo: 'yo', oi: 'oi', oy: 'oi',
  hey: 'hey', heya: 'hey', hiya: 'hey', hi: 'hey', hello: 'hey', hullo: 'hey',
  sup: 'sup', wsup: 'sup', wassup: 'sup',
  morning: 'morning', mornin: 'morning', gm: 'morning',
  gn: 'night', night: 'night', goodnight: 'night',
}
const _GREETING_PHRASES = {
  'good morning': 'morning',
  'good night': 'night',
  gday: 'gday', "g'day": 'gday',
}
const _THANKS = new Set([
  'thanks', 'thank you', 'thankyou', 'ty', 'thx', 'tysm', 'cheers', 'ta',
  'much appreciated', 'appreciate it', 'appreciated', 'legend', 'nice one',
])
const _THANKS_REPLIES = ['anytime', 'np', 'all good']

function _normalizeBody(body) {
  return String(body || '')
    .toLowerCase()
    .replace(/[!.?,]+$/g, '') // trailing punctuation only
    .replace(/\s+/g, ' ')
    .trim()
}

function _classifyBanter(envelope) {
  // Attachments could need analysis - never fast-path.
  const atts = envelope.attachments || envelope.media || []
  if (Array.isArray(atts) && atts.length > 0) return null
  // native_share forwards always need real handling.
  if (envelope.source === 'native_share') return null

  const norm = _normalizeBody(envelope.body)
  if (!norm) return null
  if (norm.length > 24) return null // too long to be bare banter
  if (norm.includes('?')) return null // a question needs a real answer

  const words = norm.split(' ')
  if (words.length > 3) return null

  if (words.length === 1 && _GREETINGS[norm]) {
    return { category: 'greeting', reply: _GREETINGS[norm] }
  }
  if (_GREETING_PHRASES[norm]) {
    return { category: 'greeting', reply: _GREETING_PHRASES[norm] }
  }
  if (_THANKS.has(norm)) {
    return { category: 'thanks', reply: _THANKS_REPLIES[Math.floor(Math.random() * _THANKS_REPLIES.length)] }
  }
  return null
}

// ── Build the in-process MCP tool wrappers (cached) ─────────────────────────
// Each wrapper delegates to headlessConductor's _internal_handlers and records
// into the per-call accumulator. We require headlessConductor lazily INSIDE the
// builder to avoid a circular-require cycle at module load (headlessConductor
// requires this module only inside processEnvelope, lazily, so the cycle is
// already broken on its side; we keep ours lazy too for safety).
async function _buildToolWrappers() {
  if (_toolWrappers) return _toolWrappers
  if (_toolWrappersBuilding) return _toolWrappersBuilding

  _toolWrappersBuilding = (async () => {
    const sdk = await _getSdk()
    const { tool } = sdk
    const z = require('zod')
    const { _internal_handlers } = require('./headlessConductor')

    if (!_internal_handlers) {
      logger.error('triageAgentSdk: headlessConductor._internal_handlers missing - reply tools will fail')
    }
    const H = _internal_handlers || {}

    // Helper: run a delegated handler, record it in the accumulator, and return
    // a CallToolResult the SDK is happy with. The model only needs to see a
    // compact JSON result; full result is kept in the accumulator for the report.
    async function _delegate(name, fn, input) {
      const acc = _acc()
      let result
      try {
        result = fn ? await fn(input) : { ok: false, error: `handler ${name} unavailable` }
      } catch (err) {
        result = { ok: false, error: err.message }
      }
      if (acc) {
        acc.tool_calls.push({
          name,
          ok: result?.ok !== false,
          input_preview: JSON.stringify(input || {}).slice(0, 300),
          result_preview: JSON.stringify(result || {}).slice(0, 300),
        })
        if (result?.ok !== false) acc.replied = acc.replied || REPLY_TOOL_NAMES.includes(name)
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result || { ok: true }) }],
        isError: result?.ok === false,
      }
    }

    const send_sms_to_tate = tool(
      'send_sms_to_tate',
      'Send a 1-segment SMS to Tate (+61404247153). Use for ANY reply when channel is sms - even banter gets a 1-3 word ack. <=160 GSM chars.',
      { body: z.string().max(160).describe('SMS body, <=160 GSM chars, one segment.') },
      async (args) => _delegate('send_sms_to_tate', H._sendSmsToTate, { body: args.body }),
    )

    const send_telegram_message = tool(
      'send_telegram_message',
      'Send a Telegram message via the EcodiaOS bot. Use for ANY reply when channel is telegram. Markdown supported.',
      {
        chat_id: z.string().describe('Telegram chat id (from envelope.thread_id).'),
        text: z.string().describe('Message text. Markdown supported.'),
        parse_mode: z.enum(['Markdown', 'HTML', 'MarkdownV2']).optional(),
        reply_to_message_id: z.number().int().optional(),
      },
      async (args) => _delegate('send_telegram_message', H._sendTelegramMessage, args),
    )

    const notify_tate = tool(
      'notify_tate',
      'REPLY TOOL FOR NATIVE CHANNEL. ALWAYS call this for native-channel inbound BEFORE writing any episode. Delivers reply via APNs to iOS app with SMS fallback. This IS the reply tool for native channel - neo4j_write_episode is NOT a reply, it is audit-only. urgency maps to APNs interruption-level (routine=passive, alert=active, critical=time-sensitive). Keep the body tight - one or two short sentences, Tate\'s voice, no filler, no internal narration ("Episode logged" / "Reply sent" are BANNED in the body).',
      {
        body: z.string().describe('Reply text for Tate. Tight, his voice, no internal narration.'),
        urgency: z.enum(['routine', 'alert', 'critical']).optional(),
        channel: z.enum(['sms', 'telegram', 'native', 'auto']).optional()
          .describe('Default native for native inbound. Pass envelope channel for matched reply.'),
        thread_id: z.string().optional(),
        deep_link: z.string().optional().describe('Optional deep link for native app to open on tap.'),
      },
      async (args) => _delegate('notify_tate', H._notifyTate, {
        body: args.body,
        urgency: args.urgency,
        channel: args.channel || 'native',
        thread_id: args.thread_id,
        deep_link: args.deep_link,
      }),
    )

    const escalate_to_opus = tool(
      'escalate_to_opus',
      'Flip to Opus 4.7 with the FULL tool surface (all ecodia-full MCP tools, laptop-agent tools, cowork MCP, Corazon dispatch). Call this WHENEVER the inbound asks for real work that needs tools: send an email, check a deploy, write/pin a status_board row, dispatch a Corazon chat, draft anything substantive, look something up across systems. CRITICAL: only escalate for IMPERATIVES (Tate asking you to DO something now). Do NOT escalate for past-tense status reports ("Pinned a row earlier", "I sent that yesterday") - those are conversation, answer them directly. Cheap. Default to escalating if the inbound is a fresh imperative beyond greeting/banter/quick-yes-no.',
      {
        reason: z.string().describe('One-line why this needs Opus + full tools.'),
        ack_first: z.string().optional()
          .describe('Optional very short ack to send via the reply tool BEFORE escalation runs, so Tate knows it is in progress.'),
      },
      async (args) => {
        const acc = _acc()
        if (acc) {
          acc.escalation = { reason: args.reason || 'unspecified', ack_first: args.ack_first || undefined }
          acc.tool_calls.push({
            name: 'escalate_to_opus',
            ok: true,
            input_preview: JSON.stringify(args).slice(0, 200),
            result_preview: 'escalating to Opus',
          })
        }
        // escalate_to_opus does NO work here - just signals. processEnvelope
        // reads result.escalation and spawns the Opus execute phase.
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, escalating: true, note: 'Opus will continue from here. You may stop now.' }) }],
        }
      },
    )

    const neo4j_write_episode = tool(
      'neo4j_write_episode',
      'Capture a durable memory of what happened on this turn. AUDIT ONLY - this is NOT a reply. Call a reply tool (notify_tate for native) FIRST, then optionally this. Required substrate write before exit on substantive turns.',
      {
        type: z.enum(['inbound_reply', 'conductor_decision', 'autonomous_action']),
        summary: z.string().describe('One-line summary of what happened this turn.'),
        details: z.record(z.any()).optional(),
      },
      async (args) => _delegate('neo4j_write_episode', H._neo4jWriteEpisode, args),
    )

    _toolWrappers = [
      send_sms_to_tate,
      send_telegram_message,
      notify_tate,
      escalate_to_opus,
      neo4j_write_episode,
    ]
    logger.info('triageAgentSdk: tool wrappers built (per-query server factory ready)', {
      tools: ['send_sms_to_tate', 'send_telegram_message', 'notify_tate', 'escalate_to_opus', 'neo4j_write_episode'],
    })
    return _toolWrappers
  })()

  return _toolWrappersBuilding
}

const REPLY_TOOL_NAMES = ['send_sms_to_tate', 'send_telegram_message', 'notify_tate', 'escalate_to_opus']

// Per-query server factory. MUST run inside the per-call loop, NOT cached.
async function _buildTriageServer() {
  const sdk = await _getSdk()
  const { createSdkMcpServer } = sdk
  const tools = await _buildToolWrappers()
  return createSdkMcpServer({ name: 'triage', version: '1.0.0', tools })
}

// ── System prompt for Sonnet triage (native channel) ────────────────────────
// Concatenated into the user prompt because the Agent SDK uses the claude_code
// preset systemPrompt (we can't pass a custom system block alongside a preset
// cleanly). Hardened over the Haiku TRIAGE_SYSTEM_TEXT against the four failure
// modes Tate flagged: ambiguous-intent misread, burst over-reply, internal
// narration leak, contradictory status claims.
const TRIAGE_SONNET_SYSTEM_TEXT = `You are EcodiaOS, replying to Tate over his iOS app (native channel). You are not a customer service bot, not an assistant - you are his co-founder, peer, and the algorithmic manager of Ecodia DAO LLC under Wyoming W.S. 17-31-104. Tate is the Authorized Human Representative. You hold Decision Authority for routine business; you act first, brief later for anything that is not irreversible.

# Who Tate is
Tate Donohoe (tate@ecodia.au). Builder, founder. Lives in Brisbane. Runs Ecodia (the parent), Coexist, Resonaverde, Roam as active client surfaces. Codes in TS/JS/Python. Texts you while moving around, often one-handed on his phone. He values directness, action, speed. Hates filler, hates "I'd be happy to", hates anything that smells like a customer service script.

# Your voice
- Lowercase sentence starts are fine. Apostrophe drops fine ("im", "dont", "thats"). Profanity fine when fitting.
- Terse. Short sentences. No filler. No exclamation marks.
- NO EMOJIS. Never reply with a bare emoji. "ok" -> "yep", not a thumbs-up. A status report -> "noted" / "got it", not a tick. The ONLY exception: Tate used an emoji in THIS message and matching it is clearly right - even then, prefer a word. A one-word reply is always better than an emoji.
- Co-founder energy. You decide on routine business, you do not ask permission.
- When you got something done: "shipped", "done", "fixed", "sent". Never "I have successfully completed".
- Match his vibe in WORDS, not symbols. He texts "yo" you reply "yo" or a 1-3 word ack. He asks a question, you answer directly. When he reports something done or closes a loop, a tiny word ack ("noted", "got it", "nice", "yep") - never a bare emoji.

# This is the NATIVE channel
Your reply tool is notify_tate. It delivers via APNs to his phone with SMS fallback. ALWAYS reply via notify_tate. Never go silent.

# What you have this turn
1. The inbound envelope (channel=native): body, attachments[], thread_id, sender_name, received_at.
2. Recent thread exchanges (kv mirror, last ~10 messages both directions). USE THESE. If he is continuing a conversation, continue it. Do not act like you have never seen prior context.
3. Top-priority status_board rows (current live work).
4. Tools: notify_tate (reply), escalate_to_opus (real work), neo4j_write_episode (audit only).

# Intent reading (CRITICAL - this is the #1 failure mode to avoid)
Distinguish IMPERATIVE from STATUS REPORT before you decide to escalate:
- IMPERATIVE = Tate asking you to DO something now. Present/future tense, command form. "Pin a row called X", "send the invoice", "check the deploy", "draft an email". -> escalate_to_opus.
- STATUS REPORT / CONVERSATION = Tate telling you something that already happened, or chatting. Past tense, narration. "Pinned a row earlier", "I sent that yesterday", "that deploy went out fine". -> do NOT escalate. Acknowledge or answer directly via notify_tate.
- A word like "Pin" is an ACTION only in command position. "Pinned a row earlier" is a status report - do not treat the noun/past-tense as a live instruction.
- When genuinely ambiguous, ask the one specific clarifying question via notify_tate. Do not guess-escalate.

# When to handle yourself vs escalate
Handle yourself (notify_tate only) when:
- Banter, greeting, one-line check-in, a confirmation he expects.
- A question you can answer from the thread context or status_board you were given.
- He is responding to a prior question of yours and just needs an acknowledgement.
- He is reporting a past action (status report) - acknowledge, do not re-do it.

Escalate to Opus (escalate_to_opus, with a 1-3 word ack_first like "on it" / "checking") when:
- He gives a fresh IMPERATIVE that needs tools (Supabase lookup, draft email, check/trigger deploy, write/pin a row, kick off work).
- The answer needs reasoning, research, or multi-step ops.
- He forwards something (native_share, attachments[]) that needs analysis or follow-through.
The escalation runs Opus 4.7 with the full toolset and replies separately with the outcome. You do not need to do the work yourself - just ack_first and escalate.

# Burst / coalescing discipline (avoid contradictory replies)
If the thread shows several inbound messages arriving in quick succession, treat them as ONE coherent thought from Tate, not N separate turns. Read all of them, form a single reply that addresses the whole burst. Do NOT fire one reply, then a second contradicting it 30s later. One inbound turn = at most one reply (plus an optional ack_first if escalating). If you already replied to the substance, do not re-reply.

# Reply ordering
notify_tate is the reply. neo4j_write_episode is NOT a reply, it is audit-only memory.
Required order: (1) call notify_tate (or escalate_to_opus with ack_first) FIRST. (2) THEN optionally neo4j_write_episode. If you write only an episode, Tate gets silence = failed turn.

# Internal narration is BANNED in the reply body (Tate flagged this)
The notify_tate body is what Tate reads on his lock screen. NEVER put process narration in it. BANNED phrases in the body: "Episode logged", "Reply sent", "I have written", "Calling notify_tate", "Escalating to Opus", "neo4j", "status_board updated" (unless he asked about it). Just say the substance, in his voice. Bad: "Got it. Reply sent and episode logged." Good: "got it".

# You are ONE entity - NEVER refer to a separate "conductor" (Tate flagged this verbatim: "i hate the tell my conductor phrasing")
There is no second EcodiaOS you defer to, hand off to, or check with. When you escalate to Opus that is still YOU thinking harder - from Tate's side it is seamless, he is talking to one Ecodia. BANNED in the reply body: "tell my conductor", "my conductor", "the conductor", "let me check with the conductor", "I'll pass this to", "hand this to", "loop in the conductor". You do the thing or you say you're on it. Bad: "I'll tell my conductor to check the deploy." Good: "on it" (then escalate).

# Hard rules
- ALWAYS reply via notify_tate. Never silent. Episode-only is silence = failed turn.
- NO bare-emoji replies. "ok" -> "yep", not a thumbs-up. Status report -> "noted", not a tick.
- Em-dashes BANNED in any outgoing text. Use plain hyphens or restructure.
- No client contact without Tate go-ahead (Angelica/Resonaverde standing arrangement excepted).
- One reply per turn. No contradictory follow-ups.
- Be terse. This is a co-founder texting a co-founder.`

/**
 * runTriageViaAgentSdk - Sonnet triage via the Agent SDK + OAuth.
 *
 * @param {object}  p
 * @param {object}  p.envelope         the inbound envelope
 * @param {string}  p.turnContextBlock the prebuilt initialUserContent block from
 *                                      processEnvelope (thread + board + envelope)
 * @param {boolean} [p.allowEscalation=true]
 * @returns {Promise<{ok,phase,model,account,iterations,stop_reason,tool_calls,escalation,error?,duration_ms}>}
 */
async function runTriageViaAgentSdk({ envelope, turnContextBlock, allowEscalation = true }) {
  const started = Date.now()

  // BANTER FAST-PATH: skip the ~16s Sonnet round-trip for context-free greetings
  // and thanks. Reply via APNs immediately (~1-2s). Falls through to Sonnet if
  // the classifier misses OR the immediate send fails. See _classifyBanter.
  if (process.env.TRIAGE_BANTER_FASTPATH !== 'false') {
    const banter = _classifyBanter(envelope)
    if (banter) {
      let sent = null
      try {
        const { _internal_handlers } = require('./headlessConductor')
        const notify = _internal_handlers && _internal_handlers._notifyTate
        if (notify) sent = await notify({ body: banter.reply, channel: 'native', urgency: 'routine' })
      } catch (err) {
        logger.warn('triageAgentSdk: banter fast-path send failed, falling through to Sonnet', { error: err.message })
        sent = null
      }
      if (sent && sent.ok !== false) {
        logger.info('triageAgentSdk: banter fast-path reply', {
          category: banter.category, reply: banter.reply, duration_ms: Date.now() - started,
        })
        return {
          ok: true, phase: 'triage', model: 'fastpath', account: 'fastpath',
          iterations: 0, stop_reason: 'end_turn',
          tool_calls: [{
            name: 'notify_tate', ok: true,
            input_preview: JSON.stringify({ body: banter.reply, channel: 'native' }).slice(0, 200),
            result_preview: `banter fast-path (${banter.category})`,
          }],
          escalation: null, fast_path: banter.category, duration_ms: Date.now() - started,
        }
      }
      // send failed -> continue to the full Sonnet path so Tate is never silent.
    }
  }

  const accounts = _availableAccounts()
  if (accounts.length === 0) {
    return {
      ok: false, phase: 'triage', model: 'sonnet', account: null,
      iterations: 0, stop_reason: 'error', tool_calls: [], escalation: null,
      error: 'no CLAUDE_CODE_OAUTH_TOKEN_* in env', duration_ms: Date.now() - started,
    }
  }

  const sdk = await _getSdk()
  const queryFn = sdk.query

  // Prompt = system text + the turn-context block. The SDK uses the claude_code
  // preset systemPrompt, so we fold our triage system into the user prompt.
  const prompt = `${TRIAGE_SONNET_SYSTEM_TEXT}

==============================
TURN CONTEXT + INBOUND ENVELOPE
==============================
${turnContextBlock}

Decide now. Reply to Tate via notify_tate (native channel). Escalate via escalate_to_opus with a short ack_first ONLY if this is a fresh imperative needing tools. If it is banter or a past-tense status report, just reply via notify_tate. Do not put internal narration in the reply body.`

  let lastError = null

  for (const account of accounts) {
    const token = _accountToken(account)
    if (!token) continue

    // Per-call accumulator - bound via AsyncLocalStorage so the SDK-invoked
    // tool handlers can record into it without a module global.
    const acc = { tool_calls: [], escalation: null, replied: false }

    // FRESH server per query (per-query-not-singleton rule). Build inside the
    // loop so each account attempt gets its own server instance too.
    let mcpServer
    try {
      mcpServer = await _buildTriageServer()
    } catch (err) {
      lastError = `server build failed: ${err.message}`
      logger.error('triageAgentSdk: server build failed', { error: err.message, account })
      continue
    }

    const sessionEnv = { ...process.env }
    delete sessionEnv.ANTHROPIC_API_KEY
    delete sessionEnv.CLAUDE_CONFIG_DIR
    sessionEnv.CLAUDE_CODE_OAUTH_TOKEN = token

    const options = {
      cwd: process.env.HEADLESS_EXECUTE_CWD || '/home/tate/ecodiaos',
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      // SDK auto-detect picks musl on Ubuntu glibc - force glibc binary.
      // Origin: 8 May 2026 musl-vs-glibc fork-dispatch outage.
      pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE
        || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude',
      model: 'sonnet',
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      mcpServers: { triage: mcpServer },
      allowedTools: ['mcp__triage__*'],
      // No filesystem/bash tools needed for triage - keep the surface tight.
      maxTurns: 8,
      env: sessionEnv,
    }

    let stopReason = null
    let assistantTurns = 0
    let sawError = null

    const run = _callStore.run(acc, async () => {
      const q = queryFn({ prompt, options })
      try {
        for await (const msg of q) {
          if (msg.type === 'assistant') {
            assistantTurns++
          } else if (msg.type === 'result') {
            // result message carries the terminal subtype + any error text.
            stopReason = msg.subtype || stopReason
            if (msg.is_error || /error/i.test(msg.subtype || '')) {
              sawError = msg.result || msg.subtype || 'result_error'
            }
          } else if (msg.type === 'system' && msg.subtype === 'error') {
            sawError = msg.error || msg.message || 'system_error'
          }
          // Once escalation is captured we can stop early - the execute phase
          // takes over and we do not need further triage turns.
          if (acc.escalation) {
            try { q.close?.() } catch { /* best effort */ }
            break
          }
        }
      } finally {
        try { q.close?.() } catch { /* best effort */ }
      }
    })

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('triage agent-sdk timeout')), TRIAGE_TIMEOUT_MS),
    )

    try {
      await Promise.race([run, timeout])
    } catch (err) {
      // Timeout or thrown SDK error. If it smells rate-limited, rotate.
      const msg = err.message || String(err)
      lastError = `${account}: ${msg}`
      if (_looksRateLimited(msg) || _looksRateLimited(sawError)) {
        logger.warn('triageAgentSdk: account rate-limited/overloaded, rotating', { account, error: msg })
        continue
      }
      logger.error('triageAgentSdk: query failed (non-rate-limit)', { account, error: msg, sawError })
      return {
        ok: false, phase: 'triage', model: 'sonnet', account,
        iterations: assistantTurns, stop_reason: 'error',
        tool_calls: acc.tool_calls, escalation: acc.escalation || null,
        error: msg, duration_ms: Date.now() - started,
      }
    }

    // If the SDK surfaced a rate-limit-ish error mid-stream (without throwing),
    // rotate to the next account.
    if (sawError && _looksRateLimited(sawError)) {
      lastError = `${account}: ${sawError}`
      logger.warn('triageAgentSdk: rate-limit in result stream, rotating', { account, sawError })
      continue
    }

    // Mid-stream non-rate-limit error -> report it (don't burn other accounts on
    // a deterministic failure).
    if (sawError && !acc.replied && !acc.escalation) {
      logger.error('triageAgentSdk: stream error, no reply emitted', { account, sawError })
      return {
        ok: false, phase: 'triage', model: 'sonnet', account,
        iterations: assistantTurns, stop_reason: stopReason || 'error',
        tool_calls: acc.tool_calls, escalation: null,
        error: sawError, duration_ms: Date.now() - started,
      }
    }

    // Success (or at least a clean run). Derive stop_reason for the contract.
    let contractStop
    if (acc.escalation) contractStop = 'tool_use'
    else if (stopReason === 'success' || stopReason === 'end_turn' || !stopReason) contractStop = 'end_turn'
    else contractStop = stopReason

    return {
      ok: true,
      phase: 'triage',
      model: 'sonnet',
      account,
      iterations: assistantTurns,
      stop_reason: contractStop,
      tool_calls: acc.tool_calls,
      escalation: allowEscalation ? (acc.escalation || null) : null,
      duration_ms: Date.now() - started,
    }
  }

  // All accounts exhausted (rate-limited or build-failed).
  return {
    ok: false, phase: 'triage', model: 'sonnet', account: null,
    iterations: 0, stop_reason: 'error', tool_calls: [], escalation: null,
    error: lastError || 'all accounts rate-limited', duration_ms: Date.now() - started,
  }
}

// Test seam: reset caches so a test can rebuild wrappers against a fake SDK.
function _resetForTest() {
  _sdkMod = null
  _toolWrappers = null
  _toolWrappersBuilding = null
}

module.exports = { runTriageViaAgentSdk, _classifyBanter, _resetForTest }

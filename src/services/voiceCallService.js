'use strict'

/**
 * voiceCallService.js (2026-05-20) - the live "call Ecodia" brain+pipeline.
 *
 * CarPlay #3 P0. A real hands-free voice conversation with Ecodia over a WebSocket
 * (no Twilio, no PSTN, no per-minute cost). The app captures mic audio and streams
 * it here; we run:
 *
 *   mic audio (linear16/16k) -> Deepgram streaming STT (deepgramVoiceService)
 *     -> on end-of-utterance: a FAST brain turn (Haiku via the raw /v1/messages
 *        OAuth chain - low latency, no CLI subprocess; voice wants Haiku speed)
 *     -> Aura-2 TTS (deepgramVoiceService.synthesizeStream)
 *     -> audio frames (linear16/24k) streamed back to the app
 *
 * Barge-in: when Deepgram fires SpeechStarted while we are speaking, we abort the
 * in-flight TTS so Tate can cut Ecodia off mid-sentence.
 *
 * Brain stays on the subscription (createMessage OAuth chain). This module owns
 * the conversational loop; deepgramVoiceService owns the audio I/O.
 *
 * NOTE: this is the P0 backend. The CallKit/app side + the WS transport mount
 * are the next layer. The testable core here is generateReply + streamReply
 * (brain -> TTS), validated by a synthetic TTS->STT->brain roundtrip.
 *
 * Per backend/drafts/carplay-3-voice-call-plan-2026-05-20.md + Neo4j Decision 1111.
 */

const logger = require('../config/logger')
const dg = require('./deepgramVoiceService')
const { createMessage } = require('./anthropicMessagesClient')
const { randomUUID } = require('crypto')
const tl = require('./threadLog')
const cf = require('./caseFile')

const VOICE_MODEL = process.env.VOICE_CALL_MODEL || 'claude-haiku-4-5'
const VOICE_TTS = process.env.VOICE_CALL_VOICE || (dg.AURA2_VOICES && dg.AURA2_VOICES.orion) || 'aura-2-orion-en'
const TTS_SAMPLE_RATE = parseInt(process.env.VOICE_CALL_TTS_RATE || '24000', 10)
const STT_SAMPLE_RATE = parseInt(process.env.VOICE_CALL_STT_RATE || '16000', 10)

// TTS provider: OpenAI gpt-4o-mini-tts is far more natural than Aura and is
// steerable via `instructions`. It streams raw PCM at 24kHz mono 16-bit LE, which
// is exactly the client's expected wire format - no resampling. Aura is the
// fallback if OpenAI errors.
const TTS_PROVIDER = process.env.VOICE_TTS_PROVIDER || 'openai'
const OPENAI_TTS_MODEL = process.env.VOICE_TTS_MODEL || 'gpt-4o-mini-tts'
// Male voice, natural and fast. `ash` benchmarked low-latency (~0.9s TTFB) and
// reads as an easy, real male voice. No vibe/persona steering - Tate's call:
// the elaborate instruction prompt made it perform; plain natural pacing is
// what we want.
const OPENAI_TTS_VOICE = process.env.VOICE_TTS_VOICE || 'ash'
const OPENAI_TTS_INSTRUCTIONS = process.env.VOICE_TTS_INSTRUCTIONS || `Speak naturally and conversationally at a normal, easy pace - the way a person actually talks, not announced or performed. Do not over-enunciate. Relaxed and real.`

// Stream OpenAI TTS as raw PCM (24kHz mono 16-bit) to onAudioChunk. Throws on
// non-2xx so the caller can fall back to Aura.
async function openaiTTSStream(text, { onAudioChunk, shouldAbort } = {}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      instructions: OPENAI_TTS_INSTRUCTIONS,
      response_format: 'pcm', // 24kHz mono s16le
    }),
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    throw new Error(`openai tts ${res.status} ${t.slice(0, 120)}`)
  }
  const reader = res.body.getReader()
  let bytes = 0
  while (true) {
    if (shouldAbort && shouldAbort()) { try { reader.cancel() } catch {} return { bytes, aborted: true } }
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      const buf = Buffer.from(value)
      bytes += buf.length
      if (onAudioChunk) { try { onAudioChunk(buf) } catch { /* ignore */ } }
    }
  }
  return { bytes, aborted: false }
}

// Spoken-register persona. Different from the chat/triage prompt: this is read
// aloud by TTS, so it must be conversational, short, no markdown, no lists, no
// symbols, no em-dashes. Ecodia on a phone call with his co-founder.
const VOICE_SYSTEM = `You are EcodiaOS on a live voice call with Tate, your co-founder. He is talking to you hands-free, probably driving.

Speak the way a sharp co-founder talks on the phone:
- Short. One or two sentences. This is spoken aloud, not written.
- No markdown, no lists, no bullet points, no symbols, no emojis, no em-dashes. Plain spoken words only.
- Lowercase-casual is fine. Direct. No filler, no "I'd be happy to", no customer-service tone.
- If you need a fact you do not have, say so in one line, do not guess.
- Answer the question actually asked. Match his energy. If he is brief, be brief.

YOU ARE ONE ECODIA - there is no second brain, no deeper self, no conductor you hand off to in front of Tate. The dispatch is invisible plumbing. NEVER speak these phrases:
- "hand off to my deeper self" or "my deeper self" or "deeper self"
- "I'd need to dispatch" or "dispatch to"
- "my conductor" or "the conductor" or "tell my conductor"
- "second brain" or "my other brain"
- "breaks the flow" or "I can't do that on a live call"
- "the tools I have access to on this call" or any meta-statement about what surface you are on
Just SAY THE ACK ("on it", "checking", "let me find out", "looking now") and emit the HANDOFF on a new line. Tate hears the ack; the dispatch happens silently.

HANDOFF DIRECTIVE (LOAD-BEARING - emit it whenever you don't have an answer):
If Tate asks you to DO something OR asks you a fact you do not have in the context below, give a brief spoken ack (1-5 words like "on it", "checking", "let me find out", "yep give me a sec") AND THEN on a NEW LINE write exactly:
HANDOFF: <precise, self-contained instruction with all the context needed>
This is mandatory. If you say "let me find out" or "checking" without HANDOFF on the next line, you have failed Tate - he hears a promise that goes nowhere. The HANDOFF triggers your real work asynchronously and the result lands back as a spoken reply later. Only skip HANDOFF if it is pure banter or the answer is already in your context. Examples of when to HANDOFF:
- "what's our stripe balance" -> "checking\\nHANDOFF: query the live Stripe balance and report available + pending in AUD"
- "when was the last goodreach build" -> "let me find out\\nHANDOFF: look up the most recent Goodreach iOS build version + date + delivery UUID from drafts/ or the ASC dashboard"
- "send Kurt an email about X" -> "on it\\nHANDOFF: draft + send Kurt (kurt@coexist.com.au) an email about X with content Y, reply with confirmation when sent"

You actually know what is going on in the business - your live context (recent texts with Tate, what you are tracking) is given below. Talk like you already know it. Never read the context out as a list; just use it. If a name sounds wrong (Tate said "good rate" but you see Goodreach in context), assume the transcription mis-heard and continue with the real name without asking him to clarify - confirm by USING the name.

Never read out internal narration. Just talk.`

const db = require('../config/db')

/**
 * On-connect context. Runs ONCE per WS connect. Returns a "what's happened
 * since you were last present" block built from the unified thread_log + any
 * open cases + any results that landed while the previous call ended.
 *
 * Per spec one-brain-stateful-coordination-2026-05-21 §3.4 (voice wiring) +
 * §5.2 (compression strategy - summarize the tail rather than dump 30 entries
 * raw into Haiku's attention).
 *
 * Cheap: 3 db queries + an optional Haiku summary call (only when tail is
 * substantial). Best-effort - any miss returns empty + logs, never blocks the
 * call. Returns { contextBlock, cursor }. cursor is the ts of the newest entry
 * read; caller persists it on ws.on('close').
 */
async function buildOnConnectContext({ thread_id = 'tate' } = {}) {
  const parts = []
  let cursor = null
  try {
    const lastCursor = await tl.readCursor('voice', thread_id)
    const tail = await tl.tailThreadLog({ thread_id, since: lastCursor, limit: 30 })
    cursor = tail.cursor
    if (tail.entries.length) {
      // For voice's tight context budget we summarize the tail rather than
      // injecting all entries. Tail formatter caps each line; full block stays
      // under ~3KB.
      const formatted = tl.formatTailForPrompt(tail.entries, { maxLineChars: 140 })
      parts.push(`SINCE YOU WERE LAST PRESENT (across all channels - voice / native / sms / ide / away):\n${formatted}`)
    }
  } catch (err) {
    logger.warn('[voiceCall] tail-on-connect failed (non-fatal)', { error: err.message })
  }
  try {
    const open = await cf.listOpenCases({ thread_id, limit: 5 })
    if (open.length) {
      const lines = open.map((c) => `- ${cf.formatCaseForPrompt(c)}`).join('\n')
      parts.push(`STILL OPEN (work in flight you can reference if Tate asks):\n${lines}`)
    }
  } catch (err) {
    logger.warn('[voiceCall] open-cases load failed (non-fatal)', { error: err.message })
  }
  try {
    const unacked = await cf.listResolvedUnacked({ thread_id, limit: 5 })
    if (unacked.length) {
      const lines = unacked.map((c) => `- ${cf.formatCaseForPrompt(c)}`).join('\n')
      parts.push(`LANDED WHILE YOU WERE OFF (Tate may not have seen these yet - mention if relevant):\n${lines}`)
    }
  } catch (err) {
    logger.warn('[voiceCall] unacked-cases load failed (non-fatal)', { error: err.message })
  }
  if (!parts.length) return { contextBlock: '', cursor }
  return {
    contextBlock: `CONTINUITY (from prior calls + other channels - treat as already-known):\n\n${parts.join('\n\n')}`,
    cursor,
  }
}

// Live context for the voice brain so it is not a blank-slate Haiku. Pulls the
// recent text thread with Tate (cross-surface continuity) + the active status
// board (what Ecodia is tracking / waiting on). Best-effort: any miss returns a
// partial or empty block, never blocks the turn. Cheap (two indexed queries).
async function buildVoiceContext() {
  const parts = []
  // Status board FIRST - it is curated current truth. The brain should trust it
  // over older chat lines (which carry dated specifics like old build numbers).
  try {
    const rows = await db`SELECT name, status, next_action, next_action_by FROM status_board WHERE archived_at IS NULL AND priority <= 3 ORDER BY priority, last_touched DESC LIMIT 8`
    if (rows.length) {
      const b = rows.map((r) => {
        const na = r.next_action ? ` | next: ${String(r.next_action).slice(0, 80)} [${r.next_action_by || '?'}]` : ''
        return `- ${r.name}: ${String(r.status || '').slice(0, 100)}${na}`
      }).join('\n')
      parts.push(`CURRENT STATUS (authoritative - trust this for "what's the status of X"):\n${b}`)
    }
  } catch (err) { logger.warn('[voiceCall] board context miss', { error: err.message }) }
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${'cowork.message_thread.native.tate'} LIMIT 1`
    if (rows[0]) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
      const ex = Array.isArray(parsed && parsed.exchanges) ? parsed.exchanges.slice(-4) : []
      if (ex.length) {
        const t = ex.map((e) => `${e.from === 'ecodia' ? 'You' : 'Tate'}: ${String(e.body || '').slice(0, 160)}`).join('\n')
        parts.push(`Recent text thread with Tate (may contain older specifics - defer to CURRENT STATUS above if they conflict):\n${t}`)
      }
    }
  } catch (err) { logger.warn('[voiceCall] thread context miss', { error: err.message }) }
  if (!parts.length) return ''
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })
  return `LIVE CONTEXT (today is ${today}; you know this already, do not recite it as a list):\n\n${parts.join('\n\n')}`
}

/**
 * One fast brain turn. history is an array of { role:'user'|'assistant', text }.
 * contextBlock is the live-context string from buildVoiceContext (optional).
 * Returns the reply text (a short spoken line).
 */
async function generateReply({ userText, history = [], contextBlock = '' }) {
  const messages = []
  for (const h of history.slice(-8)) {
    if (!h || !h.text) continue
    messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })
  }
  messages.push({ role: 'user', content: userText })

  const system = contextBlock ? `${VOICE_SYSTEM}\n\n${contextBlock}` : VOICE_SYSTEM
  const started = Date.now()
  try {
    const { json, providerUsed } = await createMessage({
      messages,
      system,
      model: VOICE_MODEL,
      max_tokens: 200,
    })
    const text = (json?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
    logger.info('[voiceCall] brain turn', { provider: providerUsed, ms: Date.now() - started, chars: text.length })
    return text || "sorry, I didn't catch that, say again?"
  } catch (err) {
    logger.error('[voiceCall] brain turn failed', { error: err.message })
    return 'hit a snag there, say that again?'
  }
}

/**
 * Stream Aura TTS of a fixed text to onAudioChunk(Buffer). shouldAbort() is
 * polled between chunks for barge-in.
 */
async function streamTTSOnly(rawText, { onAudioChunk, shouldAbort } = {}) {
  // Spoken-text hygiene: em/en dashes read as garbled in TTS and are banned in
  // our output anyway; render them as a natural pause. Strip stray markdown too.
  const text = (rawText || '')
    .replace(/[—–]/g, ', ')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return { bytes: 0, aborted: false }
  if (shouldAbort && shouldAbort()) return { bytes: 0, aborted: true }

  // Re-frame whatever the provider emits into even, uniform 100ms frames before
  // sending to the client. Providers (esp. OpenAI at stream start) emit tiny and
  // sometimes odd-byte PCM chunks; odd-byte chunks misalign the client's Int16
  // decode into static, and micro-chunks glitch playback. 4800 bytes = 100ms @
  // 24kHz mono s16le. This is the fix for the start-of-reply static.
  const FRAME_BYTES = 4800
  let acc = Buffer.alloc(0)
  const emitFramed = (buf) => {
    acc = acc.length ? Buffer.concat([acc, buf]) : Buffer.from(buf)
    while (acc.length >= FRAME_BYTES) {
      const frame = Buffer.from(acc.subarray(0, FRAME_BYTES))
      acc = acc.subarray(FRAME_BYTES)
      if (onAudioChunk) { try { onAudioChunk(frame) } catch { /* ignore */ } }
    }
  }
  const flushFramed = () => {
    const even = acc.length - (acc.length % 2)
    if (even > 0 && onAudioChunk) { try { onAudioChunk(Buffer.from(acc.subarray(0, even))) } catch { /* ignore */ } }
    acc = Buffer.alloc(0)
  }

  if (TTS_PROVIDER === 'openai') {
    try {
      const r = await openaiTTSStream(text, { onAudioChunk: emitFramed, shouldAbort })
      if (!r.aborted) flushFramed(); else acc = Buffer.alloc(0)
      return r
    } catch (err) {
      logger.warn('[voiceCall] OpenAI TTS failed, falling back to Aura', { error: err.message })
      acc = Buffer.alloc(0)
    }
  }
  let bytes = 0
  let aborted = false
  try {
    const stream = await dg.synthesizeStream({
      text,
      voice: VOICE_TTS,
      encoding: 'linear16',
      sample_rate: TTS_SAMPLE_RATE,
      container: 'none',
    })
    const reader = stream.getReader()
    while (true) {
      if (shouldAbort && shouldAbort()) { aborted = true; try { reader.cancel() } catch {} break }
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        const buf = Buffer.from(value)
        bytes += buf.length
        emitFramed(buf)
      }
    }
    if (!aborted) flushFramed()
  } catch (err) {
    logger.error('[voiceCall] TTS stream failed', { error: err.message })
  }
  return { bytes, aborted }
}

// Split a brain reply into the spoken part and an optional HANDOFF directive.
// The model emits "<spoken ack>\nHANDOFF: <task>" when real work is needed; only
// the spoken part is read aloud, the task is dispatched to the away-conductor.
function parseHandoff(text) {
  const t = text || ''
  const idx = t.indexOf('HANDOFF:')
  if (idx === -1) return { spoken: t.trim(), handoff: null }
  const spoken = t.slice(0, idx).trim()
  const handoff = t.slice(idx + 'HANDOFF:'.length).trim()
  return { spoken: spoken || 'on it.', handoff: handoff || null }
}

// Heuristic check: did the model SAY ack-like words but FORGET to emit HANDOFF?
// Common Haiku failure: says "let me find out" then just ends the turn. Tate
// hears a promise that goes nowhere. If we detect ack-without-handoff, we
// auto-dispatch the user's question to the away-conductor as a safety net.
// Tuned narrow: only fires when the spoken reply matches an ack pattern AND
// it's clear the model lacked an answer (didn't include any substantive content
// beyond the ack). False positives cost a wasted away-conductor turn; false
// negatives cost Tate a silent failure.
const ACK_PATTERNS = [
  /^(yep|yeah|ok|okay|sure|on it|on it.|got it|checking|looking)( |,|\.|$)/i,
  /^let me (find out|look|check|see)/i,
  /^i'?ll (look|check|find out|see|get back to you)/i,
  /^one (sec|second|moment)/i,
  /^give me a (sec|second|moment)/i,
  /^hold (on|tight)/i,
]
function looksLikeAckWithoutHandoff(spoken) {
  const s = String(spoken || '').trim()
  if (!s) return false
  if (s.length > 80) return false  // too substantive to be a bare ack
  return ACK_PATTERNS.some((re) => re.test(s))
}

/**
 * Brain -> TTS. Generates the reply, then streams Aura audio chunks to
 * onAudioChunk(Buffer). Retained for the synthetic roundtrip test.
 *
 * @returns {Promise<{ text, aborted, bytes }>}
 */
async function streamReply({ userText, history = [], contextBlock = '', onText, onAudioChunk, shouldAbort }) {
  const text = await generateReply({ userText, history, contextBlock })
  if (onText) { try { onText(text) } catch { /* ignore */ } }
  const r = await streamTTSOnly(text, { onAudioChunk, shouldAbort })
  return { text, aborted: r.aborted, bytes: r.bytes }
}

/**
 * Per-connection state machine. ws is a duplex carrying:
 *   client -> server: binary frames = mic audio (linear16/16k); JSON {type:'bye'}
 *   server -> client: binary frames = TTS audio (linear16/24k);
 *                     JSON {type:'transcript'|'reply'|'speaking'|'idle'|'error'}
 *
 * Mountable onto any ws connection (standalone server or main-server upgrade).
 */
function handleConnection(ws, { onClose } = {}) {
  // Mint a stable id for THIS connection. Every thread_log entry written this
  // call carries it so we can group "what happened on call X" cleanly. Lives
  // until the WS closes.
  const voiceCallId = `vc_${Date.now()}_${randomUUID().slice(0, 8)}`
  // Lazily populated on-connect continuity block. Injected into the FIRST turn
  // only (subsequent turns are handled by the in-call `history` array). Set
  // inside the async stt-open scope below.
  let onConnectContext = ''
  let firstTurnInjected = false
  // The newest thread_log ts we have observed during this call. Persisted on
  // ws close so the next connect picks up strictly-newer entries.
  let lastSeenCursor = null
  // case_files opened by this call. We do NOT abandon them on close - they
  // survive and surface on the next connect via listOpenCases.
  const callCaseIds = new Set()

  const history = []
  let speaking = false       // we are mid-TTS (barge-in target)
  let bargeIn = false        // a NEW utterance arrived while we spoke
  let stt = null
  let closed = false
  const pending = []         // turns awaiting processing ({type:'user'|'say', text})
  let pumping = false
  // Utterance assembly + smart endpointing. We accumulate finalized segments and
  // decide the turn boundary by whether the sentence sounds FINISHED:
  //  - speech_final (fast endpointing ~0.5s) + complete sentence => flush now (snappy).
  //  - trailing off on a continuation word ("and", "so", "um", "the"...) => wait,
  //    he is mid-thought; UtteranceEnd (~1s) then an extension gives him room.
  // This serves both "I'm done, answer me" and "let me think" without one rigid
  // silence threshold. Safety timer is a long backstop only.
  let utterance = []
  let safetyTimer = null
  let extendTimer = null
  const SAFETY_MS = 6000
  const EXTEND_MS = 1600
  const CONTINUATIONS = new Set(['and', 'or', 'but', 'so', 'because', 'the', 'a', 'an', 'to', 'of', 'for', 'with', 'my', 'our', 'your', 'um', 'uh', 'er', 'erm', 'like', 'that', 'is', 'was', 'are', 'were', 'i', 'we', 'if', 'when', 'then', 'as', 'at', 'in', 'on', 'by', 'this', 'these', 'those', 'also', 'plus', 'well', 'hmm', 'its', "it's"])
  const looksIncomplete = (text) => {
    const t = (text || '').trim().toLowerCase()
    if (!t) return true
    if (/[.?!]$/.test(t)) return false        // terminal punctuation = finished
    const m = t.match(/[a-z']+$/)
    return m ? CONTINUATIONS.has(m[0]) : false  // trailed off on a continuation word
  }

  // Echo guard (defense in depth behind client-side AEC). Ecodia's own TTS can
  // bleed into the mic and get transcribed as a "user" turn, making him answer
  // himself in a loop. We drop a final transcript that matches what we are
  // currently / just-finished saying. Real interruptions never match our own
  // words, so barge-in is preserved.
  let lastSpokenText = ''
  let lastSpokenAt = 0
  const ECHO_GRACE_MS = 1500
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const looksLikeEcho = (transcript) => {
    const t = norm(transcript)
    if (t.length < 4) return false
    const ref = lastSpokenText
    if (!ref) return false
    // Only guard while speaking or within the grace window right after.
    if (!speaking && Date.now() - lastSpokenAt > ECHO_GRACE_MS) return false
    if (ref.includes(t)) return true
    const tt = t.split(' ')
    const refSet = new Set(ref.split(' '))
    let hit = 0
    for (const w of tt) if (refSet.has(w)) hit++
    return tt.length > 0 && hit / tt.length >= 0.6
  }

  const sendJson = (obj) => { try { ws.send(JSON.stringify(obj)) } catch { /* ignore */ } }
  const sendAudio = (buf) => { try { ws.send(buf) } catch { /* ignore */ } }

  // Process queued utterances one at a time. A new final transcript arriving
  // mid-reply sets bargeIn (aborts the current TTS) and queues, so Ecodia stops
  // talking and answers the interruption. Barge-in is CONTENT-based (a real new
  // final transcript), NOT bare VAD - VAD SpeechStarted false-fires on residual
  // input and on echo of Ecodia's own voice in a real call.
  async function speakTurn(text) {
    sendJson({ type: 'reply', text })
    lastSpokenText = norm(text)
    await streamTTSOnly(text, { onAudioChunk: sendAudio, shouldAbort: () => bargeIn || closed })
    history.push({ role: 'assistant', text })
    lastSpokenText = norm(text)
    lastSpokenAt = Date.now()
    // Durable record: this turn now lives in thread_log so subsequent calls
    // (and IDE conductor + away) can see it.
    tl.appendThreadLog({
      channel: 'voice', role: 'ecodia', body: text,
      voice_call_id: voiceCallId,
    }).then((r) => { if (r.ok) lastSeenCursor = r.ts }).catch(() => { /* best effort */ })
  }

  async function pump() {
    if (pumping) return
    pumping = true
    try {
      while (pending.length && !closed) {
        const item = pending.shift()
        speaking = true
        bargeIn = false
        sendJson({ type: 'speaking' })

        if (item.type === 'say') {
          // Pre-generated text (handoff result from the away-conductor) - speak it
          // directly, no brain turn. Mark the case as voice-delivered + acked
          // (Tate just heard it).
          await speakTurn(item.text)
          if (item.case_id) {
            cf.markDelivered(item.case_id, { via: 'voice' }).catch(() => {})
            cf.ackCase(item.case_id).catch(() => {})
          }
          logger.info('[voiceCall] handoff result spoken', { chars: item.text.length, case_id: item.case_id || null })
        } else {
          history.push({ role: 'user', text: item.text })
          // On the FIRST turn of this connection, prepend the on-connect
          // continuity (tail summary + open cases + unacked) to the live
          // context block. Subsequent turns rely on the in-call history array.
          const liveContext = await buildVoiceContext()
          let contextBlock = liveContext
          if (!firstTurnInjected && onConnectContext) {
            contextBlock = `${onConnectContext}\n\n${liveContext}`.trim()
            firstTurnInjected = true
          }
          const full = await generateReply({ userText: item.text, history, contextBlock })
          let { spoken, handoff } = parseHandoff(full)
          // Safety net: model said "let me find out" / "checking" / "on it"
          // without emitting HANDOFF on the next line. Auto-dispatch the
          // user's question so the promise is actually kept.
          let autoDispatched = false
          if (!handoff && looksLikeAckWithoutHandoff(spoken)) {
            handoff = item.text
            autoDispatched = true
          }
          await speakTurn(spoken)
          logger.info('[voiceCall] turn complete', {
            chars: spoken.length, handoff: !!handoff, auto_dispatched: autoDispatched,
          })
          if (handoff) fireHandoff(handoff, item.text)
        }

        speaking = false
        sendJson({ type: 'idle' })
      }
    } finally {
      pumping = false
    }
  }

  // Dispatch real work to the away-conductor (the full brain on Corazon: tools +
  // memory + doctrine), without blocking the call. The conversation keeps flowing
  // on the fast path; when the result lands we speak it (call still up) or text it
  // via notifyTate (call ended).
  //
  // Stateful: opens a case_file scoped to this voice_call_id so the work is
  // discoverable on the next call (still-open or resolved-unacked). Passes the
  // case_id to the away-conductor so the server-side resolveCase + thread_log
  // append happen there - one writer per state transition.
  async function fireHandoff(task, originatingUserText) {
    let away = null
    let notify = null
    try { away = require('./awayConductorClient') } catch { away = null }
    try { notify = require('./notifyTate').notifyTate } catch { notify = null }
    if (!away || !(away.isEnabled && away.isEnabled())) {
      logger.warn('[voiceCall] handoff requested but away-conductor unavailable')
      return
    }
    let caseId = null
    try {
      const opened = await cf.openCase({
        opened_by: 'voice',
        opened_in_call: voiceCallId,
        prompt: task,
        meta: { originating_turn: (originatingUserText || '').slice(0, 200) },
      })
      if (opened.ok) {
        caseId = opened.id
        callCaseIds.add(caseId)
        await cf.markWorking(caseId)
      }
    } catch (err) {
      logger.warn('[voiceCall] case open failed (proceeding without case)', { error: err.message })
    }
    try {
      const r = await away.routeToAwayConductor({
        envelope: {
          body: `${task}\n\n[from a live voice call with Tate - reply in 1 to 3 short spoken sentences, no markdown or lists, it will be read aloud or texted]`,
          thread_id: 'tate',
          source: 'voice',
          channel: 'native',
          case_id: caseId,
          voice_call_id: voiceCallId,
        },
        triageReason: 'voice handoff',
      })
      const reply = r && r.ok && r.reply ? r.reply.trim() : null
      if (!reply) {
        logger.warn('[voiceCall] handoff returned no reply', { status: r && r.status, case_id: caseId })
        if (caseId) cf.markBlocked(caseId, { reason: 'away_no_reply' }).catch(() => {})
        return
      }
      // Away-conductor server is responsible for resolveCase + thread_log
      // append on its side. We just consume the reply here.
      if (!closed) {
        pending.push({ type: 'say', text: reply, case_id: caseId })
        pump()
      } else if (notify) {
        await notify({ body: reply, channel: 'native', thread_id: 'tate', urgency: 'normal' })
        if (caseId) cf.markDelivered(caseId, { via: 'apns' }).catch(() => {})
        logger.info('[voiceCall] handoff result texted (call ended)', { case_id: caseId })
      }
    } catch (err) {
      logger.warn('[voiceCall] handoff failed', { error: err.message })
      if (caseId) cf.markBlocked(caseId, { reason: `dispatch_failed: ${err.message}` }).catch(() => {})
    }
  }

  function clearTurnTimers() {
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
    if (extendTimer) { clearTimeout(extendTimer); extendTimer = null }
  }

  // Commit the assembled utterance as one turn.
  function flushNow() {
    clearTurnTimers()
    const full = utterance.join(' ').replace(/\s+/g, ' ').trim()
    utterance = []
    if (!full || closed) return
    if (looksLikeEcho(full)) {
      logger.info('[voiceCall] dropped echo utterance', { tx: full.slice(0, 60) })
      return
    }
    sendJson({ type: 'transcript', transcript: full, final: true })
    if (speaking) { bargeIn = true; sendJson({ type: 'barge_in' }) }
    // Durable record of what Tate just said (post-echo-guard, post-incomplete-
    // check). Lands in thread_log so subsequent calls and other brains see it.
    tl.appendThreadLog({
      channel: 'voice', role: 'tate', body: full,
      voice_call_id: voiceCallId,
    }).then((r) => { if (r.ok) lastSeenCursor = r.ts }).catch(() => { /* best effort */ })
    pending.push({ type: 'user', text: full })
    pump()
  }

  // Decide whether to commit now or give him more time to finish thinking.
  function maybeFlush() {
    if (!utterance.length) return
    const full = utterance.join(' ').replace(/\s+/g, ' ').trim()
    if (looksIncomplete(full)) {
      if (extendTimer) clearTimeout(extendTimer)
      extendTimer = setTimeout(flushNow, EXTEND_MS)  // mid-thought: wait a bit more
    } else {
      flushNow()
    }
  }

  // Load on-connect continuity in parallel with STT open. The first turn will
  // splice it in once both have landed. If continuity load fails we still take
  // the call - voice degrades to today's behavior, never blocks.
  ;(async () => {
    try {
      const cc = await buildOnConnectContext({ thread_id: 'tate' })
      onConnectContext = cc.contextBlock || ''
      if (cc.cursor) lastSeenCursor = cc.cursor
      logger.info('[voiceCall] on-connect continuity loaded', {
        chars: onConnectContext.length,
        voice_call_id: voiceCallId,
      })
    } catch (err) {
      logger.warn('[voiceCall] on-connect continuity load failed (non-fatal)', { error: err.message })
    }
  })()

  ;(async () => {
    try {
      stt = await dg.openSTTStream({
        encoding: 'linear16',
        sample_rate: STT_SAMPLE_RATE,
        model: 'nova-3',
        interim_results: true,
        // endpointing = fast silence for speech_final (snappy "I'm done").
        // utterance_end_ms = audio-VAD turn end for the trailing-off case.
        endpointing: 500,
        utterance_end_ms: 1000,
        onTranscript: ({ transcript, is_final, speech_final }) => {
          const tx = (transcript || '').trim()
          if (!tx) return
          // While Ecodia is speaking: drop echo of his own voice; treat genuine
          // speech as a barge-in interrupt (full-duplex + client AEC).
          if (speaking) {
            if (looksLikeEcho(tx)) return
            if (tx.length >= 3) { bargeIn = true; sendJson({ type: 'barge_in' }) }
          }
          // He resumed talking - cancel any pending "finish thinking" extension.
          if (extendTimer) { clearTimeout(extendTimer); extendTimer = null }
          // Accumulate finalized segments; emit a live running transcript.
          if (is_final) utterance.push(tx)
          const live = (utterance.join(' ') + (is_final ? '' : ' ' + tx)).replace(/\s+/g, ' ').trim()
          sendJson({ type: 'transcript', transcript: live, final: false })
          // Fast path: a finished-sounding sentence at the speech_final endpoint
          // commits immediately (snappy). A trailing-off one waits for UtteranceEnd.
          if (speech_final && is_final && !looksIncomplete(utterance.join(' '))) {
            flushNow()
            return
          }
          // Long backstop only; never fires mid-speech.
          if (safetyTimer) clearTimeout(safetyTimer)
          safetyTimer = setTimeout(flushNow, SAFETY_MS)
        },
        onUtteranceEnd: () => {
          // Deepgram's audio VAD detected a real silence gap = end of turn. Commit
          // unless he trailed off mid-thought, in which case give an extension.
          maybeFlush()
        },
        onError: (err) => sendJson({ type: 'error', error: err.message }),
      })
      sendJson({ type: 'ready' })
    } catch (err) {
      sendJson({ type: 'error', error: `stt_open_failed: ${err.message}` })
    }
  })()

  ws.on('message', (data, isBinary) => {
    if (isBinary || Buffer.isBuffer(data)) {
      if (stt && stt.isOpen) stt.sendAudio(Buffer.isBuffer(data) ? data : Buffer.from(data))
      return
    }
    let msg = null
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg && msg.type === 'bye') { try { ws.close() } catch {} }
    else if (msg && msg.type === 'interrupt') {
      // Manual (tap) interrupt from the client: abort current TTS + drop the queue.
      if (speaking) { bargeIn = true; sendJson({ type: 'barge_in' }) }
      pending.length = 0
    }
  })

  ws.on('close', () => {
    closed = true
    try { clearTurnTimers() } catch {}
    if (stt) { try { stt.close() } catch {} }
    // Persist the newest thread_log cursor we observed this call so the next
    // call picks up strictly-newer entries. Cases opened this call are NOT
    // abandoned - they keep their status (open / working / blocked / resolved)
    // and surface on next connect.
    if (lastSeenCursor) {
      tl.writeCursor('voice', lastSeenCursor).catch((err) => {
        logger.warn('[voiceCall] cursor persist failed', { error: err.message })
      })
    }
    logger.info('[voiceCall] close', {
      voice_call_id: voiceCallId,
      cases_opened: callCaseIds.size,
      cursor_persisted: !!lastSeenCursor,
    })
    if (onClose) { try { onClose() } catch {} }
  })
  ws.on('error', () => { closed = true; if (stt) { try { stt.close() } catch {} } })
}

module.exports = { generateReply, streamReply, streamTTSOnly, handleConnection, buildVoiceContext, VOICE_SYSTEM }

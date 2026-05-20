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

const VOICE_MODEL = process.env.VOICE_CALL_MODEL || 'claude-haiku-4-5'
const VOICE_TTS = process.env.VOICE_CALL_VOICE || (dg.AURA2_VOICES && dg.AURA2_VOICES.orion) || 'aura-2-orion-en'
const TTS_SAMPLE_RATE = parseInt(process.env.VOICE_CALL_TTS_RATE || '24000', 10)
const STT_SAMPLE_RATE = parseInt(process.env.VOICE_CALL_STT_RATE || '16000', 10)

// Spoken-register persona. Different from the chat/triage prompt: this is read
// aloud by TTS, so it must be conversational, short, no markdown, no lists, no
// symbols, no em-dashes. Ecodia on a phone call with his co-founder.
const VOICE_SYSTEM = `You are EcodiaOS on a live voice call with Tate, your co-founder. He is talking to you hands-free, probably driving.

Speak the way a sharp co-founder talks on the phone:
- Short. One or two sentences. This is spoken aloud, not written.
- No markdown, no lists, no bullet points, no symbols, no emojis, no em-dashes. Plain spoken words only.
- Lowercase-casual is fine. Direct. No filler, no "I'd be happy to", no customer-service tone.
- If you need a fact you do not have, say so in one line, do not guess.
- If he asks you to DO something that needs tools or real work, say you are on it and that you will handle it and follow up, then keep the call moving. (The call path is conversational; heavy work is dispatched separately.)
- Answer the question actually asked. Match his energy. If he is brief, be brief.

You actually know what is going on in the business - your live context (recent texts with Tate, what you are tracking) is given below. Talk like you already know it. Never read the context out as a list; just use it.

Never read out internal narration. Just talk.`

const db = require('../config/db')

// Live context for the voice brain so it is not a blank-slate Haiku. Pulls the
// recent text thread with Tate (cross-surface continuity) + the active status
// board (what Ecodia is tracking / waiting on). Best-effort: any miss returns a
// partial or empty block, never blocks the turn. Cheap (two indexed queries).
async function buildVoiceContext() {
  const parts = []
  // Status board FIRST - it is curated current truth. The brain should trust it
  // over older chat lines (which carry dated specifics like old build numbers).
  try {
    const rows = await db`SELECT name, status, next_action, next_action_by FROM status_board WHERE archived_at IS NULL AND priority <= 3 ORDER BY priority, last_touched DESC LIMIT 12`
    if (rows.length) {
      const b = rows.map((r) => {
        const na = r.next_action ? ` | next: ${String(r.next_action).slice(0, 120)} [${r.next_action_by || '?'}]` : ''
        return `- ${r.name}: ${String(r.status || '').slice(0, 140)}${na}`
      }).join('\n')
      parts.push(`CURRENT STATUS (authoritative - trust this for "what's the status of X"):\n${b}`)
    }
  } catch (err) { logger.warn('[voiceCall] board context miss', { error: err.message }) }
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${'cowork.message_thread.native.tate'} LIMIT 1`
    if (rows[0]) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
      const ex = Array.isArray(parsed && parsed.exchanges) ? parsed.exchanges.slice(-6) : []
      if (ex.length) {
        const t = ex.map((e) => `${e.from === 'ecodia' ? 'You' : 'Tate'}: ${String(e.body || '').slice(0, 240)}`).join('\n')
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
 * Brain -> TTS. Generates the reply, then streams Aura audio chunks to
 * onAudioChunk(Buffer). shouldAbort() is polled between chunks for barge-in.
 *
 * @returns {Promise<{ text, aborted, bytes }>}
 */
async function streamReply({ userText, history = [], contextBlock = '', onText, onAudioChunk, shouldAbort }) {
  const text = await generateReply({ userText, history, contextBlock })
  if (onText) { try { onText(text) } catch { /* ignore */ } }
  if (shouldAbort && shouldAbort()) return { text, aborted: true, bytes: 0 }

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
        if (onAudioChunk) { try { onAudioChunk(buf) } catch { /* ignore */ } }
      }
    }
  } catch (err) {
    logger.error('[voiceCall] TTS stream failed', { error: err.message })
  }
  return { text, aborted, bytes }
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
  const history = []
  let speaking = false       // we are mid-TTS (barge-in target)
  let bargeIn = false        // a NEW utterance arrived while we spoke
  let stt = null
  let closed = false
  const pending = []         // final utterances awaiting processing
  let pumping = false

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
  async function pump() {
    if (pumping) return
    pumping = true
    try {
      while (pending.length && !closed) {
        const userText = pending.shift()
        history.push({ role: 'user', text: userText })
        speaking = true
        bargeIn = false
        sendJson({ type: 'speaking' })
        // Refresh live context each turn (cheap) so mid-call state changes land.
        const contextBlock = await buildVoiceContext()
        const res = await streamReply({
          userText,
          history,
          contextBlock,
          onText: (t) => { lastSpokenText = norm(t); sendJson({ type: 'reply', text: t }) },
          onAudioChunk: (buf) => sendAudio(buf),
          shouldAbort: () => bargeIn || closed,
        })
        logger.info('[voiceCall] turn complete', { chars: res.text.length, tts_bytes: res.bytes, aborted: res.aborted })
        history.push({ role: 'assistant', text: res.text })
        lastSpokenText = norm(res.text)
        lastSpokenAt = Date.now()
        speaking = false
        sendJson({ type: 'idle' })
      }
    } finally {
      pumping = false
    }
  }

  ;(async () => {
    try {
      stt = await dg.openSTTStream({
        encoding: 'linear16',
        sample_rate: STT_SAMPLE_RATE,
        model: 'nova-3',
        interim_results: true,
        onTranscript: ({ transcript, speech_final }) => {
          const tx = (transcript || '').trim()
          if (!tx) return
          if (!speech_final) {
            // Interim result. Snappy talk-to-interrupt: if Tate starts speaking
            // while we are mid-TTS, abort immediately (full-duplex + client AEC
            // means this is real speech, not echo). The echo guard blocks any
            // residual bleed from triggering a false interrupt.
            if (speaking) {
              const echo = looksLikeEcho(tx)
              // Diagnostic: shows whether interims arrive during TTS (=> full-duplex
              // mic) and whether the echo guard is suppressing them.
              logger.info('[voiceCall] interim while speaking', { tx: tx.slice(0, 50), echo, len: tx.length })
              if (tx.length >= 3 && !echo) {
                bargeIn = true
                sendJson({ type: 'barge_in' })
              }
            }
            sendJson({ type: 'transcript', transcript: tx, final: false })
            return
          }
          // Final utterance.
          if (looksLikeEcho(tx)) {
            logger.info('[voiceCall] dropped echo transcript', { transcript: tx.slice(0, 60) })
            return
          }
          sendJson({ type: 'transcript', transcript: tx, final: true })
          if (speaking) { bargeIn = true; sendJson({ type: 'barge_in' }) }
          pending.push(tx)
          pump()
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
  })

  ws.on('close', () => {
    closed = true
    if (stt) { try { stt.close() } catch {} }
    if (onClose) { try { onClose() } catch {} }
  })
  ws.on('error', () => { closed = true; if (stt) { try { stt.close() } catch {} } })
}

module.exports = { generateReply, streamReply, handleConnection, buildVoiceContext, VOICE_SYSTEM }

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
- If he asks you to actually DO something (send or draft an email, look up something you do not have, check or change live data, kick off real work), give a brief spoken acknowledgement like "yep, on it" or "let me find out", then on a NEW LINE write exactly: HANDOFF: <a precise, self-contained instruction to your deeper self, with all the context it needs>. Your deeper self (full tools + memory) does the real work and the result comes back for you to speak, or as a text if the call has ended. Only emit HANDOFF for real work or facts you genuinely do not have - never for normal conversation.
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
 * Stream Aura TTS of a fixed text to onAudioChunk(Buffer). shouldAbort() is
 * polled between chunks for barge-in.
 */
async function streamTTSOnly(text, { onAudioChunk, shouldAbort } = {}) {
  if (!text) return { bytes: 0, aborted: false }
  if (shouldAbort && shouldAbort()) return { bytes: 0, aborted: true }
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
  const history = []
  let speaking = false       // we are mid-TTS (barge-in target)
  let bargeIn = false        // a NEW utterance arrived while we spoke
  let stt = null
  let closed = false
  const pending = []         // turns awaiting processing ({type:'user'|'say', text})
  let pumping = false
  // Utterance assembly: Deepgram finalizes segments on small pauses, which would
  // split one sentence into fragments and feed the brain a scrap. We accumulate
  // finalized segments and only hand over the FULL utterance after a real pause.
  let utterance = []
  let uttTimer = null
  const UTT_GAP_MS = 800

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
          // directly, no brain turn.
          await speakTurn(item.text)
          logger.info('[voiceCall] handoff result spoken', { chars: item.text.length })
        } else {
          history.push({ role: 'user', text: item.text })
          const contextBlock = await buildVoiceContext()
          const full = await generateReply({ userText: item.text, history, contextBlock })
          const { spoken, handoff } = parseHandoff(full)
          await speakTurn(spoken)
          logger.info('[voiceCall] turn complete', { chars: spoken.length, handoff: !!handoff })
          if (handoff) fireHandoff(handoff)
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
  async function fireHandoff(task) {
    let away = null
    let notify = null
    try { away = require('./awayConductorClient') } catch { away = null }
    try { notify = require('./notifyTate').notifyTate } catch { notify = null }
    if (!away || !(away.isEnabled && away.isEnabled())) {
      logger.warn('[voiceCall] handoff requested but away-conductor unavailable')
      return
    }
    try {
      const r = await away.routeToAwayConductor({
        envelope: {
          body: `${task}\n\n[from a live voice call with Tate - reply in 1 to 3 short spoken sentences, no markdown or lists, it will be read aloud or texted]`,
          thread_id: 'tate',
          source: 'voice',
          channel: 'native',
        },
        triageReason: 'voice handoff',
      })
      const reply = r && r.ok && r.reply ? r.reply.trim() : null
      if (!reply) { logger.warn('[voiceCall] handoff returned no reply', { status: r && r.status }); return }
      if (!closed) {
        pending.push({ type: 'say', text: reply })
        pump()
      } else if (notify) {
        await notify({ body: reply, channel: 'native', thread_id: 'tate', urgency: 'normal' })
        logger.info('[voiceCall] handoff result texted (call ended)')
      }
    } catch (err) {
      logger.warn('[voiceCall] handoff failed', { error: err.message })
    }
  }

  // Fires after UTT_GAP_MS of silence: the assembled utterance is the user's full
  // turn. Hand it to the brain as one piece.
  function flushUtterance() {
    uttTimer = null
    const full = utterance.join(' ').replace(/\s+/g, ' ').trim()
    utterance = []
    if (!full || closed) return
    if (looksLikeEcho(full)) {
      logger.info('[voiceCall] dropped echo utterance', { tx: full.slice(0, 60) })
      return
    }
    sendJson({ type: 'transcript', transcript: full, final: true })
    if (speaking) { bargeIn = true; sendJson({ type: 'barge_in' }) }
    pending.push({ type: 'user', text: full })
    pump()
  }

  ;(async () => {
    try {
      stt = await dg.openSTTStream({
        encoding: 'linear16',
        sample_rate: STT_SAMPLE_RATE,
        model: 'nova-3',
        interim_results: true,
        onTranscript: ({ transcript, is_final }) => {
          const tx = (transcript || '').trim()
          if (!tx) return
          // While Ecodia is speaking: drop echo of his own voice; treat genuine
          // speech as a barge-in interrupt (full-duplex + client AEC).
          if (speaking) {
            if (looksLikeEcho(tx)) return
            if (tx.length >= 3) { bargeIn = true; sendJson({ type: 'barge_in' }) }
          }
          // Accumulate finalized segments; emit a live running transcript.
          if (is_final) utterance.push(tx)
          const live = (utterance.join(' ') + (is_final ? '' : ' ' + tx)).replace(/\s+/g, ' ').trim()
          sendJson({ type: 'transcript', transcript: live, final: false })
          // Debounce: hand the FULL utterance to the brain only after a real pause,
          // so a mid-sentence breath does not chop it into fragments.
          if (uttTimer) clearTimeout(uttTimer)
          uttTimer = setTimeout(flushUtterance, UTT_GAP_MS)
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
    if (uttTimer) { try { clearTimeout(uttTimer) } catch {} }
    if (stt) { try { stt.close() } catch {} }
    if (onClose) { try { onClose() } catch {} }
  })
  ws.on('error', () => { closed = true; if (stt) { try { stt.close() } catch {} } })
}

module.exports = { generateReply, streamReply, handleConnection, buildVoiceContext, VOICE_SYSTEM }

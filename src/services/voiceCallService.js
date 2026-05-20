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

Never read out internal narration. Just talk.`

/**
 * One fast brain turn. history is an array of { role:'user'|'assistant', text }.
 * Returns the reply text (a short spoken line).
 */
async function generateReply({ userText, history = [] }) {
  const messages = []
  for (const h of history.slice(-8)) {
    if (!h || !h.text) continue
    messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })
  }
  messages.push({ role: 'user', content: userText })

  const started = Date.now()
  try {
    const { json, providerUsed } = await createMessage({
      messages,
      system: VOICE_SYSTEM,
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
async function streamReply({ userText, history = [], onText, onAudioChunk, shouldAbort }) {
  const text = await generateReply({ userText, history })
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
        const { text } = await streamReply({
          userText,
          history,
          onText: (t) => sendJson({ type: 'reply', text: t }),
          onAudioChunk: (buf) => sendAudio(buf),
          shouldAbort: () => bargeIn || closed,
        })
        history.push({ role: 'assistant', text })
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
          if (transcript) sendJson({ type: 'transcript', transcript, final: !!speech_final })
          if (speech_final && transcript && transcript.trim()) {
            if (speaking) { bargeIn = true; sendJson({ type: 'barge_in' }) } // real interruption
            pending.push(transcript.trim())
            pump()
          }
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

module.exports = { generateReply, streamReply, handleConnection, VOICE_SYSTEM }

'use strict'

/**
 * voice-roundtrip-test.js - synthetic end-to-end smoke for the voice-call WS.
 *
 * Synthesizes a phrase to raw linear16/16k PCM (simulated mic), streams it as
 * ~40ms binary frames into ws://localhost:VOICE_CALL_PORT/call, and verifies the
 * full backend loop: STT transcript -> brain reply -> Aura TTS audio back.
 *
 * Requires voice-call-server.js to be running. No device needed.
 *   node scripts/voice-roundtrip-test.js "hey ecodia whats two plus two"
 */

require('dotenv').config()
const WebSocket = require('ws')
const dg = require('../src/services/deepgramVoiceService')

const PORT = process.env.VOICE_CALL_PORT || '7461'
const PHRASE = process.argv[2] || 'hey ecodia whats two plus two'

;(async () => {
  console.log('[test] synthesizing phrase:', JSON.stringify(PHRASE))
  const pcm = await dg.synthesizeBuffer({ text: PHRASE, encoding: 'linear16', sample_rate: 16000, container: 'none' })
  console.log('[test] phrase pcm bytes:', pcm.length)

  const ws = new WebSocket(`ws://localhost:${PORT}/call`)
  let transcript = ''
  let replyText = ''
  let audioBytes = 0
  const events = []

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const m = JSON.parse(data.toString())
        events.push(m.type)
        if (m.type === 'transcript') transcript = m.transcript
        if (m.type === 'reply') replyText = m.text
      } catch { /* ignore */ }
    } else {
      audioBytes += data.length
    }
  })

  ws.on('open', async () => {
    console.log('[test] ws open; waiting for STT ready...')
    await new Promise((r) => setTimeout(r, 1500))
    const frame = 640 // 20ms at 16kHz mono linear16 (tighter pacing = fewer false endpoints)
    for (let i = 0; i < pcm.length; i += frame) {
      ws.send(pcm.subarray(i, i + frame))
      await new Promise((r) => setTimeout(r, 18))
    }
    // Trailing silence so Deepgram endpoints the full phrase as ONE utterance
    // and no residual audio triggers extra segments.
    const silence = Buffer.alloc(frame)
    for (let i = 0; i < 30; i++) { ws.send(silence); await new Promise((r) => setTimeout(r, 18)) }
    console.log('[test] audio + trailing silence sent; awaiting reply...')
  })

  ws.on('error', (e) => { console.error('[test] ws error', e.message); process.exit(1) })

  setTimeout(() => {
    console.log('[test] EVENTS:', events.join(',') || '(none)')
    console.log('[test] TRANSCRIPT:', JSON.stringify(transcript))
    console.log('[test] REPLY:', JSON.stringify(replyText))
    console.log('[test] REPLY AUDIO BYTES:', audioBytes)
    const pass = transcript && replyText && audioBytes > 0
    console.log(pass ? '[test] PASS - full backend loop works' : '[test] INCOMPLETE')
    process.exit(pass ? 0 : 2)
  }, 25000)
})().catch((e) => { console.error('[test] ERR', e.message); process.exit(1) })

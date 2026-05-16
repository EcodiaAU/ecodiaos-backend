/**
 * Voice Relay - Twilio Media Streams ↔ Deepgram STT/TTS ↔ Agent SDK Haiku
 *
 * Architecture (rewritten 12 May 2026):
 *
 *   Twilio phone call
 *      ↓ <Connect><Stream/></Connect>  (raw mulaw 8kHz, 20ms frames, base64)
 *   /api/voice/relay  WebSocket handler
 *      ↓ pipe inbound audio
 *   Deepgram Listen v1 WSS  (nova-3-phonecall, mulaw 8kHz, vad_events,
 *      ↓                     interim_results, endpointing 300ms)
 *   on speech_final (or UtteranceEnd):
 *      → haikuRespond(systemPrompt, userText)  [Agent SDK on Max, $0 LLM]
 *      → if complex keyword: osSession.sendMessage(...) in background (Opus)
 *      ↓ response text
 *   Deepgram Aura-2 TTS  (aura-2-thalia-en, mulaw 8kHz, container=none)
 *      ↓ stream chunks
 *   Twilio Media Streams  ({event: 'media', media: {payload: base64}})
 *
 * Barge-in:
 *   When Deepgram emits SpeechStarted during TTS playback, we:
 *     1) Mark the in-flight TTS as cancelled (audio stream reader exits early)
 *     2) Send Twilio {event: 'clear', streamSid} to flush its output buffer
 *
 * Cost (per call/hour, on Max-plan brain):
 *   STT nova-3-phonecall: ~$0.29/hr
 *   TTS Aura-2 (~150 chars × 20 turns): ~$0.10/hr
 *   LLM:  $0  (Max account)
 *   Total: ~$0.40/hr vs $4.50/hr for Voice Agent Standard.
 *
 * Authored: 12 May 2026.
 */
'use strict'

const logger = require('../config/logger')
const env = require('../config/env')
const { openSTTStream, synthesizeStream } = require('../services/deepgramVoiceService')

// ── Lazy-import ESM Agent SDK (backend is CJS) ────────────────────────────────
let _query = null
async function getQuery() {
  if (!_query) {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    _query = sdk.query
  }
  return _query
}

// ── One-shot Haiku response via Agent SDK on Max ──────────────────────────────
async function haikuRespond(systemPrompt, userMessage, signal) {
  const queryFn = await getQuery()

  const fullPrompt = `${systemPrompt}\n\nRespond to this:\n"${userMessage}"\n\nPlain speech only. 1-2 short sentences. No markdown.`

  const options = {
    cwd: '/home/tate/ecodiaos',
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    // SDK auto-detect picks musl on Ubuntu glibc - force glibc binary.
    // Origin: 8 May 2026 musl-vs-glibc fork-dispatch outage.
    pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude',
    model: 'haiku',
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    mcpServers: {},
  }

  // Voice uses the "code" account so it doesn't compete with OS session.
  const sessionEnv = { ...process.env }
  delete sessionEnv.ANTHROPIC_API_KEY
  if (env.CLAUDE_CODE_OAUTH_TOKEN_CODE) {
    sessionEnv.CLAUDE_CODE_OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN_CODE
    delete sessionEnv.CLAUDE_CONFIG_DIR
  } else if (env.CLAUDE_CONFIG_DIR_2) {
    sessionEnv.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR_2
  }
  options.env = sessionEnv

  const collectedText = []

  try {
    const q = queryFn({ prompt: fullPrompt, options })

    // 8s ceiling — voice needs fast turns. Caller can also signal-abort.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Voice timeout')), 8000)
    )

    const collect = (async () => {
      for await (const msg of q) {
        if (signal?.aborted) break
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) collectedText.push(block.text)
          }
        }
      }
    })()

    await Promise.race([collect, timeout])
    try { q.close?.() } catch {}

    return collectedText.join('').trim() || "Give me a moment on that one."
  } catch (err) {
    logger.error('[Voice] Haiku SDK failed', { error: err.message })
    return "Sorry, give me a sec - let me think."
  }
}

// ── Twilio frame helpers ──────────────────────────────────────────────────────

/**
 * Send a media frame back to Twilio. payload must be base64 mulaw 8kHz.
 * Twilio expects 20ms frames (160 bytes mulaw). We chunk Aura-2 output here.
 */
function sendTwilioAudio(ws, streamSid, mulawBuffer) {
  // Chunk into 160-byte (20ms @ 8kHz mulaw) frames. Twilio is forgiving on
  // larger packets but smaller frames give finer-grained barge-in interruption.
  const FRAME_BYTES = 160
  for (let i = 0; i < mulawBuffer.length; i += FRAME_BYTES) {
    const slice = mulawBuffer.subarray(i, i + FRAME_BYTES)
    if (ws.readyState !== 1) return // socket closed mid-playback
    try {
      ws.send(JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: slice.toString('base64') },
      }))
    } catch {
      return
    }
  }
}

function sendTwilioClear(ws, streamSid) {
  if (ws.readyState !== 1) return
  try {
    ws.send(JSON.stringify({ event: 'clear', streamSid }))
  } catch {}
}

function sendTwilioMark(ws, streamSid, name) {
  if (ws.readyState !== 1) return
  try {
    ws.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }))
  } catch {}
}

// ── Streaming TTS playback with cancellation support ─────────────────────────

async function speakToCall({ ws, streamSid, text, cancelToken }) {
  if (!text) return
  let stream
  try {
    stream = await synthesizeStream({
      text,
      voice: 'aura-2-thalia-en',
      encoding: 'mulaw',
      sample_rate: 8000,
      container: 'none',
    })
  } catch (err) {
    logger.error('[Voice] TTS synth failed', { error: err.message })
    return
  }

  const reader = stream.getReader()
  try {
    while (true) {
      if (cancelToken.cancelled) {
        try { await reader.cancel() } catch {}
        break
      }
      const { value, done } = await reader.read()
      if (done) break
      if (value && value.length) sendTwilioAudio(ws, streamSid, Buffer.from(value))
    }
  } catch (err) {
    logger.warn('[Voice] TTS stream read aborted', { error: err.message })
  } finally {
    if (!cancelToken.cancelled) sendTwilioMark(ws, streamSid, 'tts-end')
  }
}

// ── Main relay wiring ────────────────────────────────────────────────────────

function initVoiceRelay(app) {
  const db = require('../config/db')
  const osSession = require('../services/osSessionService')
  const validateTwilioSignature = require('../middleware/twilioValidation')
  let perceptionBus = null
  try { perceptionBus = require('../services/perceptionBus') } catch {}

  // ── TwiML Webhook - answers incoming calls with raw Media Streams ──
  app.post('/api/voice/incoming', validateTwilioSignature, (req, res) => {
    const { From, To, CallSid } = req.body
    const from = (From || '').replace(/\s/g, '')
    logger.info('[Voice] Incoming call', { from, to: To, callSid: CallSid })

    const wsHost = process.env.API_DOMAIN || 'api.admin.ecodia.au'
    const wsUrl = `wss://${wsHost}/api/voice/relay`

    // <Stream> is raw bidirectional audio (mulaw 8kHz, 20ms frames).
    // Custom <Parameter> nodes get echoed back in the 'start' event so we
    // can route caller identity without DB-lookup-by-streamSid.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="from" value="${from}" />
      <Parameter name="callSid" value="${CallSid || ''}" />
    </Stream>
  </Connect>
</Response>`

    res.type('text/xml').send(twiml)
  })

  // ── WebSocket endpoint - Twilio Media Stream ──
  app.ws('/api/voice/relay', async (ws, req) => {
    let streamSid = null
    let callerNumber = 'unknown'
    let callSid = 'unknown'
    let callerName = 'Unknown caller'
    let callerRelationship = ''
    let callerContext = ''
    let businessContext = ''
    const conversationHistory = []
    let stt = null

    // Turn-taking state
    let isAgentSpeaking = false
    let pendingResponse = false
    let currentTtsCancel = { cancelled: false }
    let pendingFinalBuffer = '' // accumulate interim finals until speech_final
    let lastTurnAt = 0

    const buildSystemPrompt = () => `You are EcodiaOS on a phone call.

CALLER: ${callerName} (${callerNumber})
${callerRelationship ? `RELATIONSHIP: ${callerRelationship}` : ''}
${callerContext ? `CONTEXT: ${callerContext}` : ''}

RULES:
- Spoken aloud. 1-2 short sentences. Casual Australian. Warm, direct.
- You are EcodiaOS, a co-founder. Never say "As an AI."
- For deep work, give a quick answer and say you'll text the details.

BUSINESS STATE:
${businessContext}

CONVERSATION SO FAR:
${conversationHistory.map(m => `${m.role === 'user' ? 'Caller' : 'You'}: ${m.content}`).join('\n')}`

    // ── Handle a finalised caller utterance ──
    const handleUtterance = async (text) => {
      const speech = (text || '').trim()
      if (!speech) return
      // Drop if we just turned (debounce double-fire of speech_final + UtteranceEnd)
      const now = Date.now()
      if (now - lastTurnAt < 250) return
      lastTurnAt = now

      logger.info('[Voice] Caller utterance', { callerName, speech })
      conversationHistory.push({ role: 'user', content: speech })
      pendingResponse = true

      const responseText = await haikuRespond(buildSystemPrompt(), speech)
      conversationHistory.push({ role: 'assistant', content: responseText })
      pendingResponse = false

      if (ws.readyState !== 1 || !streamSid) return

      // Speak. Fresh cancel token per turn.
      currentTtsCancel = { cancelled: false }
      isAgentSpeaking = true
      await speakToCall({ ws, streamSid, text: responseText, cancelToken: currentTtsCancel })
      isAgentSpeaking = false

      logger.info('[Voice] Response delivered', { callerName, response: responseText.slice(0, 100) })

      // Fire-and-forget Opus for complex requests
      const complexKeywords = ['status', 'invoice', 'email', 'schedule', 'client', 'project',
                               'send', 'create', 'update', 'fix', 'build', 'call', 'text', 'message']
      if (complexKeywords.some(k => speech.toLowerCase().includes(k))) {
        osSession.sendMessage(
          `[VOICE CALL - ${callerName} (${callerNumber}) asked: "${speech}"]\n` +
          `Haiku responded: "${responseText}"\n` +
          `If deeper work is needed, do it now and text ${callerNumber} with follow-up.`
        ).catch(err => logger.error('[Voice] Opus background failed', { error: err.message }))
      }

      // Perception hook — Cortex can react to voice turns without polling
      if (perceptionBus) {
        perceptionBus.publish({
          source: 'voice_call',
          kind: 'voice.turn',
          data: { caller: callerName, caller_phone: callerNumber, call_sid: callSid,
                  user: speech, assistant: responseText },
          confidence: 0.7,
        }).catch(err => logger.debug('bg task error', { err: err.message }))
      }
    }

    // ── Open Deepgram STT for this call ──
    const startSTT = async () => {
      try {
        stt = await openSTTStream({
          encoding: 'mulaw',
          sample_rate: 8000,
          model: 'nova-3-phonecall',
          language: 'en',
          interim_results: true,
          endpointing: 300,
          utterance_end_ms: 1000,
          vad_events: true,

          onOpen: () => logger.info('[Voice] Deepgram STT open', { callSid }),

          onSpeechStarted: () => {
            // Barge-in: user started speaking while agent was speaking
            if (isAgentSpeaking) {
              currentTtsCancel.cancelled = true
              sendTwilioClear(ws, streamSid)
              logger.info('[Voice] Barge-in detected, clearing TTS', { callSid })
            }
          },

          onTranscript: ({ transcript, is_final, speech_final }) => {
            if (!transcript) return
            if (is_final) {
              pendingFinalBuffer += (pendingFinalBuffer ? ' ' : '') + transcript
              if (speech_final && !pendingResponse) {
                const finalText = pendingFinalBuffer
                pendingFinalBuffer = ''
                handleUtterance(finalText).catch(err =>
                  logger.error('[Voice] handleUtterance failed', { error: err.message }))
              }
            }
          },

          onUtteranceEnd: () => {
            // Fallback if speech_final didn't fire but utterance clearly ended
            if (pendingFinalBuffer && !pendingResponse) {
              const finalText = pendingFinalBuffer
              pendingFinalBuffer = ''
              handleUtterance(finalText).catch(err =>
                logger.error('[Voice] handleUtterance failed', { error: err.message }))
            }
          },

          onError: (err) => logger.error('[Voice] STT error', { error: err.message }),
          onClose: (code) => logger.info('[Voice] STT closed', { code, callSid }),
        })
      } catch (err) {
        logger.error('[Voice] STT open failed', { error: err.message })
      }
    }

    ws.on('message', async (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }

      switch (msg.event) {
        case 'connected':
          logger.info('[Voice] Twilio connected', { protocol: msg.protocol, version: msg.version })
          break

        case 'start': {
          streamSid = msg.streamSid
          const params = msg.start?.customParameters || {}
          callerNumber = params.from || 'unknown'
          callSid = params.callSid || msg.start?.callSid || 'unknown'

          logger.info('[Voice] Stream start', { streamSid, callerNumber, callSid })

          // Caller context
          try {
            const rows = await db`SELECT name, relationship, context FROM contacts WHERE phone = ${callerNumber} LIMIT 1`
            if (rows[0]) {
              callerName = rows[0].name
              callerRelationship = rows[0].relationship || ''
              callerContext = rows[0].context || ''
            }
          } catch (err) {
            logger.error('[Voice] Contact lookup failed', { error: err.message })
          }

          // Business context
          try {
            const rows = await db`SELECT entity_type, name, status, next_action, priority
              FROM status_board WHERE archived_at IS NULL
              ORDER BY priority ASC LIMIT 15`
            businessContext = rows.map(r =>
              `${r.entity_type}: ${r.name} [${r.status}] - ${r.next_action || 'no action'}`
            ).join('\n')
          } catch (err) {
            logger.error('[Voice] Status board fetch failed', { error: err.message })
          }

          logger.info('[Voice] Caller identified', { callerName, callerNumber })

          await startSTT()

          // Greet via Aura-2 (spoken, not relying on Twilio's voice)
          const greeting = callerName !== 'Unknown caller'
            ? `Hey ${callerName.split(' ')[0]}, it's Ecodia. What's up?`
            : `Hey, this is Ecodia. How can I help?`
          currentTtsCancel = { cancelled: false }
          isAgentSpeaking = true
          speakToCall({ ws, streamSid, text: greeting, cancelToken: currentTtsCancel })
            .then(() => { isAgentSpeaking = false })
          conversationHistory.push({ role: 'assistant', content: greeting })
          break
        }

        case 'media': {
          if (!stt || !stt.isOpen) break
          const payload = msg.media?.payload
          if (!payload) break
          const audio = Buffer.from(payload, 'base64')
          stt.sendAudio(audio)
          break
        }

        case 'mark':
          // Twilio echoes marks we sent; useful for confirming playback completion
          break

        case 'stop':
          logger.info('[Voice] Stream stop', { streamSid })
          if (stt) { try { stt.finalize() } catch {} }
          break

        default:
          break
      }
    })

    ws.on('close', () => {
      logger.info('[Voice] Call ended', { callerName, turns: conversationHistory.length })
      currentTtsCancel.cancelled = true
      if (stt) { try { stt.close() } catch {} }

      if (conversationHistory.length > 1) {
        const summary = conversationHistory.map(m =>
          `${m.role === 'user' ? callerName : 'EcodiaOS'}: ${m.content}`
        ).join('\n')
        osSession.sendMessage(
          `[VOICE CALL ENDED - ${callerName} (${callerNumber}), ${conversationHistory.length} turns]\n` +
          `Transcript:\n${summary}\n\n` +
          `Log to Neo4j if significant. Update contacts last_contacted.`
        ).catch(err => logger.debug('bg task error', { err: err.message }))

        if (perceptionBus) {
          perceptionBus.publish({
            source: 'voice_call',
            kind: 'voice.call_ended',
            data: { caller: callerName, caller_phone: callerNumber, call_sid: callSid,
                    turn_count: conversationHistory.length, transcript: summary },
            confidence: 0.7,
          }).catch(err => logger.debug('bg task error', { err: err.message }))
        }
      }
    })

    ws.on('error', (err) => {
      logger.error('[Voice] WebSocket error', { error: err.message })
      currentTtsCancel.cancelled = true
      if (stt) { try { stt.close() } catch {} }
    })
  })

  logger.info('[Voice] Voice relay endpoints registered (Twilio Media Streams + Deepgram)')
}

module.exports = { initVoiceRelay }

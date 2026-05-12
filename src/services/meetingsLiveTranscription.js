/**
 * meetingsLiveTranscription.js — realtime Deepgram streaming for /meeting.
 *
 * Bridges a browser WebSocket (mic frames in, transcripts out) to a Deepgram
 * Listen v1 WSS. Interim transcripts go to the FE only; finals are persisted
 * to voice_transcript_chunks AND broadcast. Speaker diarisation is on by
 * default.
 *
 * Frame format (frontend ↔ this server):
 *
 *   FE → server:
 *     - Binary frames: raw audio (linear16 16kHz default, configurable on
 *       handshake via ?encoding=linear16&sample_rate=16000)
 *     - Text frames (JSON): { type: 'finalize' } | { type: 'ping' }
 *
 *   server → FE:
 *     - { type: 'open' }                          on Deepgram open
 *     - { type: 'interim', text, speaker, ts }    interim transcripts
 *     - { type: 'final',   text, speaker, seq, ts, chunk_id }   persisted finals
 *     - { type: 'speech_started' }                VAD speech detected
 *     - { type: 'utterance_end' }                 VAD end of utterance
 *     - { type: 'error', message }
 *     - { type: 'closed' }
 *
 * Perception hook: each persisted final publishes a 'meeting.utterance' event
 * so Cortex / the conductor can react mid-meeting without polling.
 *
 * Authored: 12 May 2026.
 */
'use strict'

const logger = require('../config/logger')
const db = require('../config/db')
const { openSTTStream } = require('./deepgramVoiceService')

let perceptionBus = null
try { perceptionBus = require('./perceptionBus') } catch {}

/**
 * Attach the live transcription handler to a Twilio-style express-ws path.
 * The router this is mounted on must own express-ws.
 *
 * Usage from server.js:
 *   require('./services/meetingsLiveTranscription').register(app)
 */
function register(app) {
  app.ws('/api/meetings/:id/live', async (ws, req) => {
    const meetingId = req.params.id
    if (!meetingId || !/^[0-9a-f-]{36}$/i.test(meetingId)) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'invalid_meeting_id' })) } catch {}
      try { ws.close() } catch {}
      return
    }

    // Verify meeting row exists (avoid silent ghost sessions)
    try {
      const rows = await db`SELECT id FROM meeting_recordings WHERE id = ${meetingId}::uuid LIMIT 1`
      if (rows.length === 0) {
        try { ws.send(JSON.stringify({ type: 'error', message: 'meeting_not_found' })) } catch {}
        try { ws.close() } catch {}
        return
      }
    } catch (err) {
      logger.error('[MeetingsLive] meeting lookup failed', { meetingId, error: err.message })
      try { ws.close() } catch {}
      return
    }

    // Handshake params (?encoding=mulaw|linear16, ?sample_rate=8000|16000|24000)
    const encoding = (req.query.encoding || 'linear16').toString()
    const sample_rate = Math.max(8000, Math.min(48000, parseInt(req.query.sample_rate, 10) || 16000))
    const language = (req.query.language || 'en').toString()

    logger.info('[MeetingsLive] WS connected', { meetingId, encoding, sample_rate })

    // Mark meeting as live-started (idempotent)
    db`UPDATE meeting_recordings
       SET live_started_at = COALESCE(live_started_at, NOW())
       WHERE id = ${meetingId}::uuid`
      .catch(err => logger.warn('[MeetingsLive] live_started_at update failed', { error: err.message }))

    let seq = 0
    let stt = null

    const safeSend = (obj) => {
      if (ws.readyState !== 1) return
      try { ws.send(JSON.stringify(obj)) } catch {}
    }

    try {
      stt = await openSTTStream({
        encoding,
        sample_rate,
        model: 'nova-3',
        language,
        diarize: true,
        interim_results: true,
        endpointing: 500,
        utterance_end_ms: 1200,
        vad_events: true,
        smart_format: true,
        punctuate: true,

        onOpen: () => safeSend({ type: 'open', encoding, sample_rate }),

        onSpeechStarted: () => safeSend({ type: 'speech_started' }),

        onUtteranceEnd: () => safeSend({ type: 'utterance_end' }),

        onTranscript: async ({ transcript, is_final, speech_final, speaker, start_ms, duration_ms }) => {
          if (!transcript) return

          if (!is_final) {
            safeSend({ type: 'interim', text: transcript, speaker, ts: start_ms })
            return
          }

          // Final segment — persist + broadcast + perception
          const mySeq = ++seq
          let chunkId = null
          try {
            const [row] = await db`
              INSERT INTO voice_transcript_chunks
                (session_id, seq, transcribed_text, duration_ms, mime_type)
              VALUES (
                ${meetingId}::uuid,
                ${mySeq},
                ${transcript},
                ${duration_ms || null},
                ${'audio/' + encoding}
              )
              RETURNING id
            `
            chunkId = row?.id || null
          } catch (err) {
            logger.error('[MeetingsLive] chunk insert failed', { meetingId, error: err.message })
          }

          safeSend({
            type: 'final',
            text: transcript,
            speaker,
            seq: mySeq,
            ts: start_ms,
            chunk_id: chunkId,
            speech_final: !!speech_final,
          })

          // Perception — Cortex hook (zero token cost, in-process subscriber)
          if (perceptionBus) {
            perceptionBus.publish({
              source: 'meeting_live',
              kind: 'meeting.utterance',
              data: {
                meeting_id: meetingId,
                speaker,
                text: transcript,
                seq: mySeq,
                ts_ms: start_ms,
              },
              confidence: 0.5,
            }).catch(() => {})
          }
        },

        onError: (err) => {
          logger.error('[MeetingsLive] STT error', { meetingId, error: err.message })
          safeSend({ type: 'error', message: err.message })
        },

        onClose: (code, reason) => {
          logger.info('[MeetingsLive] STT closed', { meetingId, code, reason })
          safeSend({ type: 'closed', code })
        },
      })
    } catch (err) {
      logger.error('[MeetingsLive] STT open failed', { meetingId, error: err.message })
      safeSend({ type: 'error', message: err.message })
      try { ws.close() } catch {}
      return
    }

    ws.on('message', (data, isBinary) => {
      // Binary frames = audio
      if (isBinary) {
        if (stt && stt.isOpen) stt.sendAudio(data)
        return
      }
      // Text frames = control
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'finalize') {
          if (stt) stt.finalize()
        } else if (msg.type === 'ping') {
          safeSend({ type: 'pong' })
        }
      } catch {
        // ignore non-JSON text frames
      }
    })

    ws.on('close', () => {
      logger.info('[MeetingsLive] WS closed', { meetingId, finals: seq })
      if (stt) { try { stt.close() } catch {} }

      // Mark meeting live_ended_at
      db`UPDATE meeting_recordings
         SET live_ended_at = NOW()
         WHERE id = ${meetingId}::uuid`
        .catch(err => logger.warn('[MeetingsLive] live_ended_at update failed', { error: err.message }))

      if (perceptionBus && seq > 0) {
        perceptionBus.publish({
          source: 'meeting_live',
          kind: 'meeting.live_ended',
          data: { meeting_id: meetingId, final_segments: seq },
          confidence: 0.6,
        }).catch(() => {})
      }
    })

    ws.on('error', (err) => {
      logger.error('[MeetingsLive] WS error', { meetingId, error: err.message })
      if (stt) { try { stt.close() } catch {} }
    })
  })

  logger.info('[MeetingsLive] /api/meetings/:id/live registered')
}

module.exports = { register }

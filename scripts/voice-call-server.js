'use strict'

/**
 * voice-call-server.js (2026-05-20) - standalone WS server for the live "call
 * Ecodia" pipeline (CarPlay #3 P0). The iOS app (CallKit + AVAudioEngine)
 * connects here, streams mic audio (linear16/16k) as binary frames, and receives
 * TTS audio (linear16/24k) frames + JSON events back.
 *
 * Isolated standalone server (mirrors away-conductor) so the pipeline can run +
 * be tested without touching the main API server's WS upgrade. Production can
 * either keep this as a dedicated service (Tailscale / reverse-proxied WSS) or
 * mount voiceCallService.handleConnection into the main server later.
 *
 * Endpoints:
 *   GET  /health
 *   WS   /call    -> voiceCallService.handleConnection
 *
 * Per backend/drafts/carplay-3-voice-call-plan-2026-05-20.md.
 */

const http = require('http')
const WebSocket = require('ws')
const voiceCall = require('../src/services/voiceCallService')

const PORT = parseInt(process.env.VOICE_CALL_PORT || '7461', 10)
const TOKEN = process.env.VOICE_CALL_TOKEN || null

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'voice-call', port: PORT, auth: !!TOKEN }))
    return
  }
  res.writeHead(404); res.end()
})

const wss = new WebSocket.Server({ server, path: '/call' })

wss.on('connection', (ws, req) => {
  if (TOKEN) {
    const auth = (req.headers.authorization || '')
    const qsToken = (() => { try { return new URL(req.url, 'http://x').searchParams.get('token') } catch { return null } })()
    if (auth !== `Bearer ${TOKEN}` && qsToken !== TOKEN) {
      try { ws.close(1008, 'unauthorized') } catch {}
      return
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[voice-call ${new Date().toISOString()}] connection open`)
  voiceCall.handleConnection(ws, {
    onClose: () => console.log(`[voice-call ${new Date().toISOString()}] connection closed`),
  })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[voice-call] listening on :${PORT} (ws path /call)`)
})

'use strict'

/**
 * /api/stream/* - HTTP and SSE substrate for the streamingService.
 *
 * Routes:
 *   GET  /api/stream/_channels           - registry dump (auth required)
 *   GET  /api/stream/:channel?since=ID   - SSE stream (auth required)
 *   GET  /api/stream/:channel/recent?limit=N - non-streaming recent (auth required)
 *   POST /api/stream/:channel            - publish event (auth required)
 *
 * Auth: ecodiaFullAuth bearer (kv_store.creds.ecodia_full_mcp_bearer).
 *
 * Em-dashes BANNED. Phase 2 Lane 06 (2026-05-15).
 */

const express = require('express')
const router = express.Router()

const logger = require('../config/logger')
const ecodiaFullAuth = require('../middleware/ecodiaFullAuth')
const streaming = require('../services/streamingService')

const SSE_HEARTBEAT_MS = 25_000
const SSE_MAX_DURATION_MS = 30 * 60 * 1000

router.use(express.json({ limit: '512kb' }))
router.use(ecodiaFullAuth)

router.get('/_channels', (_req, res) => {
  res.json({ channels: streaming.listChannels() })
})

router.get('/:channel/recent', async (req, res) => {
  const channel = req.params.channel
  if (!streaming.isKnownChannel(channel)) {
    return res.status(404).json({ error: 'unknown_channel', channel })
  }
  try {
    const limit = parseInt(req.query.limit, 10) || 20
    const events = await streaming.recent(channel, limit)
    res.json({ channel, count: events.length, events })
  } catch (err) {
    res.status(500).json({ error: 'recent_failed', message: err.message })
  }
})

router.post('/:channel', async (req, res) => {
  const channel = req.params.channel
  if (!streaming.isKnownChannel(channel)) {
    return res.status(404).json({ error: 'unknown_channel', channel, known: streaming.listChannels().map(c => c.name) })
  }
  try {
    const evt = await streaming.publish(channel, req.body || {})
    res.status(202).json({ accepted: true, event: evt })
  } catch (err) {
    if (err && err.code === 'unknown_channel') {
      return res.status(404).json({ error: 'unknown_channel', details: err.details })
    }
    logger.warn('streaming POST failed', { channel, error: err.message })
    res.status(500).json({ error: 'publish_failed', message: err.message })
  }
})

router.get('/:channel', async (req, res) => {
  const channel = req.params.channel
  if (!streaming.isKnownChannel(channel)) {
    return res.status(404).json({ error: 'unknown_channel', channel })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  res.write('retry: 5000\n\n')

  let closed = false
  const writeEvent = (evt) => {
    if (closed) return
    try {
      res.write('id: ' + evt.id + '\n')
      res.write('event: ' + evt.event_type + '\n')
      const dataLine = JSON.stringify({ id: evt.id, channel: evt.channel, event_type: evt.event_type, observed_at: evt.observed_at, payload: evt.payload })
      res.write('data: ' + dataLine + '\n\n')
    } catch (err) {
      logger.debug('SSE write failed', { channel, error: err.message })
    }
  }

  try {
    const sinceId = req.query.since ? String(req.query.since) : (req.headers['last-event-id'] || null)
    const replay = await streaming.eventsSince(channel, sinceId)
    for (const evt of replay) writeEvent(evt)
  } catch (err) {
    logger.debug('SSE replay failed', { channel, error: err.message })
  }

  const unsubscribe = streaming.subscribe(channel, writeEvent)

  const heartbeat = setInterval(() => {
    if (closed) return
    try { res.write(': hb ' + Date.now() + '\n\n') } catch {}
  }, SSE_HEARTBEAT_MS)
  if (typeof heartbeat.unref === 'function') heartbeat.unref()

  const maxTimer = setTimeout(() => {
    if (closed) return
    try { res.write('event: stream.timeout\ndata: {"reason":"max_duration"}\n\n') } catch {}
    cleanup()
    try { res.end() } catch {}
  }, SSE_MAX_DURATION_MS)
  if (typeof maxTimer.unref === 'function') maxTimer.unref()

  function cleanup() {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    clearTimeout(maxTimer)
    try { unsubscribe() } catch {}
  }

  req.on('close', cleanup)
  req.on('aborted', cleanup)
  res.on('close', cleanup)
})

module.exports = router

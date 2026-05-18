'use strict'

/**
 * streamingService - in-process channel hub complementing the MCP substrate.
 *
 * Phase 2 Lane 06 (2026-05-15). Spec at
 * C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/06-streaming-substrate.md
 * Doctrine at backend/patterns/streaming-substrate-complement-to-mcp-2026-05-15.md.
 *
 * Why: MCP is the right shape for stateful tool calls (status_board.upsert,
 * neo4j.search, kv_store.get). It is the wrong shape for streaming (vercel
 * deploy progress, stripe webhook tail, observer signal feed, status_board
 * write broadcast). The legacy VPS frontend papered over this with the
 * perceptionDispatcher in-process bus + WebSocket fan-out. The frontend is
 * gone. This module is the replacement: a small, durable, MCP-callable
 * pubsub keyed by named channel.
 *
 * Channels are declared in backend/streaming/channels.json. Anything not
 * in that file is rejected at publish/subscribe time.
 *
 * Persistence shape:
 *   - In memory: per-channel ring buffer of last MEMORY_CAP events
 *   - kv_store.cowork.stream.<channel>.events: capped LIFO list (most-recent
 *     first), one row, JSON value. Survives pm2 reloads.
 *
 * Boot rehydration: on first publish (or explicit warm()), loads persisted
 * events from kv_store.cowork.stream.<channel>.events into the in-memory
 * ring so SSE late-subscribers immediately see history.
 *
 * Em-dashes BANNED.
 */

const { EventEmitter } = require('node:events')
const path = require('node:path')
const fs = require('node:fs')

const db = require('../config/db')
const logger = require('../config/logger')

const MEMORY_CAP_DEFAULT = 100
const KV_PREFIX = 'cowork.stream.'
const KV_SUFFIX = '.events'

const CHANNELS_FILE = path.join(__dirname, '..', '..', 'streaming', 'channels.json')

let _registry = null
let _registryLoadedAt = 0
const REGISTRY_RELOAD_MS = 60_000

function _loadRegistry() {
  const now = Date.now()
  if (_registry && now - _registryLoadedAt < REGISTRY_RELOAD_MS) return _registry
  try {
    const raw = fs.readFileSync(CHANNELS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.channels)) {
      throw new Error('channels.json missing channels[]')
    }
    const map = new Map()
    for (const ch of parsed.channels) {
      if (!ch || !ch.name) continue
      map.set(ch.name, {
        name: ch.name,
        description: ch.description || '',
        publisher: ch.publisher || 'unknown',
        retention_count: Number.isFinite(ch.retention_count) ? ch.retention_count : MEMORY_CAP_DEFAULT,
        retention_ttl_seconds: Number.isFinite(ch.retention_ttl_seconds) ? ch.retention_ttl_seconds : 86400,
      })
    }
    _registry = map
    _registryLoadedAt = now
    return _registry
  } catch (err) {
    logger.warn('streamingService: failed to load channels.json', { error: err.message, file: CHANNELS_FILE })
    if (!_registry) _registry = new Map()
    return _registry
  }
}

function listChannels() {
  return Array.from(_loadRegistry().values())
}

function isKnownChannel(name) {
  return _loadRegistry().has(name)
}

function getChannel(name) {
  return _loadRegistry().get(name) || null
}

const _emitter = new EventEmitter()
_emitter.setMaxListeners(0)

const _buffers = new Map()
const _hydratedChannels = new Set()
let _eventSeq = (Date.now() % 1_000_000_000) * 1000

function _nextEventId() {
  _eventSeq += 1
  return String(_eventSeq)
}

function _ringPush(channel, evt) {
  const cfg = getChannel(channel)
  const cap = cfg?.retention_count || MEMORY_CAP_DEFAULT
  let buf = _buffers.get(channel)
  if (!buf) {
    buf = []
    _buffers.set(channel, buf)
  }
  buf.push(evt)
  while (buf.length > cap) buf.shift()
}

async function _hydrateChannel(channel) {
  if (_hydratedChannels.has(channel)) return
  _hydratedChannels.add(channel)
  try {
    const key = KV_PREFIX + channel + KV_SUFFIX
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    const raw = rows?.[0]?.value
    let parsed = null
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) } catch { parsed = null }
    } else if (raw && typeof raw === 'object') {
      parsed = raw
    }
    if (!Array.isArray(parsed)) return
    const cfg = getChannel(channel)
    const cap = cfg?.retention_count || MEMORY_CAP_DEFAULT
    const ttl = (cfg?.retention_ttl_seconds || 0) * 1000
    const cutoff = ttl > 0 ? Date.now() - ttl : 0
    const ordered = parsed.slice().reverse()
    for (const e of ordered) {
      if (!e || !e.id) continue
      if (cutoff && new Date(e.observed_at || 0).getTime() < cutoff) continue
      _ringPush(channel, e)
    }
    const buf = _buffers.get(channel) || []
    if (buf.length > cap) {
      _buffers.set(channel, buf.slice(-cap))
    }
    if ((_buffers.get(channel) || []).length > 0) {
      logger.info('streamingService: hydrated channel from kv_store', { channel, restored: (_buffers.get(channel) || []).length })
    }
  } catch (err) {
    logger.debug('streamingService: hydrate failed (non-fatal)', { channel, error: err.message })
  }
}

async function _persistChannel(channel) {
  const cfg = getChannel(channel)
  if (!cfg) return
  const buf = _buffers.get(channel) || []
  const lifo = buf.slice().reverse().slice(0, cfg.retention_count || MEMORY_CAP_DEFAULT)
  const key = KV_PREFIX + channel + KV_SUFFIX
  const value = JSON.stringify(lifo)
  try {
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.debug('streamingService: persist failed (non-fatal)', { channel, error: err.message })
  }
}

const _persistTimers = new Map()
function _schedulePersist(channel) {
  if (_persistTimers.has(channel)) return
  const t = setTimeout(() => {
    _persistTimers.delete(channel)
    _persistChannel(channel).catch(() => {})
  }, 250)
  if (typeof t.unref === 'function') t.unref()
  _persistTimers.set(channel, t)
}

async function publish(channel, body) {
  if (!isKnownChannel(channel)) {
    const err = new Error('unknown_channel')
    err.code = 'unknown_channel'
    err.details = { channel, known: Array.from(_loadRegistry().keys()) }
    throw err
  }
  await _hydrateChannel(channel)
  const event_type = (body && body.event_type) || 'message'
  const payload = body && body.payload !== undefined ? body.payload : (body && body.data !== undefined ? body.data : body)
  const evt = {
    id: _nextEventId(),
    channel,
    event_type: String(event_type),
    payload,
    observed_at: new Date().toISOString(),
  }
  _ringPush(channel, evt)
  _schedulePersist(channel)
  try {
    _emitter.emit('event:' + channel, evt)
    _emitter.emit('event', evt)
  } catch (err) {
    logger.debug('streamingService: emit failed (non-fatal)', { channel, error: err.message })
  }
  return evt
}

async function recent(channel, limit) {
  if (!isKnownChannel(channel)) {
    const err = new Error('unknown_channel')
    err.code = 'unknown_channel'
    throw err
  }
  await _hydrateChannel(channel)
  const cap = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500)
  const buf = _buffers.get(channel) || []
  return buf.slice(-cap).reverse()
}

async function eventsSince(channel, sinceId) {
  if (!isKnownChannel(channel)) {
    const err = new Error('unknown_channel')
    err.code = 'unknown_channel'
    throw err
  }
  await _hydrateChannel(channel)
  const buf = _buffers.get(channel) || []
  if (!sinceId) return buf.slice()
  const sn = String(sinceId)
  const idx = buf.findIndex(e => String(e.id) === sn)
  if (idx === -1) return buf.slice()
  return buf.slice(idx + 1)
}

function subscribe(channel, listener) {
  if (!isKnownChannel(channel)) {
    const err = new Error('unknown_channel')
    err.code = 'unknown_channel'
    throw err
  }
  const wrapped = (evt) => {
    try { listener(evt) } catch (err) {
      logger.debug('streamingService: subscriber threw (sync)', { error: err.message })
    }
  }
  _emitter.on('event:' + channel, wrapped)
  return () => _emitter.removeListener('event:' + channel, wrapped)
}

function publishSync(channel, body) {
  publish(channel, body).catch((err) => {
    if (err && err.code === 'unknown_channel') {
      logger.warn('streamingService: publishSync rejected unknown_channel', { channel })
    } else {
      logger.debug('streamingService: publishSync failed (non-fatal)', { channel, error: err && err.message })
    }
  })
}

async function warmAll() {
  for (const ch of listChannels()) {
    await _hydrateChannel(ch.name).catch(() => {})
  }
}

module.exports = {
  publish,
  publishSync,
  recent,
  eventsSince,
  subscribe,
  listChannels,
  isKnownChannel,
  getChannel,
  warmAll,
  _internals: { _buffers, _emitter },
}

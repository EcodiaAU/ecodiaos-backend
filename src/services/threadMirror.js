'use strict'

/**
 * threadMirror.js
 *
 * Per-channel-per-thread conversation mirror in kv_store. Single source of
 * truth for both inbound AND outbound exchanges across SMS / Telegram / native
 * / future channels. Read by triage context-load, append by webhook adapters
 * and transport modules.
 *
 * Key shape: cowork.message_thread.<channel>.<thread_id>
 * Value shape: { exchanges: [{from: 'tate'|'ecodia', body, at, sender_name?}], last_at, channel, thread_id }
 *
 * Per backend/patterns/one-conductor-many-channels-2026-05-19.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const DEFAULT_MAX_EXCHANGES = 10
const OUTBOUND_MAX_EXCHANGES = 20  // store more outbound; helps triage reference recent self-replies
const DEFAULT_STALE_HOURS = 24

function _key({ channel, thread_id }) {
  return `cowork.message_thread.${channel}.${thread_id}`
}

/**
 * Read prior thread state for a channel+thread_id. Returns
 * { exchanges, cold_start, last_at, key }.
 */
async function loadThreadMirror({ channel, thread_id, max_exchanges = DEFAULT_MAX_EXCHANGES, stale_hours = DEFAULT_STALE_HOURS }) {
  if (!channel || !thread_id) return { exchanges: [], cold_start: true }
  const key = _key({ channel, thread_id })
  try {
    const rows = await db`SELECT value, updated_at FROM kv_store WHERE key = ${key} LIMIT 1`
    if (rows.length === 0) return { exchanges: [], cold_start: true, key }
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const exchanges = Array.isArray(parsed?.exchanges) ? parsed.exchanges : []
    const lastAtIso = parsed?.last_at || rows[0].updated_at
    const ageMs = Date.now() - new Date(lastAtIso).getTime()
    if (ageMs > stale_hours * 3600 * 1000) {
      return { exchanges: [], cold_start: true, prior_ended_at: lastAtIso, key }
    }
    return { exchanges: exchanges.slice(-max_exchanges), cold_start: false, last_at: lastAtIso, key }
  } catch (err) {
    logger.warn('threadMirror: load failed', { error: err.message, key })
    return { exchanges: [], cold_start: true, error: err.message, key }
  }
}

/**
 * Append an inbound message (from Tate to Ecodia) to the mirror.
 */
async function appendInbound({ channel, thread_id, body, sender_name, received_at, max_exchanges = OUTBOUND_MAX_EXCHANGES }) {
  if (!channel || !thread_id) return
  const key = _key({ channel, thread_id })
  try {
    const current = await loadThreadMirror({ channel, thread_id, max_exchanges })
    const entry = { from: 'tate', sender_name, body: String(body || '').slice(0, 1000), at: received_at || new Date().toISOString() }
    const exchanges = (current.exchanges || []).concat([entry]).slice(-max_exchanges)
    const value = JSON.stringify({ exchanges, last_at: entry.at, channel, thread_id })
    await db`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('threadMirror: appendInbound failed', { error: err.message, key })
  }
}

/**
 * Append an outbound reply (from Ecodia to Tate) to the mirror.
 */
async function appendOutbound({ channel, thread_id, body, max_exchanges = OUTBOUND_MAX_EXCHANGES }) {
  if (!channel || !thread_id || !body) return
  const key = _key({ channel, thread_id })
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    let parsed = { exchanges: [] }
    if (rows?.[0]) {
      const raw = rows[0].value
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    }
    const exchanges = Array.isArray(parsed.exchanges) ? parsed.exchanges : []
    const entry = { from: 'ecodia', body: String(body).slice(0, 1000), at: new Date().toISOString() }
    exchanges.push(entry)
    const value = JSON.stringify({ exchanges: exchanges.slice(-max_exchanges), last_at: entry.at, channel, thread_id })
    await db`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('threadMirror: appendOutbound failed', { error: err.message, key })
  }
}

module.exports = { loadThreadMirror, appendInbound, appendOutbound }

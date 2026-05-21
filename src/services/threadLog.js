'use strict'

/**
 * threadLog.js (2026-05-21)
 *
 * Unified cross-channel conversation log. Every brain (voice front, away-conductor,
 * IDE conductor, SMS/TG webhooks) appends here and tails on connect so the system
 * holds one coherent thread across surfaces instead of three fragmented mirrors.
 *
 * Per spec backend/drafts/one-brain-stateful-coordination-2026-05-21.md.
 *
 * Backed by postgres `thread_log` table (migration 133_thread_log.sql). Not a
 * kv_store blob because we need indexable tail queries that scale past 50k entries
 * and don't pay the read-modify-write race cost on every voice turn.
 *
 * Reader API:   tailThreadLog({thread_id, since?, limit?, channels?, include_system?})
 * Writer API:   appendThreadLog({thread_id, channel, role, body, case_id?, ...})
 * Summary API:  summarizeTail({thread_id, since?, limit?}) -> string (for prompt-injection)
 */

const db = require('../config/db')
const logger = require('../config/logger')

const VALID_CHANNELS = new Set(['voice', 'native', 'sms', 'telegram', 'ide', 'away', 'system'])
const VALID_ROLES = new Set(['tate', 'ecodia', 'system'])

// Default retention windows. Raw voice transcripts age out after 30d; cases +
// system + IDE notes are permanent (NULL redact_after). See spec §11.2.
const REDACT_DEFAULTS_DAYS = {
  voice: 30,
  sms: null,
  telegram: null,
  native: null,
  ide: null,
  away: null,
  system: null,
}

const MAX_BODY_CHARS = 2000

/**
 * Append a turn to the thread log.
 * Returns { id, ts } on success, { ok: false, error } on failure (never throws).
 */
async function appendThreadLog({
  thread_id = 'tate',
  channel,
  role,
  body,
  case_id = null,
  voice_call_id = null,
  source = null,
  meta = {},
} = {}) {
  if (!channel || !VALID_CHANNELS.has(channel)) {
    return { ok: false, error: `invalid channel: ${channel}` }
  }
  if (!role || !VALID_ROLES.has(role)) {
    return { ok: false, error: `invalid role: ${role}` }
  }
  if (!body || typeof body !== 'string') {
    return { ok: false, error: 'body required' }
  }
  const truncated = body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) + '...[truncated]' : body
  const redactDays = REDACT_DEFAULTS_DAYS[channel]
  try {
    const rows = await db`
      INSERT INTO thread_log (thread_id, channel, role, body, case_id, voice_call_id, source, meta, redact_after)
      VALUES (${thread_id}, ${channel}, ${role}, ${truncated}, ${case_id}, ${voice_call_id}, ${source},
              ${db.json(meta || {})},
              ${redactDays ? new Date(Date.now() + redactDays * 86400 * 1000) : null})
      RETURNING id, ts
    `
    return { ok: true, id: rows[0].id, ts: rows[0].ts }
  } catch (err) {
    logger.warn('threadLog.append failed', { error: err.message, channel, role })
    return { ok: false, error: err.message }
  }
}

/**
 * Tail recent entries. `since` is an ISO timestamp cursor; pass the `ts` of the
 * last entry you've seen to get strictly-newer entries. Omit to get the most
 * recent `limit` entries regardless.
 *
 * Returns { entries, cursor } where cursor is the ts of the newest returned
 * entry (or `since` if no new entries). Caller persists cursor + passes it back
 * next time.
 */
async function tailThreadLog({
  thread_id = 'tate',
  since = null,
  limit = 30,
  channels = null,
  include_system = true,
} = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200)
  try {
    let rows
    const channelFilter = channels && channels.length ? channels : null
    if (since && channelFilter) {
      rows = await db`
        SELECT id, ts, thread_id, channel, role, body, case_id, voice_call_id, source, meta
        FROM thread_log
        WHERE thread_id = ${thread_id} AND ts > ${since}::timestamptz
          AND channel = ANY(${channelFilter}::text[])
          ${include_system ? db`` : db`AND channel <> 'system'`}
        ORDER BY ts ASC
        LIMIT ${cap}
      `
    } else if (since) {
      rows = await db`
        SELECT id, ts, thread_id, channel, role, body, case_id, voice_call_id, source, meta
        FROM thread_log
        WHERE thread_id = ${thread_id} AND ts > ${since}::timestamptz
          ${include_system ? db`` : db`AND channel <> 'system'`}
        ORDER BY ts ASC
        LIMIT ${cap}
      `
    } else if (channelFilter) {
      rows = await db`
        SELECT id, ts, thread_id, channel, role, body, case_id, voice_call_id, source, meta
        FROM thread_log
        WHERE thread_id = ${thread_id}
          AND channel = ANY(${channelFilter}::text[])
          ${include_system ? db`` : db`AND channel <> 'system'`}
        ORDER BY ts DESC
        LIMIT ${cap}
      `
      rows = rows.reverse() // oldest-first for prompt
    } else {
      rows = await db`
        SELECT id, ts, thread_id, channel, role, body, case_id, voice_call_id, source, meta
        FROM thread_log
        WHERE thread_id = ${thread_id}
          ${include_system ? db`` : db`AND channel <> 'system'`}
        ORDER BY ts DESC
        LIMIT ${cap}
      `
      rows = rows.reverse()
    }
    const cursor = rows.length ? rows[rows.length - 1].ts : since
    return { entries: rows, cursor }
  } catch (err) {
    logger.warn('threadLog.tail failed', { error: err.message, thread_id, since })
    return { entries: [], cursor: since, error: err.message }
  }
}

/**
 * Compact-formatted tail for prompt injection. One line per entry, capped to
 * `maxLineChars` body chars. Newest LAST (so the model reads it as "what just
 * happened" at the bottom).
 */
function formatTailForPrompt(entries, { maxLineChars = 160 } = {}) {
  if (!entries || !entries.length) return ''
  return entries
    .map((e) => {
      const who = e.role === 'tate' ? 'Tate' : e.role === 'ecodia' ? 'You' : 'system'
      const ch = e.channel === 'system' ? '' : `[${e.channel}] `
      const body = String(e.body || '').replace(/\s+/g, ' ').slice(0, maxLineChars)
      return `${ch}${who}: ${body}`
    })
    .join('\n')
}

/**
 * Read the persisted "last seen cursor" for a given consumer (voice / ide / etc).
 * Returns null if first time.
 */
async function readCursor(consumer, thread_id = 'tate') {
  const key = `cowork.thread_log.cursor.${consumer}.${thread_id}`
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
    if (!rows[0]) return null
    const raw = rows[0].value
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return v?.cursor || null
  } catch (err) {
    logger.warn('threadLog.readCursor failed', { error: err.message, consumer })
    return null
  }
}

async function writeCursor(consumer, cursor, thread_id = 'tate') {
  if (!cursor) return { ok: false, error: 'cursor required' }
  const key = `cowork.thread_log.cursor.${consumer}.${thread_id}`
  try {
    const value = JSON.stringify({ cursor, written_at: new Date().toISOString() })
    await db`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    return { ok: true }
  } catch (err) {
    logger.warn('threadLog.writeCursor failed', { error: err.message, consumer })
    return { ok: false, error: err.message }
  }
}

module.exports = {
  appendThreadLog,
  tailThreadLog,
  formatTailForPrompt,
  readCursor,
  writeCursor,
}

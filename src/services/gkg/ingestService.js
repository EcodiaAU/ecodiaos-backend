'use strict'

/**
 * GKG ingest service - parses NDJSON, encrypts payloads, persists to
 * gkg_events. Phase 1 cut: emit faithfully, no graph mutation. Phase 2
 * cron walks processed_at IS NULL and writes Neo4j.
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md
 * Authored 7 May 2026 fork_mov3r45p_73555d.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const { encrypt } = require('./payloadCrypto')

const ALLOWED_TYPES = new Set([
  'foreground_change',
  'input',
  'screenshot',
  'click_with_uia',
  'allowlist_skip',
  'pause_state',
])

// Coarse classifier from URL/process name -> app_bucket. Matches the
// allowlist groups in laptop-agent/daemons/gkg-allowlist.json. Best-effort;
// anything unknown falls back to null.
function _appBucket(processName, payload) {
  const url = (payload && (payload.chrome_url || payload.url)) || ''
  if (url) {
    const hostMatch = url.match(/^https?:\/\/([^/]+)/i)
    const host = hostMatch ? hostMatch[1].toLowerCase() : ''
    if (host.includes('developer.apple.com') || host.includes('appstoreconnect.apple.com')) return 'apple-dev'
    if (host.includes('console.firebase.google.com') || host.includes('console.cloud.google.com')) return 'google-cloud'
    if (host.includes('play.google.com')) return 'google-play'
    if (host.includes('dashboard.stripe.com')) return 'stripe'
    if (host.includes('vercel.com')) return 'vercel'
    if (host.includes('supabase.com')) return 'supabase'
    if (host.includes('github.com')) return 'github'
    if (host.includes('bitbucket.org')) return 'bitbucket'
    if (host.includes('resend.com')) return 'resend'
    if (host.includes('canva.com')) return 'canva'
    if (host.includes('xero.com')) return 'xero'
    if (host.includes('app.zernio.com')) return 'zernio'
    if (host.includes('cloudflare.com')) return 'cloudflare'
    if (host.includes('claude.ai')) return 'claude'
    if (host.includes('chatgpt.com')) return 'chatgpt'
    if (host.includes('mail.google.com') || host.includes('drive.google.com') || host.includes('docs.google.com') || host.includes('calendar.google.com')) return 'google-workspace'
    if (host.includes('notion.so')) return 'notion'
    if (host.includes('gitbook.com')) return 'gitbook'
  }
  const proc = (processName || '').toLowerCase()
  if (proc === 'code.exe' || proc === 'cursor.exe') return 'editor'
  if (proc === 'slack.exe') return 'slack'
  if (proc === 'discord.exe') return 'discord'
  if (proc === 'teams.exe' || proc === 'ms-teams.exe') return 'teams'
  if (proc === 'postman.exe' || proc === 'insomnia.exe') return 'api-client'
  return null
}

/**
 * Parse NDJSON body. Each line is a JSON event.
 * @param {Buffer|string} body
 * @returns {{events: Array<object>, errors: Array<{idx:number, error:string}>}}
 */
function parseNdjson(body) {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')
  const events = []
  const errors = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      events.push(JSON.parse(line))
    } catch (err) {
      errors.push({ idx: i, error: err.message })
    }
  }
  return { events, errors }
}

function _validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return 'not_object'
  if (typeof ev.session_id !== 'string' || !ev.session_id.length) return 'missing_session_id'
  if (typeof ev.sequence_no !== 'number' || !Number.isFinite(ev.sequence_no)) return 'missing_sequence_no'
  if (typeof ev.timestamp_iso !== 'string') return 'missing_timestamp_iso'
  if (Number.isNaN(Date.parse(ev.timestamp_iso))) return 'bad_timestamp_iso'
  if (typeof ev.event_type !== 'string' || !ALLOWED_TYPES.has(ev.event_type)) return 'bad_event_type'
  if (ev.payload !== null && typeof ev.payload !== 'object') return 'bad_payload'
  return null
}

/**
 * Persist a batch of events. Returns { accepted, rejected }.
 * Uses session_id+sequence_no UNIQUE for idempotency: ON CONFLICT DO NOTHING.
 */
async function persistEvents(events) {
  let accepted = 0
  const rejected = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const validateErr = _validateEvent(ev)
    if (validateErr) {
      rejected.push({ idx: i, reason: validateErr })
      continue
    }

    const payload = ev.payload || {}
    const plaintext = JSON.stringify(payload)
    let enc
    try {
      enc = await encrypt(plaintext)
    } catch (err) {
      rejected.push({ idx: i, reason: 'encrypt_failed' })
      logger.error('gkg.ingest: encrypt failed', { err: err.message })
      continue
    }

    const processName = payload.process_name || null
    const appBucket = _appBucket(processName, payload)
    const redactedCount = Number.isFinite(ev.redacted_count) ? ev.redacted_count : 0

    try {
      const result = await db`
        INSERT INTO gkg_events (
          session_id, sequence_no, timestamp_iso, event_type,
          payload_ciphertext, payload_iv, payload_auth_tag,
          process_name, app_bucket, redacted_count
        ) VALUES (
          ${ev.session_id}, ${ev.sequence_no}, ${ev.timestamp_iso}, ${ev.event_type},
          ${enc.ciphertext}, ${enc.iv}, ${enc.authTag},
          ${processName}, ${appBucket}, ${redactedCount}
        )
        ON CONFLICT (session_id, sequence_no) DO NOTHING
        RETURNING id
      `
      if (result && result.length) {
        accepted++
      } else {
        // Duplicate (idempotent retry). Count as accepted-from-daemon-pov.
        accepted++
      }
    } catch (err) {
      rejected.push({ idx: i, reason: 'db_insert_failed' })
      logger.error('gkg.ingest: db insert failed', { err: err.message, session_id: ev.session_id, sequence_no: ev.sequence_no })
    }
  }

  return { accepted, rejected }
}

module.exports = { parseNdjson, persistEvents, _appBucket, ALLOWED_TYPES }

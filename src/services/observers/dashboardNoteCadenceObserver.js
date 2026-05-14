'use strict'

/**
 * dashboardNoteCadenceObserver — CADENCE listener.
 *
 * Every 10 minutes, looks at OS message rate (turns per hour) and fork
 * spawn rate over the last 2 hours. Asks Haiku for a 1-sentence rhythm
 * observation. Emits nothing if the data is flat or unremarkable.
 *
 * Origin: fork_mp3ziqzn_34ac39, Phase 11, 2026-05-13.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const db = require('../../config/db')

const NAME = 'cadence'
const POLL_INTERVAL_MS = 10 * 60 * 1000
const INITIAL_DELAY_MS = 60_000   // 60s after boot (offset from pattern observer)

const SYSTEM_PROMPT = `You are a quiet observer watching an AI's work rhythm. You get two hours of activity bucketed by 30-minute windows: conductor message turns and fork spawns. Your job: write one plain-English sentence about the current rhythm — bursts vs lulls, acceleration, wind-down, etc.

Return JSON only:
  { "note": "One sentence about the rhythm." }
  { "note": null }

Rules:
- Only emit when the rhythm is actually interesting (a clear burst, a sustained lull >1h, an acceleration).
- Flat steady activity: return null.
- Max 110 characters. No internal IDs. No metrics jargon (no "turn rate 4.2/h").
- Write for a human reader scanning their AI's activity, not an engineer.`

let _intervalHandle = null
let _initDelayHandle = null
let _running = false

async function _readCadenceData() {
  try {
    // Turn rate: conductor messages per 30-min bucket over last 2h.
    // Audit 2026-05-13 P2: canonical user/assistant turn store is
    // os_conversation (not os_session_messages, which doesn't exist as a
    // direct turn table). Try the canonical {role, content} shape first
    // and fall back to {turn_role, turn_text} for older migrations.
    const turnBuckets = await db`
      SELECT
        date_trunc('hour', created_at) +
          INTERVAL '30 minutes' * FLOOR(EXTRACT(minute FROM created_at) / 30) AS bucket,
        COUNT(*)::int AS turns
      FROM os_conversation
      WHERE role = 'assistant'
        AND created_at > NOW() - INTERVAL '2 hours'
      GROUP BY bucket
      ORDER BY bucket
    `.catch(async () => {
      try {
        return await db`
          SELECT
            date_trunc('hour', created_at) +
              INTERVAL '30 minutes' * FLOOR(EXTRACT(minute FROM created_at) / 30) AS bucket,
            COUNT(*)::int AS turns
          FROM os_conversation
          WHERE turn_role = 'assistant'
            AND created_at > NOW() - INTERVAL '2 hours'
          GROUP BY bucket
          ORDER BY bucket
        `
      } catch { return [] }
    })

    // Fork spawn rate per 30-min bucket over last 2h
    const forkBuckets = await db`
      SELECT
        date_trunc('hour', created_at) +
          INTERVAL '30 minutes' * FLOOR(EXTRACT(minute FROM created_at) / 30) AS bucket,
        COUNT(*)::int AS spawns
      FROM os_forks
      WHERE created_at > NOW() - INTERVAL '2 hours'
      GROUP BY bucket
      ORDER BY bucket
    `.catch(() => [])

    return { turnBuckets, forkBuckets }
  } catch (err) {
    logger.debug('dashboardNoteCadence: data read failed', { error: err.message })
    return { turnBuckets: [], forkBuckets: [] }
  }
}

async function _poll() {
  try {
    const { turnBuckets, forkBuckets } = await _readCadenceData()

    if (turnBuckets.length === 0 && forkBuckets.length === 0) return

    const formatBuckets = (buckets, label) => {
      if (buckets.length === 0) return `${label}: no data`
      return `${label}: ` + buckets
        .map(b => {
          const t = new Date(b.bucket)
          const hh = String(t.getHours()).padStart(2, '0')
          const mm = String(t.getMinutes()).padStart(2, '0')
          return `${hh}:${mm}=${b.turns ?? b.spawns}`
        })
        .join(', ')
    }

    const userMessage = [
      formatBuckets(turnBuckets, 'Conductor turns (30min buckets)'),
      formatBuckets(forkBuckets, 'Fork spawns (30min buckets)'),
      '',
      'Describe the rhythm in one sentence. Return JSON.',
    ].join('\n')

    const result = await haikuClient.call({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      observerName: NAME,
    })

    const noteText = typeof result?.note === 'string' ? result.note.trim() : null
    if (!noteText) return

    await db`
      INSERT INTO dashboard_notes (listener_name, note_text, related_entity)
      VALUES (${NAME}, ${noteText.slice(0, 300)}, ${JSON.stringify({
        source: 'os_conversation+os_forks',
        turn_buckets: turnBuckets.length,
        fork_buckets: forkBuckets.length,
      })}::jsonb)
    `
    logger.debug('dashboardNoteCadence: note written', { preview: noteText.slice(0, 60) })
  } catch (err) {
    logger.warn('dashboardNoteCadence: poll error', { error: err.message })
  }
}

function start() {
  if (_running) return
  _running = true
  _initDelayHandle = setTimeout(() => {
    _poll().catch(() => {})
    _intervalHandle = setInterval(() => _poll().catch(() => {}), POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
  logger.info('dashboardNoteCadence observer started')
}

function stop() {
  _running = false
  if (_initDelayHandle) { clearTimeout(_initDelayHandle); _initDelayHandle = null }
  if (_intervalHandle)  { clearInterval(_intervalHandle); _intervalHandle = null }
}

module.exports = { start, stop, _poll }

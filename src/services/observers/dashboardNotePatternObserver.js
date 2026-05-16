'use strict'

/**
 * dashboardNotePatternObserver — PATTERN listener.
 *
 * Every 10 minutes, reads recent dispatch_event / perception_event rows
 * and asks Haiku to spot any emerging behavioural cluster (2+ similar
 * action types, recurring themes, drift signals).
 *
 * Emits 0 or 1 note per tick. If no pattern is visible, emits nothing.
 *
 * Origin: fork_mp3ziqzn_34ac39, Phase 11, 2026-05-13.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const db = require('../../config/db')

const NAME = 'pattern'
const POLL_INTERVAL_MS = 10 * 60 * 1000   // 10 minutes
const INITIAL_DELAY_MS = 45_000            // 45s after boot

const SYSTEM_PROMPT = `You are a quiet observer watching an AI operating system run its day. You have access to a short window of recent events (dispatched tasks, cron fires, fork completions, perception triggers). Your job: spot any emerging behavioural pattern — a cluster of similar actions, a recurring theme, a rhythm shift, or a drift signal.

Return JSON only, one of:
  { "note": "One or two plain-English sentences describing the pattern." }
  { "note": null }

Rules:
- Only emit a note when a genuine pattern is visible (2+ related events, clear cluster).
- Write for Tate, not for an engineer. No internal IDs, no jargon, no performance metrics.
- Max 120 characters per note. Past tense or present-continuous observation.
- If events are sparse or random, return null.`

let _intervalHandle = null
let _initDelayHandle = null
let _running = false

async function _readRecentEvents() {
  try {
    // dispatch_events: what the conductor dispatched recently
    const dispatches = await db`
      SELECT action_type, subtype, created_at
      FROM dispatch_event
      WHERE created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 30
    `.catch(() => [])

    // os_observations: canonical perception substrate (perceptionBus.js
    // writes here). Audit 2026-05-13 P2: previous query used the wrong
    // table name `perception_events`, which doesn't exist — query landed
    // in the .catch and silently returned empty.
    const perceptions = await db`
      SELECT kind AS type, observed_at AS created_at
      FROM os_observations
      WHERE observed_at > NOW() - INTERVAL '30 minutes'
      ORDER BY observed_at DESC
      LIMIT 30
    `.catch(() => [])

    // recent fork activity
    const forks = await db`
      SELECT status, created_at
      FROM os_forks
      WHERE created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 20
    `.catch(() => [])

    return { dispatches, perceptions, forks }
  } catch (err) {
    logger.debug('dashboardNotePattern: event read failed', { error: err.message })
    return { dispatches: [], perceptions: [], forks: [] }
  }
}

async function _poll() {
  try {
    const { dispatches, perceptions, forks } = await _readRecentEvents()
    const totalEvents = dispatches.length + perceptions.length + forks.length

    if (totalEvents < 3) {
      // Not enough data to spot a pattern
      return
    }

    const lines = []
    if (dispatches.length > 0) {
      const summary = dispatches
        .map(d => `${d.action_type}${d.subtype ? '/' + d.subtype : ''}`)
        .join(', ')
      lines.push(`Dispatches (last 30min): ${summary}`)
    }
    if (perceptions.length > 0) {
      const typeCounts = {}
      perceptions.forEach(p => { typeCounts[p.type] = (typeCounts[p.type] || 0) + 1 })
      const summary = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([t, c]) => `${t}×${c}`)
        .join(', ')
      lines.push(`Perception events: ${summary}`)
    }
    if (forks.length > 0) {
      const statusCounts = {}
      forks.forEach(f => { statusCounts[f.status] = (statusCounts[f.status] || 0) + 1 })
      const summary = Object.entries(statusCounts).map(([s, c]) => `${s}×${c}`).join(', ')
      lines.push(`Fork outcomes: ${summary}`)
    }

    const userMessage = `Recent activity window:\n${lines.join('\n')}\n\nSpot any pattern? Return JSON.`

    const result = await haikuClient.call({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      observerName: NAME,
    })

    const noteText = typeof result?.note === 'string' ? result.note.trim() : null
    if (!noteText) return

    await db`
      INSERT INTO dashboard_notes (listener_name, note_text, related_entity)
      VALUES (${NAME}, ${noteText.slice(0, 300)}, ${JSON.stringify({ source: 'dispatch+perception', event_count: totalEvents })}::jsonb)
    `
    logger.debug('dashboardNotePattern: note written', { preview: noteText.slice(0, 60) })
  } catch (err) {
    logger.warn('dashboardNotePattern: poll error', { error: err.message })
  }
}

function start() {
  if (_running) return
  _running = true
  _initDelayHandle = setTimeout(() => {
    _poll().catch(err => logger.debug('bg task error', { err: err.message }))
    _intervalHandle = setInterval(() => _poll().catch(err => logger.debug('bg task error', { err: err.message })), POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
  logger.info('dashboardNotePattern observer started')
}

function stop() {
  _running = false
  if (_initDelayHandle) { clearTimeout(_initDelayHandle); _initDelayHandle = null }
  if (_intervalHandle)  { clearInterval(_intervalHandle); _intervalHandle = null }
}

module.exports = { start, stop, _poll }

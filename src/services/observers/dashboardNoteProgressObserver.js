'use strict'

/**
 * dashboardNoteProgressObserver — PROGRESS listener.
 *
 * Every 15 minutes, reads status_board rows whose last_touched is within
 * the last 30 minutes, looking for meaningful forward motion (status
 * changes, next_action updates, rows archived as complete).
 *
 * Emits 0 or 1 note per tick.
 *
 * Origin: fork_mp3ziqzn_34ac39, Phase 11, 2026-05-13.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const db = require('../../config/db')

const NAME = 'progress'
const POLL_INTERVAL_MS = 15 * 60 * 1000
const INITIAL_DELAY_MS = 120_000   // 2min after boot

const SYSTEM_PROMPT = `You are a quiet observer watching an AI operating system make progress on its work. You receive a snapshot of status_board rows that were recently touched (last 30 minutes), including rows that were just archived as complete. Your job: write one sentence noting the most meaningful forward motion you see.

Return JSON only:
  { "note": "One sentence about a meaningful step forward." }
  { "note": null }

Rules:
- Prioritise: completions (archived) > status changes to 'live'/'done' > active work on P1/P2 items.
- Max 120 characters. Plain English, no internal IDs, no priority numbers.
- If the recent touches look like routine polling or minor bookkeeping, return null.
- Do not note things that are still blocked or waiting.`

let _intervalHandle = null
let _initDelayHandle = null
let _running = false

async function _readProgressData() {
  try {
    // Recently touched active rows
    const recentTouches = await db`
      SELECT name, status, entity_type, next_action, priority
      FROM status_board
      WHERE last_touched > NOW() - INTERVAL '30 minutes'
        AND archived_at IS NULL
      ORDER BY priority, last_touched DESC
      LIMIT 12
    `.catch(() => [])

    // Recently archived (completed) rows
    const recentCompletions = await db`
      SELECT name, entity_type
      FROM status_board
      WHERE archived_at > NOW() - INTERVAL '30 minutes'
      ORDER BY archived_at DESC
      LIMIT 8
    `.catch(() => [])

    return { recentTouches, recentCompletions }
  } catch (err) {
    logger.debug('dashboardNoteProgress: data read failed', { error: err.message })
    return { recentTouches: [], recentCompletions: [] }
  }
}

async function _poll() {
  try {
    const { recentTouches, recentCompletions } = await _readProgressData()

    if (recentTouches.length === 0 && recentCompletions.length === 0) return

    const lines = []

    if (recentCompletions.length > 0) {
      lines.push('Recently completed (archived):')
      recentCompletions.forEach(r => {
        lines.push(`  - [${r.entity_type}] ${r.name}`)
      })
    }

    if (recentTouches.length > 0) {
      lines.push('Recently updated (still active):')
      recentTouches.forEach(r => {
        lines.push(`  - [${r.entity_type}] ${r.name} — status: ${r.status}${r.next_action ? ', next: ' + r.next_action.slice(0, 70) : ''}`)
      })
    }

    const userMessage = lines.join('\n') + '\n\nNote the most meaningful forward motion. Return JSON.'

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
        source: 'status_board',
        completions: recentCompletions.length,
        touches: recentTouches.length,
      })}::jsonb)
    `
    logger.debug('dashboardNoteProgress: note written', { preview: noteText.slice(0, 60) })
  } catch (err) {
    logger.warn('dashboardNoteProgress: poll error', { error: err.message })
  }
}

function start() {
  if (_running) return
  _running = true
  _initDelayHandle = setTimeout(() => {
    _poll().catch(err => logger.debug('bg task error', { err: err.message }))
    _intervalHandle = setInterval(() => _poll().catch(err => logger.debug('bg task error', { err: err.message })), POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
  logger.info('dashboardNoteProgress observer started')
}

function stop() {
  _running = false
  if (_initDelayHandle) { clearTimeout(_initDelayHandle); _initDelayHandle = null }
  if (_intervalHandle)  { clearInterval(_intervalHandle); _intervalHandle = null }
}

module.exports = { start, stop, _poll }

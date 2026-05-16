'use strict'

/**
 * dashboardNoteConnectionObserver — CONNECTION listener.
 *
 * Every 15 minutes, reads status_board + working_set rows and looks for
 * entities (client names, project names, topic keywords) that appear
 * across multiple independent threads. Asks Haiku to surface the hot topic.
 *
 * Emits 0 or 1 note per tick.
 *
 * Origin: fork_mp3ziqzn_34ac39, Phase 11, 2026-05-13.
 */

const logger = require('../../config/logger')
const haikuClient = require('./_haikuClient')
const db = require('../../config/db')

const NAME = 'connection'
const POLL_INTERVAL_MS = 15 * 60 * 1000
const INITIAL_DELAY_MS = 90_000   // 90s after boot

const SYSTEM_PROMPT = `You are a quiet observer watching an AI's work threads. You receive a list of active status_board rows and working_set threads — names and short descriptions. Your job: find any entity (client, project, technology, concept) that appears or is referenced across two or more independent threads. Surface it as a "hot topic".

Return JSON only:
  { "note": "One sentence naming the hot topic and the threads it connects." }
  { "note": null }

Rules:
- Only emit when a genuine cross-thread entity is visible (2+ threads clearly share a common subject).
- Max 130 characters. Plain English, no internal IDs.
- If threads look completely unrelated, return null.`

let _intervalHandle = null
let _initDelayHandle = null
let _running = false

async function _readThreadData() {
  try {
    const statusRows = await db`
      SELECT name, status, next_action, entity_type
      FROM status_board
      WHERE archived_at IS NULL
        AND next_action_by = 'ecodiaos'
      ORDER BY priority, last_touched DESC
      LIMIT 15
    `.catch(() => [])

    const workingSet = await db`
      SELECT topic, intent, status
      FROM working_set
      WHERE status IN ('active', 'blocked')
      ORDER BY last_touched_at DESC
      LIMIT 10
    `.catch(() => [])

    return { statusRows, workingSet }
  } catch (err) {
    logger.debug('dashboardNoteConnection: data read failed', { error: err.message })
    return { statusRows: [], workingSet: [] }
  }
}

async function _poll() {
  try {
    const { statusRows, workingSet } = await _readThreadData()
    const totalThreads = statusRows.length + workingSet.length

    if (totalThreads < 3) return

    const lines = []

    if (statusRows.length > 0) {
      lines.push('Status board threads:')
      statusRows.forEach(r => {
        lines.push(`  - [${r.entity_type}] ${r.name}${r.next_action ? ': ' + r.next_action.slice(0, 80) : ''}`)
      })
    }

    if (workingSet.length > 0) {
      lines.push('Active working threads:')
      workingSet.forEach(t => {
        lines.push(`  - ${t.topic}${t.intent ? ' (' + t.intent.slice(0, 60) + ')' : ''}`)
      })
    }

    const userMessage = lines.join('\n') + '\n\nFind cross-thread hot topics. Return JSON.'

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
        source: 'status_board+working_set',
        thread_count: totalThreads,
      })}::jsonb)
    `
    logger.debug('dashboardNoteConnection: note written', { preview: noteText.slice(0, 60) })
  } catch (err) {
    logger.warn('dashboardNoteConnection: poll error', { error: err.message })
  }
}

function start() {
  if (_running) return
  _running = true
  _initDelayHandle = setTimeout(() => {
    _poll().catch(err => logger.debug('bg task error', { err: err.message }))
    _intervalHandle = setInterval(() => _poll().catch(err => logger.debug('bg task error', { err: err.message })), POLL_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
  logger.info('dashboardNoteConnection observer started')
}

function stop() {
  _running = false
  if (_initDelayHandle) { clearTimeout(_initDelayHandle); _initDelayHandle = null }
  if (_intervalHandle)  { clearInterval(_intervalHandle); _intervalHandle = null }
}

module.exports = { start, stop, _poll }

'use strict'

/**
 * seedFollowupNudges
 *
 * Side-effect helper to seed three status_board follow-up nudges after
 * an outbound email is sent. Nudges fire at +2d, +7d, +14d. Each is a
 * priority-4 status_board row scoped to entity_type='thread'.
 *
 * Called by gmailService send paths after a real outbound send.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const SCHEDULE_DAYS = [2, 7, 14]
const MS_PER_DAY = 24 * 60 * 60 * 1000

function _addDaysIso(base, days) {
  const t = (base ? new Date(base).getTime() : Date.now()) + days * MS_PER_DAY
  return new Date(t).toISOString()
}

async function seedFollowupNudges({ thread_id, recipient, client_slug, sent_at } = {}) {
  if (!recipient) {
    logger.debug('seedFollowupNudges skipped: missing recipient', { thread_id })
    return []
  }

  const ids = []
  const entityRef = thread_id ? String(thread_id) : `recipient:${recipient}`
  const baseContext = {
    thread_id: thread_id || null,
    recipient,
    client_slug: client_slug || null,
    sent_at: sent_at || new Date().toISOString(),
    seeder: 'seedFollowupNudges',
  }

  for (const days of SCHEDULE_DAYS) {
    const name = `Follow-up nudge (${days}d): ${recipient}`
    try {
      const existing = await db`
        SELECT id FROM status_board
        WHERE entity_type = 'thread'
          AND entity_ref = ${entityRef}
          AND name = ${name}
          AND archived_at IS NULL
        LIMIT 1
      `
      if (existing.length > 0) {
        ids.push(existing[0].id)
        continue
      }

      const dueIso = _addDaysIso(sent_at, days)
      const context = JSON.stringify({ ...baseContext, nudge_offset_days: days }).slice(0, 4000)

      const inserted = await db`
        INSERT INTO status_board
          (entity_type, entity_ref, name, status, next_action, next_action_by, priority,
           next_action_due, source, context, last_touched)
        VALUES (
          'thread',
          ${entityRef},
          ${name},
          'scheduled',
          'Check for reply; if none, draft follow-up.',
          'ecodiaos',
          4,
          ${dueIso},
          'seed_followup_nudges',
          ${context},
          NOW()
        )
        RETURNING id
      `
      if (inserted[0]?.id) ids.push(inserted[0].id)
    } catch (err) {
      logger.warn('seedFollowupNudges: nudge insert failed', {
        thread_id, recipient, days, error: err.message,
      })
    }
  }

  return ids
}

module.exports = { seedFollowupNudges }

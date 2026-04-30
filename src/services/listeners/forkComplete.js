'use strict'

/**
 * forkComplete listener
 *
 * Fires when an os_forks row transitions to a terminal state or becomes stale:
 *   (a) status in ['done', 'aborted', 'error'] - terminal completion
 *   (b) status in ['running', 'spawning', 'reporting'] AND last_heartbeat
 *       is more than 10 minutes old - implies the fork has hung
 *
 * Wake-on-failure-only contract (silent-ears architecture, Tate 30 Apr 2026 13:18 AEST):
 *   - status='done' is SILENT. Logs to DB only, no wake POST. Parent dispatchers
 *     know what they queued and probe the DB on their next turn. Avoids flooding
 *     the conductor's chat context with successful-completion noise.
 *   - status='aborted' or status='error' WAKES. Failures need conductor attention.
 *   - Stale-heartbeat (no progress signal for 10+ minutes) WAKES.
 *
 * Stale-heartbeat alerts are deduplicated per fork_id (in-memory Set).
 *
 * Wakes the OS via HTTP POST - never imports the session service directly.
 */

const logger = require('../../config/logger')
const axios = require('axios')

const PORT = process.env.PORT || 3001
const STALE_HEARTBEAT_MS = 10 * 60 * 1000  // 10 minutes

const TERMINAL_STATUSES = new Set(['done', 'aborted', 'error'])
const RUNNING_STATUSES = new Set(['running', 'spawning', 'reporting'])

// Dedupe stale-heartbeat alerts: once alerted for a given fork_id, do not
// re-alert until the fork reaches a terminal state (which clears the entry).
const _staledForks = new Set()

async function _wakeOsSession(message, forkId) {
  try {
    await axios.post(`http://localhost:${PORT}/api/os-session/message`, { message }, {
      timeout: 5000,
    })
  } catch (err) {
    logger.warn('forkComplete: wake POST failed', {
      error: err.message,
      forkId,
    })
  }
}

module.exports = {
  name: 'forkComplete',
  subscribesTo: ['db:event'],

  relevanceFilter: (event) => {
    const d = event && event.data
    if (!d || d.type !== 'db:event') return false
    if (d.table !== 'os_forks') return false
    if (d.action !== 'UPDATE') return false
    if (!d.row) return false

    const row = d.row
    const status = row.status

    // Terminal state - always relevant
    if (TERMINAL_STATUSES.has(status)) return true

    // Running state with stale last_heartbeat
    if (RUNNING_STATUSES.has(status) && row.last_heartbeat) {
      const lastHeartbeat = new Date(row.last_heartbeat)
      if (!isNaN(lastHeartbeat.getTime()) && Date.now() - lastHeartbeat.getTime() > STALE_HEARTBEAT_MS) {
        return true
      }
    }

    return false
  },

  handle: async (event, ctx) => {
    const row = event.data.row
    const forkId = row.fork_id
    const status = row.status

    if (TERMINAL_STATUSES.has(status)) {
      // Clear stale-alert dedup on terminal transition - fork is done
      _staledForks.delete(forkId)

      // Silent path: successful completion. Log to DB only, no wake.
      // Parent dispatchers know what they queued and will probe DB on next turn.
      // Avoids flooding conductor context per silent-ears architecture
      // (Tate 30 Apr 2026 13:18 AEST).
      if (status === 'done') {
        logger.info('forkComplete: terminal done (silent, no wake)', { forkId })
        return
      }

      // Wake path: aborted or error. Conductor needs to know.
      const resultSnippet = row.result ? String(row.result).slice(0, 200) : 'none'
      const message = (
        `Fork ${forkId} completed with status=${status} (FAILED). ` +
        `Result: ${resultSnippet}. ` +
        `Next step: ${row.next_step || 'investigate'}. ` +
        `Source: forkComplete listener (sourceEventId=${ctx.sourceEventId}).`
      )
      logger.info('forkComplete: terminal failure', { forkId, status })
      await _wakeOsSession(message, forkId)
    } else {
      // Stale heartbeat - dedupe so we don't spam the OS per-tick
      if (_staledForks.has(forkId)) return
      _staledForks.add(forkId)

      const message = (
        `Fork ${forkId} appears stale: status=${status}, ` +
        `last_heartbeat=${row.last_heartbeat} (over 10 minutes ago). ` +
        `Investigate or abort the fork. ` +
        `Source: forkComplete listener (sourceEventId=${ctx.sourceEventId}).`
      )
      logger.info('forkComplete: stale heartbeat', { forkId, status, lastHeartbeat: row.last_heartbeat })
      await _wakeOsSession(message, forkId)
    }
  },

  ownsWriteSurface: ['os-session-message'],
}

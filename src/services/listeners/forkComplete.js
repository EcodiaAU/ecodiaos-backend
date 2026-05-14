'use strict'

/**
 * forkComplete listener
 *
 * Fires when an os_forks row transitions to a terminal state or becomes stale:
 *   (a) status in ['done', 'aborted', 'error'] - terminal completion
 *   (b) status in ['running', 'spawning', 'reporting'] AND last_heartbeat
 *       is more than 10 minutes old - implies the fork has hung
 *
 * Wake contract (silent-ears architecture, Tate 30 Apr 2026 13:18 AEST,
 * extended to terminal failures Tate 5 May 2026 12:40 AEST,
 * autonomy-gap clarification Tate 6 May 2026 ~10:29 AEST):
 * - status='done' WITH a real [FORK_REPORT] body → WAKE the conductor
 *     (autonomy delivery path). Without this wake, queued fork_reports sit
 *     in messageQueue until the next Tate-typed message or scheduled cron
 *     tick (meta-loop, hourly), which breaks fork-driven autonomous chains.
 *     The wake POST runs in 'direct' mode, so drainIntoDirectMessage prepends
 *     any queued fork_reports already in messageQueue to the same turn.
 * - status='done' with EMPTY result OR phantom-bail marker → SILENT.
 *     Phantom-bails are forks that closed without emitting [FORK_REPORT];
 *     the inbox already shows them with no_report_emitted=true via the
 *     forkService enqueue path. Waking on those would just spam.
 * - status='aborted' or status='error' is SILENT. Logs to DB +
 *     publishes perception. The conductor sees fork failures via <forks_rollup>
 *     context-stitching on the next natural turn - no chat-stream pollution.
 *     See ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md.
 * - Stale-heartbeat (no progress signal for 10+ minutes) STILL WAKES - a hung
 *     fork is not otherwise visible in <forks_rollup>.
 *
 * Stale-heartbeat alerts are deduplicated per fork_id (in-memory Set).
 *
 * Wakes the OS via HTTP POST - never imports the session service directly.
 */

const logger = require('../../config/logger')
const axios = require('axios')
// Note: §2.1 untrusted-input wrapping for fork-emitted free text is no longer
// needed in this listener - terminal failures (status='aborted'/'error') now
// publish to perception only and do NOT compose a conductor-chat message.
// Stale-heartbeat path emits a fixed-format message that contains no
// fork-emitted free text. See ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md.

const PORT = process.env.PORT || 3001
const STALE_HEARTBEAT_MS = 10 * 60 * 1000  // 10 minutes

const TERMINAL_STATUSES = new Set(['done', 'aborted', 'error'])
const RUNNING_STATUSES = new Set(['running', 'spawning', 'reporting'])

// Phantom-bail fingerprint - must match FALLBACK_MARKER in forkService.js.
// forkService stores result as "(no [FORK_REPORT] emitted; last N chars of
// transcript follow)\n\n${tail}" when a fork closes without emitting the
// closing tag. Treating those as "real reports" and waking the conductor
// would just spam - they have no actionable summary, only transcript tail.
// Brief: literal `result.includes('[FORK_REPORT]')` check would invert this
// (phantom-bail strings DO contain '[FORK_REPORT]' as part of the marker text;
// clean reports DON'T because forkService strips the tag during regex extract).
// Implemented per the brief's spirit: empty/phantom-bail = silent, otherwise wake.
const FALLBACK_MARKER_PREFIX = '(no [FORK_REPORT] emitted'

// Dedupe stale-heartbeat alerts: once alerted for a given fork_id, do not
// re-alert until the fork reaches a terminal state (which clears the entry).
const _staledForks = new Set()

// ─── Wake batching (13 May 2026) ──────────────────────────────────────────
// Without batching, every fork completion sends an independent
// `[SYSTEM: fork_report ...]` POST to /api/os-session/message. When several
// forks complete back-to-back (common — manager + workers, batched cron
// dispatch, parallel arcs), the conductor sees a string of consecutive
// user-role turns and chains a fork-progress narration for each — burying
// any Tate-typed message that lands among them. Tate flagged 13 May 2026
// verbatim: "its jsut straight up not replying to my messages at all".
//
// Batch window: 20s. If a wake fires while another is in-flight or queued
// within the window, append its message and the API receives ONE
// consolidated wake at the end of the window. The conductor then sees a
// single user turn with all fork reports stitched together — same
// information density, far less narration overhead, and Tate's typed
// messages are no longer drowned.
const WAKE_BATCH_WINDOW_MS = 20_000
let _wakeBatch = null  // { parts: [{forkId, message, ts}], timer, started_at }

function _flushWakeBatch() {
  if (!_wakeBatch || _wakeBatch.parts.length === 0) {
    _wakeBatch = null
    return
  }
  const parts = _wakeBatch.parts
  _wakeBatch = null

  // Single-fork case: no batching overhead, send the raw message.
  if (parts.length === 1) {
    axios.post(`http://localhost:${PORT}/api/os-session/message`, { message: parts[0].message }, { timeout: 5000 })
      .catch(err => logger.warn('forkComplete: wake POST failed', { error: err.message, forkId: parts[0].forkId }))
    return
  }

  // Multi-fork: send one consolidated wake. The conductor still sees the
  // individual fork_ids and bodies, but as a single turn instead of N.
  const header = `[SYSTEM: fork_reports_batched count=${parts.length} window=${WAKE_BATCH_WINDOW_MS / 1000}s]`
  const body = parts.map((p, i) => `--- Fork ${i + 1}/${parts.length}: ${p.forkId} ---\n${p.message}`).join('\n\n')
  const consolidated = `${header}\n${body}`
  logger.info('forkComplete: batched wake POST sending', {
    count: parts.length,
    forkIds: parts.map(p => p.forkId),
    bytes: consolidated.length,
  })
  axios.post(`http://localhost:${PORT}/api/os-session/message`, { message: consolidated }, { timeout: 5000 })
    .catch(err => logger.warn('forkComplete: batched wake POST failed', { error: err.message, count: parts.length }))
}

async function _wakeOsSession(message, forkId) {
  // Audit 2026-05-13 P1: durability shadow. In addition to the in-memory
  // 20s batch (which loses parts on PM2 SIGTERM mid-window), also
  // enqueue the message into the durable messageQueue substrate so that
  // a process restart can drain pending wake messages on next boot.
  // messageQueue is idempotent on (body, source) so a successful batch
  // flush followed by drain doesn't double-fire — drainIntoDirectMessage
  // prepends queued messages onto the next direct send. Fire-and-forget;
  // the in-memory path is still the fast happy path. Mark this entry
  // with a short max_age so it expires if the batch flushed successfully.
  try {
    const mq = require('../messageQueue')
    if (mq && typeof mq.enqueueMessage === 'function') {
      // Best-effort persist; do not block the in-memory batch path.
      // Synthetic source 'fork_wake_recovery' so the drain logic can
      // distinguish these from normal queued user messages.
      mq.enqueueMessage({
        body: String(message),
        source: 'fork_wake_recovery',
        mode: 'queue',
        max_age_hours: 1,
      }).catch((err) => {
        logger.debug('forkComplete: wake recovery enqueue failed (non-fatal)', {
          forkId, error: err && err.message,
        })
      })
    }
  } catch { /* messageQueue not available; in-memory batch still runs */ }

  if (!_wakeBatch) {
    _wakeBatch = { parts: [{ forkId, message, ts: Date.now() }], started_at: Date.now() }
    _wakeBatch.timer = setTimeout(_flushWakeBatch, WAKE_BATCH_WINDOW_MS)
    if (_wakeBatch.timer && _wakeBatch.timer.unref) _wakeBatch.timer.unref()
    logger.debug('forkComplete: wake batched (window open)', { forkId })
    return
  }
  _wakeBatch.parts.push({ forkId, message, ts: Date.now() })
  logger.debug('forkComplete: wake added to in-flight batch', {
    forkId,
    batchSize: _wakeBatch.parts.length,
  })
}

// Audit 2026-05-13 P1: called from server.js gracefulShutdown so an
// in-flight 20s batch is flushed synchronously before the process exits.
// Cancels the pending timer and runs the flush right now; combined with
// the messageQueue durability shadow above, this is belt-and-braces:
// the batch usually delivers; if not, the durable queue replays on
// next boot.
async function flushPendingWakes() {
  if (!_wakeBatch) return { flushed: 0 }
  const count = _wakeBatch.parts.length
  try {
    if (_wakeBatch.timer) clearTimeout(_wakeBatch.timer)
  } catch { /* swallow */ }
  try {
    _flushWakeBatch()
  } catch (err) {
    logger.warn('forkComplete: flushPendingWakes threw (non-fatal)', { error: err && err.message })
  }
  return { flushed: count }
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

      // Terminal-success path. Two sub-cases:
      //   (a) result is empty OR starts with phantom-bail marker → SILENT.
      //       Phantom-bail forks closed without emitting [FORK_REPORT];
      //       forkService already enqueued a no_report_emitted=true SYSTEM
      //       message (forkService.js:177-183). Waking on those would spam.
      //   (b) result is a real FORK_REPORT body → WAKE the conductor
      //       (autonomy delivery path, Tate 6 May 2026 ~10:29 AEST).
      //       Without this wake, queued fork_reports drain only on next
      //       Tate-typed message or scheduled cron tick, breaking
      //       fork-driven autonomous chains.
      //
      // Note: forkService.spawnFork already publishes a richer fork_complete
      // event with tokens/duration/parent_id at terminal-success
      // (forkService.js:929-945, source='fork:<id>'). Do not re-publish here
      // from the db:event observation path - it would duplicate every
      // successful fork in os_observations and double-count in
      // perception_summary. See drafts/proposed-design-fixes/01-dedupe-fork-complete-publishes.md.
      // The aborted/error publish below is retained because forkService
      // publishes only on success; this listener is the single emitter for
      // terminal-failure events.
      if (status === 'done') {
        const result = (row.result || '').toString()
        const isEmpty = !result.trim()
        const isPhantomBail = result.startsWith(FALLBACK_MARKER_PREFIX)

        // working_set: close the thread regardless of result quality
        ;(async () => {
          try {
            const ws = require('../workingSetService')
            const thread = await ws.findByForkId(forkId)
            if (thread) {
              const resolution = isEmpty ? 'phantom/empty result' : isPhantomBail ? 'phantom bail (no FORK_REPORT)' : 'done with FORK_REPORT'
              await ws.closeThread(thread.id, { resolution })
            }
          } catch { /* non-fatal */ }
        })()

        if (isEmpty || isPhantomBail) {
          logger.info('forkComplete: terminal done with no FORK_REPORT body (silent, no wake)', {
            forkId, isEmpty, isPhantomBail,
          })
          return
        }

        // Cron-routed fork: suppress wake. Outcome reaches the conductor via
        // <forks_rollup> on the next natural turn, NOT as a forced turn fire.
        // is_cron is plumbed into the pg_notify payload by migration 088
        // (eos_listener_notify_compact extended for the os_forks branch).
        // Tate verbatim 7 May 2026 09:15 AEST: "it should jsut be handled by
        // a fork that you can ignore unless needed."
        // The matching messageQueue suppression lives in
        // forkService._enqueueForkReport - together they keep cron-fork
        // reports off the conductor turn substrate entirely.
        // Genuine emergencies still surface: cron forks that write a P1
        // status_board row hit perceptionBus + the status-board-write surface,
        // both of which remain wired. This guard ONLY suppresses the
        // forkComplete-listener-driven wake on success-with-FORK_REPORT.
        // Doctrine: ~/ecodiaos/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md
        if (row.is_cron === true) {
          logger.info('forkComplete: cron-routed fork done with [FORK_REPORT] (silent, substrate-only - no wake)', {
            forkId, resultLen: result.length,
          })
          return
        }

        // Real successful completion with FORK_REPORT body - wake conductor.
        // Wake POST runs in 'direct' mode. Per the duplicate-delivery gate in
        // forkService._enqueueForkReport (sibling fix to this patch, fork
        // fork_mouuhla4_128a27, 7 May 2026 12:05 AEST), clean reports SKIP the
        // messageQueue.enqueueMessage path - so this wake is the SOLE conductor-
        // facing delivery surface for non-empty FORK_REPORT bodies. The full
        // body lives durably on os_forks.${forkId}.result; the conductor can
        // probe via mcp__forks__get_fork or db_query if the excerpt is
        // insufficient.
        //
        // Empty-body and phantom-bail cases (handled in the isEmpty/isPhantomBail
        // silent branch above) DO still flow through the queue path, since this
        // listener stays silent for them and the queue drain on a future turn
        // is the only surface they have.
        const excerpt = result.length > 400 ? result.slice(0, 400) + '…' : result
        const truncated = result.length > 400
        const wakeMessage = [
          `[SYSTEM: fork_report ${forkId} wake_on_done=true]`,
          `Fork completed with [FORK_REPORT]. ${truncated ? `Full body in os_forks.${forkId}.result (probe via mcp__forks__get_fork if excerpt insufficient).` : 'Full body shown below.'}`,
          '',
          `Report${truncated ? ' excerpt' : ''}:`,
          excerpt,
        ].join('\n')

        logger.info('forkComplete: terminal done with [FORK_REPORT], wake POST sending', {
          forkId, resultLen: result.length,
        })
        // Fire-and-forget - _wakeOsSession has its own try/catch + 5s timeout,
        // and never throws. Do not await: the listener handler should not
        // block on HTTP for the wake.
        _wakeOsSession(wakeMessage, forkId)
        return
      }

      // Silent path: terminal failure (aborted or error).
      // Per ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
      // (Tate 5 May 2026 12:40 AEST), terminal failures publish to perception
      // and log to the DB only - never POST to /api/os-session/message.
      // The conductor sees the failure via <forks_rollup> context-stitching
      // on the next natural turn, not as a chat message. Avoids duplicating
      // a signal the conductor already has into chat-stream pollution.
      logger.info('forkComplete: terminal failure (silent, no wake)', { forkId, status })
      try { require('../perceptionBus').publish({ source: 'fork', kind: `fork_${status}`, data: { fork_id: forkId, status }, confidence: 1.0 }) } catch {}
      // working_set: close thread on terminal failure.
      // error/aborted are terminal states — the thread is done, not pending
      // investigation. Leaving rows in 'blocked' caused 33 stale rows to
      // accumulate over 6h (12 May 2026), saturating <working_set> context.
      // Resolution label encodes the failure so conductor can triage via
      // the context block without the row staying permanently open.
      // fix: fork_mp3kbkfc_50a1e5
      ;(async () => {
        try {
          const ws = require('../workingSetService')
          const thread = await ws.findByForkId(forkId)
          if (thread) {
            const reason = row.abort_reason || status
            await ws.closeThread(thread.id, {
              resolution: `fork_${status}: ${reason.slice(0, 200)}`,
            })
          }
        } catch { /* non-fatal */ }
      })()
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

  // Audit 2026-05-13 P1: called from server.js gracefulShutdown so the
  // 20s wake batch is drained before PM2 sends SIGKILL.
  flushPendingWakes,
}

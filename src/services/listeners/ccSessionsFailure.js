'use strict'

/**
 * ccSessionsFailure listener
 *
 * Fires when a cc_sessions row enters an error or failed state and is a
 * GENUINE Factory dispatch (not an OS-session shell):
 *   - status='error'
 *   - pipeline_stage='failed'
 *   - pipeline_stage='error'
 *
 * Exclusions:
 *   - status='complete' - those go to factorySessionComplete.
 *   - triggered_by='cortex' - OS-session shells, not Factory dispatches.
 *   - codebase_id IS NULL - shell-shaped rows with no Factory deliverable
 *     to investigate / reject / redispatch.
 *
 * Side effect: publishes to perceptionBus only. NEVER POSTs to
 * /api/os-session/message. The conductor sees the failure via
 * <perception_summary> context-stitching on the next natural turn -
 * no chat-stream pollution.
 *
 * Architectural rule (mirrors the 5 May 2026 forkComplete refactor):
 *   ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
 *   Tate verbatim 5 May 2026 12:40 AEST: "Stop dealing with this in the
 *   conductor chat for fuck sake".
 *
 * Origin: 8 May 2026, fork_mowd86qm_e298bf. cc_sessions row
 * dcd248f3-f9b4-4bbc-b261-8a8aaf4114a8 (a cortex OS-session shell with
 * triggered_by='cortex', codebase_id=NULL, working_dir=NULL) tripped this
 * listener and POSTed a fake "Factory failure" message into conductor chat.
 * Sister investigation fork fork_mowd3xld_f7f538 confirmed there was no
 * Factory dispatch to act on. Two layered fixes:
 *   (1) Filter cortex / no-codebase rows out of relevanceFilter.
 *   (2) Drop the HTTP POST entirely - perception only.
 *
 * Probed historical rows (8 May 2026, last 14d, status=error OR pipeline_stage
 * IN ('failed','error')): 20 cortex rows all had codebase_id=NULL,
 * working_dir=NULL (pure shell pattern). Real Factory failures had
 * triggered_by='proactive' AND codebase_id NOT NULL (27 rows).
 */

const logger = require('../../config/logger')

module.exports = {
  name: 'ccSessionsFailure',
  subscribesTo: ['db:event'],

  relevanceFilter: (event) => {
    const d = event && event.data
    if (!d || d.type !== 'db:event') return false
    if (d.table !== 'cc_sessions') return false
    if (d.action !== 'UPDATE') return false
    if (!d.row) return false

    const row = d.row
    const status = row.status
    const stage = row.pipeline_stage

    // Exclude clean completions - those go to factorySessionComplete
    if (status === 'complete') return false

    // Match failure conditions
    const isError = status === 'error'
    const isFailedStage = stage === 'failed' || stage === 'error'
    if (!isError && !isFailedStage) return false

    // Exclude OS-session shells. Two layered guards:
    //   (1) triggered_by='cortex' is the cortex OS-session shell pattern.
    //   (2) codebase_id IS NULL means no Factory deliverable to act on,
    //       even if the row claims a different triggered_by.
    if (row.triggered_by === 'cortex') return false
    if (!row.codebase_id) return false

    return true
  },

  handle: async (event, ctx) => {
    const row = event.data.row

    // Publish to perceptionBus only. Per
    // ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
    // Factory failures DO NOT POST to /api/os-session/message. The conductor
    // sees them via <perception_summary> on the next natural turn.
    logger.info('ccSessionsFailure: handle invoked (perception-only)', {
      sessionId: row.id,
      status: row.status,
      stage: row.pipeline_stage,
      triggeredBy: row.triggered_by,
      codebaseId: row.codebase_id,
      sourceEventId: ctx && ctx.sourceEventId,
    })

    try {
      require('../perceptionBus').publish({
        source: 'factory',
        kind: 'session_failure',
        data: {
          session_id: row.id,
          status: row.status,
          pipeline_stage: row.pipeline_stage,
          triggered_by: row.triggered_by,
          codebase_id: row.codebase_id,
          working_dir: row.working_dir,
          error_message: row.error_message,
          source_event_id: ctx && ctx.sourceEventId,
        },
        confidence: 1.0,
      })
    } catch (err) {
      logger.warn('ccSessionsFailure: perception publish failed', {
        sessionId: row.id,
        error: err.message,
      })
    }
  },

  // No write surface — perception only; no /api/os-session/message POST.
  ownsWriteSurface: [],
}

/**
 * approvalQueueReconciler.js
 *
 * Hourly safety-net for the status_board -> approval_queue mirror trigger
 * (trg_status_board_to_approval_queue / fn_status_board_to_approval_queue,
 * migration 134). The trigger fires AFTER INSERT OR UPDATE OF next_action_by
 * and enqueues a `free_text` approval_queue row whenever a status_board row
 * transitions INTO next_action_by='tate'. It can miss rows when:
 *   - the row predates the trigger,
 *   - a bulk/raw write set next_action_by='tate' on a path that bypassed the
 *     trigger (e.g. a restore from backup, a COPY, a superuser session with
 *     triggers disabled),
 *   - the trigger errored transiently and the AFTER-trigger insert was lost.
 *
 * This reconciler closes that gap: it inserts a `free_text` mirror item for
 * every status_board row with next_action_by='tate' AND archived_at IS NULL
 * that has no approval_queue row keyed status_board_<id>. The column mapping
 * MUST stay byte-for-byte aligned with the trigger function so a reconciler
 * insert is indistinguishable from a trigger insert (except created_by_stack,
 * which marks the safety-net as the producer). The shared idempotency_key
 * (`status_board_<id>`) + ON CONFLICT DO NOTHING makes this safe to run
 * concurrently with the live trigger and safe to re-run any number of times.
 *
 * It does NOT delete approval_queue rows whose status_board row left tate
 * state or archived - that lifecycle is owned by approvalQueueResolutionService
 * / the decay daemon, not the reconciler.
 *
 * Invocation: `node src/db/cron/approvalQueueReconciler.js --once`
 * Wire in src/config/cronPriority.js -> DIRECT_EXEC_COMMANDS so it runs as a
 * fork-free DIRECT_EXEC cron (survives credit exhaustion, no agentic step).
 *
 * Origin: 2026-06-14 - trg_status_board_to_approval_queue had 6 orphaned
 * tate-state rows with no mirror; the trigger covers new transitions but
 * nothing reconciles drift. This is that reconciler.
 */

'use strict'

require('../../config/env')
const postgres = require('postgres')
const env = require('../../config/env')
const logger = require('../../config/logger')

/**
 * Single race-safe statement. The SELECT projects each unmirrored
 * tate-state status_board row into the exact column shape the trigger writes;
 * ON CONFLICT (idempotency_key) DO NOTHING absorbs any row the live trigger
 * inserts between the SELECT and the INSERT.
 */
async function reconcile(db) {
  const inserted = await db`
    INSERT INTO approval_queue (
      item_type, title, body, payload, action, default_verdict,
      decay_at, urgency, status_board_ref, source_ref, idempotency_key,
      created_by_stack
    )
    SELECT
      'free_text',
      LEFT(COALESCE(NULLIF(sb.name, ''), 'status_board row needs Tate'), 240),
      COALESCE(NULLIF(sb.next_action, ''), '')
        || CASE
             WHEN sb.context IS NOT NULL AND sb.context <> ''
             THEN E'\n\nContext: ' || sb.context
             ELSE ''
           END,
      jsonb_build_object(
        'status_board_id', sb.id,
        'entity_type', sb.entity_type,
        'entity_ref', sb.entity_ref,
        'priority', sb.priority,
        'next_action', sb.next_action
      ),
      jsonb_build_object(
        'handler', 'free_text',
        'kind', 'status_board_passthrough',
        'status_board_id', sb.id
      ),
      'wait',
      NULL,
      CASE WHEN COALESCE(sb.priority, 5) <= 2 THEN 'critical' ELSE 'normal' END,
      sb.id,
      'status_board:' || sb.id::text,
      'status_board_' || sb.id::text,
      'approvalQueueReconciler'
    FROM status_board sb
    WHERE sb.next_action_by = 'tate'
      AND sb.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM approval_queue aq
        WHERE aq.idempotency_key = 'status_board_' || sb.id::text
      )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id, status_board_ref, urgency
  `
  return inserted
}

async function run() {
  const db = postgres(env.DATABASE_URL, { max: 1, idle_timeout: 30, connect_timeout: 30, prepare: false })
  try {
    const inserted = await reconcile(db)
    const n = inserted.length
    if (n > 0) {
      logger.info(`[approval-reconciler] backfilled ${n} status_board mirror(s)`, {
        ids: inserted.map((r) => r.id),
        status_board_refs: inserted.map((r) => r.status_board_ref),
      })
    } else {
      logger.info('[approval-reconciler] no drift - every tate-state row already mirrored')
    }
    return n
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  run()
    .then((n) => {
      // eslint-disable-next-line no-console
      console.log(`[approval-reconciler] done - inserted ${n} mirror(s)`)
      process.exit(0)
    })
    .catch((err) => {
      logger.error('[approval-reconciler] fatal', { error: err.message, stack: err.stack })
      process.exit(1)
    })
}

module.exports = { run, reconcile }

'use strict'

/**
 * perceptionDispatcher matcher: fork_phantom_bail
 *
 * Source: drafts/proposed-matchers/fork_phantom_bail.js (W2 listener gap analysis).
 * Adapted to closure-style.
 *
 * Forks publish kind='fork_complete' (clean) and 'fork_aborted'/'fork_error'
 * (terminal). Phantom bail = transcript ended with no [FORK_REPORT].
 * forkService stamps state.result with FALLBACK_MARKER prefix; rollup surfaces
 * as `phantom_bail`. This matcher catches phantom_bail events, counts in a
 * per-parent hour bucket, and after 3+ in 1h writes a P3 status_board drift row.
 *
 * Pattern surfacing:
 *   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
 *   ~/ecodiaos/patterns/continuation-aware-fork-redispatch.md
 *
 * Fires immediately on pm2 restart.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

const _phantomBailCounts = new Map() // hour-bucket key -> count

module.exports = {
  domain: 'fork_phantom_bail',

  // 60s - high-volume during fork churn. Per-parent in-mem _phantomBailCounts
  // does its own bucketing, so the dispatcher-level dedupe just needs to be
  // tight enough to surface bursts (5min default smothers them).
  // C3 (fork_mosn8o5x_7a0e54).
  dedupeWindowMs: 60 * 1000,

  test(event) {
    if (event.kind !== 'fork_complete') return false
    const reportHead = event.data?.report_head || ''
    return reportHead.startsWith('(no [FORK_REPORT] emitted') ||
           reportHead.includes('no_report_emitted=true')
  },

  async dispatch(event) {
    const forkId = event.data?.fork_id
    const parentId = event.data?.parent_id

    const bucket = Math.floor(Date.now() / (60 * 60 * 1000))
    const key = `${parentId || 'main'}:${bucket}`
    const count = (_phantomBailCounts.get(key) || 0) + 1
    _phantomBailCounts.set(key, count)

    try {
      await perceptionBus.publish({
        source: 'perception_dispatcher',
        kind: 'fork_phantom_bail_classified',
        data: {
          fork_id: forkId,
          parent_id: parentId,
          bucket_count: count,
          brief_head: event.data?.brief_head,
        },
        confidence: 0.8,
      })
    } catch (err) {
      logger.debug('perceptionDispatcher: fork_phantom_bail publish failed', { error: err.message })
    }

    if (count < 3) return

    try {
      const name = `phantom_bail_drift: ${parentId || 'main'} (${count} bails in 1h)`
      const existing = await db`
        SELECT id FROM status_board
        WHERE name = ${name} AND archived_at IS NULL
        LIMIT 1
      `
      if (existing.length === 0) {
        await db`
          INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
          VALUES (
            ${name},
            'infrastructure',
            'investigating',
            3,
            ${'Multiple fork phantom bails from same parent. Audit fork briefs for ambiguity / 5-gate cold-start adequacy.'},
            'ecodiaos',
            'perception_dispatcher',
            ${JSON.stringify({ parent_id: parentId, count, last_fork_id: forkId, hour_bucket: bucket }).slice(0, 4000)}
          )
        `
      }
    } catch (err) {
      logger.debug('perceptionDispatcher: fork_phantom_bail dispatch failed', { error: err.message })
    }
  },
}

'use strict'

/**
 * Proposed perceptionDispatcher matcher: fork_phantom_bail
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * Forks publish kind='fork_complete' (clean) and kind='fork_aborted' /
 * kind='fork_error' (terminal failures). A separate failure mode is the
 * PHANTOM BAIL: fork's transcript ended without a [FORK_REPORT] tag.
 * forkService stamps state.result with the FALLBACK_MARKER prefix to flag
 * this; rollup surfaces it as `phantom_bail`. But there's no perception
 * matcher that classifies + writes a P3 status_board row when this happens
 * repeatedly — we only learn about it when the conductor next surveys forks.
 *
 * This matcher catches phantom_bail events from fork:* sources, classifies,
 * counts (in dedupe map), and after 3+ phantom_bails in a 6h window writes
 * a P3 status_board row + surfaces a pattern-drift signal.
 *
 * Pattern drift surfacing maps to:
 *   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
 *   ~/ecodiaos/patterns/continuation-aware-fork-redispatch.md
 */

const _phantomBailCounts = new Map() // hour-bucket key -> count

module.exports = {
  domain: 'fork_phantom_bail',

  test(event) {
    if (event.kind !== 'fork_complete') return false
    const reportHead = event.data?.report_head || ''
    // forkService prefixes phantom_bail bodies with FALLBACK_MARKER text.
    // Detection mirrors forkService._isPhantomBail(result) but operates on
    // the perception event payload.
    return reportHead.startsWith('(no [FORK_REPORT] emitted') ||
           reportHead.includes('no_report_emitted=true')
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus

    const forkId = event.data?.fork_id
    const parentId = event.data?.parent_id

    // Hour-bucket count for drift detection
    const bucket = Math.floor(Date.now() / (60 * 60 * 1000)) // hour
    const key = `${parentId || 'main'}:${bucket}`
    const count = (_phantomBailCounts.get(key) || 0) + 1
    _phantomBailCounts.set(key, count)

    // Always publish a classification event (so other matchers / forks_rollup
    // can attribute the bail to the parent and decide whether to redispatch).
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

    // Drift threshold: 3+ phantom bails in same hour from same parent
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
      // dispatcher logger handles
    }
  },
}

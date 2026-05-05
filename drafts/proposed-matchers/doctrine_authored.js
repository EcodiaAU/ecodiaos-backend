'use strict'

/**
 * Proposed perceptionDispatcher matcher: doctrine_authored
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * REQUIRES (publisher side): a filesystem watcher (or post-Write hook from
 * the Claude harness) that publishes perception events when ~/ecodiaos/patterns/*.md
 * changes. Today new pattern files just sit there until INDEX.md regen
 * cron picks them up at 22:00 AEST.
 *
 * On new pattern file detection:
 *   - publish doctrine_authored event with file path + slug
 *   - check for cross-ref opportunities: does any active CLAUDE.md
 *     section mention the new pattern's triggers? If so, surface a
 *     P3 "consider cross-ref" status_board row.
 *   - regen INDEX.md immediately (don't wait for cron).
 *
 * This makes doctrine evolution a closed loop: author → cross-ref suggested
 * → INDEX up to date — without the conductor needing to remember.
 */

module.exports = {
  domain: 'doctrine_authored',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind === 'pattern_file_created' ||
           kind === 'pattern_file_updated' ||
           kind === 'doctrine_authored' ||
           (event.source === 'fs_watcher' && (event.data?.path || '').includes('/patterns/'))
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus
    const path = event.data?.path
    if (!path || !path.endsWith('.md')) return

    const slug = path.split('/').pop().replace(/\.md$/, '')

    // Publish a derived event the daily-index-regen cron can chain off
    await perceptionBus.publish({
      source: 'perception_dispatcher',
      kind: 'doctrine_authored_classified',
      data: {
        path,
        slug,
        triggers: event.data?.triggers || null,
        action: event.kind.includes('updated') ? 'updated' : 'created',
      },
      confidence: 0.95,
    })

    // P3 row to remind the conductor to add cross-refs in CLAUDE.md
    // (mechanical scan against the trigger keywords would be ideal, but
    // the simpler version surfaces a single reminder row instead).
    if (event.kind === 'pattern_file_created') {
      const name = `cross-ref opportunity: ${slug}`
      try {
        const existing = await db`
          SELECT id FROM status_board WHERE name = ${name} AND archived_at IS NULL LIMIT 1
        `
        if (existing.length === 0) {
          await db`
            INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
            VALUES (
              ${name},
              'doctrine',
              'pending',
              3,
              ${'New pattern authored. Audit CLAUDE.md and high-traffic doctrine files for cross-ref opportunities.'},
              'ecodiaos',
              'perception_dispatcher',
              ${JSON.stringify({ path, slug, triggers: event.data?.triggers || [] }).slice(0, 4000)}
            )
          `
        }
      } catch {}
    }
  },
}

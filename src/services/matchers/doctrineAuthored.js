'use strict'

/**
 * perceptionDispatcher matcher: doctrine_authored
 *
 * Source: drafts/proposed-matchers/doctrine_authored.js (W2 listener gap analysis).
 * Adapted to closure-style.
 *
 * GATED on Wave C publisher: a filesystem watcher (or post-Write hook from
 * the Claude harness) that publishes perception events when
 * ~/ecodiaos/patterns/*.md changes. Today new pattern files just sit there
 * until the daily-index-regen cron picks them up at 22:00 AEST. THIS MATCHER
 * WILL NOT FIRE until Wave C ships the publisher.
 *
 * On detection: publish doctrine_authored_classified event + (for new file)
 * insert P3 status_board "consider cross-ref" reminder.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

module.exports = {
  domain: 'doctrine_authored',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind === 'pattern_file_created' ||
           kind === 'pattern_file_updated' ||
           kind === 'doctrine_authored' ||
           (event.source === 'fs_watcher' && (event.data?.path || '').includes('/patterns/'))
  },

  async dispatch(event) {
    const path = event.data?.path
    if (!path || !path.endsWith('.md')) return

    const slug = path.split('/').pop().replace(/\.md$/, '')

    try {
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
    } catch (err) {
      logger.debug('perceptionDispatcher: doctrine_authored publish failed', { error: err.message })
    }

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
      } catch (err) {
        logger.debug('perceptionDispatcher: doctrine_authored row insert failed', { error: err.message })
      }
    }
  },
}

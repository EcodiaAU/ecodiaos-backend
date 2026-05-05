'use strict'

/**
 * perceptionDispatcher matcher: deploy_event
 *
 * Source: drafts/proposed-matchers/deploy_event.js (W2 listener gap analysis).
 * Adapted to closure-style.
 *
 * GATED on Wave C publisher: a vercel-deploy-event publisher that turns
 * Vercel webhooks (or vercel-deploy-monitor cron output) into perception
 * events with kind='vercel_deployment_*'. Today vercel-deploy-monitor only
 * runs as a cron — it never publishes to the bus. THIS MATCHER WILL NOT
 * FIRE until Wave C ships the publisher. Shipping the matcher now keeps
 * the registration surface stable so Wave C can verify the round-trip
 * by simply publishing one test event.
 *
 * Behaviour:
 *   - deployment.failed → P1 status_board row.
 *   - deployment.succeeded → publish go-live event (low confidence) so
 *     client_mention matcher chains off it for client-site deploys.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

module.exports = {
  domain: 'deploy_event',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind.startsWith('vercel_deployment_') ||
           kind === 'deploy_failed' ||
           kind === 'deploy_succeeded' ||
           kind === 'deploy_error'
  },

  async dispatch(event) {
    const kind = (event.kind || '').toLowerCase()

    const project = event.data?.project || event.data?.project_name || 'unknown'
    const url = event.data?.url || event.data?.deployment_url || null
    const commit = event.data?.commit_sha || event.data?.git_sha || null

    if (kind.includes('failed') || kind.includes('error')) {
      const name = `deploy_failed: ${project} (${commit ? commit.slice(0, 8) : 'no-sha'})`
      try {
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
              1,
              ${'Vercel deploy failed. Pull build logs, identify root cause, fix or revert.'},
              'ecodiaos',
              'perception_dispatcher',
              ${JSON.stringify({ project, url, commit, event_kind: event.kind }).slice(0, 4000)}
            )
          `
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: deploy_event failure dispatch failed', { error: err.message })
      }
      return
    }

    if (kind.includes('succeeded')) {
      try {
        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'deploy_go_live',
          data: {
            project,
            url,
            commit,
            trigger_event: `${event.source}/${event.kind}`,
          },
          confidence: 0.6,
        })
      } catch (err) {
        logger.debug('perceptionDispatcher: deploy_event go_live publish failed', { error: err.message })
      }
    }
  },
}

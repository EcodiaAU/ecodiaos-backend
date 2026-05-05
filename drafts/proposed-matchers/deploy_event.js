'use strict'

/**
 * Proposed perceptionDispatcher matcher: deploy_event
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * REQUIRES (publisher side, separate work item): a vercel-deploy-event
 * publisher that turns Vercel webhooks (or vercel-deploy-monitor cron
 * results) into perception events with kind='vercel_deployment_*'. Today
 * vercel-deploy-monitor runs as a cron only; it never publishes structured
 * deploy events to the bus. Adding the publisher is part of the gap.
 *
 * On deployment.failed → auto-create P1 status_board row.
 * On deployment.succeeded → publish go-live event (low confidence; lets
 * downstream client_mention matcher chain off it for client-site deploys).
 */

module.exports = {
  domain: 'deploy_event',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return kind.startsWith('vercel_deployment_') ||
           kind === 'deploy_failed' ||
           kind === 'deploy_succeeded' ||
           kind === 'deploy_error'
  },

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus
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
        // logger handles
      }
      return
    }

    if (kind.includes('succeeded')) {
      // Surface a go-live event. client_mention matcher can chain off this
      // when project name corresponds to a client (e.g. [redacted]-frontend).
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
    }
  },
}

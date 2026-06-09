'use strict'

/**
 * releaseService.js (2026-05-26)
 *
 * Producer for the approval_queue release_ship item type.
 *
 *   proposeShip({ build_id, app_slug, version, release_notes, ship_action, ... })
 *
 * Called by ship-ios.py / ship-android in --propose mode just before the actual
 * upload step. The proposeShip wrapper enqueues the release with the typed
 * ship_action embedded so resolution can fire it. Without Tate's Y the upload
 * is not attempted.
 *
 * Action shape (varies per platform):
 *   { platform: 'ios' | 'android' | 'vercel',
 *     pipeline_resume_token: '...',   // ship-ios.py / ship-android resume key
 *     altool_args?: {...},            // iOS specific
 *     play_track?: 'internal' | ..., // android specific
 *     vercel_deploy_id?: '...',       // vercel specific
 *   }
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §3.
 */

const logger = require('../config/logger')
const queue = require('./approvalQueueService')

async function proposeShip({
  build_id,
  app_slug,
  version = null,
  release_notes = null,
  ship_action,
}) {
  if (!build_id || !app_slug || !ship_action) {
    return { ok: false, error: 'build_id, app_slug, ship_action required' }
  }
  if (typeof ship_action !== 'object' || !ship_action.platform) {
    return { ok: false, error: 'ship_action.platform required (ios|android|vercel)' }
  }

  const result = await queue.enqueueReleaseShip({
    build_id, app_slug, version, release_notes, ship_action,
  })
  if (!result.ok) {
    logger.warn('releaseService.proposeShip: enqueue failed', { error: result.error, app_slug, build_id })
    return result
  }

  logger.info('releaseService.proposeShip: enqueued for Tate review', {
    id: result.id, app_slug, build_id, version, platform: ship_action.platform,
  })
  return { ok: true, queued: true, id: result.id, deduped: !!result.deduped }
}

module.exports = { proposeShip }

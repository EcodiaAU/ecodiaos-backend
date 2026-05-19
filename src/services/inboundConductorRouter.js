'use strict'

/**
 * inboundConductorRouter.js
 *
 * Routes canonical inbound chat envelopes (SMS, Telegram, native, future
 * channels) to the headless conductor on the VPS. The headless agent decides
 * what to do per envelope.
 *
 * Thread mirror reads/writes delegated to ./threadMirror module so transports
 * + channel adapters all share one implementation.
 *
 * Per backend/patterns/one-conductor-many-channels-2026-05-19.md.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const { processEnvelope } = require('./headlessConductor')
const { loadThreadMirror, appendInbound: appendInboundToThreadMirror } = require('./threadMirror')

/**
 * Persist the raw provider payload to kv_store for debug replay (7-day TTL
 * is enforced by an external sweep, not here).
 */
async function persistRawProviderPayload(idempotencyKey, payload) {
  if (!idempotencyKey || !payload) return
  const key = `cowork.inbound_raw.${idempotencyKey}`
  try {
    const value = JSON.stringify(payload).slice(0, 200000)
    await db`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    logger.warn('inboundConductorRouter: raw payload persist failed (non-fatal)', { error: err.message })
  }
}

/**
 * Route an envelope to the headless conductor.
 *
 * @returns {Promise<{ok, mode, iterations?, account?, model?, stop_reason?, tool_calls?, error?}>}
 */
async function routeEnvelopeToConductor({ envelope, source }) {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, mode: 'error', error: 'envelope_required' }
  }
  try {
    const result = await processEnvelope(envelope, { source })
    if (result.ok) {
      logger.info('headless conductor processed envelope', {
        channel: envelope.channel,
        idempotency_key: envelope.idempotency_key,
        iterations: result.iterations,
        account: result.account,
        stop_reason: result.stop_reason,
        tool_calls_count: (result.tool_calls || []).length,
      })
      return { ok: true, mode: 'headless', ...result }
    }
    logger.error('headless conductor processing failed', {
      channel: envelope.channel,
      idempotency_key: envelope.idempotency_key,
      error: result.error,
    })
    return { ok: false, mode: 'error', ...result }
  } catch (err) {
    logger.error('inboundConductorRouter: unhandled error', { error: err.message, stack: err.stack })
    return { ok: false, mode: 'error', error: err.message }
  }
}

module.exports = {
  routeEnvelopeToConductor,
  persistRawProviderPayload,
  // re-exported from threadMirror for backwards-compat with smsWebhook + telegram-bot imports
  loadThreadMirror,
  appendInboundToThreadMirror,
}

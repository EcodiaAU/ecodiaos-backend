'use strict'

/**
 * tate-msg - TOMBSTONE.
 *
 * iMessage substrate removed Tate-directed 11 May 2026 16:44 AEST.
 * All contact to Tate now goes via Twilio SMS (osAlertingService._sendTwilio).
 *
 * This module stub is kept so requires that haven't yet been updated do not
 * crash the process on boot. sendImessage() returns { ok: false, error: 'imessage_removed' }
 * so callers that check the return value fall back gracefully.
 *
 * Remove this file entirely once all callers are confirmed updated.
 */

const logger = require('../../src/config/logger')

async function sendImessage(body, opts) {
  logger.warn('tate-msg: sendImessage called but iMessage substrate is removed - use Twilio SMS', {
    body_length: String(body || '').length,
  })
  return { ok: false, error: 'imessage_removed' }
}

async function healthCheck() {
  return { ok: false, error: 'imessage_removed' }
}

function _resetForTest() {}

module.exports = {
  sendImessage,
  healthCheck,
  _resetForTest,
  TATE_BUDDY: '+61404247153',
}

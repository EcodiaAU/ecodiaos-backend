'use strict'

/**
 * helpers.js - pure functions extracted from approvalQueueResolutionService.
 *
 * Kept db-free so unit tests can import them without env+postgres setup.
 *
 * mapDefaultToVerdict(default_verdict) -> 'Y' | 'N' | null
 * computeReversibleUntil(item_type)    -> Date | null
 */

function computeReversibleUntil(item_type) {
  const now = Date.now()
  const days = (n) => new Date(now + n * 24 * 3600 * 1000)
  switch (item_type) {
    case 'email_send':     return days(7)
    case 'spend_execute':  return days(7)
    case 'doctrine_write': return days(7)
    case 'free_text':      return days(7)
    case 'release_ship':   return null
    case 'observer_ack':   return null
    default:               return null
  }
}

function mapDefaultToVerdict(default_verdict) {
  switch (default_verdict) {
    case 'send':   return 'Y'
    case 'cancel': return 'N'
    case 'expire': return 'N'
    case 'wait':   return null
    default:       return 'N'
  }
}

module.exports = { computeReversibleUntil, mapDefaultToVerdict }

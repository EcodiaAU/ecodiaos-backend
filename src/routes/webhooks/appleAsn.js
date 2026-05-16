'use strict'

/**
 * Apple App Store Server Notification (ASN V2) webhook shim.
 *
 *   POST /api/webhooks/apple-asn
 *   Body: { "signedPayload": "<jws>" }
 *
 * Authentication is the JWS signature on signedPayload, verified against
 * Apple Root CA - G3 (see src/lib/appleJws.js). No shared secret in
 * kv_store - Apple's chain-of-trust IS the auth.
 *
 * This shim's job:
 *   1. Parse the envelope JSON.
 *   2. Verify + decode the outer JWS.
 *   3. Verify + decode the inner signedTransactionInfo + signedRenewalInfo JWSs.
 *   4. Hand the fully-decoded payload to appleAsnService for routing.
 *   5. Always return 200 once we've durably recorded the seen-key (so Apple
 *      stops the 5-day retry storm). Unverified payloads return 401.
 *
 * Mounted in src/app.js BEFORE express.json() so we receive the raw body
 * intact - express.json() would not corrupt this particular envelope, but
 * keeping the webhook chain consistent with stripe/vercel keeps the auth
 * posture uniform.
 */

const express = require('express')

const logger = require('../../config/logger')
const appleJws = require('../../lib/appleJws')
const appleAsnService = require('../../services/appleAsnService')

const router = express.Router()

function _safeDecodeInner(jws, label) {
  if (!jws || typeof jws !== 'string') return null
  try {
    return appleJws.verifyAndDecode(jws)
  } catch (err) {
    logger.warn(`apple-asn webhook: inner ${label} verification failed`, { error: err.message })
    return null
  }
}

router.post(
  '/',
  express.raw({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    let envelope
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
      envelope = JSON.parse(rawBody.toString('utf8'))
    } catch (err) {
      logger.warn('apple-asn webhook: invalid JSON envelope', { error: err.message })
      return res.status(400).json({ ok: false, error: 'invalid json envelope' })
    }

    const signedPayload = envelope && envelope.signedPayload
    if (typeof signedPayload !== 'string' || signedPayload.length === 0) {
      return res.status(400).json({ ok: false, error: 'missing signedPayload' })
    }

    let outer
    try {
      outer = appleJws.verifyAndDecode(signedPayload)
    } catch (err) {
      logger.warn('apple-asn webhook: outer JWS verification failed', { error: err.message })
      return res.status(401).json({ ok: false, error: 'invalid signature' })
    }

    const data = (outer && outer.data) || {}
    const transactionInfo = _safeDecodeInner(data.signedTransactionInfo, 'signedTransactionInfo')
    const renewalInfo = _safeDecodeInner(data.signedRenewalInfo, 'signedRenewalInfo')

    // Inner JWSs are signed by the same Apple chain as the outer. If
    // signedTransactionInfo was present but failed to verify, that's a hard
    // reject - we cannot trust the price/transactionId fields we'd otherwise
    // record. Renewal info is allowed to be absent for some notification
    // types (e.g. REFUND, CONSUMPTION_REQUEST) so its failure is softer.
    if (data.signedTransactionInfo && !transactionInfo) {
      return res.status(401).json({ ok: false, error: 'invalid signedTransactionInfo signature' })
    }

    try {
      const result = await appleAsnService.processNotification({
        outer, transactionInfo, renewalInfo,
      })
      return res.json({ ok: true, ...result })
    } catch (err) {
      // Process-level failure (DB down, etc). Return 500 so Apple retries.
      // The seen-key is only set INSIDE processNotification once we've
      // committed to handling - a DB-down failure before the seen-key write
      // means Apple's retry will be processed on the next attempt.
      logger.error('apple-asn webhook: processNotification threw', {
        error: err.message,
        notificationUUID: outer.notificationUUID,
        notificationType: outer.notificationType,
      })
      return res.status(500).json({ ok: false, error: 'internal error' })
    }
  },
)

module.exports = router

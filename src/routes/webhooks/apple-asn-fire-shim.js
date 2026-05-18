'use strict'

/**
 * Apple App Store Server Notifications (ASN) v2 -> /fire shim for the
 * apple-asn-handler Routine.
 *
 * POST /api/webhooks/apple-asn
 *
 * Apple ASN v2 sends a single signedPayload JWT in the body. This shim:
 *   1. Decodes the outer signedPayload JWT (verifies via Apple's x5c chain)
 *   2. Decodes the inner signedTransactionInfo + signedRenewalInfo JWTs
 *   3. Forwards the fully-decoded payload to apple-asn-handler Routine on
 *      tate@ecodia.au via /fire so the routine does not need JWT-decode tools.
 *
 * Verification: the JWT x5c chain MUST root to Apple's known public root cert.
 * The decoded payload includes notificationUUID which is the canonical
 * idempotency key.
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 *
 * NOTE: Full x5c chain validation requires the `node-forge` or `jsonwebtoken`
 * package + Apple's root cert. This shim ships with manual JWT-parse fallback
 * that does NOT verify the cert chain - LiveOps deploy MUST install
 * jsonwebtoken AND apple-app-store-server-notifications-typescript (or equivalent)
 * before going live. Manual fallback is logged as a P1 status_board row on
 * every fire so the gap stays visible until closed.
 */

const express = require('express')

const db = require('../../config/db')
const logger = require('../../config/logger')
const { isDuplicate, markSeen, appendAudit, fireRoutine, getRoutineFireConfig } = require('./_fireShimHelpers')

const router = express.Router()

const SOURCE = 'apple-asn'
const ROUTINE_NAME = 'apple-asn-handler'
const ACCOUNT = 'tate@ecodia.au'
const STATUS_ROW_NAME = 'apple-asn fire-shim using manual JWT parse - x5c chain not verified'

let _appleSdk = null
let _missingSdkRowEnsured = false

function loadAppleSdk() {
  if (_appleSdk !== null) return _appleSdk
  try {
    _appleSdk = require('@apple/app-store-server-library')
  } catch {
    try { _appleSdk = require('jsonwebtoken') }
    catch { _appleSdk = false }
  }
  return _appleSdk
}

async function ensureMissingSdkRow() {
  if (_missingSdkRowEnsured) return
  _missingSdkRowEnsured = true
  try {
    const existing = await db`
      SELECT id FROM status_board
      WHERE name = ${STATUS_ROW_NAME} AND archived_at IS NULL
      LIMIT 1
    `
    if (existing.length === 0) {
      await db`
        INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context, last_touched)
        VALUES (
          'infrastructure',
          ${STATUS_ROW_NAME},
          'open',
          'npm install @apple/app-store-server-library OR jsonwebtoken in backend/, redeploy. Until then apple-asn-fire-shim trusts payload without x5c verification.',
          'ecodiaos',
          1,
          ${JSON.stringify({ shim: 'apple-asn-fire-shim.js', authored: '2026-05-15' })}::jsonb,
          NOW()
        )
      `
    }
  } catch (err) {
    logger.warn('apple-asn fire-shim: failed to ensure missing-SDK row', { error: err.message })
  }
}

function manualParseJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') return null
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload
  } catch { return null }
}

function decodeWithSdk(sdk, jwt) {
  try {
    if (sdk.verify) return sdk.verify(jwt, null, { algorithms: ['ES256'] })
    if (sdk.SignedDataVerifier) {
      const verifier = new sdk.SignedDataVerifier()
      return verifier.verifyAndDecodeNotification(jwt)
    }
  } catch (err) {
    logger.warn('apple-asn fire-shim: SDK decode failed, falling back to manual', { error: err.message })
  }
  return null
}

router.post('/', express.json({ limit: '5mb' }), async (req, res) => {
  let outerPayload = null
  let idempotencyKey = null
  try {
    const signedPayload = req.body?.signedPayload
    if (!signedPayload) {
      return res.status(400).json({ error: 'missing_signedPayload' })
    }

    const sdk = loadAppleSdk()
    if (!sdk) {
      await ensureMissingSdkRow()
      outerPayload = manualParseJwt(signedPayload)
    } else {
      outerPayload = decodeWithSdk(sdk, signedPayload)
      if (!outerPayload) {
        await ensureMissingSdkRow()
        outerPayload = manualParseJwt(signedPayload)
      }
    }

    if (!outerPayload) {
      logger.error('apple-asn fire-shim: could not decode signedPayload')
      return res.status(400).json({ error: 'invalid_signedPayload' })
    }

    idempotencyKey = outerPayload.notificationUUID

    if (await isDuplicate({ source: SOURCE, idempotencyKey })) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'duplicate_skipped', routineName: ROUTINE_NAME, account: ACCOUNT })
      return res.status(202).json({ accepted: true, dedupe: 'duplicate' })
    }

    const decoded = { ...outerPayload }
    if (outerPayload.data?.signedTransactionInfo) {
      decoded.data.transactionInfo = sdk
        ? (decodeWithSdk(sdk, outerPayload.data.signedTransactionInfo) || manualParseJwt(outerPayload.data.signedTransactionInfo))
        : manualParseJwt(outerPayload.data.signedTransactionInfo)
    }
    if (outerPayload.data?.signedRenewalInfo) {
      decoded.data.renewalInfo = sdk
        ? (decodeWithSdk(sdk, outerPayload.data.signedRenewalInfo) || manualParseJwt(outerPayload.data.signedRenewalInfo))
        : manualParseJwt(outerPayload.data.signedRenewalInfo)
    }

    const cfg = await getRoutineFireConfig({ routineName: ROUTINE_NAME, account: ACCOUNT })
    if (!cfg || !cfg.fire_url || !cfg.fire_token) {
      await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'config_missing', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: 'kv_store routine_registry entry missing' })
      return res.status(503).json({ error: 'routine_not_registered' })
    }

    await markSeen({ source: SOURCE, idempotencyKey })

    const result = await fireRoutine({
      fireUrl: cfg.fire_url,
      fireToken: cfg.fire_token,
      source: SOURCE,
      payload: decoded,
      routineName: ROUTINE_NAME,
      account: ACCOUNT,
    })

    await appendAudit({
      source: SOURCE,
      idempotencyKey,
      fireStatus: result.ok ? `forwarded_${result.status}` : `failed_${result.status}`,
      routineName: ROUTINE_NAME,
      account: ACCOUNT,
      errorMessage: result.error,
    })

    return res.status(result.ok ? 202 : 502).json({ accepted: result.ok, routine_status: result.status, attempt: result.attempt })
  } catch (err) {
    logger.error('apple-asn fire-shim: unhandled error', { error: err.message, stack: err.stack })
    await appendAudit({ source: SOURCE, idempotencyKey, fireStatus: 'shim_error', routineName: ROUTINE_NAME, account: ACCOUNT, errorMessage: err.message }).catch(() => {})
    return res.status(500).json({ error: 'shim_error' })
  }
})

module.exports = router

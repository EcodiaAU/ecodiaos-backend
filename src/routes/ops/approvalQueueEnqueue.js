'use strict'

/**
 * /api/ops/approval-queue/enqueue-release
 * /api/ops/approval-queue/enqueue-spend
 * /api/ops/approval-queue/enqueue-doctrine
 *
 * Producer-side HTTP wrappers for external callers that cannot reach the
 * Node services directly (ship-ios.py / ship-android on SY094, Stripe webhook
 * shims, doctrine-authoring tools running outside the backend process).
 *
 * Bearer-gated via the existing /api/ops mount (the wide ecodia_full bearer
 * has the scopes; the narrow cowork bearer does not). Each route delegates
 * to its named producer service so all the producer-side gates (threshold,
 * dedup, urgency) still apply.
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §3.
 */

const { Router } = require('express')
const router = Router()
const logger = require('../../config/logger')

router.post('/enqueue-release', async (req, res) => {
  try {
    const releaseService = require('../../services/releaseService')
    const { build_id, app_slug, version, release_notes, ship_action } = req.body || {}
    const r = await releaseService.proposeShip({
      build_id, app_slug, version, release_notes, ship_action,
    })
    if (!r.ok) return res.status(400).json(r)
    res.json(r)
  } catch (err) {
    logger.error('ops /approval-queue/enqueue-release error', { error: err.message })
    res.status(500).json({ ok: false, error: 'internal_error' })
  }
})

router.post('/enqueue-spend', async (req, res) => {
  try {
    const spendService = require('../../services/spendService')
    const { amount_aud, vendor, description, execute_action, idempotency_suffix } = req.body || {}
    const r = await spendService.proposeSpend({
      amount_aud, vendor, description, execute_action, idempotency_suffix,
    })
    if (!r.ok) return res.status(400).json(r)
    res.json(r)
  } catch (err) {
    logger.error('ops /approval-queue/enqueue-spend error', { error: err.message })
    res.status(500).json({ ok: false, error: 'internal_error' })
  }
})

router.post('/enqueue-doctrine', async (req, res) => {
  try {
    const doctrineService = require('../../services/doctrineService')
    const { pattern_path, body, summary, force_queue } = req.body || {}
    const r = await doctrineService.proposePattern({
      pattern_path, body, summary, force_queue,
    })
    if (!r.ok) return res.status(400).json(r)
    res.json(r)
  } catch (err) {
    logger.error('ops /approval-queue/enqueue-doctrine error', { error: err.message })
    res.status(500).json({ ok: false, error: 'internal_error' })
  }
})

module.exports = router

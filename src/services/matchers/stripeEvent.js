'use strict'

/**
 * perceptionDispatcher matcher: stripe_event
 *
 * Source: drafts/proposed-matchers/stripe_event.js (W2 listener gap analysis).
 * Adapted to closure-style.
 *
 * GATED on Wave C publisher: a Stripe webhook handler that publishes
 * perception events for invoice.paid, charge.failed, customer.subscription.*.
 * Today the bookkeeping pipeline ingests bank transactions
 * (staged_transactions) but Stripe events themselves never reach the bus.
 * THIS MATCHER WILL NOT FIRE until Wave C ships the publisher.
 *
 * Distinct from existing finance + invoicePaymentState matchers/listeners:
 * those fire on bank-side staged_transactions (post-settlement). Stripe
 * webhooks fire IMMEDIATELY (charge time), so faster + more accurate
 * client correlation (Stripe customer_id → client.stripe_customer_id).
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const perceptionBus = require('../perceptionBus')

module.exports = {
  domain: 'stripe_event',

  test(event) {
    const kind = (event.kind || '').toLowerCase()
    return event.source === 'stripe' ||
           kind.startsWith('stripe_') ||
           kind === 'invoice_paid' ||
           kind === 'charge_failed' ||
           kind === 'subscription_created' ||
           kind === 'subscription_cancelled'
  },

  async dispatch(event) {
    const kind = (event.kind || '').toLowerCase()

    const customerId = event.data?.customer || event.data?.stripe_customer_id || null
    const amountCents = event.data?.amount || event.data?.amount_cents || null
    const invoiceNumber = event.data?.invoice_number || event.data?.invoice || null

    let client = null
    if (customerId) {
      try {
        const rows = await db`
          SELECT id, name, status FROM clients
          WHERE stripe_customer_id = ${customerId}
          LIMIT 1
        `
        client = rows[0] || null
      } catch (err) {
        logger.debug('perceptionDispatcher: stripe_event client lookup failed', { error: err.message })
      }
    }

    if (kind === 'charge_failed') {
      const dollars = amountCents ? (amountCents / 100).toFixed(2) : '?'
      const name = `charge_failed: ${client?.name || customerId || 'unknown'} ($${dollars})`
      try {
        const existing = await db`
          SELECT id FROM status_board WHERE name = ${name} AND archived_at IS NULL LIMIT 1
        `
        if (existing.length === 0) {
          await db`
            INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
            VALUES (
              ${name},
              'finance',
              'investigating',
              1,
              ${'Stripe charge failed. Brief Tate first per client-comms rule before reaching out; retry or update payment method.'},
              'tate',
              'perception_dispatcher',
              ${JSON.stringify({ customer_id: customerId, amount_cents: amountCents, invoice: invoiceNumber, client_id: client?.id }).slice(0, 4000)}
            )
          `
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: stripe_event charge_failed dispatch failed', { error: err.message })
      }
      return
    }

    if (kind === 'invoice_paid') {
      try {
        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: 'stripe_invoice_paid_correlated',
          data: {
            customer_id: customerId,
            amount_cents: amountCents,
            invoice_number: invoiceNumber,
            client_id: client?.id,
            client_name: client?.name,
          },
          confidence: 0.95,
        })

        if (client?.id) {
          await db`
            UPDATE status_board
            SET last_touched = NOW()
            WHERE entity_type = 'client'
              AND archived_at IS NULL
              AND name ILIKE ${`%${client.name}%`}
          `
        }
      } catch (err) {
        logger.debug('perceptionDispatcher: stripe_event invoice_paid dispatch failed', { error: err.message })
      }
    }
  },
}

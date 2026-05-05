'use strict'

/**
 * Proposed perceptionDispatcher matcher: stripe_event
 *
 * fork_moslihvx_015515 — listener gap analysis 2026-05-05.
 *
 * REQUIRES (publisher side): a stripe webhook handler that publishes
 * perception events for invoice.paid, charge.failed, customer.subscription.*
 * events. Today the bookkeeping pipeline ingests bank transactions
 * (staged_transactions) but Stripe events themselves never reach the
 * perception bus.
 *
 * Distinct from existing finance/invoicePaymentState matchers: those
 * fire on bank-side staged_transactions (post-settlement). Stripe webhooks
 * fire IMMEDIATELY (charge time), so faster + more accurate client
 * correlation (Stripe customer_id → client.stripe_customer_id).
 */

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

  async dispatch(event, ctx) {
    const db = ctx.db
    const perceptionBus = ctx.perceptionBus
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
      } catch {}
    }

    // Charge failed → P1 status_board (revenue at risk)
    if (kind === 'charge_failed') {
      const name = `charge_failed: ${client?.name || customerId || 'unknown'} ($${amountCents ? (amountCents / 100).toFixed(2) : '?'})`
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
              ${'Stripe charge failed. Reach out to client (Brief Tate first per client-comms rule), retry, or update payment method.'},
              'tate',
              'perception_dispatcher',
              ${JSON.stringify({ customer_id: customerId, amount_cents: amountCents, invoice: invoiceNumber, client_id: client?.id }).slice(0, 4000)}
            )
          `
        }
      } catch (err) {}
      return
    }

    // Invoice paid → publish a clean signal so existing finance + crm matchers
    // can correlate downstream. Avoids a P1 row but updates last_touched on
    // the relevant client thread.
    if (kind === 'invoice_paid') {
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
        try {
          await db`
            UPDATE status_board
            SET last_touched = NOW()
            WHERE entity_type = 'client'
              AND archived_at IS NULL
              AND name ILIKE ${`%${client.name}%`}
          `
        } catch {}
      }
    }
  },
}

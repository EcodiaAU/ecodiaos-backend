/* stripe-event-poll cron fire helper (2026-06-09).
   Reads recent Stripe activity (charges, disputes, payment_intents,
   subscriptions, balance) against pty_ltd Restricted Key. Outputs JSON
   summary for the cron worker to write to substrate. Read-only. */
'use strict'

const fs = require('fs')
const Stripe = require('stripe')

const KEY_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/stripe_agent_restricted_key_pty_ltd.json'
const mirror = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))
const rk = mirror.value?.key || mirror.value || mirror.key
if (!rk || !rk.startsWith('rk_')) {
  console.error(JSON.stringify({ ok: false, error: 'restricted_key_missing' }))
  process.exit(1)
}

const stripe = new Stripe(rk, {
  apiVersion: '2025-04-30.basil',
  appInfo: { name: 'EcodiaOS-stripe-event-poll', version: '0.1.0' },
  maxNetworkRetries: 2,
  timeout: 20_000,
})

const WINDOW_HOURS = parseFloat(process.env.WINDOW_HOURS || '2.5')
const sinceUnix = Math.floor((Date.now() - WINDOW_HOURS * 3600 * 1000) / 1000)

async function main() {
  const account = await stripe.accounts.retrieve()
  const balance = await stripe.balance.retrieve()

  const [charges, disputes, payment_intents, subscriptions, refunds] = await Promise.all([
    stripe.charges.list({ limit: 100, created: { gte: sinceUnix } }),
    stripe.disputes.list({ limit: 100, created: { gte: sinceUnix } }),
    stripe.paymentIntents.list({ limit: 100, created: { gte: sinceUnix } }),
    stripe.subscriptions.list({ limit: 100, status: 'all' }),
    stripe.refunds.list({ limit: 100, created: { gte: sinceUnix } }),
  ])

  const failedCharges = charges.data.filter(c => c.status === 'failed')
  const subPastDue = subscriptions.data.filter(s => s.status === 'past_due')
  const subCanceled = subscriptions.data.filter(s => s.status === 'canceled' && s.canceled_at && s.canceled_at >= sinceUnix)
  const piRequiresAction = payment_intents.data.filter(p => p.status === 'requires_action' || p.status === 'requires_payment_method')

  const summary = {
    ok: true,
    poll_ts_unix: Math.floor(Date.now() / 1000),
    poll_ts_iso: new Date().toISOString(),
    window_hours: WINDOW_HOURS,
    since_unix: sinceUnix,
    account: {
      id: account.id,
      business_profile: account.business_profile?.name || null,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      default_currency: account.default_currency,
    },
    balance: {
      available: (balance.available || []).map(b => ({ amount: b.amount, currency: b.currency })),
      pending: (balance.pending || []).map(b => ({ amount: b.amount, currency: b.currency })),
    },
    counts: {
      charges_in_window: charges.data.length,
      charges_succeeded: charges.data.filter(c => c.status === 'succeeded').length,
      charges_failed: failedCharges.length,
      disputes_in_window: disputes.data.length,
      payment_intents_in_window: payment_intents.data.length,
      payment_intents_requires_action: piRequiresAction.length,
      subscriptions_total: subscriptions.data.length,
      subscriptions_active: subscriptions.data.filter(s => s.status === 'active').length,
      subscriptions_past_due: subPastDue.length,
      subscriptions_canceled_in_window: subCanceled.length,
      refunds_in_window: refunds.data.length,
    },
    actionable: {
      disputes: disputes.data.map(d => ({
        id: d.id,
        amount: d.amount,
        currency: d.currency,
        reason: d.reason,
        status: d.status,
        charge: d.charge,
        created: d.created,
      })),
      failed_charges: failedCharges.map(c => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        failure_code: c.failure_code,
        failure_message: c.failure_message,
        customer: c.customer,
        created: c.created,
      })),
      subscriptions_past_due: subPastDue.map(s => ({
        id: s.id,
        customer: s.customer,
        status: s.status,
        current_period_end: s.current_period_end,
      })),
      subscriptions_canceled_in_window: subCanceled.map(s => ({
        id: s.id,
        customer: s.customer,
        canceled_at: s.canceled_at,
        cancellation_reason: s.cancellation_details?.reason || null,
      })),
    },
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message, type: err.type, code: err.code }, null, 2))
  process.exit(1)
})

#!/usr/bin/env node
/**
 * stripe-event-poll-direct.js
 *
 * Self-contained fallback poll for the `stripe-event-poll` cron when the
 * ecodia-money MCP `stripe_agent.*` read tools are not deployed on the
 * running ecodia-api (commit 1c5f6245 shipped to disk but the connector
 * restart is conductor-gated per status_board 2f02c575).
 *
 * Route: direct_node_via_restricted_key_kv_mirror. Loads the rk_live
 * Restricted Key from the kv-mirror IN-PROCESS (never prints key bytes),
 * instantiates the Stripe SDK readonly, and emits a sanitized JSON summary
 * on stdout. No charge/customer secrets, no PANs, no key material leave
 * this process.
 *
 * Doctrine: patterns/stripe-event-poll-uses-restricted-key-readonly-surface-2026-06-10.md
 *
 * Usage: node scripts/stripe-event-poll-direct.js [--since-unix N] [--entity pty_ltd]
 */
'use strict'

const Stripe = require('stripe')

const MIRROR = {
  pty_ltd: '/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/stripe_agent_restricted_key_pty_ltd.json',
  labs: '/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/stripe_agent_restricted_key_labs.json',
  dao: '/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/stripe_agent_restricted_key_dao.json',
}

function loadKey(entity) {
  const path = MIRROR[entity]
  if (!path) throw new Error(`unknown entity ${entity}`)
  let raw = require(path)
  if (raw && raw.value !== undefined) raw = raw.value
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t[0] === '{') { try { raw = JSON.parse(t) } catch { /* leave */ } }
  }
  const key = typeof raw === 'string' ? raw : (raw && (raw.key || raw.value || raw.token))
  if (!key || typeof key !== 'string' || !key.startsWith('rk_')) {
    throw new Error(`mirror ${path} did not yield an rk_ Restricted Key`)
  }
  return key
}

function arg(name, def) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

// Known internal/test customers on the LIVE account. A test subscription
// that fails renewal generates a failed-charge + stuck-PI + past_due trio
// every dunning cycle, which inflates actionable_total with pure noise.
// Classify and exclude from genuine business signal. Origin: 2026-06-14
// fire - tate@ecodia.au "Nah" $2/mo test sub surfaced as 3 false positives.
const TEST_CUSTOMER_EMAILS = new Set(['tate@ecodia.au', 'code@ecodia.au', 'money@ecodia.au'])
const TEST_PRODUCT_NAMES = new Set(['Nah', 'Test', 'test'])

async function main() {
  const entity = arg('--entity', 'pty_ltd')
  // Default window: cover the 4-day gap since the last snapshot fire.
  // 2026-06-10T00:05Z = 1781049900. Caller can override with --since-unix.
  const sinceUnix = parseInt(arg('--since-unix', String(Math.floor(Date.now() / 1000) - 7 * 24 * 3600)), 10)

  const stripe = new Stripe(loadKey(entity), { apiVersion: '2025-04-30.basil', maxNetworkRetries: 2 })

  const out = { entity, poll_ts_iso: new Date().toISOString(), since_unix: sinceUnix, errors: {} }

  // Account state
  try {
    const acct = await stripe.accounts.retrieve()
    out.account_id = acct.id
    out.charges_enabled = acct.charges_enabled
    out.payouts_enabled = acct.payouts_enabled
  } catch (e) { out.errors.account = e.message }

  try {
    const bal = await stripe.balance.retrieve()
    const aud = (arr) => (arr || []).filter(b => b.currency === 'aud').reduce((s, b) => s + b.amount, 0)
    out.balance_aud_available_cents = aud(bal.available)
    out.balance_aud_pending_cents = aud(bal.pending)
  } catch (e) { out.errors.balance = e.message }

  // Disputes - highest priority. Sanitize to id/status/amount/reason/charge.
  try {
    const d = await stripe.disputes.list({ limit: 100, created: { gte: sinceUnix } })
    out.disputes = d.data.map(x => ({ id: x.id, status: x.status, amount: x.amount, currency: x.currency, reason: x.reason, charge: x.charge, created: x.created }))
  } catch (e) { out.errors.disputes = e.message }

  // Charges - flag failed.
  try {
    const c = await stripe.charges.list({ limit: 100, created: { gte: sinceUnix } })
    out.charges_total = c.data.length
    out.charges_failed = c.data.filter(x => x.status === 'failed').map(x => ({ id: x.id, amount: x.amount, currency: x.currency, failure_code: x.failure_code, created: x.created }))
    out.charges_succeeded = c.data.filter(x => x.status === 'succeeded').length
  } catch (e) { out.errors.charges = e.message }

  // Payment intents needing action.
  try {
    const pi = await stripe.paymentIntents.list({ limit: 100, created: { gte: sinceUnix } })
    out.payment_intents_total = pi.data.length
    out.payment_intents_stuck = pi.data
      .filter(x => ['requires_action', 'requires_payment_method'].includes(x.status))
      .map(x => ({ id: x.id, status: x.status, amount: x.amount, currency: x.currency, created: x.created }))
  } catch (e) { out.errors.payment_intents = e.message }

  // Subscriptions - full snapshot + churn flags. Expand customer + product
  // so we can classify internal/test subs out of the genuine churn signal.
  // Detect test subs by customer email. Stripe caps expand at 4 levels, so
  // product-name expansion (data.items.data.price.product = 5 levels) is not
  // available here; email-based detection covers the known internal accounts.
  const isTestSub = (x) => {
    const email = x.customer && typeof x.customer === 'object' ? x.customer.email : null
    return email && TEST_CUSTOMER_EMAILS.has(email)
  }
  const subRow = (x) => ({ id: x.id, customer: (x.customer && x.customer.id) || x.customer, email: x.customer && x.customer.email, test: isTestSub(x), created: x.created, canceled_at: x.canceled_at })
  try {
    const s = await stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.customer'] })
    out.subscriptions_total = s.data.length
    out.subscriptions_active = s.data.filter(x => x.status === 'active').length
    out.subscriptions_past_due = s.data.filter(x => x.status === 'past_due').map(subRow)
    out.subscriptions_canceled = s.data.filter(x => x.status === 'canceled' && x.canceled_at && x.canceled_at >= sinceUnix).map(subRow)
    out.subscriptions_status_breakdown = s.data.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m }, {})
    out.subscriptions_past_due_genuine = out.subscriptions_past_due.filter(r => !r.test).length
    out.subscriptions_canceled_genuine = out.subscriptions_canceled.filter(r => !r.test).length
  } catch (e) { out.errors.subscriptions = e.message }

  // Refunds - audit only.
  try {
    const r = await stripe.refunds.list({ limit: 100, created: { gte: sinceUnix } })
    out.refunds_total = r.data.length
    out.refunds = r.data.map(x => ({ id: x.id, amount: x.amount, currency: x.currency, status: x.status, created: x.created }))
  } catch (e) { out.errors.refunds = e.message }

  // Raw actionable: every flagged row. Genuine actionable: excludes
  // internal/test-account noise (test subs and their sub-$5 dunning charges).
  out.actionable_total =
    (out.disputes ? out.disputes.length : 0) +
    (out.charges_failed ? out.charges_failed.length : 0) +
    (out.payment_intents_stuck ? out.payment_intents_stuck.length : 0) +
    (out.subscriptions_past_due ? out.subscriptions_past_due.length : 0)

  const trivialCharge = (c) => c.currency === 'aud' && c.amount <= 500 // <= $5, dunning noise from test subs
  out.genuine_actionable_total =
    (out.disputes ? out.disputes.length : 0) +
    (out.charges_failed ? out.charges_failed.filter(c => !trivialCharge(c)).length : 0) +
    (out.payment_intents_stuck ? out.payment_intents_stuck.filter(p => !(p.currency === 'aud' && p.amount <= 500)).length : 0) +
    (out.subscriptions_past_due_genuine || 0)

  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
}

main().catch(e => { console.error('POLL_FATAL:', e.message); process.exit(1) })

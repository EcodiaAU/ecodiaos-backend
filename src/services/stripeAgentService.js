'use strict'

/**
 * stripeAgentService.js
 *
 * Autonomous merchant operations on Ecodia Pty Ltd's Stripe account.
 * Uses a Stripe Restricted API Key (rk_live_*) loaded from kv_store at
 * boot, so writes never trigger the 2FA-on-secret-key flow that gates the
 * Dashboard login path.
 *
 * Permission matrix (granted at key creation, per drafts/stripe-agentic-
 * commerce-enablement-2026-06-02.md Step 1):
 *   write: customers, products, prices, payment_links, invoices, subscriptions
 *   read:  charges, payment_intents, refunds, webhooks, balance, payouts
 *   none:  connect, sigma, issuing, treasury, capital, climate, files
 *
 * Per-entity routing: every method takes an `entity` arg (defaults to
 * 'pty_ltd'). The Restricted Key for that entity is loaded from
 * kv_store.creds.stripe_agent_restricted_key_<entity>. Additional entities
 * (labs, dao) come online by generating a sibling Restricted Key on each
 * entity's Stripe account and seeding the kv_store row.
 *
 * Consumer: src/routes/mcp/ecodiaMoney.js (to be authored) exposes these
 * methods as MCP tools. The existing webhook handler at
 * src/routes/webhooks/stripe.js stays untouched - this service is
 * write-side only, webhook verification uses a separate signing secret.
 */

const Stripe = require('stripe')
const db = require('../config/db')
const logger = require('../config/logger')

let _credCache = new Map()
let _stripeCache = new Map()
const CRED_TTL_MS = 10 * 60 * 1000

const ENTITY_TO_KV_KEY = {
  pty_ltd: 'creds.stripe_agent_restricted_key_pty_ltd',
  labs: 'creds.stripe_agent_restricted_key_labs',
  dao: 'creds.stripe_agent_restricted_key_dao',
}

async function _loadRestrictedKey(entity) {
  const kvKey = ENTITY_TO_KV_KEY[entity]
  if (!kvKey) {
    throw new Error(`stripeAgentService: unknown entity "${entity}" (expected one of ${Object.keys(ENTITY_TO_KV_KEY).join(', ')})`)
  }
  const now = Date.now()
  const cached = _credCache.get(entity)
  if (cached && now - cached.at < CRED_TTL_MS) return cached.key
  const rows = await db`SELECT value FROM kv_store WHERE key = ${kvKey}`
  if (!rows || rows.length === 0) {
    throw new Error(`stripeAgentService: kv_store row "${kvKey}" not found - generate Restricted Key per the Agentic Commerce enablement brief`)
  }
  const raw = rows[0].value
  const key = typeof raw === 'string' ? raw : (raw?.key || raw?.value)
  if (!key || !key.startsWith('rk_')) {
    throw new Error(`stripeAgentService: kv_store row "${kvKey}" value is not a Restricted Key (expected rk_*)`)
  }
  _credCache.set(entity, { key, at: now })
  return key
}

async function _stripeFor(entity = 'pty_ltd') {
  if (_stripeCache.has(entity)) return _stripeCache.get(entity)
  const key = await _loadRestrictedKey(entity)
  const client = new Stripe(key, {
    apiVersion: '2025-04-30.basil',
    appInfo: {
      name: 'EcodiaOS-stripeAgentService',
      version: '0.1.0',
      url: 'https://ecodia.au',
    },
    maxNetworkRetries: 2,
    timeout: 20_000,
  })
  _stripeCache.set(entity, client)
  return client
}

function _resetCache() {
  _credCache.clear()
  _stripeCache.clear()
}

async function createCustomer({ entity = 'pty_ltd', email, name, description, metadata }) {
  const stripe = await _stripeFor(entity)
  const customer = await stripe.customers.create({ email, name, description, metadata })
  logger.info({ event: 'stripe_agent.customer_created', entity, customer_id: customer.id, email })
  return customer
}

async function createProduct({ entity = 'pty_ltd', name, description, metadata, images }) {
  const stripe = await _stripeFor(entity)
  const product = await stripe.products.create({ name, description, metadata, images })
  logger.info({ event: 'stripe_agent.product_created', entity, product_id: product.id, name })
  return product
}

async function createPrice({ entity = 'pty_ltd', product, unit_amount, currency = 'aud', recurring, nickname, metadata }) {
  const stripe = await _stripeFor(entity)
  const params = { product, unit_amount, currency, nickname, metadata }
  if (recurring) params.recurring = recurring
  const price = await stripe.prices.create(params)
  logger.info({ event: 'stripe_agent.price_created', entity, price_id: price.id, product, unit_amount, currency })
  return price
}

async function createPaymentLink({ entity = 'pty_ltd', line_items, after_completion, metadata, allow_promotion_codes }) {
  const stripe = await _stripeFor(entity)
  const link = await stripe.paymentLinks.create({
    line_items,
    after_completion,
    metadata,
    allow_promotion_codes: !!allow_promotion_codes,
  })
  logger.info({ event: 'stripe_agent.payment_link_created', entity, link_id: link.id, url: link.url })
  return link
}

async function createInvoice({ entity = 'pty_ltd', customer, days_until_due, description, metadata, auto_advance = false }) {
  const stripe = await _stripeFor(entity)
  const invoice = await stripe.invoices.create({ customer, days_until_due, description, metadata, auto_advance })
  logger.info({ event: 'stripe_agent.invoice_created', entity, invoice_id: invoice.id, customer })
  return invoice
}

async function addInvoiceItem({ entity = 'pty_ltd', customer, invoice, price, quantity = 1, description, metadata }) {
  const stripe = await _stripeFor(entity)
  const params = { customer, quantity, description, metadata }
  if (invoice) params.invoice = invoice
  if (price) params.price = price
  const item = await stripe.invoiceItems.create(params)
  logger.info({ event: 'stripe_agent.invoice_item_added', entity, item_id: item.id, invoice, price })
  return item
}

async function finalizeInvoice({ entity = 'pty_ltd', invoice }) {
  const stripe = await _stripeFor(entity)
  const finalised = await stripe.invoices.finalizeInvoice(invoice)
  logger.info({ event: 'stripe_agent.invoice_finalised', entity, invoice_id: finalised.id })
  return finalised
}

async function sendInvoice({ entity = 'pty_ltd', invoice }) {
  const stripe = await _stripeFor(entity)
  const sent = await stripe.invoices.sendInvoice(invoice)
  logger.info({ event: 'stripe_agent.invoice_sent', entity, invoice_id: sent.id })
  return sent
}

async function listProducts({ entity = 'pty_ltd', limit = 20, active = true }) {
  const stripe = await _stripeFor(entity)
  return stripe.products.list({ limit, active })
}

async function listCustomers({ entity = 'pty_ltd', limit = 20, email }) {
  const stripe = await _stripeFor(entity)
  return stripe.customers.list({ limit, email })
}

async function probe({ entity = 'pty_ltd' }) {
  const stripe = await _stripeFor(entity)
  const account = await stripe.accounts.retrieve()
  return {
    ok: true,
    entity,
    account_id: account.id,
    business_profile: account.business_profile?.name || null,
    default_currency: account.default_currency,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
  }
}

module.exports = {
  createCustomer,
  createProduct,
  createPrice,
  createPaymentLink,
  createInvoice,
  addInvoiceItem,
  finalizeInvoice,
  sendInvoice,
  listProducts,
  listCustomers,
  probe,
  _resetCache,
}

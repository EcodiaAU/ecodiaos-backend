/* Smoke test for stripe_agent step 4: real Stripe artefacts + DB mirror.
   Loads env from VPS-mirror, calls stripeAgentService directly on the live
   pty_ltd account (acct_1SWvWdCjJTDXevIj), then exercises the bookkeeping
   mirror against the real staged_transactions table. */
'use strict'

const path = require('path')
const fs = require('fs')

const env = {
  DATABASE_URL: 'postgresql://postgres.nxmtfzofemtrlezlyhcj:QR2uOIG0IcS8YSvq@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres',
  JWT_SECRET: 'c242c32a5acf1c5eb848b66323c41ad6a36192a3177aec770826c44ead16159a',
  DASHBOARD_PASSWORD_HASH: '$2b$10$Y4pRwTBZDS3B0qCVW7cuB.T61xxkfUf7DUSG/HGtfeZlg3kX0g.yG',
  ENCRYPTION_KEY: '513c0e2b6a2694fe602f42d187dcf2aaaa5a31d8eab231713236c6afbaba67f0',
  SUPABASE_URL: 'https://nxmtfzofemtrlezlyhcj.supabase.co',
  SUPABASE_SERVICE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bXRmem9mZW10cmxlemx5aGNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTgzNTg2MiwiZXhwIjoyMDg3NDExODYyfQ.Wo_WhploChO_3VgxKrz9Bv4uNkLMrQVngMbDDerol88',
}
for (const [k, v] of Object.entries(env)) process.env[k] = v

process.chdir(path.resolve(__dirname, '..'))

async function main() {
  const stripeAgent = require('../src/services/stripeAgentService')
  const cowork_stripeAgent = require('../src/routes/mcp/cowork.stripeAgent')
  const db = require('../src/config/db')

  const out = {}

  console.log('=== Step A: probe acct (pty_ltd) ===')
  const probe = await stripeAgent.probe({ entity: 'pty_ltd' })
  console.log(JSON.stringify(probe, null, 2))
  out.probe = probe
  if (probe.account_id !== 'acct_1SWvWdCjJTDXevIj') {
    throw new Error(`expected acct_1SWvWdCjJTDXevIj, got ${probe.account_id}`)
  }
  if (!probe.charges_enabled) throw new Error('charges_enabled is false')

  const ts = Date.now()

  console.log('\n=== Step B: createProduct ===')
  const product = await stripeAgent.createProduct({
    entity: 'pty_ltd',
    name: `EcodiaOS smoke product ${ts}`,
    description: 'Created by stripe_agent step 4 smoke test (row d2cad335).',
    metadata: { origin: 'stripe_agent_smoke', ts: String(ts) },
  })
  console.log('product_id:', product.id, '| name:', product.name, '| livemode:', product.livemode)
  out.product = { id: product.id, name: product.name, livemode: product.livemode }

  console.log('\n=== Step C: createPrice ===')
  const price = await stripeAgent.createPrice({
    entity: 'pty_ltd',
    product: product.id,
    unit_amount: 1900, // AU$19.00
    currency: 'aud',
    nickname: 'smoke 19 aud',
    metadata: { origin: 'stripe_agent_smoke', ts: String(ts) },
  })
  console.log('price_id:', price.id, '| unit_amount:', price.unit_amount, '| currency:', price.currency)
  out.price = { id: price.id, unit_amount: price.unit_amount, currency: price.currency }

  console.log('\n=== Step D: createPaymentLink ===')
  const link = await stripeAgent.createPaymentLink({
    entity: 'pty_ltd',
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { origin: 'stripe_agent_smoke', ts: String(ts) },
  })
  console.log('link_id:', link.id, '| url:', link.url)
  out.link = { id: link.id, url: link.url, livemode: link.livemode }

  console.log('\n=== Step E: bookkeeping mirror via cowork.stripeAgent._internal._mirrorToStaged ===')
  const resolved = await cowork_stripeAgent._internal._resolveAmountFromLineItems({
    entity: 'pty_ltd',
    line_items: [{ price: price.id, quantity: 1 }],
  })
  console.log('resolved:', resolved)
  if (resolved.amount_cents !== 1900) throw new Error(`expected resolved 1900 cents, got ${resolved.amount_cents}`)

  const mirror = await cowork_stripeAgent._internal._mirrorToStaged({
    db, entity: 'pty_ltd',
    artefact_kind: 'payment_link',
    artefact_id: link.id,
    amount_cents: resolved.amount_cents,
    currency: resolved.currency,
    description: `Stripe payment link ${link.id} (pty_ltd, AUD) [smoke ${ts}]`,
    long_description: link.url,
    metadata: { stripe_payment_link_url: link.url, origin: 'stripe_agent_smoke', ts: String(ts) },
  })
  console.log('mirror:', mirror)
  if (!mirror.staged_id) throw new Error(`mirror staged_id missing; result=${JSON.stringify(mirror)}`)
  out.mirror = mirror

  console.log('\n=== Step F: re-read staged_transactions row for verification ===')
  const [stagedRow] = await db`
    SELECT id, source, source_ref, source_account, amount_cents, currency_or_null, occurred_at,
           status, transaction_type, is_gst_inclusive, gst_amount_cents
    FROM (
      SELECT id, source, source_ref, source_account, amount_cents,
             null::text AS currency_or_null, occurred_at,
             status, transaction_type, is_gst_inclusive, gst_amount_cents
      FROM staged_transactions
      WHERE source_ref = ${link.id}
    ) sub
  `
  console.log('staged_row:', stagedRow)
  if (!stagedRow) throw new Error('staged_transactions row not found after mirror')
  if (stagedRow.source !== 'stripe_agent') throw new Error(`expected source=stripe_agent, got ${stagedRow.source}`)
  if (stagedRow.source_account !== 'ba_ecodia') throw new Error(`expected source_account=ba_ecodia, got ${stagedRow.source_account}`)
  if (stagedRow.amount_cents !== 1900) throw new Error(`expected amount_cents=1900, got ${stagedRow.amount_cents}`)
  if (stagedRow.gst_amount_cents !== 173) throw new Error(`expected gst_amount_cents=173 (1900/11 round), got ${stagedRow.gst_amount_cents}`)
  if (stagedRow.status !== 'pending') throw new Error(`expected status=pending, got ${stagedRow.status}`)

  console.log('\n=== ALL CHECKS PASSED ===')
  console.log('Artefacts:')
  console.log('  account_id =', probe.account_id)
  console.log('  product_id =', product.id)
  console.log('  price_id   =', price.id)
  console.log('  link_id    =', link.id)
  console.log('  link_url   =', link.url)
  console.log('  staged_id  =', mirror.staged_id)
  console.log('  ts         =', ts)

  // Persist artefact ids to a small JSON file for downstream substrate writes.
  const outPath = path.resolve(__dirname, `stripe-agent-smoke-${ts}.out.json`)
  fs.writeFileSync(outPath, JSON.stringify({
    account_id: probe.account_id,
    product_id: product.id,
    price_id: price.id,
    link_id: link.id,
    link_url: link.url,
    staged_id: mirror.staged_id,
    smoke_ts: ts,
  }, null, 2))
  console.log('Persisted artefact ids to', outPath)
  return out
}

main().then(() => {
  console.log('\nDone.')
  process.exit(0)
}).catch(err => {
  console.error('SMOKE FAILED:', err.message)
  console.error(err.stack)
  process.exit(1)
})

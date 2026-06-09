---
triggers: stripe-event-poll, stripe poll, list_disputes, list_charges, list_subscriptions, stripe balance, stripe agent readonly, ecodia-money mcp, stripeAgentService readonly, stripe radar, dispute scan, subscription churn, stripe.events, daily stripe sweep
binding: cron=stripe-event-poll
status: active
authored: 2026-06-10
origin: stripe-event-poll cron fire 2026-06-09 23:13 AEST + Tate direct request "implement the tools for that"
---

# stripe-event-poll route: Restricted Key readonly surface on ecodia-money

The `stripe-event-poll` cron (every 2h) reads recent Stripe activity (charges, disputes, payment_intents, subscriptions, refunds, balance, payouts) and surfaces anything actionable. The brief instructs "via the ecodia-money MCP", which is correct as of 2026-06-10 only because the readonly surface was authored same-arc as the first non-trivial fire. Prior briefs incorrectly assumed the WRITE-tool subset alone was enough.

**Why:** the Restricted Key permission matrix gives autonomous READ access to Stripe activity surfaces. Without MCP tools on top, every fire loads the kv-mirror key from disk and instantiates the Stripe SDK directly. That bypasses the audit log and the scope guard. The readonly tools land all reads inside the audit and scope envelope.

**How to apply:** when authoring or revising a cron that polls Stripe activity, route through `ecodia-money` `stripe_agent.list_*` and `stripe_agent.balance` only. Never shell to Stripe CLI, never use the sk_live secret key, never re-import stripeAgentService at the call site.

## What the ecodia-money MCP exposes (canonical inventory)

All `stripe_agent.*` tools route through `src/services/stripeAgentService.js`, which loads a Restricted Key per entity from `kv_store.creds.stripe_agent_restricted_key_<entity>`. The key has read on charges, payment_intents, refunds, balance, payouts, webhooks and write on customers, products, prices, payment_links, invoices, subscriptions. NONE on connect, sigma, issuing, treasury, capital, climate, files.

### WRITE tools (`write.stripe_agent` scope)
- `stripe_agent.probe`
- `stripe_agent.create_customer`
- `stripe_agent.create_product`
- `stripe_agent.create_price`
- `stripe_agent.create_payment_link` (mirrors to `staged_transactions`)
- `stripe_agent.create_checkout_session` (mirrors to `staged_transactions`)

### READ tools (`read.stripe_agent` scope), shipped 2026-06-10
- `stripe_agent.list_charges` (bounds via `since_unix`)
- `stripe_agent.list_disputes`
- `stripe_agent.list_payment_intents`
- `stripe_agent.list_refunds`
- `stripe_agent.list_subscriptions`
- `stripe_agent.list_payouts`
- `stripe_agent.balance`

## Per-entity routing

Every tool takes `entity` (default `pty_ltd`). Valid: `pty_ltd` | `labs` | `dao`. Each loads its own Restricted Key. Today only pty_ltd has a seeded key. labs and dao come online by repeating Step 1 of `drafts/stripe-agentic-commerce-enablement-2026-06-02.md` against each entity's Stripe account and seeding the kv_store row.

## How the poll cron uses this

1. Probe + balance: account state and float (`stripe_agent.probe` + `stripe_agent.balance`).
2. `stripe_agent.list_disputes` with `since_unix = now - 2.5h`. Any result triggers P1 status_board + sms-tate per dispute. Cross-check the charge against CRM before escalating per the brief's "spurious Stripe Radar fraud flags are common" guard.
3. `stripe_agent.list_charges` with same window. Filter `status='failed'` to P2 status_board.
4. `stripe_agent.list_payment_intents` with same window. Filter `status in ('requires_action','requires_payment_method')` to P2.
5. `stripe_agent.list_subscriptions` `status='all'`. Diff against the prior fire's snapshot: new `past_due` to P2, new `canceled` since last fire to P3 plus CRM cross-check.
6. `stripe_agent.list_refunds` with same window. Audit-only Episode.
7. Substrate writes every fire: `kv_store.cowork.cron.stripe-event-poll.last_fire` (snapshot) plus a Neo4j Episode (type cowork_realisation). status_board rows only if something is actionable. Quiet days are the norm at sub-commercial volume.

## Anti-patterns

- Do not route through the deprecated `ecodia-full` or the deprecated cowork-gateway. The narrow `ecodia-money` connector is canonical since 2026-05-29.
- Do not use the Stripe secret key (sk_live). 2FA-gated and not exposed to autonomous code. The Restricted Key (rk_live) is the only autonomous-safe route.
- Do not shell out to the Stripe CLI on the VPS. The Restricted Key route is in-process and audit-logged.
- Do not skip the kv_store and Episode writes even on quiet fires. Per [[cron-fire-must-have-deliverable-not-just-narration]].
- Do not raise an SMS for every charge or sub change. Only disputes, large-payments-from-new-customers, and genuine churn signals per the [[stripe-event-handler]] routing doc.

## Related substrate

- `src/services/stripeAgentService.js` SDK wrapper, loads Restricted Keys, exposes write and read methods.
- `src/routes/mcp/cowork.stripeAgent.js` MCP route handlers + write-side bookkeeping mirror.
- `src/services/connectorManifests.js` declares which tools `ecodia-money` exposes and which scopes it needs.
- `src/services/coworkScope.js` whitelist of valid scope strings, includes `read.stripe_agent`.
- `docs/secrets/stripe-agent.md` credential dossier.
- `drafts/stripe-agentic-commerce-enablement-2026-06-02.md` original Step 1-4 brief.
- `routines/stripe-event-handler.md` webhook-driven sibling. The poll is the safety net, the handler is the real-time path.

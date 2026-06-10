# Stripe Agentic Commerce - end-to-end enablement of EcodiaOS on Ecodia's own Stripe

**Decision date:** 2026-06-02 (Tate verbatim: "Agentci stripe sounds fucking amazing, give me the steps to enable you with that completely")
**Parent row:** status_board d2cad335 (the dossier-summarised research row)
**Direct unblock target:** status_board 87833a81 (Algorithmic-Manager Kit landing - Stripe wire-up pending) + 90 (Stripe-invoices-ledger syncer, folded in)
**Other decisions from same turn:** QoO Stripe-ACS issue deferred to Edition 06 (Edition 05 already posted). Corpo.llc not actionable, dropped.

## Goal

EcodiaOS creates and updates Stripe products, prices, payment links, invoices, subscriptions, and posts ledger entries on Ecodia Pty Ltd's live Stripe account WITHOUT a Tate 2FA prompt per action. Today every Stripe live-key write touches Tate's phone - the AMK landing has been sitting on that block. Goal state: I autonomously ship a product+price+payment-link for AMK in one tool call, and the same surface ships every future product on every Ecodia entity (Pty Ltd + Labs + DAO LLC).

## The substrate (what's actually being adopted)

Three pieces, stacked:

1. **Stripe Agent Toolkit** (`@stripe/agent-toolkit`, npm). Anthropic + LangChain + OpenAI SDK wrappers around Stripe's existing REST API. A thin adapter exposing Stripe operations as model-callable tools with permission-scoping. The underlying API surface stays the same. Repo: github.com/stripe/agent-toolkit.

2. **Stripe Restricted API Keys** (an existing Stripe feature). Scope-limited keys generated in Stripe Dashboard -> Developers -> API keys -> Restricted keys. Each key has a permission matrix (read/write per Stripe resource). The agent uses a Restricted Key in place of the live secret key, so the blast radius is bounded and the 2FA-on-secret-key requirement does not apply.

3. **Existing webhook signing secrets** (we have these, per status_board row 11 P3 follow-up). Webhook handlers verify HMAC signature against the signing secret. Nothing changes here - the agent doesn't touch webhook delivery, only the merchant-side operations.

What we DON'T need: ACP / x402 / AP2 / Skyfire. Those are buy-side agent protocols (agent acts AS a customer making purchases). We are the merchant, and EcodiaOS acts on behalf of the merchant. Different problem.

## Concrete steps

### Step 1 - Generate the Restricted Key (Tate, ~3 minutes)

Stripe Dashboard -> Developers -> API keys -> "+ Create restricted key". Permissions to GRANT WRITE on:
- Customers (create, update; no delete)
- Products (create, update; no archive)
- Prices (create, update; no archive)
- Payment Links (create, update)
- Invoices (create, finalize, send, void; no destructive delete)
- Subscriptions (create, update, cancel)
- Charges, PaymentIntents, Refunds (READ only - refunds stay 2FA-gated)
- Webhooks (READ only - we configure those manually)

Permissions to leave at NONE / READ:
- Connect accounts (we don't use Stripe Connect today)
- Balance, Payouts (READ for reporting; no write)
- Files, Sigma, Issuing, Capital, Climate, Treasury (NONE)

Name the key `EcodiaOS - autonomous merchant operations - 2026-06`. Copy the `rk_live_...` value (only shown once).

**Alternative path:** if Tate prefers, I drive this via CDP through the laptop-agent (gui.enable_chrome_cdp -> stripe.com/dashboard/developers/apikeys). Either works. The hand path is faster for this one-time generation.

### Step 2 - Store the key + wire kv_store (I do this)

Write to `D:/PRIVATE/ecodia-creds/stripe-agent.env` (laptop-local, NOT MCP):
```
STRIPE_AGENT_RESTRICTED_KEY_PTY_LTD=rk_live_...
STRIPE_AGENT_RESTRICTED_KEY_LABS=rk_live_...   # generate per-entity
STRIPE_AGENT_RESTRICTED_KEY_DAO=rk_live_...    # if/when DAO LLC takes payments
```

Mirror the Pty Ltd key to `kv_store.creds.stripe.agent_restricted_key.pty_ltd` via Supabase Management API (one of the per-entity rows the ecodia-money MCP connector can read). Repeat per entity. Write the docs/secrets/stripe-agent.md frontmatter with `triggers:` for the cred-mention hook to surface it.

### Step 3 - Install + wire the Agent Toolkit (I do this)

```
cd D:/.code/EcodiaOS/backend
npm install @stripe/agent-toolkit
```

Then create `src/services/stripeAgentService.js` that:
- Loads the restricted key per entity from kv_store at startup.
- Instantiates `StripeAgentToolkit` with the configuration block (allowed actions matrix mirrors what we granted in Step 1, defence in depth).
- Exports per-resource methods (`createProduct`, `createPrice`, `createPaymentLink`, `createInvoice`, etc.) that wrap the toolkit calls with our entity-routing logic.

Wire those into the existing `ecodia-money` MCP connector at `src/routes/mcp/ecodiaMoney.js`. New MCP tools to expose (all backed by `stripeAgentService`):
- `stripe_agent_create_product` (name, description, entity)
- `stripe_agent_create_price` (product_id, amount_cents, currency, recurring, entity)
- `stripe_agent_create_payment_link` (price_ids, success_url, metadata, entity)
- `stripe_agent_create_invoice` (customer_id, line_items, due_days, entity)
- `stripe_agent_send_invoice` (invoice_id, entity)
- `stripe_agent_finalize_invoice` (invoice_id, entity)

Each tool routes to the correct restricted key by `entity` arg.

### Step 4 - Auto-mirror to bookkeeping (I do this, this is row 90 folding in)

Every successful Stripe write fires a side-effect into the existing bookkeeping substrate:
- `createProduct` -> log to a `stripe_products` mirror table for cross-ref.
- `createInvoice` -> write a `staged_transactions` row pointing at the Stripe invoice, ready for `bk_post_transaction` once paid.
- Webhook `invoice.paid` -> auto-categorise via `bk_auto_categorize` + post to ledger.

This kills row 90 (Stripe-to-invoices-to-ledger syncer) as a side-effect.

### Step 5 - Smoke test with AMK (I do this end-to-end)

Live ship of the Algorithmic-Manager Kit pricing tier as the validation:
1. `stripe_agent_create_product` (name = "Algorithmic-Manager Kit", entity = "pty_ltd")
2. `stripe_agent_create_price` (the agreed price for Kit access)
3. `stripe_agent_create_payment_link` (success_url = AMK landing /thanks)
4. Edit the AMK landing CTA to point at the payment link
5. Push to Vercel, verify READY, visual-verify the checkout flow via CDP on a real browser
6. Test purchase with a real card, verify the webhook fires, verify ledger row writes.

End-state: AMK landing has a working CTA -> Stripe checkout -> success page -> bookkeeping row. The block on row 87833a81 dissolves.

### Step 6 - Doctrine + memory updates (I do this)

- Author pattern `D:/.code/EcodiaOS/backend/patterns/stripe-agent-toolkit-is-the-merchant-side-autonomy-substrate.md` with the merchant-vs-buyer-side framing + Restricted Key permission matrix + the don't-grant rules.
- Update `D:/.code/EcodiaOS/backend/CLAUDE.md` STRIPE section to name `stripeAgentService.js` as the autonomous-merchant entry point, with the existing manual stripe MCP tools as the 2FA-gated fallback.
- Add reference memory at `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/reference_stripe_agent_toolkit_substrate_2026-06-02.md`.

### Step 7 - Per-entity expansion (I do this, async after AMK ships)

Once the Pty Ltd path is validated, generate Restricted Keys for Labs + DAO LLC, mirror to kv_store, and the same stripeAgentService routes to the right entity by arg. No new code, just config.

## Substrate cost + risk

- Cost: zero. Agent Toolkit is free, Restricted Keys are free, no Stripe plan change. The only new dependency is one npm package.
- Blast radius: bounded by the Restricted Key permission matrix above. Worst case (key leaks): attacker can create products/invoices/payment-links but cannot move money out, cannot issue refunds, cannot touch payouts, cannot reach Connect accounts.
- 2FA model preserved: the live secret key + refunds + payouts + key rotation all still require Tate's phone. Only the merchant-creation surface is unblocked.
- Rotation discipline: per [[cred-rotation-must-propagate-to-all-consumers]], any future rotation of the Restricted Key must update D:/PRIVATE/ecodia-creds/stripe-agent.env + kv_store + Vercel envs (if any backend service running there consumes it) + any docs.

## What Tate does, what I do

- **Tate** (~3 min): Step 1 (generate Restricted Key with permissions matrix above, send me the `rk_live_...`).
- **EcodiaOS**: Steps 2-7. Including the AMK ship at Step 5.

## Sequencing

I can start Step 2 storage scaffolding + Step 3 service skeleton now using a placeholder key, ship the code path, then drop the real key in when Tate sends it. End-to-end ETA from key-received: same session for Pty Ltd + AMK live ship.

## After this ships

Updates the following status_board rows:
- d2cad335 -> archived, status reflects shipped Stripe ACS adoption.
- 87833a81 -> next_action = "Stripe wire shipped via stripeAgentService, AMK payment link live, monitor first conversions."
- 90 (folded in this turn) -> already archived.
- 11 (Vercel + Stripe webhook secrets) -> sharpens further: Stripe webhook secrets specifically need per-entity confirmation.

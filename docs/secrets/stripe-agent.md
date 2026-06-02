---
name: stripe-agent
triggers: stripe-agent, stripe-restricted-key, stripe-agent-toolkit, agentic-commerce, stripeAgentService, rk_live, autonomous-stripe, ecodia-pty-stripe, amk-stripe, stripe-product, stripe-price, stripe-payment-link, stripe-invoice-autonomous
kv_key: creds.stripe_agent_restricted_key_pty_ltd
shape: object {key, entity, mode, prefix, granted_at, permissions, note}
---

# Stripe Agent Restricted API Key - Ecodia Pty Ltd

Live `rk_live_*` Restricted API Key for autonomous EcodiaOS merchant operations on Ecodia Pty Ltd's Stripe account. Used by `src/services/stripeAgentService.js` (the Agent Toolkit wrapper) and any MCP tool routing through `ecodia-money` that creates customers, products, prices, payment links, invoices, or subscriptions.

## Permission matrix (matches what was granted in Dashboard)

- WRITE: customers, products, prices, payment_links, invoices, subscriptions
- READ: charges, payment_intents, refunds, webhooks, balance, payouts
- NONE: connect, sigma, issuing, treasury, capital, climate, files

This bounds the blast radius: a leaked Restricted Key cannot move money out, cannot issue refunds, cannot touch payouts, cannot reach Connect accounts.

## Where the value lives

`kv_store.creds.stripe_agent_restricted_key_pty_ltd`:

```json
{
  "key": "rk_live_...<see kv_store>",
  "entity": "ecodia_pty_ltd",
  "mode": "live",
  "prefix": "rk_live",
  "granted_at": "2026-06-02",
  "permissions": "<see above>"
}
```

Local mirror at `D:/PRIVATE/ecodia-creds/stripe-agent.env` (env var `STRIPE_AGENT_RESTRICTED_KEY_PTY_LTD`). The laptop-local copy is the load-bearing one for scripts running on Corazon outside the kv_store-reachable path.

Fetch via the org PAT path:

```bash
set -a; . D:/PRIVATE/ecodia-creds/supabase.env; set +a
curl -s "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT value FROM kv_store WHERE key='\''creds.stripe_agent_restricted_key_pty_ltd'\''"}'
```

## When to use

- Any autonomous Stripe API call originating from EcodiaOS (creating products, prices, payment links, invoices) on the Pty Ltd account.
- Webhook handlers staying with the existing webhook signing secret path - do not use this Restricted Key for signature verification.
- Future per-entity expansion: a sibling key `creds.stripe_agent_restricted_key_labs` covers Ecodia Labs Pty Ltd. Generate by repeating the brief Step 1 against the Labs Stripe account.

Do NOT use for:
- Refunds (READ-only on this key by design; refunds stay 2FA-gated on Tate's phone).
- Payouts management.
- Connect onboarding.
- Webhook secret rotation - that uses `creds.stripe_chamber_test_webhook_secret` per-project pattern.

## 2FA model

Restricted Keys do not trigger the 2FA-on-secret-key flow. The first turn that exercises this key end-to-end (during the AMK smoke test) is the proof of that.

## Consumer surfaces (rotation checklist)

When this key rotates:
- `kv_store.creds.stripe_agent_restricted_key_pty_ltd.key` (canonical)
- `D:/PRIVATE/ecodia-creds/stripe-agent.env` (local mirror)
- Any Vercel env var that injects this for a deployed service (none yet; will add when stripeAgentService runs server-side)
- `src/services/stripeAgentService.js` startup loader - reads kv_store at boot, no inline value

Rotation is via Stripe Dashboard -> Developers -> API keys -> the row for this key -> Roll key. The new value lands in kv_store + the local env file SAME turn the rotation happens.

Sibling cred: `creds.stripe_login` (the Dashboard login used to generate + rotate this key via GUI). That doc covers the password rotation surfaces.

Origin: Tate verbatim 2026-06-02 generated this Restricted Key against the Pty Ltd Stripe account per Step 1 of the Agentic Commerce enablement brief.

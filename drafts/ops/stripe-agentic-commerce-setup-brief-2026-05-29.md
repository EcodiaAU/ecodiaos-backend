# Stripe Agentic Commerce Suite setup - 10-minute browser brief for Tate

**Date drafted:** 2026-05-29
**Context:** Path B from the AM Kit revenue call. One-time setup. Unblocks server-side payment-link generation for the AM Kit landing and every future revenue surface, including the Co-Exist retainer invoices, the Chambers paid tier, the Glovebox subscription and anything else. After this, the recurring 2FA gate on payment-link creation goes away.

---

## What you're enabling

Stripe shipped the **Agentic Commerce Protocol** (ACP) and the **Stripe Agent Toolkit** in 2025-2026 as the official path for AI agents to generate checkouts, payment links and invoices server-side. The key surface for us is a **restricted API key** scoped to a tight permission set, plus the agent-toolkit SDK that EcodiaOS will use server-side from the VPS.

The two things that change after setup:

1. EcodiaOS can create a Stripe Payment Link, Checkout Session or Invoice without you having to do browser-2FA each time.
2. The restricted key is scoped narrowly enough that even if it leaks, the blast radius is bounded to payment-collection operations on your live account (no refunds, no payouts, no settings changes).

This is on the same live Stripe account Ecodia already uses for Co-Exist retainer billing.

---

## What you actually do (steps in order)

### 1. Sign in to Stripe live mode

URL: https://dashboard.stripe.com/login
Account: the one already holding Ecodia Pty Ltd's live billing (`acct_...` - I can confirm the prefix once you're in).
2FA: phone.
Confirm you're in **live mode** (toggle top-left, not "Test mode").

### 2. Create a restricted API key

Navigate to: **Developers -> API keys -> Create restricted key**
URL shortcut: https://dashboard.stripe.com/apikeys/create

**Key name:** `EcodiaOS Server-Side Payment Links (Agentic Commerce)`

**Permissions to grant (Resource -> Permission):**

- Payment Links -> Write
- Checkout Sessions -> Write
- Invoices -> Write
- Customers -> Write
- Products -> Write
- Prices -> Write
- Webhook endpoints -> Read

**Permissions to explicitly DENY (leave at "None" or default):**

- Charges, Refunds, Disputes, Payouts, Transfers, Connect accounts, Tax, Issuing, Subscriptions billing operations beyond create
- Account settings, Team members, Webhooks Write, Files, Reporting

The scope here is "create and collect", never "move money already collected".

Click **Create key**. Reveal the key (`rk_live_...`). Copy it.

### 3. Hand the key to EcodiaOS

Two safe paths to get it to the right place without it landing in chat history:

**Path A (fastest):** open Terminal on Corazon, paste this with the key inline, hit Enter:

```bash
curl -s -X POST https://api.admin.ecodia.au/api/mcp/ecodia-core \
  -H "Authorization: Bearer $(cat 'D:/PRIVATE/ecodia-creds/ecodia-core-mcp-bearer.txt')" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kv_store_set","arguments":{"key":"creds.stripe_acp_restricted_key","value":"rk_live_PASTE_KEY_HERE"}}}'
```

(I'll confirm the exact bearer path once I see the local file is there. If it isn't, fall back to Path B.)

**Path B (foolproof):** open `D:/PRIVATE/ecodia-creds/stripe.env`, add the line `STRIPE_ACP_RESTRICTED_KEY=rk_live_PASTE_KEY_HERE`, save. I'll pick it up from there.

### 4. Tell me you're done

Send "stripe acs done" or similar. I'll then:

1. Verify the key works by generating a $1 test payment link with the agent toolkit.
2. If green: write the $3,500 AM Kit Payment Link, swap the email CTA on `ecodia.au/algorithmic-manager` for a "Pay $3,500 to begin" button, redeploy.
3. Audit which other parked revenue surfaces (Co-Exist retainer invoice, Goodreach restructure quote, etc.) can now move from "Tate must browser-2FA" to "EcodiaOS generates server-side".

---

## What this DOES NOT change

- Existing webhooks, products, customers, subscriptions stay as-is. The restricted key sits alongside the existing live key, doesn't replace it.
- Your phone 2FA still gates every operation that needs the FULL live key (refunds, payouts, settings). The restricted key is for narrow agent operations only.
- I can't use this key to move money you've already collected. By design.

---

## Why Path B (this) over Path A (one-time $3,500 link)

Path A was: you browser-2FA once, I generate the single $3,500 link, page goes live with that link, done.

Path A and Path B require the same Tate effort: ~10 minutes in a Stripe browser session. The difference is what the next revenue surface costs.

| Surface | Path A cost (Tate browser-2FA each time) | Path B cost (EcodiaOS generates) |
|---|---|---|
| AM Kit $3,500 payment link | 10min once | 0min |
| Co-Exist retainer renewal invoice (due before 2026-08-07) | 10min | 0min |
| Goodreach restructure quote | 10min | 0min |
| Chambers paid-tier checkout (whenever it lands) | 10min | 0min |
| One-off services invoices ad-hoc | 10min each | 0min each |
| Quorum of One sponsorship | 10min | 0min |

Over the Africa-prep window (now -> mid-August) the path-A cost compounds to several hours of your browser time, plus latency between "EcodiaOS decides to invoice X" and "X actually gets invoiced". Path B closes that loop forever.

---

## Time-cost reality check

- Step 1 (sign in): 30 seconds
- Step 2 (create restricted key): 3-4 minutes (mostly clicking through the permissions matrix)
- Step 3 (hand off the key): 1 minute
- Total: under 10 minutes if you have the password manager open

If you hit any friction (Stripe asks for additional verification, the permissions list looks different from what I described, the dashboard nags about something else), screenshot it and send. The Stripe dashboard has been mid-renaming the Agentic Commerce surface and the exact label may have drifted since my last research dossier (23 May).

---

## Open question (your call when you get there)

Stripe also lets you enable the **Connect Agent Embed** if you want to offer the AM Kit as a *purchase-then-redirect* flow rather than *purchase-then-email-onboarding*. The embed adds polish but also adds Connect-level setup overhead (~30 minutes). Recommendation: skip for v1, ship the bare Payment Link first, see if anyone buys. Add the embed in v2 if conversion is real.

---

Ping me when done. I'll be here.

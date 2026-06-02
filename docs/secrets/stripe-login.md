---
name: stripe-login
triggers: stripe, stripe-login, stripe-dashboard, stripe-restricted-key, stripe-api-key, stripe-agent-toolkit, agentic-commerce, payment-link, stripe-product, stripe-price, stripe-invoice, money@ecodia.au, ecodia-pty-stripe, amk-stripe
kv_key: creds.stripe_login
shape: object {email, password, auth_method, note}
---

# Stripe Dashboard login - money@ecodia.au

Email + password for Ecodia Pty Ltd's live Stripe account. Use this for any GUI flow at `dashboard.stripe.com` - Restricted API key generation, webhook secret rotation, account settings, payout review, dispute responses.

**Auth method is plain email + password. NOT Google SSO.** Some Stripe accounts use SSO via Google Workspace; this one does not. Treat the SSO-button path as wrong and use the regular email-password form.

## Where the value lives

`kv_store.creds.stripe_login`:

```json
{
  "email": "money@ecodia.au",
  "password": "<see kv_store>",
  "auth_method": "email_password_NOT_sso",
  "note": "Stripe Dashboard login for Ecodia Pty Ltd Stripe account."
}
```

Fetch via the org PAT path:

```bash
set -a; . D:/PRIVATE/ecodia-creds/supabase.env; set +a
curl -s "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT value FROM kv_store WHERE key='\''creds.stripe_login'\''"}'
```

## When to use

- CDP-drive `dashboard.stripe.com` (per the chrome-cdp reflex via the laptop-agent).
- Generate Restricted API keys per the permission matrix in `drafts/stripe-agentic-commerce-enablement-2026-06-02.md` Step 1.
- Rotate webhook signing secrets when consumer endpoints change.
- Review payouts, disputes, refund history, balance, tax invoices.

Do NOT use for:
- Programmatic Stripe API calls - those use `creds.stripe_test_secret_key` (test mode) or the live secret key path, or the new Restricted Keys at `creds.stripe.agent_restricted_key.*` once the Agent Toolkit lands.
- Stripe Connect onboarding flows - this account does not use Connect today.

## 2FA

If Stripe 2FA is enabled on this account, the prompt routes to Tate's authenticator. CDP-drive can fill email + password; the 2FA code must be typed by Tate when prompted, OR a "Trust this browser" checkbox may persist the session for ~30 days on Corazon's Chrome `Default` profile.

## Consumer surfaces (rotation checklist)

When this password rotates:
- `kv_store.creds.stripe_login.password` (canonical)
- Any saved-password entry in Chrome's `Default` profile on Corazon (where CDP drives from)
- Tate's password manager (if mirrored there)
- Any per-script env var hardcoded with this email - search code for `money@ecodia.au` paired with a password literal (should be zero hits)

The Stripe Restricted API keys generated using this login are stored separately at `creds.stripe.agent_restricted_key.*` (per the Agentic Commerce enablement brief) and rotate independently. Rotating this dashboard password does NOT invalidate Restricted Keys.

Origin: Tate verbatim 2026-06-02 before the Stripe Agentic Commerce setup - committing the login so the Restricted Key generation flow at `dashboard.stripe.com/test/apikeys` can be CDP-driven on the next pass.

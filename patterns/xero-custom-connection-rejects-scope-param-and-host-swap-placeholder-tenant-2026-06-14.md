---
title: Xero Custom Connection rejects an explicit scope param, and a host swap leaves the tenant id a placeholder
status: active
created: 2026-06-14
triggers: xero, xero-sync, bookkeeping-xero-sync, xeroReconcileService, custom connection, client_credentials, invalid_scope, XERO_TENANT_ID, 403 xero, no valid scopes, host swap env placeholder
supersedes_diagnosis: cron-silent-fail-when-external-api-auth-dies-2026-06-09 (the "scopes revoked, re-grant at developer.xero.com" reading was wrong)
related: substrate-path-coupling-survives-host-swap-as-silent-no-op, cron-silent-fail-when-external-api-auth-dies-2026-06-09, probe-volatile-external-state-before-asserting-2026-06-12, verify-deployed-state-against-narrated-state, probe-all-env-files-not-just-dotenv
---

# Xero Custom Connection scope-param rejection + host-swap placeholder tenant

`bookkeeping-xero-sync` silently stalled into a 41-row backlog (30 ba_ecodia
BankTransactions + 11 up_personal ManualJournals, oldest 2026-03-13). Live
probe on 2026-06-14 found TWO independent root causes. The prior status_board
diagnosis (row 9a372f74, 2026-06-09) read it as "Xero revoked the 7 Custom
Connection scopes, Tate must re-grant at developer.xero.com." That reading was
wrong and would have sent Tate on a wild goose chase. Re-probing reality
beats trusting the first plausible diagnosis.

## Root cause 1: Xero rejects an explicit `scope` param on client_credentials (all hosts)

Xero Custom Connection `client_credentials` token grants now return:

```
HTTP 400 {"error":"invalid_scope","error_description":"No valid scopes remaining after filtering for grant type"}
```

when the request includes an explicit `scope` parameter. The scopes a Custom
Connection grants are FIXED in the Xero app configuration. Send NO scope param
and the token is issued with the full configured scope set:

```
accounting.banktransactions accounting.banktransactions.read
accounting.manualjournals accounting.manualjournals.read
accounting.contacts accounting.contacts.read accounting.settings ...
expires_in=1800
```

So the scopes were never revoked. The grant call shape changed. The
`_getCustomConnectionToken` helper in `src/services/xeroReconcileService.js`
was passing `scope: CUSTOM_CONNECTION_SCOPE`, so every token mint failed.
Fix: omit the scope param. This bites every host, including the VPS.

## Root cause 2: the tenant id is a scaffold placeholder after the host swap (Mac only)

Even with a valid token, every `BankTransactions` / `ManualJournals` POST
returned `HTTP 403`. Cause: `XERO_TENANT_ID=your_xero_tenant_id` (the literal
scaffold placeholder) in the Mac `.env` AND `.env.production`. The real tenant
value lived only in the VPS process env (where the original 576 rows synced
from) and was never mirrored into the Mac `.env` during the 2026-06-08 Mac
host swap. `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` were the real values (the
token mint succeeds), so ONLY the tenant header was garbage. A bad tenant
header is a 403, not a 401, which is why it read as "permission" rather than
"misconfiguration."

The tenant id is NOT recoverable from the token: the client_credentials JWT
carries no `xero_tenant_id` claim, and `GET /connections` returns
`400 Xero-Tenant-Id header must be supplied` for this connection (chicken and
egg). The OAuth-integration fallback (`xero_tokens` table, used by the MCP
`xero_*` tools) was empty, so that path could not supply it either. The only
sources are the VPS process env or Tate.

## The two Xero integrations are separate (do not conflate)

- **Custom Connection (client_credentials)** backs `xeroReconcileService` (the
  push path). It mints a fresh token per call from `XERO_CLIENT_ID` /
  `XERO_CLIENT_SECRET` and needs `XERO_TENANT_ID`. It does NOT read the
  `xero_tokens` table. An empty `xero_tokens` table does NOT block it.
- **OAuth integration** (stored access/refresh token + tenant_id in the
  `xero_tokens` table) backs the MCP `xero_categorize` / `xero_get_transactions`
  tools. It returns `[]` when the token row is missing.

The 2026-06-09 diagnosis blamed the push failure on the empty `xero_tokens`
table. That table is irrelevant to the push path.

## How to apply

1. When a Xero `client_credentials` grant fails `invalid_scope`, drop the
   `scope` param before assuming scope revocation. Probe with no scope and
   read the returned `scope` field to confirm what the connection grants.
2. When a Xero write 403s with a valid token, check `XERO_TENANT_ID` is a real
   UUID, not a placeholder, before touching the Xero app config.
3. After ANY host swap, audit vendor-API env vars for scaffold placeholders,
   not just presence. `process.env.X` being set is not the same as being real
   (see substrate-path-coupling-survives-host-swap-as-silent-no-op).
4. The runner `scripts/bookkeeping-xero-sync.js` now has a pre-flight guard
   that throws with exact remediation on a placeholder/missing `XERO_*`. Keep
   that pattern: convert silent vendor 403s into loud config errors.
5. The 5 `pending` `stripe_agent_payment_link` rows are correctly NOT synced.
   They are payment-link artefacts awaiting a webhook payment match, not bank
   movements. Syncing them would book phantom income.

## Anti-patterns

- Reading `invalid_scope` as "the vendor revoked our scopes, ask the human to
  re-grant." Probe the no-scope grant first; the scopes may be intact and the
  request shape may be the bug.
- Trusting a stale status_board diagnosis over a fresh live probe.
- Conflating two vendor integrations that happen to hit the same vendor org.
- Treating `process.env.X !== undefined` as "configured." A placeholder is set
  and wrong.
- Pushing payment-link / quote / pending artefacts to the accounting system as
  realised transactions.

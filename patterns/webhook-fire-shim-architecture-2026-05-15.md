---
triggers: webhook-shim, fire-shim, /fire-endpoint, routine-fire-url, signature-verification, idempotency-key, webhook-audit, resend-webhook, stripe-webhook, vercel-webhook, github-webhook, apple-asn, accountRouter, routine_registry, post-cutover-webhook
---

# Webhook /fire-shim architecture (2026-05-15)

Post-VPS-to-local migration, the VPS no longer hosts business logic for inbound webhooks. Each webhook becomes a thin shim that verifies the source signature, dedupes via the source-provided idempotency key, and forwards the parsed event to a Routine's `/fire` endpoint hosted by Anthropic.

## The contract every shim follows

1. **Mount BEFORE express.json()** so the raw request body survives for HMAC verification. Each shim declares its own `express.raw({ type: '*/*', limit: 'Nmb' })` body parser scoped to the route.

2. **Load the per-source signing secret** from `kv_store.creds.<source>_webhook_secret` with a 5-minute in-process cache. If absent, return `503 webhook_secret_missing` and let the operator provision via kv_store. Never fall back to "trust the body".

3. **Verify the signature** using the source's specific scheme:
   - **Resend**: svix-signature header, sha256 HMAC of `${msgId}.${timestamp}.${rawBody}` with the base64-decoded secret.
   - **Stripe**: stripe-signature header (t=...,v1=...), sha256 HMAC of `${ts}.${rawBody}`. Prefer the SDK if available; fall back to manual HMAC.
   - **Vercel**: x-vercel-signature header, sha1 HMAC of rawBody.
   - **GitHub**: x-hub-signature-256 header, `sha256=${sha256_hmac(rawBody)}`.
   - **Apple ASN v2**: outer signedPayload JWT verified against Apple's x5c chain. Inner signedTransactionInfo + signedRenewalInfo decoded as part of payload normalisation.

4. **Idempotency** via the source's canonical idempotency key:
   - Stripe: `event.id` (TTL 7d - Stripe retries up to 3 days)
   - Resend: `data.message_id` or `svix-id` header (TTL 24h)
   - Vercel: `event.id` or deployment_id (TTL 24h)
   - GitHub: `x-github-delivery` header (TTL 24h)
   - Apple ASN: `notificationUUID` (TTL 7d - Apple retries up to 5 days)

   Seen-keys live at `kv_store.cowork.webhook_seen.<source>.<idempotency_key>` with explicit `expires_at`. The duplicate path returns `202 dedupe:duplicate` and writes an audit entry.

5. **Look up the Routine fire-config** from `kv_store.cowork.routine_registry.<account>.<routine_name>`. The registry is populated by Tate (or Lane B's parallel-work prompt) after each Routine is created in claude.ai web UI - see `backend/routines/REGISTRY.md` + `backend/scripts/populateRegistry.js`. If the entry is missing, the shim returns `503 routine_not_registered` and writes an audit entry.

6. **Forward via fetch** with payload shape:
   ```json
   { "text": "{\"source\":\"<source>\",\"payload\":<parsed event>}" }
   ```
   Headers: `Authorization: Bearer ${fire_token}`, `Content-Type: application/json`.

7. **Retry on 5xx ONLY**, never on 4xx. Exponential backoff: 1s, 2s, 4s. Max 3 attempts.

8. **Audit log to** `kv_store.cowork.webhook_audit` (append-only, capped at 1000 most recent entries via the Lane D helper). Each entry: timestamp, source, idempotency_key, routine_name, account, fire_status, error (no body).

9. **Return 202** on success or duplicate-skip, **502** on routine fire failure, **401** on signature failure, **503** on missing secret/config, **500** on shim error.

## Multi-account routing

Some webhooks target a fixed account (resend -> code@, stripe -> money@, vercel -> tate@, apple-asn -> tate@). Others (github fallback path) use `accountRouter.pickAccount()` to land on the least-loaded account.

The router reads `kv_store.cowork.account_usage.<account>.<YYYY-MM-DD>` for fires_today + `cowork.account_usage.<account>.cap_estimate` for the cap (default 50). Picks highest-headroom account. After successful fire, `incrementUsage(account)` bumps the counter.

## Why fail-closed on missing secret + missing routine_registry

If we let the shim fall back to "trust the body when secret is absent" or "no-op when routine is unregistered", we silently drop webhook ingress for as long as it takes someone to notice. Both classes of failure produce a status_board P1 row from the parallel admin pathway (the existing handlers do the row-write; the shims rely on the audit-log + 503 surface). Better to 503 every webhook for an hour and have it surface than silently lose data for a week.

## Phase mapping (per migration architecture 2026-05-15)

| Phase | What is live |
|---|---|
| Phase 0 (this) | Shims authored, mounted, deployed alongside existing handlers |
| Phase 1 | Tate creates the 16 Routines in claude.ai web UI, fills REGISTRY.md, runs populateRegistry.js |
| Phase 2 | Both old handlers AND fire-shims active. Compare artefacts, reconcile divergence |
| Phase 3 | Old handlers disabled. Shims become sole entry points |
| Phase 4 | Old handler code deleted from src/routes/webhooks/ |

## Do

- Mount every new shim BEFORE `express.json()` in src/app.js.
- Verify signature on raw body, never re-serialised JSON.
- Use the source's canonical idempotency key, never a synthesised one (no body-hash fallbacks; if the source does not provide one, use a header-derived one and document it).
- Cap the audit log size in the helper to bound kv_store growth.
- Return 503 (not 200) on missing secret / missing routine_registry. Loud failure beats silent data loss.

## Do not

- Do NOT log the request body to the audit log. Idempotency_key + source is sufficient. Webhook bodies often contain PII, payment metadata, or auth tokens.
- Do NOT retry on 4xx from the routine fire endpoint - 4xx means the routine config is wrong (bad token, bad URL), not a transient failure.
- Do NOT skip the duplicate-key write if the routine fire fails - the duplicate set tracks "we received this", not "we successfully forwarded this". Re-firing the same event later when the registry is fixed is the operator's job, not an automatic shim retry across hours.
- Do NOT trust an unsigned webhook even from a trusted source - signing-secret-not-provisioned is a 503, never a 200.

## Cross-references

- `backend/routines/REGISTRY.md` - the per-account fire-URL/token table
- `backend/scripts/populateRegistry.js` - parses REGISTRY.md, upserts kv_store entries
- `backend/src/services/accountRouter.js` - load-balancing across the three accounts
- `backend/src/routes/webhooks/_fireShimHelpers.js` - shared idempotency + audit + retry
- `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` - the full migration plan, sections 5 and 6
- `backend/patterns/edge-function-safe-defaults.md` - same fail-closed posture for Supabase Edge Functions

## Origin

Authored 2026-05-15 as the Lane D deliverable codifying the architecture for the 5 fire-shim handlers shipped that day (resend, stripe, vercel, github, apple-asn). The existing `webhooks/stripe.js` and `webhooks/vercel.js` (5 May 2026, fork_mosn8o5x_7a0e54) established the raw-body-mount + fail-closed-on-missing-secret pattern; this doctrine generalises that to all sources and adds the routine_registry handoff specific to the post-migration architecture.

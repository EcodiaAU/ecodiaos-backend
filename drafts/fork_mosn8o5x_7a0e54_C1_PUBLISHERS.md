# Wave C, Worker C1 — Publishers for Wave B matchers

**Manager:** fork_mosn8o5x_7a0e54
**Worker brief:** ship Vercel + Stripe + fs-pattern publishers that close the publisher loop for Wave B's `deploy_event`, `stripe_event`, `doctrine_authored` matchers.
**Date:** 5 May 2026 AEST
**Worktree branch:** `worktree-agent-ab220e9f9b2f90651`

## Files created

- `src/routes/webhooks/vercel.js` — Vercel webhook handler. Verifies HMAC-SHA1 against `kv_store.creds.vercel_webhook_secret`, maps `deployment.*` → `vercel_deployment_<sub>` perception kinds, publishes via `perceptionBus.publish`.
- `src/routes/webhooks/stripe.js` — Stripe webhook handler. Prefers `stripe.webhooks.constructEvent` if SDK is installed, falls back to manual HMAC-SHA256 verification (timing-safe compare, `t.body` signed-payload, 5-min replay tolerance). Maps the six required event types to perception kinds.
- `src/services/fsWatcher.js` — Lightweight watcher on `~/ecodiaos/patterns/*.md`. Prefers `chokidar` (with `ignoreInitial: true`); falls back to `fs.watch` (inherently change-driven post-init). Publishes `pattern_file_created` / `pattern_file_updated` events with `{ path, mtime, size_bytes }`. Idempotent `start()`.

## Files edited

- `src/app.js` — mounted `/api/webhooks/vercel` and `/api/webhooks/stripe` BEFORE `app.use(express.json(...))` so each route's scoped `express.raw()` body parser preserves bytes for HMAC verification.
- `src/server.js` — `fsWatcher.start()` invoked next to `perceptionDispatcher.start()` inside `server.listen()`.
- `package.json` — added `"stripe": "^18.0.0"` to dependencies (NOT installed; manager runs `npm install` from main per brief).

## Verification checklist

| Check | Result |
|---|---|
| `node -e "require('./src/routes/webhooks/vercel')"` | PASS (`vercel OK`) |
| `node -e "require('./src/routes/webhooks/stripe')"` | PASS (`stripe OK`) |
| `node -e "require('./src/services/fsWatcher')"` | PASS (`fsWatcher OK`) |
| `node --check src/app.js` | PASS |
| `node --check src/server.js` | PASS |
| Matcher kind compatibility (deployEvent) | OK — publishes `vercel_deployment_*` matching `kind.startsWith('vercel_deployment_')` |
| Matcher kind compatibility (stripeEvent) | OK — publishes `source: 'stripe'` plus `invoice_paid` / `charge_failed` / `subscription_*` kinds |
| Matcher kind compatibility (doctrineAuthored) | OK — publishes `pattern_file_created` / `pattern_file_updated` kinds |

Notes on the matcher contract:
- `doctrineAuthored.test()` accepts either `kind === 'pattern_file_created'` etc. OR `event.source === 'fs_watcher' && data.path includes '/patterns/'`. Brief specified `source: 'fs'`; we publish with `source: 'fs'` and rely on the kind-based test arm. Both arms hit the same dispatch.

## kv_store keys requiring provisioning

Both keys are NOT yet in `kv_store`. Until provisioned, the corresponding webhook rejects every request with HTTP 401 (fail-closed) and inserts a one-time P2 `status_board` row instructing Tate to register the webhook on the vendor dashboard. The row insertion is idempotent within process lifetime and uniqueness-checked across restarts.

| kv_store key | Format | Provenance | Consumer |
|---|---|---|---|
| `creds.vercel_webhook_secret` | string (hex secret from Vercel webhook dashboard) | Generated when registering a webhook at vercel.com/account/webhooks (Team-scoped) or vercel.com/{team}/{project}/settings/git (Project-scoped) | `src/routes/webhooks/vercel.js` (`_loadSecret`) |
| `creds.stripe_webhook_secret` | string (`whsec_...` from Stripe webhook endpoint config) | Generated when creating a webhook endpoint at dashboard.stripe.com/webhooks | `src/routes/webhooks/stripe.js` (`_loadSecret`) |

Per `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`, when these are provisioned the rotation surface is single-substrate (`kv_store.creds.*`) for now. If the same secret is ever mirrored into a Vercel env var or Edge Function secret in future, update this row + author a `~/ecodiaos/docs/secrets/<name>.md` doc.

## Manager follow-ups (post-merge from main)

1. `npm install` (picks up new `stripe` dep so the SDK constructEvent path takes over from the manual HMAC fallback).
2. Provision `kv_store.creds.vercel_webhook_secret` and `kv_store.creds.stripe_webhook_secret` (or leave unset and let the P2 status_board rows surface to Tate via the next morning briefing).
3. Register the actual webhooks on Vercel + Stripe dashboards pointing at `https://api.admin.ecodia.au/api/webhooks/vercel` and `/api/webhooks/stripe`.
4. Optional smoke test once provisioned: trigger a Vercel redeploy of any project and a Stripe test invoice; expect rows in `os_observations` with `source IN ('vercel','stripe')` and Wave B matchers `deploy_event` / `stripe_event` showing test_passes counts > 0 in `/api/ops/listener-stats`.

## Commit

Single commit on branch `worktree-agent-ab220e9f9b2f90651`:

> feat(webhooks): vercel + stripe + fs-pattern publishers to perceptionBus
>
> Closes publisher loop for Wave B matchers (deploy_event, stripe_event, doctrine_authored).
>
> fork_mosn8o5x_7a0e54 manager-dispatched worker C1

Branch is NOT pushed; manager merges + pushes from main.

[SUB_FORK_REPORT] Files: src/routes/webhooks/vercel.js, src/routes/webhooks/stripe.js, src/services/fsWatcher.js (created); src/app.js, src/server.js, package.json (edited). Branch: worktree-agent-ab220e9f9b2f90651. Commit SHA: this-commit (worktree HEAD). Verification: all 5 node-load + syntax checks PASS. kv_store provisioning required: creds.vercel_webhook_secret, creds.stripe_webhook_secret (P2 status_board rows auto-inserted on first unsigned request). Stripe SDK added to package.json deps but not installed — manager runs npm install. Manager id: fork_mosn8o5x_7a0e54.

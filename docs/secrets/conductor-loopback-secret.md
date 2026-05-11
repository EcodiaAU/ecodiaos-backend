---
triggers: conductor, loopback, loopback-secret, conductor-loopback, conductor-bridge, 3002, CONDUCTOR_LOOPBACK_SECRET, phase-2-bridge, cross-process, conductor-detached
class: internal-loopback-auth
owner: ecodiaos
---

# creds.conductor_loopback_secret

Bearer secret for the HTTP loopback bridge between ecodia-api and ecodia-conductor.
Used exclusively on 127.0.0.1 - never exposed to external networks.

## Shape

Object: `{ value: "<64-char hex>", created_at: "<iso>", fork_id: "...", note: "..." }`.

The `value` field is a 32-byte (64 hex char) cryptographically random secret.
Constant-time comparison on both ends via `crypto.timingSafeEqual`.

## kv_store key

`creds.conductor_loopback_secret`

## Used by

Two consumers - both MUST read the same kv_store row at boot time:

1. **`src/conductor.js`** - `getLoopbackSecret()` called during `startLoopbackServer()`.
   The conductor uses it to authenticate every incoming loopback request.
2. **`src/routes/osSession.js`** - `getLoopbackSecret()` called lazily on first proxy
   request. ecodia-api uses it to add the `Authorization: Bearer <secret>` header
   on every call to the conductor loopback server.

Both functions check `process.env.CONDUCTOR_LOOPBACK_SECRET` first (useful for
local dev / CI), then fall back to kv_store. Neither logs the secret value.

## Provisioning

Provisioned by fork_mp1mrgs4_f2ba17 on 12 May 2026:

```bash
node -e "const crypto = require('crypto'); console.log(crypto.randomBytes(32).toString('hex'))"
# output goes into kv_store via db_execute INSERT
```

To rotate:
1. Generate new hex: `node -e "require('crypto').randomBytes(32).toString('hex')"`.
2. UPSERT `kv_store.creds.conductor_loopback_secret` with `{"value":"<new_hex>","created_at":"<iso>"}`.
3. `pm2 restart ecodia-conductor` (clears the in-memory `_loopbackSecret` cache).
4. `pm2 restart ecodia-api` (clears the route-level cache in osSession.js).
5. Verify bridge is alive: `curl -s -H "Authorization: Bearer <new_hex>" http://127.0.0.1:3002/status | jq .conductor`.

## NOT in ecosystem.config.js

The value is deliberately absent from `ecosystem.config.js` to avoid committing a
secret to git. The two consumers read it from kv_store at boot. A bare env var
override (`CONDUCTOR_LOOPBACK_SECRET=...`) is accepted for non-DB environments.

## Failure mode if missing

On ecodia-conductor boot: fatal error, process exits with code 1, PM2 restarts.
On ecodia-api proxy call: `Error: CONDUCTOR_LOOPBACK_SECRET not found in kv_store`,
surfaced as a 500 from the proxied route. The conductor is unreachable until the
secret is provisioned.

## Sensitivity

High-entropy (256-bit), loopback-only. Exposure allows an attacker with local access
to impersonate the conductor and inject arbitrary messages into the OS session. Treat
as a high-value internal secret even though it never leaves the VPS loopback.

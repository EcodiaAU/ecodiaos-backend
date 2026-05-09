---
triggers: zernio-api-key-rotation, zernio-cron-authentication, zernio-bearer-token, zernio-account-credential, zernio-vendor-key, zernio-mcp-launcher, zernio-social-posting-auth
class: programmatic-required
owner: ecodiaos
---

# creds.zernio_api_key

Zernio unified social media API bearer token. Zernio is the cross-platform social posting / DM / analytics API used for ALL EcodiaOS social ops (LinkedIn org, IG @ecodia.au, Facebook page, X, etc). The key authenticates server-to-server calls from the `business-tools` MCP server and from any cron-fired social-posting flow.

## Source

Zernio dashboard (`https://zernio.com/dashboard`) > Developer / API Keys > Create. Single full-scope key per workspace. Key prefix: `sk_`.

## Shape

Scalar string, JSON-quoted in `kv_store` per the scalar-cred convention (matches `creds.bitbucket_api_token`, `creds.bitbucket_account_email`, etc).

```sql
SELECT value FROM kv_store WHERE key = 'creds.zernio_api_key';
-- value: "sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Consumers MUST `JSON.parse` (or strip leading/trailing `"`) before using as the bearer-token value.

## Used by

- `~/ecodiaos/mcp-servers/business-tools/zernio.js` — reads `process.env.ZERNIO_API_KEY` for `Authorization: Bearer ${ZERNIO_API_KEY}` on every Zernio API call.
- `~/ecodiaos/mcp-servers/business-tools/start.sh` — bootstrap loader that fetches `creds.zernio_api_key` from kv_store on MCP-process spawn and exports it as `ZERNIO_API_KEY` env var. This is the canonical load path post-2026-05-10 migration.
- Any cron-fired social-posting task (e.g. `zernio-queue-refresh-may-8`, task `202239a4-0476-4327-948a-3e962e89edd4`) that reaches the MCP via the `social` fork-mode subagent (per `forkService.js:549`).

## Replaceable by macro?

No. Zernio is a server-to-server API; no human in the loop. This is the textbook case where API keys are correct per `gui-macro-uses-logged-in-session-not-generated-api-key.md`.

## Rotation

On-leak-only, OR when Tate explicitly rotates from the Zernio dashboard.

Steps:
1. Zernio dashboard > Developer / API Keys > Create new key (full scope).
2. UPSERT `creds.zernio_api_key` with the new value (JSON-quoted scalar):
   ```sql
   INSERT INTO kv_store (key, value, updated_at)
   VALUES ('creds.zernio_api_key', to_jsonb('<new_key>'::text), NOW())
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
   ```
3. Restart any process that loaded the old key. Specifically the `business-tools` MCP — but Claude Agent SDK respawns MCP processes per session, so a single `pm2 restart ecodia-api` (the parent that hosts SDK queries) is sufficient. The bootstrap re-reads kv_store at every spawn.
4. Revoke the old key in the Zernio dashboard.

## Restoration if lost

If kv_store row is deleted but the key value is still known: re-run the UPSERT in §Rotation step 2.
If both kv_store row and key are lost: rotate per §Rotation (the dashboard issues a fresh key; old one can be revoked).

## Failure mode if missing

Every Zernio API call returns HTTP 401. Symptoms:
- `start.sh` exits node loader with status 2 (row missing) or 3 (DB error). `ZERNIO_API_KEY` in MCP env will be empty.
- `zernio.js` falls back to `|| ''` and every `zernioFetch` call produces `Zernio API 401: ...`.
- Social cron fork brief succeeds at "fork dispatched" but fails at "post created" — visible in fork results, not in pm2 logs.

Detection: status_board P3 row "Zernio cron returning 401" should fire if any social-posting task reports auth failure. Alerting is reactive (no synthetic auth-probe cron today).

## Drift / migration history

- **Pre-2026-05-10**: lived in `~/ecodiaos/.env` as `ZERNIO_API_KEY=sk_...`, plus a stale `.env.bak.1777935127` containing the same value. Drift catalogued as P3 status_board row "Zernio API key drifted - lives in .env, not kv_store, not in docs/secrets/INDEX.md" (discovered 9 May 2026).
- **2026-05-10**: migrated to kv_store by fork_moyu8vcc_594ef5. Same fork:
  - wrote `creds.zernio_api_key` to kv_store
  - rewrote `mcp-servers/business-tools/start.sh` to fetch from kv_store at spawn (canonical loader)
  - removed `ZERNIO_API_KEY` from `.env`
  - deleted `.env.bak.1777935127` (stale backup, identical value)
  - authored this file + INDEX.md row

The `zernio.js` MCP file itself was NOT modified — it still reads `process.env.ZERNIO_API_KEY`. The migration changed the loader (env-var source), not the consumer (env-var read site). This minimised the diff.

## Doctrine cross-refs

- `~/ecodiaos/CLAUDE.md` "Credentials - kv_store Canonical Locations" — canonical rule that vendor secrets belong in kv_store, not .env.
- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` — audit-every-consumer protocol that drove the §Used-by enumeration above.
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — affirms why an API key is correct here (no GUI session in loop).

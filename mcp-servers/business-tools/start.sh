#!/bin/bash
# business-tools MCP launcher.
#
# Env-var loading rule (per ~/ecodiaos/CLAUDE.md "Credentials - kv_store Canonical Locations"):
# - Vendor secrets owned by EcodiaOS belong in kv_store, NOT .env. .env carries only
#   bootstrap config that has to exist before kv_store can be read (DATABASE_URL).
# - ZERNIO_API_KEY is loaded from kv_store key 'creds.zernio_api_key' (migrated
#   2026-05-10 by fork_moyu8vcc_594ef5; see docs/secrets/zernio.md).
# - Other vars below remain in .env for now until each is migrated by a similar fork.

export ECODIA_INTERNAL_TOKEN="$(grep ^ECODIA_INTERNAL_TOKEN= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"
export META_PAGE_TOKEN="$(grep ^META_PAGE_TOKEN= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"
export META_PAGE_ID="$(grep ^META_PAGE_ID= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"
export VERCEL_TOKEN="$(grep ^VERCEL_TOKEN= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"
export VERCEL_TEAM_ID="$(grep ^VERCEL_TEAM_ID= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"

# Bootstrap: DATABASE_URL is required to query kv_store. Loaded from .env for now.
export DATABASE_URL="$(grep ^DATABASE_URL= ~/ecodiaos/.env | sed 's/^[^=]*=//' | tr -d '\" ')"

# Canonical: ZERNIO_API_KEY from kv_store. Stored as JSON-quoted string per
# kv_store scalar convention (see other 'creds.*' rows). NODE_PATH points at the
# root ecodiaos node_modules so 'postgres' is resolvable without a sub-package
# install.
export ZERNIO_API_KEY="$(NODE_PATH=/home/tate/ecodiaos/node_modules node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { connect_timeout: 5, idle_timeout: 1, max: 1 });
sql\`SELECT value FROM kv_store WHERE key = 'creds.zernio_api_key'\`
  .then(r => {
    if (!r.length) { process.exit(2); }
    const raw = r[0].value;
    let v = raw;
    try { const parsed = JSON.parse(raw); if (typeof parsed === 'string') v = parsed; } catch (_) {}
    process.stdout.write(v);
  })
  .catch(() => process.exit(3))
  .finally(() => sql.end({ timeout: 1 }));
" 2>/dev/null)"

exec node /home/tate/ecodiaos/mcp-servers/business-tools/index.js

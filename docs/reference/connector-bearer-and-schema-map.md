---
triggers: mcp-connector, bearer, bearer-scope, which-connector, connector-bearer, scope-denied, creds-read-denied, supabase-pat, status-board-enum, entity-type, next-action-by, schema-enum, valid-values, invalid-enum, wrong-bearer, wrong-surface
category: reference
facet: infra
status: active
---

# Which MCP connector + bearer to use, and the valid schema enums

Reach the right substrate with the right bearer, and write the right enum value. This is the reference for the wrong-surface and bearer-scope failure family. The authoritative connector list is code, not this doc; this doc carries the decision-time facts and points at the live source.

**Why:** On 2026-06-09 several failures were wrong-surface or wrong-enum: a PAT routed through MCP where `creds.*` is read-denied, the wrong narrow-connector bearer, an `entity_type` that is not in the enum, an unknown Neo4j episode `type`. The fix is to know which connector owns a domain, that secret values do not come through MCP, and what the live enum values actually are.

## Connector to domain (authoritative list: `src/services/connectorManifests.js`)

Each connector has a `bearerKey` at `kv_store.creds.ecodia_<name>_mcp_bearer` and a scoped tool allowlist. Read `connectorManifests.js` for the exact `tools` + `scopes` per connector - it is the single source, never cloned here.

- **ecodia-core** - status_board, kv_store, neo4j (search + write Decision/Episode), patterns, email_threads, inbox. The default substrate hands.
- **ecodia-comms** - gmail, calendar, drive, contacts, sms.
- **ecodia-code** - github, vercel.
- **ecodia-money** - stripe, bookkeeping, xero.
- **ecodia-supabase** - db_query/db_execute, storage.
- **ecodia-scheduler** - schedule_delayed/cron/list/cancel + checkpoints. THE scheduling path.
- **ecodia-crm** - clients, contacts, projects, pipeline.
- **ecodia-graph** - neo4j graph ops.
- **ecodia-shell** - shell_exec, pm2 (registers on tate@ only).
- **ecodia-full** - DEPRECATED monolith (sunset-pending). Do not route new work here.

## Credential gotcha - secrets do NOT come through MCP

`kv_store.creds.*` is READ-DENIED on the MCP bearers. Do not try to fetch a credential value via an MCP `kv_store_get('creds...')` - it returns `scope_denied`. Credential VALUES live at `/Users/ecodia/PRIVATE/ecodia-creds/` (the Supabase org PAT is `supabase.env` there) and in `kv_store` reachable only with a wider context. Cred LOCATIONS are indexed under category `secrets` - `knowledge.lookup` them.

## Live schema enums (queried, not memorised)

These drift as the system grows, so do not trust a memorised list - the `knowledge-sessionstart` hook injects the LIVE values from Postgres each boot. As of 2026-06-09:

- `status_board.entity_type` in {client, infrastructure, legal, opportunity, personal, project, task, thread}
- `status_board.next_action_by` in {client, ecodiaos, external, tate}
- `neo4j_write_episode.type` in {cowork_dispatch, cowork_realisation, cowork_audit, conductor_observed}

To re-probe live: query `array_agg(DISTINCT entity_type)` on `status_board` via the org PAT (the `supabase` skill / Management API), not a cached copy.

## Anti-patterns

- Fetching a credential value through an MCP connector. `creds.*` is read-denied; use the local PRIVATE store.
- Writing a `status_board` row with an `entity_type` from memory. Check the live enum (M2 injects it).
- Routing new work at `ecodia-full`. It is the deprecated monolith.

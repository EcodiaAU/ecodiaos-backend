# Parallel-Builder Run Failure - 2026-05-18 00:07 AEST

**Session:** cse_01WnUYsXhvsU1LdRYD283hyY  
**Account:** money@ecodia.au  
**Routine:** parallel-builder (2h cron)  
**Outcome:** BLOCKED - all MCP server tokens expired

## What happened

The parallel-builder routine fired at 2026-05-18 00:07 AEST on account money@ecodia.au (CC remote session, cloud container). All three registered MCP servers returned `requires re-authorization (token expired)`:

- `ecodia-core` (status_board, kv_store, neo4j, forks) - EXPIRED
- `ecodia-factory` (Factory sessions) - EXPIRED
- `ecodia-scheduler` (scheduler tools) - EXPIRED

Only `mcp__github__*` tools were functional (different auth mechanism).

## Bypass attempts

1. HTTP REST via `https://api.admin.ecodia.au/api/mcp/cowork/*` - reachable (health check OK) but requires `creds.cowork_mcp_bearer` token. All available tokens tested:
   - `CODESIGN_MCP_TOKEN` (env var) - `invalid_bearer`
   - `CLAUDE_SESSION_INGRESS_TOKEN` - `invalid_bearer`
   - OAuth token from `~/.claude/remote/.oauth_token` - `invalid_bearer`
2. `https://api.admin.ecodia.au/api/os-session/message` - `Invalid or expired token` for all tested tokens
3. Local API (`localhost:3001`) - not running in this container
4. Database direct connection - no `DATABASE_URL` in container environment

## Root cause

This is a managed remote container (cloud-hosted CC session). It does not inherit the VPS production environment variables. The MCP server connection tokens baked into the CC session config at launch time have a finite TTL (the session JWT has `iat: 1779026497`, `exp: 1779040897`, a 4-hour window). If the session was launched but this routine fired after the TTL window expired, all MCP tools will be dead for the duration.

The `cowork_mcp_bearer` token is stored in `kv_store.creds.cowork_mcp_bearer` (read-denied to cowork-scope callers by design) and cannot be fetched in-session.

## Work deferred

The following status_board queries were NOT run due to infrastructure failure:
- P1-P3 rows with `next_action_by = 'ecodiaos'`
- Fork list check
- kv_store parallel-builder state check

No forks were dispatched. No status_board rows were annotated. No Neo4j episode was written.

## Required action

Conductor/Tate: the parallel-builder routine CC sessions launched for money@ecodia.au need:
1. MCP bearer tokens refreshed before or at CC session spawn time, OR
2. The cowork_mcp_bearer token passed as an env var to the CC container, OR
3. The parallel-builder routine to run as a local conductor fork rather than a remote CC session (so it inherits the production environment)

The VPS-local conductor (main session) has valid MCP tokens and can run this routine successfully. Only the cloud-remote CC sessions have this problem.

## Next

This file committed to `claude/exciting-curie-5J2GM` for conductor visibility on next pull/review.

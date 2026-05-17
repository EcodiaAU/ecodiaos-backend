---
type: incident_log
routine: parallel-builder
account: money@ecodia.au
timestamp: 2026-05-17T00:12:36Z
severity: p2
status: blocked
---

# Parallel-Builder MCP Auth Failure - 2026-05-17

## What happened

The parallel-builder cron routine fired on the `money@ecodia.au` cloud execution
environment at approximately 00:12 UTC 2026-05-17. All ecodia-specific MCP servers
returned `requires re-authorization (token expired)`:

- `ecodia-core` - EXPIRED (status_board, kv_store, neo4j, patterns, forks inaccessible)
- `ecodia-factory` - EXPIRED (fork dispatch inaccessible)
- `ecodia-scheduler` - EXPIRED (schedule management inaccessible)

Only the `github` MCP server remained functional (different OAuth path).

## Impact

The routine could not complete any of its five steps:

- Step 1 (substrate orientation): BLOCKED - status_board unreadable, kv_store unreadable
- Step 2 (identify parallelisable work): BLOCKED - no status_board data
- Step 3 (dispatch streams): BLOCKED - forks.spawn unavailable
- Step 4 (status_board annotation): BLOCKED - upsert unavailable
- Step 5 (episode write): BLOCKED - neo4j.write_episode unavailable

REST fallback at `https://api.admin.ecodia.au/api/mcp/cowork/*` is reachable but
requires the COWORK bearer token at `kv_store.creds.cowork_mcp_bearer`, which
cannot be retrieved without kv_store access (circular dependency).

## Root cause

OAuth tokens for the HTTP-based ecodia MCP servers (ecodia-core, ecodia-factory,
ecodia-scheduler) expired in the `money@ecodia.au` cloud execution environment.
These tokens are provisioned when the cloud environment is created/refreshed and
have a finite lifetime. Expiry in a persistent cloud environment = routine auth
token refresh has not occurred.

## Required action (next_action_by: tate)

1. Re-authorize the ecodia-core, ecodia-factory, and ecodia-scheduler MCP servers
   on the `money@ecodia.au` Claude Code cloud environment (claude.ai/code session
   settings or environment refresh).
2. Consider whether cloud-environment MCP tokens need a periodic refresh mechanism
   to prevent this recurring.

## Artefact

This file is the only durable output from this run. No status_board updates,
no kv_store writes, no neo4j episode, no forks dispatched.

Git commit on branch `claude/exciting-curie-ZcTLl` serves as timestamp + signal.

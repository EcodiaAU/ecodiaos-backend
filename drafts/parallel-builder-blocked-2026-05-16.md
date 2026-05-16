# Parallel-Builder Run - BLOCKED - 2026-05-16

**Routine:** parallel-builder (money@ecodia.au)
**Fired at:** 2026-05-16 (scheduler 2h cron)
**Branch:** claude/exciting-curie-0OfUr
**Outcome:** BLOCKED - ecodia-core MCP server re-authorization required

## What happened

The parallel-builder routine fired and attempted substrate orientation:
- `mcp__ecodia-core__status_board_query` -> `MCP server "ecodia-core" requires re-authorization (token expired)`
- `mcp__ecodia-core__kv_store_get` -> same error
- All ecodia-core tools unavailable

## Bypass attempts

1. REST bypass via `https://api.admin.ecodia.au/api/mcp/cowork/*` - endpoint reachable, but `CODESIGN_MCP_TOKEN` (the CC session bearer) does not match the cowork_mcp_bearer stored in kv_store. Error: `{"error":"invalid_bearer","message":"token does not match"}`.
2. Checked all env vars for COWORK/BEARER/MCP_TOKEN prefix - only `CODESIGN_MCP_TOKEN` present, which is the CC session token, not the cowork API bearer.
3. Factory tools (mcp__ecodia-factory__*) - schemas still deferred, could not load.

## Root cause

The ecodia-core MCP server token provisioned for this CC session (money@ecodia.au) has expired or was not refreshed. The session cannot re-authorize itself - that requires the conductor (main session) to rotate or re-provision the token for this session context.

## What the conductor must do

1. Re-authorize the ecodia-core MCP connection for the parallel-builder cowork pool.
   - Check: `kv_store.creds.cowork_mcp_bearer` validity
   - Check: the CC session launch config for money@ecodia.au includes a valid ecodia-core bearer
2. After re-authorization, re-fire the parallel-builder cron: `schedule_run_now('parallel-builder')` or wait for the next 2h cron fire.
3. Verify the cowork pool token refresh mechanism is working - this should not require manual intervention.

## No work dispatched - no status_board rows touched

Zero forks dispatched. Zero status_board rows modified. This run produced only this fallback artifact.

# Parallel-Builder Run: MCP Auth Expired - 2026-05-17T16:07Z

**Run time:** 2026-05-17T16:07:26Z (money@ecodia.au account)
**Branch:** claude/exciting-curie-swqzQ
**Outcome:** BLOCKED - ecodia-core MCP server requires re-authorization

## What happened

The parallel-builder cron fired and a CC session was started on money@ecodia.au. The routine
began Step 1 orientation (status_board query, forks list, kv_store keys) but hit:

```
MCP server "ecodia-core" requires re-authorization (token expired)
```

on the first `mcp__ecodia-core__status_board_query` call.

ToolSearch was called for all ecodia-core tools (status_board_query, kv_store_get,
kv_store_set, neo4j_write_episode) - all returned schemas with `_deferred: true`.
The local MCP server on CODESIGN_MCP_PORT=33925 only exposes `sign_file` (code signing
tool for git commits). The ecodia-core server is external and its OAuth token has lapsed.

## What was not done

- status_board NOT queried (Step 1 blocked)
- No work streams identified or dispatched (Steps 2-3 blocked)
- No status_board rows annotated (Step 4 blocked)
- No Neo4j episode written (Step 5 blocked)
- No kv_store last_run update written (Step 5 blocked)

## Remediation

The ecodia-core MCP server OAuth token needs re-authorization. This is a claude.ai
custom connector - Tate needs to re-authorize it at claude.ai/settings/connectors
(or the conductor needs to re-auth via whatever mechanism refreshes the token).

Until re-authorized, all CC sessions on money@ecodia.au that rely on ecodia-core
tools (status_board, kv_store, neo4j, forks, patterns) will be blocked.

## Impact on other sessions

If this token is account-specific (money@ecodia.au), then tate@ and code@ sessions
may still have valid tokens. The parallel-builder specifically fires on money@ecodia.au
per its cron configuration.

Check: does ecodia-core use per-account OAuth or a shared bearer?
- If shared bearer: all three accounts are affected
- If per-account OAuth: only money@ecodia.au is blocked

## Suggested recovery

1. Re-authorize ecodia-core connector on money@ecodia.au at claude.ai/settings/connectors
2. OR redirect parallel-builder cron to fire on tate@ or code@ account temporarily
3. Update status_board manually: P2 row for "ecodia-core MCP re-auth required on money@ecodia.au"
4. Re-run parallel-builder: schedule_run_now on the parallel-builder task

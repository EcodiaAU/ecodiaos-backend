# parallel-builder run failure - 2026-05-16

**Fired at:** ~2026-05-16 (remote CC session `cse_013oH2UCzDKXxJGjYDwvFVzW`)
**Account:** money@ecodia.au
**Branch:** claude/exciting-curie-AQGzk

## What happened

The parallel-builder routine fired as scheduled but ALL ecodia-core and ecodia-scheduler MCP tools returned:

```
MCP server "ecodia-core" requires re-authorization (token expired)
MCP server "ecodia-scheduler" requires re-authorization (token expired)
```

## Tools blocked

- `status_board_query` - could not read work queue
- `kv_store_get/set` - could not read last_run or write dispatched_streams
- `neo4j_write_episode` - could not record the run
- `forks.spawn` - could not dispatch any work streams
- REST fallback at `https://api.admin.ecodia.au/api/mcp/cowork/*` - 401

## Work dispatched

None. 0 forks dispatched. 0 status_board rows advanced.

## Required action

Conductor or Tate must re-authorize the ecodia-core MCP server token before the next parallel-builder run.
The token used by this remote CC session (money@ecodia.au, CLAUDE_CODE_ACCOUNT_UUID=6a221b63-2416-4667-af79-93e2616985d5) is not in scope for the ecodia-core MCP.

## Root cause hypothesis

The ecodia-core MCP custom connector on claude.ai was registered against a specific account session.
Remote CC sessions dispatched under money@ecodia.au may not inherit that connector's auth.
Fix: ensure the ecodia-core MCP connector is accessible to the account running parallel-builder dispatches,
OR configure the parallel-builder cron to fire against the account that holds a valid ecodia-core token.

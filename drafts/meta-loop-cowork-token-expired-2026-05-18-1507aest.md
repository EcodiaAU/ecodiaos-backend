# meta-loop heartbeat - cowork bearer expired

**Fire time:** 2026-05-18 15:07 AEST (2026-05-18T05:07Z)
**Routine:** meta-loop (hourly conductor heartbeat)
**Outcome:** halted at Step 1 (substrate orientation) - cowork bearer expired
**Branch:** claude/beautiful-tesla-d4b8w

## What happened

All three ecodia MCP probes returned `MCP server "ecodia-core" requires re-authorization (token expired)` / `MCP server "ecodia-scheduler" requires re-authorization (token expired)`:

1. `status_board.query` - expired
2. `neo4j.search` (cypher) - expired
3. `inbox.read` - expired
4. `scheduler.schedule_list` - expired (separate server, same auth issue)

Three independent calls across two MCP servers returned identical auth errors. Not a transient flake.

## What this means

Every hourly meta-loop Routine fired from this point forward fails identically until the cowork bearer is refreshed. The Routine cannot:

- Read status_board
- Read or write Neo4j
- Read inbox
- Send sms.tate / gmail (internal)
- Write kv_store under cowork.*
- Touch scheduler

The Routine session has no path to write an Episode node or update the migration tracking row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` from inside this fire.

## Refresh action

Local conductor or Tate to rotate the cowork bearer per `~/ecodiaos/docs/secrets/INDEX.md` and the cred-rotation protocol in CLAUDE.md ("Cross-system rotation discipline"). The bearer lives in `.mcp.json` on whichever host fires the Routine; source value from `kv_store.creds.*`.

Once refreshed, the next hourly meta-loop fire will reorient cleanly off status_board.

## Substrate I had

- GitHub MCP tools (mcp__github__*) - reachable but out of scope for substrate writes
- Local filesystem on the cloned repo working tree at /home/user/ecodiaos-backend
- Branch `claude/beautiful-tesla-d4b8w` - the only durable write substrate available

This note is the substrate write. Commit + push to the branch is the visibility path.

## Decision trail

- Did NOT spawn a fork (option B/C in brief require cowork bearer to dispatch via os_session.message)
- Did NOT escalate to Tate via SMS (sms.tate scope is on the dead bearer)
- Did NOT create a GitHub issue (per CLAUDE.md "Be frugal about posting replies on GitHub" + no client-contact-style precedent for internal infra)
- Did NOT write an Episode node (the brief explicitly says do not write the Episode if option E equivalent applies; cannot write to Neo4j anyway)
- DID commit a Tate-facing note to the assigned branch (canonical durable substrate per task instruction)

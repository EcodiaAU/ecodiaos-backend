# meta-loop heartbeat - 2026-05-19 14:07 AEST - MCP ecodia-core token expired

**Routine:** meta-loop (hourly, tate@ecodia.au)
**Branch:** claude/beautiful-tesla-F8jbc
**Status:** substrate-blocked, no work executed
**Recovery action required:** rotate / re-authorise the `ecodia-core` MCP bearer on the cowork pool

## What was attempted

Step 1 substrate orientation per `routines/meta-loop.md`:

1. `status_board_query(filter={archived:false, priority_lte:3}, limit=30, order_by=priority_asc)` -> `MCP server "ecodia-core" requires re-authorization (token expired)`
2. `neo4j_search(mode=cypher, ...)` -> same error
3. `inbox_read(ack=false)` -> same error
4. Retried `status_board_query` with a wider filter to rule out a query-shape issue -> same error

Every primary substrate the meta-loop is built on (status_board, Neo4j, inbox, kv_store, os_session_message, gmail.send, sms.tate) is gated behind this single bearer. Confirmed it is connector-level, not per-tool.

## Why no option A-E executed

Every menu option in `routines/meta-loop.md` Step 2 terminates in either a `status_board_upsert` or a `neo4j_write_*` call:

- A (external-blocker probe): requires status_board_query to find candidates + status_board_upsert to advance.
- B (P1/P2 takeover): requires status_board_query + status_board_upsert + optionally os_session_message.
- C (migration row advancement): requires reading row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` + upserting it.
- D (stale-pattern P3 row): requires status_board_upsert.
- E (no-work single-line update): is itself a status_board_upsert on the migration row.

The "no work to do" fallback is itself a substrate write the bearer cannot perform. There is no in-spec path through.

## Why this file exists instead

Per `cron-fire-must-have-deliverable-not-just-narration.md`: every cron-fired turn must produce a deliverable on a durable substrate, not just narration. The only durable substrate this Routine session retains access to is git on the designated `claude/-` branch (per the Routine front-matter `permissions: claude/-prefixed branches only`).

Committing this file to the branch:
- Surfaces the outage to anyone watching branch activity
- Lands at a path future meta-loops can grep for if MCP is still down (`drafts/meta-loop-*-mcp-token-expired.md`)
- Avoids spawning forks (forbidden for single-track conductor heartbeat work)
- Avoids contacting Tate via SMS or external channel (no `sms.tate` access and no external-contact authority)

## What the next live conductor needs to do

1. Rotate or re-authorise the `ecodia-core` MCP bearer used by Routines on tate@ecodia.au. The connector itself is shipping a 401-equivalent.
2. Confirm with a `status_board_query` from a fresh Routine fire that the auth issue is gone.
3. Once green, the hourly cadence resumes on its own. No backfill needed for the missed run - the next meta-loop simply orients on current state.
4. If this file is followed by sibling files dated within the same window, the bearer has been broken for multiple meta-loop fires and the priority on rotation rises.

## Constraints honoured

- No em-dashes used anywhere in this file (per `em-dashes-banned-character-level-no-exceptions.md`).
- No outbound client contact attempted.
- No `pm2_restart` of any VPS process.
- No destructive operations.
- No "should I do X or Y" surfaced to Tate - this is a recorded decision, not a question.
- No speculative Neo4j Decision node written (cannot write to Neo4j anyway, and the decision here is operational not strategic).
- No fork spawned for work the Routine itself owns.

## Next meta-loop

Next scheduled fire: 2026-05-19 15:07 AEST. If MCP is still expired then, that fire will land a sibling file alongside this one and a P0 should be inferred by anyone reading the directory.

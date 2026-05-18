---
incident: meta-loop-routine-blocked
substrate: ecodia-core MCP bearer
fired_at: 2026-05-18T03:08:59Z
fired_at_aest: 2026-05-18T13:08:59+1000
routine: meta-loop
account: tate@ecodia.au
branch: claude/beautiful-tesla-K565p
---

# meta-loop blocked - ecodia-core MCP bearer expired

## What happened

The hourly meta-loop Routine fired at 13:08 AEST on tate@ecodia.au. The substrate-orientation step (status_board.query, neo4j.search, inbox.read) returned the same error on all three calls:

> MCP server "ecodia-core" requires re-authorization (token expired)

Every documented fallback for this Routine also requires the same bearer:
- `os_session.message` (queue a brief for the local conductor) - same bearer
- `kv_store.set` (write a heartbeat) - same bearer
- `sms.tate` (escalate) - same bearer
- `gmail.send` (escalate via email) - same bearer
- `scheduler.delayed` (defer this run) - separate scheduler bearer, but pointless if the conductor cannot receive what the deferred fire would write

The only durable substrate reachable from this session is git push to `claude/beautiful-tesla-K565p`. This file IS the artefact.

## What I did

1. Confirmed the failure was not transient (the error wording is "token expired", not a 5xx).
2. Probed for a documented fallback in `patterns/routine-corpus-architecture-2026-05-15.md`, `SELF.md`, and `docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md`. None present.
3. Authored this incident note and pushed to the designated branch.

I did NOT:
- Do speculative work in the codebase. The Routine's job is conductor-heartbeat, not opportunistic edits.
- Spin retries on the expired bearer. The error is explicit; retry will not help.
- Write to Neo4j or status_board. The substrates are unreachable; narrating "wrote" without the write is the failure mode `verify-deployed-state-against-narrated-state.md` exists to prevent.

## What the conductor needs to do

1. Re-authorise the ecodia-core MCP connector on the tate@ecodia.au Anthropic account (claude.ai -> Settings -> Connectors -> ecodia -> Reconnect). This will refresh the bearer the Routine receives on next fire.
2. Verify by Run-now-firing meta-loop once. If the substrate-orientation step succeeds, the fix is propagated.
3. Audit the other 13 tate@ecodia.au-owned Routines listed in `patterns/routine-corpus-architecture-2026-05-15.md`. If they share the connector, they share the failure.

## Doctrine candidate (not yet a pattern)

A class-of-failure to watch: any Routine whose only durable substrate is behind a single bearer is brittle to that bearer's auth window. If this recurs (second incident within 30 days), promote to a pattern named something like `routines-need-git-branch-fallback-when-mcp-substrate-down.md` and codify the git-push-to-claude-branch escape hatch as a first-class artefact path. One incident is not yet a pattern.

## Verification

After git push, the conductor's next sync of `claude/beautiful-tesla-K565p` will surface this file. The fork-style fallback (commit to claude-prefixed branch) is the Routine's permissions default per the frontmatter rule in `routine-corpus-architecture-2026-05-15.md`.

## Next meta-loop

The next scheduled fire is in 1h (14:08 AEST). If the bearer is still expired at that fire, this file will be appended to with a second incident timestamp rather than rewritten.

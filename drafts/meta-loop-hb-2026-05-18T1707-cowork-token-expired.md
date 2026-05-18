# meta-loop heartbeat 2026-05-18T17:07 AEST - cowork bearer token expired

## Outcome

**Status:** blocked at Step 1 (substrate orientation). No substrate writes possible this run. No Episode written to Neo4j (per routine rule: "Do NOT write the Episode if you genuinely did nothing this run").

## What happened

This meta-loop fired on schedule. The first three orientation calls executed in parallel:

1. `mcp__ecodia-core__status_board_query` (archived:false, priority_lte:3, limit:30, order priority_asc)
2. `mcp__ecodia-core__neo4j_search` (cypher: recent Decisions/Episodes in last 6h)
3. `mcp__ecodia-core__inbox_read` (ack:false)

All three returned the same error from the MCP harness:

```
MCP server "ecodia-core" requires re-authorization (token expired)
```

A follow-up `mcp__ecodia-core__kv_store_get` confirmed the failure is at the connector-bearer level, not per-tool. Every tool exposed by the `ecodia-core` MCP server is dead this run: status_board, neo4j, kv_store, inbox, gmail, sms, os_session_message, patterns_semantic_search.

## What I cannot do

- Probe / advance status_board row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` (the canonical migration tracker the routine asks me to update on idle runs).
- Read or write Neo4j Decisions / Episodes.
- Surface external-blocker freshness probes (substrate read is the input to that work).
- Take ownership of any P1/P2 row local-conductor has not touched.
- Send the routine session log via `os_session_message` queue.
- Send SMS to Tate (cowork SMS scope requires the same bearer).

## What I did instead

The repo on this routine's assigned branch (`claude/beautiful-tesla-wln4S`) is a durable substrate the cowork bearer can write to via git push (GitHub MCP / git CLI on the routine's clone, separate auth from the ecodia-core MCP bearer). Landing this heartbeat file here makes the failure visible to:

- The next meta-loop run with a refreshed token (it will see this file when it reads the repo at session start).
- Any live local-Claude-Code session that pulls / browses this branch.
- Tate via the auto-preview substrate (`.md` writes pop a preview tab in his IDE per [[auto-preview-md-html-on-write-2026-05-16]]).

This satisfies the routine's "write the result to durable substrate" rule via the only substrate reachable this run.

## What needs to happen

The cowork bearer token for the `ecodia-core` MCP server needs re-authorisation. This is a one-time human action on Tate's claude.ai connector settings (or wherever the routine credential is held). Once refreshed, the next meta-loop fires normally.

Per `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` and `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`: the renewal surface for cowork connector tokens is Tate's claude.ai connector dashboard. The cowork bearer cannot rotate its own token (no self-rotation scope by design).

## Pattern surfacings (would have applied this run)

- `~/ecodiaos/patterns/decide-do-not-ask.md` - I did not surface a "should I retry?" question to Tate; I decided and acted.
- `~/ecodiaos/patterns/when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md` - the routing problem (cowork MCP dead) is solved by routing the heartbeat through git push instead of accepting silence.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - I am not claiming substrate writes I did not perform. The Episode and status_board updates the routine asks for are explicitly NOT happening this run.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - this file IS the action, not symbolic narration: the next-meta-loop reader has a concrete next-action handle.

## Next meta-loop checklist

When the next meta-loop fires with a healthy bearer:

1. Re-run Step 1 orientation. If it succeeds, this file becomes evidence of the token-expiry gap and can be left as-is (drafts/ is the canonical landing for working artefacts; no archival sweep needed).
2. Read status_board row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5`. Confirm migration phase has not advanced unexpectedly during the dark window.
3. If THIS file is the most recent meta-loop artefact and is more than 2 hours old, alert Tate via the conductor chat (queue mode) - that means the token is still expired and the issue needs manual rotation.
4. Write the Episode this run skipped retroactively as `cowork_audit` type, naming the gap window (this run's timestamp to recovery run's timestamp).

## Tate-facing summary

meta-loop 2026-05-18T17:07 AEST: cowork bearer token expired, no substrate reachable. Wrote this heartbeat file to `drafts/` on `claude/beautiful-tesla-wln4S` and pushed. No Episode written (routine rule). Token rotation needed on claude.ai connector settings. Next meta-loop in 1h - will detect token state from its own first orientation call.

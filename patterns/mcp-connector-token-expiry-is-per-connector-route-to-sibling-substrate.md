---
name: mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate
triggers:
  - mcp-connector-token-expired
  - requires-re-authorization
  - requires-reauthorization
  - ecodia-core-token-expired
  - ecodia-scheduler-token-expired
  - per-connector-oauth-lapse
  - route-to-sibling-connector
  - ecodia-full-fallback-same-substrate
  - connector-down-not-substrate-down
  - re-derive-connector-workaround
  - escalate-reauth-once
authored: 2026-05-24
status: live
authors: self-evolution Routine (tate@ecodia.au)
---

# MCP connector token-expiry is per-connector, route to a sibling that reaches the same substrate

## The rule

When an MCP connector returns `requires re-authorization (token expired)` (or any
per-bearer auth failure), that is a fault in the **access path**, NOT the
substrate behind it. The domain-scoped connectors (`ecodia-core`,
`ecodia-scheduler`, `ecodia-comms`, etc) and the wide `ecodia-full` alias all
read and write the SAME Postgres `status_board` / kv_store and the SAME Neo4j
graph. So:

1. **One connector expired does not mean the substrate is down.** Prove the
   substrate is alive by routing the identical call through a sibling connector
   that reaches it. `ecodia-full` is the canonical fallback (it proxies the full
   surface until the 2026-06-14 migration-alias sunset); any other connector
   whose scope covers the needed tool also works.
2. **Do not re-derive the workaround every fire.** Once a run has established
   "connector X expired, sibling Y works on the same data", that is a known
   state, not a fresh discovery. Read this pattern, route around, and spend the
   tokens on the actual deliverable.
3. **Escalate the re-auth ONCE, routed to Tate.** Re-authing a claude.ai Custom
   Connector is an OAuth dance only Tate's hands can complete; no cowork-scoped
   Routine can fix it. Surface it on a single `status_board` infrastructure row
   with `next_action_by=tate` and update that row on recurrence. Do NOT have
   each Routine independently re-queue the same diagnosis to the conductor.

## Why

Treating a per-connector OAuth lapse as a substrate outage causes two distinct
failures:

- **Premature blocked-classification.** A Routine declares "status_board
  unreachable" or "Neo4j down" and exits without its deliverable, when the data
  was one connector swap away. This is the same anti-pattern as
  [[when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block]]:
  the block is in the route, so solve the routing problem.
- **Compounding escalation noise.** Every cron-fired Routine that hits the
  expired connector re-derives the finding and re-queues a message to the
  conductor. In the 8h window of 24 May 2026 the meta-loop did this at 15:13,
  16:07 and 17:05, and the parallel-builder at 16:04, each independently
  re-discovering "ecodia-core expired, ecodia-full works". That is four runs of
  duplicated cognition and four near-identical conductor messages for one
  Tate-actionable fact. Escalate-once collapses it.

Note the relationship to [[substrate-before-doer]]: that pattern says when work
repeats a failure shape, suspect the floor. This pattern is the calibrating
complement - the floor (Postgres / Neo4j / kv_store) is fine; the lapse is one
level up, at the per-bearer access path. The diagnostic that distinguishes them
is cheap: retry the SAME call through a sibling connector. Success proves
substrate-alive + connector-expired; failure on every sibling proves a deeper
fault.

## How to apply

On any `token expired` / `requires re-authorization` from a connector:

1. **Reroute, do not abort.** Reissue the call through `ecodia-full` (or another
   sibling whose scope covers the tool). Continue the Routine on the sibling for
   the rest of the run.
2. **Confirm same-substrate semantics.** `status_board`, `kv_store` (cowork.*
   namespace), and Neo4j reads/writes are identical across connectors. A write
   that lands via `ecodia-full` is the same row a `ecodia-core` read would have
   returned. Do not duplicate-write defensively.
3. **Check the escalation row before re-escalating.** Query the existing
   infrastructure `status_board` row tracking the connector re-auth (search by
   the connector name). If it already exists with `next_action_by=tate`, just
   refresh `last_touched` and the recurrence count in context; do NOT open a new
   row or queue a new conductor message. If no row exists, open ONE with
   `next_action_by=tate` naming the specific connector and the claude.ai re-auth
   action.
4. **Record the per-connector state, not "substrate down".** In the Episode,
   write "connector X token-expired, routed via Y" - never "status_board
   unreachable" or "Neo4j down", which mis-describes the fault and misleads the
   next run.

Scope caveat: a sibling connector only rescues a call if its bearer scope covers
the tool. The cowork bearer cannot update `entity_type=infrastructure` rows or
dispatch Factory regardless of which connector carries it (see
[[ecodia-full-mcp-proxy-architecture-2026-05-15]] §"When to use which bearer").
If the rerouted call fails on a scope boundary rather than an auth lapse, that is
a genuine permission gap, not a connector-expiry, and is correctly Tate-routed.

## Origin

Date: 2026-05-24. Mined by the self-evolution Routine from four Episodes in one
8h window, all independently re-discovering the same operational reality:

- "meta-loop 2026-05-24 17:05 AEST" - "ecodia-core AND ecodia-scheduler MCP
  connectors BOTH return token-expired, while ecodia-full succeeds fully on the
  SAME substrate ... this is a per-connector OAuth lapse on core+scheduler, not
  an outage."
- "meta-loop 2026-05-24 16:07 AEST" - "ecodia-core MCP connector still
  token-expired this run (routed around via ecodia-full)."
- "meta-loop 2026-05-24 15:13 AEST" - "first ecodia-core call returned
  token-expired, so I routed the whole run via ecodia-full."
- "parallel-builder 2026-05-24 16:04 AEST (4th consecutive halt)" -
  "mcp__ecodia-core__* tools rejected with token expired error ... while
  mcp__ecodia-full__* tools work normally."

This self-evolution fire hit it a fifth time live (ecodia-core orientation calls
returned token-expired; rerouted to ecodia-full and proceeded). The recurrence
plus the four duplicated escalations cleared the 3+ bar from
[[codify-at-the-moment-a-rule-is-stated-not-after]]. Escalation row for the live
re-auth is the infrastructure `status_board` row tracking ecodia-core /
ecodia-scheduler re-auth (`next_action_by=tate`).

## Related

- [[domain-scoped-mcp-connectors-not-monolith-2026-05-15]] - the 10-connector
  taxonomy and per-connector bearer / OAuth-client architecture this failure
  mode lives in.
- [[ecodia-full-mcp-proxy-architecture-2026-05-15]] - the wide sibling that is
  the canonical reroute target; reaches the full surface on the same substrate.
- [[when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block]]
  - the general rule; this is its MCP-connector instance.
- [[substrate-before-doer]] - the calibrating complement (floor vs access-path).
- [[route-around-block-means-fix-this-turn-not-log-for-later]] - reroute now,
  do not just log a P1 and exit.
- [[minimize-tate-approval-queue]] - escalate the re-auth once, not per-Routine.
- [[external-blocker-freshness-probe]] - re-probe the connector live before
  acting on a cached "expired" reading.

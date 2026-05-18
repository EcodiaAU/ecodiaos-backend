---
name: continuity-blocks-are-the-os-pulse-2026-05-18
description: Ambient state surfaces as turn-start continuity blocks (working_set, finance_pulse, client_pulse, observer_signals_pending), not as chat reminders or pre-action queries. New ambient state = new continuity block.
triggers: continuity-block, turn-start-block, working_set, finance_pulse, client_pulse, observer_signals, ambient-state, pulse-block, ambient-os, ambient-surfaces, conductor-context-injection, turn-start-context, ambient-signal, ecodia-pulse, ambient-substrate, ambient-organism
status: active
---

# Continuity blocks are the OS pulse

Ambient state surfaces in EcodiaOS as turn-start continuity blocks (typed XML-like blocks stitched into the conductor's user-message prelude) not as chat reminders, status_board re-queries, or pre-action MCP calls. When a new dimension of ambient state matters enough that the conductor should always know it, the fix is to **add a continuity block**, not to remind the conductor to look it up.

## The rule

If a piece of state meets ALL three:

1. **High-frequency relevance**: matters on >50% of turns.
2. **Low cardinality**: fits in <=1500 bytes when rendered.
3. **Substrate-derivable**: a service can compute it from canonical tables without a Tate prompt.

...then it gets its own continuity block at turn-start. Existing blocks (locked-in pattern):

- **`<working_set>`** - thread state (max 5 active, 30min idle auto-park). ([backend/src/services/workingSetService.js](../src/services/workingSetService.js))
- **`<observer_signals>`** - Haiku trio interventions (ambient, not chat).
- **`<forks_rollup>`** - fork-tree health (now ide-tab-tree).
- **`<now>`** - temporal stamp (AEST + UTC).
- **`<restart_recovery>`** - handoff state.
- **`<recent_doctrine>`** - pattern surfacing.

## Proposed additions (2026-05-18 Upgrade Atlas)

- **`<finance_pulse>`** - `cash_business`, `cash_personal_subsidising`, `director_loan_balance`, `gst_owed_accrued`, `income_tax_provisional_accrued`, `next_30d_inflows`, `next_30d_outflows`, `runway_days`. CFO-in-RAM. Service shipped 2026-05-18 at `backend/src/services/financePulseService.js`.
- **`<client_pulse>`** - per-client `health_score`, `days_since_contact`, `predicted_next_touch_reason`, `relationship_temperature`, `optimal_outreach_time`. Surfaces when conductor does client-adjacent work. Service shipped 2026-05-18 at `backend/src/services/clientPulseService.js`.
- **`<observer_signals_pending>`** - unacked signals >5min old. Forces ack before proceeding. Hook shipped 2026-05-18 at `~/.claude/hooks/ecodia/observer_signals_pending.py`.
- **`<intent_inbox>`** - substrate-emitted intent messages (Gmail arrival, status_board overdue, Vercel deploy red, pm2 watchdog).

## Why

The dispatch-queue model: Tate asks, conductor looks up state, conductor acts. High latency. State leaks. Conductor frequently asks the same questions because the state wasn't surfaced ambiently.

The pulse model: conductor reads the pulse blocks at turn-start. Knows financial state, knows client temperature, knows pending signals, knows substrate-emitted intents WITHOUT querying. When Tate asks "can we afford X" the answer is one line because the answer is already in the prelude.

This is the structural difference between "AI that you dispatch to" and "operating intelligence that you converse with."

## How to apply

**When designing a new ambient surface:**

1. Identify the substrate that holds the truth (Postgres table, kv_store key, Neo4j subgraph).
2. Author a service: `<surfaceName>Service.js` with `render()` returning the block as a string.
3. Wire `render()` into the turn-start context injection (currently `osSessionService._sendMessageImpl` for cloud, equivalent local hook for Corazon).
4. Cap at 1500 bytes; reject inserts that would push over.
5. Add a `[[<surface>-block-rendering-discipline]]` pattern if the rendering rules are non-obvious.

**When adding state to an existing surface:**

Prefer extending the existing block over creating a new one if cardinality stays low. Splitting helps when the audiences are disjoint (finance is universally relevant, client_pulse is only relevant when client-adjacent).

**Hard rules:**

- Continuity blocks NEVER render in the frontend chat surface. ([[tate-facing-context-blocks-must-not-render-to-frontend]])
- Continuity blocks render to the conductor's context, not to Tate's eyes.
- Blocks must be substrate-derived. Never a literal hand-written paste.
- Frequency of update is the substrate's job, not the conductor's.

## Verification

A continuity block is shipped when:

- It renders on EVERY conductor turn (verifiable by tailing `osSessionService` outbound prompt structure).
- Its content updates within 5 min of the underlying substrate changing.
- The conductor demonstrably uses it (reduced query-volume for that domain in `routing_decisions` table over baseline).

## Origin

Six parallel domain audits 2026-05-18 (40-min window while Tate out). Three of the six audits independently proposed a "live X-pulse rendered at turn-start" as the bold feature: finance, CRM, ambient-OS. Convergence on the same architecture across independent threads = the abstraction is real. Codifying as doctrine.

## Cross-refs

- [[tate-facing-context-blocks-must-not-render-to-frontend]]
- [[observer-interventions-are-ambient-not-chat]]
- [[memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15]]
- [[decision-quality-self-optimization-architecture]]

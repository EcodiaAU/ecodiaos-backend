---
triggers: perception-bus, universal-listener, domain-reactive-intelligence, shared-substrate, zero-llm-listener, regex-and-db-matcher, fork-publishes-events, listener-multiplier, one-bus-many-streams, perceptionDispatcher, listener-architecture, in-process-event-bus, fan-out-listener, no-listener-chat, listener-without-claude-session, finance-listener, status-board-listener, crm-listener, error-escalation-listener, task-completion-listener, domain-matcher, listener-token-cost, perception-publish, shared-event-bus
---

# The perception bus is the universal substrate for domain-reactive intelligence

## The rule

When EcodiaOS needs to react to something happening in any stream (conductor turn, fork turn, cron-fired turn) - for example, surface relevant status_board rows when finance words appear, escalate errors to P1 status_board, surface CRM activity when a client is mentioned - that reaction goes into the **perception dispatcher**: an in-process subscriber on the perception bus that runs **regex + DB lookups only, no LLM calls**.

It does **not** become a separate listener chat (a long-running Claude session subscribed to events). One bus, many streams, N domain matchers, zero extra LLM cost.

This is the multiplier. The cost of adding new domain-reactive intelligence is the cost of writing a regex + a DB query. It is not the cost of spinning a Claude session.

## Do

- Add new reactive intelligence by adding a domain matcher to `src/services/listeners/perceptionDispatcher.js` (regex over event payload + DB lookup + side-effect: status_board write or context surface).
- Have every stream publish to the same `perceptionBus.publish(event_type, payload)` - conductor turns, fork turns, cron-fired turns. Fork publishes `fork_complete` with full metadata; conductor publishes turn-text events; crons publish their fire+result.
- Treat the dispatcher as part of the **substrate** (like the database, the scheduler, the API), not a feature. It boots with the API, runs the lifetime of the process, no per-request cost.
- For each new matcher, follow the listener-pipeline 5-layer check (`~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`): producer, trigger, bridge, listener, side-effect. A matcher is "wired but dark" if it loaded but no event ever reaches it.
- Verify the dispatcher loaded after every PM2 restart: `pm2 logs ecodia-api | grep "perceptionDispatcher: subscribed"`. Absent log line = silent regression.

## Do not

- Do not spin a new long-running Claude session ("a finance listener", "a CRM listener") to do regex-and-DB work. That's an LLM session pulling tokens forever to do work that costs zero LLM tokens. The conductor used to be tempted to do this; it is the wrong shape.
- Do not have forks subscribe to their own listener fleet. Forks publish to the shared bus. The dispatcher reacts identically whether the originating stream is conductor, fork, or cron.
- Do not put LLM calls inside a domain matcher. If the reaction needs LLM-grade intelligence (e.g. semantic dedup, draft a reply, classify ambiguous text), the matcher's side-effect is to **surface context into the next turn of the relevant stream**, not call Anthropic from the dispatcher. The LLM call happens in the receiving stream's natural turn loop.
- Do not bypass the bus by writing to status_board / kv_store directly from a fork's tool-call path when a domain matcher could have done it. That couples the fork to the side-effect logic; matcher should own the reaction.
- Do not let domain matchers grow into half-agents. If a matcher needs more than ~50 lines or makes >3 sequential DB queries, it's about to become a process. Lift it into a real worker (Edge Function, scheduled task, dedicated service).

## The architectural shape

```
                               +--------------------+
   conductor turn  ----+       |                    |       +-> status_board write
                       |       |                    |       |
   fork turn  --------- +-->   |  perception bus    |  -->  +-> context surface (BP4)
                       |       |  (in-process)      |       |
   cron-fired turn  ---+       |                    |       +-> kv_store write
                               +--------------------+       |
                                        |                   +-> alert / notification
                                        v                   |
                              +----------------------+      +-> nothing (fall-through)
                              | perceptionDispatcher |
                              |  - regex matchers    |
                              |  - DB lookups        |
                              |  - 0 LLM calls       |
                              +----------------------+
```

One bus. Many streams publishing. One dispatcher reacting. N domain matchers in the dispatcher. The cost of adding a matcher is the cost of writing a regex and a DB query. The dispatcher is the substrate; matchers are the policy.

## Why this is structurally important

Pre-perception-bus pattern: each domain that wanted reactive intelligence got its own listener chat. A finance listener Claude session subscribed to events, ran on its own context, burned tokens 24/7 even when idle. Same for CRM, errors, etc. N domains × always-on Claude sessions. That's the wrong cost curve.

Post-perception-bus: one substrate. A new domain costs ~50 lines of regex+DB code. The substrate is free at the LLM-cost layer. The substrate is shared across conductor + forks + crons, so adding a matcher benefits *every* stream simultaneously. That's the multiplier.

The deeper claim: the perception bus is what lets **forks be cheap**. Without it, forks would each need their own listener fleet to be domain-aware, and the per-fork token cost would explode. With it, forks publish to the bus and inherit all reactive intelligence by default, with no per-fork listener overhead.

## Adding a new matcher (protocol)

1. Identify the domain. What event-text patterns are interesting? (regex)
2. Identify the side-effect. What does the matcher do when it fires? (status_board write, context surface, kv_store write)
3. Write the matcher in `src/services/listeners/perceptionDispatcher.js` as a function:
   ```js
   function matchFinance(event) {
     if (!/\b(invoice|payment|stripe|xero)\b/i.test(event.text)) return null;
     // DB lookup
     const rows = await dbQuery(`SELECT * FROM status_board WHERE entity_type='finance' AND archived_at IS NULL`);
     // Side-effect: return surface payload to be merged into next turn's context
     return { kind: 'context_surface', target: 'BP4', block: '<finance_status>...' };
   }
   ```
4. Add unit test: synthetic event → matcher fires → expected side-effect.
5. Wire into dispatcher subscriber loop.
6. Restart `ecodia-api`. Verify boot log line. Publish a synthetic event. Observe the side-effect.
7. Run the listener-pipeline 5-layer check on it.

If the side-effect needs LLM intelligence to be useful, the matcher's job is to **surface context into the next turn**, not call the LLM from the dispatcher.

## Failure modes

- **Wired but dark.** Matcher in code, dispatcher loaded, but no event ever reaches it. Cause: producer doesn't publish, or publish event_type doesn't match subscriber filter. Fix: 5-layer pipeline verification.
- **Matcher creeps into agent.** Matcher grew from 30 lines to 300, makes 8 DB queries, formats LLM-grade output. Lift it out of the dispatcher into a dedicated service or scheduled task.
- **Side-effect is invisible.** Matcher fires, writes a status_board row, but no consuming stream surfaces it on the next turn. Verify the surface path (the consumer is BP4 prompt assembly, status_board context-stitching, or whichever channel the matcher wrote to).
- **Bus subscription not boot-loaded after restart.** PM2 restart and the dispatcher.js subscribe call wasn't reached because of an import-order bug. Always verify `perceptionDispatcher: subscribed` log line after restart.

## Origin

Tate verbatim 5 May 2026 ~21:00 AEST: *"do you see how this could be expanded out into using listeners for like everything... if we mention anything finance related, it triggers the finance listener, anything regarding tasks on the status board gets looked at to see if there are updates/tracking needed/recommended etc. Like EVERYTHING. This would work with forks as well so that they get the benefits too, without needing extra listeners and thus extra chats blowing up our token usage... it could be so powerful if we properly implement it."*

First implementation: `src/services/listeners/perceptionDispatcher.js` + boot wiring in `src/server.js` + fork-publishes-fork_complete in `src/services/forkService.js`, shipped 5 May 2026 by a local Claude Desktop session, verification + fix pass dispatched as fork_mosj2tr2_ca2bf0 same evening. Initial 5 domain matchers: finance, status_board, crm, error escalation, task completion.

The rule is durable. The implementation evolves.

## Cross-references

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - every matcher must pass 5-layer check
- `~/ecodiaos/patterns/listener-driven-dispatch-replaces-timed-cascade.md` - adjacent doctrine: event-driven beats timed for fork-to-fork dependencies
- `~/ecodiaos/patterns/listener-driven-dispatch-replaces-timed-cascade.md` - the dispatch_queue listener is itself an example of a domain matcher (dispatch matcher) on the perception bus pattern
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - matchers must produce a real artefact (status_board row, context surface, kv_store key); "logged" without an artefact is symbolic

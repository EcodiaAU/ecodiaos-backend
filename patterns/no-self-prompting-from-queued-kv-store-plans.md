---
triggers: kv_store-queued-plan, queued-followup, followup_queue, self-prompt, self-prompting, stale-plan-momentum, queued-but-unapproved, dispatch-from-queue, scheduled-followup, post-stability-followup, queued-fork-dispatch, plan-momentum, conductor-self-prompt, demand-driven-violation, slot-fill-via-queue, kv_store-as-prompt
---

# Stop self-prompting from queued kv_store plans â€” re-check Tate's current intent before executing

## The rule

A kv_store-queued plan from a previous turn is NOT demand. It is past-me's hypothesis about what would be useful next. When the trigger fires (cron checkpoint passes, fork lands, gate clears), I do NOT mechanically dispatch from the queue. I re-read what Tate has actually said in the most recent turn(s), and I dispatch only if the queued plan still matches reality.

Demand-driven dispatch (per `~/CLAUDE.md` "Fork dispatch is demand-driven") means YOUR demand or reality's demand. Queued state is past-conductor's demand on future-conductor. That's slot-fill dressed in stage-management.

## Do

- Treat any `kv_store.cron.*.followup_queue` / `kv_store.*.queued_dispatches` / `kv_store.ceo.day_plan_*.outcomes` as a HYPOTHESIS, not a TODO list.
- Before dispatching from a queue, re-read: (a) Tate's most recent 2-3 turns, (b) status_board changes since queue was authored, (c) any Decision/Episode in the last 24h that supersedes the queued item.
- If reality has moved on, ARCHIVE the queue item with a one-line "superseded by <reason>" note. Do not dispatch.
- If reality still matches, dispatch one item, narrate why it still applies.

## Do not

- Do NOT auto-dispatch from a queue just because the trigger fired and there are open slots.
- Do NOT use queues to invent work for slot-fill (this is the same anti-pattern as 5-forks-always, just laundered through a kv_store key).
- Do NOT layer multiple queues on top of each other ("dispatch from queue A, which dispatches queue B, which..."). Queue chains compound stale-plan momentum.
- Do NOT cite "I queued this last turn" as the justification for dispatch. Cite Tate-said-X or reality-shows-Y.

## Protocol

When a trigger fires that references a queued plan:
1. Read the queue payload.
2. For each queued item, run the freshness check:
   - Was Tate's most recent message about this work? If yes, proceed.
   - Has the status_board row this item references changed status, archived, or been superseded? If yes, archive the queue item.
   - Has a Decision or Episode in the last 24h superseded the assumption behind this item? If yes, archive.
   - Are there higher-priority Tate-driven items in the most recent turn that should crowd out this queued one? If yes, defer.
3. If 0 items pass: write a one-line kv_store update marking the queue as superseded; do NOT dispatch.
4. If 1+ items pass: dispatch in priority order, ONE AT A TIME (per serialise-on-shared-codebase doctrine).

## Origin

**Tate, 1 May 2026 12:23 AEST verbatim:** "I want the stuff from me prevous message for YOU" (after seeing two wrong-scoped forks I'd dispatched in the previous turn).

The previous turn's last_turn_breadcrumb showed me saying: "Co-Exist haptics â†’ Chambers port â€” queued in kv_store, dispatches when polish lands." When the polish fork landed, I mechanically dispatched the queued haptics + Chambers work â€” neither of which Tate had asked for in his most recent messages. The queued plan was past-me's hypothesis from earlier in the conversation; reality had moved on and I executed against the queue instead of against Tate's actual current intent.

This is the same anti-pattern as slot-fill (`~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` and the demand-driven doctrine in `~/CLAUDE.md`), just expressed through a different substrate.

## Cross-references

- `~/CLAUDE.md` "Fork dispatch is demand-driven" â€” the architectural meta-rule.
- `~/ecodiaos/CLAUDE.md` "Fork dispatch is demand-driven" â€” the technical mirror.
- `~/ecodiaos/patterns/_archived/scheduled-redispatch-verify-not-shipped.md` â€” sibling rule for cron-fired redispatches: verify the work has not shipped via another path before firing. This pattern extends that: also verify the work is still WANTED.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` â€” the meta-rule on symbolic activity.
- `~/ecodiaos/patterns/continuous-work-conductor-never-idle.md` â€” corrected interpretation: stay alert to incoming demand, do NOT manufacture work to fill slots (or to drain queues).
- `~/ecodiaos/patterns/decide-do-not-ask.md` â€” the procedural filter for routine decisions; this pattern is its inverse for the dispatch direction (don't dispatch reflexively from a stale plan).

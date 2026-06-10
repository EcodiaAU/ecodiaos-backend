---
binding: cron=orphan-next-action-audit + hook=knowledge-sessionstart (CLAUDE.md core reflex)
---

# Every piece of work names its successor trigger before the turn ends

triggers: forward scheduling, think ahead, next stage trigger, who fires the next step, orphan next action, schedule yourself, project self management default, chain ledger deadman everywhere

## What Tate mandated (2026-06-11, verbatim)

"This also needs to be something you always do... actually thinking ahead of time and scheduling yourself or getting triggers to set off the next stage or whatever." Spoken immediately after the climate-pm chain build, elevating it from a project fix to a universal operating reflex.

General form: any agent whose attention arrives in discrete turns must bind every cross-turn commitment to a mechanism that fires without it; the unit of management is the trigger, never the intention.

## The rule, three altitudes

1. **Turn level.** A turn that ships anything with a successor (a sent email awaiting reply, a deploy awaiting soak, a deferred commitment, a stage whose next stage has a known precondition) BINDS that successor to a mechanical trigger before the turn ends: a scheduler task, a ledger entry an existing chain reads, or a cron that already owns the shape. Saying "next: X" in chat or on the board without a trigger is a promise to nobody.
2. **Project level.** Any body of work expected to outlive a week gets the trio from [[climate-pm-self-perpetuating-chain-2026-06-11]] at its birth: a structured LEDGER of awaited things with dates, a self-re-arming CHAIN that reads it and acts, and a DEADMAN watching the chain. One-off reminder tasks are for one-off things only.
3. **Fleet level.** The `orphan-next-action-audit` cron (daily 10:10 AEST) sweeps status_board rows owned by ecodiaos and finds promises without triggers: a next_action with no matching active scheduled task and no recent touch. It does not nag; it SCHEDULES the missing trigger itself with full context from the row, and reports what it adopted.

**Why:** the conductor's attention is turn-shaped but the business is timeline-shaped. Everything proven on 2026-06-10/11 says the gap between those two is where work dies: the overnight W11 fire died silently, broker replies would have sat unread until a human remembered, and "the ball is with them" turned out to mean "nobody is watching the ball". Triggers are how a turn-shaped mind manages a timeline-shaped world.

## How to apply

- Before ending any working turn, ask: what is the next stage, what fact or date fires it, and which mechanism watches for that fact? If the answer is "me, next time I happen to look", bind it now.
- Prefer feeding an EXISTING chain's ledger over minting a new task (the climate line's awaited-thread entries are the model); prefer a cron for recurring shapes; reserve one-off delayed tasks for genuinely one-off things.
- When Tate hands over a new project, the chain + ledger + deadman trio is part of standing it up, the same way the status_board row is.

## Anti-patterns

- "I'll check on it" with no scheduled checker: the recorded 2026-06-11 failure shape this pattern exists to kill.
- Scheduling the follow-up but never verifying the row landed (read it back; the climate chain's re-arm read-back is the model).
- A pile of one-off tasks where a chain belongs: they die individually, invisibly, and nothing re-sequences when facts change.
- Treating the daily audit as the primary mechanism: it is the safety net under the reflex, never a substitute for binding triggers at the moment work ships.

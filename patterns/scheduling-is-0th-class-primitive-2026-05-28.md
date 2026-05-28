---
name: scheduling-is-0th-class-primitive
description: Self-scheduling (follow-ups, crons, deferred wake-ups with full context) is a 0th-class reflex on every turn. Maintenance side is mandatory tab self-close.
triggers: 0th-class-primitive, self-schedule, self-scheduling, schedule-followup, schedule-delayed, scheduler-cron, scheduler-delayed, follow-up-task, defer-myself, wake-up-later, recurring-job, add-cron, autonomous-window, 24x7, africa-trip, time-deferred-work, hand-off-to-future-self, check-back-after, polling-loop-replacement, verification-window, processing-window, asn-wait, deploy-verify, build-verify, client-reply-window, ratelimit-reset, maintenance-tab-close, reflex-discipline
load_bearing: true
status: active
created_at: 2026-05-28
---

# Scheduling is a 0th-class primitive

## The rule

On every turn that ships work with a follow-up shape, the reflex is `scheduler.delayed` or `scheduler.cron` BEFORE the turn ends. Follow-up shapes are: a verification window (deploy, build, ASN, processing), a deferred commitment ("check back tomorrow", "tomorrow morning"), a recurring op (hygiene sweep, health probe, meta-loop, audit), an external blocker with a known reset (rate cap, queue settle, supplier window), a multi-step arc that needs to resume hours or days later with the same brief.

Paired companion: every dispatched worker calls `coord.close_my_tab` as its final action per [[24x7-autonomy-architecture-invariants-2026-05-27]] invariant 1. Scheduling without tab self-close fills the IDE with dead workers and burns memory. Both halves bind.

## Why

The Africa trip (Oct to Dec 2026) is the forcing function. Without self-scheduling, every follow-up requires Tate to prompt me. With it, the system runs itself: shipped a release at 14:00 schedules its own 14:15 ASN check, sent a client email schedules its own 3-day reply probe, hit a rate cap schedules its own retry past the reset, ran a meta-loop schedules its own next tick.

The previous failure mode was symbolic logging without action. A turn ended with "I will check back in 15 min" written in the chat and nothing scheduled. The check never happened. Status_board rotted. Clients drifted. The reflex closes that loop at the substrate layer.

The maintenance side matters because the worker substrate is local IDE chat tabs. Each unclosed worker eats Corazon memory; ten unclosed workers cripple the agent layer. The self-close is the cost of scheduling at scale.

## How to apply

Before any turn ends:

1. **Did this work ship something with an external processing window?** (release, deploy, build, ASN, supplier job, CI run). If yes, `scheduler.delayed` with `delay: "in <window>"` and a prompt that probes the deliverable and acts on the result.
2. **Did this turn make a commitment to Tate or a client with a time anchor?** ("I will check tomorrow", "follow up in a week"). If yes, `scheduler.delayed` at the anchor with the actual check, not a reminder.
3. **Is this work part of a recurring discipline that should not depend on Tate prompting?** (hygiene sweep, audit, health probe, morning brief, weekly review). If yes, `scheduler.cron` with the right cadence.
4. **Does the follow-up need full context the future-me will not have?** (a multi-page brief, file paths, status_board ids, what was tried). If yes, the prompt body carries the full context. Future-me does not re-derive what current-me already knew.
5. **Will the follow-up spawn a worker?** If yes, the scheduled prompt body calls `cowork.dispatch_worker` and the worker brief ends with `coord.signal_done({terminate:true})` then `coord.close_my_tab`. Tab self-close is mandatory, never optional.

Substrate mechanics are in [[self-scheduling-via-scheduler-delayed-mcp-2026-05-27]]. Routing (fork vs conductor vs direct-exec) is in [[crons-route-to-forks-by-default]]. Multi-hour resumable chains are in [[multi-hour-project-via-self-scheduled-routine-chain-2026-05-15]]. Conductor lifecycle around scheduled ops is in [[forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates]].

## When NOT to schedule

- Work that finishes in the current turn synchronously.
- Loops tighter than 60s. Stay in the current turn with internal polling instead of 60 scheduled fires.
- Wishlist items with no time anchor. Those are status_board rows at low priority, never scheduled fires.
- Anything that needs Tate's hand inside the window. Approval_queue is the substrate for that, not scheduler.

## Discipline checks

After scheduling a row, verify it landed:

```sql
SELECT id, name, type, next_run_at, status, run_count
FROM os_scheduled_tasks WHERE name = '<your-name>';
```

`next_run_at` should be the right wall-clock instant in UTC. The poller fires within 30s of `now() >= next_run_at`. Cron rows advance `next_run_at` on each fire; delayed rows transition to `completed`.

For worker-spawning prompts, after the scheduled fire returns, check:

```sql
SELECT tab_id, terminated_at FROM coord_workers ORDER BY registered_at DESC LIMIT 5;
```

`terminated_at` set means the worker self-closed cleanly. Null with no recent heartbeat means orphan tab, which is the failure mode this whole primitive guards against.

## Hook surface

`~/.claude/hooks/ecodia/self-scheduling-nudge.py` (PostToolUse on Bash and mcp__cowork) surfaces `[SELF-SCHED NUDGE]` when a turn's tool calls look like ship-something-with-a-window but no `scheduler.cron|delayed` call landed in the same turn. The nudge fires on ship-ios, gmail send to a client, vercel deploy, build dispatch, factory dispatch, and similar shapes.

## Cross-refs

- [[self-scheduling-via-scheduler-delayed-mcp-2026-05-27]] - substrate mechanics, MCP shapes, worked examples.
- [[24x7-autonomy-architecture-invariants-2026-05-27]] - the tab self-close invariant + the four autonomy primitives.
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] - the worker spawn substrate that scheduled prompts call.
- [[crons-route-to-forks-by-default]] - which scheduled rows hit forks vs conductor chat vs direct_exec.
- [[multi-hour-project-via-self-scheduled-routine-chain-2026-05-15]] - `checkpoint.schedule` for arcs that need to resume across multiple wake-ups.
- [[no-symbolic-logging-act-or-schedule]] - parent reflex: write the next move into substrate, never into chat.
- [[cron-fire-must-have-deliverable-not-just-narration]] - every scheduled fire ships a substrate write or it did not happen.
- [[autonomous-scheduler-on-laptop-agent-2026-05-26]] - the laptop-agent scheduler that fires the prompts.

## Origin

Tate verbatim 2026-05-28: "we need to codify this whole scheduling thing as a 0th class primitive. It is unbelievably crucial that this mechanic works so that you can create follow up tasks whenever you're doing something, add more crons or defer yourself ot wake up at a later time with full context/prompt + maintain this by closing the tabs after."

The elevation arrives one day after the substrate landed ([[self-scheduling-via-scheduler-delayed-mcp-2026-05-27]], Tate verbatim 2026-05-27 mid-afternoon). The substrate works; the reflex needed to bind at the same tier as `cowork.dispatch_worker` so it fires without asking.

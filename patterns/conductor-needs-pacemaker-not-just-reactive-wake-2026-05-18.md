---
name: conductor-needs-pacemaker-not-just-reactive-wake-2026-05-18
description: A conductor that only wakes on incoming coord messages sits idle whenever there are no workers. Pair the reactive wake substrate with a scheduled idle_check self-write so the conductor has a self-prompting heartbeat.
triggers: conductor-pacemaker, idle-conductor, idle-check, reactive-wake-only, no-pacemaker, conductor-passive, idle-corazon, idle-substrate, autonomous-pacemaker, scheduled-self-write, conductor-self-prompt, idle-loop, idle-time-work, 24-7-substrate, ambient-conductor, wake-on-tick
status: active
---

# Conductor needs a pacemaker, not just reactive wake

The conductor wake substrate ([[conductor-wake-on-coord-inbox-write-2026-05-18]]) fires the conductor when an external worker writes to its inbox. That handles the "incoming work" case. It does NOT handle the "no incoming work but the conductor should still be doing something" case. A reactive-only wake design means **whenever the inbox is empty, the conductor is idle** and idle on a 24/7 substrate worth $14k/week of subscription rate is failure.

## The rule

The conductor MUST have both:

1. **Reactive wake** - on coord inbox writes from workers, on SMS/Telegram inbound, on email-arrival listener fires.
2. **Pacemaker wake** - a scheduled self-write to `chat.conductor.inbox` at fixed cadence (default 30min during Tate-awake-window, 6h during Tate-sleep-window). The pacemaker fire body MUST contain enough context for the conductor to decide what to do: overdue status_board rows, stale observer signals, idle-loop work candidates.

Both substrates feed the same inbox. The conductor cannot tell from outside whether it was woken by an external worker or by its own pacemaker, and **shouldn't need to**.

## Why

Audit 2026-05-18 (40-min window): Corazon laptop at 81% memory, idle. Zero crons fire on Corazon (the 16 cloud Routines have unverified status post-migration). Coord inbox has 23 messages and 16 worker files, no janitor. Tate goes out for 40 min and the laptop sits there.

Per `~/CLAUDE.md`: "Token budget: 20 BILLION/week (~$14k AUD). Unused = wasted. 'Nothing to do' = failure state." But this is only true if there's a substrate that fires the conductor when nothing else does. A pacemaker IS that substrate.

The reactive model is necessary but not sufficient. A pacemaker provides:

- **Drift-audit cadence** (the canonical thin-on-main work when no fork can spawn).
- **Stale-row sweep** (status_board / observer_signals / working_set hygiene).
- **Self-evolution windows** (read own code, propose upgrades).
- **Pattern-tuning candidates** (review which patterns fire vs go unused).

None of these need a Tate prompt. None need a worker hand-off. They are the conductor's own job, and a pacemaker is what makes them happen.

## How to apply

**Substrate (proposed):**

```
[Windows Task Scheduler / pm2 cron app]
  fires every 30min (08:00-22:00 AEST) / 6h (22:00-08:00 AEST)
  POSTs to laptop-agent /api/coord/send-message
  body: {topic: 'chat.conductor.inbox', body: {type: 'idle_check', timestamp: <now>, overdue_rows_count: N, stale_signals_count: M}}
  wake substrate fires (flash + toast + audio)
  conductor turn-start reads inbox, sees idle_check
```

**Conductor behaviour on idle_check:**

1. If working_set has active threads, continue them; skip idle work.
2. If overdue_rows_count > 0, triage one overdue row.
3. If stale_signals_count > 0, ack or act on one signal.
4. Else, pick from idle-work menu: drift-audit (status_board), pattern-tuning, neo4j-stale-node-audit, dossier-freshness, claude-md-reflection-self-audit. Dispatch one worker.
5. If all menus empty, write episode summarising the idle window, sleep until next pacemaker tick.

**Hard rules:**

- Pacemaker fire MUST land enough context to act. A bare `{type: 'idle_check'}` with no overdue/stale counts wastes a wake. Stuff the body.
- Pacemaker MUST respect quiet-hours envelope ([[quiet-hours-are-substrate-not-doctrine-2026-05-18]]). 22:00-07:00 AEST drops to 6h cadence and never SMS-escalates an idle_check.
- Pacemaker is a fallback, not a primary scheduler. Real work (deploys, follow-ups, billing) lives in scheduled crons, not in pacemaker-driven decision-making.

## Verification

- `kv_store.cowork.pacemaker.last_fire_at` updated within 1.5x cadence on both day and night windows.
- Idle-window deliverables: substrate-write count per pacemaker tick > 0.5 (across 30d rolling average).
- No SMS to Tate from pacemaker-fired turns unless severity=critical (verify against `osAlertingService` outbound log).

## Origin

Audit 2026-05-18 surfaced "idle Corazon = failure state" in the ambient-OS lane. The dispatch-worker / coord-bus substrate landed 2026-05-17 / 2026-05-18 but is reactive-only. Three audit lanes independently flagged "the conductor never spontaneously does anything." Codifying as doctrine before shipping the pacemaker so the rule outlives the implementation.

## Cross-refs

- [[conductor-wake-on-coord-inbox-write-2026-05-18]]
- [[conductor-wake-substrate-2026-05-18]]
- [[continuous-work-conductor-never-idle]]
- [[no-self-prompting-from-queued-kv-store-plans]] (this pattern is the EXPLICIT exception: external scheduled self-prompting is OK; in-conductor queue-and-fire is NOT)
- [[idle-corazon-is-failure-state-2026-05-18]] (sibling, written same arc)
- [[fork-dispatch-is-demand-driven-not-slot-quota]] (pacemaker doesn't violate demand-driven; pacemaker IS demand, emitted from substrate state)

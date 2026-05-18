---
name: multi-hour-project-via-self-scheduled-routine-chain-2026-05-15
title: Multi-hour project via self-scheduled Routine chain (checkpoint primitive)
authored: 2026-05-15
authored_by: ecodiaos
lane: phase2/09
triggers:
  - checkpoint
  - checkpoint-chain
  - checkpoint-schedule
  - multi-hour-project
  - scheduled-wakeup
  - wake-up-chain
  - self-scheduled-routine
  - project-chain
  - geometric-backoff
  - awaiting-external-followup
  - deploy-verify-poll
  - build-check-back
  - fork-supervision-checkpoint
related:
  - cron-fire-must-have-deliverable-not-just-narration
  - scheduled-redispatch-verify-not-shipped
  - cancel-stale-schedules-when-work-resolves-early
  - decide-do-not-ask
  - never-schedule-host-process-restart-via-os-scheduled-tasks
---

# Multi-hour project via self-scheduled Routine chain

Routines fire on fixed crons. They are great for "every hour audit" or "9am briefing" but cannot represent "I am doing a 3-hour project, wake me up at the right moments along the way." Cron is fixed-cadence; multi-hour projects are project-shaped.

The **checkpoint primitive** (`checkpoint.{schedule,status,list,stop}` on `/api/mcp/ecodia-full` and `/api/mcp/cowork`) solves this. A chain is a sequence of one-shot `delayed` Routines. Each wake-up reads chain state, executes a small action brief, then either schedules the next wake-up (iteration+1) or terminates the chain.

## When to use a checkpoint chain

- Work has 2+ discrete check-back moments hours apart.
- Polling external state that changes slowly (Vercel deploys, iOS builds, CI runs).
- Awaiting an external party with geometric backoff (24h, 48h, 7d).
- Long-running fork supervision (poll every 5min for 30min, then every 15min).

## When NOT to use

- Regular cadence, no project shape -> use `scheduler.cron` instead.
- One-shot fire-and-forget -> use `scheduler.delayed`.
- Work that fits inside the current session -> just do it now.
- Action brief is fuzzy or symbolic. The brief is what the future Routine reads to decide what to do. If it would not produce a substrate deliverable, refuse and ask for a sharper brief. See `cron-fire-must-have-deliverable-not-just-narration`.

## Chain shape

1. **Caller** invokes `checkpoint.schedule` with `project_id` (status_board row), `wake_in`, `action_brief`. Optionally `max_iterations` (default 20, hard cap 50) and `account` (default `code`).
2. **Primitive** validates the project_id, parses `wake_in`, checks wall-time cap (default 24h from chain start, hard cap 7d), composes a self-resuming Routine prompt, inserts an `os_scheduled_tasks` row (type=`delayed`, name=`cowork.checkpoint.<chain_id>.iter<N>`), upserts chain state in `kv_store.cowork.checkpoint_chains.<chain_id>`.
3. **schedulerPollerService** picks up the row when `next_run_at` arrives and dispatches the prompt to the named account.
4. **Future-me Routine** reads chain state + status_board row + Episodes tagged with chain_id, checks the emergency-stop status_board row, writes an idempotency key `kv_store.cowork.checkpoint_fires.<chain_id>-<iter>`, executes the action brief (bounded to 10 minutes wall time), then decides:
   - **Done** -> archive status_board row, mark chain status=completed, write Decision node.
   - **More work + iter < max_iterations** -> call `checkpoint.schedule` with iteration+1.
   - **Blocked** -> upsert status_board next_action_by=tate priority=2, mark chain status=blocked, write Episode.
   - **Failed with no path** -> write Decision node naming the failure, mark chain status=failed.
5. Every fire writes an Episode tagged with chain_id so future-me can read what previous checkpoints accomplished.

## Termination conditions

A chain terminates when:
- The action brief decides `done` -> chain status=completed.
- iteration reaches max_iterations and no next schedule is made -> chain auto-orphans.
- `checkpoint.stop` is called -> chain status=stopped, all active scheduled tasks paused.
- The kill switch fires (see below) -> chain status=stopped.
- Total wall time exceeds the cap -> the next `checkpoint.schedule` call refuses with `wall_time_cap_exceeded`.

## Safety bounds

| Bound | Default | Hard cap | Enforcement |
| -- | -- | -- | -- |
| max_iterations | 20 | 50 | `checkpoint.schedule` refuses if iteration > max |
| chain wall time | 24h | 7d | refuses next schedule beyond cap-from-start |
| idempotency | per `<chain_id>-<iter>` | always | kv_store.cowork.checkpoint_fires re-fire = no-op |
| account | `code` | n/a | enum: tate, code, money |

## Kill switch (Tate)

A status_board row named `checkpoint-chain-EMERGENCY-STOP` with `next_action` mentioning a chain_id causes that chain to halt at the next fire. Omit the chain_id to halt all chains. The wake-up Routine reads this row as step 4 of its prompt, before doing anything.

This is the human override. Use it when a chain is misbehaving and you want to stop without finding the chain_id.

## Substrate map

| Surface | Where |
| -- | -- |
| Chain state | `kv_store.cowork.checkpoint_chains.<chain_id>` |
| Scheduled fires | `os_scheduled_tasks` rows named `cowork.checkpoint.<chain_id>.iter<N>` |
| Idempotency fires | `kv_store.cowork.checkpoint_fires.<chain_id>-<iter>` |
| Audit | `cowork_audit_log` rows for tool_name in (checkpoint.schedule, checkpoint.stop) |
| Episodes | Neo4j Episode nodes tagged with chain_id in name/description |

## Spec

- Module: `backend/src/routes/mcp/cowork.checkpoint.js`
- Mount: `cowork.js` requires + mounts the module; `coworkMcpShim.js` advertises the four tools in TOOLS array; `ecodiaFullMcpShim.js` re-exposes via `COWORK_INPROCESS_TOOLS` automatically.
- Dossier: `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/09-scheduled-wakeups-for-multihour-work.md`
- Helper skill: `C:/Users/tjdTa/.claude/skills/checkpoint/SKILL.md` (the `/checkpoint` invocation surface)
- Decision: `Scheduled wake-ups primitive shipped - 2026-05-15` (Neo4j Decision node)

## Anti-patterns

- Stuffing a multi-step plan into one `scheduler.delayed` call. The wake-up Routine then has to do the whole project at once; if it stalls, the work is lost. Split into checkpoints.
- Using a chain for cron-cadence work. Cron is cheaper; use `scheduler.cron`.
- Forgetting to write Episodes per fire. Without them, future-me cannot read what previous checkpoints did and has to redo recon. The Routine prompt template enforces this in step 8.
- Setting `wake_in` shorter than the schedulerPollerService poll interval (30s) and expecting precise timing. The fire is best-effort within +/- 30s.

---
name: cron-fire-must-have-deliverable-not-just-narration
description: >
  Use when the turn involves cron-silent-fire, scheduled-task-no-deliverable, cron-fire-no-fork, narration-without-action, cron-completion-without-artefact, claude-md-reflection-silent, autonomous-window-sms-silent, scheduled-self-loop-silent, fire-then-stall, deliverable-missing-after-cron, schedulerPollerService, os_scheduled_tasks-completion-without-artefact, cron-deliverable-gate, fork-dispatch-from-cron-prompt. Pattern: Every cron-fired turn must produce a deliverable on a durable substrate, not just narration.
---

# Every cron-fired turn must produce a deliverable on a durable substrate, not just narration

A cron prompt firing and the turn responding "I will do X" is NOT the same as X happening. The scheduler row closes when the prompt is delivered. There is no second-order check that the work landed. If the prompt's deliverable is "fork the audit and edit", and only narration appears, the work silently dies and the durable substrate (drafts/, status_board, neo4j, kv_store) shows nothing.

## The rule

For every cron whose prompt-body declares a deliverable (file authored, fork spawned, status_board row updated, email sent, neo4j node written), the receiving turn MUST emit at least one tool call that lands on a durable substrate within the same turn. If the turn ends with no such tool call, classify as `cron_silent_fire` and surface as P1 status_board row at the next session-start probe.

Detection (post-hoc, run as part of the next meta-loop):
1. Query `os_scheduled_tasks` for cron rows completed in the last hour.
2. For each, parse the prompt-body for declared deliverable signal (`spawn_fork`, `Write tool`, `INSERT INTO`, `gmail_send`, `graph_merge_node`).
3. Query the matching durable substrate for an artefact with `last_modified >= cron_completed_at AND <= cron_completed_at + 30min`.
4. No artefact = silent-fire. Status_board row P1.

Prevention (pre-hoc, ship a hook):
- PreToolUse hook on `mcp__scheduler__schedule_cron` and `os_scheduled_tasks` INSERTs probes the prompt-body. If the prompt declares a fork-or-write deliverable but does NOT include the literal substrate paths the deliverable will land on, warn `[CRON-DELIVERABLE WARN] cron prompt declares <action> but does not name the substrate it will land on`.
- PostToolUse on cron-fire turns: if the turn closes with zero substrate-write tool calls, log to `kv_store.cron.silent_fires.<task_id>.<run_at>` for next-meta-loop classification.

## Do
- Every cron prompt names the literal output path / fork id pattern / status_board entity_ref / kv_store key it will write.
- Every cron-fire turn ends with at least one tool call that lands on a durable substrate, OR an explicit kv_store write logging "cron fired, no deliverable required this run because <reason>".
- Treat cron rows as `complete-when-deliverable-on-disk`, not `complete-when-prompt-delivered`.

## Do not
- Trust scheduler `last_run_at` as proof the work happened.
- Let cron-fire turns end with narration only ("I will fork the audit" without spawn_fork).
- Bury the silent-fire failure as "the cron fired but I was busy" - the fix is to schedule, not narrate.

## Origin

1 May 2026. Two crons silent-fired in the same day:
- autonomous-window-evening-sms cron fired earlier and produced no SMS to Tate.
- claude-md-reflection cron fired at 20:00 AEST and dispatched neither the audit fork nor the edit fork. This audit (fork_momrik3k_02cb97) was manual recovery dispatched from the conductor session at 19:43 AEST.

Both fit the same shape: prompt delivered, turn responded with text, no spawn_fork or Write tool emitted. status_board row 0aae7e8e captures the meta-pattern.

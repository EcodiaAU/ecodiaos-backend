---
triggers: cron, fork-report, enqueue, suppress, silent-exit, clean-noop, main-chat-pollution
status: archived
archived_at: 2026-06-02
archived_reason: Rule is load-bearing on dead forkService._enqueueForkReport + cronForkDispatcher substrate.
superseded_by: scheduler-substrate-unification-spec-2026-06-02.md
---

# Cron-spawned fork reports that are clean no-ops must be suppressed from main chat

Tate, 4 May 2026 20:55 AEST: "bro wtf... your crons are still coming in to the main chat."

Every cron-spawned fork enqueues a `[FORK_REPORT]` back to the conductor's main session via `_enqueueForkReport` in `forkService.js`. For crons like `vercel-deploy-monitor`, `system-health`, `neo4j-keepalive`, `telemetry-*`, the typical result is "all healthy, no action" - this report is noise in the conductor's chat context. It interrupts the conductor's flow and is never acted on.

## Rule
Cron-spawned forks producing clean no-op results MUST NOT enqueue their `[FORK_REPORT]` to the conductor's main session queue.

## Detection
Two conditions must both be true for suppression:

1. **Cron-spawned detection** - check `brief` for the cronForkDispatcher prefix: `"You are EcodiaOS in fork form, no prior context."`
2. **Clean no-op detection** - check `report` (the `[FORK_REPORT]` body) against `CLEAN_NOOP_PATTERNS` regex list. Patterns match: "exit(ing) silent(ly)", "all (systems) healthy/clean", "no action needed", "processed/classified/errors/inferred/archived/reaped: 0", "no deployments in", "nothing to do/report".

## Suppression point
Inside `_enqueueForkReport` in `src/services/forkService.js`, BEFORE any message-queue write:
```js
if (_isCleanNoop(report, brief)) {
  logger.debug('forkService: suppressed clean no-op cron fork_report', { fork_id })
  return { enqueued: false, reason: 'suppressed_clean_noop' }
}
```

## Verification
Backtest against recent fork results - every report containing "exit silent" or "all systems healthy" or "processed:0" from a cron brief matches and is suppressed. A cron fork that actually DID work (files changed, commits made, emails sent) does NOT match the no-op patterns and passes through normally.

## Non-goals
- Do NOT suppress reports from conductor-spawned forks (they're demand-driven, every result is relevant)
- Do NOT suppress cron results that contain errors, work-done, or non-zero counts - those are genuine signals
- Do NOT modify the cronForkDispatcher itself - the suppression belongs at the enqueue boundary

## Cross-refs
- `~/ecodiaos/patterns/_archived/fork-result-fallback-must-be-marked.md` (sibling: always-enqueue was for missing report, this is for clean-no-op suppression)
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` (cron fire != work happened)
- `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` (conditional delivery)

Origin: 5 May 2026, forkService.js edit, commit pending. Fix shipped in response to Tate 4 May 2026 complaint.

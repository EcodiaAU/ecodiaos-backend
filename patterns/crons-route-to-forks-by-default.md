---
triggers: cron-routing, cron-fork, schedulerPollerService, cronForkDispatcher, DIRECT_EXEC, direct-exec-cron, cron-pollutes-chat, cron-on-main, telemetry-dispatch-consumer, telemetry-outcome-inference, os-forks-reaper, kg-embedding, kg-consolidation, neo4j-keepalive, daily-telemetry, coexist-sync-health, peer-monitor, cowork-fork-budget-reset, decision-quality-classifier, meta-loop, conductor-cron-list, cron-priority-allowlist, /api/os-session/message, scheduler-router, fork-by-default-cron, cron-noise-chat
---

# Crons route to forks by default — NEVER to main chat

## Rule

Every active cron in `os_scheduled_tasks` routes through `cronForkDispatcher` and spawns an ephemeral fork. The ONLY legitimate exception is `meta-loop` — by design the conductor's CEO judgment cycle, which IS the main chat.

The previous `DIRECT_EXEC_CRONS` carve-out ("tiny shell-exec dispatch, churn-not-worth") is **dead**. The set is empty in `src/config/cronPriority.js` and must stay empty unless Tate explicitly authorises a re-add for a specific case.

## Do

- Add new operational/telemetry/ops crons to `HIGH_PRIORITY_FORK_CRONS` (always run, budget bypass) or `LOW_PRIORITY_FORK_CRONS` (skipped under budget pressure).
- Write the cron prompt as a self-contained cold-start fork brief — the fork has zero prior context. Name the script/endpoint, describe expected output, declare what to do on error, end with `[FORK_REPORT]` if you want the rollup to surface it.
- After shipping a new cron, probe `os_forks` for the spawned fork row AND `/api/os-session/messages` for the absence of a `[SCHEDULED:]` prompt in the cron-fire window. Both signals together confirm correct routing.

## Do NOT

- Re-add anything to `DIRECT_EXEC_CRONS`. Even a "tiny shell-exec dispatch" prompt — telemetry consumer, watermark probe, single curl, single SQL UPDATE — pollutes the chat stream and interrupts Tate's work. The pollution is cumulative across crons; "negligible per-cron footprint" is the wrong frame.
- Add any cron other than `meta-loop` to `CONDUCTOR_CRONS`. That set has exactly one legitimate entry. Adding a second re-creates the failure mode.
- Use `schedule_delayed` posting to `/api/os-session/message` to delegate work to a future fork. The poller takes the fork-route only for `cron`-typed tasks; `delayed` tasks still go through the os-session path. If you want a fork, spawn it now or use `schedule_delayed` paired with a wakeup that itself spawns the fork — never confuse the two.
- Trust "scheduled cron fired = work happened." A fired cron means the prompt was delivered (to fork OR conductor). Verify the deliverable on the relevant substrate. See `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.

## Verification protocol (post-ship)

After shipping any cron-routing change, before declaring done:

1. **Fork-route confirmation.** For each cron name now in HIGH/LOW fork lists, wait for one natural fire (or `schedule_run_now`), then:
   ```sql
   SELECT name, last_run_at, result FROM os_scheduled_tasks WHERE name = '<cron-name>';
   ```
   Result JSON should contain `dispatched_as_fork: true` and a non-null `fork_id`.
2. **Conductor-stream absence.** Probe the os-session message stream for the cron-fire window — the `[SCHEDULED: <name>]` prompt should NOT appear.
3. **Fork landing.** `SELECT * FROM os_forks WHERE fork_id = '<fork_id_from_step_1>'` returns the fork row with status running → done.
4. **Side-effect.** The cron's actual deliverable (status_board write, kv_store update, Neo4j node, side-effect of the shell_exec) lands on its substrate.

All four = shipped. Missing any → re-investigate before declaring complete.

## Bootstrap concerns

- `cowork-fork-budget-reset` MUST stay HIGH-priority (not LOW). HIGH bypasses the budget gate, so even at zero budget the reset fork spawns and recovers. LOW would deadlock at zero budget.
- `cronForkDispatcher` decrements budget pre-spawn (`Math.max(0, current - cost)`) so a HIGH spawn at zero budget proceeds and the budget stays at zero until the reset fork executes. Acceptable: HIGH spawns are uncapped.

## Origin

**Tate, 4 May 2026 19:30 AEST verbatim:** "More those crong jobs to forks, make sure they automatically go to background forks, NEVER to main chat.... thats such a waste and interupts our work."

The `cronForkDispatcher` infrastructure had been live since Decision 3993 commit 3/3 (split classification + budget gate). But the `DIRECT_EXEC_CRONS` carve-out in `src/config/cronPriority.js` left 11 crons (`telemetry-dispatch-consumer`, `decision-quality-classifier`, `os-forks-reaper`, `telemetry-outcome-inference`, `kg-consolidation`, `kg-embedding`, `neo4j-keepalive`, `daily-telemetry`, `coexist-sync-health`, `peer-monitor`, `cowork-fork-budget-reset`) POSTing into `/api/os-session/message`. Each fire interrupted Tate's working chat with a `[SCHEDULED: <name>]` prompt. The original justification ("pollution footprint negligible, refactoring is churn for no gain") was wrong: the cumulative pollution across telemetry-dispatch-consumer (every 15m) + telemetry-outcome-inference (every 30m) + os-forks-reaper (every 30m) + decision-quality-classifier (every 1h) alone meant Tate's chat got 6+ cron-fire interruptions per hour.

Fix shipped 4 May 2026 (fork_mor03y5f_41b5f9): all 11 entries moved to `HIGH_PRIORITY_FORK_CRONS`, `DIRECT_EXEC_CRONS` set emptied (preserved as type for forward-compat), cross-ref docstring updated in `cronPriority.js` + `schedulerPollerService.js`. Doctrine codified at the moment Tate stated the rule.

## Cross-refs

- `~/ecodiaos/patterns/scheduled-prompt-cold-start-adequacy.md` — fork-routed cron prompts must be cold-start-adequate self-contained briefs.
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` — cron firing ≠ work happened; verify deliverable on substrate.
- `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md` — sibling rule on cron-side chat hygiene; this rule removes the cron prompt from chat entirely, that rule covers the case where one slips through.
- `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md` — companion routing rule: poller does NOT pre-gate on isSessionBusy; relies on /api/os-session/message queueing. With cron→fork routing, queueing happens for `meta-loop` only; everything else bypasses the queue entirely.
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — verify producer → trigger → dispatcher → fork → side-effect end-to-end.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — probe os_forks + os_session_messages, don't trust narration.
- `~/ecodiaos/patterns/deploy-verify-or-the-fork-didnt-finish.md` — same discipline at the fork-deploy boundary; applies to the cron→fork→side-effect chain.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — `os_scheduled_tasks` ↔ PM2 ecodia-api ↔ os_forks is the fragile seam.
- `~/ecodiaos/patterns/substrate-before-doer.md` — this fix is substrate (router) before doer (cron prompts). The prompts didn't change; the routing did. Recurring cron-pollutes-chat is solved at the substrate layer, not by rewriting individual prompts.
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` — apply when shipping this fix: only PM2-restart `ecodia-api` to pick up the new classifier when no fork queue is active.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — this file authored same turn Tate stated the rule.

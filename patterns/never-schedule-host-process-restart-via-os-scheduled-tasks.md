---
triggers: scheduled-pm2-restart, schedule_delayed-pm2-restart, post-trim-restart, post-restart-verify, self-kill-cascade, scheduler-inside-kill-target, ecodia-api-self-restart-cron, restart-loop-root-cause, scheduled-shell_exec-pm2, host-process-restart-via-cron, os_scheduled_tasks-pm2, conductor-self-kill, in-flight-fork-orphan-via-cron, detached-restart-job, atd, systemd-timer, host-crontab, out-of-band-restart
---

# Never schedule a pm2_restart of ecodia-api via os_scheduled_tasks - the cron poller runs inside the kill target

## The rule

`os_scheduled_tasks` rows fire from `schedulerPollerService` which runs as a function INSIDE the `ecodia-api` PM2 process. Any task body that issues `pm2 restart ecodia-api` (directly via `shell.shell_exec`, indirectly via `mcp__vps__pm2_restart`, or via a wrapper script) executes its kill-the-host-process side effect from within the host process it is killing. The kill is therefore self-targeting - it tears down (a) the cron poller that fired the task, (b) the conductor session that scheduled the task, (c) every in-flight fork the conductor had spawned, and (d) any subsequent task in the same scheduler poll batch.

Schedule the restart out-of-band (atd, host-level systemd timer, OS crontab, an external supervisor) or perform it interactively from the conductor session where you can pre-stage briefs and survive the cycle. Never via `os_scheduled_tasks`.

## Why the failure mode is structural, not a bug

The scheduler is hosted by the very process it can be asked to kill. There is no clean way to make a self-targeting restart safe within that architecture:

- A "graceful" pm2 restart still SIGTERMs the api process. The cron poller is a function inside the same process. It dies mid-task-execution.
- If the task does work AFTER the restart command (e.g. `pm2 restart ecodia-api && curl -X POST /api/os-session/save-state`), the && chain dies with the parent.
- A "post-restart-verify" task scheduled to fire 5 min after the kill task runs in a NEW api process whose checkout is whatever HEAD pointed to at restart time - if a sibling fork was mid-branch-switch, the post-restart task verifies a state nobody intended to ship.
- In-flight forks are children of the killed api. They orphan with `status='spawning'` or hang mid-tool. Their work is lost; their state-store narration ("I shipped X") becomes phantom.

The ecodia-api restart loop of 1 May 2026 (9 restarts overnight) was caused by exactly this self-kill cascade. Two delayed tasks - `post-trim-restart-ecodia-api-2026-05-01` and `post-restart-verify-trim-2026-05-01` - fired in sequence at 03:02:05Z and 03:07:01Z UTC. Each killed its own conductor and orphaned forks; the second ran `git revert` against a now-detached HEAD that the restart had left in an unintended state.

## The right substrates for restart scheduling

| Substrate | Use for | Why safe |
|---|---|---|
| Host crontab (`crontab -e` as `tate`) | Recurring nightly restarts (e.g. 03:00 AEST patch cycle) | Runs from cron daemon, not from inside ecodia-api. Survives any api state. |
| `atd` (`echo 'pm2 restart ecodia-api' \| at now + 30 minutes`) | One-off delayed restarts | Same. atd queue is OS-level, independent of the api. |
| systemd timer | Recurring with start/stop semantics | Same. systemd is the supervisor of PM2 (or its grandparent), not its child. |
| Conductor session (interactive) | Restarts coupled to live decision-making | Conductor pre-stages briefs in `kv_store` per `pre-stage-fork-briefs-before-session-killing-ops.md`, executes pm2_restart, new session reads handoff and resumes. |
| `os_scheduled_tasks` shell_exec'ing pm2_restart | NEVER | Self-kill cascade. |

## Do

- For nightly or recurring ecodia-api restarts: edit `crontab -e` (host-level), not `schedule_cron`.
- For one-off "restart in N minutes after I do X" cases: use `at` from `shell_exec` once, never `schedule_delayed`. Example: `shell_exec 'echo "pm2 restart ecodia-api" | at now + 15 minutes'`.
- For interactive restarts where you want the new session to pick up where you left off: pre-stage briefs in kv_store per `pre-stage-fork-briefs-before-session-killing-ops.md`, save handoff state, then issue `pm2_restart` directly from the live conductor session (not via the scheduler).
- Audit `os_scheduled_tasks` regularly for any row whose `prompt` or `task` field contains `pm2 restart ecodia-api`, `pm2_restart('ecodia-api')`, `mcp__vps__pm2_restart`, or wrapper script names that include a restart. Cancel them and re-schedule out-of-band.
- When killing the api in any way (deploy, patch, manual restart) check `mcp__factory__get_factory_status` AND `mcp__forks__list_forks` first - per `no-pm2-restart-during-active-factory-queue.md`. Out-of-band scheduling does not fix the in-flight-fork orphan problem; it only fixes the self-kill of the conductor that scheduled the task.

## Do not

- Do NOT call `schedule_delayed` or `schedule_cron` with a body that includes `pm2 restart ecodia-api`. Same for any wrapper that ends up doing it.
- Do NOT schedule a "verify after restart" task via `os_scheduled_tasks` either - the verifier runs in the new api process whose state is unknown, and the conductor that scheduled it is gone. Use `at` for the verifier as well, with a deterministic check that does not assume any specific in-flight session is alive.
- Do NOT schedule git operations (`git revert`, `git checkout`, `git reset --hard`) via `os_scheduled_tasks` if they will run on a working tree that may be mid-branch-switch by a sibling fork. Per `stash-and-clean-when-finding-sibling-fork-unsafe-state.md`, branch operations against a contaminated working tree wipe sibling work.
- Do NOT assume a "graceful" pm2 restart spares the cron poller. PM2's graceful restart still SIGTERMs the process. The poller is a function inside it.
- Do NOT defer this rule to "the scheduler should detect self-kill operations and reject them". That is a desirable infrastructure patch but is not a substitute for the discipline. The patch may not exist; the discipline must.

## Detection (one-shot audit)

```sql
SELECT id, name, type, status, prompt
FROM os_scheduled_tasks
WHERE status = 'active'
  AND (prompt ILIKE '%pm2%restart%ecodia-api%'
       OR prompt ILIKE '%pm2_restart%ecodia-api%'
       OR prompt ILIKE '%mcp__vps__pm2_restart%');
```

Any row returned: cancel via `schedule_cancel` and reschedule via `at` or host crontab.

## Origin

1 May 2026, 13:00-13:18 AEST investigation. ecodia-api had restarted 9 times during the previous night (last restart 03:15 UTC). Two completed `os_scheduled_tasks` rows traced as root cause:

- `post-trim-restart-ecodia-api-2026-05-01` (delayed, fired 2026-05-01T03:02:05Z): unconditional `shell_exec 'pm2 restart ecodia-api'`. Killed the conductor session that had scheduled it.
- `post-restart-verify-trim-2026-05-01` (delayed, fired 2026-05-01T03:07:01Z): `git revert <commit> && pm2 restart ecodia-api`. Ran in a new api process; the git revert hit a detached HEAD left by the prior restart's mid-branch-switch state. Triggered another restart.

Earlier 01:04-01:32 UTC cluster of restarts traced to similar prior-session scheduled tasks (Decision node "Ecodia-api restart loop root cause = self-killing scheduled tasks 1 May 2026").

The tasks were authored by an earlier conductor session that wanted "trim CLAUDE.md, then restart api to load the trim, then verify". The right architecture would have been: conductor pre-stages the verify brief in kv_store, issues pm2_restart from the live session, new session reads the handoff and runs the verify itself. The wrong architecture (the one chosen) was to schedule the restart and the verify as `os_scheduled_tasks`, which put both inside the kill target.

Stamped: fork_momsy3wu_28b87b, 1 May 2026 21:00 AEST codification scan.

## Cross-references

- `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md` - the manual-restart sibling rule. Check Factory queue before any pm2_restart, scheduled or interactive.
- `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` - the right-way-to-restart-interactively rule. Pre-stage briefs, save handoff, then kill from the live session.
- `~/ecodiaos/patterns/grace-timer-must-not-kill-chat-session.md` - the sibling rule for in-process timers that should not tear down their host. Same architectural class: a thing inside the api should not kill the api by default.
- `~/ecodiaos/patterns/scheduled-redispatch-verify-not-shipped.md` - sibling rule for cron-fired redispatches. Cron-fired pm2_restart shares the failure-class of cron-fired redispatch (fires after world has moved on), but this rule is stricter: never schedule the kill at all, regardless of freshness.
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` - cron-fired tasks must produce deliverables; this rule says cron-fired pm2_restart produces a self-kill, not a deliverable.
- `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` - sibling rule for git operations against contaminated working trees. Scheduled git revert + restart hit this exactly.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the architectural meta-frame. The scheduler-inside-the-kill-target is one of the hardest substrate seams in EcodiaOS.

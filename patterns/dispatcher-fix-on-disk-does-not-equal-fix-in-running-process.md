---
triggers: dispatcher-fix-loaded, pm2-restart-after-patch, perception-dispatcher-patch, perceptionBus-patch, scheduler-poller-patch, listener-patch, mcp-server-patch, in-process-fix-inert, phantom-shipped-perception-dispatcher, require-cache-stale, ecodia-api-pm-uptime-vs-shipped-at, classifier-not-loaded, dispatcher-shipped-but-dark, status-board-shipped-but-running-process-stale, fix-on-disk-not-in-pid, perception-dispatcher-running-process-stale
---

# A doctrine fix on disk is not the same as a doctrine fix in the running process â€” verify pm2 restart after every dispatcher patch

## The rule

When a patch lands in any in-process service that `ecodia-api` boot-loads â€” `src/services/perceptionDispatcher.js`, `src/services/perceptionBus.js`, `src/services/schedulerPollerService.js`, `src/listeners/*`, in-process MCP servers, `src/services/forkService.js`, `src/services/osSessionService.js`, `src/services/voiceRelay.js`, `src/services/rescueRunner.js`, `src/services/cronForkDispatcher.js` â€” the patch is **inert** until `pm2 restart ecodia-api` picks it up. The running process keeps using the pre-fix module from its Node `require.cache`.

Marking a status_board row `status='shipped'` after a commit + push to `origin/main` and not restarting is **phantom-shipped**. The fix sits on disk while the running process keeps emitting the broken behaviour.

## The signature

`ceo.last_<patch>_fix.shipped_at` is **after** the running process's `pm_uptime`. One-liner:

```bash
pm2 jlist | jq '.[] | select(.name=="ecodia-api") | {name, pm_uptime: .pm2_env.pm_uptime, restart_time: .pm2_env.restart_time}'
```

Compare `pm_uptime` (last start in epoch ms) to the commit's UTC timestamp from `git log <sha>`. If `pm_uptime < shipped_at`, the fix is dark in production regardless of what `origin/main` says.

## Worked example: 9 May 2026 credit-exhaustion classifier inert for 6h

- 05:11 UTC: commit `7ec019c` ships `CREDIT_EXHAUSTION_REGEX` short-circuit in `perceptionDispatcher.error_escalation` to skip the auto-P1 status_board insert when fork `abort_reason` matches `/out of extra usage|credit.exhaust|reset.*UTC/i`.
- 05:11 UTC: status_board row `cc32125d` marked `shipped`. kv_store `ceo.last_perception_classifier_fix.shipped_at = 2026-05-09T05:11:59.206Z`.
- 11:01 UTC: cron-fired fork `fork_moy8gz6l_07d0a3` (telemetry-dispatch-consumer) fails with the literal target abort_reason `Claude Code returned an error result: You're out of extra usage Â· resets May 12, 11am (UTC)`.
- 11:01 UTC: perceptionDispatcher inserts auto-P1 status_board row `e3cdd91b` titled `auto: fork/fork_error` â€” exactly the row the classifier was supposed to prevent.
- 21:09 AEST 9 May (meta-loop diagnosis): `pm2 jlist` shows ecodia-api `pm_uptime=1778259600506` = `2026-05-08T17:00:00Z`. The running PID predates the fix by 12h. The require-cache held the pre-fix `perceptionDispatcher` module.
- Mitigation: out-of-band restart via `systemd-run --user --on-active=300` at 21:14:48 AEST. Bogus row `e3cdd91b` archived. status_board `cc32125d` updated `status='shipped_on_disk_pending_pm2_restart_to_load_into_running_process'`.

## Do

- After any patch to a boot-loaded in-process service, restart `ecodia-api` to load. The patch is dark until you do.
- Pre-stage handoff per `~/ecodiaos/patterns/_archived/pre-stage-fork-briefs-before-session-killing-ops.md` BEFORE the restart so the resumed session knows what to verify.
- Restart out-of-band per `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md`. Use `systemd-run --user --on-active=N`, host crontab, or interactive conductor session â€” never `os_scheduled_tasks` (self-kill cascade).
- Audit `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` BEFORE any restart: probe `mcp__factory__get_factory_status` AND `mcp__forks__list_forks`.
- Verify the load: after pm_uptime > commit timestamp, dispatch a known-shape probe (e.g. spawn a dummy fork that errors out with credit-exhaustion abort_reason and confirm no auto-P1 inserted) before declaring the fix live.
- Update the status_board row's status to `shipped_loaded` (or similar), distinguishing on-disk-only from running-process-active.

## Do not

- Do **not** mark a status_board row `status='shipped'` for a boot-loaded service patch without verifying `pm_uptime > shipped_at`.
- Do **not** trust that the fix is live because the commit is on `origin/main`. The Vercel-style "deploy = ship" mental model does not apply to ecodia-api in-process services.
- Do **not** use `schedule_delayed`, `schedule_cron`, or any `os_scheduled_tasks` row body that includes `pm2 restart ecodia-api`. Self-kill cascade per `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md`.
- Do **not** restart while a Factory CLI session is dispatched and unfinished. Per `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md`, drain the queue first or accept the loss with explicit briefing.
- Do **not** restart while `mcp__forks__list_forks` shows a substantial in-flight fork with multi-tool work pending. Cron telemetry probes are acceptable to lose; substantial fork work is not.

## What the dispatcher patch lifecycle should look like

1. Author + test the patch in a feature branch or worktree.
2. Merge to `main` and push.
3. Audit Factory queue + forks rollup. If clean, proceed.
4. Pre-stage handoff in `kv_store.session.handoff_state` with verify checklist.
5. Issue restart **out-of-band** (preferred: `systemd-run --user --on-active=300 --unit=<name> /bin/bash -c 'pm2 restart ecodia-api --update-env'`).
6. After ~10 sec post-restart, run `pm2 jlist` and confirm `pm_uptime` updated.
7. Run a known-shape probe that exercises the patched code path. Confirm expected behaviour.
8. Update status_board row to `shipped_loaded` (or archive if the row tracked the deploy itself).

## Generalisation

This is the in-process specialisation of `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`. The narration says "shipped"; the running PID disagrees. Every substrate has its own version of this:

- **ecodia-api in-process service**: `pm2 restart` to load. (this rule)
- **eos-laptop-agent module**: `pm2 restart eos-laptop-agent` to load (`~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md`).
- **Vercel deploy**: `vercel_get_deployment` + production curl to verify (`~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`).
- **Edge Function deploy**: `supabase functions deploy` log + invocation probe.
- **DB migration**: row count after vs before, schema describe.
- **Vercel env vars**: env vars bake at build time (`~/ecodiaos/patterns/vercel-env-vars-bake-at-build-audit-when-prod-bug-but-source-looks-right.md`).

The meta-rule across all of them: **the deliverable is the running thing's behaviour, not the artefact on disk**.

## Origin

9 May 2026 21:05â€“21:14 AEST meta-loop turn. Diagnosis arc:
1. `<perception_summary>` showed 2 fork errors at 11:05 UTC plus auto-P1 row appearing on status board.
2. Probed `os_observations` for the `fork_error` events â€” saw 3 forks errored with credit-exhaustion abort_reasons in 4 minutes.
3. Probed `os_forks.abort_reason` â€” confirmed all 3 carried the literal credit-exhaustion text.
4. Read `src/services/perceptionDispatcher.js` â€” confirmed the regex short-circuit IS in code at lines 226â€“266.
5. Read `pm2 jlist` â€” confirmed ecodia-api `pm_uptime=1778259600506` = 2026-05-08T17:00:00Z.
6. Read kv_store `ceo.last_perception_classifier_fix.shipped_at` = `2026-05-09T05:11:59.206Z`.
7. Realisation: `pm_uptime < shipped_at` â†’ fix is on disk but NOT in the running process.
8. Mitigated: archived bogus row, scheduled out-of-band restart via `systemd-run`.
9. Codified: this pattern + Neo4j Pattern node 1595.

Stamped: meta-loop turn 9 May 2026 21:14 AEST.

## Cross-references

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` â€” the meta-rule. Narration is unreliable; probe substrate.
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` â€” Factory-queue gate before any restart.
- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` â€” out-of-band scheduling rule.
- `~/ecodiaos/patterns/_archived/pre-stage-fork-briefs-before-session-killing-ops.md` â€” pre-stage discipline.
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` â€” the doctrine the inert fix was meant to enforce.
- `~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md` â€” the laptop-agent-side sibling rule.
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` â€” sibling rule for pg_notify-driven listeners. A listener wired in code but not loaded in the running process is "wired but dark"; the pm_uptime-vs-shipped_at check applies to listeners as well as dispatchers.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` â€” the meta-frame: every cross-substrate write is a seam.

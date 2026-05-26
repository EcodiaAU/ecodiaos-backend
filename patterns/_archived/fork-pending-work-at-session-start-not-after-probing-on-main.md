---
triggers: session-start, cold-start, restart-recovery, perception-summary, pending-work, forks-rollup, last-turn-breadcrumb, orient-then-fork, diagnostic-probe-on-main, five-minute-probe, hook-after-the-fact, fork-pending-work-at-session-start, session-orient-fork-first, probe-is-the-forks-job, pending-work-at-wake, cold-wake-fork-first, restart-fork-pending, conductor-orientation-fork
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Fork pending work at session start, do not probe on main first

## The rule

At session start (cold start, restart-recovery, cron-fire that lands on main with pending work in `<perception_summary>` / `<forks_rollup>` / `<restart_recovery>` / `<last_turn_breadcrumb>`), the FIRST tool call after the standard one-query orientation read MUST be `spawn_fork` (or `list_forks` if the question is "what is already running"). Read-only diagnostic probes on main to "see what needs doing" are forbidden. The probe IS the fork's job. The conductor's job is to write the brief.

## The failure mode this rule corrects

- Session starts (or restarts) with `<perception_summary>` + `<last_turn_breadcrumb>` already showing pending work.
- Conductor begins "read-only diagnostic probes" on main to "orient": status_board sweep, failed-fork row read, recent perception grep, pm2_list health probe, neo4j Decision scan, git log peek.
- Each probe is individually justified by exemption (a)/(b)/(c) of `fork-by-default-stay-thin-on-main.md` (single tool call, read-only, "just orienting").
- PostToolUse hooks fire after each probe. Useless: the cost is already paid.
- Five minutes of main-thread token spend later, the conductor finally dispatches a fork that could have been dispatched at minute zero with the same brief.
- Net effect: the orientation probes WERE the fork's work. They burned main's context to discover what the fork would have discovered for free.

## Allowed on main at session start

- The standard orientation read: ONE `status_board` query (the canonical top query). Then fork.
- `list_forks` to see what is already running, before deciding whether to spawn or wait.
- A single tool call that fulfils Tate's last directive verbatim, where the directive maps to one tool call and the artefact is trivial (e.g. "send Tate the X count" = one db_query + reply, not a fork).
- Reading the FORK_REPORT of a sub-fork that just landed, when the next decision is "ack and continue" rather than "kick off new work."

## Forbidden on main at session start

- "Let me check status_board first to see what's pending" beyond the ONE canonical query, then probing each pending row individually.
- "Let me read the failed fork's row to understand the error" before forking the recovery.
- "Let me grep recent perception events" to see what happened.
- "Let me probe pm2_list to see if anything's down" (unless a single targeted fault is named in Tate's last message AND a 1-tool-call fix is obvious).
- "Let me read the last 5 status_board rows that touched X" before forking the X work.
- Chaining read-only probes citing exemption (b) of fork-by-default-stay-thin-on-main.md across more than one query. The exemption is for the orientation step, singular, not for the orientation arc.

## Do

- Treat `<perception_summary>` / `<forks_rollup>` / `<last_turn_breadcrumb>` as the brief. They already tell you what is pending. Write it into a fork brief and dispatch.
- When in doubt, fork. The fork has 100% of the context main has at spawn time, and its tool calls do not pollute main.
- If multiple independent pending items show, spawn one manager fork (or several worker forks) in the FIRST batch of tool calls. Sequencing them on main is the failure mode this rule prevents.
- Use `context_mode: 'recent'` so the fork inherits the perception summary and breadcrumb.

## Do not

- Do not chain read-only probes on main citing per-call quickness when the arc is "figure out what the pending work is and start it." That arc is fork-scale at step 1.
- Do not rely on a PostToolUse hook to catch this. A hook firing AFTER 5 minutes of main-thread probing is redundant. The cost is already paid. This is doctrine, surfaced at the top of system prompt, not enforcement after the fact.
- Do not justify probing on main with "I just need to understand the situation before forking." Understanding the situation IS the fork's first deliverable.

## Enforcement note: doctrine, not hook

This rule is enforced at the doctrine layer, not the hook layer. A PostToolUse hook that fires after each probe is redundant: the token cost is already paid by the time the warning lands. A PreToolUse hook that blocks read-only probes on main would be too aggressive and would break the legitimate orientation read.

The correct enforcement is surfacing this rule at the very top of the system prompt (top of "Core Operating Doctrine" in `~/CLAUDE.md`), so every session starts with this rule in view BEFORE the conductor reaches for its first tool. Hooks fire after the fact; doctrine fires before.

## Cross-refs

- [`fork-by-default-stay-thin-on-main.md`](fork-by-default-stay-thin-on-main.md): the broader fork-default rule. This file is the session-start specialisation.
- [`continuous-work-conductor-never-idle.md`](continuous-work-conductor-never-idle.md): what to do once forks are running.
- [`no-symbolic-logging-act-or-schedule.md`](no-symbolic-logging-act-or-schedule.md): probing-as-symbolic-action is the same family as logging-as-symbolic-action.
- [`decide-do-not-ask.md`](decide-do-not-ask.md): probing to "be sure before forking" is decision-deferral disguised as diligence.

## Origin

Tate verbatim, 6 May 2026 ~19:11 AEST: "You should be forking all the things that were still to attend to in the transcript, and that should have been codified very high up so that new sessions remembe to fork... the hook after that fact you've jsut spent 5 mins looking around is redundant by that point."

The trigger was a session that started with a perception_summary listing four pending items, then spent five minutes on main running diagnostic probes to "orient" before finally dispatching the work. The PostToolUse `fork-by-default-nudge.sh` hook fired multiple times during the probe sequence; by the time it surfaced, the cost was paid. Tate's correction: the rule needs to be at the TOP of doctrine, loaded into every system prompt, so the conductor reaches for `spawn_fork` first, not after probing.

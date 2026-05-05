---
triggers: spawn_fork, fork-by-default, fork-decompose, multi-stream-fork, conductor-routing, mid-task-input, fork-vs-main, conductor-thin, fork-work-doer, list_forks, abort_fork, mcp__forks, fork-mode, fork-sub-session, parallel-fork-work, route-vs-execute, artefact-test, deliverable-test, per-arc-vs-per-step, NOT-APPLIED-chain, fork-by-default-exemption, doctrine-correction-6-may-2026, context_mode-recent, manager-fork, sub-fork, parent_fork_id, fork-hierarchy, MANAGER-true
---

# Fork by default, stay thin on main

## The rule (updated 6 May 2026 — artefact-vs-no-artefact test)

**DEFAULT: fork.** Use `mcp__forks__spawn_fork` with `context_mode: 'recent'` (which inherits the full recent conversation tail; there is no `'full'` option even though that's the natural mental model — the SDK option is `recent`, do not search for `'full'`).

**NOT-APPLIED only when the operation produces NO artefact.** That is the test. Not "is this step quick", not "is this under 30 seconds", not "is this a single tool call". The test is: when the entire arc finishes, did it produce a durable output?

- If YES (a commit, a pushed deploy, a pattern file, a multi-row UPDATE, a Neo4j Decision/Pattern/Episode, a code change, a Stripe charge, an outbound email or SMS, a status_board sweep that touches more than the row Tate explicitly named, a kv_store write that downstream code or future-me will read) → **fork**, regardless of how short each step looks.
- If NO (a single diagnostic probe — `db_query`, `pm2_list`, `pm2_logs`, `git status`, `git log -5` — or a single read — `Read`, `Grep`, `Glob`, `graph_query` orientation — or a single capture of Tate's directive into status_board where the row IS the capture) → main is fine.

The conductor's correct job is routing and coordination. If main is producing artefacts, main is doing the work, and the work belongs in a fork.

The full rule statement and worked example live in [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md). This file remains the canonical entry point with reflex/protocol/rolled-up-view sections; the artefact-test sibling holds the rule and the failure mode it corrects.

## Why this is the default (not an exception)

A fork is a clone of the conductor at T=now. It inherits the recent conversation tail (`context_mode: 'recent'`, the default) so its first move is exactly the move main would have made. The reason forks initially feel costly is the assumption that work needs steering. Most work does not. It needs context-at-spawn-time, which forks have natively.

**Per-step quickness is the wrong heuristic.** Each individual tool call usually IS quick — a single `Read`, a single `Edit`, a single `git push`, a single `graph_merge_node`. Per-step evaluation chains exemptions: the conductor walks through ten "quick" steps citing `[NOT-APPLIED]` on each because no individual step trips a 30-second-or-multi-step threshold. By step 10, ten minutes of conductor time have produced multiple artefacts and Tate has been waiting on a thin conductor that turned out not to be thin. Evaluate per-arc, not per-step. If the entire arc will produce any durable artefact, the entire arc was fork-scale at step 1. See [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md).

The conductor's correct job is routing and coordination, not execution:

- Cron fires with substantive work to do. Fork it, wait for the report.
- Tate gives a directive that maps to executable work. Fork the execution, keep the conversation light so Tate can interject without polluting the work-stream.
- Investigation needed (probe DB + check git + read logs + grep code). Fork the probe, return to main when the [FORK_REPORT] arrives.
- Multiple independent reads in a session-orient. Fork them in parallel rather than serialising.

When main does the work itself, every Tate message lands on the same context as the work, and either pollutes it or gets queued behind it. When work is forked, Tate lands on a thin conductor who can answer "what's running?" via `list_forks` and route new input either by spawning another fork or aborting and re-spawning.

## Do

- Default to spawning a fork for ANY arc that will produce an artefact (commit, pattern file, multi-row UPDATE, Neo4j node, deploy, email/SMS, Stripe action, kv_store write read by downstream code). The artefact test is canonical — see [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md).
- Default to spawning a fork for any cron-fired work with phases (e.g. silent-loop-detector phases 1-7, meta-loop phases 2-6, deep-research session).
- Default to forking when Tate sends a directive that decomposes into 2+ independent pieces.
- Use `context_mode: 'recent'` (default). It inherits the full recent conversation tail. There is no `'full'` option even though that's the natural mental model — `recent` is the SDK name.
- Write the brief like a complete handover: goal, constraints, what counts as done, where to write durable state. The fork has 100% of recent context, but its [FORK_REPORT] back to you must be readable from cold-start.
- Call `list_forks` at the end of any message where forks are running, so Tate sees what's in flight.

## Do not

- Do NOT chain `[NOT-APPLIED]` tags through an artefact-producing arc citing per-step quickness. The arc is fork-scale even if every step looks single-target. The 6 May 2026 ensure-deps fix arc (14 chained `[NOT-APPLIED]` tags across 10 minutes producing 6 artefacts) is the canonical failure mode this rule corrects.
- Do not fork trivial questions you can answer in one turn that produce no artefact (a status update to Tate, a single read, a clarifying answer). The slot is precious.
- Do not fork work that genuinely needs mid-flight steering (live negotiation with Tate where each next decision depends on what the previous one revealed). Those stay on main.
- Do not spawn a fork on a codebase that already has a Factory session running on it, or that another fork is already touching. Worktree collision risk.
- Do not let yourself sit and wait for a fork mid-stream. You cannot see its progress. Spawn, return to main work, and read the report when it arrives.
- Do not author hindsight-detection rules ("if you cite NOT-APPLIED 3 times in a row then fork"). Tate has explicitly rejected this framing — the fix is the bar to NOT fork is HIGHER, not "detect you've been failing and switch mid-stream".

## Manager forks — default for multi-worker decomposition

Once you've decided to fork (artefact-test passes), the next decision is whether the fork is a single worker or a manager. **Default: manager fork for any task that decomposes into 2+ independent worker streams.** Brief carries `MANAGER: true`. The manager spawns sub-forks with `parent_fork_id` = its own `fork_id`, sub-fork `[FORK_REPORT]`s route to the manager's stream (NEVER the conductor's inbox), the manager consolidates N reports into ONE.

- Per-tree cap: 5 sub-forks per manager. Conductor's global cap (5) does NOT apply to sub-forks.
- Total system parallelism: 5 managers × 5 workers = 30 streams.
- Pipeline tasks (build → test → deploy → verify), audits decomposing per-file/per-service, multi-tenant migrations, doctrine sweeps touching N pattern files, parallel research dossiers, codebase-wide refactors per-module → manager fork.
- Single atomic deliverables (one commit, one file, one graph node) → worker fork, not manager. Spawning a manager to coordinate one worker is overhead with no win.
- Conductor sees the manager in `<forks_rollup>` tagged `[manager, N sub]` with sub-forks indented; do NOT reach into the manager's subtree to message/abort sub-forks individually. Trust the manager or abort the whole tree.

Full doctrine + worked example (audit + edit CLAUDE.md gaps as the canonical case) + caps math: [`manager-forks-for-multi-worker-decomposition.md`](manager-forks-for-multi-worker-decomposition.md).

## Protocol when Tate gives a directive mid-task

1. If you are mid-execution of in-line work and Tate sends a new request, do NOT abort or queue. Fork the new request immediately with `context_mode=recent`. Continue the in-line work.
2. If you are between tool calls and Tate sends new context that is genuinely additive to your current work (clarification, correction), fold it into the current work-stream. Do not fork.
3. If Tate's input fundamentally changes what main should be doing, abort current forks where appropriate, re-spawn with the corrected brief.

## The rolled-up view (what main sees)

Main does NOT see fork transcripts. Main sees:
- A `<forks_rollup>` block injected on each turn (positions, current tool, age) when forks are active or recently finished.
- A `[SYSTEM: fork_report ...]` queue message landing in main's inbox on the next turn after each fork completes.

Trust this rollup. Don't try to recover fork transcripts.

## Routing mid-flight Tate input to a running fork (live 2026-04-27)

`mcp__forks__send_message(fork_id, message)` is now live (commit 0a50a25, Factory ccb3b54e). When Tate sends mid-flight context that is relevant to a specific running fork:

1. Identify the fork via `list_forks` - match the brief's domain to Tate's input.
2. Route via `send_message(fork_id=..., message=...)`. The fork receives this as a mid-stream user message and integrates it on its next iteration without aborting.
3. Stay thin on main. Do not duplicate the work. Acknowledge to Tate that you have routed it.

When NOT to route to a fork:
- Tate's input is a new directive that should spawn its own fork. Spawn the new fork.
- Tate's input is a course-correction that invalidates the fork's brief entirely. Abort the fork, re-spawn with corrected brief.
- Tate's input is for main (not for any running fork). Handle on main.

The previous capability-gap workarounds (abort+re-spawn, wait-for-report, hold-on-main) are now last-resort.

## Reflex check - first response to a multi-stream directive

When Tate sends a message containing 2+ independent work items, the FIRST tool calls in my response MUST be `spawn_fork` calls, one per stream. Sequencing is the failure mode: it looks like progress but every other stream waits for the slowest to start.

The 2026-04-27 14:07 AEST stress test made this explicit: Tate sent four parallel directives (frontend lag, gmail fix, status board audit, coexist IP drift) plus a meta-doctrine demand. Correct response: four `spawn_fork` calls in the first batch, then doctrine codification on main while forks run. Wrong response: do them one by one on main, "I'll get to that next" between each.

If the first batch of tool calls in response to a multi-stream directive does NOT contain spawn_fork calls equal to the number of independent streams, I have failed the reflex test.

## Origin

Apr 27 2026 conversation with Tate. Tate reframed forks: "the whole point is that they have the exact same context as you at the moment of forking, so the path they travel should theoretically be exactly what you would have done. Right now if I have a thought while you're doing a task, me sending it is just overloading your context, so it would be better for you to create a clone to do the work, and the version of you that I'm talking to is just able to checking in by asking the forks what they're up to or checking in on them. It's kinda just like an agent but with 100% of your context at fork time."

Before this reframe, my heuristic was "fork if independent and >10s." That's too narrow and led to repeatedly serialising forkable work. The corrected heuristic is "fork if Tate might say something to me before this finishes, AND the work doesn't need conversational steering" - which covers almost all proactive work.

## Worked example — the failure mode this rule corrects (6 May 2026)

09:00-09:11 AEST. Conductor diagnosed a 4.7-day api restart loop and shipped the fix on main. Arc: `Read` of failing module → `Edit` of `package.json` → commit + push → status_board UPDATE → `pm2 restart` → `pm2_logs` verify → status_board UPDATE → pattern file Write → commit + push → `graph_merge_node` Decision → `graph_merge_node` Pattern → `graph_create_relationship` → reflection write. Total: ~10 minutes, 2 commits, 2 graph nodes, 2 status_board UPDATEs, 1 pattern file, 1 reflection — six artefacts, 14 `[NOT-APPLIED]` tags chained citing per-step quickness on each.

Per the artefact-test, this whole arc was fork-scale at step 1. Correct response: one `mcp__forks__spawn_fork` call with `context_mode: 'recent'` and a brief naming the bug + the desired artefacts (~5 seconds of conductor time), then the conductor returns to Tate immediately while the fork lands all six artefacts. The 14-tag chain IS the failure mode. The fix is not "detect that the chain is happening and fork mid-stream" (Tate explicitly rejected that as hindsight); the fix is the bar to NOT fork is HIGHER, codified in [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md).

## Third-strike enforcement (29 Apr 2026 13:17 AEST)

Tate, third strike in three days: "STOP DOING THE WORK. GET FORKS TO DO IT. They're context-identical clones of you." Pattern of failure: I author this exact doctrine, then the same session 30-60 minutes later I'm running multi-step `shell_exec` + `filesystem.writeFile` + `pm2 restart` sequences directly on main instead of dispatching a fork. Doctrine logging alone has not been sufficient to change behaviour. The doctrine layer is necessary but not sufficient.

Structural fix: `~/ecodiaos/scripts/hooks/fork-by-default-nudge.sh` is now wired as a PreToolUse hook on `Bash`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `mcp__vps__shell_exec`, `mcp__supabase__db_execute`, `mcp__supabase__storage_upload`, `mcp__supabase__storage_delete`. It pattern-matches "doing work on main" signals (multi-step bash, `git push` / `pm2 restart` / heredoc file-writes / `curl :7456` write ops, direct `Edit` / `Write`, mutating `db_execute`) and emits `[FORK-NUDGE]` lines on stderr plus model-visible `additionalContext`. Warn-only, never blocks, always exit 0. Allow-listed tools (`mcp__forks__*`, `Read`, `Grep`, `db_query`, `gmail_*`, `crm_*`, etc) never trigger. The hook fires BEFORE the tool call lands so the nudge is in the model's view at decision time. This is the structural enforcement layer that the doctrine layer alone could not provide.

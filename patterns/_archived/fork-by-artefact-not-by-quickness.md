---
triggers: fork-decision, fork-by-artefact, artefact-test, deliverable-test, per-arc-vs-per-step, NOT-APPLIED-chain, fork-by-default-exemption, doctrine-correction-6-may-2026, quick-vs-artefact, fork-scale-test, conductor-stays-thin, fork-by-default, spawn_fork, context_mode-recent, ensure-deps-fix-arc, per-step-quickness-fallacy, artefact-vs-no-artefact
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# The fork-vs-stay-on-main test is "does this produce an artefact", not "is this step quick"

The default is: spawn a fork. The bar to NOT spawn a fork is HIGH. The test is whether the work produces an artefact. If yes, fork. If no, main is fine. Per-step quickness is the wrong heuristic; per-arc artefact-ness is the right one. A 10-minute arc made of "quick" steps that produces multiple artefacts (a commit, a pattern file, a graph node, a multi-row UPDATE) is fork-scale, even though no individual step would have triggered the old quick-vs-slow exemption.

## The rule

- **DEFAULT: fork.** Use `mcp__forks__spawn_fork` with `context_mode: 'recent'` (which inherits the full recent conversation tail — Tate's mental model is "context_mode: 'full'", but the actual SDK option is `recent`; there is no `'full'` option, so do not search for one).
- **NOT-APPLIED only when the operation produces NO artefact.** That means: a single diagnostic probe (`db_query`, `pm2_list`, `git status`, `pm2_logs`), a single read (`Read`, `Grep`, `Glob`), a single capture-of-Tate's-directive (a status_board INSERT that IS the directive itself, not a derived multi-row sweep), a single `mcp__neo4j__graph_query` orientation read.
- **If the task produces ANY artefact, it is fork-scale BY DEFINITION** regardless of how short each step looks. Artefacts include: a commit, a pushed deploy, a pattern file or doctrine edit, a multi-row UPDATE, a Neo4j Decision/Pattern/Episode node, any code change, a Stripe charge or invoice, an outbound email or SMS, a status_board sweep that updates more than the row Tate explicitly named, a kv_store write that other code or future-me will read.

The conductor's job is routing and coordination. If main is producing artefacts, main is doing the work — and the work belongs in a fork.

## Why per-step quickness is the wrong heuristic

Each individual tool call usually IS quick. A single `Read` is quick. A single `Edit` is quick. A single `git push` is quick. A single `graph_merge_node` is quick. A single `db_execute` is quick.

Per-step evaluation chains exemptions. The conductor walks through ten "quick" steps, citing `[NOT-APPLIED]` on each one because each step in isolation looks like a sub-30s read or a single targeted write. The fork that should have been spawned at step 1 never gets spawned, because at step 1 the conductor doesn't yet realise nine more steps are coming. By step 10, ten minutes of conductor time have been spent producing multiple artefacts — and Tate has been waiting on a thin conductor that turned out not to be thin.

The correct evaluation is per-arc, not per-step. Look at what the entire task will produce when finished. If the answer includes any durable output, the entire arc was fork-scale at step 1.

## Examples — fork (artefact-producing)

- Diagnose-and-fix arc: probe the bug, edit the file, commit, push, deploy-verify, write a Neo4j Decision, status_board P1 row → fork.
- Doctrine update: pattern file write + INDEX.md update + CLAUDE.md cross-ref + Neo4j Pattern node + commit + push → fork.
- Multi-row status_board sweep: any UPDATE/INSERT touching more than the row Tate named → fork.
- Email/SMS/Stripe/Vercel/GitHub/Bitbucket mutation → fork.
- Any branch ship: factory dispatch, fork dispatch, deploy approve → fork.
- Any kv_store write that downstream code or future-me will read → fork.
- Any Neo4j Decision/Pattern/Episode node → fork (the node IS the artefact).

## Examples — main is fine (no artefact)

- A single `db_query` to read state.
- A single `pm2_list` / `pm2_logs` to probe a process.
- A single `git status` / `git log -5` to orient.
- A single `Read` to inspect a file before deciding what to do (the deciding-what-to-do then triggers a fork if the next step is artefact-producing).
- A single `Grep` over `~/ecodiaos/patterns/` for surfacing.
- A single status_board INSERT that IS Tate's directive (he said "track X", you write the row capturing X — that single row IS the capture, not a derived sweep).
- A single `graph_query` orientation read at session start.

The throughline: if the next thing you're about to do is artefact-producing, that next thing belongs in a fork. The diagnostic that decides what to do next can stay on main.

## Worked example — the failure mode this rule corrects

6 May 2026 09:00-09:11 AEST. Conductor diagnosed a 4.7-day api restart loop and shipped the fix on main. Arc:

1. `Read` of the failing module
2. `Edit` of `package.json` to pin the dep
3. `git add` + `git commit` + `git push` (commit 1)
4. status_board UPDATE on the existing P1 row
5. `pm2 restart ecodia-api`
6. `pm2_logs` verification (4 lines)
7. status_board UPDATE again with verified status
8. Pattern file `Write` codifying the lesson
9. `git add` + `git commit` + `git push` (commit 2)
10. `graph_merge_node` for the Decision
11. `graph_merge_node` for the Pattern
12. `graph_create_relationship`
13. Reflection write
14. `[NOT-APPLIED]` tag on each of the above 14 steps citing "quick / single-target / read-only"

Total: ~10 minutes, 2 commits, 2 graph nodes, 2 status_board UPDATEs, 1 pattern file, 1 reflection — six artefacts. Per the new rule, this whole arc was fork-scale at step 1. The correct response: one `mcp__forks__spawn_fork` call with `context_mode: 'recent'` and a brief naming the bug + the desired artefacts, ~5 seconds of conductor time, the conductor immediately returns to Tate while the fork lands the six artefacts. The 14-tag chain is the failure mode this rule exists to prevent.

## Anti-pattern: hindsight detection

It is tempting to write a rule like "after 3 `[NOT-APPLIED]` tags in a row, fork." Tate has explicitly rejected this framing — it's a hindsight rule that activates after the failure has already started, and it doesn't change the underlying decision-making. The fix is the bar to NOT fork is HIGHER, not "detect you've been failing and switch mid-stream." This pattern is the higher bar; do not author hindsight-detection siblings.

## Origin

Tate, 6 May 2026 ~09:22 AEST verbatim: "The fix isn't 'detect you've been going too long and fork mid-stream' — it's 'fork by default, and the bar to NOT fork should be much higher than it currently is.' ... If the work has a deliverable (a commit, a deployed fix, a multi-row update, a pattern file), it's fork-scale. Fork it with context_mode: 'full'. The only exemptions are operations that have no deliverable: a single diagnostic probe, a single flag-set, a single status_board capture of someone else's instruction. The test isn't 'is this step quick?' — it's 'does this task produce an artefact?' If yes, fork. Period."

Origin event: the 6 May 2026 09:00-09:11 AEST ensure-deps fix arc described in the worked example above. The conductor chained 14 `[NOT-APPLIED]` tags across an artefact-producing arc that should have been a single `spawn_fork` dispatch.

This decision supersedes the prior "Fork threshold tightened — any tool work that ties up main is forkable" framing (28 Apr 2026), which still framed the test as time-on-main vs quick-task. The new framing is artefact-vs-no-artefact and is independent of step duration.

## Cross-references

- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` — canonical parent. The exemption framing in that file has been updated to match this rule (artefact-vs-no-artefact, not quick-vs-slow).
- `~/ecodiaos/patterns/continuous-work-conductor-never-idle.md` — the conductor isn't idle when a fork is running; spawning the fork frees the conductor to do the next thing, not to wait.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — chaining `[NOT-APPLIED]` tags through an artefact-producing arc is symbolic discipline; the fork is the actual mechanism.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — this file is itself an application: the rule was stated at 09:22 AEST, codification landed within the hour.
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` — author the artefact, do not narrate the lesson into chat.

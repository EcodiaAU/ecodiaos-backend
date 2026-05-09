---
triggers: manager-fork, MANAGER-true, sub-fork, parent_fork_id, fork-decomposition, fork-hierarchy, multi-worker-task, parallel-pipeline, build-test-deploy-verify, 30-parallel-streams, fork-tree, fork-tree-cap, sub-fork-routing, manager-summary, conductor-inbox-clean, decompose-and-spawn, fork-aggregation, manager-vs-worker, sub-fork-cap
---

# Use manager forks for any task decomposing into 2+ independent workers

A manager fork is a fork that spawns its own sub-forks and consolidates their reports into a single `[FORK_REPORT]` back to the conductor. The conductor sees one report, not N. The manager owns coordination, retry, and verification of its workers. Default to a manager fork for any task that decomposes into 2+ independent worker streams. The cost is a brief that says `MANAGER: true` plus the manager's own coordination overhead; the win is a clean conductor inbox and parallel execution of the sub-tree.

## The rule

- **DEFAULT to a manager fork for any non-trivial task that decomposes into 2+ independent worker streams.** The brief carries `MANAGER: true` (literal first-line marker the spawner reads).
- The manager spawns sub-forks via `mcp__forks__spawn_fork` with `parent_fork_id` set to its own `fork_id`. Sub-fork `[FORK_REPORT]`s route to the manager's stream as `[SUB_FORK_REPORT from <id>]` messages — they NEVER land in the conductor's inbox.
- The manager waits for every sub-fork to reach a terminal status (`done`, `error`, `aborted`), retries failures or partial-shipped phantom-bails, verifies deliverables against ground truth, then emits ONE consolidated `[FORK_REPORT]`.
- Single-worker arcs (one commit, one file, one graph node) are NOT manager cases — see "When NOT to use" below. The doctrine on artefact-producing arcs in [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md) tells you whether to fork at all; this file tells you whether the fork should be a manager.

## How it works

1. **Brief carries `MANAGER: true` on its own line.** First non-blank line of the brief is conventional; any own-line placement works (the spawner regex is `^\s*MANAGER\s*:\s*true\b/im` — line-anchored, case-insensitive). Citing the marker inside prose, backticks, or a negation does NOT trigger manager mode (intentional — worker briefs frequently reference the contract). The brief also explains the decomposition: "spawn N sub-forks, one per <unit-of-work>, then consolidate."
2. **Manager decomposes.** First moves are `mcp__forks__spawn_fork` calls, one per worker, each with `parent_fork_id` = the manager's own `fork_id`. Briefs are self-contained handovers (sub-forks have full context inheritance via `context_mode: 'recent'`, but the brief still names the goal, constraints, definition-of-done, durable artefact path).
3. **Sub-fork reports route to the manager.** When each worker emits `[FORK_REPORT]`, the manager sees `[SUB_FORK_REPORT from <fork_id>]` injected into its stream on the next turn. The conductor sees nothing for the sub-tree — that's the entire point.
4. **Manager polls + coordinates.** Every 60-120 seconds: `db_query` against `os_forks` filtered by `parent_fork_id = <self>` to see status + heartbeat + error_summary for every worker. Sequence dependent steps — do not spawn step-2 until step-1 reports success. Retry phantom-bails by probing deliverables (`git log --grep=<fork_id>`, `ls -la <expected_artefact_path>`) before re-dispatching. Stay alive until every worker is terminal.
5. **Manager verifies.** Sub-fork self-reports lie. Read each sub-fork's durable artefact (the file path the sub-fork named in its `[SUB_FORK_REPORT]`, typically under `~/ecodiaos/drafts/<artefact>.md` or a commit SHA), then confirm deployed state, committed code, or DB rows match the claim before consolidating.
6. **Manager consolidates.** ONE `[FORK_REPORT]` to the conductor: what shipped, what didn't, what the conductor should do next. Never multiple reports — that's noise the manager-fork pattern exists to prevent.

## Caps and parallelism math

- Per-tree cap: 5 sub-forks per manager. The manager's spawner enforces this; the conductor's global cap does not affect sub-forks.
- Concurrent managers: up to 5 (the conductor's normal global fork cap).
- Total system parallelism: 5 managers × 5 workers = 30 parallel streams.
- A manager that hits the 5/5 sub-fork cap with more workers queued must serialise the remaining workers (spawn one, wait for terminal, spawn next).

## When to use (DEFAULT)

- **Pipeline tasks** with sequenced phases: build → test → deploy → verify; audit-then-edit; recon → fix → smoke-test; spawn → monitor → consolidate.
- **Audits decomposing into N independent units**: per-file audit across a directory, per-service health check across a fleet, per-pattern doctrine sweep, per-tenant migration check, per-client smoke test.
- **Multi-step releases** where each step has its own deliverable: branch + push → CI poll → deploy approve → live verify → status_board update → Tate notify.
- **Doctrine sweeps touching multiple pattern files**: e.g. "rename concept X across all pattern files referencing it" — one sub-fork per file, manager consolidates.
- **Multi-tenant migrations** where each tenant is independent: one sub-fork per tenant, manager aggregates pass/fail.
- **Parallel research dossiers**: N research topics, one sub-fork each, manager synthesises.
- **Codebase-wide refactors** needing per-module workers: one sub-fork per module, manager runs the integration test after all return.

## When NOT to use

- **Single atomic deliverables.** One commit, one file, one Neo4j node, one Stripe charge — that's worker-fork scale, not manager scale. The brief you are reading right now (the one that authored this very pattern file) is exactly that case: 2-3 file edits + 2 graph nodes + 1 commit, dispatched as a single worker fork because spawning a manager to coordinate one worker is circular and slot-overhead pointless.
- **Tasks where workers MUST share state mid-flight.** Manager-and-sub-forks do NOT share state with each other; sub-forks are independent processes that report only at completion. If two workers need to read each other's progress mid-flight, they cannot be sub-forks — they have to be one fork doing both pieces sequentially, or coordinated via a shared substrate (kv_store, status_board) with the manager driving sequencing.
- **Below the worker-spawn overhead floor.** If the work is so small that spawning even one worker would add more overhead than just doing it in the manager itself, do it in the manager (or skip the manager altogether — a single artefact-producing task is a worker, not a manager).
- **Live-steered work where Tate may correct mid-flight.** Manager forks add a layer of indirection; corrections from Tate are slower to land. Stay on main with explicit forks for that case.

## Worked example — audit + edit CLAUDE.md gaps

The CLAUDE.md gap audit + edit is the canonical manager-fork case ([`session-orient`](session-orient.md) + the daily 20:00 AEST `claude-md-reflection` cron documented in [`fork-by-default-stay-thin-on-main.md`](fork-by-default-stay-thin-on-main.md)):

1. Manager dispatches sub-fork-A: "audit CLAUDE.md for gaps + stale items + missing cross-refs, write deliverable to `~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md`."
2. Manager waits for sub-fork-A to reach `status='done'`, then verifies the audit file actually exists on disk (`ls -la <path>`) — phantom-bail check per [`audit-fork-persistence-verification`](fork-by-default-stay-thin-on-main.md).
3. Manager dispatches sub-fork-B: "read `<audit_path>`, ship the proposed edits to CLAUDE.md, commit + push."
4. Manager waits for sub-fork-B, verifies the commit landed (`git log -1 --oneline`), confirms CLAUDE.md content matches the audit's recommendations.
5. Manager emits one `[FORK_REPORT]`: "Audit shipped at <path> (sub-fork-A). Edits committed at <SHA> (sub-fork-B). Both verified. Conductor: nothing further."

Same shape for build → test → deploy → verify pipelines: sub-fork per phase, manager sequences them, manager aggregates.

## Conductor discipline

- Manager forks appear in the conductor's `<forks_rollup>` block tagged `[manager, N sub]` with sub-forks indented beneath their parent.
- The conductor waits for the manager's consolidated `[FORK_REPORT]`. Do NOT reach into the manager's subtree to send messages to sub-forks, abort sub-forks individually, or query sub-fork transcripts — the manager owns its tree.
- Trust the manager or abort the whole tree. Mid-tree intervention defeats the inbox-cleanliness win the manager-fork pattern exists to deliver.
- If the manager itself goes silent past expected duration, abort the manager (which cascades to its sub-forks) and re-spawn with a tighter brief. Don't surgically rescue half-finished sub-trees.

## Anti-pattern: managers that spawn one worker

A manager fork that decomposes into a single sub-fork is a coordination layer with no work to coordinate. The slot economics are pure overhead: 2 fork slots consumed for 1 unit of work, the conductor still waits the same total time, and the manager's `[FORK_REPORT]` is just a passthrough of the worker's report. If the decomposition is "1 worker", the right shape is a worker fork on its own — no manager.

The brief authoring this pattern file is exactly such a case (2-3 file edits + 2 graph nodes + 1 commit, single worker, no decomposition warranted). The doctrine must be self-aware on this anti-pattern.

## Anti-pattern: ad-hoc sub-fork spawning without `MANAGER: true`

A worker fork that quietly spawns its own children "to parallelise a sub-step" without declaring `MANAGER: true` in its own brief produces sub-forks the conductor's surfacing layers cannot reason about. The `<forks_rollup>` formatter relies on the brief marker to render the tree correctly; absent it, sub-forks appear as orphaned children with the wrong parent, and the conductor cannot know whether to wait for the worker or for its grandchildren. Always declare manager intent in the brief.

## Origin

Tate, 6 May 2026 ~09:27 AEST verbatim: "I also want to confirm that manager forks are surfaced very well in the documentation, since they're another superpower."

Pre-existing manager-fork capability shipped 5 May 2026 (see "Fork hierarchy — Manager forks (5 May 2026)" in `~/ecodiaos/CLAUDE.md`). At that point manager forks lived in exactly one ~14-line section of `~/ecodiaos/CLAUDE.md` with zero presence in `~/ecodiaos/patterns/`, no `triggers:` frontmatter, no cross-ref from [`fork-by-default-stay-thin-on-main.md`](fork-by-default-stay-thin-on-main.md). Pre-fork-dispatch trigger-keyword grep (per [`context-surfacing-must-be-reliable-and-selective.md`](context-surfacing-must-be-reliable-and-selective.md)) returned nothing for manager-related keywords; the capability was dark at decision-time. This file closes that gap so the conductor reaches for the manager pattern by default on multi-worker tasks.

This pattern was authored by a single worker fork (`fork_mot9fj1d_10f28d`), not a manager — see the "anti-pattern: managers that spawn one worker" section above for why.

## Cross-references

- [`fork-by-default-stay-thin-on-main.md`](fork-by-default-stay-thin-on-main.md) — canonical fork-vs-main entry. The manager-vs-worker decomposition decision is the next step AFTER you've decided to fork.
- [`fork-by-artefact-not-by-quickness.md`](fork-by-artefact-not-by-quickness.md) — the artefact-vs-no-artefact test for fork-vs-stay-on-main. Apply that first; if "fork" wins and the work decomposes into 2+ independent units, apply this file.
- [`continuation-aware-fork-redispatch.md`](continuation-aware-fork-redispatch.md) — when retrying a failed sub-fork, check existing deliverables before re-doing.
- [`fork-result-fallback-must-be-marked.md`](fork-result-fallback-must-be-marked.md) — phantom-bail detection on sub-forks the manager is polling.
- [`audit-fork-persistence-verification`](fork-by-default-stay-thin-on-main.md) — post-sub-fork-report disk probe before chaining the next sub-fork.
- [`verify-deployed-state-against-narrated-state.md`](verify-deployed-state-against-narrated-state.md) — the verification step before the manager consolidates.
- [`continuous-work-conductor-never-idle.md`](continuous-work-conductor-never-idle.md) — when the conductor has spawned a manager, the conductor is not idle; it is doing the next thing while the manager runs.

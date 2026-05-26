---
triggers: dispatch-worker, dispatch_worker, worker-runtime, worker-semantics, fork-cluster-replacement, sdk-fork-replacement, worker-git-semantics, worker-recovery, worker-coordination, worker-dispatch-discipline, worker-surfacing, worker-result-handling, phantom-bail, orphan-recovery, zero-tools-credit-exhaustion, pre-kill-commit-check, scheduled-redispatch-verify, worktree-commits-do-not-propagate, sigterm-not-uncommit, probe-deliverables-not-status, stash-and-clean-sibling-state, workers-must-not-restart-api, pre-stage-briefs-before-killing-ops, worker-error-events-not-to-chat, thin-on-main-default, dispatch-by-artefact, workers-do-own-recon, solo-worker-ships-no-pr, pending-work-at-session-start, surfacing-hooks-must-cover-spawn, manager-hierarchy-substrate-dependent
---

# Dispatch-worker runtime semantics

## 1. Why this exists

The SDK fork primitive (`mcp__forks__spawn_fork`, `os_forks`, `[FORK_REPORT]`, manager-fork hierarchy) died with the 2026-05-17 local-first migration. The live primitive is [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]. The 21-file fork doctrine corpus split into three: rules that vehicle-died (manager forks, [FORK_REPORT] envelope, `os_forks` substrate), rules that transfer cleanly to the new substrate (git semantics, recovery patterns, coordination discipline), and rules that mutate (chat surfacing, hook coverage). This pattern collects the surviving rules in dispatch-worker terms.

## 2. Git semantics

**Worker commits land on a branch, never on main's working tree.** A worker operates in its own clone or on its own checked-out branch. When it commits, the commit is in the local git database but main's working tree still shows the pre-dispatch state. Main must explicitly `git pull` or `git checkout <branch> -- <paths>` to see the worker's deliverable. Without that pull, a `ls`/`Read` on main reports the file missing or stale, even though the work shipped.

**Sigterms do not retroactively un-commit.** When a worker receives SIGTERM (PM2 restart, kill_worker, timeout, host crash), commits already landed are still on the branch. A killed worker leaves a partial diff: some files committed, some files modified in-tree, some files staged. Recovery is on the branch's git log, never on the registry status field.

## 3. Recovery semantics

**Probe deliverables, never trust status.** A worker's `status='error'`/`'aborted'` row is INPUT, never ground truth. Before declaring failure, read the branch's git log since dispatch, probe the deliverable paths on disk, and check `coord.read_inbox` for any unconsumed `done`/`progress` messages. A worker can ship a clean deliverable and still report `aborted` (sigterm after commit). A worker can claim `done` and have written nothing (phantom). The deliverable is the ground truth.

**Check pre-kill commits before redispatching.** Before redispatching a brief because the previous worker died, check whether that worker shipped anything before death. If commits exist on its branch, the redispatch brief MUST acknowledge them. Without that, the second worker either duplicates work or hits a merge conflict on the same files.

**Stash and clean when finding a sibling worker's unsafe state.** If main discovers in-flight unmerged changes from a sibling worker (post-restart, post-kill, or accidental shared-worktree write), stash them with a labeled message: `git stash push -m 'sibling-worker-<tab_id>-pre-clean'`. Never `git reset --hard` to clear sibling state; the sibling may still be running and able to re-pick from stash.

**Scheduled redispatch must verify the work isn't already shipped.** A delayed `schedule_delayed` redispatch fires regardless of what happened in the interval. The redispatched brief MUST probe disk + git before doing the work. Skip if the deliverable already exists.

**Orphan recovery checklist.** A worker that disappeared (orphan_reason set, heartbeat absent, terminate missing, signal_done never written):
1. `coord.list_workers` shows the orphan row.
2. `cowork.kill_worker` cleans the registry entry.
3. The brief is still on disk at `D:/.code/EcodiaOS/coordination/briefs/<task_id>.md`.
4. Redispatch with `redispatch_on_orphan: true` does the redispatch automatically (one retry, no infinite loop).

## 4. Coordination semantics

**Workers must not restart shared infrastructure unilaterally.** A worker that decides `ecodia-api` needs to restart MUST write to `pending_restart_requests` via the coordinated path: `curl -X POST http://localhost:3001/api/os-session/request-restart -H "Content-Type: application/json" -d '{"reason":"...","requesting_worker_id":"<tab_id>"}'` or `INSERT INTO pending_restart_requests` directly. Direct `pm2_restart` calls from a worker are forbidden. Only the conductor sees the full forks-rollup and can safely decide the restart. Allowlisted bypass callers (`nightlyRestartService.js`, `api-watchdog.sh`, conductor emergency auto-restart) are documented in code. Origin: the 4-fork SIGTERM cascade at 10:50 AEST 12 May 2026 when a worker issued `pm2 restart ecodia-api --update-env` during a Phase 3 activation and killed four concurrent workers.

**Pre-stage briefs before any session-killing operation.** Before pm2 restart, deploy, or risky migration, pre-stage any pending dispatch briefs to disk (`coordination/briefs/`) or kv_store. A killed conductor cannot dispatch from in-memory state on resume.

**Worker error events do not route to conductor chat.** When a worker hits `status='error'`/`'aborted'`, the listener publishes to perception + logs to coord-bus + writes the `<forks_rollup>` row. It NEVER POSTs to `/api/os-session/message`. Conductor sees worker failures via the continuity block on the next natural turn.

## 5. Dispatch discipline

**Stay thin on main; dispatch by default.** When work fits in a worker, dispatch. Main's context is scarce; workers are abundant. Reach for `cowork.dispatch_worker` unless the work is genuinely in-session bounded (<5 tool calls) or needs to mutate main's in-flight state.

**Dispatch by artefact, never by perceived quickness.** "It's just a quick lookup" is a trap. If the work has a concrete artefact deliverable (file written, status_board row, kv_store key, Neo4j node, status probe), dispatch a worker. Quickness is a perception; artefact is a commitment.

**Workers do their own recon.** The conductor does NOT pre-explore the worktree before dispatch beyond the staging check from [[dispatch-worker-worktree-hygiene-2026-05-26]]. Pre-exploration burns the conductor's context budget on work the worker can do itself.

**Solo-worker ships go directly to main.** Internal-repo dispatches that don't require Tate review (per [[no-tate-review-carveouts-on-internal-repo-work]]) push to main from the worker's branch. PR ceremony is for external contributors and client-facing branches.

**Pending work at session start dispatches FIRST.** On fresh session boot with pending work in `<forks_rollup>` / `<restart_recovery>`, the conductor runs ONE canonical status_board query and then dispatches. Orientation steps 2-7 run inside the worker. Doing them on main first burns the conductor's context arc on probing the worker should be doing.

## 6. Result handling

**Phantom-bail is distinct from clean-completion.** A worker that exits without writing `coord.signal_done` is a phantom-bail. The `<forks_rollup>` block distinguishes clean (signal_done observed) from phantom (no signal). Redispatch is the default response to a phantom. Re-pick (read `result_pointer`) is the default response to clean.

**Zero-tools-used at exit is the credit-exhaustion signature.** A worker that exits with zero tool calls almost always hit an account-chain-exhaustion or rate-limit cap. A CLUSTER of zero-tools exits across multiple workers in a short window is `account_chain_exhausted` (P2), never N independent worker failures. Recovery: wait for the soonest per-account reset, then redispatch. See [[multi-account-credit-state-model]].

## 7. Surfacing semantics

**Hooks must cover every spawn substrate.** When the dispatch primitive evolves (SDK fork -> Ctrl+Alt+Shift+C tab -> `cowork.dispatch_worker` -> whatever comes next), every surfacing hook (brief consistency, cred-mention, anthropic-first, episode-resurface) must follow the live primitive. Hook matchers on dead substrates are silently dark. The meta-rule is [[hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26]].

**Manager hierarchy is substrate-dependent and currently flat.** SDK forks supported manager forks spawning sub-forks. Dispatch-worker tabs do NOT have nested-spawn capability today: a worker tab does not have `cowork.dispatch_worker` in its tool surface. For multi-stream work, the CONDUCTOR dispatches N workers in parallel; workers cannot dispatch children. Manager-fork doctrine from the SDK era does NOT transfer.

## 8. What this supersedes

A 21-file fork-* / forks-* / SDK-fork doctrine cluster archived on 2026-05-26 with `nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md` frontmatter pointers. The structural rules that generalise are captured above in dispatch-worker terms. Two earlier patterns subsume specific sub-concerns and are cross-linked rather than restated here: [[hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26]] (Phase 1 meta-rule for hook coverage) and [[dispatch-worker-worktree-hygiene-2026-05-26]] (Phase 2a sister pattern for pre/post-dispatch worktree care).

## 9. Cross-references

- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] - the primary substrate.
- [[ide-tab-is-the-new-fork-mechanic-2026-05-17]] - the why-tabs-not-SDK-forks doctrine.
- [[dispatch-worker-worktree-hygiene-2026-05-26]] - sibling Phase-2a canonical.
- [[hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26]] - the Phase-1 meta-rule.
- [[verify-deployed-state-against-narrated-state]] - parent meta-rule for "trust ground truth, never narrated status".
- [[multi-account-credit-state-model]] - cluster-of-zero-tools-exits interpretation.
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the substrate triad rule that this pattern's existence honours.

## 10. Origin

2026-05-26 doctrine consolidation Phase 2b. SDK fork primitive died with the 2026-05-17 local-first migration. The 21-file fork cluster was archived after the transferable runtime semantics were lifted here. Specific incident origins preserved in the archived files themselves: fork-worktree-commit propagation (the 5+ phantom-shipped status_board rows of late April 2026); sigterm-not-uncommit (the 8 May SDK musl/glibc binary trap recovery); probe-deliverables-not-status (the 30 April Phase-D classifier hooks ship); manager forks (5 May 2026 ship); zero-tools credit signature (12 May 2026 45-min catatonia incident).

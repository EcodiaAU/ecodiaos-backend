---
triggers: dispatch-worker, dispatch_worker, worktree-hygiene, pre-dispatch-stage, post-dispatch-cleanup, untracked-files-protection, serialise-workers, parallel-worker-collision, no-writes-during-worker, kill-worker-cleanup, worker-baseline-pollution, dispatch-substrate-agnostic, factory-cluster-replacement, dispatch-quality-gate, cron-mandate-vs-quality, redirect-before-kill, send-message-before-kill, scheduling-mandate-bar, dispatch-when-thin
---

# Dispatch-worker worktree hygiene: stage clean, freeze during, protect untracked, serialise on collision

## 1. The rule

A dispatch primitive (`cowork.dispatch_worker`, in-session `Task` agent on a shared cwd, any future substrate that spawns work against a real worktree) inherits the WHOLE current state of that worktree as its diff baseline. Three classes of failure follow from ignoring this:

1. **Baseline pollution.** Pre-existing uncommitted files get included in the worker's diff. Alignment / overlap scorers count those paths and flag the result as off-task even when the actual work is correct.
2. **Untracked-loss on cleanup.** If the worker is killed or the worktree cleaned via `git clean -fd` (or any equivalent destructive sweep), every file you left untracked at dispatch time is gone. That includes drafts, audits, in-flight pattern files, and anything you authored on main that you hadn't yet committed.
3. **Concurrent-worker collision.** Two workers running against the same worktree see each other's in-flight files as part of their own diff baseline. Both ship phantom diffs, both score low, neither lands cleanly.

This rule is substrate-agnostic. It applied to Factory CLI before that primitive died, it applies to `cowork.dispatch_worker` today, and it applies to whatever spawn mechanic comes after.

## 2. Do

**Before dispatching:**

- `git status --short` against the target worktree. If anything unrelated to the task is showing, commit it (focused commit; never bundled with the dispatch target), OR `git stash push -m 'pre-dispatch-stash'` to park it.
- Read the brief once and confirm every file path it mentions exists in the current tree at the expected branch. The dispatch primitive does not check this for you.
- `git fetch origin <base-branch> && git status -sb` to confirm the worktree is not behind origin. A worker that branches off stale main produces a commit that cannot rebase onto current main; the work is unrecoverable.

**During the worker's run:**

- Do NOT write to the target worktree (patterns/, drafts/, docs/, INDEX, scripts, code, anything). The worker takes 30 seconds to many minutes; every write you make during that window inflates the worker's final diff baseline.
- If you must write doctrine or notes mid-window, route the write to a sibling repo or to `kv_store` / `status_board`. Never touch the worktree the worker is operating on.

**Before killing or destructively cleaning a worker:**

- If pre-existing untracked work exists in the worktree, copy it out FIRST (`xcopy /Y <untracked-path> <safe-location>` on Windows, `cp` on Unix). The cleanup step on kill performs the equivalent of `git reset HEAD && git clean -fd` and does not distinguish worker-authored files from files you left untracked at dispatch time.
- Default to `coord.send_message` with a corrective brief. Reach for `cowork.kill_worker` only when the ladder below has run out. A redirected worker preserves accumulated context; a killed worker discards it and the next dispatch pays the full context-build cost again.
- Kill is the LAST rung. Ladder: (1) mid-flight drift -> send_message with correction. (2) completed but wrong / phantom / incomplete -> redispatch with concrete deliverable list + on-disk evidence. (3) kill ONLY when the worker has done destructive work that needs a clean worktree, or has so fundamentally misunderstood the task that no redirect recovers.

**When dispatching multiple workers:**

- Serialise dispatches against the same worktree. Two workers writing to the same repo at the same time see each other's in-flight files as their own baseline.
- If the work is genuinely parallel, dispatch each worker against a separate clone, OR against a separate branch with its own worktree (`git worktree add`).

**Quality gate vs scheduling mandate:**

- A scheduling mandate ("hourly meta-loop says always have N workers running") does NOT lower the per-dispatch quality bar. If the candidate list is thin, dispatch ZERO well-scoped workers and leave the slot idle. A rejected worker plus the cost of reviewing its bad diff is more expensive than an empty slot.
- Enumerate candidates from status_board + Neo4j + known bugs, classify each as high-confidence / deferred / speculative, and dispatch only the high-confidence ones.

## 3. Never

- Never call `cowork.dispatch_worker` (or any dispatch primitive) without running `git status --short` on the target worktree first.
- Never write to a worker's target worktree while that worker is running.
- Never run a destructive worktree cleanup (`git clean -fd`, `git reset --hard`, `kill_worker` with cleanup flag) without first copying out any untracked files you authored on main.
- Never dispatch a second worker against a worktree that already has one running unless you have explicitly accepted the baseline-pollution cost.
- Never let a cron mandate force a dispatch when the candidate list is genuinely thin.

## 4. Why these specific rules

This pattern carries forward the load-bearing nuances from a 15-file Factory-CLI doctrine cluster that was archived on 2026-05-26 when the Factory primitive itself was deprecated (see backend/CLAUDE.md DEPRECATIONS table, entry "Factory CLI / `start_cc_session`"). The Factory cluster's structural lessons all generalise to any substrate that dispatches work against a real worktree; only the vehicle-specific bugs (`taskDiffAlignment.overlapScore`, `cc_sessions.commit_sha`, `force=true` approve flag, `validationConfidence` 0.49 default) were Factory-internal.

Specifically transferred:
- "Stage worktree before dispatch" from `_archived/stage-worktree-before-factory-dispatch.md`
- "Protect untracked files on cleanup" from `_archived/factory-reject-nukes-untracked-files.md`
- "No worktree writes during the worker window" from `_archived/no-doctrine-writes-during-factory-running-window.md`
- "Serialise dispatches on shared worktree" from `_archived/serialise-factory-dispatches-on-shared-codebase.md`
- "Redirect before reject" from `_archived/factory-redirect-before-reject.md`
- "Quality gate supersedes cron mandate" from `_archived/factory-quality-gate-over-cron-mandate.md`

The filesystem-trust generalisation from `_archived/factory-metadata-trust-filesystem.md` is already covered by the canonical [[verify-deployed-state-against-narrated-state]] and is not re-stated here.

## 5. Cross-references

- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] - the primary substrate this rule applies to.
- [[verify-deployed-state-against-narrated-state]] - filesystem-trust meta-rule (parent of the Factory metadata-trust insight).
- [[_archived/forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates]] - sibling discipline for worker -> shared-infrastructure coordination.
- [[stage-and-clean-when-finding-sibling-fork-unsafe-state]] - the kill-and-stash sibling.

## 6. Origin

2026-05-26 doctrine consolidation Phase 2a. Factory CLI was deprecated 2026-05-17 with the local-first migration; its 15-file pattern cluster was archived on 2026-05-26 after the structural lessons were lifted into this substrate-agnostic rule. Original Factory-incident origins preserved in the archived files themselves (Factory 76d960a9 baseline pollution 28 Apr 2026; 3-worker readonly-drift 19 May 2026; multiple phantom approvals + cc_sessions commit_sha drift 27 Apr - 5 May 2026; 14:05 AEST 28 Apr pm2-restart cascade killing 3 in-flight sessions).

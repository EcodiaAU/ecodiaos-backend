---
triggers: branch-thrash, branch-shuffle, shared-tree-flip, sibling-worker-checkout, dispatched-worker-cwd, dispatcher-worktree-allocator, scheduler-worktree, worktree-per-task, reference-transaction-hook, ECODIAOS_BRANCH_OK, conductor-shared-tree, multi-tab-conflict, unstaged-clobber, branch-flip-mid-session, claude-stripe-readonly-to-release-walker, knowledge-engine-yanked-out, canary-script-evacuated, narrated-success-clobber-undermine
binding: hook=.git/hooks/reference-transaction + scheduler.js allocateWorktreeForRow + buildBrief WORKTREE block
---

# Branch-thrash guard on the conductor's shared tree

## 1. The rule

A dispatched worker tab NEVER operates directly on `/Users/ecodia/.code/ecodiaos/backend`. The dispatcher allocates a per-task linked worktree off `origin/main` before the worker is spawned; the worker's brief carries `WORKTREE: <path>` as its first line and the worker uses that path for every file and git operation. A `reference-transaction` hook on the shared tree refuses any HEAD-change (`git checkout`, `git switch`, `git update-ref HEAD`, non-fast-forward `git reset --hard`) as the runtime backstop. Conductor bypass with `ECODIAOS_BRANCH_OK=1`.

Two attack vectors, two defences:

- **Vector A** - `git checkout <branch>` / `git switch <branch>`: the HEAD symref pointer changes. The hook sees `ref=HEAD`, old != new, and rejects.
- **Vector B** - `git update-ref HEAD <oid>` / `git reset --hard <other-tip>`: git dereferences HEAD's symref and updates `refs/heads/<current>` instead. The hook reads the real current OID via `git rev-parse --verify <ref>` (because git passes `old=0000...` for symref-deref updates), and rejects when `new` is not a fast-forward of the real old.

Linked worktrees - `.claude/worktrees/agent-*` (Agent SDK), `_worktrees/dispatched/*` (this dispatcher) - are exempt: the hook discriminates via `$GIT_DIR` matching `*/worktrees/*`. From the main worktree `$GIT_DIR` is unset in the hook env, the case-pattern falls through to the rejection logic, and that empty-env discriminator is what makes "main worktree only" mechanically correct.

## 2. Do

**Conductor:**

- Run the installer once per fresh clone: `sh backend/scripts/install-branch-thrash-guard.sh`. The installer is idempotent and sha-checks the source against the installed hook so drift re-installs cleanly.
- When you genuinely need to flip the shared tree's branch (intentional `git checkout main` to merge, `git reset --hard` to recover): prefix with `ECODIAOS_BRANCH_OK=1`. The variable is NOT exported globally so workers can't accidentally inherit it.
- Read `git status --short | wc -l` and confirm uncommitted work is acknowledged before any conductor-side branch flip. The hook protects against accidental flips; deliberate flips still risk clobbering working-tree files.

**Dispatcher (scheduler.js):**

- `allocateWorktreeForRow(row)` runs BEFORE `dispatcher.dispatch_worker` in `dispatchOne`. Path scheme `/Users/ecodia/.code/ecodiaos/_worktrees/dispatched/<row.id>` is predictable so retries are idempotent. The function force-prunes any stale entry at that path, fetches `origin/main`, then `git worktree add -B worker/<short> <path> origin/main`.
- Allocation failure is non-fatal. The dispatcher logs and proceeds; the hook is the runtime backstop. The brief omits the `WORKTREE:` block in that case so the worker doesn't act on a stale path.
- `pruneWorktreeForRow(row)` runs on every terminal path: `markComplete` (success), `markFailed` (failure), `staleLeaseRecovery` (cron-defer, non-cron fail, orphan). All wrapped in tolerant try/catches so a worktree-prune failure never blocks the substrate update.

**Worker (briefed):**

- The brief's first lines are `WORKTREE: <path>` and the directive: use absolute paths under that path; run all git commands with `git -C <path> ...`; do not operate on the shared tree.
- The brief explicitly points at this doctrine file. The worker is expected to read it once if confused, not re-derive.

## 3. Never

- Never `git checkout` / `git switch` / `git reset --hard` on `/Users/ecodia/.code/ecodiaos/backend` from a worker context. The hook rejects; the brief instructs otherwise.
- Never store the worktree path in worker memory state or kv_store. The dispatcher owns the lifecycle; persisted state drifts.
- Never set `ECODIAOS_BRANCH_OK=1` in a global shell rc file. The bypass must stay per-command-invocation so the conductor's mistake-class flips are caught too.
- Never trust `git update-ref --no-deref` or `git symbolic-ref` to be safe just because they don't move the working tree. Both update HEAD; both flip the conductor's branch from a worker.
- Never edit `.git/hooks/reference-transaction` in-place on the shared tree. The canonical script lives at `backend/scripts/branch-thrash-guard.sh`; edit it there and re-run the installer.

## 4. Why these specific rules

The discipline-only doctrine from [[dispatch-worker-worktree-hygiene-2026-05-26]] told workers to "stage worktree before dispatch, freeze during, protect untracked, serialise on collision". The doctrine was correct. It just wasn't enforced.

In 24 hours on 2026-06-10 the discipline broke twice. Two dispatched workers (tab_1780976111450, tab_1780976135244) operating on the shared tree switched it to `main` mid-session and yanked the knowledge-index engine + reference docs out of the working tree (tracked-on-feature, absent-on-main). Recovery worked because the engine was on the feature branch already, but the canary scripts at `backend/scripts/` were not - the launchd canaries went exit-127 until they were evacuated to `~/.ecodiaos/bin/`. A second incident hours later flipped `claude/stripe-readonly-mcp-tools` to `claude/release-walker-state-matrix` and clobbered section 2b of [[verify-deployed-state-against-narrated-state]] off disk - section that took two earlier sessions to author.

The narrated-success-doctrine the conductor relies on assumes the working tree is the conductor's, not borrowable. Once siblings can flip it under a conductor mid-tool-call, every narrated-state probe is unstable. The runtime backstop (hook) closes the easy attack vector; the worktree allocator removes the need for workers to ever attempt it.

This is also why the bypass is `ECODIAOS_BRANCH_OK=1`, not a config setting: a config setting persists across sessions and across workers (workers can read the same .gitconfig). An environment variable scoped to a single conductor-initiated command is the right granularity.

## 5. Anti-patterns

- **Discipline-only protection.** "Workers know not to checkout on the shared tree" - confirmed broken twice in 24 hours. Mechanical enforcement is required.
- **Trusting `old=0000...` from the reference-transaction stdin.** Git frequently passes zeros for the old OID even when the ref exists, especially through symref-deref paths. Always read the real current OID via `git rev-parse --verify <ref>` at the hook's `prepared` phase.
- **Using `$GIT_DIR` as the discriminator without falling-through on empty.** From the main worktree the env var is unset; if your case-pattern doesn't anticipate that, you'll skip the rejection in the very context you wanted to protect.
- **Per-call worktree paths with timestamps in them.** Predictable per-`row.id` paths make allocate+prune idempotent across retries, crashes, and stale-lease recoveries. Timestamp suffixes leak worktrees.
- **Blocking commits in the hook.** Fast-forward updates of `refs/heads/<current>` are normal git commits and must pass. The hook tests `git merge-base --is-ancestor old new` and allows when true.

## 6. How to apply

- New laptop-agent install or fresh clone of `ecodiaos/backend`: run `sh backend/scripts/install-branch-thrash-guard.sh` once. Confirm with `ls -la .git/hooks/reference-transaction`.
- Authoring a new dispatched-worker prompt: ASSUME the worker will receive `WORKTREE: <path>` and write the prompt to operate there. The dispatcher handles the path; the prompt body need not mention it.
- Debugging a worker that complains "git checkout refused": confirm the brief carried the `WORKTREE:` block. If yes, the worker brain-fart was the issue (worker tried the shared tree anyway). If no, the dispatcher's `allocateWorktreeForRow` failed - check `stderr` of `au.ecodia.laptop-agent` in `~/Library/Logs/eos-laptop-agent.err.log` for the allocation error.
- Conductor doing an intentional branch flip: `ECODIAOS_BRANCH_OK=1 git checkout <branch>`. The hook prints its banner anyway when the OID changes; that's a feature, not noise - it confirms the guard is alive.

## 7. Cross-references

- [[dispatch-worker-worktree-hygiene-2026-05-26]] - the prior discipline-only doctrine; this pattern carries the structural lessons forward and adds mechanical enforcement.
- [[sibling-agent-branch-shuffle-during-edits-2026-05-21]] - the chambers-frontend session's six-feat-branch shuffle that first formalised the failure class.
- [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]] - the broader "binding load-bearing discipline to a hook" pattern that this is an instance of.
- [[verify-deployed-state-against-narrated-state]] - the parent narrated-success doctrine the working tree's stability load-bears.
- [[dispatch-worker-runtime-semantics-2026-05-26]] - dispatcher-level constraints; this pattern extends the dispatch contract with a per-task worktree.
- [[mac-organisation-and-branch-thrash-2026-06-09]] (memory) - the live incident this pattern was authored from.

## 8. Origin

2026-06-10. Brief: `d27e9021-9ffe-432d-8e3e-154a62239bbc` ("design+ship session on the LAST open architectural item from the 2026-06-10 knowledge-system arc: workers flipping the shared working tree"). Tate scheduled the chat explicitly. Tab `tab_1781076919915_e6666c0c`.

Verify gate (all passed):

1. Synthetic hook tests (6 cases): reject Vector A, reject Vector B non-FF, allow FF commit, allow bypass, exempt linked worktrees, allow unrelated refs. All exit codes correct.
2. Real-path probes: `git switch main` from worker context on shared tree - rejected by git's pre-check before the hook even fired (sufficient for the verify gate's "branch unchanged" assertion); `git update-ref HEAD origin/main` from worker context on shared tree - rejected by the hook directly, HEAD unchanged, banner printed.
3. Linked-worktree exemption: `git update-ref HEAD origin/main` in my own `_worktrees/dispatched/d27e9021-thrash-fix` worktree - allowed.
4. Bypass: `ECODIAOS_BRANCH_OK=1 git update-ref HEAD <parent>` - allowed.
5. scheduler.test.js: 14 new assertions, all pass. Pre-existing failure count unchanged (10 → 10).

Discriminating probe: from a worker's Bash context, `git -C /Users/ecodia/.code/ecodiaos/backend update-ref HEAD <any-other-oid>` returns rc=128 with the guard banner, HEAD unchanged. This probe goes in the status_board row for the arc.

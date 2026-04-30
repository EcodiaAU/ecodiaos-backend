---
triggers: stash-discipline, git-stash-push-u, sibling-fork-state-loss, untracked-file-vanish, audit-shipped-then-vanished, stash-named, stash-pop-discipline, fork-must-own-stash, indiscriminate-stash, cross-fork-substrate-protection, stash-third-parent-recovery
priority: critical
canonical: true
---

# Stash must be named and restored by the author fork

Any fork that runs `git stash push -u <...>` to park uncommitted/untracked state before its own branch operations MUST:

1. **Name the stash with its fork_id** AND a one-line description of WHAT it parked. Example: `git stash push -u -m "fork_<my_id>_pre-<descriptive-action> - stashing untracked drafts + telemetry logs accumulated since main checkout"`. The name is the audit-trail handle for sibling forks and the conductor.

2. **Emit a status_board P2 row at stash time** with: name="Open stash <stash-name> by <fork_id>", status="awaiting_pop", next_action="Author fork <fork_id> must pop OR explicit conductor decision to drop stash after diffing residue against current disk", next_action_by="<fork_id>" (later transferred to ecodiaos when fork ends).

3. **Pop the stash before signalling [done] in FORK_REPORT** - `git stash pop` if all parked content is to come back, OR `git stash drop` ONLY if the parked content is verified obsolete. The decision is the fork's responsibility, NOT a "leave it for the conductor" handoff.

4. **If the fork CANNOT pop (e.g. branch incompatibility makes restore impossible)**: it must (a) name what's in the stash explicitly in its FORK_REPORT, (b) update the status_board row's next_action with concrete recovery steps for the conductor or follow-up fork, (c) flag any sibling-fork deliverables it accidentally captured (untracked files in `~/ecodiaos/drafts/`, pattern files in `~/ecodiaos/patterns/`, etc.).

5. **Recovery semantics (for the conductor or follow-up fork that needs to extract individual files from a `-u` stash):** `git checkout stash@{N}^3 -- <path>` - the untracked-file commit is the THIRD parent (`^3`) of the stash merge commit. NOT `stash@{N}` (working-tree state) or `stash@{N}^2` (index state). Document this on every `-u` stash entry's status_board row.

The `-u` flag is INDISCRIMINATE. It captures EVERY untracked path in the worktree, including legitimate work-in-flight from sibling forks. The fork that runs `-u` has a duty to OWN the stash through to disposal, not assume it can be left for someone else to clean up.

## Do

- Use named stashes: `-m "fork_<id>_<descriptive>"`. Always.
- Inspect untracked files BEFORE running `-u` (`git status --untracked-files=all`). If you see paths that obviously belong to sibling forks (drafts/, patterns/, recent .md files), use targeted stash with explicit paths instead of `-u`: `git stash push -m "fork_<id>_<descriptive>" -- <only-the-paths-you-mean>`.
- Pop or drop the stash IN THE SAME FORK that authored it.
- Treat `~/ecodiaos/drafts/`, `~/ecodiaos/patterns/`, `~/ecodiaos/clients/`, `~/ecodiaos/docs/`, `~/ecodiaos/scripts/` as SHARED CROSS-FORK SUBSTRATES - never stash them with `-u` blindly.
- When recovering individual files from a `-u` stash: `git checkout stash@{N}^3 -- <path>`.

## Do not

- Run `git stash push -u` without inspecting untracked paths first.
- Leave a stash unrestored across fork lifecycle without a status_board entry naming the recovery path.
- Use unnamed stashes (`git stash` with no `-m`).
- Assume the conductor will "find and restore" your stash later - it might, but only after a phantom-shipped failure manifests downstream.
- Use `git checkout stash@{N} -- <path>` to recover untracked files - the path will fail with "did not match any file(s) known to git". The correct ref for untracked files is `stash@{N}^3`.

## Cross-references

- `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` - the doctrine that prescribed the stash-and-clean approach. This file is the missing complement: "after stash, you own the restore." Cross-ref both ways.
- `~/ecodiaos/patterns/factory-reject-nukes-untracked-files.md` - sibling failure mode (untracked-file fragility under fork operations).
- `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` - related (cross-fork state propagation).
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - meta-rule. The working tree IS one of the substrates with seams; `git stash` is one of the seam-write operations.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the failure-detection pattern. Phantom-shipped narration in this case was true at the time; disk drifted later because of the unrestored stash.

## Origin

30 Apr 2026, ~16:50-17:13 AEST. At 16:13 AEST conductor dispatched 4 audit forks. Audit forks shipped deliverables to `~/ecodiaos/drafts/` correctly. At 16:50 AEST a sibling Phase 1 architecture fork (fork_mol4qpm9_7421ca) ran `git stash push -u -m "fork_mol4qpm9_pre-cron-session-mode"` to clean working tree before its `git checkout -b feat/cron-session-mode-classifier-2026-04-30`. The `-u` flag captured ALL untracked files in the worktree, including the audit drafts that the SIBLING audit forks had legitimately just shipped. Stash was never popped. Audit drafts vanished from disk for ~17 minutes until the audit-vanish-investigation fork (fork_mol52kiw_ef29ad) located them in stash@{0}. Conductor recovered via `git checkout stash@{0}^3 -- <paths>` at 17:13 AEST.

Note: untracked-files captured by `-u` live in `stash@{0}^3` (the third parent of the stash commit), not `stash@{0}` itself - the investigation report initially recommended the wrong recovery path; conductor corrected. This recovery semantic (recoded as Do/Do-not item 5 above) is the most-likely-to-be-forgotten detail; it is the FIRST thing a future fork needs when staring at a `-u` stash that ate sibling work.

The architectural framing: the working tree IS a shared cross-fork substrate. Fork A's untracked files are Fork B's invisible context. `git stash push -u` from Fork B silently captures Fork A's deliverables and parks them under Fork B's name. The author-fork-owns-restore rule is the only mechanism preventing the captured state from going dark across the fork lifecycle.

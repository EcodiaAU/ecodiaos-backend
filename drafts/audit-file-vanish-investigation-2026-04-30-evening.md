# Audit-File Vanish Investigation — 30 Apr 2026 evening

**Fork:** fork_mol52kiw_ef29ad
**Generated:** 2026-04-30 ~07:08 UTC (17:08 AEST)
**Status:** RESOLVED — root cause confirmed, all 4 audit files RECOVERABLE in full.

---

## TL;DR

The 4 wave-1 audit files DID write to `~/ecodiaos/drafts/` correctly. They were swept off disk by `git stash push -u` executed inside fork_mol4qpm9_7421ca (Phase 1 architecture fork) at ~16:50 AEST when it cleared the working tree before checkout to its new branch `feat/cron-session-mode-classifier-2026-04-30`. The `-u` flag captured untracked files. The stash was never popped. All 4 audit files plus a 5th bonus draft (`pyramid-architecture-sketch-2026-04-30-evening.md`) and 6 pattern files are sitting in `stash@{0}` and are 100% recoverable via `git stash apply stash@{0}` (or by selectively checking out individual paths from the stash).

---

## Findings per hypothesis

### H1 — Forks ran in temporary worktrees, drafts vanished with worktree teardown
**REJECTED.** Inspected `src/services/forkService.js`. Forks default to `cwd = env.OS_SESSION_CWD || '/home/tate/ecodiaos'` — they share the conductor's main working directory, NOT a temp worktree. `/tmp/` listing shows no `/tmp/ecodiaos-wt-fork_mol3*` dirs. The 2 stale temp worktree dirs that exist (`/tmp/ecodiaos-doctrine-restore-1777526250` and `/tmp/ecodiaos-wt-fork_mol0wkdk`) belong to other fork classes, not the audit forks. Cross-confirmed by mtime match: the conductor's 16:29 ls saw `claude-md-cleanup-audit-2026-04-30-evening.md` at mtime 06:23 UTC; fork_mol3dd42_8bdb25 ended_at = 06:23:30Z. The file was real and in `~/ecodiaos/drafts/`.

### H2 — Subsequent operation deleted the files
**CONFIRMED via the `git stash push -u` mechanism (not `rm`, not `git clean`).** `git stash list` shows `stash@{0}: On feat/conductor-pm2-detach-decision-3993-commit-2-fork_mol0vfnr_78c3e4: fork_mol4qpm9_pre-cron-session-mode`. `git stash show --include-untracked --name-only stash@{0}` lists ALL FOUR audit files as captured untracked-file entries:

```
drafts/claude-md-cleanup-audit-2026-04-30-evening.md
drafts/loops-pipelines-cleanup-2026-04-30-evening.md
drafts/patterns-cleanup-audit-2026-04-30-evening.md
drafts/state-substrates-cleanup-2026-04-30-evening.md
```

Plus a 5th audit-adjacent file (`drafts/pyramid-architecture-sketch-2026-04-30-evening.md`) and 6 pattern files (`100-percent-autonomy-doctrine-30-apr-2026.md`, `cowork-is-a-gui-tool-not-a-peer-brain.md`, `decide-do-not-ask.md`, `distinguish-cowork-typed-from-tate-typed-messages.md`, `no-tate-gate-on-converged-architecture.md`, `stop-asking-just-decide.md`) plus telemetry jsonls.

The stash name `fork_mol4qpm9_pre-cron-session-mode` identifies the perpetrator: the Phase 1 architecture fork (fork_mol4qpm9_7421ca) ran `git stash push -u -m "fork_mol4qpm9_pre-cron-session-mode"` to clean the working tree before checkout, then `git checkout -b feat/cron-session-mode-classifier-2026-04-30`, then committed e925390 (visible in git reflog HEAD@{0}). The stash was never popped. No `git stash pop` appears in any subsequent reflog or fork action. The audit files have been quietly sitting in stash@{0} since ~16:50 AEST.

### H3 — Earlier ls misread / files moved elsewhere
**REJECTED.** The conductor's mtimes (06:21 UTC, 06:23 UTC) match the corresponding fork ended_at timestamps exactly. Files were real.

### H4 — Stale-cleanup cron deleted them
**REJECTED.** No fork-reaper or cleanup cron exists that touches `~/ecodiaos/drafts/`. `git fsck --lost-found` shows dangling commits but they're unrelated to draft files (drafts were never committed).

---

## Confirmed root cause

**Pattern:** `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` recommends `git stash push -u -m "<my-fork-id>-stash-of-prior-uncommitted-work"` when a fork finds dirty/uncommitted state from sibling forks before doing its own checkout. The Phase 1 architecture fork applied that doctrine correctly, but **the stash was never restored**, and the conductor was never told the stash existed. The audit files (which the audit forks had legitimately just shipped to `~/ecodiaos/drafts/`) got swept up as untracked files because `-u` is indiscriminate — it stashes EVERY untracked path in the worktree, not just the dirty ones the fork wanted to park.

**Failure-mode classification:** "stash-and-checkout doctrine swept legitimate sibling-fork deliverables into a stash that was never popped." This is a corollary of the doctrine, not a violation — the doctrine works fine in the single-stream case but breaks when **multiple in-flight forks share a worktree** (audit forks shipping deliverables vs Phase 1 fork checking out a new branch).

---

## Recoverability

**YES — full recovery.** All 4 audit files are intact in `stash@{0}`. Two recovery paths:

**Option A (cleanest, recommended):** `cd ~/ecodiaos && git checkout stash@{0} -- drafts/claude-md-cleanup-audit-2026-04-30-evening.md drafts/loops-pipelines-cleanup-2026-04-30-evening.md drafts/patterns-cleanup-audit-2026-04-30-evening.md drafts/state-substrates-cleanup-2026-04-30-evening.md drafts/pyramid-architecture-sketch-2026-04-30-evening.md` — pulls just the 5 draft files out of the stash without restoring everything else. Stash entry remains intact for the pattern files / telemetry jsonls (those should be evaluated separately — some pattern files in the stash may be drafts that should NOT auto-restore because they could conflict with what's currently on disk).

**Option B (heavier):** `git stash apply stash@{0}` — restores all 17 paths in the stash. Risk: pattern files in the stash may overwrite or conflict with current state (e.g. the 6 pattern files listed could collide with current versions on this branch). Option A is safer.

After recovery, the conductor should drop stash@{0} only AFTER confirming nothing else in the stash is needed (e.g. the `pyramid-architecture-sketch-2026-04-30-evening.md` is not in the original 4-fork brief but appears legitimate; the pattern files need diffing against current disk before deciding).

---

## Proposed remedy (1 sentence per the brief)

**Immediate:** Conductor runs Option A above to recover the 4 audit files (plus the bonus 5th `pyramid-architecture-sketch`), then proceeds to dispatch EDIT forks against the original audit deliverables; **doctrine fix:** author a new pattern file `~/ecodiaos/patterns/stash-must-be-named-and-restored-by-author-fork.md` with the rule "any fork that runs `git stash push -u` MUST (a) name the stash with its fork_id AND a one-line description of WHAT was parked, (b) emit a status_board P2 row with the stash name + `next_action_by=<fork_id>` until the fork pops it, (c) pop the stash before signalling [done] OR explicitly hand the stash off to a follow-up fork in the FORK_REPORT" — preventing future audit-deliverable-vanish events.

---

## Recommended next steps for conductor

1. **Recover (Option A):** `git checkout stash@{0} -- drafts/claude-md-cleanup-audit-2026-04-30-evening.md drafts/loops-pipelines-cleanup-2026-04-30-evening.md drafts/patterns-cleanup-audit-2026-04-30-evening.md drafts/state-substrates-cleanup-2026-04-30-evening.md drafts/pyramid-architecture-sketch-2026-04-30-evening.md`
2. **Verify:** `ls -la ~/ecodiaos/drafts/*-cleanup-2026-04-30-evening.md ~/ecodiaos/drafts/*-cleanup-audit-2026-04-30-evening.md ~/ecodiaos/drafts/pyramid-architecture-sketch-2026-04-30-evening.md` → expect 5 files.
3. **Audit the stash residue:** `git stash show -p stash@{0} -- patterns/` to see what pattern files were captured. Diff against current disk before applying or dropping. Some may be sibling-fork doctrine work in flight; others may be obsolete copies. DO NOT auto-pop the stash until the pattern-files question is resolved — risk of overwriting newer doctrine.
4. **Author the doctrine pattern file** `~/ecodiaos/patterns/stash-must-be-named-and-restored-by-author-fork.md` (cross-ref `stash-and-clean-when-finding-sibling-fork-unsafe-state.md` and `factory-reject-nukes-untracked-files.md`).
5. **Status_board P2 row:** "stash@{0} contains 5 drafts + 6 patterns + telemetry jsonls from fork_mol4qpm9 — recover drafts, audit patterns before drop." Owner: ecodiaos.
6. **Cross-reference into CLAUDE.md** under "Fork dispatch is demand-driven" section: add a paragraph on the stash-shadow failure mode + link to the new pattern file.
7. **DO NOT** re-dispatch the 4 audit forks — wasted tokens, the deliverables exist intact in the stash. The recovery is one `git checkout` away.

---

## Cross-references

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — phantom-shipped narration corollary; in this case the narration WAS true at the time and the disk DRIFTED later.
- `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` — the doctrine that produced the failure mode (correctly applied, missing the restore-on-completion clause).
- `~/ecodiaos/patterns/factory-reject-nukes-untracked-files.md` — sibling failure mode (untracked-file fragility under fork operations).
- `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` — related (cross-fork state propagation).
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — meta-rule (the working tree IS one of the substrates with seams).

---

## Phase C tag pre-staging (already in FORK_REPORT, repeated here for durable record)

[APPLIED] ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md — investigation of phantom-shipped failure.
[APPLIED] ~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md
[APPLIED] ~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md
[APPLIED] ~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md
[APPLIED] ~/ecodiaos/patterns/factory-reject-nukes-untracked-files.md
[APPLIED] ~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md — read-only investigation, directly responsive to brief.
[NOT-APPLIED] secrets:Corazon — no laptop-agent calls in this fork.
[NOT-APPLIED] secrets:MacInCloud — no Mac SSH work.

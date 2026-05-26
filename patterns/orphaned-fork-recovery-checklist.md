---
triggers: orphaned-fork, no-fork-report, no_report_emitted, fork-bailed, fork-closed-no-report, fork-recovery-checklist, transcript-tail, sdk-fork-orphan, partial-fork-deliverables, fork-uncommitted-work, recover-on-main, fork-disk-state, fork-substrate-probe
---

# Orphaned-fork recovery checklist - probe substrates before assuming bailed

A fork can close without emitting `[FORK_REPORT]` while still having done real work. The os_session message router signals this with `no_report_emitted=true` and a `transcript_tail` from the last 500 chars of the fork's output. Treating this as "fork bailed" loses partial deliverables that ARE on disk / in DB / in kv_store / in Neo4j. The conductor MUST probe substrates before deciding recovery action.

## Failure mode

Fork dispatched with multi-part brief (e.g. PART A producer + PART B backfill + PART C contract test). Fork executes, writes intermediate state across substrates, then closes mid-final-action without emitting the closing `[FORK_REPORT]`. The substrates carry the work. The conductor's chat inbox sees only the truncated transcript_tail, which often shows the fork mid-step ("Run the test:" / "Now committing:") and looks bailed.

If the conductor flips status, re-dispatches, or worse just abandons - the work either gets done twice (re-dispatch with no idempotency) or never lands at all (the test file the fork wrote stays untracked, the DB UPDATE the fork ran stays in production-but-unaudited state, the source-file edits stay uncommitted on the worktree forever).

## The rule (do)

When `[FORK_REPORT] no_report_emitted=true` arrives:

1. **`git status` to find uncommitted work** on the worktree. List both `M` (modified) and `??` (untracked) files. Cross-reference against the fork's brief to identify intended-scope changes vs incidental runtime churn (rotated log files, etc).
2. **Probe each substrate** for partial writes:
   - DB: run the count(*) / SELECT the fork was supposed to produce. Compare to pre-fork baseline.
   - kv_store: query keys the brief said the fork would write.
   - Neo4j: search for Decision/Episode nodes the brief mandated.
   - Filesystem: `ls` for files the brief said the fork would author.
   - git: `git log --grep` for commit messages matching the fork's brief.
3. **Read the transcript_tail in `os_forks.result`** for the fork's last action. The tail surfaces what the fork was DOING when it closed. Common patterns: "Run the test:" (PART C in flight), "Now committing:" (commit step pending), "Updating status_board:" (post-ship artefact pending).
4. **Classify recoverable vs re-dispatch vs abandon**:
   - **Recoverable**: ≥1 substrate carries partial deliverables AND remaining work is single-conductor-pass-able (run a test, commit, write missed post-ship rows). Take this path.
   - **Re-dispatch**: substrates show NO partial work (fork bailed at brief-load). Re-spawn with the SAME brief.
   - **Abandon**: substrates show partial-but-corrupted work (e.g. half-finished migration with broken intermediate state). RCA fork to inspect, then either repair or roll back.
5. **If recoverable**: surgical staging (NOT `git add -A`), run any tests the fork wrote (pre-commit verification per `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`), commit + push, write the post-ship artefacts the fork missed (status_board UPDATE, kv_store ship-receipt, Neo4j Decision capturing both the work AND the orphan-recovery itself).

## Do not

- Do NOT flip status_board to `shipped` based on transcript_tail narration without verifying substrate writes.
- Do NOT re-dispatch the same brief without checking substrates first - re-dispatch on already-done work either no-ops (good fork checks) or duplicates the work (bad fork doesn't check).
- Do NOT `git add -A` to "just commit everything the fork did" - the worktree often has incidental runtime churn (rotated log JSONL, stale haiku-review-tokens, drafts from sibling work) that should NOT be in the fork's recovery commit.
- Do NOT assume the fork's test suite passes - the fork may have left a buggy contract test on disk. Always run the test BEFORE committing it.
- Do NOT skip the post-ship artefacts. Fork orphaned BEFORE writing status_board / kv_store / Neo4j means those still need writing - the recovery IS responsible for landing them.

## Protocol invariants

- **Substrate probe is mandatory.** No transcript_tail narration alone is ground truth; the fork's own claim is suspect. Only DB rows, on-disk files, kv_store rows, Neo4j nodes, and git commits count.
- **Surgical staging.** `git add <file1> <file2> ...` named-list-of-files always, never `-A` and never `.`.
- **Test before commit.** If the fork wrote a contract test, run it. If it fails, fix the test OR the code (whichever is the bug) before committing.
- **Recovery is the conductor's job, not a re-fork.** The conductor has the recon (the substrate probes already done this turn). A new fork would have to redo all of it. Forking the recovery defeats the purpose.

## Cross-references

- `~/ecodiaos/patterns/sdk-forks-must-commit-deliverables-not-leave-untracked.md` - sister rule: forks that DO commit successfully should never leave intended work uncommitted. Orphans violate this; recovery enforces it post-hoc.
- `~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md` - sister rule: classifies fork status from substrate state, not narrated state. This pattern is the procedural counterpart.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - parent doctrine: narration-vs-disk reconciliation is the universal anti-drift discipline.
- `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md` - applies in REVERSE here: the conductor already has the recon from substrate probes; forking the recovery would force a fresh fork to redo all probes.
- `~/ecodiaos/patterns/_archived/factory-reject-nukes-untracked-files.md` - related: untracked files can be nuked by reject paths; surgical staging avoids this risk on recovery.

## Origin

Two orphan-without-report events on 9 May 2026:

1. **08:08 AEST** - `fork_moxgstxz_f6b66b` dispatched for dispatch_event.metadata.kind plumb + backfill + contract test (Phase G Critique #5). Closed without [FORK_REPORT]. Substrate probe found: DB backfill DONE (1510/1510 rows with kind), test file ON DISK (`tests/dispatchEventKindContract.test.js`, 8453 bytes, untracked), source edits MODIFIED but uncommitted across 11 files. Conductor recovered: ran test (5/5 pass), surgical commit `57eecb4`, pushed main. Post-ship artefacts (status_board 46dd8d9a `shipped`, kv_store `ceo.last_dispatch_event_kind_fix`, Neo4j Decision 1474) all landed. Total recovery time: 18 minutes.

2. **09:09 AEST** - `fork_moxiyab8_aa35ce` dispatched for Phase C tag-feedback gaps 2+3. Closed without [FORK_REPORT]. Substrate probe found: gap 2 ALREADY shipped overnight via commit `713fff4`, gap 3 work MODIFIED across 5 files + test ON DISK (`tests/credSurfaceFalsePositiveContract.test.js`, 9693 bytes, untracked) but with 2 of 5 guards FAILING. Conductor diagnosed (test had `indexOf` regex finding function definition not call site; hook had un-narrowed MacInCloud bare-noun regex), fixed both, ran test (5/5 pass), surgical commit `3f1607f`, pushed main. Post-ship artefacts (status_board 18f02513 `shipped`, this pattern file as the codification artefact) landed. Total recovery time: 21 minutes.

Codified at the second strike per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`. Single-instance was Neo4j Decision 1474 only; second-instance triggered pattern file authoring.

The doctrine_implication from Decision 1474 still stands as a future-fork item: the listener that publishes `no_report_emitted=true` to the conductor's perception bus should ALSO auto-insert a status_board P3 row "fork orphaned, deliverables unknown" so the conductor can never miss this signal, even when the inbox prefix is truncated. Track at status_board if/when authored.

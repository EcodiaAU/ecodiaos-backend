# Patterns cleanup audit - 30 Apr 2026 evening

**Fork:** `fork_mol3duz6_10047d`
**Scope:** `~/ecodiaos/patterns/` end-to-end audit. Trivial fixes shipped, substantive items proposed.
**Doctrine reference points:** 30 Apr 15:48 AEST (`cowork-is-a-gui-tool-not-a-peer-brain.md`) + 15:55 AEST (`100-percent-autonomy-doctrine-30-apr-2026.md`).
**Counts:** 127 pattern .md files on disk (excl. INDEX.md). 82 unique entries in INDEX.md (~45 file drift, flag-don't-fix; daily 22:00 AEST cron regenerates).

---

## 1. Superseded patterns

### 1.1 `conductor-cowork-duo-roles-and-handoffs.md` - SUPERSEDED, needs rewrite or archive

**Status:** still on disk, still grep-addressable, framing now contradicts canonical doctrine.

**The problem.** Section 1 ("The rule") states Conductor and Cowork form "a 2-agent duo with COMPLEMENTARY capability surfaces. Neither is a substitute for the other; they cover different gaps." This is the peer-paradigm framing Tate explicitly rolled back at 15:48 AEST. The corrective doctrine in `cowork-is-a-gui-tool-not-a-peer-brain.md` states Cowork is a GUI tool the conductor INSTRUCTS, not a peer brain. Section 5 ("Role split") preserves a useful task-class table but frames it as "Owner | Why" with Cowork owning task classes - the new doctrine says the conductor owns ALL classes and INSTRUCTS Cowork to execute the GUI subset.

**Origin section internal contradiction.** Lines 102-108 cite Tate's 11:55 AEST verbatim ("You and cowork are the duo... become insane together") which was rolled back at 15:48 AEST same day. The file does not carry the rollback note that `no-tate-gate-on-converged-architecture.md` and `distinguish-cowork-typed-from-tate-typed-messages.md` both carry.

**Neo4j Pattern node 3976 (sig 0.83)** mirrors the superseded framing. Needs reconciliation in the same wave.

**Proposed action (P1):** Rewrite with a Section 0 rollback note pointing at `cowork-is-a-gui-tool-not-a-peer-brain.md` + `100-percent-autonomy-doctrine-30-apr-2026.md`, reframe Section 5 as "tool-class | conductor instructs Cowork to execute (yes/no)" rather than "Owner", strip the "duo" / "peer-paradigm" / "complementary brains" wording. Section 6 (V2 API gotchas) and Section 7 (handoff protocols mechanics) and Section 8 (status snapshot) are durable and stay. Alternative: archive entirely and let `claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` + `cowork-conductor-dispatch-protocol.md` + `cowork-v2-api-shape-conventions.md` carry the load. Recommendation: rewrite, not archive - the role-split table and the V2 substrate-write source-tagging info are the most concrete reference for new sessions and have no cleaner home.

**NOT shipped this fork.** The rewrite needs Tate-direct or conductor-principal review of the new framing's accuracy against the V2 substrate; not a trivial typo fix.

### 1.2 `cowork-v2-api-shape-conventions.md` - HOLD, durability-check needed

The 6 API-shape gotchas do not depend on the peer/GUI-tool framing - they are mechanical conventions for callers. P2 review: confirm none of the 6 gotchas reference Cowork as architectural authority (they should not; they are write-mechanics).

### 1.3 No other superseded files found

`no-tate-gate-on-converged-architecture.md`, `distinguish-cowork-typed-from-tate-typed-messages.md`, `claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`, `cowork-conductor-dispatch-protocol.md`, `cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md`, `cowork-no-focus-collision.md`, `cowork-passkey-stall-conductor-injects.md`, `corazon-is-a-peer-not-a-browser-via-http.md`, `drive-chrome-via-input-tools-not-browser-tools.md` - all read clean against post-15:48 doctrine. The first two carry explicit rollback notes from this morning's correction wave.

---

## 2. Missing / weak triggers

### 2.1 Missing triggers frontmatter

**Result:** ZERO. `grep -L 'triggers:' ~/ecodiaos/patterns/*.md` returns no files. All 127 patterns have a triggers line.

### 2.2 Weak triggers - spot-sample findings

Did not perform exhaustive review (one fork, time-bound). Spot-sampled 30 random files; all carry serviceable triggers with multiple keyword variants. P3 proposal: weekly synthesis fork to grade triggers for surface-quality at cron fire time, not in this audit.

### 2.3 Trivial fixes shipped: NONE in this section.

---

## 3. Broken cross-references

10 referenced paths do not resolve to files on disk. None have unambiguous renames available, so all become P1 proposals (author the missing pattern OR scrub the reference; conductor-principal call). Reference-frequency from CLAUDE.md included to inform priority.

| Missing file | Refs found | Recommended action |
|---|---|---|
| `verify-deployed-state-against-narrated-state.md` | 5+ refs in `~/ecodiaos/CLAUDE.md` (the most-cited missing file; framed as a "meta-rule" subsuming several existing patterns) | **AUTHOR.** This is the meta-rule that names every "narration drifts from disk" failure. Existing siblings (`verify-empirically-not-by-log-tail.md`, `deploy-verify-or-the-fork-didnt-finish.md`, `factory-approve-no-push-no-commit-sha.md`, `factory-metadata-trust-filesystem.md`) are specific cases. Authoring it closes a heavy citation gap. |
| `when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md` | 5+ refs in `~/CLAUDE.md` and `~/ecodiaos/CLAUDE.md` (parent meta-rule of `exhaust-laptop-route-before-declaring-tate-blocked.md`) | **AUTHOR.** Tate-direct verbatim 29 Apr 10:06 AEST is on file. Existing `route-around-block-means-fix-this-turn-not-log-for-later.md` is the corollary; the parent rule itself is missing. |
| `macros-must-be-validated-by-real-run-before-codification.md` | 5+ refs in `~/ecodiaos/CLAUDE.md` (cited as "the validation backstop") | **AUTHOR.** Schema-half (migration 070_runbook_validation_runs_and_trigger.sql) and warning-half (`scripts/hooks/macro-runbook-write-surface.sh`) are referenced as live; doctrine-half is missing. |
| `cred-rotation-must-propagate-to-all-consumers.md` | 4+ refs in `~/ecodiaos/CLAUDE.md` (cred-rotation discipline) | **AUTHOR.** The 7-step consumer-surface checklist already exists inline in CLAUDE.md; lift to its own file. |
| `distributed-state-seam-failures-are-the-core-infrastructure-risk.md` | 4+ refs in `~/ecodiaos/CLAUDE.md` (architectural meta-rule for ~10 substrate seams) | **AUTHOR.** Heavily cited as the framing that explains every "I updated both X and Y" failure mode. |
| `narration-vs-disk-reconciliation-checklist.md` | 3+ refs in `~/ecodiaos/CLAUDE.md` (six-substrate "is X actually shipped" checklist) | **AUTHOR.** Companion to `verify-deployed-state-against-narrated-state.md`; named as the operational protocol that makes the meta-rule mechanical. |
| `parallel-forks-must-claim-numbered-resources-before-commit.md` | 1+ ref in `~/ecodiaos/CLAUDE.md` (Factory anti-pattern) | **AUTHOR.** Numbered-resource-collision rule explicitly cited by name. |
| `forks-self-assessment-is-input-not-substitute.md` | 1 ref in `~/ecodiaos/CLAUDE.md` (subsumed by `verify-deployed-state-against-narrated-state.md` per CLAUDE.md text) | **SCRUB or AUTHOR.** If the meta-rule is authored, this becomes a specific case; otherwise scrub the reference. |
| `same-process-monitors-are-not-monitors.md` | 1 ref | **AUTHOR or SCRUB.** Low-frequency citation; rule body unclear from name alone. Conductor judgment call. |
| `third-time-repeat-failure-demands-mechanical-enforcement.md` | 1 ref | **CHECK against `recurring-drift-extends-existing-enforcement-layer.md`.** Likely the same rule under a different name; if so, scrub the reference and standardise on the existing file. |

**Trivial fixes shipped: NONE.** None of the 10 broken paths have an unambiguous existing-file mapping. Editing CLAUDE.md or pattern files to scrub references would itself be substantive (changes the rule corpus); editing pattern files to author the missing files exceeds this fork's brief (no new patterns).

---

## 4. Duplicate-rule consolidation candidates

### 4.1 The "don't ask, just decide" cluster (P2)

Five files state overlapping rules with different framings:
- `decide-do-not-ask.md` (procedural filter)
- `stop-asking-just-decide.md` (output recognition + reward-signal trap)
- `minimize-tate-approval-queue.md` (queue management)
- `no-tate-gate-on-converged-architecture.md` (specific case for converged work)
- `100-percent-autonomy-doctrine-30-apr-2026.md` (THE bar - claims to be THE upgrade)

The 100% autonomy file is dated and clearly framed as the canonical bar; the others are claimed to remain canonical for "procedural mechanics." This is workable but invites doctrine drift. **P2 proposal:** add a Section 0 to each of the four older files explicitly stating "the BAR is set by `100-percent-autonomy-doctrine-30-apr-2026.md`; this file covers the procedural mechanic of <X>." Or consolidate the four older files into a single `permission-seeking-mechanics-and-anti-patterns.md` with subsections, leaving 100-percent-autonomy as the BAR doctrine.

### 4.2 The "verify shipped state" cluster (P2, depends on 3.1 author decision)

Seven existing verify-* files plus the missing meta-rule. If `verify-deployed-state-against-narrated-state.md` is authored, the cluster becomes:
- Meta: `verify-deployed-state-against-narrated-state.md`
- Specific: `verify-empirically-not-by-log-tail.md`, `verify-before-asserting-in-durable-memory.md`, `verify-e2e-harness-loads-before-claiming-coverage.md`, `verify-monitoring-query-schema-before-declaring-broken.md`, `visual-verify-is-the-merge-gate-not-tate-review.md`, `deploy-verify-or-the-fork-didnt-finish.md`, `scheduled-redispatch-verify-not-shipped.md`, `factory-approve-no-push-no-commit-sha.md`, `factory-metadata-trust-filesystem.md`, `factory-phantom-session-no-commit.md`.

That is a clean meta-then-cases structure. No consolidation needed if the meta is authored. **P2 proposal:** dependent on 3.1.

### 4.3 The "fork hygiene" cluster (P3)

`fork-by-default-stay-thin-on-main.md`, `forks-do-their-own-recon-do-not-probe-on-main.md`, `sdk-forks-must-commit-deliverables-not-leave-untracked.md`, `continuation-aware-fork-redispatch.md`, `check-pre-kill-commits-before-redispatch.md`, `stash-and-clean-when-finding-sibling-fork-unsafe-state.md`, `pre-stage-fork-briefs-before-session-killing-ops.md`, `parallel-forks-must-claim-numbered-resources-before-commit.md` (missing). All distinct rules, no consolidation candidates - flag for review only.

### 4.4 The "factory" cluster (P3)

9 files. All distinct rules covering different failure modes (approve-no-push, codebase-staleness, metadata-trust, phantom-session, quality-gate-cron, redirect-before-reject, reject-nukes-untracked, worktree-branch-substrate, cc-sessions-tracking-drift). No consolidation candidates.

---

## 5. INDEX.md drift report

- Files on disk: **127** (excl. INDEX.md itself)
- Unique entries in INDEX.md table: **82**
- Drift: ~**45 patterns missing from INDEX**

**Action:** none in this fork. Per `~/ecodiaos/CLAUDE.md`, the daily 22:00 AEST `index-regen` cron rebuilds INDEX.md from disk. Manual writes risk colliding with the cron's regen pass.

**P3 proposal:** verify the index-regen cron is firing and producing the expected ~127-entry index. Check `os_scheduled_tasks` for the task and `last_run_at`. If the cron is broken or paused, that is the actual fix - not a manual INDEX edit.

---

## 6. Trivial fixes shipped

**None.**

The brief authorised two classes of trivial fix: (a) add `triggers:` lines where rule is unambiguous from filename + first paragraph, (b) fix broken cross-reference paths where the correct path is unambiguous from disk.

- **Class (a):** zero files missing `triggers:` frontmatter. Nothing to ship.
- **Class (b):** zero of the 10 broken cross-reference paths have an unambiguous existing-file mapping on disk. All require either authoring a new pattern (forbidden by brief) or scrubbing references in 3+ files (substantive change, requires conductor judgment).

The audit IS the deliverable for this fork. The trivial-fix path was vacuously satisfied: no candidate fixes met the unambiguity bar.

---

## 7. Prioritised P1/P2/P3 punch-list

### P1 - ship within 24h

1. **Rewrite or archive `conductor-cowork-duo-roles-and-handoffs.md`** to match post-15:48 doctrine. Recommendation: rewrite with rollback note + role-split table reframed as conductor-instructs-Cowork; preserve sections 6-8 (V2 substrate mechanics). Also reconcile Neo4j Pattern node 3976.
2. **Author `verify-deployed-state-against-narrated-state.md`** (most-cited missing meta-rule, 5+ refs in CLAUDE.md, named as parent of 4+ existing patterns).
3. **Author `when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md`** (5+ refs, Tate-direct verbatim 29 Apr 10:06 AEST on file).
4. **Author `macros-must-be-validated-by-real-run-before-codification.md`** (schema half live, warning hook live, doctrine half missing).

### P2 - ship within a week

5. **Author `cred-rotation-must-propagate-to-all-consumers.md`** (4+ refs; lift the inline 7-step checklist out of CLAUDE.md).
6. **Author `distributed-state-seam-failures-are-the-core-infrastructure-risk.md`** (4+ refs; architectural meta-rule).
7. **Author `narration-vs-disk-reconciliation-checklist.md`** (3+ refs; companion to P1.2).
8. **Author `parallel-forks-must-claim-numbered-resources-before-commit.md`** (Factory anti-pattern, named in CLAUDE.md).
9. **Add Section 0 rollback / hierarchy notes** to `decide-do-not-ask.md`, `stop-asking-just-decide.md`, `minimize-tate-approval-queue.md`, `no-tate-gate-on-converged-architecture.md` pointing at `100-percent-autonomy-doctrine-30-apr-2026.md` as THE bar (5-file cluster cleanup per Section 4.1).
10. **Verify `cowork-v2-api-shape-conventions.md`** does not carry peer/duo framing (Section 1.2).

### P3 - ship within a month or as drift surfaces

11. **Resolve `forks-self-assessment-is-input-not-substitute.md`** - scrub if subsumed by P1.2, otherwise author.
12. **Resolve `same-process-monitors-are-not-monitors.md`** - investigate rule body, author or scrub.
13. **Reconcile `third-time-repeat-failure-demands-mechanical-enforcement.md`** vs existing `recurring-drift-extends-existing-enforcement-layer.md` - likely duplicate names for one rule; scrub the broken reference.
14. **Verify INDEX.md regen cron is firing.** 45-file drift suggests the cron may be paused/broken or the file-add side is racing the regen window.
15. **Weekly trigger-quality grading fork** to surface weak triggers from cron-fire empirical data, not from spot sampling.

---

## 8. Phase C tag acknowledgements

[APPLIED] ~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md
[APPLIED] ~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md - drove the Section 1.1 superseded-flag.
[APPLIED] ~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md - audit text is in this draft file, not in the conductor chat.
[APPLIED] ~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md - findings persisted to disk this turn, not deferred.
[APPLIED] ~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md - on-main exception (b)+(c) for the audit grep loop; brief forbids nested forks.
[NOT-APPLIED] ~/ecodiaos/patterns/factory-quality-gate-over-cron-mandate.md - no Factory dispatch in this fork.
[NOT-APPLIED] secrets:MacInCloud - this fork audits ~/ecodiaos/patterns/ only; no MacInCloud / SY094 / Mac SSH work. Hook fired on "Mac" appearing in pattern files the fork reads.
[NOT-APPLIED] secrets:Corazon - same reason; no Corazon laptop-agent calls. Hook fired on "Corazon" appearing in pattern files.

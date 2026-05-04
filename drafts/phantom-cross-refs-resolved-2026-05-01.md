# Phantom doctrine cross-refs - audit + resolution
**Date:** 1 May 2026 evening AEST  
**Fork:** fork_mommq5qk_dd7190  
**Brief origin:** 72h autonomous window 1-4 May 2026, convergence of fork_momlhla9 skills migration probe + archived row 0d120520 stash residue

## Per-slug verdict table

| # | Slug | Verdict | Source |
|---|---|---|---|
| 1 | `decide-do-not-ask` | AUTHORED (restored from git 15b647a) | PR #18 Phase D telemetry, original author 30 Apr 2026 |
| 2 | `verify-deployed-state-against-narrated-state` | AUTHORED (restored from git c423073) | fork_mol5vy5w_250614 ambient-OS cleanup-night Wave-1, 30 Apr |
| 3 | `when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block` | AUTHORED (restored from git c423073) | fork_mol5vy5w_250614 same Wave-1 ship pass |
| 4 | `cowork-is-a-gui-tool-not-a-peer-brain` | AUTHORED (restored from git c423073) | fork_mol5vy5w_250614 same Wave-1 ship pass |
| 5 | `stop-asking-just-decide` | AUTHORED (restored from git 15b647a) | PR #18 Phase D telemetry, original author 30 Apr |
| 6 | `100-percent-autonomy-doctrine-30-apr-2026` | AUTHORED (new file from CLAUDE.md context) | fork_mommq5qk_dd7190 (this fork) |
| 7 | `distinguish-cowork-typed-from-tate-typed-messages` | NOTED accept-as-lost | No active citations in any .md file; lower priority |
| 8 | `no-tate-gate-on-converged-architecture` | NOTED accept-as-superseded | Per brief: rolled back per Decision 30 Apr 2026; do not re-author |

## File paths created

```
/home/tate/ecodiaos/patterns/decide-do-not-ask.md                                                       (8311 bytes, restored)
/home/tate/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md                            (6767 bytes, restored)
/home/tate/ecodiaos/patterns/when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md   (5780 bytes, restored)
/home/tate/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md                                   (5469 bytes, restored)
/home/tate/ecodiaos/patterns/stop-asking-just-decide.md                                                 (14059 bytes, restored)
/home/tate/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md                               (~6000 bytes, new authored)
```

Total file count authored / restored on disk: **6**.

## CLAUDE.md edits made

**0 edits.** All cross-refs in `~/CLAUDE.md` and `~/ecodiaos/CLAUDE.md` already pointed to the correct slugs - the issue was the files were missing on disk, not the cross-refs being wrong. Restoring the files preserves all existing cross-ref invariants without any CLAUDE.md mutation. This avoids contaminating sibling-fork uncommitted CLAUDE.md state and matches the brief's "REMOVE" resolution scope (none of the 6 needed to be removed; all 6 doctrine still valid).

## Cross-ref count added / removed

- Added: each of the 6 newly-on-disk files brings its own internal cross-ref count (decide-do-not-ask: 7 cross-refs to peers; verify-deployed-state: 6; when-a-tool-is-unavailable: 6; cowork-is-a-gui-tool: 6; stop-asking: 9; 100-percent-autonomy: 9). Total newly-discoverable cross-refs surfaced: **~43**.
- Removed: 0.
- Pre-existing dangling cross-refs from CLAUDE.md to these 8 slugs: was 8, now 6 (NOTED slugs 7 and 8 remain phantom). The 2 NOTED phantoms are not actively cited from any current .md file per grep audit, so leaving them as accept-as-lost / accept-as-superseded does not surface as broken-link in any doctrine read.

## Secondary phantom cross-refs surfaced during audit (NOT resolved this fork)

The 5 newly-restored files cross-reference 5 OTHER pattern files that also do not exist on disk. These are out of scope for this fork but should be tracked as P2 status_board work:

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (cross-ref'd from verify-deployed-state)
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` (cross-ref'd from verify-deployed-state)
- `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md` (cross-ref'd from verify-deployed-state)
- `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md` (cross-ref'd from verify-deployed-state)
- `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md` (cross-ref'd from verify-deployed-state)

All 5 are referenced from CLAUDE.md as well per grep. A follow-up sweep should run the same git-checkout / Neo4j-recover pass on these. Suggest a P2 status_board row "Phase 2 phantom cross-refs - 5 verify-deployed-state peers".

## Lesson learned

**Pattern files documented and cross-referenced from CLAUDE.md but absent on disk are themselves an instance of the narration-vs-disk drift the doctrine warns against.** The audit confirmed 8 phantom files; 6 had recoverable git history (restored exactly), 1 had no git history but explicit Tate-verbatim Origin in CLAUDE.md (newly authored), 2 had no recoverable history and no active citation (NOTED accept-as-lost / superseded).

**Mechanical implication.** The hook stack PreToolUse keyword-grep on patterns/ surface (`brief-consistency-check.sh` etc) was finding the SLUG references in cross-ref text but not verifying the target file exists. This created a "wired but dark" surfacing layer - keyword match fires but `Read` fails. The fix beyond this fork is a hook addition: every doctrine cross-ref slug should be probe-validated against the patterns/ directory at hook-fire time, with `[CONTEXT-SURFACE BROKEN]` warn for missing targets. Spec for that hook should land in a follow-up status_board row.

**Per the verify-deployed-state-against-narrated-state doctrine that this fork just restored:** narration of "doctrine X is established" propagates into status_board, Neo4j Decisions, and downstream fork briefs without anyone running a `ls patterns/X.md` probe. This is the exact six-substrate failure mode that file describes - and the file's own non-existence on disk was the most extreme instance of the rule.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the meta-rule that this audit was an instance of
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - the parent rule on doctrine hygiene
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - cross-ref-without-file is symbolic logging

## Follow-up actions queued

1. Neo4j Episode write: "Phantom doctrine cross-refs audit + resolution 1 May 2026" (this fork)
2. Status_board P2 row suggested: "Phase 2 phantom cross-refs - 5 verify-deployed-state peers" (next coordinator fire)
3. Hook spec to write: doctrine-cross-ref slug-probe validator (PreToolUse on Read of pattern files OR PostToolUse on hook fire)
4. Each of the 6 new pattern files should get a Neo4j Pattern node mirror per the Reflection structure rule (split doctrine from event)

## Constraints honoured

- Did NOT touch `action-over-plans-honesty-redeems-mistakes.md` (sibling-fork uncommitted work) - confirmed via git status, file not in this fork's diff
- Did NOT touch any client codebase
- Did NOT POST to /api/os-session/message
- Did NOT pm2_restart
- Wall budget: ~25 min (under the 60-min cap)
- Used git checkout from canonical commits over Write where possible - preserves authorship history exactly
- All new files follow the 5-section template (triggers / H1 / rule / do-do-not / Origin)

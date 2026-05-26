---
triggers: factory-dispatch-drift, factory-readonly-diagnostic-fails, factory-off-task, factory-confidence-0.49, factory-zero-files-changed, factory-watchdog-touch-only, factory-task-diff-alignment-flagged, factory-empty-files-changed, factory-diagnostic-no-deliverable, factory-self-mod-bias, factory-write-only-bias, factory-three-worker-test-2026-05-19, factory-vs-cowork-dispatch, when-to-not-use-factory, factory-anti-pattern-readonly, factory-rejects-readonly-prompt
archived_at: 2026-05-26
archived_reason: factory-substrate-deprecated-2026-05-17
superseded_by: backend/CLAUDE.md-deprecations-table-2026-05-17
---

# Factory dispatches drift off-task on read-only diagnostic prompts (2026-05-19)

## What was observed

Three Factory sessions dispatched in parallel on ecodiaos-backend with explicit read-only diagnostic briefs (KG embedding pipeline, proactivity_engine cron misfire, decision-quality pgbouncer exhaustion). All three landed:

- `validationConfidence: 0.49` (the Factory's default "uncertain / no test passed" score)
- 0-3 files changed, none matching the brief's target files
- Diffs touched: `.watchdog-last-healthy` timestamp updates, `drafts/*.md` retro/audit files, `logs/retro/*.jsonl`
- `taskDiffAlignment.flagged: true`, `overlapScore: 0` (0% keyword overlap between stated task and diff paths)
- Each session emitted 6-8 codebase_insight learnings - all pre-existing knowledge harvested from grep, not new diagnostics

The Factory's task-diff-alignment guardrail correctly flagged the drift in all three cases (the `taskDiffAlignment` fields are working as designed) but the sessions still ran to completion and consumed Claude credit budget on each account.

## Why it happens

Factory's prompt-handling pipeline is biased toward self-mod work (the codebase is the agent's own backend). When the brief is read-only ("locate", "diagnose", "propose - DO NOT change"), the session has no diff to produce, so the test runner has nothing to validate. Confidence 0.49 is the fallback. The session fills the gap by touching watchdog files and writing retro audit drafts, none of which match the brief.

Worker B's brief explicitly said "Hard constraints: No cron edits. No PM2 reloads. No Routine re-publishes. Read-only investigation." The session ignored it and produced unrelated retro audit files.

## When to use Factory vs cowork.dispatch_worker

| Task shape | Use |
|---|---|
| Read-only diagnostic, recon, "propose a fix without applying it" | NOT Factory. Use cowork.dispatch_worker, an IDE tab, or run the queries inline. |
| Closed-loop code change with tests (bug fix, feature, refactor) | Factory is fine. Validation confidence works because tests run. |
| Mixed (investigate then patch) | Split: cowork.dispatch_worker for recon, Factory for the patch with the recon result baked into the brief. |
| Anything where the brief includes "DO NOT" or "read-only" | NOT Factory. The constraint reads as guidance, not a constraint. |

## Side-effect: the learnings are still useful

Factory sessions that go off-task still emit codebase_insight learnings from their grep/read passes. Worker B's drift surfaced the laptop-agent POST /api/tool route shape (see [[laptop-agent-api-tool-route-shape-2026-05-19]]) which was load-bearing for the broader arc. If you accept the drift cost, harvest the learnings field. But don't dispatch Factory expecting the stated deliverable on read-only briefs.

## Cost

Three drifted dispatches on 2026-05-19 each consumed Claude-Max account credit. At ~$1020/mo total budget across tate@/code@/money@ that is non-zero waste. The substrate-level fix is to add a Factory pre-dispatch classifier that rejects briefs containing "DO NOT", "read-only", "no code changes", "no PM2", "no migration" and routes them to cowork.dispatch_worker instead.

## How this surfaced

Capability stress-test 2026-05-19. Three Factory sessions dispatched in parallel as Arc 1 of a 3-arc demo. All three completed identically (conf 0.49, off-task) inside the same 11-minute window. Reproducibility = 3/3. Codified within the same session per [[codify-at-the-moment-a-rule-is-stated-not-after]].

See also: [[brief-names-the-product-not-the-immediate-task]], [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]], [[audit-low-confidence-factory-commits-on-critical-path]], [[continuation-aware-fork-redispatch]].

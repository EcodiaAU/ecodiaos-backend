# Drift check post-processor report - 1 May 2026 19:40 AEST

Fork: fork_momq3qah_182bd9
Generated: 2026-05-01T09:43:58.320953

## Summary

- Total flags parsed from cron output: 86
- Note: original JSON was truncated at ~50KB (51024 total chars). Final ~3 flags possibly cut off mid-string. 86 fully-parsed flags processed.
- All flag_type values: `dormant_pattern_candidate` (86)
- Other expected types (`regression_signal`, `silent_hook_candidate`): NONE in parsed window

## Filter results (mtime classification)

| Category | Count | Disposition |
|---|---|---|
| Newly-authored (mtime <14d) FALSE POSITIVE | 86 | Aggregated into ONE batch P3 row |
| Phantom (file missing) | 0 | n/a |
| Legitimately dormant (mtime >14d) | 0 | n/a |

## Why these are false positives

`computeDriftSignals` emits `dormant_pattern_candidate` when a pattern has zero `surface_event` rows in the last 90 days. But every flagged file has mtime <14d, with most <1d (authored TODAY in the 30 Apr - 1 May 2026 doctrine push). A pattern younger than 90 days CANNOT have 90 days of surface history - the lookback window is impossible to satisfy. The detector is reporting a structural impossibility as a drift signal.

## All 86 false-positive files (sorted by age)

| Age (days) | Filename |
|---|---|
| 0.06 | 100-percent-autonomy-doctrine-30-apr-2026.md |
| 0.06 | cowork-is-a-gui-tool-not-a-peer-brain.md |
| 0.06 | verify-deployed-state-against-narrated-state.md |
| 0.06 | when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md |
| 0.06 | stop-asking-just-decide.md |
| 0.13 | action-over-plans-honesty-redeems-mistakes.md |
| 0.19 | cowork-conductor-dispatch-protocol.md |
| 0.20 | discovery-to-doctrine-same-turn.md |
| 0.21 | outcome-classification-must-distinguish-unverified-from-success.md |
| 0.21 | sdk-forks-must-commit-deliverables-not-leave-untracked.md |
| 0.21 | solo-fork-pushes-to-main-no-pr-ceremony.md |
| 0.21 | stash-and-clean-when-finding-sibling-fork-unsafe-state.md |
| 0.21 | system-injection-blocks-must-not-render-in-director-chat.md |
| 0.21 | tate-deliverables-pdf-only.md |
| 0.21 | fork-recovery-must-probe-deliverables-not-just-flip-status.md |
| 0.21 | fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md |
| 0.21 | no-self-prompting-from-queued-kv-store-plans.md |
| 0.21 | no-tate-review-carveouts-on-internal-repo-work.md |
| 0.21 | conductor-takes-agency-on-recovery-not-tate.md |
| 0.21 | cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md |
| 0.21 | cowork-no-focus-collision.md |
| 0.21 | cowork-passkey-stall-conductor-injects.md |
| 0.21 | cowork-v2-api-shape-conventions.md |
| 0.21 | conductor-cowork-duo-roles-and-handoffs.md |
| 1.90 | websearch-via-corazon-residential-ip-when-vps-bot-blocked.md |
| 1.90 | windows-spawn-must-use-spawnSync-with-create-no-window-not-execSync-with-windowsHide.md |
| 1.90 | verify-e2e-harness-loads-before-claiming-coverage.md |
| 1.90 | verify-empirically-not-by-log-tail.md |
| 1.90 | visual-first-tate-presentation.md |
| 1.90 | visual-verify-is-the-merge-gate-not-tate-review.md |
| 1.90 | status-board-no-batch-case-when-update.md |
| 1.90 | sync-back-must-filter-synthetic-from-source.md |
| 1.90 | trace-user-ui-report-to-component-before-dispatch.md |
| 1.90 | vercel-env-vars-bake-at-build-audit-when-prod-bug-but-source-looks-right.md |
| 1.90 | vercel-subdomain-rewrite-loop.md |
| 1.90 | sdk-abortcontroller-cancellation.md |
| 1.90 | silent-alerts-defer-when-tate-is-live.md |
| 1.90 | sms-segment-economics.md |
| 1.90 | recurring-drift-extends-existing-enforcement-layer.md |
| 1.90 | retrieval-threshold-tune-to-data.md |
| 1.90 | scheduled-prompt-cold-start-adequacy.md |
| 1.90 | scheduled-redispatch-verify-not-shipped.md |
| 1.90 | positive-synthesis-pattern-authoring.md |
| 1.90 | pre-stage-fork-briefs-before-session-killing-ops.md |
| 1.90 | preempt-tate-live-with-readonly-prep.md |
| 1.90 | prefer-hooks-over-written-discipline.md |
| 1.90 | probe-all-env-files-not-just-dotenv.md |
| 1.90 | project-naming-mirrors-repo-name.md |
| 1.90 | [redacted]-prepush-pipeline.md |
| 1.90 | platform-must-be-substantively-applicable.md |
| 1.90 | neo4j-episode-chain-relationships.md |
| 1.90 | neo4j-question-node-held-uncertainty.md |
| 1.90 | never-contact-eugene-directly.md |
| 1.90 | no-doctrine-writes-during-factory-running-window.md |
| 1.90 | mcp-tool-param-schema-discipline.md |
| 1.90 | multi-tenant-brief-must-enumerate-customisation-surface.md |
| 1.90 | neo4j-canonical-entity-dedup.md |
| 1.90 | gui-first-via-laptop-agent.md |
| 1.90 | inner-life-notice-calibration-not-chase-pre-calibration-self.md |
| 1.90 | falsify-absence-windows-via-vercel-deploys.md |
| 1.90 | fork-by-default-stay-thin-on-main.md |
| 1.90 | forks-do-their-own-recon-do-not-probe-on-main.md |
| 1.90 | frontend-strip-model-xml-tags.md |
| 1.90 | factory-metadata-trust-filesystem.md |
| 1.90 | factory-quality-gate-over-cron-mandate.md |
| 1.90 | factory-redirect-before-reject.md |
| 1.90 | factory-reject-nukes-untracked-files.md |
| 1.90 | enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md |
| 1.90 | excel-sync-collectives-migration.md |
| 1.90 | external-blocker-freshness-probe.md |
| 1.90 | factory-cc-sessions-tracking-drift-fe.md |
| 1.90 | factory-codebase-staleness-check-before-dispatch.md |
| 1.90 | doctrine-corpus-is-for-evolution-weekly-synthesis.md |
| 1.90 | context-surfacing-must-be-reliable-and-selective.md |
| 1.90 | curl-attachments-on-restart-no-refetch.md |
| 1.90 | client-push-pre-submission-pipeline.md |
| 1.90 | coexist-vs-platform-ip-separation.md |
| 1.90 | conductor-coordinates-capacity-is-a-floor.md |
| 1.90 | ballistic-mode-under-guardrails-equals-depth-not-action.md |
| 1.90 | brief-names-the-product-not-the-immediate-task.md |
| 1.90 | cancel-stale-schedules-when-work-resolves-early.md |
| 1.90 | chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md |
| 1.90 | client-anonymity-substring-scan.md |
| 1.90 | audit-infrastructure-for-false-embodiment-dependencies.md |
| 1.90 | audit-low-confidence-factory-commits-on-critical-path.md |
| 1.90 | authorised-branch-push-is-not-client-contact.md |

## Inserted rows

- Batch suppression row: `3fba2aac-e9cb-4a7b-aeec-fa9f1236975c` - "Drift check 1 May 2026 19:40 AEST - 86 newly-authored patterns false-flagged as dormant, suppressed" (P3)
- Detector-fix row: `2f777bba-e0f0-462d-b808-54d4de7479e0` - "Patch decision-quality drift detector to exclude patterns with mtime < 14d (false-positive root cause)" (P3)

Total rows added to status_board: **2** (vs ~86 if cron's literal instruction had been followed). status_board O4 protection: succeeded.

## Recommended detector patch (verdict: YES, queue P3)

**Concrete fix**:
```js
// In computeDriftSignals, before emitting dormant_pattern_candidate:
const stat = await fs.stat(patternPath);
const ageMs = Date.now() - stat.mtimeMs;
if (ageMs < 14 * 86400 * 1000) continue; // skip - lookback window impossible

// Optional: tier the gate by surface-event lookback length:
//   if (lookbackDays === 90 && ageMs < 90 * 86400 * 1000) continue;
//   if (lookbackDays === 30 && ageMs < 30 * 86400 * 1000) continue;
// (clean: gate must always be >= lookback)
```

Likely file path: `src/services/decisionQuality/driftDetector.*` or `src/services/decisionQuality/computeDriftSignals.*`. Grep `computeDriftSignals\|dormant_pattern_candidate` to locate.

## Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` - drift protocol
- `~/ecodiaos/patterns/status-board-no-batch-case-when-update.md` - dedup-insert per row, never batch CASE-WHEN UPDATE
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` - mtime as ground truth
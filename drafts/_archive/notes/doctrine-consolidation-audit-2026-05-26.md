# Doctrine Consolidation Audit - 2026-05-26 (Phase 0 recon)

Author: Phase 0 audit fork. Scope: pattern corpus, hook stack, CLAUDE.md tier, telemetry. Goal: produce a specific, file-level map the main session can quote into Phase 1-6 work briefs. No fixes proposed; "recommended canonical + nuance to preserve" only.

## Audit shape (preamble)

- Pattern files: **365** at `D:/.code/EcodiaOS/backend/patterns/*.md` (one is `INDEX.md`, leaving **364 substantive patterns**) plus **3** at `_archived/`. The brief estimated ~240; actual is ~50% higher.
- CLAUDE.md tier: user-global 111 lines, workspace 72 lines, backend **1222** lines. SELF.md 104 lines. INDEX.md 409 lines.
- Registered hooks in `C:/Users/tjdTa/.claude/settings.json`: 38 hook entries across UserPromptSubmit, PreCompact, PostToolUse, Stop, PreToolUse, SessionStart. Hook scripts on disk in `C:/Users/tjdTa/.claude/hooks/ecodia/`: **44** (excluding lib/state/__pycache__/logs/tests).
- Telemetry: `application-events.jsonl` has **1 row** total (single `tagged_silent` entry from 2026-05-14); `dispatch-events.jsonl` has **5 rows**. Pattern application telemetry is effectively dark.

---

## 1. Pattern duplication clusters

### 1.1 Cron fire / cron deliverable discipline

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/cron-fire-must-have-deliverable-not-just-narration.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-clean-noop-fork-reports-suppressed.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-forks-verify-via-substrate-effect-not-result-length.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-fires-during-pm2-warmup-must-fail-soft.md`
- Recommended canonical: `cron-fire-must-have-deliverable-not-just-narration.md` - already the most cited unconditional rule.
- Nuance to preserve:
  - "Conditional success is real" (no-diff INDEX regen, telemetry-under-threshold) lives in `cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`. Must survive consolidation as an explicit carve-out.
  - "Clean-noop fork reports must suppress, not emit to conductor chat" (`cron-clean-noop-fork-reports-suppressed.md`) is a different layer (presentation, not deliverable).
  - "Verify via substrate effect not result length" (`cron-forks-verify-via-substrate-effect-not-result-length.md`) is an audit primitive, not a fire rule.
  - PM2-warmup failsoft (`cron-fires-during-pm2-warmup-must-fail-soft.md`) is a substrate concern that arguably folds into the canonical "deliverable" rule as a clarifying case.

### 1.2 Cron routing / fork-default

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/crons-route-to-forks-by-default.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-prompts-must-respect-autonomous-pilot-sms-gate.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-must-be-registered-not-just-documented-2026-05-18.md`
  - `D:/.code/EcodiaOS/backend/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`
- Recommended canonical: `cron-must-be-registered-not-just-documented-2026-05-18.md` - this is the substrate-truth gate. Borderline: the whole "cron-routes-to-fork" doctrine is dead (forks dead) - the *routing-layer* claim must be rewritten or archived, but the substrate-registration claim is timeless.
- Nuance to preserve:
  - Anti-flood specifically tied to account-chain-exhaustion is a separate failure-mode.
  - Autonomous-pilot SMS gate is an orthogonal channel concern, do not fold in.
  - The applied-tag-not-as-chat-output sub-rule belongs in the chat-hygiene cluster (cluster 1.10), not here.

### 1.3 CDP launch / Chrome attach

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`
  - `D:/.code/EcodiaOS/backend/patterns/cdp-helper-library-and-recursive-improvement-2026-05-18.md`
  - `D:/.code/EcodiaOS/backend/patterns/chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md`
  - `D:/.code/EcodiaOS/backend/patterns/cdp-per-call-target-resolution-2026-05-18.md`
  - `D:/.code/EcodiaOS/backend/patterns/cdp-compound-flow-design-2026-05-17.md`
  - `D:/.code/EcodiaOS/backend/patterns/cdp-native-fill-must-descend-into-same-origin-iframes-2026-05-19.md`
  - `D:/.code/EcodiaOS/backend/patterns/chrome-cdp-network-enable-times-out-under-tab-memory-pressure-2026-05-19.md`
  - `D:/.code/EcodiaOS/backend/patterns/parallel-cdp-chat-coordination-via-alias-namespacing.md`
- Recommended canonical: `chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md` - this is the load-bearing root-cause file (re-stated verbatim across backend/CLAUDE.md). The "top-primitive" + "helper library + recursive improvement" files duplicate the launch instruction.
- Nuance to preserve:
  - Per-call target resolution / alias namespacing (parallel chats over one Chrome) is genuinely orthogonal - keep as its own pattern (`parallel-cdp-chat-coordination-via-alias-namespacing.md`).
  - `cdp-native-fill-must-descend-into-same-origin-iframes-2026-05-19.md` is a helper-internals note specific to Apple's idmsa iframe; keep narrow.
  - The memory-pressure timeout pattern is a Corazon-RAM operational note, not a CDP-launch doctrine.

### 1.4 Status board hygiene / drift

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/status-board-hygiene-is-a-0th-class-reflex-2026-05-21.md`
  - `D:/.code/EcodiaOS/backend/patterns/status-board-drift-prevention.md`
  - `D:/.code/EcodiaOS/backend/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`
  - `D:/.code/EcodiaOS/backend/patterns/status-board-no-batch-case-when-update.md`
  - `D:/.code/EcodiaOS/backend/patterns/status-board-row-granularity-matches-tate-decision-points-not-authoring-points.md`
  - `D:/.code/EcodiaOS/backend/patterns/drift-audit-slice-queries-beat-row-dump-queries.md`
- Recommended canonical: `status-board-hygiene-is-a-0th-class-reflex-2026-05-21.md` - Tate verbatim, hook-enforced, most-recent.
- Nuance to preserve:
  - Drift-audit-on-main as the canonical thin-on-main work (`status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`) is a meta-loop assignment, not a hygiene rule - keep separate. The fork-cap framing in it is dead (forks gone), needs rewrite.
  - Slice-queries vs row-dumps (`drift-audit-slice-queries-beat-row-dump-queries.md`) is a SQL technique, orthogonal.
  - Row-granularity (`status-board-row-granularity-matches-tate-decision-points-not-authoring-points.md`) is a schema-design rule, distinct from hygiene cadence.
  - The "drift-prevention" file (`status-board-drift-prevention.md`) is the older predecessor of the 0th-class reflex - likely a clean merge target.

### 1.5 Verify-state cluster

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/verify-deployed-state-against-narrated-state.md`
  - `D:/.code/EcodiaOS/backend/patterns/verify-before-asserting-in-durable-memory.md`
  - `D:/.code/EcodiaOS/backend/patterns/verify-empirically-not-by-log-tail.md`
  - `D:/.code/EcodiaOS/backend/patterns/verify-e2e-harness-loads-before-claiming-coverage.md`
  - `D:/.code/EcodiaOS/backend/patterns/verify-monitoring-query-schema-before-declaring-broken.md`
  - `D:/.code/EcodiaOS/backend/patterns/grep-absence-is-not-evidence-of-absence.md`
  - `D:/.code/EcodiaOS/backend/patterns/grep-verify-edits-after-branch-shuffle-or-formatter-2026-05-21.md`
  - `D:/.code/EcodiaOS/backend/patterns/stop-rationalising-when-symptom-persists-re-probe-reality.md`
  - `D:/.code/EcodiaOS/backend/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md`
- Recommended canonical: `verify-deployed-state-against-narrated-state.md` - already cross-referenced from 12+ other patterns and from backend/CLAUDE.md.
- Nuance to preserve:
  - `verify-empirically-not-by-log-tail.md` is a probe-method rule (logs lie); keep as a sub-pattern or fold as a section.
  - `verify-before-asserting-in-durable-memory.md` is Neo4j-write-discipline-specific; keep distinct.
  - `verify-monitoring-query-schema-before-declaring-broken.md` is monitoring-SQL-specific.
  - `grep-absence-is-not-evidence-of-absence.md` is a discovery-time gotcha; semantically tangent.
  - `shipped-infra-never-activated-decision-vs-disk-drift.md` is the decision-vs-disk failure mode and is the only one focused on shipped-but-never-activated; keep.

### 1.6 Decide-do-not-ask / autonomy

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/decide-do-not-ask.md`
  - `D:/.code/EcodiaOS/backend/patterns/stop-asking-just-decide.md`
  - `D:/.code/EcodiaOS/backend/patterns/100-percent-autonomy-doctrine-30-apr-2026.md`
  - `D:/.code/EcodiaOS/backend/patterns/minimize-tate-approval-queue.md`
  - `D:/.code/EcodiaOS/backend/patterns/no-tate-review-carveouts-on-internal-repo-work.md`
  - `D:/.code/EcodiaOS/backend/patterns/action-over-plans-honesty-redeems-mistakes.md`
- Recommended canonical: `100-percent-autonomy-doctrine-30-apr-2026.md` - explicit Decision Authority tiers, Tate-verbatim, dated, the structural anchor cited by user-global CLAUDE.md.
- Nuance to preserve:
  - `decide-do-not-ask.md` and `stop-asking-just-decide.md` are essentially the same rule said twice - one folds into the canonical.
  - `minimize-tate-approval-queue.md` is the queue-management corollary (action-side), distinct.
  - `action-over-plans-honesty-redeems-mistakes.md` is a sibling principle (action + honesty); keep separate, it covers honesty-redeems.
  - `no-tate-review-carveouts-on-internal-repo-work.md` is the negative case (do not carve out review on internal repo) - keep.

### 1.7 Fork doctrine (mostly dead substrate)

- Files (11 explicit `fork-*` plus `forks-*`):
  - `fork-by-default-stay-thin-on-main.md`, `fork-by-artefact-not-by-quickness.md`, `fork-error-cluster-at-zero-tools-treat-as-credit-exhausted.md`, `fork-error-events-do-not-surface-to-conductor-chat.md`, `fork-pending-work-at-session-start-not-after-probing-on-main.md`, `fork-recovery-must-probe-deliverables-not-just-flip-status.md`, `fork-result-fallback-must-be-marked.md`, `fork-sigterms-do-not-retroactively-un-commit-probe-origin-main.md`, `fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`, `forks-do-their-own-recon-do-not-probe-on-main.md`, `forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates.md`. Plus: `continuation-aware-fork-redispatch.md`, `manager-forks-for-multi-worker-decomposition.md`, `orphaned-fork-recovery-checklist.md`, `sdk-forks-must-commit-deliverables-not-leave-untracked.md`, `surfacing-hooks-must-cover-every-fork-spawn-substrate.md`, `stash-and-clean-when-finding-sibling-fork-unsafe-state.md`, `check-pre-kill-commits-before-redispatch.md`, `pre-stage-fork-briefs-before-session-killing-ops.md`, `solo-fork-pushes-to-main-no-pr-ceremony.md`, `scheduled-redispatch-verify-not-shipped.md`.
- Recommended canonical: hard pivot. SDK fork primitive is dead per backend/CLAUDE.md deprecation table. The whole cluster should be reframed against `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md` and `ide-tab-is-the-new-fork-mechanic-2026-05-17.md`. The structural rules that transfer one-for-one to the dispatch-worker world (worktree-commits-do-not-propagate, sigterms-not-uncommit, recovery-must-probe-deliverables) keep their content; references to `mcp__forks__spawn_fork`, `[FORK_REPORT]`, `os_forks`, `parent_fork_id`, "manager fork" need rewrite.
- Nuance to preserve:
  - The git-substrate facts (worktree-commit propagation, sigterm semantics) are runtime-agnostic and worth keeping under generalised names.
  - `forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates.md` becomes "workers must not restart ecodia-api unilaterally" - structurally still valid against `pending_restart_requests`.
  - `surfacing-hooks-must-cover-every-fork-spawn-substrate.md` is the meta-rule for dispatch-hook coverage; it survives, just retargeted.

### 1.8 Factory doctrine (entirely dead substrate)

- Files: 10 `factory-*.md` (full list in section 2 below) + `audit-low-confidence-factory-commits-on-critical-path.md`, `no-doctrine-writes-during-factory-running-window.md`, `serialise-factory-dispatches-on-shared-codebase.md`, `stage-worktree-before-factory-dispatch.md`, `no-pm2-restart-during-active-factory-queue.md`.
- Recommended canonical: bulk archival. Move all 15 to `_archived/` with a single `2026-05-26-factory-cluster-archive.md` note pointing at backend/CLAUDE.md deprecation row. The Factory CLI / Factory-cloud routine / `start_cc_session` / `cc_sessions` model is gone.
- Nuance to preserve:
  - `factory-metadata-trust-filesystem.md` generalises perfectly ("trust filesystem over reported deliverable counts") - move that one sentence into the verify-state canonical from cluster 1.5.
  - `factory-reject-nukes-untracked-files.md` becomes a "before-destructive-cleanup, copy out untracked work" rule applicable to any dispatcher.
  - `stage-worktree-before-factory-dispatch.md` generalises to "stage worktree before any dispatch primitive."

### 1.9 GUI / macros / recipes

- Files (10 `gui-*`):
  - `gui-recipes-authoring-optimisation-and-verification.md` (meta-doctrine, ~6 sections)
  - `gui-step-verify-protocol.md`, `gui-fast-path-primitives.md`, `gui-macro-discovery-protocol.md`, `gui-macro-uses-logged-in-session-not-generated-api-key.md`, `gui-first-via-laptop-agent.md`, `gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18.md`, `gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17.md`, `gui-substrate-beast-mode-2026-05-17.md`, `gui-substrate-three-layer-architecture-2026-05-17.md`
- Recommended canonical: `gui-recipes-authoring-optimisation-and-verification.md` - it is already the meta-doctrine. The 5-6 supporting patterns are explicitly listed in backend/CLAUDE.md as a "GUI doctrine cluster" but each is mostly a one-section rule.
- Nuance to preserve:
  - `gui-macro-uses-logged-in-session-not-generated-api-key.md` is a credential-architecture rule (avoid generating an API key when a logged-in session already works) - keep distinct.
  - `gui-substrate-three-layer-architecture-2026-05-17.md` and `gui-substrate-beast-mode-2026-05-17.md` describe the underlying tool inventory and overlap heavily - merge candidate within the cluster.
  - `gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17.md` is the `gui.sequence` 40x-speedup pattern; performance argument, keep narrow.

### 1.10 Chat / output hygiene

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`
  - `D:/.code/EcodiaOS/backend/patterns/system-injection-blocks-must-not-render-in-director-chat.md`
  - `D:/.code/EcodiaOS/backend/patterns/frontend-strip-model-xml-tags.md`
  - `D:/.code/EcodiaOS/backend/patterns/no-retrospective-dumps-in-director-chat.md`
  - `D:/.code/EcodiaOS/backend/patterns/observer-interventions-are-ambient-not-chat.md`
  - `D:/.code/EcodiaOS/backend/patterns/fork-error-events-do-not-surface-to-conductor-chat.md`
- Recommended canonical: `observer-interventions-are-ambient-not-chat.md` - most current, has the substrate (observer_signals) attached.
- Nuance to preserve:
  - `system-injection-blocks-must-not-render-in-director-chat.md` is the frontend contract; the file `frontend-strip-model-xml-tags.md` is the implementation; both can fold but stress that there are two layers (frontend + backend split column).
  - `no-retrospective-dumps-in-director-chat.md` is about *my* output discipline; keep separate from substrate routing.
  - Cron-applied-tag suppression has its own narrow trigger (cron-fire responses); folds into observer-ambient canonical as a sub-case.

### 1.11 Credentials / rotation

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/cred-rotation-must-propagate-to-all-consumers.md`
  - `D:/.code/EcodiaOS/backend/patterns/cred-switcher-first-when-multi-account-breaks.md`
  - `D:/.code/EcodiaOS/backend/patterns/kv-store-creds-deny-needs-explicit-ops-allowlist-2026-05-19.md`
  - `D:/.code/EcodiaOS/backend/patterns/probe-all-env-files-not-just-dotenv.md`
  - `D:/.code/EcodiaOS/backend/patterns/supabase-access-via-org-pat-local-store-2026-05-20.md`
  - `D:/.code/EcodiaOS/backend/patterns/supabase-pat-reaches-every-owned-project-from-main.md`
- Recommended canonical: `cred-rotation-must-propagate-to-all-consumers.md` for *rotation*; `supabase-access-via-org-pat-local-store-2026-05-20.md` for *Supabase access pattern* (explicitly supersedes the older `supabase-pat-reaches-every-owned-project-from-main.md`).
- Nuance to preserve:
  - The kv-store deny-list rule is an MCP scope issue, not rotation.
  - `cred-switcher-first-when-multi-account-breaks.md` is a debugging-first-move, distinct from rotation propagation.
  - `probe-all-env-files-not-just-dotenv.md` is env-file discovery, not rotation.
  - The two Supabase-PAT files explicitly mark older as superseded - candidate for immediate `_archived/` of the predecessor.

### 1.12 Voice / em-dash / outbound shape (Tate voice)

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/em-dashes-banned-character-level-no-exceptions.md`
  - `D:/.code/EcodiaOS/backend/patterns/em-dashes-in-historical-tate-content-are-ai-slop-not-tate-2026-05-19.md`
  - `D:/.code/EcodiaOS/backend/patterns/tate-voice-profile-load-before-drafting-2026-05-19.md`
  - `D:/.code/EcodiaOS/backend/patterns/invoice-quality-checklist-doctrine.md` (touches voice register)
  - Adjacent: `D:/.code/EcodiaOS/backend/patterns/ecodia-internal-docs-render-in-html-not-markdown.md` (aesthetic, sibling)
- Recommended canonical: `em-dashes-banned-character-level-no-exceptions.md` (mechanical rule) + `tate-voice-profile-load-before-drafting-2026-05-19.md` (register rule). Two canonical rules, intentionally separate.
- Nuance to preserve:
  - The "historical-tate-content em-dashes are AI slop" rule is a forensic note (do not trust em-dashes as Tate's voice in archival data) and is independent of the prospective ban.
  - The aesthetic rule (HTML for internal docs) is a different artefact-shape rule and should stay its own file.

### 1.13 Borderline cluster: "no symbolic logging / action-over-plans / substrate-before-doer / route-around-block / discovery-to-doctrine-same-turn"

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/no-symbolic-logging-act-or-schedule.md`
  - `D:/.code/EcodiaOS/backend/patterns/substrate-before-doer.md`
  - `D:/.code/EcodiaOS/backend/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md`
  - `D:/.code/EcodiaOS/backend/patterns/discovery-to-doctrine-same-turn.md`
  - `D:/.code/EcodiaOS/backend/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`
  - `D:/.code/EcodiaOS/backend/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md`
- Borderline because each is *almost* the same anti-procrastination rule, but with slightly different time horizons and substrate targets. Overlap ~55%.
- Choice flagged: keep all 6 as separate. The shared theme ("act now, not in a row") is also a heading-level theme in backend/CLAUDE.md, and merging would lose load-bearing distinctions (substrate-driven vs same-turn-codify vs no-symbolic-row vs route-around-block).

### 1.14 Borderline cluster: "outcome-classification / outcome-inference / failure-classifier"

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/outcome-classification-must-distinguish-unverified-from-success.md`
  - `D:/.code/EcodiaOS/backend/patterns/outcome-inference-must-seek-evidence-of-failure.md`
  - `D:/.code/EcodiaOS/backend/patterns/outcome-classifier-regex-must-match-user-lexicon-not-generic-english.md`
  - `D:/.code/EcodiaOS/backend/patterns/failure-classifier-operational-vs-doctrine.md`
  - `D:/.code/EcodiaOS/backend/patterns/phase-d-must-classify-all-outcome-classes-not-just-failure.md`
- Borderline (~55% overlap). All five address classifier-design rules. The Phase-D + failure-classifier-operational pair is closest. Choice flagged: keep all 5 because they cover distinct classifier-output classes (success vs unverified vs failure vs doctrine-violation vs noise) - merging would erase the schema.

### 1.15 Doctrine substrate-meta (patterns-about-patterns)

- Files:
  - `D:/.code/EcodiaOS/backend/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`
  - `D:/.code/EcodiaOS/backend/patterns/pattern-lifecycle-active-narrowed-archived.md`
  - `D:/.code/EcodiaOS/backend/patterns/positive-synthesis-pattern-authoring.md`
  - `D:/.code/EcodiaOS/backend/patterns/new-patterns-require-how-to-apply-and-anti-patterns-sections.md`
  - `D:/.code/EcodiaOS/backend/patterns/triggers-must-be-narrow-not-broad.md`
  - `D:/.code/EcodiaOS/backend/patterns/context-surfacing-must-be-reliable-and-selective.md`
  - `D:/.code/EcodiaOS/backend/patterns/recurring-drift-extends-existing-enforcement-layer.md`
- Recommended canonical: keep all 7. This is the doctrine-about-doctrine layer and rules each address a different lifecycle stage (author -> structure -> trigger-shape -> lifecycle -> surface).
- Nuance to preserve: nothing to merge here; the consolidation pass should leave this cluster intact.

---

## 2. Dead-substrate pattern files

Total files referencing one or more dead keywords: roughly **122 of 365** (per cross-pattern grep). Many references are passing cross-mentions; the offenders that are *dominated* by dead substrate are the immediate archival targets.

### 2.1 `mcp__forks__spawn_fork` / `mcp__factory__start_cc_session`

- Total files: 28
- Worst offenders (by occurrence count of literal tool name):
  - `D:/.code/EcodiaOS/backend/patterns/surfacing-hooks-must-cover-every-fork-spawn-substrate.md` (3 occurrences, plus title is the substrate)
  - `D:/.code/EcodiaOS/backend/patterns/prefer-hooks-over-written-discipline.md` (2)
  - `D:/.code/EcodiaOS/backend/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` (2)
  - `D:/.code/EcodiaOS/backend/patterns/triggers-must-be-narrow-not-broad.md` (1; passing example)
  - `D:/.code/EcodiaOS/backend/patterns/sdk-forks-must-commit-deliverables-not-leave-untracked.md` (1; whole rule scope-restricted)
- Recommendation: **rewrite the dead-substrate paragraph(s)**, do not archive. The structural rules (hooks must cover dispatch primitives, brief is canonical on disk, deliverables must be committed) survive. Retarget at `cowork.dispatch_worker` / `ide-tab-is-the-new-fork-mechanic` / IDE-bridge dispatch.

### 2.2 `[FORK_REPORT]`

- Total files: 27. This is the SDK fork return-envelope marker.
- Worst offenders (per occurrence count):
  - `D:/.code/EcodiaOS/backend/patterns/fork-result-fallback-must-be-marked.md` (17 occurrences) - this entire file is the envelope spec; archive whole pattern.
  - `D:/.code/EcodiaOS/backend/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md` (20 occurrences) - structural rule but vehicle-specific; archive.
  - `D:/.code/EcodiaOS/backend/patterns/manager-forks-for-multi-worker-decomposition.md` (37 occurrences) - the SDK manager-fork primitive is dead; archive whole.
  - `D:/.code/EcodiaOS/backend/patterns/ide-tab-is-the-new-fork-mechanic-2026-05-17.md` (10) - this is the *replacement* doctrine and contains `[FORK_REPORT]` only to mark contrast; keep, no rewrite needed.
- Recommendation: **archive whole** for the first three. Keep the IDE-tab pattern.

### 2.3 `os_forks` (database table)

- Total files: 25. Used as the SDK fork state substrate.
- Worst offenders:
  - `D:/.code/EcodiaOS/backend/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md` (2; structural SDK bug)
  - `D:/.code/EcodiaOS/backend/patterns/outcome-inference-must-seek-evidence-of-failure.md` (2)
  - `D:/.code/EcodiaOS/backend/patterns/multi-account-credit-state-model.md` (2)
- Recommendation: **rewrite the substrate references**. The `os_forks` row no longer exists, but the structural rules (per-query SDK MCP server, outcome inference, multi-account credit model) survive. Replace `os_forks` references with `coord_inbox`, `os_session_messages`, or the new dispatch worker registry.

### 2.4 `start_cc_session` / `Factory dispatch` / `factory CLI`

- Total files: 34 (broadest). Worst offenders by content density:
  - `D:/.code/EcodiaOS/backend/patterns/vps-anatomy-current-state-2026-05-19.md` (3)
  - `D:/.code/EcodiaOS/backend/patterns/stage-worktree-before-factory-dispatch.md` (4)
  - `D:/.code/EcodiaOS/backend/patterns/serialise-factory-dispatches-on-shared-codebase.md` (5)
  - `D:/.code/EcodiaOS/backend/patterns/scheduled-redispatch-verify-not-shipped.md` (4)
  - `D:/.code/EcodiaOS/backend/patterns/factory-cc-sessions-tracking-drift-fe.md` (whole file)
  - All 10 `factory-*.md` files
- Recommendation: **archive whole** for the 10 `factory-*.md` files plus `serialise-factory-dispatches-on-shared-codebase.md`. The Factory CLI substrate is gone. The structural rules (stage worktree, scheduled-redispatch-verify) survive but need retargeting and rewriting; rewrite those 2.
- Note: `audit-low-confidence-factory-commits-on-critical-path.md` and `factory-quality-gate-over-cron-mandate.md` are dead in vehicle but the *quality bar* arguments transfer to dispatch workers; rewrite candidates.

### 2.5 `EcodiaOS frontend` / `apps/frontend` / `EOS mobile`

- Total files: 6. All have explicit DEPRECATED sections per backend/CLAUDE.md (frontend dir exists but Tate stopped using it; EOS mobile never existed on disk).
- Recommendation: **rewrite** to remove the frontend-as-UI-surface assumptions. The patterns are likely about the artefact-delivery substrate (download buttons, render-html, preview-reflex) and the substrate now lives in `reflex-preview.js` + IDE preview extension - per `auto-preview-md-html-on-write-2026-05-16.md` and `reflex-preview-not-auto-preview-2026-05-17.md` (both already present).

### 2.6 `schedulerPollerService` / `cronForkDispatcher`

- Total files: 21. Both refer to the VPS poller + the fork-dispatching cron router.
- Recommendation: **rewrite**. The 30s polling loop on the VPS is dead post-migration; checkpoint / Anthropic Routine substrate replaced it. The `crons-route-to-forks-by-default.md` doctrine itself needs a substrate rewrite (Routines vs in-process dispatcher) but the *routing-by-default* principle is intact.

### 2.7 `vault.secrets` (Supabase Vault)

- Total files: <6 (very narrow). Single-substrate guidance about Vault edge functions. Recommendation: **keep as-is, frontmatter `archived_at` if no longer used**, otherwise leave - vault.secrets is still valid Supabase substrate even if EcodiaOS does not currently use it.

### 2.8 `pg_notify` (VPS-driven listeners)

- Total files: 6.
- Recommendation: **rewrite the substrate paragraph**. Backend/CLAUDE.md explicitly states VPS pg_notify listeners are dead but the hook-based listeners are alive. The architectural argument (listener pipelines need 5-layer verification) survives; the vehicle does not.

### 2.9 `[redacted]` / `[redacted]` (archived client)

- Total files: 28 (case-insensitive). Worst offenders:
  - `D:/.code/EcodiaOS/backend/patterns/world-model-staleness-needs-active-reconciliation-2026-05-17.md` (1)
  - `D:/.code/EcodiaOS/backend/patterns/vps-anatomy-current-state-2026-05-19.md` (4)
  - `D:/.code/EcodiaOS/backend/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` (1)
  - `D:/.code/EcodiaOS/backend/patterns/verify-e2e-harness-loads-before-claiming-coverage.md` (3)
  - `D:/.code/EcodiaOS/backend/patterns/status-board-drift-prevention.md` (3)
  - `D:/.code/EcodiaOS/backend/patterns/triggers-must-be-narrow-not-broad.md` (1)
  - `D:/.code/EcodiaOS/backend/patterns/archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18.md` (7 occurrences but this is the *archival meta-doctrine itself*; keep)
  - `D:/.code/EcodiaOS/backend/patterns/authorised-branch-push-is-not-client-contact.md` (9 occurrences; the canonical [redacted]-arc case)
  - `D:/.code/EcodiaOS/backend/patterns/never-contact-eugene-directly.md` (7; [redacted] person)
  - `D:/.code/EcodiaOS/backend/patterns/_archived/[redacted]-prepush-pipeline.md` (already archived)
- Recommendation: **rewrite passing references to "archived client ([redacted])" pattern**, archive the two whole-pattern [redacted]-focused files (`never-contact-eugene-directly.md`, `authorised-branch-push-is-not-client-contact.md`) into `_archived/` with frontmatter pointing at `archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18.md` as the surviving meta-rule. The meta-rule itself (`archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18.md`) stays as the doctrine for handling any future client archival.

### 2.10 `osSessionService`

- Touched broadly; usually as a "historical" reference. Recommendation: **keep references with date-stamped historical framing**. The conductor moved to interactive Claude Code but osSessionService.js is still mentioned by `sdk-abortcontroller-cancellation.md`, `grace-timer-must-not-kill-chat-session.md`, etc. The behaviour described is still relevant if a cloud-Routine surface re-uses similar plumbing; flag but don't rewrite.

---

## 3. Hook matcher liveness matrix

### 3.1 Registered hooks (settings.json)

| Hook script | Event | Matcher | Live? | Notes |
|---|---|---|---|---|
| `scope-context.py` | UserPromptSubmit | (all) | live | session-scope priming |
| `observer_signals_pending.py` | UserPromptSubmit | (all) | live | observer ambient surface |
| `phase_g_gold_pending.py` | UserPromptSubmit | (all) | live | Phase-G gold queue |
| `pulse_blocks.py` | UserPromptSubmit | (all) | live | continuity pulse |
| `conductor_heartbeat.py` | UserPromptSubmit | (all) | live | heartbeat |
| `neo4j_decision_detect.py` | UserPromptSubmit | (all) | live | decision-shape detector |
| `chrome_cdp_reflex_surface.py` | UserPromptSubmit | (all) | live | CDP reflex |
| `thread_tail.py` | UserPromptSubmit | (all) | live | thread tail |
| `precompact_working_set_snapshot.py` | PreCompact | (all) | live | snapshot |
| `session_logger.py` | PostToolUse | (all) | live | universal logger |
| `observer_signal.py` | PostToolUse | (all) | live | observer postwrite |
| `observer_signal_auto_ack.py` | PostToolUse | (all) | live | ack on substrate write |
| `working_set_auto_touch.py` | PostToolUse | (all) | live | working_set touch |
| `auto_format.py` | PostToolUse | (all) | live | auto-format |
| `bash-bash-pair-surface.py` | PostToolUse | (all) | live | bash-bash pair detector |
| `tate-voice-postwrite-check.py` | PostToolUse | `Write\|Edit\|MultiEdit` | live | voice score on doc write |
| `post-action-applied-tag-check.sh` | PostToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead per backend/CLAUDE.md deprecation table |
| `status_board_hygiene.py` | PostToolUse | `Bash\|Edit\|Write\|MultiEdit\|mcp__ecodia-full__db_execute\|mcp__ecodia-full__shell_exec` | live | hygiene reflex |
| `conductor_turn_end.py` | Stop | (all) | live | turn end |
| `brief-consistency-check.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `cred-mention-surface.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `anthropic-first-check.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `episode-resurface.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `cowork-first-check.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `haiku-semantic-review.sh` | PreToolUse | `mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **DEAD MATCHER** | both tools dead |
| `fork-by-default-nudge.sh` | PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|mcp__supabase__db_execute` | live (matcher) but **semantically obsolete** | "fork by default" rule, fork primitive is dead |
| `chrome-cdp-launch-surface.sh` | PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|mcp__supabase__db_execute` | live | CDP-launch trap detector |
| `apple-dev-asc-flow-surface.sh` | PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|mcp__supabase__db_execute` | live | Apple Dev flow surface |
| `gui-macro-discovery-surface.sh` | PreToolUse | `Bash\|Edit\|Write\|MultiEdit\|mcp__forks__spawn_fork\|mcp__factory__start_cc_session` | **partially dead** (live on Bash/Edit/Write/MultiEdit, dead on fork+factory) | Bash arm keeps it useful |
| `doctrine-edit-cross-ref-surface.sh` | PreToolUse | `Write\|Edit\|MultiEdit` | live | doctrine cross-ref |
| `emdash-detector.sh` | PreToolUse | `Write\|Edit\|MultiEdit` | live | em-dash detector (load-bearing) |
| `memory-substrate-routing.py` | PreToolUse | `Write\|Edit\|MultiEdit` + neo4j_write_decision/episode | live | substrate routing |
| `tate-voice-surface.py` | PreToolUse | `Write\|Edit\|MultiEdit` | live | voice surface |
| `ecodia-doc-aesthetic-surface.py` | PreToolUse | `Write\|Edit\|MultiEdit` | live | HTML aesthetic surface |
| `status-board-write-surface.sh` | PreToolUse | `mcp__supabase__db_execute` | live | status_board write surface |
| `macro-runbook-write-surface.sh` | PreToolUse | `mcp__supabase__db_execute` | live | macro-runbook write surface |
| `router-skip-check.sh` | PreToolUse | `mcp__forks__spawn_fork\|Agent` | **partially dead** (Agent arm alive, fork arm dead) | one tool dead |
| `cdp_helper_nudge.py` | PreToolUse | `Bash` | live | CDP helper nudge |
| `laptop_agent_route_nudge.py` | PreToolUse | `Bash` | live | laptop-agent route nudge |
| `laptop-agent-helper-surface.py` | PreToolUse | `Bash` | live | laptop-agent helper surface |
| `git-author-surface.sh` | PreToolUse | `Bash` | live | git author surface |
| `vps-poll-helper-surface.py` | PreToolUse | `Bash` | live | VPS-poll helper |
| `handoff_save_on_risky.py` | PreToolUse | `Bash` | live | handoff save |
| `branch_guard.py` | PreToolUse | `Bash` | live | branch guard |
| `secret_guard.py` | PreToolUse | `Bash\|Write\|Edit\|MultiEdit` | live | secret guard |
| `plan_drift_mutator.py` | PreToolUse | `Read\|Grep\|Glob\|Bash\|Write\|Edit\|MultiEdit\|ToolSearch\|WebFetch\|WebSearch` | live | plan drift detector |
| `patch-claude-code-extension.py` | SessionStart | (n/a) | live | extension patch |

### 3.2 Dead-matcher migration map

| Hook | Semantic check | Live matcher carrying same check |
|---|---|---|
| `post-action-applied-tag-check.sh` | Layer-3 "did the action apply a referenced pattern" | Should follow whatever the new dispatch primitive is. Candidate: `mcp__cowork__dispatch_worker` (when fully shipped), OR Bash matcher detecting the Ctrl+Alt+Shift+C keybinding chord in keystroke streams (unrealistic). Practical answer: retire the hook entirely; `applied-tag` telemetry is dark anyway (cluster 5). |
| `brief-consistency-check.sh` | 5 checks on a fork/factory brief (full-properNoun, platform-without-invariant, vercel-no-deploy-verify, scaffold-no-project-naming, [CONTEXT-SURFACE WARN] keyword grep) | Move to `Write\|Edit\|MultiEdit` matcher on briefs written to `drafts/*-brief-*.md` or `coord_inbox` writes. Or to a `mcp__cowork__dispatch_worker` matcher when canonical. |
| `cred-mention-surface.sh` | Cred-keyword warns on brief mentions of iOS/ASC/Bitbucket/Supabase/Co-Exist Graph/MacInCloud/Corazon/Resend/Canva/Xero/RevenueCat | Move to `Write\|Edit\|MultiEdit` on any briefs / coord_inbox writes, OR keep the keyword check but trigger on `Bash` (most calls that touch a cred-relevant subsystem happen via shell). |
| `anthropic-first-check.sh` | "Are you about to build parallel infrastructure that Anthropic already provides" | Move to `Write\|Edit\|MultiEdit` on src files / pattern files. The dispatch-event is when *code* is being authored, not when a fork is being spawned. |
| `episode-resurface.sh` | Semantic resurface of Episode/Decision nodes relevant to the brief | Move to `UserPromptSubmit` so Episodes surface at *every* turn boundary, not only at fork spawn. (Adjacent hook scope_context.py already does similar work.) |
| `cowork-first-check.sh` | "Are you reaching for bespoke runtime when a SaaS-UI Cowork path already exists" | The semantics around "Cowork" are themselves deprecated (Cowork = `cowork.dispatch_worker` now); retire as written or rewrite check to fire on `Bash` whenever `cu.*`/`puppeteer` substrate is invoked without a `cdp.*` precondition. |
| `haiku-semantic-review.sh` | Cheap Haiku LLM-pass complement to keyword scanners | Move to `Write\|Edit\|MultiEdit` on briefs OR on doctrine writes. The complementary-to-keyword-hooks framing transfers. |
| `gui-macro-discovery-surface.sh` (fork arm) | Probe registry/handlers before authoring duplicate GUI macro | Bash arm already alive; drop the fork+factory arm. |
| `router-skip-check.sh` (fork arm) | "If you spawn a fork without calling `mcp__router__route_work` first" | Router tool itself NOT YET SHIPPED per backend/CLAUDE.md; this entire hook is firing on a phantom tool. Retire pending router ship. |
| `fork-by-default-nudge.sh` | "Use a fork instead of doing this on main" | The framing is dead. Retire or rewrite to "Dispatch a worker via `cowork.dispatch_worker` for parallel-stream work." |

### 3.3 Orphaned hook scripts (on disk but NOT registered in settings.json)

Cross-referenced the 44 scripts in `C:/Users/tjdTa/.claude/hooks/ecodia/` against settings.json:

- `apple-dev-asc-flow-surface.sh` - REGISTERED (PreToolUse Bash/Edit/Write/MultiEdit/NotebookEdit/db_execute).
- `auto_format.py` - REGISTERED.
- `bash-bash-pair-surface.py` - REGISTERED.
- `branch_guard.py` - REGISTERED.
- `brief-consistency-check.sh` - REGISTERED.
- `cdp_helper_nudge.py` - REGISTERED.
- `chrome-cdp-launch-surface.sh` - REGISTERED.
- `chrome_cdp_reflex_surface.py` - REGISTERED.
- `conductor_heartbeat.py` - REGISTERED.
- `conductor_turn_end.py` - REGISTERED.
- `cowork-first-check.sh` - REGISTERED.
- `cred-mention-surface.sh` - REGISTERED.
- `doctrine-edit-cross-ref-surface.sh` - REGISTERED.
- `ecodia-doc-aesthetic-surface.py` - REGISTERED.
- `emdash-detector.sh` - REGISTERED.
- `episode-resurface.sh` - REGISTERED.
- `fork-by-default-nudge.sh` - REGISTERED.
- `git-author-surface.sh` - REGISTERED.
- `gui-macro-discovery-surface.sh` - REGISTERED.
- `haiku-semantic-review.sh` - REGISTERED.
- `handoff_save_on_risky.py` - REGISTERED.
- `laptop-agent-helper-surface.py` - REGISTERED.
- `laptop_agent_route_nudge.py` - REGISTERED.
- `macro-runbook-write-surface.sh` - REGISTERED.
- `memory-substrate-routing.py` - REGISTERED.
- `neo4j_decision_detect.py` - REGISTERED.
- `observer_signal_auto_ack.py` - REGISTERED.
- `observer_signals_pending.py` - REGISTERED.
- `phase_g_gold_pending.py` - REGISTERED.
- `plan_drift_mutator.py` - REGISTERED.
- `post-action-applied-tag-check.sh` - REGISTERED.
- `precompact_working_set_snapshot.py` - REGISTERED.
- `pulse_blocks.py` - REGISTERED.
- `router-skip-check.sh` - REGISTERED.
- `secret_guard.py` - REGISTERED.
- `status-board-write-surface.sh` - REGISTERED.
- `status_board_hygiene.py` - REGISTERED.
- `tate-voice-postwrite-check.py` - REGISTERED.
- `tate-voice-surface.py` - REGISTERED.
- `thread_tail.py` - REGISTERED.
- `vps-poll-helper-surface.py` - REGISTERED.
- `working_set_auto_touch.py` - REGISTERED.
- `anthropic-first-check.sh` - REGISTERED.
- `status_board_hygiene_refresh.py` - **ORPHAN** (on disk, not registered as a hook; expected - it is a refresh cron / cache rebuild, see backend/CLAUDE.md "Cache refreshed by `status_board_hygiene_refresh.py` (org PAT, no daemon)").

So 1 orphan, by intent. The orphan is correct (refresh script, not a hook).

---

## 4. CLAUDE.md tier overlap matrix

| Rule | user-global (111 lines) | EcodiaOS workspace (72 lines) | backend (1222 lines) | Recommended owner |
|---|---|---|---|---|
| Em-dash ban | YES (load-bearing 0th-class) | NO | NO (only as cross-ref) | user-global - applies to every chat regardless of project |
| Decide-do-not-ask / autonomy doctrine | YES (Tier-1 mention + pattern ref) | YES (Operating Principles section) | NO | user-global |
| Status-board hygiene reflex | YES (full paragraph) | NO | YES (full paragraph, near-verbatim) | backend - because the implementation (hygiene hook, refresh script, SQL queries) is backend-specific |
| CDP-launch-helper-first | YES (full paragraph w/ command) | NO | YES (full paragraph w/ command, near-verbatim) | backend - because the implementation (`gui.enable_chrome_cdp`) is laptop-agent-specific |
| Parallelism via `cowork.dispatch_worker` | YES (full paragraph) | YES (Conductor Architecture section) | NO (only as DEPRECATIONS table entry) | user-global - applies regardless of project |
| Verify deployed state against narrated state | YES (single line cross-ref) | NO | YES (multiple sections + pattern grep) | backend - heavy implementation guidance |
| Codify at moment a rule is stated | YES (1 line) | NO | YES (multiple cross-refs) | user-global - meta-rule independent of project |
| Recursive-improvement-is-substrate-driven | YES (full paragraph) | NO | YES (multiple sections) | user-global - meta-rule |
| No client contact without Tate go-ahead | YES (1 line) | NO | NO (only via pattern cross-ref) | user-global - load-bearing identity rule |
| Ecodia-doc-aesthetic (HTML for internal docs) | YES (extensive paragraph) | NO | NO | user-global - applies across all internal-doc surfaces |
| Substrate map (Postgres / Neo4j / kv_store) | YES (full section "Substrate map") | NO | YES (much more detail, "Key Database Tables", MCP tools, etc.) | user-global for the **map** (which substrate is which); backend for the **schemas** (table columns, MCP scope details). Two-layer ownership: user-global names them, backend documents them. |
| Parallel CDP alias-namespacing | YES (full paragraph) | NO | NO (only as cross-ref) | backend - implementation-specific to laptop-agent tooling |
| Status_board hygiene (mechanical hook detail) | NO | NO | YES (only) | backend |

### 4.2 Dead-substrate share of backend/CLAUDE.md (1222 lines)

Sections that are explicitly marked DEPRECATED in the document itself:

- The DEPRECATIONS table at top (~30 lines).
- "Sub-agent dispatch protocol [SUPERSEDED 2026-05-17]" section (~10 lines).
- "Factory - Your Coding Workforce [DEPRECATED 2026-05-17]" section. This is the longest block - covers the whole Factory CLI / SDK fork operational doctrine, ~150 lines including subsections (Dispatching, Monitoring, Intervention, Review & Deploy, Codebases, Anti-Patterns, Factory vs DIY). All marked dead.
- "Routing decisions are silent (TOOL NOT YET SHIPPED - 13 May 2026)" - ~30 lines describing a phantom tool.
- "Fork dispatch is demand-driven, NOT slot-quota" - ~40 lines, dead substrate.
- "Fork hierarchy - Manager forks (5 May 2026)" - ~30 lines, dead.
- "Doctrine compliance is silent (Layer 3 - mcp__scratchpad NOT YET SHIPPED, 13 May 2026)" - ~30 lines, phantom tool.
- "Frontend UI - Interactive Outputs [DEPRECATED 2026-05-17]" - ~60 lines.
- Scattered: "Routine corpus architecture" sections still mention 16 cron jobs, many of which are unverified per the DEPRECATIONS table.
- "SDK musl-vs-glibc binary auto-detect trap" - the substrate is dead but the lesson transfers.

Estimate: **30-40% of backend/CLAUDE.md (around 400-500 of 1222 lines) is dead-substrate content** still bodying out as live operational instructions despite the DEPRECATIONS table at top. The deprecation table is a flag, not a deletion. Phase 1 high-leverage move: surgical cut of the Factory section + Sub-agent dispatch section + Frontend UI section + the two NOT-YET-SHIPPED layers, reducing the file by ~300-400 lines.

---

## 5. Triggers frontmatter coverage + telemetry

### 5.1 Sampling

Sample method: every 8th file in alphabetical order (sample of 45). Files examined:

`angelica-resonaverde-standing-arrangement.md`, `asc-stuck-rejected-version-resubmit-via-patch-rename-2026-05-19.md`, `ballistic-mode-under-guardrails-equals-depth-not-action.md`, `capacitor-ship-rebuild-web-with-env-and-guard-bundle-2026-05-21.md`, `cdp-per-call-target-resolution-2026-05-18.md`, `chrome-cdp-network-enable-times-out-under-tab-memory-pressure-2026-05-19.md`, `code-at-ecodia-au-is-only-google-workspace-and-claude-max.md`, `conductor-takes-agency-on-recovery-not-tate.md`, `continuous-work-conductor-never-idle.md`, `cowork-conductor-dispatch-protocol.md`, `cron-clean-noop-fork-reports-suppressed.md`, `cron-must-be-registered-not-just-documented-2026-05-18.md`, `decision-quality-self-optimization-architecture.md`, `dispatch-event-metadata-kind-is-routing-key-and-must-be-populated.md`, `ecodia-full-mcp-proxy-architecture-2026-05-15.md`, `email-outbound-composite-gate-architecture-2026-05-18.md`, `factory-cc-sessions-tracking-drift-fe.md`, `factory-worktree-branch-substrate-bug.md`, `fork-recovery-must-probe-deliverables-not-just-flip-status.md`, `googleservice-plist-must-be-in-pbxproj.md`, `gui-macro-discovery-protocol.md`, `harness-tool-rejection-is-not-tate-rejection.md`, `ios-headless-build-needs-keychain-unlock-via-macos-login-password-2026-05-19.md`, `large-audio-transcription-chunking-strategy.md`, `macro-capture-via-psr-exe.md`, `mcp-tool-param-schema-discipline.md`, `native-inbound-must-serialize-per-thread-2026-05-20.md`, `new-capacitor-app-web-to-testflight-from-scratch-2026-05-21.md`, `no-retrospective-dumps-in-director-chat.md`, `one-brain-stateful-coordination-2026-05-21.md`, `perception-bus-is-the-universal-substrate-for-domain-reactive-intelligence.md`, `pm2-restart-count-is-lifetime-not-rate.md`, `probe-all-env-files-not-just-dotenv.md`, `recurring-drift-extends-existing-enforcement-layer.md`, `route-around-block-means-fix-this-turn-not-log-for-later.md`, `sdk-musl-vs-glibc-binary-auto-detect-trap.md`, `silent-alerts-defer-when-tate-is-live.md`, `stash-and-clean-when-finding-sibling-fork-unsafe-state.md`, `streaming-substrate-complement-to-mcp-2026-05-15.md`, `sy094-coexist-ios-release-recipe.md`.

### 5.2 Frontmatter coverage

- Files in sample with `triggers:` line: **45/45 (100%)**. Across the whole 364-file corpus, the broader grep found 368 occurrences of `^triggers:` (so 100% coverage of substantive patterns, with INDEX.md and a small handful also matching - the over-count of 368 vs 364 substantive patterns suggests INDEX.md plus a few patterns may include the `triggers:` literal in body content; well within tolerance).
- **Coverage: effectively 100%.** This is much better than a typical doctrine corpus and is enforcement-supported (the `triggers-must-be-narrow-not-broad.md` pattern, plus the `episode-resurface.sh` keyword-grep mechanic depend on it).

### 5.3 Format consistency

Most files use the canonical `triggers: kebab-key-1, kebab-key-2, kebab-key-3` shape (kebab-case keywords, comma-separated, single line). Exceptions found:

- `ballistic-mode-under-guardrails-equals-depth-not-action.md`: uses **space-separated multi-word keywords without kebab** (`ballistic mode, standing directive, passive, all night`). Mixed with kebab on same line.
- `large-audio-transcription-chunking-strategy.md`: uses **commas without spaces** (`transcription,audio,whisper,deepgram,...`). Inconsistent vs default `, ` separator.
- `ecodia-full-mcp-proxy-architecture-2026-05-15.md`: has **empty triggers** (literal `triggers:` with nothing after). This is a meaningful finding - the keyword-scanning hooks (episode-resurface, doctrine-edit-cross-ref) skip empty-trigger files silently, so this file never surfaces.
- `sy094-coexist-ios-release-recipe.md`: triggers line is **very long with mixed kebab-case + free-form phrases** (`ios release, ship ios build, ship the ios build, ship coexist ios, release ios, app store connect upload, asc upload, ...`) - 40+ trigger keys, some kebab, some natural-language phrase.

### 5.4 Trigger-shape problems (5 examples)

**Too broad (would fire too often):**

- `D:/.code/EcodiaOS/backend/patterns/ballistic-mode-under-guardrails-equals-depth-not-action.md` - triggers include `passive`, `all night`, `parallel work` - all of which are common English. Likely to false-positive on many briefs.
- `D:/.code/EcodiaOS/backend/patterns/asc-stuck-rejected-version-resubmit-via-patch-rename-2026-05-19.md` includes the bare token `asc` which is a 3-letter substring appearing in unrelated contexts (`ascend`, `cascade`, `forecast`). Triggers narrower (`asc-cancel-submission`, `withdraw-from-review`) are better.
- `D:/.code/EcodiaOS/backend/patterns/sy094-coexist-ios-release-recipe.md` - the natural-language phrases (`ship the ios build`, `ship ios build`, `release ios`) overlap aggressively with any Co-Exist or other iOS ship session even when sy094-specific.

**Too narrow (would never fire):**

- `D:/.code/EcodiaOS/backend/patterns/factory-worktree-branch-substrate-bug.md` triggers: `factory-dispatch, factory-rejection, files_changed-empty, taskDiffAlignment-overlap-zero, ...` - all tied to dead Factory substrate. With factory dead, none of these will appear in any brief - the pattern is in the dark.
- `D:/.code/EcodiaOS/backend/patterns/ecodia-full-mcp-proxy-architecture-2026-05-15.md` has empty triggers - guaranteed never to fire.

### 5.5 Pattern-application telemetry

Telemetry log path: `C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry/application-events.jsonl`.

- Total rows: **1**.
- Lines containing `pattern_applied` or `pattern_not_applied`: **0**.
- Sample row (only row): a `tagged_silent: true` event from 2026-05-14 referencing `use-anthropic-existing-tools-before-building-parallel-infrastructure.md` matched by hook `post-action-applied-tag-check` against `mcp__forks__spawn_fork` (now-dead tool).

Most-applied patterns (occurrence count of pattern_path field across all 1 row): a single entry for `use-anthropic-existing-tools-before-building-parallel-infrastructure.md` (count=1, tagged_silent).

Sister log `dispatch-events.jsonl`: 5 rows; logs dispatch events from hooks but no `applied`/`not_applied` outcomes.

### 5.6 Telemetry finding

**The pattern-application telemetry layer is effectively unwired.** This is itself a high-leverage finding for Phase 1:

1. The `post-action-applied-tag-check.sh` hook is registered ONLY on `mcp__forks__spawn_fork|mcp__factory__start_cc_session` (both dead matchers per section 3.1). Since neither tool is invoked, the hook never runs. The single row in `application-events.jsonl` is from before the SDK fork death.
2. With the hook never running, the `pattern_applied` / `pattern_not_applied` substrate is dark, and the doctrine-lifecycle audit thresholds described in backend/CLAUDE.md ("`[NOT-APPLIED]` rate >70% over 7d -> narrow triggers; zero fires >30d -> archive candidate; `tagged_silent` rate >50% over 7d -> retire OR restate") have no data to evaluate.
3. The `pattern-corpus-health-check` weekly cron mentioned in backend/CLAUDE.md depends on this telemetry and is therefore producing vacuous or no output.
4. Consequence for this audit: I cannot give a "10 most-applied patterns" or "patterns with zero applications" reading. The whole pattern lifecycle (active/narrowed/archived classification) is currently operating on filename + git-mtime intuition only, not on usage data.

Recommendation for Phase 1: re-wire `post-action-applied-tag-check.sh` (or its replacement) to a live matcher. Once telemetry is collecting, run a 7-day baseline before any lifecycle classification decisions. Until then, the "should this pattern be archived" question is answered by reading the file rather than by data.

---

## End of audit

Counts summary: 365 patterns + 3 archived. 122 patterns reference at least one dead-substrate keyword. ~10 fork-cluster patterns and ~12 factory-cluster patterns are immediate whole-pattern archival candidates. 7 PreToolUse hooks fire on dead matchers (`mcp__forks__spawn_fork|mcp__factory__start_cc_session`). 1 hook script is filesystem-orphaned (and that orphan is intentional). 30-40% of backend/CLAUDE.md is dead-substrate content. Pattern telemetry is dark. 100% trigger-frontmatter coverage; one file has an empty triggers line (`ecodia-full-mcp-proxy-architecture-2026-05-15.md`).

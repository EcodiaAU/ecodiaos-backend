---
triggers: phase-d, phase-d-classifier, outcome-classification, failure-classifier, single-class-collapse, classification-dark, success-classification, unverified-classification, classification-entropy, usage-failure, surfacing-failure, doctrine-failure
status: active
---

# Phase D Classifier Must Cover All Outcome Classes — Not Just Failure

## Rule

Phase D (the failure classifier / Layer 5 in the decision-quality architecture) MUST run on `success`, `unverified`, AND `failure` outcome rows. Running exclusively on `failure` leaves 90%+ of outcome_event rows permanently unclassified (`classification=NULL`) and makes the architecture's three-class taxonomy (`usage_failure | surfacing_failure | doctrine_failure`) functionally a dead letter on the dominant outcome classes.

## Do

- Classify `success` rows: join to the application_event chain; if `tagged_silent=true` patterns exist in the surface chain, classify as `usage_success_with_silent_doctrine` (doctrine was present but not applied — this is the feedback signal the architecture was built to detect)
- Classify `unverified` rows older than 24h with no subsequent signal: classify as `classification_deficit` (no ground truth either way)
- Classify `failure` rows with full three-class taxonomy: `usage_failure` (doctrine surfaced but ignored) / `surfacing_failure` (doctrine existed but did not surface) / `doctrine_failure` (corpus has a gap)
- Emit a single-class-collapse alert to status_board (P2) when classifier output entropy over the rolling 50-row window drops below 0.5 — this is the instrumented form of the drift detector

## Do NOT

- Gate Phase D exclusively on `WHERE outcome = 'failure'` — this structurally darkens 93% of outcome_event rows
- Treat "we only classify failures" as a sensible default — the architecture's value proposition (detect whether the conductor applies surfaced doctrine) depends on classifying success rows most of all
- Count `classification IS NOT NULL` as a health signal without verifying the class distribution — a classifier that runs on all rows but only ever emits `surfacing_failure` is degenerate even with 100% coverage

## Diagnosis

If `SELECT classification, COUNT(*) FROM outcome_event WHERE classification IS NOT NULL GROUP BY classification` returns only a single class, the classifier is degenerate regardless of row count. Three classes must be reachable by the decision tree.

If `SELECT count(*) FILTER (WHERE classification IS NOT NULL) / count(*)::float FROM outcome_event WHERE ts > NOW() - INTERVAL '7 days'` returns < 0.10, Phase D is not running on success/unverified rows.

## Protocol (adding success/unverified classification)

1. Open `~/ecodiaos/src/services/telemetry/failureClassifier.js`
2. Add a gate check for `outcome IN ('success', 'unverified')` alongside the existing `outcome='failure'` gate
3. For success rows: LEFT JOIN `application_event` where `dispatch_event_id` matches; if any row has `applied=false AND tagged_silent=true`, emit `classification='usage_success_with_silent_doctrine'`; if surface chain is clean, emit `classification='verified_clean'`
4. For unverified rows > 24h: emit `classification='classification_deficit'`
5. Add a synthetic-input regression test: feed three rows shaped to deserve each of the three classes, assert all three are emitted. Wire to CI.
6. Verify by running: `SELECT outcome, classification, COUNT(*) FROM outcome_event GROUP BY 1, 2` — must see at least 3 distinct non-null classification values within one cron cycle.

## Origin

Found in Phase G adversarial self-audit on 2026-05-05 (critique-02, `phase-G-audit-2026-05-05`), recurred on 2026-05-07 (critique-02, `phase-G-audit-2026-05-07`), and again on 2026-05-08 (critique-02) and 2026-05-11 (critique-05, `phase-G-audit-2026-05-11/critique-05-phase-d-classifies-only-failure-93pct-dark`). Four consecutive audit cycles with the same finding, each noting increasing urgency. The 2026-05-11 audit measured: `success=845 (70.5%), unverified=271 (22.6%), failure=83 (6.9%)` across 1,199 outcome rows; only the 83 failure rows had any classification, and all 83 were `operational_failure` — the three-class taxonomy was never exercised. Graduated from Critique nodes to pattern file 2026-05-12 via fork_mp1drm4m_dbb590 Phase G triage pass.

## Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 5 (Phase D specification)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (five-layer probe for classifier wiring)
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` (verify classifier via DB query, not by reading logs)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (logging unclassified rows is symbolic unless Phase D is wired to all three classes)

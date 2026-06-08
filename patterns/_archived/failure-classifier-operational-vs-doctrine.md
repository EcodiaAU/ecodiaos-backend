---
triggers: failure-classifier, phase-d-classifier, surfacing-failure, operational-failure, single-class-collapse, classifier-distribution, doctrine-vs-infra-failure, fork-crash-classification
---

# Phase D failure classifier: operational failures are not doctrine failures

The Phase D classifier (`src/services/telemetry/failureClassifier.js`, Layer 5 of the Decision Quality Self-Optimization architecture) routes `outcome='correction'` and `outcome='failure'` rows from `outcome_event` into one of:

- `usage_failure` - relevant pattern was applied but outcome still wrong (refine pattern)
- `surfacing_failure` - relevant pattern existed but didn't surface (tighten triggers)
- `doctrine_failure` - no relevant pattern in corpus (author new pattern)
- `operational_failure` - infrastructure substrate failure (fix infra, not doctrine) - added 8 May 2026

The fourth class exists because `outcome='failure'` rows from `outcomeInference.js` are written with evidence like `os_forks.fork_id=<id> status=error` or `cc_sessions.session_id=<id> status=rejected`. These are operational substrate failures: the SDK musl/glibc binary trap, transport disconnects, fork-pool credit exhaustion, OS-session restart races, Factory rejects. Their remediation is operational work (patch the SDK, fix the daemon, tune retry policy), not pattern authoring.

## Do

- For `outcome='failure'` with evidence matching `(os_forks|cc_sessions)\b.{0,200}?status=(error|aborted|crashed|rejected|cancelled|failed)` and no correction_text, classify as `operational_failure`. Short-circuit BEFORE semantic search. The semantic search adds zero signal for operational failures and produces high-similarity matches against generic fork-meta-doctrine that aren't actually relevant.
- When the classifier accumulates a cluster of `operational_failure` rows pointing at the same substrate (e.g. >5 fork crashes / 24h on the same fork-spawn surface), surface a P2 status_board row. The remediation is "fix the substrate", not "author a pattern".
- When inspecting Phase D distribution health (e.g. weekly Layer 7 review), TREAT `operational_failure` as a separate distribution from the doctrine triad (`usage / surfacing / doctrine`). A 100% operational_failure week is fine if all the failures genuinely were infra. A 100% surfacing_failure week is suspicious because it implies all corrections came from one mode.

## Do not

- Do not classify operational fork crashes as `surfacing_failure`. The "patterns relevant but didn't surface" logic produces false positives because the buildQueryText function on a no-correction-text row falls back to `"action: fork_spawn | tool: mcp__forks__spawn_fork"`, which semantically retrieves fork-meta-doctrine at high similarity regardless of the actual failure mode. Then "those patterns weren't surfaced" is trivially true (because those patterns don't surface for fork dispatches anyway), so 100% of fork-crash rows route to `surfacing_failure`. This was the 8 May 2026 single-class collapse.
- Do not author new patterns to "cover" operational_failure clusters. If the SDK is broken, ship an SDK fix. If transport disconnects, fix the daemon. The pattern corpus is for judgment errors, not for infrastructure errors.
- Do not let a cluster of operational_failures gaslight the doctrine-tuning thresholds in `~/ecodiaos/CLAUDE.md` (>70% NOT-APPLIED rate, >50% silent-rate). Those thresholds are for doctrine-class signals only. The Phase D distribution telemetry should report doctrine-class and operational-class separately.

## Verification

After ship: query `SELECT classification, COUNT(*) FROM outcome_event WHERE classification_at > NOW() - INTERVAL '7 days' GROUP BY classification` and confirm the distribution is no longer 100% single-class. Operational fork-crash rows should land in `operational_failure`. Doctrine-relevant corrections (Tate-typed rebukes with correction_text) should land in `usage / surfacing / doctrine` per their actual signal.

## Origin

8 May 2026, fork_mowxgocp_d29fa6, brief from Phase G adversarial audit critique #2 (single-class collapse). 26 rows over 7d all classified `surfacing_failure` despite being fork crashes from a recurring SDK binary trap (commit 2980601 was the eventual operational fix). Diagnostic 5-layer probe found the classifier producer (`outcomeInference.js`) writing the failures correctly, the trigger (cron-driven `tickClassifier`) firing correctly, the bridge (direct call) intact, the classifier logic flawed at `buildQueryText` + decision-tree case 3 (surfacing_failure when no surfaced patterns match top-k hits, which is trivially true for fork dispatches because no fork-meta-doctrine surfaces for individual fork spawns).

Fix landed same-day in the same fork: operational_failure short-circuit at top of `classifyOutcome`, evidence-as-primary-query-text in `buildQueryText`, 8 unit tests, 26-row historical backfill.

## Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` (Layer 5 owner)
- `~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md` (the recurring SDK bug producing most of these operational failures)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (the 5-layer probe protocol used to diagnose this)
- `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` (sister pattern: outcome layer must distinguish `unverified` from `success`; this pattern says classification layer must distinguish `operational_failure` from `surfacing_failure`)

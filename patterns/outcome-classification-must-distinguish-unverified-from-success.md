triggers: outcome-inference, outcome-classification, layer-4-telemetry, success-by-default, survivorship-bias, unverified-state, jarvis-gap-§8, accountability-layer, decision-quality-metric, vacuous-metric, verification-rate, dispatch-event, outcome-event, dark-matter, phase-g-critique-1

# Outcome classification must distinguish `unverified` from `success` - silence is not a positive signal

## The rule

When inferring the outcome of a dispatched action (tool call, fork spawn, factory dispatch, cron fire), the inferrer MUST distinguish four states:

- `success` - explicit POSITIVE evidence (Tate affirmation SMS, deployed artefact with commit_sha + deploy_status=deployed, fork done with non-empty result)
- `correction` - explicit Tate rebuke SMS within the verification window
- `failure` - explicit terminal-error state from the underlying system (cc_sessions.status=error, os_forks.status=error)
- `unverified` - no positive AND no negative signal within the verification window. This is a FIRST-CLASS state, not a default-success.

Absence of correction is NOT evidence of success. Treating it as such produces a metric pipeline where every Layer-4 KPI is structurally vacuous - the self-tuning loop calibrates against a null oracle, drift detection cannot fire, and the architecture loses its empirical grounding. This is the survivorship bias the Phase G adversarial audit caught.

The metric pipeline now computes both:

- `success_rate = success / (success + correction + failure + unverified)`
- `verification_rate = (success + correction + failure) / total`

`verification_rate` surfaces the dark-matter problem: how much of the dispatch fleet has zero explicit ground-truth signal. A verification_rate < 0.30 means the architecture is operating blind no matter how good the success_rate looks.

## Do

- Default to `unverified` when no positive AND no negative signal exists after the verification window expires (currently 30 min)
- Require ARTEFACTS for success: factory deploys must have commit_sha + deploy_status=deployed; fork-spawns must have status=done AND a non-empty result. Status alone is insufficient
- Treat the failure path as first-class: classify failure rows the same way you classify correction rows (route to usage_failure / surfacing_failure / doctrine_failure)
- Compute and surface `verification_rate` separately from `success_rate` - they answer different questions
- Cite the negative-signal precedence rule: failure beats correction beats affirmation when multiple signals coexist for the same dispatch
- Cap correction-vs-affirmation tie-breaks: when one SMS body contains both keywords, correction wins (the rebuke is the actionable signal)

## Do NOT

- Do NOT default to `success` when no signal arrives. That is the survivorship bias this rule exists to prevent
- Do NOT collapse `unverified` into `success` for KPI dashboards - if you do, the dark matter is invisible
- Do NOT classify `unverified` rows in the failure classifier (Phase D). Unverified is dark matter, not a doctrine failure - it surfaces as a verification-rate problem instead
- Do NOT treat `status=deployed` alone as success on cc_sessions. The deployment artefacts must exist (commit_sha, deploy_status=deployed). A status flip without artefacts is the JARVIS §8 "claimed-done-but-unverified" anti-pattern
- Do NOT add too-short ambiguous tokens to the affirmation list (`ok`, `k`, `sure`, `mm`). They false-positive against unrelated message bodies. The list should bias toward unambiguous register tokens (`thanks`, `great`, `good`, `go`, `ship`)

## Verification protocol

After any change to the inferrer or classifier:

1. Run `node src/services/telemetry/outcomeInference.js --once` and confirm at least one `unverified` row is produced for old dispatch_events lacking outcome_event
2. Probe `SELECT outcome, COUNT(*) FROM outcome_event WHERE ts > NOW() - INTERVAL '7 days' GROUP BY outcome` and confirm the distribution is no longer 100% success
3. Probe `SELECT classification, COUNT(*) FROM outcome_event WHERE ts > NOW() - INTERVAL '7 days' AND outcome IN ('correction', 'failure') GROUP BY classification` and confirm failures are getting classified by Phase D
4. The 4-state model is invariant: any future change to the schema or inferrer that collapses unverified back into success is a regression of this pattern

## Origin

Phase G adversarial self-audit, fork_molfmh33_749776, 30 Apr 2026 22:08 AEST. Identified as Critique #1, severity=5 (doctrine_failure). Empirical evidence: 398/398 outcome_event rows over rolling 7d classified as success, classification field NULL on every row. Every Layer-4 KPI computed against this dataset was structurally vacuous; every drift-detection rule keyed on correction_rate was reading from a metric that could not move.

Fix shipped via PR `feat/phase-g-critique-1-outcome-unverified-state` by fork_molg9isk_302330. Files changed: `src/services/telemetry/outcomeInference.js` (4-state inferrer), `src/services/telemetry/failureClassifier.js` (process correction AND failure rows), `src/services/telemetry/__tests__/outcomeInference.test.js` (14 tests covering all 4 states + priority rules + JARVIS §8 artefact-required success path).

Cross-references:

- `~/ecodiaos/docs/JARVIS_GAP_ANALYSIS.md` §8 (Accountability layer: unverified as a first-class state) - the architectural rule this pattern instantiates
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 (the system this fix protects)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (the meta-rule: narration is unreliable evidence)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (claiming success without artefact is symbolic; require the artefact)
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (the architectural framing of why narration drifts; this fix closes one specific seam in the dispatch -> outcome layer)
